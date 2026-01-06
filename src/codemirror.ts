/**
 * @codemirror/lang-tiddlywiki - Main Entry Point
 *
 * CodeMirror 6 Language Support für TiddlyWiki5 Wikitext.
 */

import { EditorView } from "@codemirror/view"
import { syntaxTree } from "@codemirror/language"

// Re-export everything from the new parser
export {
  // Types
  Type, BlockTypes, CompositeBlockTypes,

  // Core classes and interfaces
  Element, elt, Line, CompositeBlock, LeafBlock,
  BlockParser, LeafBlockParser, InlineParser, PragmaParser,
  BlockResult, DelimiterType, InlineDelimiter,
  TiddlyWikiConfig, NodeSpec,
  Ch, space, lineEnd, Punctuation,

  // Context classes
  BlockContext,
  InlineContext, parseInline,

  // Pragma parsers
  MacroDefPragma, FnProcDefPragma, RulesPragma,
  ImportPragma, ParametersPragma, WhitespacePragma,
  DefaultPragmaParsers,

  // Block parsers
  Heading, HorizontalRule, FencedCode, TypedBlock,
  List, Table, CommentBlock,
  TransclusionBlock, FilteredTransclusionBlock, MacroCallBlock,
  HTMLBlock,
  DefaultBlockParsers,

  // Inline parsers
  Escape, Entity, InlineCode,
  Bold, Italic, Underline, Strikethrough, Superscript, Subscript, Highlight,
  WikiLink, ExternalLink, ImageLink,
  Transclusion, FilteredTransclusion, MacroCall,
  Widget, HTMLTag, Dash, CamelCaseLink, SystemLink, URLAutoLink,
  DefaultInlineParsers,

  // Main parser
  TiddlyWikiParser, parser,

  // Language support
  tiddlywikiLanguage, headerIndent, mkLang, getCodeParser,
  tiddlywiki, tiddlywikiHighlightStyle, tiddlywikiKeymap,
  TiddlyWikiLanguageConfig,
} from "./parser"

import { tiddlywikiLanguage } from "./parser"

// Re-export commands
export {
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

// Re-export linter
export {
  substitutedParamLinter,
  tiddlywikiLinter
} from "./linter"

// ============================================================================
// Paste URL as Link Extension
// ============================================================================

const nonPlainText = /code|horizontalrule|html|link|comment|transclusion|macro|widget|escape|entity|image|mark|url/i

/// Extension die URLs beim Einfügen automatisch als WikiLinks formatiert
export const pasteURLAsLink = EditorView.domEventHandlers({
  paste: (event, view) => {
    let { main } = view.state.selection
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
      changes: [{ from: main.from, to: main.to, insert: `[ext[${text}|${link}]]` }],
      userEvent: "input.paste",
      scrollIntoView: true
    })
    return true
  }
})

