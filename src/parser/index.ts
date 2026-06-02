/**
 * TiddlyWiki Parser - Main Entry Point
 *
 * A Lezer-style incremental parser for TiddlyWiki wikitext.
 * Follows the architecture of @lezer/markdown.
 */

// Types
export { Type, BlockTypes, CompositeBlockTypes } from "./types"

// Core classes and interfaces
export {
  Element, elt, Line, CompositeBlock, LeafBlock,
  BlockParser, LeafBlockParser, InlineParser, PragmaParser,
  BlockResult, DelimiterType, InlineDelimiter,
  TiddlyWikiConfig, NodeSpec,
  Ch, space, lineEnd, Punctuation,
} from "./core"

// Context classes
export { BlockContext } from "./block-context"
export { InlineContext, parseInline } from "./inline-context"

// Pragma parsers
export {
  MacroDefPragma, FnProcDefPragma, RulesPragma,
  ImportPragma, ParametersPragma, WhitespacePragma,
  DefaultPragmaParsers,
} from "./pragma-parsers"

// Block parsers
export {
  Heading, HorizontalRule, FencedCode, TypedBlock,
  List, Table, CommentBlock,
  TransclusionBlock, FilteredTransclusionBlock, MacroCallBlock,
  HTMLBlock, KaTeXBlock,
  DefaultBlockParsers,
} from "./block-parsers"

// Inline parsers
export {
  Escape, Entity, InlineCode, InlineKaTeX,
  Bold, Italic, Underline, Strikethrough, Superscript, Subscript, Highlight,
  WikiLink, ExternalLink, ImageLink,
  Transclusion, FilteredTransclusion, MacroCall,
  Widget, WidgetCloseTag, HTMLTag, HTMLCloseTag, Dash, CamelCaseLink, SystemLink, URLAutoLink,
  DefaultInlineParsers,
} from "./inline-parsers"

// Main parser
export { TiddlyWikiParser, parser } from "./parser"

// Language support (CodeMirror 6 integration)
export { tiddlywikiLanguage, headerIndent, inlineConditionalFold, mkLang, getCodeParser } from "./language"
export {
  tiddlywiki,
  tiddlywikiHighlightStyle,
  tiddlywikiKeymap,
  createTiddlywikiKeymap,
  TiddlyWikiLanguageConfig,
} from "./extensions"
export type { TabBehavior, ShiftTabBehavior, EnterIndentBehavior, KeymapConfig } from "./extensions"
