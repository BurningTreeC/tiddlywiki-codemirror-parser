/**
 * TiddlyWiki Parser - Main Parser Class
 *
 * The main parser that combines all the components following the Lezer architecture.
 */

import {
  Parser, Tree, TreeFragment, Input, PartialParse,
  NodeType, NodeSet, NodeProp
} from "@lezer/common"
import { styleTags, tags as t, Tag } from "@lezer/highlight"
import { Type } from "./types"
import {
  Element, BlockParser, InlineParser, PragmaParser,
  TiddlyWikiConfig, NodeSpec
} from "./core"
import { BlockContext } from "./block-context"
import { InlineContext, parseInline } from "./inline-context"
import { DefaultPragmaParsers } from "./pragma-parsers"
import { DefaultBlockParsers } from "./block-parsers"
import { DefaultInlineParsers } from "./inline-parsers"

/**
 * TiddlyWiki-specific syntax highlighting tags
 */
const twTags = {
  twTransclusion: Tag.define(),
  twMacro: Tag.define(),
  twWidget: Tag.define(),
  twFilter: Tag.define(),
  twPragma: Tag.define(),
  twVariable: Tag.define(),
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
  "Superscript/...": t.special(t.content),
  "Subscript/...": t.special(t.content),
  "Highlight/...": t.special(t.content),
  "BoldMark ItalicMark UnderlineMark StrikethroughMark SuperscriptMark SubscriptMark HighlightMark": t.processingInstruction,

  // Code
  "InlineCode FencedCode TypedBlock CodeText": t.monospace,
  "CodeMark TypedBlockMark InlineCodeMark": t.processingInstruction,
  CodeInfo: t.labelName,
  TypedBlockType: t.labelName,

  // Links
  "WikiLink ExternalLink CamelCaseLink": t.link,
  "WikiLinkMark ExtLinkMark": t.processingInstruction,
  LinkText: t.string,
  LinkTarget: t.url,
  LinkSeparator: t.processingInstruction,

  // Images
  ImageLink: t.link,
  ImageMark: t.processingInstruction,
  ImageSource: t.url,

  // URLs
  "URLLink SystemLink": t.url,

  // Transclusions
  "Transclusion TransclusionBlock": t.special(t.link),
  "TransclusionMark": t.processingInstruction,
  TransclusionTarget: t.special(t.string),
  TransclusionTemplate: t.special(t.string),
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
  "Widget InlineWidget HTMLBlock HTMLTag": t.tagName,
  WidgetName: t.tagName,
  TagName: t.tagName,
  Attribute: t.attributeName,
  AttributeName: t.attributeName,
  "AttributeValue AttributeString AttributeNumber": t.attributeValue,
  AttributeIndirect: t.special(t.attributeValue),
  AttributeFiltered: t.special(t.attributeValue),
  AttributeMacro: t.special(t.attributeValue),
  AttributeSubstituted: t.special(t.attributeValue),
  SelfClosingMarker: t.processingInstruction,

  // Lists
  "BulletList OrderedList DefinitionList": t.list,
  "ListItem DefinitionTerm DefinitionDescription": t.list,
  ListMark: t.processingInstruction,

  // Block quotes
  BlockQuote: t.quote,
  QuoteMark: t.processingInstruction,

  // Tables
  "Table TableRow": t.content,
  "TableHeader TableHeaderCell": t.heading,
  TableCell: t.content,
  TableDelimiter: t.processingInstruction,

  // Horizontal rule
  HorizontalRule: t.contentSeparator,

  // Comments
  "CommentBlock CommentMarker": t.comment,

  // Pragmas
  "MacroDefinition ProcedureDefinition FunctionDefinition WidgetDefinition": t.definitionKeyword,
  "RulesPragma ImportPragma ParametersPragma WhitespacePragma": t.definitionKeyword,
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
  Variable: t.variableName,
  HardBreak: t.processingInstruction,

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
  readonly nodeSet: NodeSet
  readonly pragmaParsers: readonly PragmaParser[]
  readonly blockParsers: readonly BlockParser[]
  readonly inlineParsers: readonly InlineParser[]

  constructor(
    nodeSet?: NodeSet,
    pragmaParsers?: readonly PragmaParser[],
    blockParsers?: readonly BlockParser[],
    inlineParsers?: readonly InlineParser[]
  ) {
    super()
    this.nodeSet = nodeSet || createNodeSet()
    this.pragmaParsers = pragmaParsers || DefaultPragmaParsers
    this.blockParsers = blockParsers || DefaultBlockParsers
    this.inlineParsers = inlineParsers || DefaultInlineParsers
  }

  /**
   * Create a partial parse for incremental parsing
   */
  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number, to: number }[]
  ): PartialParse {
    return new BlockContext(this, input, fragments, ranges)
  }

  /**
   * Configure the parser with additional rules or modifications
   */
  configure(config: TiddlyWikiConfig): TiddlyWikiParser {
    let nodeSet = this.nodeSet
    let pragmaParsers = [...this.pragmaParsers]
    let blockParsers = [...this.blockParsers]
    let inlineParsers = [...this.inlineParsers]

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

    return new TiddlyWikiParser(nodeSet, pragmaParsers, blockParsers, inlineParsers)
  }

  /**
   * Parse inline content
   */
  parseInline(text: string, offset: number): readonly Element[] {
    return parseInline(this, text, offset)
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
