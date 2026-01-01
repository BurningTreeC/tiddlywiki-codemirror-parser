/**
 * TiddlyWiki Language Support - Main Entry Point
 *
 * Provides the tiddlywiki() function that creates a complete LanguageSupport
 * for CodeMirror 6, similar to markdown() in @codemirror/lang-markdown.
 */

import { Prec, EditorState } from "@codemirror/state"
import { KeyBinding, keymap } from "@codemirror/view"
import { Language, LanguageSupport, LanguageDescription, syntaxTree } from "@codemirror/language"
import { Completion, CompletionContext, CompletionResult, autocompletion, completionKeymap } from "@codemirror/autocomplete"
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { html, htmlCompletionSource } from "@codemirror/lang-html"

import { TiddlyWikiParser } from "./parser"
import { TiddlyWikiConfig } from "./core"
import { tiddlywikiLanguage, mkLang, getCodeParser, headerIndent } from "./language"
import {
  insertNewlineContinueMarkup,
  deleteMarkupBackward,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  toggleSuperscript,
  toggleSubscript,
  toggleInlineCode,
  insertWikiLink,
  insertTransclusion,
  setHeading1,
  setHeading2,
  setHeading3,
  setHeading4,
  setHeading5,
  setHeading6,
  removeHeading,
  toggleBulletList,
  toggleNumberedList,
  insertCodeBlock
} from "../commands"

// Re-export core language
export { tiddlywikiLanguage, headerIndent }

/**
 * TiddlyWiki-specific highlight style mapping semantic tags to CSS classes
 */
export const tiddlywikiHighlightStyle = HighlightStyle.define([
  // Headings
  { tag: t.heading1, class: "cm-tw-heading1" },
  { tag: t.heading2, class: "cm-tw-heading2" },
  { tag: t.heading3, class: "cm-tw-heading3" },
  { tag: t.heading4, class: "cm-tw-heading4" },
  { tag: t.heading5, class: "cm-tw-heading5" },
  { tag: t.heading6, class: "cm-tw-heading6" },
  { tag: t.heading, class: "cm-tw-tableheader" },

  // Text formatting
  { tag: t.strong, class: "cm-tw-bold" },
  { tag: t.emphasis, class: "cm-tw-italic" },
  { tag: t.strikethrough, class: "cm-tw-strikethrough" },

  // Links
  { tag: t.link, class: "cm-tw-wikilink" },
  { tag: t.url, class: "cm-tw-url" },
  { tag: t.string, class: "cm-tw-linktext" },

  // Transclusions and macros
  { tag: t.special(t.link), class: "cm-tw-transclusion" },
  { tag: t.macroName, class: "cm-tw-macrocall" },
  { tag: t.variableName, class: "cm-tw-variable" },

  // Widgets
  { tag: t.tagName, class: "cm-tw-widget" },

  // Code
  { tag: t.monospace, class: "cm-tw-code" },
  { tag: t.labelName, class: "cm-tw-codeinfo" },

  // Pragmas and definitions
  { tag: t.definitionKeyword, class: "cm-tw-pragma" },
  { tag: t.keyword, class: "cm-tw-pragma-keyword" },

  // Lists
  { tag: t.list, class: "cm-tw-list" },

  // Block elements
  { tag: t.quote, class: "cm-tw-blockquote" },
  { tag: t.contentSeparator, class: "cm-tw-hr" },

  // Special characters
  { tag: t.comment, class: "cm-tw-comment" },
  { tag: t.escape, class: "cm-tw-escape" },
  { tag: t.character, class: "cm-tw-entity" },

  // Processing marks
  { tag: t.processingInstruction, class: "cm-tw-mark" },

  // Filters
  { tag: t.special(t.string), class: "cm-tw-filter" },

  // Attributes
  { tag: t.attributeValue, class: "cm-tw-attribute-value" },
  { tag: t.attributeName, class: "cm-tw-attribute" },

  // Special emphasis (underline)
  { tag: t.special(t.emphasis), class: "cm-tw-underline" },

  // Special content (superscript, subscript, highlight)
  { tag: t.special(t.content), class: "cm-tw-superscript" },
])

/**
 * Keymap with TiddlyWiki-specific bindings
 */
export const tiddlywikiKeymap: readonly KeyBinding[] = [
  {key: "Enter", run: insertNewlineContinueMarkup},
  {key: "Backspace", run: deleteMarkupBackward},
  {key: "Mod-b", run: toggleBold},
  {key: "Mod-i", run: toggleItalic},
  {key: "Mod-u", run: toggleUnderline},
  {key: "Mod-`", run: toggleInlineCode},
  {key: "Mod-k", run: insertWikiLink},
  {key: "Mod-Shift-k", run: insertTransclusion},
  {key: "Mod-1", run: setHeading1},
  {key: "Mod-2", run: setHeading2},
  {key: "Mod-3", run: setHeading3},
  {key: "Mod-4", run: setHeading4},
  {key: "Mod-5", run: setHeading5},
  {key: "Mod-6", run: setHeading6},
  {key: "Mod-0", run: removeHeading},
  {key: "Mod-Shift-8", run: toggleBulletList},
  {key: "Mod-Shift-7", run: toggleNumberedList},
  {key: "Mod-Shift-c", run: insertCodeBlock},
]

/**
 * HTML language support without tag matching (for embedded HTML)
 */
const htmlNoMatch = html({ matchClosingTags: false })

/**
 * Configuration options for TiddlyWiki language support
 */
export interface TiddlyWikiLanguageConfig {
  /**
   * Default language for code blocks without a language specifier
   */
  defaultCodeLanguage?: Language | LanguageSupport

  /**
   * Languages available for syntax highlighting in fenced code blocks.
   * Can be an array of LanguageDescriptions or a function that returns
   * a Language for a given info string.
   */
  codeLanguages?: readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null)

  /**
   * Whether to add the TiddlyWiki keymap (default: true)
   */
  addKeymap?: boolean

  /**
   * Parser extensions to add
   */
  extensions?: TiddlyWikiConfig

  /**
   * Base language to use (default: tiddlywikiLanguage)
   */
  base?: Language

  /**
   * Whether to enable HTML tag completion (default: true)
   */
  completeHTMLTags?: boolean

  /**
   * Whether to enable widget completion (default: true)
   */
  completeWidgets?: boolean

  /**
   * Whether to enable macro completion (default: true)
   */
  completeMacros?: boolean

  /**
   * Whether to enable tiddler title completion in links (default: true)
   */
  completeTiddlers?: boolean

  /**
   * Function to get tiddler titles for completion
   */
  getTiddlerTitles?: () => string[]

  /**
   * Function to get macro names for completion
   */
  getMacroNames?: () => string[]

  /**
   * Function to get widget names for completion
   */
  getWidgetNames?: () => string[]

  /**
   * Whether to enable filter operator completion (default: true)
   */
  completeFilterOperators?: boolean

  /**
   * Whether to enable filter run prefix completion (default: true)
   */
  completeFilterRunPrefixes?: boolean

  /**
   * Function to get filter operator names for completion
   */
  getFilterOperators?: () => string[]

  /**
   * Language support for HTML tags (default: html without tag matching)
   */
  htmlTagLanguage?: LanguageSupport
}

/**
 * Create TiddlyWiki language support for CodeMirror 6
 *
 * @example
 * ```ts
 * import { tiddlywiki } from "@anthropic/lang-tiddlywiki"
 * import { javascript } from "@codemirror/lang-javascript"
 *
 * const extensions = [
 *   tiddlywiki({
 *     codeLanguages: [javascript()],
 *     completeWidgets: true,
 *     completeMacros: true,
 *   })
 * ]
 * ```
 */
export function tiddlywiki(config: TiddlyWikiLanguageConfig = {}): LanguageSupport {
  const {
    codeLanguages,
    defaultCodeLanguage,
    addKeymap = true,
    base: { parser } = tiddlywikiLanguage,
    completeHTMLTags = true,
    completeWidgets = true,
    completeMacros = true,
    completeTiddlers = true,
    completeFilterOperators = true,
    completeFilterRunPrefixes = true,
    getTiddlerTitles,
    getMacroNames,
    getWidgetNames,
    getFilterOperators,
    htmlTagLanguage = htmlNoMatch,
  } = config

  // Validate parser
  if (!(parser instanceof TiddlyWikiParser)) {
    throw new RangeError("Base parser provided to `tiddlywiki` should be a TiddlyWiki parser")
  }

  // Build extensions for the parser
  const parserExtensions: TiddlyWikiConfig[] = config.extensions ? [config.extensions] : []

  // Build support extensions
  const support: any[] = [
    htmlTagLanguage.support,
    headerIndent,
    syntaxHighlighting(tiddlywikiHighlightStyle),
    // Enable autocompletion with activate on typing
    // Completion sources are registered via lang.data.of() and found via languageDataAt()
    autocompletion({
      activateOnTyping: true,
    }),
    keymap.of(completionKeymap),
  ]

  // Handle default code language
  let defaultCode: Language | undefined
  if (defaultCodeLanguage instanceof LanguageSupport) {
    support.push(defaultCodeLanguage.support)
    defaultCode = defaultCodeLanguage.language
  } else if (defaultCodeLanguage) {
    defaultCode = defaultCodeLanguage
  }

  // Add keymap if requested
  if (addKeymap && tiddlywikiKeymap.length > 0) {
    support.push(Prec.high(keymap.of(tiddlywikiKeymap)))
  }

  // Configure the parser with extensions
  let configuredParser = parser
  if (parserExtensions.length > 0) {
    for (const ext of parserExtensions) {
      configuredParser = configuredParser.configure(ext)
    }
  }

  // Create the language
  const lang = mkLang(configuredParser)

  // Add completions via language data
  if (completeWidgets) {
    support.push(lang.data.of({
      autocomplete: widgetCompletion(getWidgetNames)
    }))
  }

  if (completeMacros) {
    support.push(lang.data.of({
      autocomplete: macroCompletion(getMacroNames)
    }))
  }

  if (completeTiddlers) {
    support.push(lang.data.of({
      autocomplete: tiddlerCompletion(getTiddlerTitles)
    }))
  }

  if (completeHTMLTags) {
    support.push(lang.data.of({
      autocomplete: htmlTagCompletion
    }))
  }

  if (completeFilterOperators) {
    support.push(lang.data.of({
      autocomplete: filterOperatorCompletion(getFilterOperators)
    }))
  }

  if (completeFilterRunPrefixes) {
    support.push(lang.data.of({
      autocomplete: filterRunPrefixCompletion
    }))
  }

  return new LanguageSupport(lang, support)
}

// TiddlyWiki Core Widgets (with $ prefix as stored)
const coreWidgets = [
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

/**
 * Widget completion source (<$widget)
 */
function widgetCompletion(getWidgetNames?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const m = /<\$[\w\-]*$/.exec(state.sliceDoc(pos - 30, pos))
    if (!m) return null

    // Don't complete inside code blocks or comments
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock") {
        return null
      }
      node = node.parent!
    }

    // Use provided widget names, fall back to core widgets if empty
    const customWidgets = getWidgetNames ? getWidgetNames() : []
    const widgets = customWidgets.length > 0 ? customWidgets : coreWidgets
    const options: Completion[] = widgets.map(w => ({
      label: "<" + w,
      type: "keyword",
      detail: "widget",
      apply: "<" + w + ">"
    }))

    return {
      from: pos - m[0].length,
      to: pos,
      options,
      validFor: /^<\$[\w\-]*$/
    }
  }
}

// Common TiddlyWiki Macros
const commonMacros = [
  "now", "tag", "tabs", "timeline", "toc", "toc-hierarchical", "toc-selective-expandable",
  "list-links", "list-links-draggable", "list-tagged-draggable", "copy-to-clipboard",
  "colour-picker", "image-picker", "keyboard-shortcut", "dumpvariables", "qualify",
  "csvtiddlers", "jsontiddlers", "datauri", "makedatauri", "translink"
]

// TiddlyWiki Filter Operators
const coreFilterOperators = [
  // Selection constructors
  "all", "title", "field", "tag", "has", "is", "indexes", "fields", "tags", "links",
  "backlinks", "list", "listed", "tagging", "untagged",
  // String operators
  "prefix", "suffix", "contains", "match", "regexp", "search", "trim", "lowercase",
  "uppercase", "titlecase", "sentencecase", "splitbefore", "split", "join", "stringify",
  // Comparison
  "compare", "minlength", "maxlength",
  // List operators
  "first", "last", "nth", "limit", "rest", "butlast", "range", "sort", "nsort", "sortby",
  "nsortby", "reverse", "count", "unique", "duplicates", "allafter", "allbefore",
  "after", "before", "prepend", "append", "insertbefore", "move", "putafter",
  "putbefore", "putfirst", "putlast", "remove", "replace", "toggle", "cycle",
  // Math operators
  "add", "subtract", "multiply", "divide", "negate", "abs", "ceil", "floor", "round",
  "trunc", "sign", "min", "max", "average", "sum", "product", "log", "power", "sqrt",
  "exp", "fixed", "precision", "remainder", "random", "sin", "cos", "tan", "asin",
  "acos", "atan", "atan2",
  // Date operators
  "now", "format", "days", "weeks", "months", "years", "hours", "minutes", "seconds",
  "milliseconds", "adddays", "subtractdays", "year", "month", "day", "hour", "minute", "second",
  // Transclusion
  "get", "getindex", "getvariable", "lookup", "jsonget", "jsonindexes", "jsontype",
  "jsonextract", "jsonstringify",
  // Encoding
  "encodehtml", "decodehtml", "encodeuri", "encodeuricomponent", "decodeuri",
  "decodeuricomponent", "escaperegexp", "escapecss", "base64encode", "base64decode",
  // Others
  "each", "eachday", "filter", "reduce", "map", "subfilter", "else", "then",
  "variables", "modules", "plugintiddlers", "shadowsource", "storyviews", "editions",
  "lengths", "commands", "sha256hash", "md5hash", "encryptbase64", "decryptbase64",
  "draft.of", "draft.for", "draft", "draftof", "draftfor"
]

// Filter Run Prefixes (including named prefixes)
const filterRunPrefixes = [
  // Symbol prefixes
  { label: "+", detail: "intersection - filter the input (same as :and)" },
  { label: "-", detail: "subtraction - remove from results (same as :except)" },
  { label: "~", detail: "else - use if previous was empty (same as :else)" },
  { label: "=", detail: "literal - add title literally (same as :all)" },
  // Named equivalents of symbols
  { label: ":and", detail: "intersection - same as +" },
  { label: ":except", detail: "subtraction - same as -" },
  { label: ":else", detail: "else - same as ~" },
  { label: ":all", detail: "literal - same as =" },
  // Other named prefixes
  { label: ":filter", detail: "filter each title through subfilter" },
  { label: ":map", detail: "transform each title via subfilter" },
  { label: ":reduce", detail: "reduce to single value" },
  { label: ":intersection", detail: "keep titles common to all runs" },
  { label: ":cascade", detail: "cascade through filters" },
  { label: ":some", detail: "pass to any matching run" },
  { label: ":sort", detail: "sort by subfilter result" },
  { label: ":flat", detail: "flatten list output" },
]

/**
 * Macro completion source (<<macro)
 */
function macroCompletion(getMacroNames?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const m = /<<[\w\-]*$/.exec(state.sliceDoc(pos - 30, pos))
    if (!m) return null

    // Don't complete inside code blocks or comments
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock") {
        return null
      }
      node = node.parent!
    }

    // Use provided macro names, fall back to common macros if empty
    const customMacros = getMacroNames ? getMacroNames() : []
    const macros = customMacros.length > 0 ? customMacros : commonMacros
    const options: Completion[] = macros.map(m => ({
      label: "<<" + m,
      type: "function",
      detail: "macro",
      apply: "<<" + m + ">>"
    }))

    return {
      from: pos - m[0].length,
      to: pos,
      options,
      validFor: /^<<[\w\-]*$/
    }
  }
}

/**
 * Tiddler title completion source ([[link, {{transclusion, or [img[source)
 */
function tiddlerCompletion(getTiddlerTitles?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(pos - 100, pos)

    // Match [[ for links
    const linkMatch = /\[\[[^\]|]*$/.exec(textBefore)
    // Match {{ for transclusions
    const transcludeMatch = /\{\{[^{}|]*$/.exec(textBefore)
    // Match [img[ or [img ...attrs[ for images (source is inside the last [)
    const imageMatch = /\[img(?:\s+[^\[]*)?\[[^\]|]*$/.exec(textBefore)

    const match = linkMatch || transcludeMatch || imageMatch
    if (!match) return null

    // Don't complete inside code blocks or comments
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock") {
        return null
      }
      node = node.parent!
    }

    const titles = getTiddlerTitles ? getTiddlerTitles() : []
    if (titles.length === 0) return null

    // Determine prefix and suffix based on match type
    let prefix: string
    let suffix: string
    let validFor: RegExp

    if (linkMatch) {
      prefix = "[["
      suffix = "]]"
      validFor = /^\[\[[^\]|]*$/
    } else if (transcludeMatch) {
      prefix = "{{"
      suffix = "}}"
      validFor = /^\{\{[^{}|]*$/
    } else {
      // Image match - we need to find where the [ starts for the source
      const bracketPos = match[0].lastIndexOf('[')
      prefix = match[0].slice(0, bracketPos + 1)
      suffix = "]]"
      validFor = /^\[img(?:\s+[^\[]*)?\[[^\]|]*$/
    }

    const options: Completion[] = titles.map(title => ({
      label: prefix + title,
      type: "variable",
      detail: imageMatch ? "image" : "tiddler",
      apply: prefix + title + suffix
    }))

    return {
      from: pos - match[0].length,
      to: pos,
      options,
      validFor
    }
  }
}

// Cached HTML tag completions
let _tagCompletions: readonly Completion[] | null = null
function htmlTagCompletions(): readonly Completion[] {
  if (_tagCompletions) return _tagCompletions
  const result = htmlCompletionSource(
    new CompletionContext(EditorState.create({ extensions: htmlNoMatch }), 0, true)
  )
  return _tagCompletions = result ? result.options : []
}

/**
 * HTML tag completion source
 */
function htmlTagCompletion(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context
  const m = /<[:\-\.\w\u00b7-\uffff]*$/.exec(state.sliceDoc(pos - 25, pos))
  if (!m) return null

  // Don't complete if it looks like a widget
  if (m[0].startsWith("<$")) return null

  // Check we're not in a code block, widget, or other non-completable context
  const tree = syntaxTree(state).resolveInner(pos, -1)
  let node = tree
  while (node && !node.type.isTop) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" ||
        node.name === "TypedBlock" || node.name === "CommentBlock" ||
        node.name === "Widget") {
      return null
    }
    node = node.parent!
  }

  return {
    from: pos - m[0].length,
    to: pos,
    options: htmlTagCompletions(),
    validFor: /^<[:\-\.\w\u00b7-\uffff]*$/
  }
}

/**
 * Filter operator completion source (inside [...])
 * Triggers when typing inside filter brackets, e.g., [tag or [has[
 */
function filterOperatorCompletion(getFilterOperators?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    // Look for filter operator context: after [ and optional ! or other prefix
    // Match patterns like: [tag, [!has, [tag[value]tag, etc.
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    // Check if we're inside a filter expression (inside brackets [])
    // and after a position where an operator would go
    const filterOperatorMatch = /\[(!?)(\w*)$/.exec(textBefore)
    if (!filterOperatorMatch) {
      // Also match after a closing bracket of a previous operator: [tag[value]op
      const chainedMatch = /\][:\w]*(\w+)$/.exec(textBefore)
      if (!chainedMatch) return null

      // For chained operators, use the partial match
      const partial = chainedMatch[1]
      return createFilterOperatorResult(context, partial, partial.length, getFilterOperators)
    }

    // Check we're in a filter context (inside FilterExpression, FilteredTransclusion, etc.)
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    let inFilter = false
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock") {
        return null
      }
      if (node.name === "FilterExpression" || node.name === "FilteredTransclusion" ||
          node.name === "FilteredTransclusionBlock" || node.name === "AttributeFiltered" ||
          node.name === "ConditionalBlock") {
        inFilter = true
      }
      node = node.parent!
    }

    // Also check text patterns for filter context
    const hasFilterContext = inFilter ||
                             /\{\{\{[^}]*$/.test(textBefore) ||  // {{{ filtered transclusion
                             /<%(?:if|elseif)\s+[^%]*$/.test(textBefore) ||  // <%if filter%>
                             /filter\s*=\s*["'][^"']*$/.test(textBefore)  // filter="..."

    if (!hasFilterContext) return null

    const prefix = filterOperatorMatch[1]  // ! or empty
    const partial = filterOperatorMatch[2] // partial operator name

    return createFilterOperatorResult(context, partial, partial.length + prefix.length + 1, getFilterOperators)
  }
}

function createFilterOperatorResult(
  context: CompletionContext,
  partial: string,
  matchLength: number,
  getFilterOperators?: () => string[]
): CompletionResult {
  const { pos } = context

  // Use provided operators, fall back to core operators if empty
  const customOperators = getFilterOperators ? getFilterOperators() : []
  const operators = customOperators.length > 0 ? customOperators : coreFilterOperators

  const options: Completion[] = operators.map(op => ({
    label: op,
    type: "function",
    detail: "filter operator",
    apply: op + "["
  }))

  return {
    from: pos - partial.length,
    to: pos,
    options,
    validFor: /^\w*$/
  }
}

/**
 * Filter run prefix completion source
 * Triggers at the start of filter runs (after space or at start of filter)
 */
function filterRunPrefixCompletion(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context

  const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

  // Match at start of a filter run: after {{{ or after space/newline in filter
  // Patterns: {{{ :, {{{ +, or after ] followed by space then prefix
  const runPrefixMatch = /(?:\{\{\{|[\]\s])\s*([:+\-~=][\w]*)$/.exec(textBefore)
  if (!runPrefixMatch) return null

  // Check we're in a filter context
  const tree = syntaxTree(state).resolveInner(pos, -1)
  let node = tree
  let inFilter = false
  while (node && !node.type.isTop) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" ||
        node.name === "TypedBlock" || node.name === "CommentBlock") {
      return null
    }
    if (node.name === "FilterExpression" || node.name === "FilteredTransclusion" ||
        node.name === "FilteredTransclusionBlock" || node.name === "AttributeFiltered" ||
        node.name === "ConditionalBlock") {
      inFilter = true
    }
    node = node.parent!
  }

  // Also check text patterns for filter context
  const hasFilterContext = inFilter ||
                           /\{\{\{[^}]*$/.test(textBefore) ||  // {{{ filtered transclusion
                           /<%(?:if|elseif)\s+[^%]*$/.test(textBefore) ||  // <%if filter%>
                           /filter\s*=\s*["'][^"']*$/.test(textBefore)  // filter="..."

  if (!hasFilterContext) return null

  const partial = runPrefixMatch[1]

  const options: Completion[] = filterRunPrefixes.map(p => ({
    label: p.label,
    type: "keyword",
    detail: p.detail,
    apply: p.label + (p.label.startsWith(":") ? "[" : "")
  }))

  return {
    from: pos - partial.length,
    to: pos,
    options,
    validFor: /^[:+\-~=][\w]*$/
  }
}
