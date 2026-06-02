/**
 * Widget completion sources
 */

import { syntaxTree } from "@codemirror/language"
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import {
  selfClosingWidgets,
  triggerCompletionEffect,
  buildMultiSelectionChanges,
  extractLocalDefinitions,
} from "./common"
import { tiddlyWikiMessages } from "./attribute-value"
import { commonHtmlTags } from "./html"

// ============================================================================
// Module-level caches for frequently-used Sets
// ============================================================================

// Cached Set of DOM events for $eventcatcher attribute completion
const DOM_EVENTS_SET = new Set([
  // Mouse events
  "click", "dblclick", "mousedown", "mouseup", "mousemove",
  "mouseenter", "mouseleave", "mouseover", "mouseout", "contextmenu",
  // Keyboard events
  "keydown", "keyup", "keypress",
  // Focus events
  "focus", "blur", "focusin", "focusout",
  // Form events
  "input", "change", "submit", "reset", "invalid",
  // Drag events
  "dragstart", "drag", "dragend", "dragenter", "dragleave", "dragover", "drop",
  // Touch events
  "touchstart", "touchmove", "touchend", "touchcancel",
  // Pointer events
  "pointerdown", "pointerup", "pointermove", "pointerenter", "pointerleave",
  "pointerover", "pointerout", "pointercancel",
  // Wheel/scroll events
  "wheel", "scroll",
  // Clipboard events
  "copy", "cut", "paste",
  // Other common events
  "load", "error", "resize", "select"
])

// Cached Set of TiddlyWiki messages for $messagecatcher attribute completion
let _messagesSet: Set<string> | null = null
function getMessagesSet(): Set<string> {
  if (!_messagesSet) {
    _messagesSet = new Set(tiddlyWikiMessages)
  }
  return _messagesSet
}

// Helper to check if a widget is self-closing (checking both base set and dynamic)
function isSelfClosing(name: string, dynamicSelfClosing?: () => string[]): boolean {
  if (selfClosingWidgets.has(name)) return true
  if (dynamicSelfClosing) {
    const dynamic = dynamicSelfClosing()
    for (const w of dynamic) {
      if (w === name) return true
    }
  }
  return false
}

// TiddlyWiki Core Widgets (with $ prefix as stored)
export const coreWidgets = [
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

// Fallback widget attributes (used when dynamic introspection fails)
export const widgetAttributes: Record<string, string[]> = {
  "$action-confirm": ["$message", "$prompt"],
  "$action-createtiddler": ["$basetitle", "$savetitle", "$saveoriginal", "$template", "$overwrite", "$timestamp"],
  "$action-deletefield": ["$tiddler", "$field"],
  "$action-deletetiddler": ["$tiddler", "$filter"],
  "$action-listops": ["$tiddler", "$field", "$index", "$filter", "$subfilter", "$tags"],
  "$action-log": ["$$filter", "$$message", "$$all"],
  "$action-navigate": ["$to", "$scroll"],
  "$action-popup": ["$state", "$coords", "$floating", "$absolute"],
  "$action-sendmessage": ["$message", "$param", "$name", "$value"],
  "$action-setfield": ["$tiddler", "$field", "$index", "$value", "$timestamp"],
  "$action-setmultiplefields": ["$tiddler", "$fields", "$values", "$indexes"],
  "$browse": ["multiple", "accept", "message", "param", "tooltip", "deserializer", "class"],
  "$button": ["message", "param", "set", "setTo", "actions", "to", "tooltip", "aria-label", "popup", "popupAbsolute", "hoverpopup", "selectedClass", "default", "disabled", "tag", "dragTiddler", "dragFilter", "class", "style"],
  "$checkbox": ["tiddler", "field", "index", "tag", "invertTag", "checked", "unchecked", "default", "indeterminate", "disabled", "actions", "uncheckactions", "checkactions", "class"],
  "$codeblock": ["code", "language", "class"],
  "$count": ["filter"],
  "$draggable": ["tiddler", "filter", "tag", "enable", "startactions", "endactions", "class"],
  "$droppable": ["actions", "effect", "tag", "enable", "disabledClass", "class"],
  "$dropzone": ["deserializer", "enable", "autoOpenOnImport", "importTitle", "actions", "contentTypesFilter", "filesOnly", "class"],
  "$edit": ["tiddler", "field", "index", "default", "placeholder", "tabindex", "focus", "cancelPopups", "inputActions", "refreshTitle", "autocomplete", "class"],
  "$edit-bitmap": ["tiddler", "class"],
  "$edit-text": ["tiddler", "field", "index", "default", "tag", "type", "placeholder", "focusPopup", "focus", "tabindex", "autocomplete", "cancelPopups", "inputActions", "refreshTitle", "disabled", "fileDrop", "rows", "minHeight", "size", "class"],
  "$element": ["tag", "attributes"],
  "$encrypt": ["filter"],
  "$eventcatcher": ["selector", "matchSelector", "stopPropagation", "tag", "class", "events"],  // DOM events added dynamically
  "$fieldmangler": ["tiddler"],
  "$fill": ["$name"],
  "$genesis": ["$type", "$tag", "$names", "$values", "$mode"],
  "$image": ["source", "width", "height", "tooltip", "alt", "loading", "usemap", "class"],
  "$importvariables": ["filter"],
  "$keyboard": ["key", "actions", "tag", "class"],
  "$let": [],
  "$link": ["to", "tooltip", "aria-label", "tabindex", "draggable", "tag", "overrideClass", "class"],
  "$linkcatcher": ["to", "message", "set", "setTo", "actions"],
  "$list": ["filter", "variable", "counter", "emptyMessage", "storyview", "history", "template", "editTemplate", "join"],
  "$log": ["$$filter", "$$message", "$$all"],
  "$macrocall": ["$name", "$type", "$output"],
  "$messagecatcher": ["type", "actions"],  // tm-* messages added dynamically
  "$navigator": ["story", "history", "openLinkFromInsideRiver", "openLinkFromOutsideRiver", "relinkOnRename"],
  "$password": ["name", "class"],
  "$qualify": ["name"],
  "$radio": ["tiddler", "field", "index", "value", "default", "disabled", "actions", "class"],
  "$range": ["tiddler", "field", "index", "min", "max", "increment", "default", "disabled", "actions", "actionsStart", "actionsStop", "class"],
  "$raw": [],
  "$reveal": ["type", "text", "state", "tag", "retain", "default", "popup", "popupAbsolute", "animate", "stateTitle", "stateIndex", "stateField", "class", "style"],
  "$scrollable": ["tag", "fallthrough", "class"],
  "$select": ["tiddler", "field", "index", "default", "multiple", "size", "actions", "class"],
  "$set": ["name", "value", "filter", "select", "tiddler", "field", "index", "emptyValue"],
  "$setvariable": ["name", "value", "filter", "select", "tiddler", "field", "index", "emptyValue"],
  "$slot": ["$name", "$depth"],
  "$text": ["text"],
  "$tiddler": ["tiddler"],
  "$transclude": ["$tiddler", "$field", "$index", "$subtiddler", "$mode", "$type", "$output", "$recursionMarker", "$variable", "$fillignore"],
  "$type": ["type", "text", "tiddler", "field", "index", "mode"],
  "$vars": [],
  "$view": ["tiddler", "field", "index", "format", "template", "subtiddler", "mode"],
  "$wikify": ["name", "text", "type", "mode", "output"]
}

/**
 * Widget completion source (<$widget)
 */
export function widgetCompletion(getWidgetNames?: () => string[], getSelfClosingWidgets?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const m = /<\$[\w\-\.]*$/.exec(state.sliceDoc(pos - 50, pos))
    if (!m) return null

    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      node = node.parent!
    }

    const seen = new Set<string>()
    const allWidgets: { name: string, detail: string }[] = []

    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)
    for (const name of localDefs.widgets) {
      if (!seen.has(name)) {
        seen.add(name)
        allWidgets.push({ name, detail: "widget (local)" })
      }
    }

    const customWidgets = getWidgetNames ? getWidgetNames() : []
    const globalWidgets = customWidgets.length > 0 ? customWidgets : coreWidgets
    for (const name of globalWidgets) {
      if (!seen.has(name)) {
        seen.add(name)
        const selfClose = isSelfClosing(name, getSelfClosingWidgets)
        allWidgets.push({ name, detail: selfClose ? "action" : "widget" })
      }
    }

    const patternLen = m[0].length
    const options: Completion[] = allWidgets.map(({ name, detail }) => {
      const selfClose = isSelfClosing(name, getSelfClosingWidgets)
      return {
        label: "<" + name,
        type: "keyword",
        detail,
        apply: (view, _completion, from, to) => {
          const widgetTag = "<" + name
          const textAfter = view.state.sliceDoc(to, to + 1)
          const hasClosingBracket = textAfter === ">"
          const endTo = hasClosingBracket ? to + 1 : to

          let insert: string
          let cursorOffset: number
          if (selfClose) {
            insert = widgetTag + " />"
            cursorOffset = widgetTag.length + 1  // After space, before />
          } else {
            const closingTag = "</" + name + ">"
            insert = widgetTag + " >" + closingTag
            cursorOffset = widgetTag.length + 1  // After space, before >
          }

          const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + cursorOffset },
            effects: triggerCompletionEffect.of(null)
          })
        }
      }
    })

    return {
      from: pos - m[0].length,
      to: pos,
      options,
      validFor: /^<\$[\w\-\.]*$/
    }
  }
}

/**
 * Widget attribute completion source
 *
 * Also handles style.property-name completion for widgets that support style attribute.
 */
/**
 * Check if we're inside an open widget tag (before the closing >)
 * Returns the widget name if found, null otherwise
 * Handles > inside quotes, macros, filters, and transclusions
 */
function findOpenWidgetTag(text: string): { name: string; start: number } | null {
  // Find the last < that could start a widget
  let lastWidgetStart = -1
  let widgetName = ""
  const widgetStartRe = /<\$([a-zA-Z][a-zA-Z0-9\-\.]*)/g
  let match
  while ((match = widgetStartRe.exec(text)) !== null) {
    lastWidgetStart = match.index
    widgetName = match[1]
  }

  if (lastWidgetStart === -1) return null

  // Now scan from after the widget name to see if the tag is still open
  const afterName = text.slice(lastWidgetStart + 2 + widgetName.length)
  let pos = 0
  const len = afterName.length

  while (pos < len) {
    const ch = afterName[pos]

    // Found closing > - tag is complete, not inside it
    if (ch === '>') {
      return null
    }
    // Found /> - self-closing, not inside it
    if (ch === '/' && afterName[pos + 1] === '>') {
      return null
    }

    // Skip triple-quoted strings
    if (ch === '"' && afterName[pos + 1] === '"' && afterName[pos + 2] === '"') {
      pos += 3
      while (pos < len && !(afterName[pos] === '"' && afterName[pos + 1] === '"' && afterName[pos + 2] === '"')) {
        pos++
      }
      pos += 3
      continue
    }

    // Skip quoted strings
    if (ch === '"' || ch === "'") {
      const quote = ch
      pos++
      while (pos < len && afterName[pos] !== quote) {
        if (afterName[pos] === '\\') pos++
        pos++
      }
      pos++
      continue
    }

    // Skip macro <<...>>
    if (ch === '<' && afterName[pos + 1] === '<') {
      pos += 2
      let depth = 1
      while (pos < len && depth > 0) {
        if (afterName[pos] === '<' && afterName[pos + 1] === '<') {
          depth++
          pos += 2
        } else if (afterName[pos] === '>' && afterName[pos + 1] === '>') {
          depth--
          pos += 2
        } else {
          pos++
        }
      }
      continue
    }

    // Skip filtered transclusion {{{...}}}
    if (ch === '{' && afterName[pos + 1] === '{' && afterName[pos + 2] === '{') {
      pos += 3
      while (pos < len && !(afterName[pos] === '}' && afterName[pos + 1] === '}' && afterName[pos + 2] === '}')) {
        pos++
      }
      pos += 3
      continue
    }

    // Skip transclusion {{...}}
    if (ch === '{' && afterName[pos + 1] === '{') {
      pos += 2
      while (pos < len && !(afterName[pos] === '}' && afterName[pos + 1] === '}')) {
        pos++
      }
      pos += 2
      continue
    }

    // Skip substituted strings `...` or ```...```
    if (ch === '`') {
      if (afterName.slice(pos, pos + 3) === '```') {
        pos += 3
        while (pos < len && afterName.slice(pos, pos + 3) !== '```') pos++
        pos += 3
      } else {
        pos++
        while (pos < len && afterName[pos] !== '`') pos++
        pos++
      }
      continue
    }

    // Handle bare < - use the same logic as findTagEnd
    if (ch === '<') {
      const nextCh = afterName[pos + 1]

      // </ starts a closing tag - we're incomplete but still inside the open tag
      if (nextCh === '/') {
        return { name: "$" + widgetName, start: lastWidgetStart }
      }

      // Check if this looks like a real tag start
      if (nextCh && /[a-zA-Z$]/.test(nextCh)) {
        let scanPos = pos + 2
        while (scanPos < len && /[a-zA-Z0-9\-_$.]/.test(afterName[scanPos])) {
          scanPos++
        }
        const afterWord = afterName[scanPos]

        if (afterWord === '>') {
          // <word> - weird attribute content, skip it
          pos = scanPos + 1
          continue
        }
        if (afterWord === '/' && afterName[scanPos + 1] === '>') {
          // <word/> - new self-closing tag, we're still inside the open tag
          return { name: "$" + widgetName, start: lastWidgetStart }
        }
        if (afterWord && (/\s/.test(afterWord) || afterWord === '=')) {
          // <word ... - new tag starting, we're still inside the open tag
          return { name: "$" + widgetName, start: lastWidgetStart }
        }
        pos = scanPos
        continue
      }
      pos++
      continue
    }

    pos++
  }

  // Reached end without finding closing > - we're inside the open tag
  return { name: "$" + widgetName, start: lastWidgetStart }
}

export function widgetAttributeCompletion(
  getMacroParams?: (name: string) => string[] | null,
  getWidgetAttributes?: (widgetName: string) => string[] | null,
  getCSSProperties?: () => string[] | null
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    const textBefore = state.sliceDoc(Math.max(0, pos - 500), pos)

    // Use the smarter detection that handles > inside attributes
    const widgetInfo = findOpenWidgetTag(textBefore)
    if (!widgetInfo) return null

    const widgetName = widgetInfo.name

    // Check if we're inside a quoted value
    const afterTag = textBefore.slice(widgetInfo.start)
    let inQuote = false
    let quoteChar = ''
    let filterDepth = 0
    let macroDepth = 0
    for (let i = 0; i < afterTag.length; i++) {
      const ch = afterTag[i]
      if (!inQuote) {
        if (ch === '"' || ch === "'") {
          inQuote = true
          quoteChar = ch
        } else if (ch === '{' && afterTag[i+1] === '{' && afterTag[i+2] === '{') {
          filterDepth++
          i += 2
        } else if (ch === '}' && afterTag[i+1] === '}' && afterTag[i+2] === '}') {
          filterDepth--
          i += 2
        } else if (ch === '<' && afterTag[i+1] === '<') {
          macroDepth++
          i += 1
        } else if (ch === '>' && afterTag[i+1] === '>') {
          macroDepth--
          i += 1
        }
      } else if (ch === quoteChar) {
        inQuote = false
      }
    }
    // Don't complete if inside a quoted string, filter, or macro
    if (inQuote || filterDepth > 0 || macroDepth > 0) return null

    // Match attribute names including style.property-name pattern
    // Also match when cursor is right after whitespace (no partial typed yet)
    const attrMatch = /\s([$a-zA-Z][a-zA-Z0-9\-\.]*)?$/.exec(textBefore)
    if (!attrMatch) return null

    const partial = attrMatch[1] || ""
    const from = pos - partial.length

    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      node = node.parent!
    }

    // Check for style.property-name pattern
    if (partial.startsWith("style.") && getCSSProperties) {
      // Get widget attributes to check if this widget supports style
      const dynamicAttrs = getWidgetAttributes ? getWidgetAttributes(widgetName) : null
      const fallbackAttrs = widgetAttributes[widgetName] || []
      const allAttrs = dynamicAttrs !== null ? dynamicAttrs : fallbackAttrs

      // Only complete style.property if widget supports style attribute
      if (!allAttrs.includes("style")) {
        return null
      }

      const cssProps = getCSSProperties()
      if (!cssProps || cssProps.length === 0) return null

      const propPartial = partial.slice(6) // Remove "style."
      const lowerPartial = propPartial.toLowerCase()
      const matchingProps = cssProps.filter(prop =>
        prop.toLowerCase().startsWith(lowerPartial)
      )

      if (matchingProps.length === 0) return null

      const options: Completion[] = matchingProps.map(prop => ({
        label: "style." + prop,
        type: "property",
        detail: "CSS property",
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasEquals = textAfter[0] === '='
          const hasQuoteAfterEquals = textAfter === '="'

          let insert: string
          let endTo = to
          let cursorPos: number
          const prefix = "style." + prop

          if (hasQuoteAfterEquals) {
            insert = prefix
            endTo = to + 2
            cursorPos = from + prefix.length + 2
          } else if (hasEquals) {
            insert = prefix + '="'
            endTo = to + 1
            cursorPos = from + prefix.length + 2
          } else {
            insert = prefix + '=""'
            cursorPos = from + prefix.length + 2
          }

          const changes = buildMultiSelectionChanges(view, from, endTo, insert, partial.length)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos },
            effects: triggerCompletionEffect.of(null)
          })
        }
      }))

      return {
        from,
        to: pos,
        options,
        validFor: /^style\.[a-zA-Z\-]*$/
      }
    }

    // First check local definitions for custom widgets
    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)

    // For custom widgets, check if defined locally first
    // Widget name comes as "$foo" but definitionParams stores as "$foo" for \widget $foo(...)
    const localWidgetParams = localDefs.definitionParams[widgetName]

    let allAttrs: string[]
    if (localWidgetParams && localWidgetParams.length > 0) {
      // Use local definition params
      allAttrs = [...localWidgetParams]
    } else {
      // Fall back to dynamic lookup or static list
      const dynamicAttrs = getWidgetAttributes ? getWidgetAttributes(widgetName) : null
      const fallbackAttrs = widgetAttributes[widgetName] || []
      allAttrs = dynamicAttrs !== null ? [...dynamicAttrs] : [...fallbackAttrs]
    }

    if (widgetName === "$macrocall" || widgetName === "$transclude") {
      const attrToMatch = widgetName === "$macrocall" ? "\\$name" : "\\$variable"
      const nameRegex = new RegExp(attrToMatch + "\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|<<([^>]+)>>)")
      const nameMatch = nameRegex.exec(afterTag)
      if (nameMatch) {
        const macroName = nameMatch[1] || nameMatch[2] || nameMatch[3]
        if (macroName) {
          const docText = state.doc.toString()
          const localDefs = extractLocalDefinitions(docText)
          let params: string[] | null = null

          if (localDefs.definitionParams[macroName]) {
            params = localDefs.definitionParams[macroName]
          } else if (getMacroParams) {
            params = getMacroParams(macroName)
          }

          if (params && params.length > 0) {
            const attrSet = new Set(allAttrs)
            for (const param of params) {
              if (!attrSet.has(param)) {
                allAttrs.push(param)
              }
            }
          }
        }
      }
    }

    // $messagecatcher: add all tm-* messages as $tm-* attributes
    // Uses cached messagesSet for the source list, creates attrSet once for dedup
    if (widgetName === "$messagecatcher") {
      const attrSet = new Set(allAttrs)
      const messagesSet = getMessagesSet()
      for (const msg of messagesSet) {
        const attrName = "$" + msg
        if (!attrSet.has(attrName)) {
          allAttrs.push(attrName)
        }
      }
    }

    // $eventcatcher: add all DOM events as $event attributes
    // Uses cached DOM_EVENTS_SET for the source list
    if (widgetName === "$eventcatcher") {
      const attrSet = new Set(allAttrs)
      for (const evt of DOM_EVENTS_SET) {
        const attrName = "$" + evt
        if (!attrSet.has(attrName)) {
          allAttrs.push(attrName)
        }
      }
    }

    const patternLen = partial.length

    const options: Completion[] = allAttrs.map(attr => ({
      label: attr,
      type: "property",
      detail: attr.startsWith("$") ? "widget attr" : "parameter",
      apply: (view, _completion, from, to) => {
        const textAfter = view.state.sliceDoc(to, to + 2)
        const hasEquals = textAfter[0] === '='
        const hasQuoteAfterEquals = textAfter === '="'

        let insert: string
        let endTo = to
        let cursorPos: number

        if (hasQuoteAfterEquals) {
          // attr=" already there, just insert attr name
          insert = attr
          endTo = to + 2
          cursorPos = from + attr.length + 2
        } else if (hasEquals) {
          // = already there, add attr and opening quote
          insert = attr + '="'
          endTo = to + 1
          cursorPos = from + attr.length + 2
        } else {
          // Nothing there, add full attr=""
          insert = attr + '=""'
          cursorPos = from + attr.length + 2
        }

        const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: cursorPos },
          effects: triggerCompletionEffect.of(null)
        })
      }
    }))

    return {
      from,
      to: pos,
      options,
      validFor: /^[$a-zA-Z][a-zA-Z0-9\-\.]*$/
    }
  }
}

/**
 * Closing tag completion source
 * Triggers on </ or </$ and offers the correct closing tag at the top
 */
export function closingTagCompletion(getWidgetNames?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 50), pos)

    // Check for </$ (widget closing) or </ (any closing)
    const widgetCloseMatch = /<\/\$[\w\-\.]*$/.exec(textBefore)
    const anyCloseMatch = /<\/[\w\-\.]*$/.exec(textBefore)

    if (!widgetCloseMatch && !anyCloseMatch) return null

    const isWidgetOnly = !!widgetCloseMatch
    const m = widgetCloseMatch || anyCloseMatch

    // Check we're not in a code block
    const tree = syntaxTree(state)
    const node = tree.resolveInner(pos, -1)
    let current = node
    while (current && !current.type.isTop) {
      if (current.name === "FencedCode" || current.name === "CodeBlock" ||
          current.name === "TypedBlock" || current.name === "CommentBlock" ||
          current.name === "KaTeXBlock" || current.name === "LaTeXContent") {
        return null
      }
      current = current.parent!
    }

    // Find the nearest unclosed tag by walking up the tree
    let expectedClosingTag: string | null = null
    current = node
    while (current && !current.type.isTop) {
      if (current.name === "Widget" || current.name === "InlineWidget") {
        // Find the widget name
        let child = current.firstChild
        while (child) {
          if (child.name === "WidgetName") {
            const widgetName = state.sliceDoc(child.from, child.to)
            // Check if this widget has a closing tag already
            const widgetText = state.sliceDoc(current.from, current.to)
            const hasClosingTag = new RegExp(`</${widgetName.replace(/\$/g, '\\$')}\\s*>`).test(widgetText)
            if (!hasClosingTag) {
              expectedClosingTag = widgetName
            }
            break
          }
          child = child.nextSibling
        }
        if (expectedClosingTag) break
      } else if (!isWidgetOnly && (current.name === "HtmlElement" || current.name === "InlineHtml")) {
        // Find the tag name
        let child = current.firstChild
        while (child) {
          if (child.name === "TagName") {
            const tagName = state.sliceDoc(child.from, child.to)
            // Check if this tag has a closing tag already
            const tagText = state.sliceDoc(current.from, current.to)
            const hasClosingTag = new RegExp(`</${tagName}\\s*>`).test(tagText)
            if (!hasClosingTag) {
              expectedClosingTag = tagName
            }
            break
          }
          child = child.nextSibling
        }
        if (expectedClosingTag) break
      }
      current = current.parent!
    }

    const options: Completion[] = []
    const seen = new Set<string>()

    // Add the expected closing tag at the top with high boost
    if (expectedClosingTag) {
      seen.add(expectedClosingTag)
      options.push({
        label: "</" + expectedClosingTag + ">",
        type: "keyword",
        detail: "close tag",
        boost: 100,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 1)
          const insert = "</" + expectedClosingTag + (textAfter === ">" ? "" : ">")
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length }
          })
        }
      })
    }

    // Add other widgets/tags as additional options
    if (isWidgetOnly) {
      // Only offer widgets for </$
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)

      const widgetNames = new Set<string>()
      if (getWidgetNames) {
        for (const name of getWidgetNames()) {
          widgetNames.add(name)
        }
      }
      for (const widget of coreWidgets) {
        widgetNames.add(widget)
      }
      for (const def of localDefs.widgets) {
        widgetNames.add("$" + def)
      }

      for (const name of widgetNames) {
        if (!seen.has(name)) {
          seen.add(name)
          options.push({
            label: "</" + name + ">",
            type: "type",
            detail: "widget",
            apply: (view, _completion, from, to) => {
              const textAfter = view.state.sliceDoc(to, to + 1)
              const insert = "</" + name + (textAfter === ">" ? "" : ">")
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length }
              })
            }
          })
        }
      }
    } else {
      // Offer both HTML tags and widgets for </
      // First add widgets
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)

      const widgetNames = new Set<string>()
      if (getWidgetNames) {
        for (const name of getWidgetNames()) {
          widgetNames.add(name)
        }
      }
      for (const widget of coreWidgets) {
        widgetNames.add(widget)
      }
      for (const def of localDefs.widgets) {
        widgetNames.add("$" + def)
      }

      for (const name of widgetNames) {
        if (!seen.has(name)) {
          seen.add(name)
          options.push({
            label: "</" + name + ">",
            type: "type",
            detail: "widget",
            apply: (view, _completion, from, to) => {
              const textAfter = view.state.sliceDoc(to, to + 1)
              const insert = "</" + name + (textAfter === ">" ? "" : ">")
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length }
              })
            }
          })
        }
      }

      // Then add common HTML tags
      for (const tag of commonHtmlTags) {
        if (!seen.has(tag)) {
          seen.add(tag)
          options.push({
            label: "</" + tag + ">",
            type: "keyword",
            detail: "html",
            apply: (view, _completion, from, to) => {
              const textAfter = view.state.sliceDoc(to, to + 1)
              const insert = "</" + tag + (textAfter === ">" ? "" : ">")
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length }
              })
            }
          })
        }
      }
    }

    if (options.length === 0) return null

    return {
      from: pos - m![0].length,
      to: pos,
      options,
      validFor: /^<\/\$?[\w\-\.]*$/
    }
  }
}
