/**
 * TiddlyWiki Parser - Main Parser Class
 *
 * The main parser that combines all the components following the Lezer architecture.
 */

import {
  Parser, Tree, TreeFragment, Input, PartialParse,
  // @ts-expect-error TS(6133): 'NodeProp' is declared but its value is never read... Remove this comment to see the full error message
  NodeType, NodeSet, NodeProp, ParseWrapper
} from "@lezer/common"
import { styleTags, tags as t, Tag } from "@lezer/highlight"
import { Type } from "./types"
import {
  Element, BlockParser, InlineParser, PragmaParser,
  // @ts-expect-error TS(6133): 'NodeSpec' is declared but its value is never read... Remove this comment to see the full error message
  TiddlyWikiConfig, NodeSpec
} from "./core"
import { BlockContext } from "./block-context"
// @ts-expect-error TS(6133): 'InlineContext' is declared but its value is never... Remove this comment to see the full error message
import { InlineContext, parseInline } from "./inline-context"
import { DefaultPragmaParsers } from "./pragma-parsers"
import { DefaultBlockParsers } from "./block-parsers"
import { DefaultInlineParsers } from "./inline-parsers"

/**
 * TiddlyWiki-specific syntax highlighting tags
 */
export const twTags = {
  twTransclusion: Tag.define(),
  twMacro: Tag.define(),
  twWidget: Tag.define(),
  twFilter: Tag.define(),
  twPragma: Tag.define(),
  twVariable: Tag.define(),
  twSuperscript: Tag.define(),
  twSubscript: Tag.define(),
}

/**
 * Default style tags for TiddlyWiki syntax
 */
const defaultStyleTags = styleTags({
  // Headings
  "Heading1/...": t.heading1,
  "Heading2/...": t.heading2,
  "Heading3/...": t.heading3,
  "Heading4/...": t.heading4,
  "Heading5/...": t.heading5,
  "Heading6/...": t.heading6,
  HeadingMark: t.processingInstruction,

  // Emphasis
  "Bold/...": t.strong,
  "Italic/...": t.emphasis,
  "Underline/...": t.special(t.emphasis),
  "Strikethrough/...": t.strikethrough,
  "Superscript/...": twTags.twSuperscript,
  "Subscript/...": twTags.twSubscript,
  "Highlight/...": t.special(t.content),
  HighlightStyles: t.string,  // CSS styles - will be overlaid with CSS parser
  "BoldMark ItalicMark UnderlineMark StrikethroughMark SuperscriptMark SubscriptMark HighlightMark": t.processingInstruction,

  // Code
  "InlineCode FencedCode TypedBlock CodeText": t.monospace,
  "CodeMark TypedBlockMark InlineCodeMark": t.processingInstruction,
  CodeInfo: t.labelName,
  TypedBlockType: t.labelName,

  // KaTeX/LaTeX Math
  // Note: styleTags are defined here (not dynamically) to ensure they're always
  // in the base nodeSet. The KaTeX PARSERS are added dynamically in tiddlywiki.ts
  // when enableKaTeX is true, but the styling must be present in the base nodeSet
  // for proper highlighting when KaTeX content is parsed via parseContentRange.
  KaTeXBlock: t.monospace,
  LaTeXContent: t.monospace,
  KaTeXMark: t.processingInstruction,

  // Links
  "WikiLink ExternalLink CamelCaseLink": t.link,
  "WikiLinkMark ExtLinkMark": t.processingInstruction,
  LinkText: t.string,
  LinkTarget: t.link,  // Internal wiki link target - same color as CamelCaseLink
  LinkSeparator: t.processingInstruction,

  // Images
  ImageLink: t.link,
  ImageMark: t.processingInstruction,
  ImageSource: t.url,
  ImageTooltip: t.string,

  // URLs
  "URLLink SystemLink": t.url,

  // Transclusions
  "Transclusion TransclusionBlock": t.special(t.link),
  "TransclusionMark": t.processingInstruction,
  TransclusionTarget: t.special(t.string),
  TransclusionTemplate: t.special(t.string),
  "TransclusionFieldMark TransclusionIndexMark": t.processingInstruction,
  TransclusionField: t.propertyName,
  TransclusionIndex: t.propertyName,

  // Filtered transclusions
  "FilteredTransclusion FilteredTransclusionBlock": t.special(t.link),
  "FilteredTransclusionMark": t.processingInstruction,
  FilterExpression: t.special(t.string),

  // Macros
  "MacroCall MacroCallBlock": t.macroName,
  MacroCallMark: t.processingInstruction,
  MacroName: t.macroName,
  MacroParam: t.attributeValue,
  MacroParamName: t.attributeName,
  MacroParamValue: t.attributeValue,

  // Widgets and HTML
  // Note: Widget/HTMLBlock containers are NOT styled - only their name elements
  // Otherwise all content inside widgets would get widget styling
  WidgetName: t.tagName,
  TagName: t.tagName,
  InvalidWidget: t.invalid,  // <$ followed by space - invalid widget syntax
  IncompleteWidget: t.invalid,    // <$widget ... (missing closing >)
  IncompleteHTMLTag: t.invalid,   // <tag ... (missing closing >) - inline
  IncompleteHTMLBlock: t.invalid, // <tag ... (missing closing >) - block level
  // TagMark intentionally unstyled - < and > brackets should be default text color
  Attribute: t.attributeName,
  AttributeName: t.attributeName,
  "AttributeValue AttributeString": t.attributeValue,
  AttributeNumber: t.number,
  AttributeIndirect: t.special(t.link),      // Same as Transclusion
  AttributeFiltered: t.special(t.link),      // Same as FilteredTransclusion
  AttributeMacro: t.macroName,               // Same as MacroCall
  AttributeSubstituted: t.special(t.string), // Substituted strings
  AttributeParamRef: t.special(t.variableName), // @param reference
  AttributeWikitext: t.attributeValue,       // Attribute containing wikitext (inherits from content)
  SelfClosingMarker: t.processingInstruction,

  // Lists
  "BulletList OrderedList DefinitionList": t.list,
  "ListItem DefinitionTerm DefinitionDescription": t.list,
  ListMark: t.processingInstruction,

  // Block quotes
  BlockQuote: t.quote,
  QuoteMark: t.processingInstruction,
  BlockQuoteClass: t.className,

  // Tables
  "Table TableRow": t.content,
  "TableHeader TableHeaderCell": t.heading,
  TableCell: t.content,
  TableDelimiter: t.processingInstruction,

  // Horizontal rule
  HorizontalRule: t.contentSeparator,

  // Hard line breaks (""" ... """)
  HardLineBreaks: t.content,
  HardLineBreaksMark: t.processingInstruction,

  // Comments
  "CommentBlock CommentMarker": t.comment,

  // Pragmas - parent nodes intentionally unstyled to avoid styling gaps between children
  PragmaMark: t.processingInstruction,
  PragmaKeyword: t.keyword,
  PragmaName: t.definition(t.macroName),
  PragmaParams: t.definition(t.variableName),
  PragmaBody: t.content,
  PragmaEnd: t.keyword,

  // Special
  Escape: t.escape,
  Entity: t.character,
  Dash: t.punctuation,
  Variable: t.special(t.variableName),
  VariableMark: t.processingInstruction,
  VariableName: t.variableName,
  FilterSubstitution: t.special(t.string),
  FilterSubstitutionMark: t.processingInstruction,
  Placeholder: t.special(t.variableName),
  PlaceholderMark: t.processingInstruction,
  SubstitutedParam: t.special(t.variableName),
  SubstitutedParamMark: t.processingInstruction,
  SubstitutedParamName: t.variableName,
  HardBreak: t.processingInstruction,

  // Filter expression components
  FilterRun: t.content,
  FilterOperator: t.operator,
  FilterOperatorName: t.operatorKeyword,
  FilterOperand: t.string,
  FilterVariable: t.variableName,
  FilterMultiVariable: t.variableName,
  FilterTextRef: t.special(t.string),
  FilterRegexp: t.regexp,
  IncompleteFilterRun: t.content,  // Container for incomplete filter in plain text

  // Multi-valued variable display
  MVVDisplay: t.special(t.link),
  MVVDisplayMark: t.processingInstruction,
  MVVSeparatorMark: t.processingInstruction,
  MVVSeparatorValue: t.string,
  AttributeMVV: t.special(t.link),

  // Styled blocks
  StyledBlock: t.content,
  StyledBlockMark: t.processingInstruction,
  StyledBlockClass: t.className,

  // Conditionals
  ConditionalBlock: t.content,
  Conditional: t.content,
  ConditionalMark: t.processingInstruction,
  ConditionalKeyword: t.controlKeyword,
  ConditionalBranch: t.content,

  // Generic
  Paragraph: t.content,
  Text: t.content,
  Mark: t.processingInstruction,
  ProcessingInstruction: t.processingInstruction,
})

/**
 * Create the default node set for TiddlyWiki
 */
function createNodeSet(): NodeSet {
  const nodeTypes: NodeType[] = []

  // Create node types for each Type enum value
  const typeNames = Object.keys(Type).filter(k => isNaN(Number(k)))

  for (const name of typeNames) {
    const id = (Type as any)[name] as number
    if (typeof id !== "number") continue

    // Ensure the array is large enough
    while (nodeTypes.length <= id) {
      nodeTypes.push(NodeType.none)
    }

    nodeTypes[id] = NodeType.define({
      id,
      name,
      props: [],
    })
  }

  return new NodeSet(nodeTypes).extend(defaultStyleTags)
}

/**
 * The main TiddlyWiki parser class
 */
export class TiddlyWikiParser extends Parser {
  parse: any;
  readonly nodeSet: NodeSet
  readonly pragmaParsers: readonly PragmaParser[]
  readonly blockParsers: readonly BlockParser[]
  readonly inlineParsers: readonly InlineParser[]
  private wrapFn?: ParseWrapper

  constructor(
    nodeSet?: NodeSet,
    pragmaParsers?: readonly PragmaParser[],
    blockParsers?: readonly BlockParser[],
    inlineParsers?: readonly InlineParser[],
    wrapFn?: ParseWrapper
  ) {
    super()
    this.nodeSet = nodeSet || createNodeSet()
    this.pragmaParsers = pragmaParsers || DefaultPragmaParsers
    this.blockParsers = blockParsers || DefaultBlockParsers
    this.inlineParsers = inlineParsers || DefaultInlineParsers
    this.wrapFn = wrapFn
  }

  /**
   * Create a partial parse for incremental parsing
   */
  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number, to: number }[]
  ): PartialParse {
    const inner = new BlockContext(this, input, fragments, ranges)
    if (this.wrapFn) {
      return this.wrapFn(inner, input, fragments, ranges)
    }
    return inner
  }

  /**
   * Configure the parser with additional rules or modifications
   */
  configure(config: TiddlyWikiConfig): TiddlyWikiParser {
    let nodeSet = this.nodeSet
    let pragmaParsers = [...this.pragmaParsers]
    let blockParsers = [...this.blockParsers]
    let inlineParsers = [...this.inlineParsers]
    let wrapFn = config.wrap || this.wrapFn

    // Remove specified parsers
    if (config.remove) {
      const toRemove = new Set(config.remove)
      pragmaParsers = pragmaParsers.filter(p => !toRemove.has(p.name))
      blockParsers = blockParsers.filter(p => !toRemove.has(p.name))
      inlineParsers = inlineParsers.filter(p => !toRemove.has(p.name))
    }

    // Add new parsers
    if (config.parsePragma) {
      for (const parser of config.parsePragma) {
        pragmaParsers = insertParser(pragmaParsers, parser)
      }
    }

    if (config.parseBlock) {
      for (const parser of config.parseBlock) {
        blockParsers = insertParser(blockParsers, parser)
      }
    }

    if (config.parseInline) {
      for (const parser of config.parseInline) {
        inlineParsers = insertParser(inlineParsers, parser)
      }
    }

    // Add new node types if needed
    if (config.defineNodes) {
      const types = [...nodeSet.types]
      for (const spec of config.defineNodes) {
        const name = typeof spec === "string" ? spec : spec.name
        const id = types.length
        types.push(NodeType.define({ id, name, props: [] }))
      }
      nodeSet = new NodeSet(types)
    }

    // Apply props (always, not just when defineNodes is set)
    if (config.props) {
      for (const source of config.props) {
        nodeSet = nodeSet.extend(source)
      }
    }

    return new TiddlyWikiParser(nodeSet, pragmaParsers, blockParsers, inlineParsers, wrapFn)
  }

  /**
   * Parse inline content
   */
  parseInline(text: string, offset: number): readonly Element[] {
    return parseInline(this, text, offset)
  }

  /**
   * Parse content as a full document (including pragmas)
   *
   * This is used for parsing content inside triple-quoted attribute values
   * which can contain full wikitext including pragma definitions.
   *
   * @param text The text content to parse
   * @param offset Position offset to add to all element positions
   * @returns Array of parsed elements
   */
  parseContent(text: string, offset: number): Element[] {
    if (!text.trim()) return []

    // Parse the text as a full document
    const tree = this.parse(text)

    // Extract elements from the tree
    return this.extractElementsFromTree(tree, offset)
  }

  /**
   * Extract Elements from a parsed Tree, adjusting positions by offset
   */
  private extractElementsFromTree(tree: Tree, offset: number): Element[] {
    const elements: Element[] = []
    const cursor = tree.cursor()

    // Skip the Document node, get its children
    if (cursor.firstChild()) {
      do {
        const element = this.nodeToElement(cursor, offset)
        if (element) {
          elements.push(element)
        }
      } while (cursor.nextSibling())
    }

    return elements
  }

  /**
   * Convert a tree node (at cursor position) to an Element
   */
  private nodeToElement(cursor: any, offset: number): Element | null {
    const typeName = cursor.type.name
    const from = cursor.from + offset
    const to = cursor.to + offset

    // Check if this node type exists in TiddlyWiki's Type enum
    const typeId = (Type as any)[typeName]

    if (typeId === undefined || typeof typeId !== "number") {
      // Foreign node (e.g., from LaTeX mixed-language parsing)
      // Map known wrapper types to TiddlyWiki types
      if (typeName === "LaTeX") {
        return new Element(Type.LaTeXContent, from, to, [])
      }
      if (typeName === "JavaScript" || typeName === "CSS" || typeName === "Script") {
        return new Element(Type.CodeText, from, to, [])
      }
      // Unknown foreign node - skip it
      return null
    }

    // Known TiddlyWiki node - recursively convert children
    const children: Element[] = []
    if (cursor.firstChild()) {
      do {
        const child = this.nodeToElement(cursor, offset)
        if (child) {
          children.push(child)
        }
      } while (cursor.nextSibling())
      cursor.parent()
    }

    return new Element(typeId, from, to, children)
  }
}

/**
 * Insert a parser in the correct position based on before/after
 */
function insertParser<T extends { name: string, before?: string, after?: string }>(
  parsers: T[],
  parser: T
): T[] {
  const result = [...parsers]

  if (parser.before) {
    const index = result.findIndex(p => p.name === parser.before)
    if (index >= 0) {
      result.splice(index, 0, parser)
      return result
    }
  }

  if (parser.after) {
    const index = result.findIndex(p => p.name === parser.after)
    if (index >= 0) {
      result.splice(index + 1, 0, parser)
      return result
    }
  }

  result.push(parser)
  return result
}

/**
 * The default TiddlyWiki parser instance
 */
export const parser = new TiddlyWikiParser()
