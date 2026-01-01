/**
 * TiddlyWiki Language Support - Main Entry Point
 *
 * Provides the tiddlywiki() function that creates a complete LanguageSupport
 * for CodeMirror 6, similar to markdown() in @codemirror/lang-markdown.
 */

import { Prec, EditorState } from "@codemirror/state"
import { KeyBinding, keymap } from "@codemirror/view"
import { Language, LanguageSupport, LanguageDescription, syntaxTree, ParseContext, indentOnInput } from "@codemirror/language"
import { Completion, CompletionContext, CompletionResult, autocompletion, completionKeymap } from "@codemirror/autocomplete"
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { html, htmlCompletionSource } from "@codemirror/lang-html"
import { parseMixed, SyntaxNodeRef, Input } from "@lezer/common"

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
  { tag: t.controlKeyword, class: "cm-tw-conditional" },

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
   * Function to get macro/procedure/function parameters for completion.
   * Returns array of parameter names, or null if macro not found.
   */
  getMacroParams?: (macroName: string) => string[] | null

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

// ============================================================================
// Mixed Language Parsing Support
// ============================================================================

/**
 * Map MIME types to language names for typed blocks
 */
function mimeToLanguage(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    "text/javascript": "javascript",
    "application/javascript": "javascript",
    "text/typescript": "typescript",
    "application/typescript": "typescript",
    "text/css": "css",
    "text/html": "html",
    "application/json": "json",
    "text/x-markdown": "markdown",
    "text/x-tiddlywiki": "",
    "text/vnd.tiddlywiki": "",
    "text/plain": "",
  }
  // Try direct lookup, then strip common prefixes
  return mimeMap[mimeType] ??
    mimeType.replace(/^text\/x-/, "").replace(/^application\//, "").replace(/^text\//, "")
}

/**
 * Create a mixed language parsing wrapper for nested languages in code blocks
 */
function createMixedLanguageWrapper(
  codeLanguages: readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null) | undefined,
  defaultCodeLanguage: Language | undefined
) {
  const getParser = getCodeParser(codeLanguages, defaultCodeLanguage)

  return parseMixed((node: SyntaxNodeRef, input: Input) => {
    // CODE BLOCKS: Full replacement parsing for CodeText
    if (node.name === "CodeText") {
      const parent = node.node.parent

      // Fenced code block: ```language
      if (parent?.name === "FencedCode") {
        const codeInfo = parent.getChild("CodeInfo")
        const lang = codeInfo ? input.read(codeInfo.from, codeInfo.to) : ""
        const parser = getParser(lang)
        if (parser) {
          return { parser }
        }
      }

      // Typed block: $$$type
      if (parent?.name === "TypedBlock") {
        const typeNode = parent.getChild("TypedBlockType")
        const typeName = typeNode ? input.read(typeNode.from, typeNode.to) : ""
        const langName = mimeToLanguage(typeName)
        if (langName) {
          const parser = getParser(langName)
          if (parser) {
            return { parser }
          }
        }
      }
    }

    // NOTE: We intentionally do NOT apply HTML overlay parsing to HTMLBlock/HTMLTag.
    // The TiddlyWiki parser already creates proper nodes (TagName, TagMark, AttributeName, etc.)
    // with correct styling via styleTags. HTML overlay parsing was broken because:
    // 1. getHtmlTagOverlayRanges provided discontinuous fragments to the HTML parser
    // 2. The HTML parser couldn't make sense of fragments like just "div" or "class=''"
    // 3. This resulted in no useful nodes, breaking TiddlyWiki's styling
    // HTML completions work via custom completion sources (htmlTagCompletion,
    // htmlAttributeCompletion) that analyze text context, not the parse tree.

    return null
  })
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
    getMacroParams,
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
    // Enable re-indentation when typing (pattern provided via language data below)
    indentOnInput(),
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

  // Add mixed language parsing for code blocks
  if (codeLanguages || defaultCode) {
    const wrap = createMixedLanguageWrapper(
      codeLanguages,
      defaultCode
    )
    parserExtensions.push({ wrap })
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

  // Add indentOnInput pattern for auto-outdenting when typing closing patterns
  // Matches: </tag>, </$widget>, <%else%>, <%elseif...%>, <%endif%>, \end
  support.push(lang.data.of({
    indentOnInput: /^\s*(<\/[a-zA-Z$][^>]*>|<%\s*(else|elseif|endif)[^%]*%>|\\end\s*)$/
  }))

  // Add completions via language data
  if (completeWidgets) {
    support.push(lang.data.of({
      autocomplete: widgetCompletion(getWidgetNames)
    }))
    support.push(lang.data.of({
      autocomplete: widgetAttributeCompletion
    }))
  }

  if (completeMacros) {
    support.push(lang.data.of({
      autocomplete: macroCompletion(getMacroNames)
    }))
    // Add macro parameter completion if getMacroParams is provided
    if (getMacroParams) {
      support.push(lang.data.of({
        autocomplete: macroParamCompletion(getMacroParams)
      }))
    }
  }

  if (completeTiddlers) {
    support.push(lang.data.of({
      autocomplete: tiddlerCompletion(getTiddlerTitles)
    }))
  }

  if (completeHTMLTags) {
    // Use our custom tag completion for <tagname
    support.push(lang.data.of({
      autocomplete: htmlTagCompletion
    }))
    // Use our custom attribute completion for tag attributes
    support.push(lang.data.of({
      autocomplete: htmlAttributeCompletion
    }))
    // Also try the native HTML completion source (works if mixed parsing is active)
    support.push(lang.data.of({
      autocomplete: htmlCompletionSource
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

  // Always add conditional keyword completion (<%if, <%else, etc.)
  support.push(lang.data.of({
    autocomplete: conditionalCompletion
  }))

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

// Common widget attributes (shared by many widgets)
const commonWidgetAttributes = ["class", "style"]

// Widget-specific attributes
const widgetAttributes: Record<string, string[]> = {
  "$action-confirm": ["$message", "$prompt"],
  "$action-createtiddler": ["$basetitle", "$savetitle", "$saveoriginal", "$template", "$overwrite"],
  "$action-deletefield": ["$tiddler", "$field"],
  "$action-deletetiddler": ["$tiddler", "$filter"],
  "$action-listops": ["$tiddler", "$field", "$index", "$filter", "$subfilter", "$tags"],
  "$action-log": ["$$filter", "$$message", "$$all"],
  "$action-navigate": ["$to", "$scroll"],
  "$action-popup": ["$state", "$coords", "$floating", "$absolute"],
  "$action-sendmessage": ["$message", "$param", "$name", "$value"],
  "$action-setfield": ["$tiddler", "$field", "$index", "$value", "$timestamp"],
  "$action-setmultiplefields": ["$tiddler", "$fields", "$values", "$indexes"],
  "$browse": ["multiple", "accept", "message", "param", "tooltip", "deserializer"],
  "$button": ["message", "param", "set", "setTo", "actions", "to", "tooltip", "aria-label", "popup", "popupAbsolute", "hoverpopup", "selectedClass", "default", "disabled", "tag", "dragTiddler", "dragFilter"],
  "$checkbox": ["tiddler", "field", "index", "tag", "invertTag", "checked", "unchecked", "default", "indeterminate", "disabled", "actions", "uncheckactions", "checkactions"],
  "$codeblock": ["code", "language"],
  "$count": ["filter"],
  "$draggable": ["tiddler", "filter", "tag", "enable", "startactions", "endactions"],
  "$droppable": ["actions", "effect", "tag", "enable", "disabledClass"],
  "$dropzone": ["deserializer", "enable", "autoOpenOnImport", "importTitle", "actions", "contentTypesFilter", "filesOnly"],
  "$edit": ["tiddler", "field", "index", "default", "placeholder", "tabindex", "focus", "cancelPopups", "inputActions", "refreshTitle", "autocomplete"],
  "$edit-bitmap": ["tiddler"],
  "$edit-text": ["tiddler", "field", "index", "default", "tag", "type", "placeholder", "focusPopup", "focus", "tabindex", "autocomplete", "cancelPopups", "inputActions", "refreshTitle", "disabled", "fileDrop", "rows", "minHeight", "size"],
  "$element": ["tag", "attributes"],
  "$encrypt": ["filter"],
  "$eventcatcher": ["type", "actions", "tag", "events"],
  "$fieldmangler": ["tiddler"],
  "$fill": ["name"],
  "$genesis": ["$type", "$tag", "$names", "$values"],
  "$image": ["source", "width", "height", "tooltip", "alt", "loading", "usemap"],
  "$importvariables": ["filter"],
  "$keyboard": ["key", "actions", "tag"],
  "$let": [],  // Dynamic attributes
  "$link": ["to", "tooltip", "aria-label", "tabindex", "draggable", "tag", "overrideClass"],
  "$linkcatcher": ["to", "message", "set", "setTo", "actions"],
  "$list": ["filter", "variable", "counter", "emptyMessage", "storyview", "history", "template", "editTemplate", "join"],
  "$log": ["$$filter", "$$message", "$$all"],
  "$macrocall": ["$name", "$type", "$output"],  // Plus dynamic params
  "$messagecatcher": ["$message", "$count", "actions"],
  "$navigator": ["story", "history", "openLinkFromInsideRiver", "openLinkFromOutsideRiver", "relinkOnRename"],
  "$password": ["name"],
  "$qualify": ["name"],
  "$radio": ["tiddler", "field", "index", "value", "default", "disabled", "actions"],
  "$range": ["tiddler", "field", "index", "min", "max", "increment", "default", "disabled", "actions", "actionsStart", "actionsStop"],
  "$raw": [],
  "$reveal": ["type", "text", "state", "tag", "retain", "default", "popup", "popupAbsolute", "animate", "stateTitle", "stateIndex", "stateField"],
  "$scrollable": ["tag", "fallthrough"],
  "$select": ["tiddler", "field", "index", "default", "multiple", "size", "actions"],
  "$set": ["name", "value", "filter", "select", "tiddler", "field", "index", "emptyValue"],
  "$setvariable": ["name", "value", "filter", "select", "tiddler", "field", "index", "emptyValue"],
  "$slot": ["$name", "$depth"],
  "$text": ["text"],
  "$tiddler": ["tiddler"],
  "$transclude": ["$tiddler", "$field", "$index", "$subtiddler", "$mode", "$type", "$output", "$recursionMarker", "$variable", "$fillignore"],
  "$type": ["type", "text", "tiddler", "field", "index", "mode"],
  "$vars": [],  // Dynamic attributes
  "$view": ["tiddler", "field", "index", "format", "template", "subtiddler", "mode"],
  "$wikify": ["name", "text", "type", "mode", "output"],
}

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

/**
 * Widget attribute completion source
 * Triggers when cursor is inside a widget tag after the widget name
 */
function widgetAttributeCompletion(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context

  // Look back to find if we're inside a widget tag
  const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

  // Match: <$widgetname followed by attributes
  const tagMatch = /<\$([a-zA-Z][a-zA-Z0-9\-]*)\s+[^>]*$/.exec(textBefore)
  if (!tagMatch) return null

  const widgetName = "$" + tagMatch[1]

  // Check we're not inside a quoted attribute value
  const afterTag = textBefore.slice(textBefore.lastIndexOf('<'))
  let inQuote = false
  let quoteChar = ''
  for (const ch of afterTag) {
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true
      quoteChar = ch
    } else if (inQuote && ch === quoteChar) {
      inQuote = false
    }
  }
  if (inQuote) return null

  // Find what we're completing (partial attribute name)
  const attrMatch = /\s([$a-zA-Z\-]*)$/.exec(textBefore)
  if (!attrMatch) return null

  const partial = attrMatch[1]
  const from = pos - partial.length

  // Check we're not in a code block or comment
  const tree = syntaxTree(state).resolveInner(pos, -1)
  let node = tree
  while (node && !node.type.isTop) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" ||
        node.name === "TypedBlock" || node.name === "CommentBlock") {
      return null
    }
    node = node.parent!
  }

  // Collect attributes for this widget
  const widgetSpecific = widgetAttributes[widgetName] || []
  const allAttrs = [...new Set([...widgetSpecific, ...commonWidgetAttributes])]

  const options: Completion[] = allAttrs.map(attr => ({
    label: attr,
    type: "property",
    detail: "widget attr",
    apply: attr + '="'
  }))

  return {
    from,
    to: pos,
    options,
    validFor: /^[$a-zA-Z\-]*$/
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
 * Macro completion source (<<macro or [<variable> or [operator<variable> in filters)
 */
function macroCompletion(getMacroNames?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(pos - 50, pos)

    // Match <<macro for regular macro calls
    const macroMatch = /<<[\w\-]*$/.exec(textBefore)
    // Match [<variable or [operator<variable or ]operator<variable or }operator<variable or >operator<variable
    const filterVarMatch = /[\[\]}>][\w\-:!]*<[\w\-]*$/.exec(textBefore)

    const m = macroMatch || filterVarMatch
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

    if (filterVarMatch) {
      // Variable reference in filter: [<variable>] or [operator<variable>] or ]operator<variable>]
      const prefix = m[0].slice(0, m[0].lastIndexOf('<') + 1)
      const options: Completion[] = macros.map(name => ({
        label: prefix + name,
        type: "function",
        detail: "variable",
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          // Don't add ] if there's already a ] after cursor
          const suffix = textAfter.startsWith(">")
            ? (textAfter[1] === "]" ? "" : "]")
            : (textAfter.startsWith("]") ? ">" : ">]")
          view.dispatch({
            changes: { from, to, insert: prefix + name + suffix },
            selection: { anchor: from + prefix.length + name.length + suffix.length }
          })
        }
      }))

      return {
        from: pos - filterVarMatch[0].length,
        to: pos,
        options,
        validFor: /^[\[\]}>][\w\-:!]*<[\w\-]*$/
      }
    }

    // Regular macro call
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
 * Macro parameter completion source
 * Triggers when inside a macro call after the macro name: <<macroName param
 * Also handles <$macrocall $name="macroName" param
 */
function macroParamCompletion(getMacroParams?: (name: string) => string[] | null) {
  return (context: CompletionContext): CompletionResult | null => {
    if (!getMacroParams) return null

    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    // Match <<macroName followed by params (not at the start of macro name)
    const macroCallMatch = /<<([\w\-\.]+)\s+[^>]*$/.exec(textBefore)
    // Match <$macrocall $name="macroName" or $name=<<macro>> followed by params
    const macrocallWidgetMatch = /<\$macrocall\s+[^>]*\$name=(?:"([^"]+)"|'([^']+)'|<<([^>]+)>>)[^>]*$/.exec(textBefore)

    let macroName: string | null = null

    if (macroCallMatch) {
      macroName = macroCallMatch[1]
    } else if (macrocallWidgetMatch) {
      macroName = macrocallWidgetMatch[1] || macrocallWidgetMatch[2] || macrocallWidgetMatch[3]
    }

    if (!macroName) return null

    // Check we're not inside a quoted value
    const afterMacro = macroCallMatch
      ? textBefore.slice(textBefore.lastIndexOf('<<'))
      : textBefore.slice(textBefore.lastIndexOf('<$macrocall'))
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
    if (inQuote) return null

    // Find what we're completing (partial param name)
    const paramMatch = /\s([$\w\-]*)$/.exec(textBefore)
    if (!paramMatch) return null

    const partial = paramMatch[1]
    const from = pos - partial.length

    // Check we're not in a code block or comment
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock") {
        return null
      }
      node = node.parent!
    }

    // Get parameters for this macro
    const params = getMacroParams(macroName)
    if (!params || params.length === 0) return null

    const options: Completion[] = params.map(param => ({
      label: param,
      type: "property",
      detail: "parameter",
      apply: param + ":"
    }))

    return {
      from,
      to: pos,
      options,
      validFor: /^[$\w\-]*$/
    }
  }
}

/**
 * Tiddler title completion source ([[link, {{transclusion, [img[source, or filter operands)
 * Also handles filter operand contexts like [tag[, [has[, [{, [operator{, etc.
 */
function tiddlerCompletion(getTiddlerTitles?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(pos - 100, pos)

    // Match [[ for links (also works inside filters for literal titles)
    const linkMatch = /\[\[[^\]|]*$/.exec(textBefore)
    // Match {{ for transclusions
    const transcludeMatch = /\{\{[^{}|]*$/.exec(textBefore)
    // Match [img[ or [img ...attrs[ for images (source is inside the last [)
    const imageMatch = /\[img(?:\s+[^\[]*)?\[[^\]|]*$/.exec(textBefore)
    // Match [operator[ or ]operator[ or }operator[ or >operator[ for filter operand (tiddler title)
    const filterOperandMatch = /[\[\]}>][\w\-:!]*\[[^\]]*$/.exec(textBefore)
    // Match [{ or [operator{ or ]operator{ or }operator{ or >operator{ for text references inside filters
    const filterTextRefMatch = /[\[\]}>][\w\-:!]*\{[^}]*$/.exec(textBefore)

    const match = linkMatch || transcludeMatch || imageMatch || filterOperandMatch || filterTextRefMatch
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
    let detail: string

    if (filterTextRefMatch) {
      // Text reference inside filter: [operator{tiddler}] or [{tiddler}] or ]operator{tiddler}] or }operator{tiddler}]
      prefix = match[0].slice(0, match[0].lastIndexOf('{') + 1)
      validFor = /^[\[\]}>][\w\-:!]*\{[^}]*$/
      detail = "text reference"

      // Use dynamic apply to check for existing closing brackets
      const options: Completion[] = titles.map(title => ({
        label: prefix + title,
        type: "variable",
        detail,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          // Don't add ] if there's already a ] after the }
          const closeSuffix = textAfter.startsWith("}")
            ? (textAfter[1] === "]" ? "" : "]")
            : (textAfter.startsWith("]") ? "}" : "}]")
          view.dispatch({
            changes: { from, to, insert: prefix + title + closeSuffix },
            selection: { anchor: from + prefix.length + title.length + closeSuffix.length }
          })
        }
      }))

      return {
        from: pos - match[0].length,
        to: pos,
        options,
        validFor
      }
    } else if (filterOperandMatch) {
      // Filter operand: [operator[value]] or [[value]] or ]operator[value]] or }operator[value]] or >operator[value]]
      prefix = match[0].slice(0, match[0].lastIndexOf('[') + 1)
      validFor = /^[\[\]}>][\w\-:!]*\[[^\]]*$/
      detail = "filter operand"

      // Use dynamic apply to check for existing closing brackets
      const options: Completion[] = titles.map(title => ({
        label: prefix + title,
        type: "variable",
        detail,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          // Don't add ]] if there are already ]] after cursor
          let closeSuffix = "]]"
          if (textAfter === "]]") {
            closeSuffix = ""
          } else if (textAfter.startsWith("]")) {
            closeSuffix = "]"
          }
          view.dispatch({
            changes: { from, to, insert: prefix + title + closeSuffix },
            selection: { anchor: from + prefix.length + title.length + closeSuffix.length }
          })
        }
      }))

      return {
        from: pos - match[0].length,
        to: pos,
        options,
        validFor
      }
    } else if (linkMatch) {
      prefix = "[["
      suffix = "]]"
      validFor = /^\[\[[^\]|]*$/
      detail = "tiddler"
    } else if (transcludeMatch) {
      prefix = "{{"
      suffix = "}}"
      validFor = /^\{\{[^{}|]*$/
      detail = "tiddler"
    } else {
      // Image match - we need to find where the [ starts for the source
      const bracketPos = match[0].lastIndexOf('[')
      prefix = match[0].slice(0, bracketPos + 1)
      suffix = "]]"
      validFor = /^\[img(?:\s+[^\[]*)?\[[^\]|]*$/
      detail = "image"
    }

    const options: Completion[] = titles.map(title => ({
      label: prefix + title,
      type: "variable",
      detail,
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
        node.name === "TypedBlock" || node.name === "CommentBlock") {
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

// Common HTML global attributes
const htmlGlobalAttributes = [
  "class", "id", "style", "title", "lang", "dir", "hidden", "tabindex",
  "accesskey", "contenteditable", "draggable", "spellcheck", "translate",
  "data-", "aria-", "role"
]

// Tag-specific attributes
const htmlTagAttributes: Record<string, string[]> = {
  a: ["href", "target", "rel", "download", "hreflang", "type"],
  img: ["src", "alt", "width", "height", "loading", "srcset", "sizes"],
  input: ["type", "name", "value", "placeholder", "required", "disabled", "readonly", "checked", "maxlength", "minlength", "pattern", "min", "max", "step"],
  button: ["type", "disabled", "name", "value", "form"],
  form: ["action", "method", "enctype", "target", "autocomplete", "novalidate"],
  label: ["for"],
  select: ["name", "multiple", "required", "disabled", "size"],
  option: ["value", "selected", "disabled"],
  textarea: ["name", "rows", "cols", "placeholder", "required", "disabled", "readonly", "maxlength", "minlength"],
  link: ["href", "rel", "type", "media"],
  script: ["src", "type", "async", "defer", "crossorigin"],
  meta: ["name", "content", "charset", "http-equiv"],
  iframe: ["src", "width", "height", "frameborder", "allowfullscreen", "sandbox"],
  video: ["src", "width", "height", "controls", "autoplay", "loop", "muted", "poster", "preload"],
  audio: ["src", "controls", "autoplay", "loop", "muted", "preload"],
  source: ["src", "type", "media", "srcset", "sizes"],
  table: ["border", "cellpadding", "cellspacing"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "headers", "scope"],
  div: [],
  span: [],
  p: [],
}

/**
 * HTML attribute completion source
 * Triggers when cursor is inside an HTML tag after the tag name
 */
function htmlAttributeCompletion(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context

  // Look back to find if we're inside an HTML tag
  const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

  // Match: <tagname followed by attributes, cursor after space or attribute
  // Pattern: <tagname ...attrs... cursor (not after < which would be tag completion)
  const tagMatch = /<([a-zA-Z][a-zA-Z0-9]*)\s+[^>]*$/.exec(textBefore)
  if (!tagMatch) return null

  // Check the character before the < to make sure it's not a macro (<<)
  const matchStart = textBefore.length - tagMatch[0].length
  if (matchStart > 0 && textBefore[matchStart - 1] === '<') {
    return null  // This is a macro <<name, not an HTML tag
  }

  const tagName = tagMatch[1].toLowerCase()

  // Don't complete for widgets
  if (tagName.startsWith("$")) return null

  // Check we're not inside a quoted attribute value
  const afterTag = textBefore.slice(textBefore.lastIndexOf('<'))
  let inQuote = false
  let quoteChar = ''
  for (const ch of afterTag) {
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true
      quoteChar = ch
    } else if (inQuote && ch === quoteChar) {
      inQuote = false
    }
  }
  if (inQuote) return null

  // Find what we're completing (partial attribute name)
  const attrMatch = /\s([a-zA-Z\-]*)$/.exec(textBefore)
  if (!attrMatch) return null

  const partial = attrMatch[1]
  const from = pos - partial.length

  // Check we're not in a code block or comment
  const tree = syntaxTree(state).resolveInner(pos, -1)
  let node = tree
  while (node && !node.type.isTop) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" ||
        node.name === "TypedBlock" || node.name === "CommentBlock") {
      return null
    }
    node = node.parent!
  }

  // Collect attributes for this tag
  const tagSpecific = htmlTagAttributes[tagName] || []
  const allAttrs = [...new Set([...tagSpecific, ...htmlGlobalAttributes])]

  const options: Completion[] = allAttrs.map(attr => ({
    label: attr,
    type: "property",
    apply: attr.endsWith("-") ? attr : attr + '="'
  }))

  return {
    from,
    to: pos,
    options,
    validFor: /^[a-zA-Z\-]*$/
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

    // Don't complete operators inside filter operand contexts:
    // - [operator[ or ]operator[ or }operator[ or >operator[ for literal tiddler titles
    // - [operator{ or ]operator{ or }operator{ or >operator{ for text references
    // - [operator< or ]operator< or }operator< or >operator< for variable references
    // These patterns match after [, ], }, or > (previous operand closers)
    if (/[\[\]}>][\w\-:!]*\[[^\]]*$/.test(textBefore) ||
        /[\[\]}>][\w\-:!]*\{[^}]*$/.test(textBefore) ||
        /[\[\]}>][\w\-:!]*<[^>]*$/.test(textBefore)) {
      return null
    }

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

// ============================================================================
// Conditional Keyword Completion (<%if, <%else, <%elseif, <%endif)
// ============================================================================

const conditionalKeywords = [
  { label: "if", detail: "Conditional if", insert: "if [] %>" },
  { label: "elseif", detail: "Conditional else-if", insert: "elseif [] %>" },
  { label: "else", detail: "Conditional else", insert: " else %>" },
  { label: "endif", detail: "End conditional", insert: " endif %>" },
]

/**
 * Conditional keyword completion source (after <%)
 */
function conditionalCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  // Get text before cursor on current line
  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  // Match <% followed by optional whitespace and partial keyword
  const match = /<%(\s*)(\w*)$/.exec(textBefore)
  if (!match) return null

  const whitespace = match[1]
  const partial = match[2]
  // Replace from after <% (including any whitespace typed)
  const from = pos - whitespace.length - partial.length

  const options: Completion[] = conditionalKeywords.map(kw => ({
    label: kw.label,
    type: "keyword",
    detail: kw.detail,
    apply: (view, _completion, from, to) => {
      const insert = kw.insert
      // For if/elseif, place cursor inside the []
      const cursorOffset = (kw.label === "if" || kw.label === "elseif")
        ? insert.indexOf('[') + 1
        : insert.length
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + cursorOffset }
      })
    }
  }))

  return {
    from,
    to: pos,
    options,
    validFor: /^\s*\w*$/
  }
}
