/**
 * TiddlyWiki Language Support - Main Entry Point
 *
 * Provides the tiddlywiki() function that creates a complete LanguageSupport
 * for CodeMirror 6, similar to markdown() in @codemirror/lang-markdown.
 */

import { Prec, EditorState } from "@codemirror/state"
import { KeyBinding, keymap } from "@codemirror/view"
import { Language, LanguageSupport, LanguageDescription, syntaxTree, ParseContext, indentOnInput, getIndentation, getIndentUnit } from "@codemirror/language"
import { Completion, CompletionContext, CompletionResult, autocompletion, completionKeymap, CompletionSource } from "@codemirror/autocomplete"
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { html, htmlCompletionSource } from "@codemirror/lang-html"
import { parseMixed, SyntaxNodeRef, Input } from "@lezer/common"

import { TiddlyWikiParser, twTags } from "./parser"
import { TiddlyWikiConfig } from "./core"
import { tiddlywikiLanguage, mkLang, getCodeParser, headerIndent } from "./language"
import {
  insertNewlineContinueMarkup,
  deleteMarkupBackward,
  deleteBracketPair,
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
  insertCodeBlock,
  listMarkerUpgradeHandler,
  listMarkerDowngrade,
  indentList,
  outdentList
} from "../commands"

// Re-export core language
export { tiddlywikiLanguage, headerIndent }

/**
 * Helper to build changes for all selections (multi-cursor support)
 * @param view - The editor view
 * @param from - The main cursor's from position
 * @param to - The main cursor's to position
 * @param insert - The text to insert
 * @param patternLen - Length of the matched pattern to replace at other cursors
 */
function buildMultiSelectionChanges(
  view: { state: EditorState },
  from: number,
  to: number,
  insert: string,
  patternLen: number
): { from: number; to: number; insert: string }[] {
  const selections = view.state.selection.ranges
  const mainIndex = view.state.selection.mainIndex

  return selections.map((range, idx) => {
    if (idx === mainIndex) {
      return { from, to, insert }
    } else {
      // Other cursors: replace the same pattern length before cursor
      return { from: range.from - patternLen, to: range.from, insert }
    }
  })
}

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

  // Superscript and subscript
  { tag: twTags.twSuperscript, class: "cm-tw-superscript" },
  { tag: twTags.twSubscript, class: "cm-tw-subscript" },

  // Highlight
  { tag: t.special(t.content), class: "cm-tw-highlight" },
])

/**
 * Keymap with TiddlyWiki-specific bindings
 */
export const tiddlywikiKeymap: readonly KeyBinding[] = [
  {key: "Enter", run: insertNewlineContinueMarkup},
  {key: "Backspace", run: (view) => deleteBracketPair(view) || listMarkerDowngrade(view) || deleteMarkupBackward(view)},
  {key: "Tab", run: indentList},
  {key: "Shift-Tab", run: outdentList},
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
   * Function to get image tiddler titles for [img[ completion
   */
  getImageTiddlerTitles?: () => string[]

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
   * Function to get widget attributes for completion.
   * Returns array of attribute names for the widget, or null to use built-in defaults.
   * This allows TiddlyWiki to introspect widget modules dynamically.
   */
  getWidgetAttributes?: (widgetName: string) => string[] | null

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
   * Function to get field names for completion in filter operators like has[], get[], sort[]
   */
  getFieldNames?: () => string[]

  /**
   * Function to get tag names for completion in filter operators like tag[], tagging[]
   */
  getTagNames?: () => string[]

  /**
   * Function to get function names for completion in function[], subfilter[]
   */
  getFunctionNames?: () => string[]

  /**
   * Function to get variable names for completion in getvariable[]
   */
  getVariableNames?: () => string[]

  /**
   * Function to get index/property names for a specific tiddler (for {{tiddler##index}} completion)
   * The tiddler title is passed so indexes can be fetched from the tiddler's data
   */
  getTiddlerIndexes?: (tiddlerTitle: string) => string[]

  /**
   * Function to get field names for a specific tiddler (for {{tiddler!!field}} completion)
   * Returns only the fields that exist on that particular tiddler
   */
  getTiddlerFields?: (tiddlerTitle: string) => string[]

  /**
   * Language support for HTML tags (default: html without tag matching)
   */
  htmlTagLanguage?: LanguageSupport

  /**
   * Callback to get additional widgets that should auto-close with /> on completion.
   * Action widgets always auto-close. This callback returns more widgets to add to that set.
   * Called dynamically on each completion to support live configuration updates.
   * Example return: ["$transclude", "$macrocall", "$slot"]
   */
  getSelfClosingWidgets?: () => string[]
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
  defaultCodeLanguage: Language | undefined,
  tiddlywikiParser?: TiddlyWikiParser
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

        // Handle text/vnd.tiddlywiki - parse content as TiddlyWiki wikitext
        if (typeName === "text/vnd.tiddlywiki" || typeName === "text/x-tiddlywiki") {
          if (tiddlywikiParser) {
            return { parser: tiddlywikiParser }
          }
        }

        // Handle text/plain - no syntax highlighting (return null to keep CodeText)
        if (typeName === "text/plain") {
          return null
        }

        // For other types, try to find a matching language parser
        const langName = mimeToLanguage(typeName)
        if (langName) {
          const parser = getParser(langName)
          if (parser) {
            return { parser }
          }
        }
      }
    }

    // CSS IN <style> TAGS: Parse content as CSS (like ```css code blocks)
    if (node.name === "HTMLBlock") {
      // Check if this is a <style> tag
      const tagNameNode = node.node.getChild("TagName")
      if (tagNameNode) {
        const tagName = input.read(tagNameNode.from, tagNameNode.to).toLowerCase()
        if (tagName === "style") {
          const cssParser = getParser("css")
          if (cssParser) {
            // Find the content range: after opening tag's > and before closing </style>
            let contentStart = -1
            let contentEnd = -1

            const cursor = node.node.cursor()
            cursor.firstChild()
            do {
              if (cursor.name === "TagMark" && contentStart === -1) {
                const markText = input.read(cursor.from, cursor.to)
                if (markText === ">") {
                  contentStart = cursor.to
                }
              }
              if (cursor.name === "HTMLEndTag") {
                contentEnd = cursor.from
                break
              }
            } while (cursor.nextSibling())

            if (contentStart > 0 && contentEnd > contentStart) {
              return {
                parser: cssParser,
                overlay: [{ from: contentStart, to: contentEnd }]
              }
            }
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
    getImageTiddlerTitles,
    getMacroNames,
    getMacroParams,
    getWidgetNames,
    getWidgetAttributes,
    getFilterOperators,
    getFieldNames,
    getTagNames,
    getFunctionNames,
    getVariableNames,
    getTiddlerIndexes,
    getTiddlerFields,
    htmlTagLanguage = htmlNoMatch,
    getSelfClosingWidgets,
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
    // Input handler for upgrading list markers (e.g., "* " + "*" → "** ")
    listMarkerUpgradeHandler,
  ]

  // Handle default code language
  let defaultCode: Language | undefined
  if (defaultCodeLanguage instanceof LanguageSupport) {
    support.push(defaultCodeLanguage.support)
    defaultCode = defaultCodeLanguage.language
  } else if (defaultCodeLanguage) {
    defaultCode = defaultCodeLanguage
  }

  // Include support extensions for code languages (enables autocompletion in nested code blocks)
  if (codeLanguages && Array.isArray(codeLanguages)) {
    for (const langDesc of codeLanguages) {
      if (langDesc.support) {
        // Language already loaded - include its support extensions
        support.push(langDesc.support.support)
      }
    }
  }

  // Add mixed language parsing for code blocks
  // Always enable for text/vnd.tiddlywiki support in typed blocks
  const wrap = createMixedLanguageWrapper(
    codeLanguages,
    defaultCode,
    parser  // Pass the TiddlyWiki parser for nested wikitext in typed blocks
  )
  parserExtensions.push({ wrap })

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
      autocomplete: widgetCompletion(getWidgetNames, getSelfClosingWidgets)
    }))
    support.push(lang.data.of({
      autocomplete: widgetAttributeCompletion(getMacroParams, getWidgetAttributes)
    }))
    // Add attribute value completion (for $variable=", tiddler=", etc.)
    support.push(lang.data.of({
      autocomplete: attributeValueCompletion(getMacroNames, getTiddlerTitles, getFunctionNames, getVariableNames)
    }))
  }

  if (completeMacros) {
    support.push(lang.data.of({
      autocomplete: macroCompletion(getMacroNames, getFunctionNames, getVariableNames)
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
      autocomplete: tiddlerCompletion(getTiddlerTitles, getImageTiddlerTitles)
    }))
    // Field/index completion for transclusions: {{tiddler!!field}} or {{tiddler##index}}
    support.push(lang.data.of({
      autocomplete: transclusionFieldCompletion(getTiddlerFields, getTiddlerIndexes)
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

  // Filter operator suffix completion (e.g., [contains:, [search:literal:)
  // Always enabled when filter operators are enabled
  if (completeFilterOperators) {
    support.push(lang.data.of({
      autocomplete: filterOperatorSuffixCompletion(getFieldNames)
    }))
  }

  // Filter operand value completion (e.g., all[current], is[shadow], tag[TagName])
  // Always enabled when filter operators are enabled
  if (completeFilterOperators) {
    support.push(lang.data.of({
      autocomplete: filterOperandValueCompletion(
        getTiddlerTitles,
        getTagNames,
        getFieldNames,
        getFunctionNames,
        getVariableNames
      )
    }))
  }

  // Always add conditional keyword completion (<%if, <%else, etc.)
  support.push(lang.data.of({
    autocomplete: conditionalCompletion
  }))

  // Always add pragma completion (\define, \procedure, etc.)
  support.push(lang.data.of({
    autocomplete: pragmaCompletion
  }))

  // Always add \end name completion (shows open pragma names after \end )
  support.push(lang.data.of({
    autocomplete: pragmaEndNameCompletion
  }))

  return new LanguageSupport(lang, support)
}

/**
 * Calculate boost value for autocompletion based on whether title is a system tiddler.
 * Non-system tiddlers get higher boost (appear first), system tiddlers get lower boost.
 */
function getTiddlerBoost(title: string): number {
  return title.startsWith("$:/") ? -1 : 1
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

// Fallback widget attributes (used when dynamic introspection fails)
const widgetAttributes: Record<string, string[]> = {
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
  "$eventcatcher": ["type", "actions", "tag", "events", "class"],
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
  "$messagecatcher": ["$message", "$count", "actions"],
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

// Self-closing widgets (action widgets that don't have content)
const selfClosingWidgets = new Set([
  "$action-confirm", "$action-createtiddler", "$action-deletetiddler",
  "$action-deletefield", "$action-listops", "$action-log",
  "$action-navigate", "$action-popup", "$action-sendmessage",
  "$action-setfield", "$action-setmultiplefields"
])

/**
 * Widget completion source (<$widget)
 * Supports namespaced widgets like <$my.widget
 */
function widgetCompletion(getWidgetNames?: () => string[], getSelfClosingWidgets?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    // Build self-closing set dynamically to support live config updates
    const allSelfClosing = new Set(selfClosingWidgets)
    if (getSelfClosingWidgets) {
      for (const w of getSelfClosingWidgets()) {
        allSelfClosing.add(w)
      }
    }
    const { state, pos } = context
    // Allow dots in widget names for namespaced widgets like <$my.widget
    const m = /<\$[\w\-\.]*$/.exec(state.sliceDoc(pos - 50, pos))
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

    // Collect all widget names with their sources
    const seen = new Set<string>()
    const allWidgets: { name: string, detail: string }[] = []

    // Get local widget definitions from current document (\widget pragma)
    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)
    for (const name of localDefs.widgets) {
      if (!seen.has(name)) {
        seen.add(name)
        allWidgets.push({ name, detail: "widget (local)" })
      }
    }

    // Add global/custom widgets
    const customWidgets = getWidgetNames ? getWidgetNames() : []
    const globalWidgets = customWidgets.length > 0 ? customWidgets : coreWidgets
    for (const name of globalWidgets) {
      if (!seen.has(name)) {
        seen.add(name)
        const isSelfClosing = allSelfClosing.has(name)
        allWidgets.push({ name, detail: isSelfClosing ? "action" : "widget" })
      }
    }

    const patternLen = m[0].length
    const options: Completion[] = allWidgets.map(({ name, detail }) => {
      const isSelfClosing = allSelfClosing.has(name)
      return {
        label: "<" + name,
        type: "keyword",
        detail,
        apply: (view, _completion, from, to) => {
          const widgetTag = "<" + name
          // Check if there's already a > after cursor (from auto-close brackets)
          const textAfter = view.state.sliceDoc(to, to + 1)
          const hasClosingBracket = textAfter === ">"
          const endTo = hasClosingBracket ? to + 1 : to

          let insert: string
          let cursorOffset: number
          if (isSelfClosing) {
            insert = widgetTag + "/>"
            cursorOffset = widgetTag.length
          } else {
            const closingTag = "</" + name + ">"
            insert = widgetTag + ">" + closingTag
            cursorOffset = widgetTag.length + 1
          }

          const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + cursorOffset }
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
 * Triggers when cursor is inside a widget tag after the widget name
 */
function widgetAttributeCompletion(
  getMacroParams?: (name: string) => string[] | null,
  getWidgetAttributes?: (widgetName: string) => string[] | null
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    // Look back to find if we're inside a widget tag
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    // Match: <$widgetname followed by attributes (supports dots for namespaced widgets)
    const tagMatch = /<\$([a-zA-Z][a-zA-Z0-9\-\.]*)\s+[^>]*$/.exec(textBefore)
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
    // Try dynamic introspection first, fall back to hardcoded list
    const dynamicAttrs = getWidgetAttributes ? getWidgetAttributes(widgetName) : null
    const fallbackAttrs = widgetAttributes[widgetName] || []
    let allAttrs = dynamicAttrs !== null ? [...dynamicAttrs] : [...fallbackAttrs]

    // For $macrocall, also add parameters of the macro specified in $name
    // For $transclude, also add parameters of the variable specified in $variable
    if (widgetName === "$macrocall" || widgetName === "$transclude") {
      // Extract $name (for $macrocall) or $variable (for $transclude) value from the tag
      const attrToMatch = widgetName === "$macrocall" ? "\\$name" : "\\$variable"
      const nameRegex = new RegExp(attrToMatch + "\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|<<([^>]+)>>)")
      const nameMatch = nameRegex.exec(afterTag)
      if (nameMatch) {
        const macroName = nameMatch[1] || nameMatch[2] || nameMatch[3]
        if (macroName) {
          // Get parameters from local definitions first
          const docText = state.doc.toString()
          const localDefs = extractLocalDefinitions(docText)
          let params: string[] | null = null

          if (localDefs.definitionParams[macroName]) {
            params = localDefs.definitionParams[macroName]
          } else if (getMacroParams) {
            params = getMacroParams(macroName)
          }

          if (params && params.length > 0) {
            // Add macro params to the list (avoiding duplicates)
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

    const patternLen = partial.length

    const options: Completion[] = allAttrs.map(attr => ({
      label: attr,
      type: "property",
      detail: attr.startsWith("$") ? "widget attr" : "parameter",
      apply: (view, _completion, from, to) => {
        // Check if there's already a " after cursor (from auto-close brackets)
        const textAfter = view.state.sliceDoc(to, to + 1)
        const hasClosingQuote = textAfter === '"'
        const insert = hasClosingQuote ? attr + '="' : attr + '=""'
        const endTo = hasClosingQuote ? to + 1 : to
        // Position cursor between the quotes
        const cursorPos = from + attr.length + 2
        const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: cursorPos }
        })
      }
    }))

    return {
      from,
      to: pos,
      options,
      validFor: /^[$a-zA-Z\-]*$/
    }
  }
}

/**
 * Attribute value completion source
 * Triggers when cursor is inside an attribute value, e.g., $variable="..."
 * Provides context-aware completions based on the attribute name
 */
function attributeValueCompletion(
  getMacroNames?: () => string[],
  getTiddlerTitles?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[]
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    // Look back to find if we're inside an attribute value
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    // Match: attrname="value or attrname='value (cursor is after the opening quote)
    const attrValueMatch = /([$a-zA-Z][\w\-]*)\s*=\s*(["'])([^"']*)$/.exec(textBefore)
    if (!attrValueMatch) return null

    const attrName = attrValueMatch[1]
    const quoteChar = attrValueMatch[2]
    const partial = attrValueMatch[3]
    const from = pos - partial.length
    const patternLen = partial.length

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

    let options: Completion[] = []
    let detail = ""

    // $variable attribute - complete with all callable types (macros, procedures, functions, variables)
    if (attrName === "$variable") {
      // Collect all callable names with their types
      const seen = new Set<string>()
      const allNames: { name: string, detail: string, type: 'function' | 'variable' | 'keyword' }[] = []

      // Get local definitions from current document
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)

      // Add local macros
      for (const name of localDefs.macros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro (local)", type: "function" })
        }
      }

      // Add local procedures
      for (const name of localDefs.procedures) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "procedure (local)", type: "function" })
        }
      }

      // Add local functions
      for (const name of localDefs.functions) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "function (local)", type: "function" })
        }
      }

      // Add local widget variables
      for (const name of localDefs.widgetVars) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable (local)", type: "variable" })
        }
      }

      // Add built-in variables
      for (const name of localDefs.builtIns) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable (built-in)", type: "keyword" })
        }
      }

      // Add global macros
      const customMacros = getMacroNames ? getMacroNames() : []
      const macros = customMacros.length > 0 ? customMacros : commonMacros
      for (const name of macros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro", type: "function" })
        }
      }

      // Add global functions
      const functions = getFunctionNames ? getFunctionNames() : []
      for (const name of functions) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "function", type: "function" })
        }
      }

      // Add global variables
      const variables = getVariableNames ? getVariableNames() : []
      for (const name of variables) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable", type: "variable" })
        }
      }

      // Pre-filter to ensure hyphenated names match correctly
      const lowerPartial = partial.toLowerCase()
      const filtered = allNames.filter(({ name }) =>
        name.toLowerCase().startsWith(lowerPartial)
      )

      options = filtered.map(({ name, detail, type }) => ({
        label: name,
        type,
        detail,
        boost: 2,  // Boost to ensure visibility alongside snippets
        apply: (view, _completion, from, to) => {
          // Check if there's already a closing quote after cursor
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
    // tiddler or $tiddler attribute - complete with tiddler titles
    else if (attrName === "tiddler" || attrName === "$tiddler") {
      const titles = getTiddlerTitles ? getTiddlerTitles() : []
      if (titles.length === 0) return null
      detail = "tiddler"
      options = titles.map(title => ({
        label: title,
        type: "variable",
        detail,
        boost: getTiddlerBoost(title),
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
    // to attribute (for $link, $action-navigate) - complete with tiddler titles
    else if (attrName === "to" || attrName === "$to") {
      const titles = getTiddlerTitles ? getTiddlerTitles() : []
      if (titles.length === 0) return null
      detail = "tiddler"
      options = titles.map(title => ({
        label: title,
        type: "variable",
        detail,
        boost: getTiddlerBoost(title),
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
    // $name attribute (for $macrocall) - complete with macro names
    else if (attrName === "$name") {
      const seen = new Set<string>()
      const allNames: { name: string, detail: string }[] = []

      // Get local definitions from current document
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)

      // Add local macros
      for (const name of localDefs.macros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro (local)" })
        }
      }

      // Add local procedures
      for (const name of localDefs.procedures) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "procedure (local)" })
        }
      }

      // Add local functions
      for (const name of localDefs.functions) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "function (local)" })
        }
      }

      // Add local widgets (can also be called via $macrocall)
      for (const name of localDefs.widgets) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "widget (local)" })
        }
      }

      // Add external macros from callback
      const externalMacros = getMacroNames ? getMacroNames() : commonMacros
      for (const name of externalMacros) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "macro" })
        }
      }

      // Pre-filter to ensure hyphenated names match correctly
      const lowerPartial = partial.toLowerCase()
      const filtered = allNames.filter(({ name }) =>
        name.toLowerCase().startsWith(lowerPartial)
      )

      options = filtered.map(({ name, detail }) => ({
        label: name,
        type: "function",
        detail,
        boost: 2,  // Boost to ensure visibility alongside snippets
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

// Default field names for completions when no getFieldNames callback is provided
const defaultFieldNames = [
  "title", "text", "tags", "modified", "created", "creator", "modifier",
  "type", "caption", "description", "list", "list-before", "list-after",
  "draft.of", "draft.title", "plugin-type", "plugin-priority", "color",
  "icon", "library", "source", "code-body", "throttle.refresh"
]

// Filter operator metadata for special completions
// Defines valid operand values, available suffixes, and flags for each operator
const filterOperatorMeta: Record<string, {
  operands?: string[]           // Static values inside []
  suffixes?: string[]           // Available suffixes after : (type modifiers)
  flags?: string[]              // Boolean flags (like casesensitive)
  dynamicOperands?: 'fields' | 'tags' | 'tiddlers' | 'functions' | 'variables'
  allowPlus?: boolean           // Whether operator supports + combinations (e.g., all[tiddlers+shadows])
}> = {
  // Selection constructors
  "all": { operands: ["current", "missing", "orphans", "shadows", "tags", "tiddlers"], allowPlus: true },
  "is": { operands: ["binary", "blank", "current", "draft", "image", "missing", "orphan", "shadow", "system", "tag", "tiddler", "variable"] },

  // Field-related operators
  "has": { dynamicOperands: "fields", suffixes: ["field", "index", "tag"] },
  "get": { dynamicOperands: "fields" },
  "getindex": { dynamicOperands: "fields" },
  "field": { dynamicOperands: "fields" },
  "fields": { operands: [] },  // No operand, returns all field names
  "indexes": { operands: [] },  // No operand, returns indexes of input tiddlers

  // Tag-related operators
  "tag": { dynamicOperands: "tags" },
  "tagging": { operands: [] },  // No operand, uses input titles as tags
  "tags": { operands: [] },  // No operand, returns tags of input tiddlers
  "untagged": { operands: [] },  // No operand, filters to untagged tiddlers

  // Function/subfilter operators
  "function": { dynamicOperands: "functions" },
  "subfilter": { dynamicOperands: "functions" },

  // String operators with flags/suffixes
  "contains": { flags: ["casesensitive"], suffixes: ["field", "index"] },
  "match": { flags: ["casesensitive"] },
  "regexp": { flags: ["casesensitive"] },
  "search": {
    flags: ["casesensitive", "anchored", "literal", "whitespace", "regexp", "words", "some", "all"],
    suffixes: ["field"]
  },
  "prefix": { flags: ["casesensitive"] },
  "suffix": { flags: ["casesensitive"] },

  // Sort operators
  "sort": {
    dynamicOperands: "fields",
    flags: ["reverse", "casesensitive"],
    suffixes: ["alphanumeric", "number", "string", "date", "naturaldate"]
  },
  "nsort": { dynamicOperands: "fields", flags: ["reverse"] },
  "sortan": { dynamicOperands: "fields", flags: ["reverse"] },
  "sortcs": { dynamicOperands: "fields", flags: ["reverse"] },
  "sortby": { dynamicOperands: "fields", flags: ["reverse"] },
  "nsortby": { dynamicOperands: "fields", flags: ["reverse"] },

  // Comparison operators
  "compare": {
    suffixes: ["number", "string", "integer", "date", "version"],
    flags: ["casesensitive"]
  },

  // Limit operators (numeric only, no special completions)
  "limit": { operands: [] },
  "first": { operands: [] },
  "last": { operands: [] },
  "nth": { operands: [] },
  "range": { operands: [] },

  // Format operator
  "format": { operands: ["date", "relativedate", "json", "timestamp", "titlelist"] },

  // JSON operators
  "jsonget": { operands: [] },  // Path segments
  "jsontype": { operands: [] },
  "jsonindexes": { operands: [] },
  "jsonextract": { operands: [] },

  // Transclusion with field operand
  "lookup": { dynamicOperands: "fields" },
  "getvariable": { dynamicOperands: "variables" },

  // List-related
  "list": { dynamicOperands: "tiddlers" },
  "listed": { dynamicOperands: "fields" },
  "enlist": { operands: [] },  // Takes space-separated list
  "split": { operands: [] },

  // Draft operators
  "draft.of": { operands: [] },
  "draft.for": { operands: [] },

  // Special operators
  "each": { dynamicOperands: "fields" },
  "eachday": { dynamicOperands: "fields" },

  // No-operand operators (ignore any operand, work on input titles)
  "backlinks": { operands: [] },
  "backtranscludes": { operands: [] },
  "commands": { operands: [] },
  "count": { operands: [] },
  "deserializers": { operands: [] },
  "duplicateslugs": { operands: [] },
  "editions": { operands: [] },
  "haschanged": { operands: [] },
  "links": { operands: [] },
  "moduletypes": { operands: [] },
  "plugintiddlers": { operands: [] },
  "shadowsource": { operands: [] },
  "slugify": { operands: [] },
  "storyviews": { operands: [] },
  "title": { operands: [] },
  "transcludes": { operands: [] },
  "variables": { operands: [] },
}

/**
 * Macro completion source (<<macro or [<variable> or [operator<variable> in filters)
 * Includes macros, procedures, functions, and variables since all are callable via <<name>>
 */
function macroCompletion(
  getMacroNames?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[]
) {
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

    // Collect all callable names with their types
    const seen = new Set<string>()
    const allNames: { name: string, detail: string, type: 'function' | 'variable' | 'keyword' }[] = []

    // Get local definitions from current document
    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)

    // Add local macros
    for (const name of localDefs.macros) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "macro (local)", type: "function" })
      }
    }

    // Add local procedures
    for (const name of localDefs.procedures) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "procedure (local)", type: "function" })
      }
    }

    // Add local functions
    for (const name of localDefs.functions) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "function (local)", type: "function" })
      }
    }

    // Add local widget variables ($set, $let, etc.)
    for (const name of localDefs.widgetVars) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "variable (local)", type: "variable" })
      }
    }

    // Add built-in variables
    for (const name of localDefs.builtIns) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "variable (built-in)", type: "keyword" })
      }
    }

    // Add global macros
    const customMacros = getMacroNames ? getMacroNames() : []
    const macros = customMacros.length > 0 ? customMacros : commonMacros
    for (const name of macros) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "macro", type: "function" })
      }
    }

    // Add global functions
    const functions = getFunctionNames ? getFunctionNames() : []
    for (const name of functions) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "function", type: "function" })
      }
    }

    // Add global variables
    const variables = getVariableNames ? getVariableNames() : []
    for (const name of variables) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "variable", type: "variable" })
      }
    }

    if (filterVarMatch) {
      // Variable reference in filter: [<variable>] or [operator<variable>]
      // Close with >], cursor positioned after > but before ]
      const prefix = m[0].slice(0, m[0].lastIndexOf('<') + 1)
      const patternLen = filterVarMatch[0].length
      const options: Completion[] = allNames.map(({ name, detail, type }) => ({
        label: prefix + name,
        type,
        detail,
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasClosingAngle = textAfter[0] === ">"
          const hasOuterBracket = textAfter[1] === "]" || textAfter[0] === "]"

          // Build suffix: always need >], but check what's already there
          let suffix = ">]"
          if (hasClosingAngle && hasOuterBracket) {
            suffix = ""
          } else if (hasClosingAngle) {
            suffix = "]" // Add only outer ]
          } else if (hasOuterBracket) {
            suffix = ">" // Add only >
          }

          const insert = prefix + name + suffix
          // Cursor after >, before ]
          const cursorPos = from + prefix.length + name.length + 1
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos }
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
    const options: Completion[] = allNames.map(({ name, detail, type }) => ({
      label: "<<" + name,
      type,
      detail,
      apply: "<<" + name + ">>"
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

    // Get parameters for this macro/procedure/function/widget
    // First check local definitions in the current document
    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)
    let params: string[] | null = null

    // Check local definitions first
    if (localDefs.definitionParams[macroName]) {
      params = localDefs.definitionParams[macroName]
    }
    // Fall back to external callback if not found locally
    else if (getMacroParams) {
      params = getMacroParams(macroName)
    }

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
function tiddlerCompletion(getTiddlerTitles?: () => string[], getImageTiddlerTitles?: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(pos - 100, pos)

    // Match [[ for links (also works inside filters for literal titles)
    const linkMatch = /\[\[[^\]|]*$/.exec(textBefore)
    // Match [[display|target for wikilinks with display text (completing the target part)
    const linkTargetMatch = /\[\[.*?\|[^\]]*$/.exec(textBefore)
    // Match {{ for transclusions (but not {{{ which is filtered transclusion)
    // Also exclude matches containing !! or ## (those are handled by transclusionFieldCompletion)
    let transcludeMatch = /(?<!\{)\{\{[^{}|]*$/.exec(textBefore)
    if (transcludeMatch && (transcludeMatch[0].includes('!!') || transcludeMatch[0].includes('##'))) {
      transcludeMatch = null
    }
    // Match [img[ or [img ...attrs[ for images (source is inside the last [)
    const imageMatch = /\[img(?:\s+[^\[]*)?\[[^\]|]*$/.exec(textBefore)
    // Match [operator[ or ]operator[ or }operator[ or >operator[ for filter operand (tiddler title)
    const filterOperandMatch = /[\[\]}>][\w\-:!]*\[[^\]]*$/.exec(textBefore)
    // Match [{ or [operator{ or ]operator{ or }operator{ or >operator{ for text references inside filters
    // Also exclude matches containing !! or ## (those are handled by transclusionFieldCompletion)
    let filterTextRefMatch = /[\[\]}>][\w\-:!]*\{[^}]*$/.exec(textBefore)
    if (filterTextRefMatch && (filterTextRefMatch[0].includes('!!') || filterTextRefMatch[0].includes('##'))) {
      filterTextRefMatch = null
    }

    // Check if we're inside a filter context (affects how [[ is treated)
    // Filter contexts: {{{ filter }}}, filter="...", <$list filter="..."/>, etc.
    const inFilterContext = (
      // Inside filtered transclusion {{{ ... }}}
      /\{\{\{[^}]*$/.test(textBefore) ||
      // Inside filter attribute: filter="..." or filter='...' or filter="""..."""
      /\bfilter\s*=\s*(?:"[^"]*|'[^']*|"""[^"]*)$/.test(textBefore) ||
      // Inside other common filter attributes (e.g., <$list filter=, <$count filter=)
      /<\$\w+[^>]*\bfilter\s*=\s*(?:"[^"]*|'[^']*|"""[^"]*)$/.test(textBefore)
    )

    // If inside a filter context and we have [[, prioritize filterOperandMatch over linkMatch
    // Otherwise, prioritize linkMatch (for wikilinks)
    let match: RegExpExecArray | null
    if (inFilterContext && linkMatch && filterOperandMatch) {
      // Inside filter: [[ is a literal title operand, not a wikilink
      match = filterOperandMatch
    } else {
      match = linkMatch || linkTargetMatch || transcludeMatch || imageMatch || filterOperandMatch || filterTextRefMatch
    }
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

    let titles = getTiddlerTitles ? getTiddlerTitles() : []
    if (titles.length === 0) return null

    // Determine prefix and suffix based on match type
    let prefix: string
    let suffix: string
    let validFor: RegExp
    let detail: string

    if (match === filterTextRefMatch) {
      // Text reference inside filter: [operator{tiddler}] or [{tiddler}]
      // Close with }], cursor positioned after } but before ]
      prefix = match[0].slice(0, match[0].lastIndexOf('{') + 1)
      validFor = /^[\[\]}>][\w\-:!]*\{[^}]*$/
      detail = "text reference"
      const patternLen = match[0].length

      const options: Completion[] = titles.map(title => ({
        label: prefix + title,
        type: "variable",
        detail,
        boost: getTiddlerBoost(title),
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasClosingBrace = textAfter[0] === "}"
          const hasOuterBracket = textAfter[1] === "]" || textAfter[0] === "]"

          let suffix = "}"
          if (hasClosingBrace) suffix = ""
          if (!hasClosingBrace && !hasOuterBracket) suffix = "}]"
          if (hasClosingBrace && !hasOuterBracket) suffix = "" // } exists, ] doesn't - we'll add ] after

          // Calculate what we're inserting
          const needsOuterBracket = !hasOuterBracket && !(hasClosingBrace && textAfter[1] === "]")
          const insert = prefix + title + (hasClosingBrace ? "" : "}") + (needsOuterBracket ? "]" : "")
          // Cursor after }, before ]
          const cursorPos = from + prefix.length + title.length + 1
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos }
          })
        }
      }))

      return {
        from: pos - match[0].length,
        to: pos,
        options,
        validFor
      }
    } else if (match === filterOperandMatch) {
      // Filter operand: [operator[value]] or [[value]]
      // Check if this operator has special handling in filterOperatorMeta
      // If so, skip tiddler completion - filterOperandValueCompletion will handle it
      const operatorMatch = /[\[\]}>](!?)([\w.]+)(?::[\w]+)*\[[^\]]*$/.exec(match[0])
      if (operatorMatch) {
        const operator = operatorMatch[2]
        if (filterOperatorMeta[operator]) {
          // This operator has special operand handling, don't provide tiddler completions
          return null
        }
      }

      // Close with ]], cursor positioned after first ] but before second ]
      prefix = match[0].slice(0, match[0].lastIndexOf('[') + 1)
      validFor = /^[\[\]}>][\w\-:!]*\[[^\]]*$/
      detail = "filter operand"
      const patternLen = match[0].length

      const options: Completion[] = titles.map(title => ({
        label: prefix + title,
        type: "variable",
        detail,
        boost: getTiddlerBoost(title),
        apply: (view, _completion, from, to) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasFirstBracket = textAfter[0] === "]"
          const hasSecondBracket = textAfter[1] === "]"

          // Build suffix: always need ]], but check what's already there
          let suffix = "]]"
          if (hasFirstBracket && hasSecondBracket) {
            suffix = ""
          } else if (hasFirstBracket) {
            suffix = "]" // Add only outer ]
          }

          const insert = prefix + title + suffix
          // Cursor after first ], before second ]
          const cursorPos = from + prefix.length + title.length + 1
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos }
          })
        }
      }))

      return {
        from: pos - match[0].length,
        to: pos,
        options,
        validFor
      }
    } else if (match === linkMatch) {
      prefix = "[["
      suffix = "]]"
      validFor = /^\[\[[^\]|]*$/
      detail = "tiddler"
    } else if (match === linkTargetMatch) {
      // [[display|target - completing the target part after |
      const pipePos = match[0].lastIndexOf('|')
      prefix = match[0].slice(0, pipePos + 1)
      suffix = "]]"
      validFor = /^\[\[.*?\|[^\]]*$/
      detail = "tiddler"
    } else if (match === transcludeMatch) {
      prefix = "{{"
      suffix = "}}"
      validFor = /^(?<!\{)\{\{[^{}|]*$/
      detail = "tiddler"
    } else if (match === imageMatch) {
      // Image match - we need to find where the [ starts for the source
      const bracketPos = match[0].lastIndexOf('[')
      prefix = match[0].slice(0, bracketPos + 1)
      suffix = "]]"
      validFor = /^\[img(?:\s+[^\[]*)?\[[^\]|]*$/
      detail = "image"
      // Use image-specific tiddler titles if available
      if (getImageTiddlerTitles) {
        titles = getImageTiddlerTitles()
      }
    } else {
      // Should not reach here, but return null for safety
      return null
    }

    const patternLen = match[0].length
    const options: Completion[] = titles.map(title => ({
      label: prefix + title,
      type: "variable",
      detail,
      boost: getTiddlerBoost(title),
      apply: (view, _completion, from, to) => {
        // Check what's after the cursor to handle auto-close brackets
        const textAfter = view.state.sliceDoc(to, to + suffix.length)
        let actualSuffix = suffix
        let skipChars = 0

        // Check for existing closing brackets
        if (textAfter === suffix) {
          // Full suffix already exists - don't add it, cursor skips over it
          actualSuffix = ""
          skipChars = suffix.length
        } else if (suffix === "]]" && textAfter.startsWith("]")) {
          // Partial ]] exists - add one more, skip the existing one
          actualSuffix = "]"
          skipChars = 1
        } else if (suffix === "}}" && textAfter.startsWith("}")) {
          // Partial }} exists - add one more, skip the existing one
          actualSuffix = "}"
          skipChars = 1
        }

        const insert = prefix + title + actualSuffix
        // Position cursor after the closing brackets (including any we skipped)
        const cursorPos = from + insert.length + skipChars
        const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: cursorPos }
        })
      }
    }))

    return {
      from: pos - match[0].length,
      to: pos,
      options,
      validFor
    }
  }
}

/**
 * Transclusion and text reference field/index completion source
 * Handles:
 * - {{tiddler!!field}} and {{tiddler##index}} - transclusion syntax
 * - {tiddler!!field} and {tiddler##index} - filter text reference syntax
 */
function transclusionFieldCompletion(
  getTiddlerFields?: (tiddlerTitle: string) => string[],
  getTiddlerIndexes?: (tiddlerTitle: string) => string[]
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    // Match {{tiddler!! for field completion in transclusions (but not {{{ which is filtered transclusion)
    const transcludeFieldMatch = /(?<!\{)\{\{([^{}|]*?)!![^{}|!]*$/.exec(textBefore)
    // Match {{tiddler## for index completion in transclusions
    const transcludeIndexMatch = /(?<!\{)\{\{([^{}|]*?)##[^{}|#]*$/.exec(textBefore)
    // Match {tiddler!! for field completion in filter text references (single brace, not double)
    const textRefFieldMatch = /(?<!\{)\{(?!\{)([^{}]*?)!![^{}!]*$/.exec(textBefore)
    // Match {tiddler## for index completion in filter text references
    const textRefIndexMatch = /(?<!\{)\{(?!\{)([^{}]*?)##[^{}#]*$/.exec(textBefore)

    // Determine which pattern matched
    const isTransclusion = !!(transcludeFieldMatch || transcludeIndexMatch)
    const isFieldCompletion = !!(transcludeFieldMatch || textRefFieldMatch)

    const match = transcludeFieldMatch || transcludeIndexMatch || textRefFieldMatch || textRefIndexMatch
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

    const separator = isFieldCompletion ? "!!" : "##"

    // Extract the tiddler title (before !! or ##)
    const tiddlerTitle = match[1] || ""

    // Find the part after !! or ##
    const sepIndex = match[0].lastIndexOf(separator)
    const prefix = match[0].slice(0, sepIndex + 2)  // Include the !! or ##
    const partialValue = match[0].slice(sepIndex + 2)

    let values: string[]
    let detail: string

    if (isFieldCompletion) {
      // Field completion - get fields for this specific tiddler
      if (getTiddlerFields && tiddlerTitle) {
        values = getTiddlerFields(tiddlerTitle)
      } else {
        // Fallback: no fields available
        values = []
      }
      detail = "field"
    } else {
      // Index completion - get indexes for this specific tiddler
      if (getTiddlerIndexes && tiddlerTitle) {
        values = getTiddlerIndexes(tiddlerTitle)
      } else {
        // Fallback: no indexes available
        values = []
      }
      detail = "index"
    }

    // Filter values based on what's already typed
    const filtered = values.filter(v =>
      v.toLowerCase().startsWith(partialValue.toLowerCase())
    )

    if (filtered.length === 0) return null

    const patternLen = match[0].length
    // Transclusions close with }}, text references close with }
    const closingSuffix = isTransclusion ? "}}" : "}"

    const options: Completion[] = filtered.map(value => ({
      label: prefix + value,
      type: "property",
      detail,
      apply: (view, _completion, from, to) => {
        // Check for existing closing braces
        const textAfter = view.state.sliceDoc(to, to + 2)
        let suffix = closingSuffix
        if (isTransclusion) {
          if (textAfter === "}}") {
            suffix = ""
          } else if (textAfter.startsWith("}")) {
            suffix = "}"
          }
        } else {
          // Text reference - single brace
          if (textAfter.startsWith("}")) {
            suffix = ""
          }
        }

        const insert = prefix + value + suffix
        const cursorPos = from + insert.length
        const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: cursorPos }
        })
      }
    }))

    // Build validFor pattern based on what we matched
    let validForPattern: RegExp
    if (isTransclusion) {
      validForPattern = isFieldCompletion
        ? /^(?<!\{)\{\{[^{}|]*!![^{}|!]*$/
        : /^(?<!\{)\{\{[^{}|]*##[^{}|#]*$/
    } else {
      validForPattern = isFieldCompletion
        ? /^(?<!\{)\{(?!\{)[^{}]*!![^{}!]*$/
        : /^(?<!\{)\{(?!\{)[^{}]*##[^{}#]*$/
    }

    return {
      from: pos - match[0].length,
      to: pos,
      options,
      validFor: validForPattern
    }
  }
}

// Common HTML tags for completion
const commonHtmlTags = [
  "div", "span", "p", "a", "img", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "tr", "td", "th", "thead", "tbody", "tfoot",
  "form", "input", "button", "select", "option", "textarea", "label",
  "header", "footer", "nav", "main", "section", "article", "aside",
  "strong", "em", "b", "i", "u", "s", "code", "pre", "blockquote",
  "iframe", "video", "audio", "source", "canvas", "svg",
  "script", "style", "link", "meta",
]

// Self-closing HTML tags (no closing tag needed)
const selfClosingTags = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
])

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

  const patternLen = m[0].length
  const options: Completion[] = commonHtmlTags.map(tag => {
    const isSelfClosing = selfClosingTags.has(tag)
    return {
      label: "<" + tag,
      type: "type",
      detail: isSelfClosing ? "self-closing" : "tag",
      apply: (view, _completion, from, to) => {
        const tagText = "<" + tag
        // Check if there's already a > after cursor (from auto-close brackets)
        const textAfter = view.state.sliceDoc(to, to + 1)
        const hasClosingBracket = textAfter === ">"
        const endTo = hasClosingBracket ? to + 1 : to

        let insert: string
        let cursorOffset: number
        if (isSelfClosing) {
          insert = tagText + ">"
          cursorOffset = insert.length
        } else {
          const closingTag = "</" + tag + ">"
          insert = tagText + ">" + closingTag
          cursorOffset = tagText.length + 1
        }

        const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: from + cursorOffset }
        })
      }
    }
  })

  return {
    from: pos - m[0].length,
    to: pos,
    options,
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
  const patternLen = partial.length

  const options: Completion[] = allAttrs.map(attr => ({
    label: attr,
    type: "property",
    apply: (view, _completion, from, to) => {
      // For data- and aria- prefixes, just insert the prefix
      if (attr.endsWith("-")) {
        const changes = buildMultiSelectionChanges(view, from, to, attr, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: from + attr.length }
        })
        return
      }
      // Check if there's already a " after cursor (from auto-close brackets)
      const textAfter = view.state.sliceDoc(to, to + 1)
      const hasClosingQuote = textAfter === '"'
      const insert = hasClosingQuote ? attr + '="' : attr + '=""'
      const endTo = hasClosingQuote ? to + 1 : to
      // Position cursor between the quotes
      const cursorPos = from + attr.length + 2
      const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
      view.dispatch({
        changes,
        selection: { anchor: cursorPos }
      })
    }
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

/**
 * Filter operator suffix completion source
 * Triggers after : in operators like [contains:, [search:literal:, [sort:reverse:
 * Provides flags (casesensitive, reverse) and type suffixes (field, number, string, etc.)
 */
function filterOperatorSuffixCompletion(
  getFieldNames?: () => string[]
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    // Match operator with partial suffix: [operator:suf or [operator:flag:suf
    // Pattern: [ followed by optional ! and operator name, then one or more :suffix segments
    // The last segment can be partial (what user is typing)
    const match = /\[(!?)([\w.]+)((?::[\w]*)*)$/.exec(textBefore)
    if (!match) return null

    const operator = match[2]
    const suffixPart = match[3]  // e.g., ":case" or ":casesensitive:fi" or ":"

    // Must have at least one : to trigger suffix completion
    if (!suffixPart || !suffixPart.includes(':')) return null

    // Extract the partial suffix being typed (after last :)
    const colonMatch = /:(\w*)$/.exec(suffixPart)
    if (!colonMatch) return null

    const partial = colonMatch[1]  // The partial suffix being typed (may be empty)

    const meta = filterOperatorMeta[operator]
    if (!meta) return null

    // Check if this operator has any suffixes or flags
    if (!meta.flags && !meta.suffixes) return null

    // Collect already-used suffixes to avoid duplicates
    const usedSuffixes = suffixPart.split(':').filter(s => s && s !== partial)
    const options: Completion[] = []

    // Add flags that haven't been used
    if (meta.flags) {
      for (const flag of meta.flags) {
        if (!usedSuffixes.includes(flag)) {
          options.push({
            label: flag,
            type: "keyword",
            detail: "flag"
          })
        }
      }
    }

    // Add type suffixes that haven't been used
    if (meta.suffixes) {
      for (const suffix of meta.suffixes) {
        if (!usedSuffixes.includes(suffix)) {
          // "field" suffix should allow field name completion, others are literals
          if (suffix === "field") {
            options.push({
              label: suffix,
              type: "property",
              detail: "use field suffix"
            })
          } else {
            options.push({
              label: suffix,
              type: "property",
              detail: "type"
            })
          }
        }
      }
    }

    // If "field" suffix is available and we're completing after it,
    // or if the operator uses dynamic field operands, add field names
    // Check if we're completing field names (after :field: or for operators that take field suffixes)
    if (usedSuffixes.includes("field") ||
        (meta.suffixes?.includes("field") && !usedSuffixes.some(s => meta.suffixes?.includes(s) && s !== "field"))) {
      const fields = getFieldNames ? getFieldNames() : defaultFieldNames
      for (const field of fields) {
        if (!usedSuffixes.includes(field)) {
          options.push({
            label: field,
            type: "variable",
            detail: "field name"
          })
        }
      }
    }

    if (options.length === 0) return null

    // Filter by partial match
    const filteredOptions = partial.length > 0
      ? options.filter(o => o.label.toLowerCase().startsWith(partial.toLowerCase()))
      : options

    if (filteredOptions.length === 0) return null

    return {
      from: pos - partial.length,
      to: pos,
      options: filteredOptions,
      validFor: /^\w*$/
    }
  }
}

/**
 * Built-in/implicit variables always available in TiddlyWiki
 */
const builtInVariables = [
  // Always available
  "transclusion",
  "currentTiddler",
  "storyTiddler",
  // Set by $navigator widget (usually at page level)
  "tv-story-list",
  "tv-history-list",
  // Common tv- config variables
  "tv-config-toolbar-icons",
  "tv-config-toolbar-text",
  "tv-config-toolbar-class",
  "tv-wikilinks",
  "tv-show-missing-links",
  // Set by $list widget implicitly
  "revealedTitle",
  // Edit template
  "tv-tiddler-preview"
]

/**
 * Extract definition names from document text
 * Finds \define, \procedure, \function, \widget pragmas
 */
function extractLocalDefinitions(text: string): {
  functions: string[]
  procedures: string[]
  macros: string[]
  widgets: string[]
  widgetVars: string[]  // Variables set by widgets like $set, $let, $vars
  builtIns: string[]    // Built-in/implicit variables
  variables: string[]   // All of the above combined
  /** Maps definition names to their parameter names */
  definitionParams: Record<string, string[]>
} {
  const functions: string[] = []
  const procedures: string[] = []
  const macros: string[] = []
  const widgets: string[] = []
  const seen: Record<string, boolean> = {}
  const definitionParams: Record<string, string[]> = {}

  // Match \define name, \procedure name, \function name, \widget name
  // with optional (params) after the name
  // Group 3 captures the parameters inside parentheses
  const pragmaRegex = /\\(define|procedure|function|widget)\s+([^\s(]+)(?:\(([^)]*)\))?/g
  let match
  while ((match = pragmaRegex.exec(text)) !== null) {
    const type = match[1]
    const name = match[2]
    const paramsStr = match[3]
    if (!seen[name]) {
      seen[name] = true
      switch (type) {
        case 'function':
          functions.push(name)
          break
        case 'procedure':
          procedures.push(name)
          break
        case 'define':
          macros.push(name)
          break
        case 'widget':
          widgets.push(name)
          break
      }
      // Parse parameters if present
      if (paramsStr !== undefined && paramsStr.trim()) {
        const params = paramsStr.split(',').map(p => {
          // Each param can be "name" or "name:default" - extract just the name
          const paramName = p.trim().split(':')[0].trim()
          return paramName
        }).filter(p => p.length > 0)
        if (params.length > 0) {
          definitionParams[name] = params
        }
      }
    }
  }

  // Extract variables set by widgets
  const widgetVars: string[] = []

  // <$set name="varname" ...> - extract name attribute
  const setRegex = /<\$set\s+[^>]*name\s*=\s*["']([^"']+)["']/gi
  while ((match = setRegex.exec(text)) !== null) {
    const varName = match[1]
    if (!seen[varName]) {
      seen[varName] = true
      widgetVars.push(varName)
    }
  }

  // <$vars attr1="val1" attr2="val2" ...> - all attributes are variables
  const varsRegex = /<\$vars\s+([^>]+)>/gi
  while ((match = varsRegex.exec(text)) !== null) {
    const attrs = match[1]
    // Extract all attribute names (attr="..." or attr=<<...>> or attr={{...}})
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

  // <$let attr1="val1" attr2="val2" ...> - all attributes are variables
  const letRegex = /<\$let\s+([^>]+)>/gi
  while ((match = letRegex.exec(text)) !== null) {
    const attrs = match[1]
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

  // <$list variable="item" counter="idx" ...> - extract variable and counter
  const listRegex = /<\$list\s+[^>]*(?:variable|counter)\s*=\s*["']([^"']+)["']/gi
  while ((match = listRegex.exec(text)) !== null) {
    const varName = match[1]
    if (!seen[varName]) {
      seen[varName] = true
      widgetVars.push(varName)
    }
  }

  // <$range variable="i" ...> - extract variable attribute
  const rangeRegex = /<\$range\s+[^>]*variable\s*=\s*["']([^"']+)["']/gi
  while ((match = rangeRegex.exec(text)) !== null) {
    const varName = match[1]
    if (!seen[varName]) {
      seen[varName] = true
      widgetVars.push(varName)
    }
  }

  // <$wikify name="html" ...> - extract name attribute
  const wikifyRegex = /<\$wikify\s+[^>]*name\s*=\s*["']([^"']+)["']/gi
  while ((match = wikifyRegex.exec(text)) !== null) {
    const varName = match[1]
    if (!seen[varName]) {
      seen[varName] = true
      widgetVars.push(varName)
    }
  }

  // All definitions, widget variables, and built-in variables are variables
  const variables = [
    ...builtInVariables,
    ...functions,
    ...procedures,
    ...macros,
    ...widgets,
    ...widgetVars
  ]

  return { functions, procedures, macros, widgets, widgetVars, builtIns: builtInVariables, variables, definitionParams }
}

/**
 * Filter operand value completion source
 * Triggers inside [] for operators with predefined values like all[], is[], format[]
 * Also provides dynamic completions for operators like tag[], has[], get[]
 */
function filterOperandValueCompletion(
  getTiddlerNames?: () => string[],
  getTagNames?: () => string[],
  getFieldNames?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[]
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    // Extract local definitions from current document for functions/variables
    // Cache per-document to avoid re-parsing on every keystroke
    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)

    // Match: [operator[partial or [operator:suffix[partial or ]operator[partial
    // Pattern breakdown:
    // - [\[\]}>] - start after [, ], }, or > (filter syntax boundaries)
    // - (!?) - optional negation
    // - ([\w.]+) - operator name (includes . for draft.of etc)
    // - ((?::[\w]+)*) - zero or more :suffix segments
    // - \[ - opening bracket for operand
    // - ([^\]]*) - the partial operand text (what user is typing)
    const match = /[\[\]}>](!?)([\w.]+)((?::[\w]+)*)\[([^\]]*)$/.exec(textBefore)
    if (!match) return null

    const operator = match[2]
    const operandContent = match[4]  // Full content inside [], e.g., "tiddlers+shad"

    const meta = filterOperatorMeta[operator]
    if (!meta) return null  // No special completions for this operator

    // If meta has empty operands array, it means numeric only - no completions
    if (meta.operands && meta.operands.length === 0 && !meta.dynamicOperands) {
      return null
    }

    // Handle + combinations only for operators that support it (e.g., all[tiddlers+shadows])
    let partial: string
    let usedValues: string[]

    if (meta.allowPlus && operandContent.includes('+')) {
      const parts = operandContent.split('+')
      partial = parts[parts.length - 1]  // What user is currently typing
      usedValues = parts.slice(0, -1)    // Already selected values before last +
    } else {
      partial = operandContent
      usedValues = []
    }

    let options: Completion[] = []

    // Static operands (like all[], is[], format[])
    if (meta.operands && meta.operands.length > 0) {
      options = meta.operands
        .filter(op => !usedValues.includes(op))  // Exclude already-used values
        .map(op => ({
          label: op,
          type: "constant",
          detail: `${operator}[] value`
        }))
    }

    // Dynamic operands based on type
    if (meta.dynamicOperands) {
      let values: string[] = []
      let localValues: string[] = []
      let detailType = ""
      switch (meta.dynamicOperands) {
        case 'fields':
          values = getFieldNames ? getFieldNames() : defaultFieldNames
          detailType = "field"
          break
        case 'tags':
          values = getTagNames ? getTagNames() : []
          detailType = "tag"
          break
        case 'tiddlers':
          values = getTiddlerNames ? getTiddlerNames() : []
          detailType = "tiddler"
          break
        case 'functions':
          values = getFunctionNames ? getFunctionNames() : []
          localValues = localDefs.functions
          detailType = "function"
          break
        case 'variables':
          values = getVariableNames ? getVariableNames() : []
          localValues = localDefs.variables
          detailType = "variable"
          break
      }

      // Add global values
      const seen = new Set<string>(usedValues)
      const needsBoost = meta.dynamicOperands === 'tags' || meta.dynamicOperands === 'tiddlers'
      options.push(...values
        .filter(v => {
          if (seen.has(v)) return false
          seen.add(v)
          return true
        })
        .map(v => ({
          label: v,
          type: meta.dynamicOperands === 'fields' ? 'variable' as const :
                meta.dynamicOperands === 'functions' ? 'function' as const :
                'text' as const,
          detail: detailType,
          ...(needsBoost ? { boost: getTiddlerBoost(v) } : {})
        })))

      // Add local definitions (from current document) with special detail
      if (localValues.length > 0) {
        // For variables, separate built-ins from true local definitions
        if (meta.dynamicOperands === 'variables') {
          // Add built-in variables first
          options.push(...localDefs.builtIns
            .filter(v => {
              if (seen.has(v)) return false
              seen.add(v)
              return true
            })
            .map(v => ({
              label: v,
              type: 'keyword' as const,
              detail: `${detailType} (built-in)`
            })))

          // Add true local definitions (pragmas + widget-set variables)
          const trueLocalVars = [
            ...localDefs.functions,
            ...localDefs.procedures,
            ...localDefs.macros,
            ...localDefs.widgets,
            ...localDefs.widgetVars
          ]
          options.push(...trueLocalVars
            .filter(v => {
              if (seen.has(v)) return false
              seen.add(v)
              return true
            })
            .map(v => ({
              label: v,
              type: 'function' as const,
              detail: `${detailType} (local)`
            })))
        } else {
          // For functions, just add as local
          options.push(...localValues
            .filter(v => {
              if (seen.has(v)) return false
              seen.add(v)
              return true
            })
            .map(v => ({
              label: v,
              type: 'function' as const,
              detail: `${detailType} (local)`
            })))
        }
      }
    }

    if (options.length === 0) return null

    // Filter by partial match (case-insensitive)
    const filteredOptions = partial.length > 0
      ? options.filter(o => o.label.toLowerCase().startsWith(partial.toLowerCase()))
      : options

    if (filteredOptions.length === 0) return null

    return {
      from: pos - partial.length,
      to: pos,
      options: filteredOptions,
      validFor: /^[^\]]*$/
    }
  }
}

// ============================================================================
// Conditional Keyword Completion (<%if, <%else, <%elseif, <%endif)
// ============================================================================

const conditionalKeywords = [
  { label: "if", detail: "Conditional if", insert: "if [] %>", outdent: false },
  { label: "elseif", detail: "Conditional else-if", insert: "elseif [] %>", outdent: true },
  { label: "else", detail: "Conditional else", insert: " else %>", outdent: true },
  { label: "endif", detail: "End conditional", insert: " endif %>", outdent: true },
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
  const patternLen = whitespace.length + partial.length

  // Calculate the position of <% on the line
  const openMarkPos = textBefore.lastIndexOf('<%')

  const options: Completion[] = conditionalKeywords.map(kw => ({
    label: kw.label,
    type: "keyword",
    detail: kw.detail,
    apply: (view, _completion, from, to) => {
      const insert = kw.insert

      // For outdenting keywords (else, elseif, endif), remove one level of indentation
      // Note: outdenting only works for single cursor (complex line manipulation)
      if (kw.outdent && openMarkPos > 0 && view.state.selection.ranges.length === 1) {
        const unit = getIndentUnit(view.state)
        const leadingWhitespace = textBefore.slice(0, openMarkPos)

        // Calculate new indentation (one level less)
        let currentIndent = 0
        for (const ch of leadingWhitespace) {
          if (ch === ' ') currentIndent++
          else if (ch === '\t') currentIndent += unit
        }
        const newIndent = Math.max(0, currentIndent - unit)
        const newWhitespace = ' '.repeat(newIndent)

        // Replace from start of line
        const fullInsert = newWhitespace + '<%' + insert
        const cursorOffset = (kw.label === "elseif")
          ? fullInsert.indexOf('[') + 1
          : fullInsert.length

        view.dispatch({
          changes: { from: line.from, to, insert: fullInsert },
          selection: { anchor: line.from + cursorOffset }
        })
      } else {
        // Normal insert (for "if" or when not indented, or multi-cursor)
        const cursorOffset = (kw.label === "if" || kw.label === "elseif")
          ? insert.indexOf('[') + 1
          : insert.length
        const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: from + cursorOffset }
        })
      }
    }
  }))

  return {
    from,
    to: pos,
    options,
    validFor: /^\s*\w*$/
  }
}

// ============================================================================
// Pragma Completion (\define, \procedure, \function, etc.)
// ============================================================================

const pragmaKeywords: { label: string; detail: string; insert: string; cursorOffset?: number }[] = [
  { label: "define", detail: "Define a macro", insert: "define name()\n\n\\end", cursorOffset: 8 },
  { label: "procedure", detail: "Define a procedure", insert: "procedure name()\n\n\\end", cursorOffset: 11 },
  { label: "function", detail: "Define a function", insert: "function name()\n\n\\end", cursorOffset: 10 },
  { label: "widget", detail: "Define a widget", insert: "widget $name()\n\n\\end", cursorOffset: 8 },
  { label: "import", detail: "Import tiddlers", insert: "import [filter]", cursorOffset: 8 },
  { label: "rules", detail: "Set parser rules", insert: "rules only ", cursorOffset: 11 },
  { label: "parameters", detail: "Declare parameters", insert: "parameters()", cursorOffset: 11 },
  { label: "whitespace", detail: "Whitespace handling", insert: "whitespace trim", cursorOffset: 15 },
  { label: "end", detail: "End a definition", insert: "end", cursorOffset: 3 },
]

/**
 * Pragma completion source (after \ at start of line)
 */
function pragmaCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  // Get text before cursor on current line
  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  // Match: start of line, optional whitespace, backslash, then partial keyword
  // The backslash must be the first non-whitespace character
  const match = /^(\s*)\\(\w*)$/.exec(textBefore)
  if (!match) return null

  const leadingWhitespace = match[1]
  // match[2] is the partial keyword typed so far (used by validFor)
  // Replace from after the backslash
  const from = line.from + leadingWhitespace.length + 1  // +1 for the backslash

  const options: Completion[] = pragmaKeywords.map(kw => ({
    label: kw.label,
    type: "keyword",
    detail: kw.detail,
    apply: (view, _completion, from, to) => {
      const insert = kw.insert
      const cursorPos = from + (kw.cursorOffset ?? insert.length)

      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: cursorPos }
      })
    }
  }))

  return {
    from,
    to: pos,
    options,
    validFor: /^\w*$/
  }
}

/**
 * Completion for \end followed by space - shows names of open pragma definitions
 */
function pragmaEndNameCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  // Get text before cursor on current line
  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  // Match: start of line, optional whitespace, \end, whitespace, then partial name
  const match = /^(\s*)\\end\s+(\S*)$/.exec(textBefore)
  if (!match) return null

  // match[2] is the partial name typed so far (used by validFor for filtering)
  // Find the position where the name starts (after \end and space)
  const from = line.from + textBefore.length - match[2].length

  // Get the syntax tree and find open pragma definitions
  const tree = syntaxTree(context.state)
  const openPragmas: { name: string; type: string }[] = []

  // Walk up from current position to find enclosing pragma definitions
  // We look for nodes that contain the cursor position
  tree.iterate({
    enter: (node) => {
      const nodeType = node.name
      if (nodeType === "MacroDefinition" ||
          nodeType === "ProcedureDefinition" ||
          nodeType === "FunctionDefinition" ||
          nodeType === "WidgetDefinition") {
        // Check if cursor is inside this definition
        if (node.from <= pos && node.to >= pos) {
          // Find the PragmaName child to get the actual name
          let pragmaName: string | null = null
          const cursor = node.node.cursor()
          cursor.firstChild()
          do {
            if (cursor.name === "PragmaName") {
              pragmaName = doc.sliceString(cursor.from, cursor.to)
              break
            }
          } while (cursor.nextSibling())

          if (pragmaName) {
            openPragmas.push({
              name: pragmaName,
              type: nodeType.replace("Definition", "")
            })
          }
        }
      }
    }
  })

  if (openPragmas.length === 0) return null

  // Create completion options from open pragmas (innermost first for priority)
  const options: Completion[] = openPragmas.reverse().map((pragma, index) => ({
    label: pragma.name,
    type: "variable",
    detail: `Close ${pragma.type.toLowerCase()}`,
    boost: openPragmas.length - index  // Innermost gets highest boost
  }))

  return {
    from,
    to: pos,
    options,
    validFor: /^\S*$/
  }
}
