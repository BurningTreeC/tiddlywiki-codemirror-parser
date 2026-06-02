/**
 * Attribute value completion source
 */

import { syntaxTree } from "@codemirror/language"
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import {
  defaultFieldNames,
  buildMultiSelectionChanges,
  extractLocalDefinitions,
  getTiddlerBoost,
  getTiddlerSortText,
  triggerCompletionEffect,
} from "./common"
import { commonMacros } from "./macro"

// TiddlyWiki Storyviews (built-in)
export const defaultStoryViews = [
  "classic", "pop", "zoomin"
]

// TiddlyWiki Deserializers (built-in)
export const defaultDeserializers = [
  "application/javascript",
  "application/json",
  "application/x-tiddler",
  "application/x-tiddler-html-div",
  "application/x-tiddlers",
  "text/css",
  "text/html",
  "text/plain",
  "text/vnd.tiddlywiki"
]

// TiddlyWiki Widget Messages (tm- messages)
export const tiddlyWikiMessages = [
  "tm-add-field", "tm-add-tag", "tm-auto-save-wiki", "tm-browser-refresh",
  "tm-cancel-tiddler", "tm-clear-password", "tm-close-all-tiddlers", "tm-close-all-windows",
  "tm-close-other-tiddlers", "tm-close-tiddler", "tm-close-window", "tm-copy-to-clipboard",
  "tm-delete-tiddler", "tm-download-file", "tm-edit-bitmap-operation", "tm-edit-text-operation",
  "tm-edit-tiddler", "tm-focus-selector", "tm-fold-all-tiddlers", "tm-fold-other-tiddlers",
  "tm-fold-tiddler", "tm-full-screen", "tm-home", "tm-http-cancel-all-requests",
  "tm-http-request", "tm-import-tiddlers", "tm-load-plugin-from-library", "tm-load-plugin-library",
  "tm-login", "tm-logout", "tm-modal", "tm-navigate", "tm-new-tiddler", "tm-notify",
  "tm-open-external-window", "tm-open-window", "tm-perform-import", "tm-permalink",
  "tm-permaview", "tm-print", "tm-relink-tiddler", "tm-remove-field", "tm-remove-tag",
  "tm-rename-tiddler", "tm-save-tiddler", "tm-save-wiki", "tm-scroll", "tm-server-refresh",
  "tm-set-password", "tm-unfold-all-tiddlers", "tm-unload-plugin-library"
]

// ============================================================================
// Module-level caches to avoid repeated array creation
// ============================================================================

// Core widgets list (cached to avoid recreation on every completion call)
const CORE_WIDGETS_LIST = [
  "$action-confirm", "$action-createtiddler", "$action-deletefield", "$action-deletetiddler",
  "$action-listops", "$action-log", "$action-navigate", "$action-popup", "$action-sendmessage",
  "$action-setfield", "$action-setmultiplefields", "$browse", "$button", "$checkbox",
  "$codeblock", "$count", "$draggable", "$droppable", "$dropzone", "$edit", "$edit-bitmap",
  "$edit-text", "$element", "$encrypt", "$eventcatcher", "$fieldmangler", "$fill",
  "$genesis", "$image", "$importvariables", "$keyboard", "$let", "$link", "$linkcatcher",
  "$list", "$log", "$macrocall", "$messagecatcher", "$navigator", "$password", "$qualify",
  "$radio", "$range", "$raw", "$reveal", "$scrollable", "$select", "$set", "$setvariable",
  "$slot", "$text", "$tiddler", "$transclude", "$type", "$vars", "$view", "$wikify"
]

// Common HTML tags list (cached)
const COMMON_HTML_TAGS_LIST = [
  "div", "span", "p", "a", "img", "br", "hr", "table", "tr", "td", "th",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code",
  "blockquote", "form", "input", "button", "select", "option", "textarea",
  "label", "fieldset", "legend", "section", "article", "header", "footer",
  "nav", "aside", "main", "figure", "figcaption", "video", "audio", "source",
  "canvas", "svg", "iframe", "embed", "object", "strong", "em", "b", "i",
  "u", "s", "sub", "sup", "small", "mark", "del", "ins", "abbr", "cite",
  "details", "summary"
]

// Pre-computed Set for fast lookup
const CORE_WIDGETS_SET = new Set(CORE_WIDGETS_LIST)

// Lazy-initialized Set for common macros (avoid import-time evaluation issues)
let _commonMacrosSet: Set<string> | null = null
function getCommonMacrosSet(): Set<string> {
  if (!_commonMacrosSet) {
    _commonMacrosSet = new Set(commonMacros)
  }
  return _commonMacrosSet
}

/**
 * Find the start position of the current open widget/HTML tag
 * Scans through text while skipping protected contexts
 */
function findCurrentTagStart(text: string): number {
  const len = text.length
  let pos = 0
  let lastTagStart = -1

  while (pos < len) {
    const ch = text[pos]

    // Skip triple-quoted strings
    if (ch === '"' && text[pos + 1] === '"' && text[pos + 2] === '"') {
      pos += 3
      while (pos < len && !(text[pos] === '"' && text[pos + 1] === '"' && text[pos + 2] === '"')) {
        pos++
      }
      pos += 3
      continue
    }

    // Skip quoted strings (but only when inside a tag)
    if ((ch === '"' || ch === "'") && lastTagStart !== -1) {
      const quote = ch
      pos++
      while (pos < len && text[pos] !== quote) {
        if (text[pos] === '\\') pos++
        pos++
      }
      pos++
      continue
    }

    // Skip macro <<...>>
    if (ch === '<' && text[pos + 1] === '<') {
      pos += 2
      let depth = 1
      while (pos < len && depth > 0) {
        if (text[pos] === '<' && text[pos + 1] === '<') {
          depth++
          pos += 2
        } else if (text[pos] === '>' && text[pos + 1] === '>') {
          depth--
          pos += 2
        } else {
          pos++
        }
      }
      continue
    }

    // Skip filtered transclusion {{{...}}}
    if (ch === '{' && text[pos + 1] === '{' && text[pos + 2] === '{') {
      pos += 3
      while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}' && text[pos + 2] === '}')) {
        pos++
      }
      pos += 3
      continue
    }

    // Skip transclusion {{...}}
    if (ch === '{' && text[pos + 1] === '{') {
      pos += 2
      while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}')) {
        pos++
      }
      pos += 2
      continue
    }

    // Skip substituted strings `...` or ```...```
    if (ch === '`') {
      if (text.slice(pos, pos + 3) === '```') {
        pos += 3
        while (pos < len && text.slice(pos, pos + 3) !== '```') pos++
        pos += 3
      } else {
        pos++
        while (pos < len && text[pos] !== '`') pos++
        pos++
      }
      continue
    }

    // Check for tag start: <tagname or <$widget
    if (ch === '<' && text[pos + 1] && /[a-zA-Z$]/.test(text[pos + 1])) {
      const tagStart = pos
      pos++ // skip <

      // Read tag name
      while (pos < len && /[a-zA-Z0-9\-_$.]/.test(text[pos])) {
        pos++
      }

      const afterName = text[pos]

      if (afterName === '>') {
        // Complete tag <tag> - clear tracking
        lastTagStart = -1
        pos++
        continue
      }

      if (afterName === '/' && text[pos + 1] === '>') {
        // Self-closing <tag/> - clear tracking
        lastTagStart = -1
        pos += 2
        continue
      }

      if (afterName && (/\s/.test(afterName) || afterName === '=')) {
        // Tag with attributes - track it as potentially open
        lastTagStart = tagStart
        continue
      }

      continue
    }

    // Check for closing > when we're tracking an open tag
    if (ch === '>' && lastTagStart !== -1) {
      lastTagStart = -1
      pos++
      continue
    }

    // Check for /> when we're tracking an open tag
    if (ch === '/' && text[pos + 1] === '>' && lastTagStart !== -1) {
      lastTagStart = -1
      pos += 2
      continue
    }

    pos++
  }

  return lastTagStart
}

/**
 * Attribute value completion source
 */
export function attributeValueCompletion(
  getMacroNames?: () => string[],
  getTiddlerTitles?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[],
  getFieldNames?: () => string[],
  getTiddlerIndexes?: (tiddlerTitle: string) => string[],
  getStoryViews?: () => string[],
  getDeserializers?: () => string[],
  getCSSValues?: () => string[] | null,
  isDraftTiddler?: (title: string) => boolean,
  getClassNames?: () => string[],
  getCSSValuesForProperty?: (propertyName: string) => string[]
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)
    // Match attribute names including style.property-name pattern
    const attrValueMatch = /([$a-zA-Z][\w\-\.]*)\s*=\s*(["'])([^"']*)$/.exec(textBefore)
    if (!attrValueMatch) return null

    const attrName = attrValueMatch[1]
    const quoteChar = attrValueMatch[2]
    const partial = attrValueMatch[3]
    const from = pos - partial.length
    const patternLen = partial.length

    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    let inWidgetContext = false

    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      if (node.name === "Widget" || node.name === "InlineWidget" ||
          node.name === "HTMLTag" || node.name === "HTMLBlock" ||
          node.name === "IncompleteWidget" || node.name === "IncompleteHTMLTag" ||
          node.name === "IncompleteHTMLBlock") {
        inWidgetContext = true
      }
      node = node.parent!
    }

    if (!inWidgetContext) {
      return null
    }

    let options: Completion[] = []

    // style.property-name attribute (e.g., style.background-color="value")
    if (attrName.startsWith("style.")) {
      const propertyName = attrName.slice(6)  // Remove "style." prefix
      // Use property-specific values if available, fall back to all values
      const cssValues = getCSSValuesForProperty
        ? getCSSValuesForProperty(propertyName)
        : (getCSSValues ? getCSSValues() : null)
      if (cssValues && cssValues.length > 0) {
        const lowerPartial = partial.toLowerCase()
        const filtered = cssValues.filter(value =>
          value.toLowerCase().startsWith(lowerPartial)
        )

        options = filtered.map(value => ({
          label: value,
          type: "keyword",
          detail: "CSS value",
          boost: 2,
          apply: (view, _completion, from, to) => {
            const textAfter = view.state.sliceDoc(to, to + 1)
            const suffix = textAfter === quoteChar ? "" : quoteChar
            const insert = value + suffix
            const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
            view.dispatch({
              changes,
              selection: { anchor: from + insert.length }
            })
          }
        }))
      }
    }
    // $variable attribute
    else if (attrName === "$variable") {
      const seen = new Set<string>()
      const allNames: { name: string, detail: string, type: 'function' | 'variable' | 'keyword' }[] = []

      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)

      for (const name of localDefs.macros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro (local)", type: "function" })
        }
      }

      for (const name of localDefs.procedures) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "procedure (local)", type: "function" })
        }
      }

      for (const name of localDefs.functions) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "function (local)", type: "function" })
        }
      }

      for (const name of localDefs.widgetVars) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable (local)", type: "variable" })
        }
      }

      for (const name of localDefs.builtIns) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable (built-in)", type: "keyword" })
        }
      }

      const customMacros = getMacroNames ? getMacroNames() : []
      const macros = customMacros.length > 0 ? customMacros : commonMacros
      for (const name of macros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro", type: "function" })
        }
      }

      const functions = getFunctionNames ? getFunctionNames() : []
      for (const name of functions) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "function", type: "function" })
        }
      }

      const variables = getVariableNames ? getVariableNames() : []
      for (const name of variables) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable", type: "variable" })
        }
      }

      const lowerPartial = partial.toLowerCase()
      const filtered = allNames.filter(({ name }) =>
        name.toLowerCase().startsWith(lowerPartial)
      )

      options = filtered.map(({ name, detail, type }) => ({
        label: name,
        type,
        detail,
        boost: 2,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const suffix = textAfter === quoteChar ? "" : quoteChar
          const insert = name + suffix
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + insert.length }
          })
        }
      }))
    }
    // tiddler or $tiddler attribute
    else if (attrName === "tiddler" || attrName === "$tiddler") {
      const titles = getTiddlerTitles ? getTiddlerTitles() : []
      if (titles.length === 0) return null
      options = titles.map(title => ({
        label: title,
        type: "variable",
        detail: "tiddler",
        boost: getTiddlerBoost(title, isDraftTiddler),
        sortText: getTiddlerSortText(title, isDraftTiddler),
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const suffix = textAfter === quoteChar ? "" : quoteChar
          const insert = title + suffix
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + insert.length }
          })
        }
      }))
    }
    // to attribute
    else if (attrName === "to" || attrName === "$to") {
      const titles = getTiddlerTitles ? getTiddlerTitles() : []
      if (titles.length === 0) return null
      options = titles.map(title => ({
        label: title,
        type: "variable",
        detail: "tiddler",
        boost: getTiddlerBoost(title, isDraftTiddler),
        sortText: getTiddlerSortText(title, isDraftTiddler),
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const suffix = textAfter === quoteChar ? "" : quoteChar
          const insert = title + suffix
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + insert.length }
          })
        }
      }))
    }
    // $message or message attribute - only for widgets that support it
    else if (attrName === "$message" || attrName === "message") {
      // Check if we're in a widget that supports this attribute
      // $message: $action-confirm, $action-sendmessage
      // message: $button, $browse, $linkcatcher
      const tagStart = findCurrentTagStart(textBefore)
      const widgetsWithDollarMessage = ["action-confirm", "action-sendmessage"]
      const widgetsWithMessage = ["button", "browse", "linkcatcher"]

      let showMessageCompletions = false
      if (tagStart >= 0) {
        // Extract widget name from the tag start
        const widgetMatch = /^<\$([a-zA-Z][a-zA-Z0-9\-\.]*)/.exec(textBefore.slice(tagStart))
        if (widgetMatch) {
          const widgetName = widgetMatch[1]
          if (attrName === "$message" && widgetsWithDollarMessage.includes(widgetName)) {
            showMessageCompletions = true
          } else if (attrName === "message" && widgetsWithMessage.includes(widgetName)) {
            showMessageCompletions = true
          }
        }
      }

      if (showMessageCompletions) {
        const lowerPartial = partial.toLowerCase()
        const filtered = tiddlyWikiMessages.filter(msg =>
          msg.toLowerCase().startsWith(lowerPartial)
        )
        options = filtered.map(msg => ({
          label: msg,
          type: "keyword",
          detail: "message",
          boost: 2,
          apply: (view, _completion, from, to) => {
            const textAfter = view.state.sliceDoc(to, to + 1)
            const suffix = textAfter === quoteChar ? "" : quoteChar
            const insert = msg + suffix
            const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
            view.dispatch({
              changes,
              selection: { anchor: from + insert.length }
            })
          }
        }))
      }
    }
    // $field or field attribute
    else if (attrName === "$field" || attrName === "field") {
      const fields = getFieldNames ? getFieldNames() : defaultFieldNames
      const lowerPartial = partial.toLowerCase()
      const filtered = fields.filter(f => f.toLowerCase().startsWith(lowerPartial))
      options = filtered.map(fieldName => ({
        label: fieldName,
        type: "property",
        detail: "field",
        boost: 2,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const suffix = textAfter === quoteChar ? "" : quoteChar
          const insert = fieldName + suffix
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + insert.length }
          })
        }
      }))
    }
    // $index or index attribute
    else if (attrName === "$index" || attrName === "index") {
      if (getTiddlerIndexes) {
        const tagStart = findCurrentTagStart(textBefore)
        const currentTag = tagStart >= 0 ? textBefore.slice(tagStart) : textBefore
        const tiddlerAttrMatch = /(?:\$tiddler|tiddler)\s*=\s*(["'])([^"']*)\1/.exec(currentTag)
        if (tiddlerAttrMatch) {
          const tiddlerTitle = tiddlerAttrMatch[2]
          const indexes = getTiddlerIndexes(tiddlerTitle)
          if (indexes.length > 0) {
            const lowerPartial = partial.toLowerCase()
            const filtered = indexes.filter(idx => idx.toLowerCase().startsWith(lowerPartial))
            options = filtered.map(indexName => ({
              label: indexName,
              type: "property",
              detail: "index",
              boost: 2,
              apply: (view, _completion, from, to) => {
                const textAfter = view.state.sliceDoc(to, to + 1)
                const suffix = textAfter === quoteChar ? "" : quoteChar
                const insert = indexName + suffix
                const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
                view.dispatch({
                  changes,
                  selection: { anchor: from + insert.length }
                })
              }
            }))
          }
        }
      }
    }
    // storyview attribute
    else if (attrName === "storyview") {
      const storyviews = getStoryViews ? getStoryViews() : defaultStoryViews
      const lowerPartial = partial.toLowerCase()
      const filtered = storyviews.filter(sv => sv.toLowerCase().startsWith(lowerPartial))
      options = filtered.map(storyview => ({
        label: storyview,
        type: "keyword",
        detail: "storyview",
        boost: 2,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const suffix = textAfter === quoteChar ? "" : quoteChar
          const insert = storyview + suffix
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + insert.length }
          })
        }
      }))
    }
    // deserializer attribute
    else if (attrName === "deserializer") {
      const deserializers = getDeserializers ? getDeserializers() : defaultDeserializers
      const lowerPartial = partial.toLowerCase()
      const filtered = deserializers.filter(d => d.toLowerCase().startsWith(lowerPartial))
      options = filtered.map(deserializer => ({
        label: deserializer,
        type: "keyword",
        detail: "deserializer",
        boost: 2,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const suffix = textAfter === quoteChar ? "" : quoteChar
          const insert = deserializer + suffix
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + insert.length }
          })
        }
      }))
    }
    // class attribute - show all available CSS class names
    // Supports multiple space-separated classes
    else if (attrName === "class") {
      if (getClassNames) {
        const classNames = getClassNames()
        if (classNames && classNames.length > 0) {
          // Handle space-separated class names - complete only the last word
          const lastSpaceIdx = partial.lastIndexOf(' ')
          const currentWord = lastSpaceIdx >= 0 ? partial.slice(lastSpaceIdx + 1) : partial
          const prefix = lastSpaceIdx >= 0 ? partial.slice(0, lastSpaceIdx + 1) : ""
          const wordFrom = from + prefix.length

          // Filter out classes already in the value
          const existingClasses = new Set(partial.split(/\s+/).filter(c => c))
          const lowerCurrentWord = currentWord.toLowerCase()
          const filtered = classNames.filter(cls =>
            cls.toLowerCase().startsWith(lowerCurrentWord) && !existingClasses.has(cls)
          )

          options = filtered.map(className => ({
            label: className,
            type: "class",
            detail: "class",
            boost: 2,
            apply: (view, _completion, _from, to) => {
              const textAfter = view.state.sliceDoc(to, to + 1)
              // Add space after class to allow adding more classes
              // Only skip if closing quote is already there
              const hasClosingQuote = textAfter === quoteChar
              const suffix = hasClosingQuote ? "" : " "
              const insert = className + suffix
              const changes = buildMultiSelectionChanges(view, wordFrom, to, insert, currentWord.length)
              view.dispatch({
                changes,
                selection: { anchor: wordFrom + insert.length },
                // Trigger completion again to allow adding more classes
                effects: hasClosingQuote ? undefined : triggerCompletionEffect.of(null)
              })
            }
          }))

          if (options.length > 0) {
            return {
              from: wordFrom,
              to: pos,
              options,
              validFor: /^[\w\-]*$/
            }
          }
        }
      }
    }
    // $name attribute (for $macrocall)
    else if (attrName === "$name") {
      const seen = new Set<string>()
      const allNames: { name: string, detail: string }[] = []

      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)

      for (const name of localDefs.macros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro (local)" })
        }
      }

      for (const name of localDefs.procedures) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "procedure (local)" })
        }
      }

      for (const name of localDefs.functions) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "function (local)" })
        }
      }

      for (const name of localDefs.widgets) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "widget (local)" })
        }
      }

      const externalMacros = getMacroNames ? getMacroNames() : commonMacros
      for (const name of externalMacros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro" })
        }
      }

      const lowerPartial = partial.toLowerCase()
      const filtered = allNames.filter(({ name }) =>
        name.toLowerCase().startsWith(lowerPartial)
      )

      options = filtered.map(({ name, detail }) => ({
        label: name,
        type: "function",
        detail,
        boost: 2,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const suffix = textAfter === quoteChar ? "" : quoteChar
          const insert = name + suffix
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + insert.length }
          })
        }
      }))
    }

    if (options.length === 0) return null

    return {
      from,
      to: pos,
      options,
      validFor: /^[\w\-$:\/. ]*$/
    }
  }
}

// Attribute names that should have their content parsed as wikitext
// Keep in sync with WIKITEXT_ATTR_NAMES in inline-parsers.ts
const WIKITEXT_ATTR_NAMES = new Set([
  'emptymessage',
  'template',
  'caption',
  'tooltip',
  'placeholder',
  'default',
  'alt',
  'description',
  'message',
  'content',
  'actions',
  'startactions',
  'endactions',
  'checkactions',
  'uncheckactions',
  'inputactions',
  'src',
  'text',
])

/**
 * Check if we're inside a wikitext attribute value context
 * Returns the attribute quote type and content info if inside wikitext attribute
 */
function getWikitextAttributeContext(textBefore: string): {
  isWikitext: boolean
  quoteType: '"""' | '"' | "'" | null
  contentStart: number
  attrName: string | null
} | null {
  // Look for attribute pattern: name="""..., name="..., or name='...
  // Check for triple-quoted first (most specific)
  const tripleQuoteMatch = /([$a-zA-Z][\w\-\.]*)\s*=\s*"""([^"]*)$/.exec(textBefore)
  if (tripleQuoteMatch) {
    // Triple-quoted is always wikitext
    return {
      isWikitext: true,
      quoteType: '"""',
      contentStart: textBefore.length - tripleQuoteMatch[2].length,
      attrName: tripleQuoteMatch[1]
    }
  }

  // Check for double-quoted
  const doubleQuoteMatch = /([$a-zA-Z][\w\-\.]*)\s*=\s*"([^"]*)$/.exec(textBefore)
  if (doubleQuoteMatch) {
    const attrName = doubleQuoteMatch[1].toLowerCase()
    return {
      isWikitext: WIKITEXT_ATTR_NAMES.has(attrName),
      quoteType: '"',
      contentStart: textBefore.length - doubleQuoteMatch[2].length,
      attrName: doubleQuoteMatch[1]
    }
  }

  // Check for single-quoted
  const singleQuoteMatch = /([$a-zA-Z][\w\-\.]*)\s*=\s*'([^']*)$/.exec(textBefore)
  if (singleQuoteMatch) {
    const attrName = singleQuoteMatch[1].toLowerCase()
    return {
      isWikitext: WIKITEXT_ATTR_NAMES.has(attrName),
      quoteType: "'",
      contentStart: textBefore.length - singleQuoteMatch[2].length,
      attrName: singleQuoteMatch[1]
    }
  }

  return null
}

/**
 * Find enclosing pragma within attribute content
 * Returns the pragma name, type, parameters, or null if not inside a pragma
 */
function findEnclosingPragmaInContent(content: string, posInContent: number): {
  name: string
  type: string
  params: string[]
} | null {
  // Search for pragma definitions within the content
  const textBefore = content.slice(0, posInContent)

  // Find all pragma definitions with their positions
  const pragmaRegex = /(?:^|[\r\n])[ \t]*\\(define|procedure|function|widget)\s+([^\s(]+)(?:\(([^)]*)\))?/gm
  let match
  let lastPragma: { name: string, type: string, params: string[], startPos: number } | null = null

  while ((match = pragmaRegex.exec(textBefore)) !== null) {
    const type = match[1]
    const name = match[2]
    const paramsStr = match[3]
    let params: string[] = []

    const backslashOffset = match[0].indexOf("\\")
    const pragmaStartPos = match.index + backslashOffset

    if (paramsStr !== undefined && paramsStr.trim()) {
      params = paramsStr.split(',').map(p => {
        const paramName = p.trim().split(':')[0].trim()
        return paramName
      }).filter(p => p.length > 0)
    } else {
      // Check for \parameters pragma on the next line
      const afterDef = content.slice(match.index + match[0].length)
      const parametersMatch = /^\s*\n?\s*\\parameters\s*\(([^)]*)\)/.exec(afterDef)
      if (parametersMatch) {
        params = parametersMatch[1].split(',').map(p => {
          const paramName = p.trim().split(':')[0].trim()
          return paramName
        }).filter(p => p.length > 0)
      }
    }

    lastPragma = { name, type, params, startPos: pragmaStartPos }
  }

  if (!lastPragma) return null

  // Check if we're still inside this pragma (before \end or next pragma)
  const textAfterPragma = content.slice(lastPragma.startPos)
  const endMatch = /[\r\n][ \t]*\\end\b/.exec(textAfterPragma)
  const nextPragmaMatch = /[\r\n][ \t]*\\(define|procedure|function|widget)\s+/.exec(textAfterPragma)

  let endPos = content.length
  if (endMatch) {
    const backslashOffset = endMatch[0].indexOf("\\")
    const endMatchPos = lastPragma.startPos + endMatch.index + backslashOffset + 4
    if (endMatchPos < endPos) {
      endPos = endMatchPos
    }
  }
  if (nextPragmaMatch) {
    const backslashOffset = nextPragmaMatch[0].indexOf("\\")
    const nextPragmaPos = lastPragma.startPos + nextPragmaMatch.index + backslashOffset
    if (nextPragmaPos < endPos) {
      endPos = nextPragmaPos
    }
  }

  if (posInContent <= endPos) {
    return { name: lastPragma.name, type: lastPragma.type, params: lastPragma.params }
  }

  return null
}

/**
 * Extract local definitions from content (simplified version for attribute content)
 */
function extractLocalDefsFromContent(content: string): {
  macros: string[]
  procedures: string[]
  functions: string[]
  widgets: string[]
  widgetVars: string[]
  definitionParams: Record<string, string[]>
} {
  const macros: string[] = []
  const procedures: string[] = []
  const functions: string[] = []
  const widgets: string[] = []
  const widgetVars: string[] = []
  const definitionParams: Record<string, string[]> = {}
  const seen: Record<string, boolean> = {}

  // Find pragma definitions
  const pragmaRegex = /(?:^|[\r\n])[ \t]*\\(define|procedure|function|widget)\s+([^\s(]+)(?:\(([^)]*)\))?/gm
  let match
  while ((match = pragmaRegex.exec(content)) !== null) {
    const type = match[1]
    const name = match[2]
    const paramsStr = match[3]
    if (!seen[name]) {
      seen[name] = true
      switch (type) {
        case 'function': functions.push(name); break
        case 'procedure': procedures.push(name); break
        case 'define': macros.push(name); break
        case 'widget': widgets.push(name); break
      }
      if (paramsStr !== undefined && paramsStr.trim()) {
        const params = paramsStr.split(',').map(p => {
          const paramName = p.trim().split(':')[0].trim()
          return paramName
        }).filter(p => p.length > 0)
        if (params.length > 0) {
          definitionParams[name] = params
        }
      }
    }
  }

  // Find <$set name="...">
  const setRegex = /<\$set\s+[^>]*name\s*=\s*["']([^"']+)["']/gi
  while ((match = setRegex.exec(content)) !== null) {
    const varName = match[1]
    if (!seen[varName]) {
      seen[varName] = true
      widgetVars.push(varName)
    }
  }

  // Find <$let attr="..."> and <$vars attr="...">
  const letVarsRegex = /<\$(let|vars)\s+([^>]+)>/gi
  while ((match = letVarsRegex.exec(content)) !== null) {
    const attrs = match[2]
    const attrRegex = /([a-zA-Z_][\w-]*)\s*=/g
    let attrMatch
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const varName = attrMatch[1]
      if (!seen[varName]) {
        seen[varName] = true
        widgetVars.push(varName)
      }
    }
  }

  return { macros, procedures, functions, widgets, widgetVars, definitionParams }
}

/**
 * Wikitext completion inside attribute values
 * Activates when typing wikitext syntax triggers inside wikitext attributes
 */
export function wikitextAttributeCompletion(
  getTiddlerTitles?: () => string[],
  getMacroNames?: () => string[],
  getWidgetNames?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[],
  isDraftTiddler?: (title: string) => boolean,
  getMacroParams?: (name: string) => string[] | null
) {
  // Use module-level cached constants (avoid circular deps by not importing)
  const coreWidgets = CORE_WIDGETS_LIST
  const commonHtmlTags = COMMON_HTML_TAGS_LIST

  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 500), pos)

    // First check if we're inside a widget/HTML context
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    let inWidgetContext = false

    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      if (node.name === "Widget" || node.name === "InlineWidget" ||
          node.name === "HTMLTag" || node.name === "HTMLBlock" ||
          node.name === "IncompleteWidget" || node.name === "IncompleteHTMLTag" ||
          node.name === "IncompleteHTMLBlock") {
        inWidgetContext = true
      }
      node = node.parent!
    }

    if (!inWidgetContext) return null

    // Check if we're inside a wikitext attribute
    const attrContext = getWikitextAttributeContext(textBefore)
    if (!attrContext || !attrContext.isWikitext) return null

    const content = textBefore.slice(attrContext.contentStart)
    const posInContent = content.length
    const options: Completion[] = []

    // Find enclosing pragma within the attribute content
    const enclosingPragma = findEnclosingPragmaInContent(content, posInContent)
    const contentDefs = extractLocalDefsFromContent(content)

    // ========== SUBSTITUTED PARAMETER COMPLETIONS ==========

    // Check for <<__ pattern (substituted macro param)
    const macroSubstMatch = /<<__[\w]*$/.exec(content)
    if (macroSubstMatch && enclosingPragma && enclosingPragma.params.length > 0) {
      const partial = macroSubstMatch[0].slice(4) // Remove <<__
      const from = pos - macroSubstMatch[0].length

      const filtered = enclosingPragma.params.filter(p =>
        p.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const param of filtered) {
        options.push({
          label: `<<__${param}__>>`,
          type: "variable",
          detail: "parameter",
          boost: 10,
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^<<__[\w]*$/
        }
      }
    }

    // Check for <__ pattern (substituted filter param) - but not <<__
    const filterSubstMatch = !macroSubstMatch ? /<__[\w]*$/.exec(content) : null
    if (filterSubstMatch && enclosingPragma && enclosingPragma.params.length > 0) {
      const partial = filterSubstMatch[0].slice(3) // Remove <__
      const from = pos - filterSubstMatch[0].length

      const filtered = enclosingPragma.params.filter(p =>
        p.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const param of filtered) {
        options.push({
          label: `<__${param}__>`,
          type: "variable",
          detail: "parameter",
          boost: 10,
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^<__[\w]*$/
        }
      }
    }

    // Check for $( pattern (variable substitution syntax) - $(param)$
    // Only valid in \define blocks
    const varSubstMatch = !macroSubstMatch && !filterSubstMatch ? /\$\([\w]*$/.exec(content) : null
    if (varSubstMatch && enclosingPragma && enclosingPragma.type === "define") {
      const partial = varSubstMatch[0].slice(2) // Remove $(
      const from = pos - varSubstMatch[0].length

      // Get variables from content (not including current pragma's params)
      const seen = new Set<string>()
      seen.add(enclosingPragma.name)
      for (const p of enclosingPragma.params) seen.add(p)

      const vars: { name: string, detail: string }[] = []
      for (const name of contentDefs.procedures) {
        if (!seen.has(name)) { seen.add(name); vars.push({ name, detail: "procedure" }) }
      }
      for (const name of contentDefs.functions) {
        if (!seen.has(name)) { seen.add(name); vars.push({ name, detail: "function" }) }
      }
      for (const name of contentDefs.macros) {
        if (!seen.has(name)) { seen.add(name); vars.push({ name, detail: "macro" }) }
      }
      for (const name of contentDefs.widgetVars) {
        if (!seen.has(name)) { seen.add(name); vars.push({ name, detail: "variable" }) }
      }

      // Also add from global scope
      if (getMacroNames) {
        for (const name of getMacroNames()) {
          if (!seen.has(name)) { seen.add(name); vars.push({ name, detail: "macro" }) }
        }
      }
      if (getFunctionNames) {
        for (const name of getFunctionNames()) {
          if (!seen.has(name)) { seen.add(name); vars.push({ name, detail: "function" }) }
        }
      }
      if (getVariableNames) {
        for (const name of getVariableNames()) {
          if (!seen.has(name)) { seen.add(name); vars.push({ name, detail: "variable" }) }
        }
      }

      const filtered = vars.filter(v =>
        v.name.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const v of filtered) {
        options.push({
          label: `$(${v.name})$`,
          type: "variable",
          detail: v.detail,
          boost: 5,
          apply: (view, _completion, from, to) => {
            const textAfter = view.state.sliceDoc(to, to + 2)
            let adjustedTo = to
            if (textAfter === ")$") adjustedTo = to + 2
            else if (textAfter[0] === ")") adjustedTo = to + 1
            view.dispatch({
              changes: { from, to: adjustedTo, insert: `$(${v.name})$` },
              selection: { anchor: from + v.name.length + 4 }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^\$\([\w]*$/
        }
      }
    }

    // Check for $param$ placeholder pattern (only valid in \define blocks)
    const placeholderMatch = !macroSubstMatch && !filterSubstMatch && !varSubstMatch
      ? /\$[\w]+$/.exec(content)
      : null
    if (placeholderMatch && enclosingPragma && enclosingPragma.type === "define" && enclosingPragma.params.length > 0) {
      const partial = placeholderMatch[0].slice(1) // Remove $
      const from = pos - placeholderMatch[0].length

      const filtered = enclosingPragma.params.filter(p =>
        p.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const param of filtered) {
        options.push({
          label: `$${param}$`,
          type: "variable",
          detail: "parameter",
          boost: 10,
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^\$[\w]+$/
        }
      }
    }

    // ========== MACRO PARAMETER COMPLETION ==========
    // Check for <<macro param: pattern
    const macroCallMatch = /<<([\w\-\.]+)\s+[^>]*$/.exec(content)
    if (macroCallMatch) {
      const macroName = macroCallMatch[1]

      // Check we're not inside a quoted value
      const afterMacro = content.slice(content.lastIndexOf('<<'))
      let inQuote = false
      let quoteChar = ''
      for (const ch of afterMacro) {
        if (!inQuote && (ch === '"' || ch === "'")) {
          inQuote = true
          quoteChar = ch
        } else if (inQuote && ch === quoteChar) {
          inQuote = false
        }
      }

      if (!inQuote) {
        const paramMatch = /\s([$\w\-]*)$/.exec(content)
        if (paramMatch) {
          const partial = paramMatch[1]
          const from = pos - partial.length

          // Get params from content definitions first
          let params = contentDefs.definitionParams[macroName] || []

          // If not found in content, check global scope
          if (params.length === 0 && getMacroParams) {
            params = getMacroParams(macroName) || []
          }

          if (params.length > 0) {
            const filtered = params.filter(p =>
              p.toLowerCase().startsWith(partial.toLowerCase())
            )

            for (const param of filtered) {
              options.push({
                label: param,
                type: "property",
                detail: "parameter",
                apply: (view, _completion, from, to) => {
                  const textAfter = view.state.sliceDoc(to, to + 1)
                  const suffix = textAfter === ":" ? "" : ":"
                  view.dispatch({
                    changes: { from, to, insert: param + suffix },
                    selection: { anchor: from + param.length + 1 }
                  })
                }
              })
            }

            if (options.length > 0) {
              return {
                from,
                to: pos,
                options,
                validFor: /^[$\w\-]*$/
              }
            }
          }
        }
      }
    }

    // ========== FILTER VARIABLE COMPLETION ==========
    // Pattern: [<variable> or ]<variable> etc. in filters
    const filterVarMatch = /[\[\]}>][\w\-:!]*<[\w\-\.]*$/.exec(content)
    if (filterVarMatch && !content.endsWith('<$') && !content.endsWith('<<')) {
      const prefix = filterVarMatch[0].slice(0, filterVarMatch[0].lastIndexOf('<') + 1)
      const partial = filterVarMatch[0].slice(filterVarMatch[0].lastIndexOf('<') + 1)
      const from = pos - filterVarMatch[0].length

      const allVars: { name: string, detail: string, boost: number }[] = []
      const seen = new Set<string>()

      // Add pragma parameters with high boost first
      if (enclosingPragma && enclosingPragma.params.length > 0) {
        for (const param of enclosingPragma.params) {
          if (!seen.has(param)) {
            seen.add(param)
            allVars.push({ name: param, detail: "parameter", boost: 10 })
          }
        }
      }

      // Add local definitions from content
      for (const name of contentDefs.macros) {
        if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "macro", boost: 2 }) }
      }
      for (const name of contentDefs.procedures) {
        if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "procedure", boost: 2 }) }
      }
      for (const name of contentDefs.functions) {
        if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "function", boost: 2 }) }
      }
      for (const name of contentDefs.widgetVars) {
        if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "variable", boost: 2 }) }
      }

      // Add from document-level definitions
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)
      for (const name of localDefs.macros) {
        if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "macro", boost: 1 }) }
      }
      for (const name of localDefs.procedures) {
        if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "procedure", boost: 1 }) }
      }
      for (const name of localDefs.functions) {
        if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "function", boost: 1 }) }
      }

      // Add from global scope
      if (getMacroNames) {
        for (const name of getMacroNames()) {
          if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "macro", boost: 0 }) }
        }
      }
      if (getFunctionNames) {
        for (const name of getFunctionNames()) {
          if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "function", boost: 0 }) }
        }
      }
      if (getVariableNames) {
        for (const name of getVariableNames()) {
          if (!seen.has(name)) { seen.add(name); allVars.push({ name, detail: "variable", boost: 0 }) }
        }
      }

      const filtered = allVars.filter(v =>
        v.name.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const v of filtered) {
        options.push({
          label: prefix + v.name,
          type: v.detail === "parameter" ? "variable" : "function",
          detail: v.detail,
          boost: v.boost,
          apply: (view, _completion, from, to) => {
            const textAfter = view.state.sliceDoc(to, to + 1)
            const hasClosingAngle = textAfter === ">"
            const suffix = hasClosingAngle ? "" : ">"
            const insert = prefix + v.name + suffix
            const cursorPos = from + prefix.length + v.name.length + (hasClosingAngle ? 0 : 1)
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: cursorPos }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^[\[\]}>][\w\-:!]*<[\w\-\.]*$/
        }
      }
    }

    // ========== REGULAR COMPLETIONS ==========

    // Check for widget trigger: <$
    const widgetMatch = /<\$[\w\-\.]*$/.exec(content)
    if (widgetMatch) {
      const partial = widgetMatch[0].slice(2) // Remove <$
      const from = pos - widgetMatch[0].length

      // Get all widget names (start with cached core set, add dynamic ones)
      const allWidgets = new Set(CORE_WIDGETS_SET)
      if (getWidgetNames) {
        for (const w of getWidgetNames()) {
          allWidgets.add(w)
        }
      }
      // Local widgets
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)
      for (const w of localDefs.widgets) {
        allWidgets.add(w)
      }

      const filtered = Array.from(allWidgets).filter(w => {
        const name = w.startsWith('$') ? w.slice(1) : w
        return name.toLowerCase().startsWith(partial.toLowerCase())
      })

      for (const widget of filtered) {
        const name = widget.startsWith('$') ? widget.slice(1) : widget
        options.push({
          label: `<$${name}`,
          type: "type",
          detail: "widget",
          boost: 2,
          apply: (view, _completion, from, to) => {
            // Insert widget with closing tag
            const insert = `<$${name}></$${name}>`
            const cursorPos = from + name.length + 3
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: cursorPos }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^<\$[\w\-\.]*$/
        }
      }
    }

    // Check for HTML tag trigger: <letter (but not <$ or <<)
    const htmlMatch = /<([a-zA-Z][\w\-]*)$/.exec(content)
    if (htmlMatch && !content.endsWith('<$') && !content.endsWith('<<')) {
      const partial = htmlMatch[1]
      const from = pos - htmlMatch[0].length

      const filtered = commonHtmlTags.filter(t =>
        t.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const tag of filtered) {
        options.push({
          label: `<${tag}`,
          type: "keyword",
          detail: "html",
          boost: 1,
          apply: (view, _completion, from, to) => {
            const insert = `<${tag}></${tag}>`
            const cursorPos = from + tag.length + 2
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: cursorPos }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^<[a-zA-Z][\w\-]*$/
        }
      }
    }

    // Check for macro trigger: <<
    const macroMatch = /<<[\w\-]*$/.exec(content)
    if (macroMatch) {
      const partial = macroMatch[0].slice(2) // Remove <<
      const from = pos - macroMatch[0].length

      // If inside a pragma, add parameters with high boost first
      if (enclosingPragma && enclosingPragma.params.length > 0) {
        const filteredParams = enclosingPragma.params.filter(p =>
          p.toLowerCase().startsWith(partial.toLowerCase())
        )
        for (const param of filteredParams) {
          options.push({
            label: `<<${param}`,
            type: "variable",
            detail: "parameter",
            boost: 10,
            apply: (view, _completion, from, to) => {
              const insert = `<<${param}>>`
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length - 2 }
              })
            }
          })
        }
      }

      // Start with cached common macros, then add dynamic sources
      const allMacros = new Set(getCommonMacrosSet())
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)
      for (const m of localDefs.macros) allMacros.add(m)
      for (const m of localDefs.procedures) allMacros.add(m)
      for (const m of localDefs.functions) allMacros.add(m)
      // Also add from content definitions (pragmas defined within the attribute)
      for (const m of contentDefs.macros) allMacros.add(m)
      for (const m of contentDefs.procedures) allMacros.add(m)
      for (const m of contentDefs.functions) allMacros.add(m)
      for (const m of contentDefs.widgetVars) allMacros.add(m)
      if (getMacroNames) {
        for (const m of getMacroNames()) allMacros.add(m)
      }
      if (getFunctionNames) {
        for (const m of getFunctionNames()) allMacros.add(m)
      }
      if (getVariableNames) {
        for (const m of getVariableNames()) allMacros.add(m)
      }

      const filtered = Array.from(allMacros).filter(m =>
        m.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const macro of filtered) {
        options.push({
          label: `<<${macro}`,
          type: "function",
          detail: "macro",
          boost: 2,
          apply: (view, _completion, from, to) => {
            const insert = `<<${macro}>>`
            const cursorPos = from + insert.length - 2
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: cursorPos }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^<<[\w\-]*$/
        }
      }
    }

    // Check for link trigger: [[
    const linkMatch = /\[\[[^\]|]*$/.exec(content)
    if (linkMatch) {
      const partial = linkMatch[0].slice(2) // Remove [[
      const from = pos - linkMatch[0].length

      const titles = getTiddlerTitles ? getTiddlerTitles() : []
      const filtered = titles.filter(t =>
        t.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const title of filtered) {
        options.push({
          label: `[[${title}`,
          type: "variable",
          detail: "tiddler",
          boost: getTiddlerBoost(title, isDraftTiddler),
          sortText: getTiddlerSortText(title, isDraftTiddler),
          apply: (view, _completion, from, to) => {
            const insert = `[[${title}]]`
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^\[\[[^\]|]*$/
        }
      }
    }

    // Check for transclusion trigger: {{ (but not {{{)
    const transcludeMatch = /(?<!\{)\{\{[^{}|]*$/.exec(content)
    if (transcludeMatch && !content.endsWith('{{{')) {
      const partial = transcludeMatch[0].slice(2) // Remove {{
      const from = pos - transcludeMatch[0].length

      const titles = getTiddlerTitles ? getTiddlerTitles() : []
      const filtered = titles.filter(t =>
        t.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const title of filtered) {
        options.push({
          label: `{{${title}`,
          type: "variable",
          detail: "transclusion",
          boost: getTiddlerBoost(title, isDraftTiddler),
          sortText: getTiddlerSortText(title, isDraftTiddler),
          apply: (view, _completion, from, to) => {
            const insert = `{{${title}}}`
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^(?<!\{)\{\{[^{}|]*$/
        }
      }
    }

    // Check for conditional trigger: <%
    const conditionalMatch = /<%[\w]*$/.exec(content)
    if (conditionalMatch) {
      const partial = conditionalMatch[0].slice(2) // Remove <%
      const from = pos - conditionalMatch[0].length

      const conditionals = ["if", "elseif", "else", "endif"]
      const filtered = conditionals.filter(c =>
        c.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const cond of filtered) {
        if (cond === "if" || cond === "elseif") {
          options.push({
            label: `<%${cond}`,
            type: "keyword",
            detail: "conditional",
            boost: 2,
            apply: (view, _completion, from, to) => {
              const insert = `<%${cond} %>`
              const cursorPos = from + cond.length + 3
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: cursorPos }
              })
            }
          })
        } else {
          options.push({
            label: `<%${cond}`,
            type: "keyword",
            detail: "conditional",
            boost: 2,
            apply: (view, _completion, from, to) => {
              const insert = `<%${cond}%>`
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length }
              })
            }
          })
        }
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^<%[\w]*$/
        }
      }
    }

    // Check for pragma trigger: \ at start of line (or after newline)
    // Look for \keyword pattern where \ is at start of a line within the content
    const pragmaMatch = /(?:^|[\r\n])[ \t]*\\(\w*)$/.exec(content)
    if (pragmaMatch) {
      const partial = pragmaMatch[1]
      const from = pos - partial.length

      const pragmaKeywords = [
        { label: "define", detail: "Define a macro" },
        { label: "procedure", detail: "Define a procedure" },
        { label: "function", detail: "Define a function" },
        { label: "widget", detail: "Define a widget" },
        { label: "import", detail: "Import tiddlers" },
        { label: "rules", detail: "Set parser rules" },
        { label: "parameters", detail: "Declare parameters" },
        { label: "whitespace", detail: "Whitespace handling" },
        { label: "parsermode", detail: "Set parser mode" },
        { label: "end", detail: "End a definition" },
      ]

      const filtered = pragmaKeywords.filter(kw =>
        kw.label.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const kw of filtered) {
        options.push({
          label: kw.label,
          type: "keyword",
          detail: kw.detail,
          boost: 2,
          apply: (view, _completion, from, to) => {
            // Don't add space after \end
            const insert = kw.label === "end" ? kw.label : kw.label + " "
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length }
            })
          }
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^\w*$/
        }
      }
    }

    // Check for \rules only/except completion
    const rulesMatch = /(?:^|[\r\n])[ \t]*\\rules\s+(\w*)$/.exec(content)
    if (rulesMatch) {
      const partial = rulesMatch[1]
      const from = pos - partial.length

      const rulesKeywords = [
        { label: "only", detail: "Only enable specified rules" },
        { label: "except", detail: "Disable specified rules" },
      ]

      const filtered = rulesKeywords.filter(kw =>
        kw.label.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const kw of filtered) {
        options.push({
          label: kw.label,
          type: "keyword",
          detail: kw.detail,
          boost: 2,
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^\w*$/
        }
      }
    }

    // Check for \whitespace trim/notrim completion
    const whitespaceMatch = /(?:^|[\r\n])[ \t]*\\whitespace\s+(\w*)$/.exec(content)
    if (whitespaceMatch) {
      const partial = whitespaceMatch[1]
      const from = pos - partial.length

      const whitespaceKeywords = [
        { label: "trim", detail: "Remove leading/trailing whitespace" },
        { label: "notrim", detail: "Preserve whitespace" },
      ]

      const filtered = whitespaceKeywords.filter(kw =>
        kw.label.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const kw of filtered) {
        options.push({
          label: kw.label,
          type: "keyword",
          detail: kw.detail,
          boost: 2,
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^\w*$/
        }
      }
    }

    // Check for \parsermode block/inline completion
    const parsermodeMatch = /(?:^|[\r\n])[ \t]*\\parsermode\s+(\w*)$/.exec(content)
    if (parsermodeMatch) {
      const partial = parsermodeMatch[1]
      const from = pos - partial.length

      const parsermodeKeywords = [
        { label: "block", detail: "Parse as block content" },
        { label: "inline", detail: "Parse as inline content" },
      ]

      const filtered = parsermodeKeywords.filter(kw =>
        kw.label.toLowerCase().startsWith(partial.toLowerCase())
      )

      for (const kw of filtered) {
        options.push({
          label: kw.label,
          type: "keyword",
          detail: kw.detail,
          boost: 2,
        })
      }

      if (options.length > 0) {
        return {
          from,
          to: pos,
          options,
          validFor: /^\w*$/
        }
      }
    }

    // Explicit completion (Ctrl+Space) - offer all wikitext constructs
    if (context.explicit) {
      const from = pos

      // Offer starters for all wikitext constructs
      options.push({
        label: "<$",
        type: "type",
        detail: "widget",
        boost: 5,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "<$" },
            selection: { anchor: from + 2 },
            effects: triggerCompletionEffect.of(null)
          })
        }
      })

      options.push({
        label: "<<",
        type: "function",
        detail: "macro",
        boost: 4,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "<<" },
            selection: { anchor: from + 2 },
            effects: triggerCompletionEffect.of(null)
          })
        }
      })

      options.push({
        label: "[[",
        type: "variable",
        detail: "link",
        boost: 3,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "[[" },
            selection: { anchor: from + 2 },
            effects: triggerCompletionEffect.of(null)
          })
        }
      })

      options.push({
        label: "{{",
        type: "variable",
        detail: "transclusion",
        boost: 2,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "{{" },
            selection: { anchor: from + 2 },
            effects: triggerCompletionEffect.of(null)
          })
        }
      })

      options.push({
        label: "{{{",
        type: "variable",
        detail: "filtered transclusion",
        boost: 1,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "{{{" },
            selection: { anchor: from + 3 },
            effects: triggerCompletionEffect.of(null)
          })
        }
      })

      options.push({
        label: "<%if",
        type: "keyword",
        detail: "conditional",
        boost: 1,
        apply: (view, _completion, from, to) => {
          const insert = "<%if %>"
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + 5 }
          })
        }
      })

      // Pragma options
      options.push({
        label: "\\procedure",
        type: "keyword",
        detail: "pragma",
        boost: 1,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "\\procedure " },
            selection: { anchor: from + 11 }
          })
        }
      })

      options.push({
        label: "\\function",
        type: "keyword",
        detail: "pragma",
        boost: 1,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "\\function " },
            selection: { anchor: from + 10 }
          })
        }
      })

      options.push({
        label: "\\define",
        type: "keyword",
        detail: "pragma",
        boost: 1,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "\\define " },
            selection: { anchor: from + 8 }
          })
        }
      })

      options.push({
        label: "\\widget",
        type: "keyword",
        detail: "pragma",
        boost: 1,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "\\widget " },
            selection: { anchor: from + 8 }
          })
        }
      })

      return {
        from,
        to: pos,
        options,
        validFor: /^$/
      }
    }

    return null
  }
}
