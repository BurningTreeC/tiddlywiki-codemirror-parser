/**
 * @codemirror/lang-tiddlywiki - Main Entry Point
 * 
 * CodeMirror 6 Language Support für TiddlyWiki5 Wikitext.
 */

import {Prec, EditorState} from "@codemirror/state"
import {KeyBinding, keymap, EditorView} from "@codemirror/view"
import {Language, LanguageSupport, LanguageDescription, syntaxTree} from "@codemirror/language"
import {Completion, CompletionContext} from "@codemirror/autocomplete"
import {TiddlyWikiExtension, TiddlyWikiParser} from "./tiddlywiki"
import {html, htmlCompletionSource} from "@codemirror/lang-html"
import {tiddlywikiBaseLanguage, tiddlywikiLanguage, mkLang, getCodeParser, headerIndent} from "./codemirror-tiddlywiki"
import {
  insertNewlineContinueMarkup,
  insertNewlineContinueMarkupCommand,
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
  insertMacroCall,
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
  insertHorizontalRule
} from "./commands"

// Re-exports
export {
  tiddlywikiBaseLanguage,
  tiddlywikiLanguage,
  insertNewlineContinueMarkup,
  insertNewlineContinueMarkupCommand,
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
  insertMacroCall,
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
  insertHorizontalRule
}

// ============================================================================
// Keymap
// ============================================================================

/// Standard-Keymap für TiddlyWiki mit häufig verwendeten Tastenkombinationen
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

// HTML Support ohne Tag-Matching (für eingebettetes HTML)
const htmlNoMatch = html({matchClosingTags: false})

// ============================================================================
// Main Language Support Function
// ============================================================================

/// TiddlyWiki Language Support mit Konfiguration
export function tiddlywiki(config: {
  /// Standard-Sprache für Code-Blöcke ohne Sprach-Info
  defaultCodeLanguage?: Language | LanguageSupport
  /// Sprachen für Syntax-Highlighting in Code-Blöcken
  codeLanguages?: readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null)
  /// Keymap aktivieren (Standard: true)
  addKeymap?: boolean
  /// Parser-Erweiterungen
  extensions?: TiddlyWikiExtension
  /// Basis-Sprache (Standard: tiddlywikiBaseLanguage)
  base?: Language
  /// HTML-Tag Autocompletion (Standard: true)
  completeHTMLTags?: boolean
  /// Widget Autocompletion (Standard: true)
  completeWidgets?: boolean
  /// Macro Autocompletion (Standard: true)
  completeMacros?: boolean
  /// HTML Tag Language für eingebettetes HTML
  htmlTagLanguage?: LanguageSupport
} = {}) {
  let {
    codeLanguages,
    defaultCodeLanguage,
    addKeymap = true,
    base: {parser} = tiddlywikiBaseLanguage,
    completeHTMLTags = true,
    completeWidgets = true,
    completeMacros = true,
    htmlTagLanguage = htmlNoMatch
  } = config

  if (!(parser instanceof TiddlyWikiParser)) {
    throw new RangeError("Base parser provided to `tiddlywiki` should be a TiddlyWiki parser")
  }

  let extensions = config.extensions ? [config.extensions] : []
  let support = [htmlTagLanguage.support, headerIndent]
  let defaultCode: Language | undefined

  if (defaultCodeLanguage instanceof LanguageSupport) {
    support.push(defaultCodeLanguage.support)
    defaultCode = defaultCodeLanguage.language
  } else if (defaultCodeLanguage) {
    defaultCode = defaultCodeLanguage
  }

  // Keymap hinzufügen
  if (addKeymap) {
    support.push(Prec.high(keymap.of(tiddlywikiKeymap)))
  }

  let lang = mkLang(parser.configure(extensions))

  // Autocompletion
  if (completeHTMLTags) {
    support.push(lang.data.of({autocomplete: htmlTagCompletion}))
  }
  if (completeWidgets) {
    support.push(lang.data.of({autocomplete: widgetCompletion}))
  }
  if (completeMacros) {
    support.push(lang.data.of({autocomplete: macroCompletion}))
  }

  return new LanguageSupport(lang, support)
}

// ============================================================================
// Autocompletion Functions
// ============================================================================

function htmlTagCompletion(context: CompletionContext) {
  let {state, pos} = context
  let m = /<[:\-\.\w\u00b7-\uffff]*$/.exec(state.sliceDoc(pos - 25, pos))
  if (!m) return null
  
  let tree = syntaxTree(state).resolveInner(pos, -1)
  while (tree && !tree.type.isTop) {
    if (tree.name == "FencedCode" || tree.name == "CodeBlock" ||
        tree.name == "CommentBlock" || tree.name == "Widget") {
      return null
    }
    tree = tree.parent!
  }

  return {
    from: pos - m[0].length,
    to: pos,
    options: htmlTagCompletions(),
    validFor: /^<[:\-\.\w\u00b7-\uffff]*$/
  }
}

let _tagCompletions: readonly Completion[] | null = null
function htmlTagCompletions() {
  if (_tagCompletions) return _tagCompletions
  let result = htmlCompletionSource(new CompletionContext(EditorState.create({extensions: htmlNoMatch}), 0, true))
  return _tagCompletions = result ? result.options : []
}

// TiddlyWiki Core Widgets
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

function widgetCompletion(context: CompletionContext) {
  let {state, pos} = context
  let m = /<\$[\w\-]*$/.exec(state.sliceDoc(pos - 30, pos))
  if (!m) return null

  let tree = syntaxTree(state).resolveInner(pos, -1)
  while (tree && !tree.type.isTop) {
    if (tree.name == "FencedCode" || tree.name == "CodeBlock" || tree.name == "CommentBlock") {
      return null
    }
    tree = tree.parent!
  }

  return {
    from: pos - m[0].length,
    to: pos,
    options: coreWidgets.map(w => ({
      label: "<" + w,
      type: "keyword",
      detail: "widget",
      apply: "<" + w + ">"
    })),
    validFor: /^<\$[\w\-]*$/
  }
}

// Common TiddlyWiki Macros
const commonMacros = [
  "now", "tag", "tabs", "timeline", "toc", "toc-hierarchical", "toc-selective-expandable",
  "list-links", "list-links-draggable", "list-tagged-draggable", "copy-to-clipboard",
  "colour-picker", "image-picker", "keyboard-shortcut", "dumpvariables", "qualify",
  "csvtiddlers", "jsontiddlers", "datauri", "makedatauri", "translink"
]

function macroCompletion(context: CompletionContext) {
  let {state, pos} = context
  let m = /<<[\w\-]*$/.exec(state.sliceDoc(pos - 30, pos))
  if (!m) return null

  let tree = syntaxTree(state).resolveInner(pos, -1)
  while (tree && !tree.type.isTop) {
    if (tree.name == "FencedCode" || tree.name == "CodeBlock" || tree.name == "CommentBlock") {
      return null
    }
    tree = tree.parent!
  }

  return {
    from: pos - m[0].length,
    to: pos,
    options: commonMacros.map(m => ({
      label: "<<" + m,
      type: "function",
      detail: "macro",
      apply: "<<" + m + ">>"
    })),
    validFor: /^<<[\w\-]*$/
  }
}

// ============================================================================
// Paste URL as Link Extension
// ============================================================================

const nonPlainText = /code|horizontalrule|html|link|comment|transclusion|macro|widget|escape|entity|image|mark|url/i

/// Extension die URLs beim Einfügen automatisch als WikiLinks formatiert
export const pasteURLAsLink = EditorView.domEventHandlers({
  paste: (event, view) => {
    let {main} = view.state.selection
    if (main.empty) return false
    
    let link = event.clipboardData?.getData("text/plain")
    if (!link || !/^(https?:\/\/|mailto:|xmpp:|www\.)/.test(link)) return false
    if (/^www\./.test(link)) link = "https://" + link
    
    if (!tiddlywikiLanguage.isActiveAt(view.state, main.from, 1)) return false
    
    let tree = syntaxTree(view.state)
    let crossesNode = false
    
    tree.iterate({
      from: main.from,
      to: main.to,
      enter: node => { if (node.from > main.from || nonPlainText.test(node.name)) crossesNode = true },
      leave: node => { if (node.to < main.to) crossesNode = true }
    })
    
    if (crossesNode) return false
    
    // TiddlyWiki external link format
    let text = view.state.doc.sliceString(main.from, main.to)
    view.dispatch({
      changes: [{from: main.from, to: main.to, insert: `[ext[${text}|${link}]]`}],
      userEvent: "input.paste",
      scrollIntoView: true
    })
    return true
  }
})

// ============================================================================
// Re-exports from Parser
// ============================================================================

export {
  parser,
  TiddlyWikiParser,
  TiddlyWikiConfig,
  TiddlyWikiExtension,
  Type,
  BlockContext,
  InlineContext,
  Element,
  LeafBlock,
  Line
} from "./tiddlywiki"

export {
  TiddlyWikiExtensions,
  MathExtension,
  CommentExtension,
  RawExtension,
  StyleExtension
} from "./extension"
