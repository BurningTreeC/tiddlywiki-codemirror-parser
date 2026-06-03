/**
 * TiddlyWiki Parser - Core Classes
 *
 * Following the Lezer Markdown architecture with adaptations for TiddlyWiki.
 */

// @ts-expect-error TS(2792): Cannot find module '@lezer/common'. Did you mean t... Remove this comment to see the full error message
import { Tree, TreeBuffer, NodeType, NodeSet, NodeProp, Input } from "@lezer/common"
// @ts-expect-error TS(6133): 'CompositeBlockTypes' is declared but its value is... Remove this comment to see the full error message
import { Type, CompositeBlockTypes } from "./types"

// Character codes for common characters
export enum Ch {
  Space = 32,
  Tab = 9,
  Newline = 10,
  CarriageReturn = 13,
  Backslash = 92,
  Exclamation = 33,
  Hash = 35,
  Dollar = 36,
  Percent = 37,
  Ampersand = 38,
  Apostrophe = 39,
  LeftParen = 40,
  RightParen = 41,
  Asterisk = 42,
  Plus = 43,
  Comma = 44,
  Dash = 45,
  Dot = 46,
  Slash = 47,
  Colon = 58,
  Semicolon = 59,
  LessThan = 60,
  Equals = 61,
  GreaterThan = 62,
  Question = 63,
  At = 64,
  LeftBracket = 91,
  RightBracket = 93,
  Caret = 94,
  Underscore = 95,
  Backtick = 96,
  LeftBrace = 123,
  Pipe = 124,
  RightBrace = 125,
  Tilde = 126,
}

/**
 * Check if a character code represents whitespace (space or tab)
 */
export function space(ch: number): boolean {
  return ch === Ch.Space || ch === Ch.Tab
}

/**
 * Check if a character code represents a line ending
 */
export function lineEnd(ch: number): boolean {
  return ch === Ch.Newline || ch === Ch.CarriageReturn
}

/**
 * Punctuation characters for flanking rules
 */
export const Punctuation = /[!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~\xA1\u2010-\u2027]/

/**
 * Element represents a node in the parse tree
 */
export class Element {
  constructor(
    readonly type: number,
    readonly from: number,
    readonly to: number,
    readonly children: readonly Element[] = []
  ) {}
}

/**
 * Create an Element more concisely
 */
export function elt(type: number, from: number, to: number, children?: readonly Element[]): Element {
  return new Element(type, from, to, children)
}

/**
 * Represents a line of text being parsed
 */
export class Line {
  /** The full text of the line */
  text: string = ""
  /** Base indent level (for nested blocks) */
  baseIndent: number = 0
  /** Base position within line (after block markers) */
  basePos: number = 0
  /** Nesting depth for composite blocks */
  depth: number = 0
  /** Block markers found on this line */
  markers: Element[] = []
  /** Current parsing position within line */
  pos: number = 0
  /** Indentation at current position */
  indent: number = 0
  /** Character code at current position, or -1 at end */
  next: number = -1
  /** Position of first non-whitespace character */
  skipPos: number = 0
  /** Character code at first non-whitespace position, or -1 if all whitespace */
  skipNext: number = -1

  /**
   * Move forward past whitespace, updating pos, indent, and next
   */
  skipSpace(from: number): number {
    let pos = from
    while (pos < this.text.length) {
      const ch = this.text.charCodeAt(pos)
      if (!space(ch)) break
      pos++
    }
    return pos
  }

  /**
   * Move the base position forward
   */
  moveBase(pos: number) {
    this.basePos = pos
    this.baseIndent = this.countIndent(pos, this.text.length)
  }

  /**
   * Move the base position forward past the given number of characters
   */
  moveBaseColumn(columns: number) {
    this.moveBase(this.findColumn(columns))
  }

  /**
   * Add a block marker for this line
   */
  addMarker(elt: Element) {
    this.markers.push(elt)
  }

  /**
   * Count the indentation at a position
   */
  countIndent(to: number, from: number = 0, indent: number = 0): number {
    for (let i = from; i < to; i++) {
      const ch = this.text.charCodeAt(i)
      if (ch === Ch.Space) indent++
      else if (ch === Ch.Tab) indent += 4 - (indent % 4)
      else break
    }
    return indent
  }

  /**
   * Find the position that corresponds to a given column
   */
  findColumn(goal: number): number {
    let i = 0, col = 0
    while (i < this.text.length && col < goal) {
      const ch = this.text.charCodeAt(i)
      if (ch === Ch.Tab) col += 4 - (col % 4)
      else col++
      i++
    }
    return i
  }

  /**
   * Reset line state for a new line
   */
  reset(text: string) {
    this.text = text
    this.baseIndent = this.basePos = this.pos = this.indent = 0
    this.depth = 0
    this.markers = []
    this.next = text.length ? text.charCodeAt(0) : -1
    // Find first non-whitespace position
    this.skipPos = this.skipSpace(0)
    this.skipNext = this.skipPos < text.length ? text.charCodeAt(this.skipPos) : -1
  }

  /**
   * Get text starting from first non-whitespace character
   */
  get textAfterIndent(): string {
    return this.text.slice(this.skipPos)
  }

  /**
   * Scrub text, replacing leading block markers with spaces
   */
  scrub(): string {
    if (!this.basePos) return this.text
    let result = ""
    for (const m of this.markers) result += this.text.slice(result.length, m.from) + " ".repeat(m.to - m.from)
    return result + this.text.slice(result.length)
  }
}

/**
 * Represents a composite block (one that can contain other blocks)
 */
export class CompositeBlock {
  /** Hash for incremental parsing */
  static create(type: number, value: number, from: number, parentHash: number, end: number) {
    const hash = (parentHash + (parentHash << 8) + type + (value << 4)) | 0
    return new CompositeBlock(type, value, from, hash, end, [], [])
  }

  constructor(
    readonly type: number,
    readonly value: number,
    readonly from: number,
    readonly hash: number,
    public end: number,
    readonly children: (Tree | TreeBuffer)[],
    readonly positions: number[]
  ) {}

  addChild(child: Tree, pos: number) {
    if (child.prop(NodeProp.contextHash) !== this.hash)
      child = new Tree(child.type, child.children, child.positions, child.length, [[NodeProp.contextHash, this.hash]])
    this.children.push(child)
    this.positions.push(pos)
  }

  toTree(nodeSet: NodeSet, end: number = this.end): Tree {
    const last = this.children.length - 1
    if (last >= 0) end = Math.max(end, this.positions[last] + this.children[last].length + this.from)
    return new Tree(nodeSet.types[this.type], this.children, this.positions, end - this.from).balance({
      makeTree: (children: any, positions: any, length: any) =>
        new Tree(NodeType.none, children, positions, length, [[NodeProp.contextHash, this.hash]])
    });
  }
}

/**
 * Represents a leaf block (paragraph, heading, code block, etc.)
 */
export class LeafBlock {
  /** Block markers within this leaf */
  marks: Element[] = []
  /** Parsers attempting to handle this leaf */
  parsers: LeafBlockParser[] = []

  constructor(
    readonly start: number,
    public content: string
  ) {}
}

/**
 * Interface for block parsers
 */
export interface BlockParser {
  name: string
  parse(cx: BlockContext, line: Line): BlockResult
  before?: string
  after?: string
}

/**
 * Interface for leaf block parsers (like setext headings, tables)
 */
export interface LeafBlockParser {
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean
  finish(cx: BlockContext, leaf: LeafBlock): boolean
}

/**
 * Interface for inline parsers
 */
export interface InlineParser {
  name: string
  parse(cx: InlineContext, next: number, pos: number): number
  before?: string
  after?: string
}

/**
 * Interface for pragma parsers (TiddlyWiki-specific)
 */
export interface PragmaParser {
  name: string
  parse(cx: BlockContext, line: Line): Element[] | null
  before?: string
  after?: string
}

/**
 * Result of block parsing:
 * - false: didn't match
 * - true: consumed a leaf block
 * - null: started a composite block
 */
export type BlockResult = boolean | null

/**
 * Placeholder - will be filled in by context modules
 */
export declare class BlockContext {
  readonly parser: TiddlyWikiParser
  readonly input: Input
  lineStart: number
  get parsers(): readonly BlockParser[]
  startContext(type: number, start: number, value?: number): void
  addElement(elt: Element): void
  addNode(block: Type | Tree, from: number, to?: number): void
  addLeafElement(leaf: LeafBlock, elt: Element): void
  finishContext(): void
  elt(type: number, from: number, to: number, children?: readonly Element[]): Element
  readonly line: Line
  prevLineEnd(): number
  nextLine(): boolean
  peekLine(): string | null
}

export declare class InlineContext {
  readonly parser: TiddlyWikiParser
  readonly text: string
  readonly offset: number
  readonly end: number
  char(pos: number): number
  slice(from: number, to: number): string
  addElement(elt: Element): number
  addDelimiter(type: DelimiterType, from: number, to: number, open: boolean, close: boolean): number
  append(elt: Element | InlineDelimiter): number
  findOpeningDelimiter(type: DelimiterType): number | null
  takeContent(startIndex: number): readonly Element[]
  skipSpace(from: number): number
  elt(type: number, from: number, to: number, children?: readonly Element[]): Element
  get hasOpenLink(): boolean
}

export declare class TiddlyWikiParser {
  readonly nodeSet: NodeSet
  configure(config: TiddlyWikiConfig): TiddlyWikiParser
  parseInline(text: string, offset: number): readonly Element[]
}

/**
 * Delimiter type for inline parsing
 */
export interface DelimiterType {
  resolve?: string
  mark?: string
}

/**
 * Inline delimiter for emphasis-style markers
 */
export class InlineDelimiter {
  constructor(
    readonly type: DelimiterType,
    readonly from: number,
    readonly to: number,
    public side: number  // 1 = open, 2 = close, 3 = both
  ) {}
}

/**
 * Configuration for the TiddlyWiki parser
 */
export interface TiddlyWikiConfig {
  /** Custom node props */
  props?: readonly NodePropSource[]
  /** Define additional node types */
  defineNodes?: readonly (string | NodeSpec)[]
  /** Add pragma parsers */
  parsePragma?: readonly PragmaParser[]
  /** Add block parsers */
  parseBlock?: readonly BlockParser[]
  /** Add inline parsers */
  parseInline?: readonly InlineParser[]
  /** Remove parsers by name */
  remove?: readonly string[]
  /** Parser wrapper for mixed parsing */
  wrap?: ParseWrapper
}

export interface NodeSpec {
  name: string
  block?: boolean
  composite?: (cx: BlockContext, line: Line, value: number) => boolean
  style?: { [selector: string]: any }
}

export type NodePropSource = (type: NodeType) => any

export type ParseWrapper = (
  inner: PartialParse,
  input: Input,
  fragments: readonly TreeFragment[],
  ranges: readonly { from: number, to: number }[]
) => PartialParse

// Re-export these types from @lezer/common for convenience
// @ts-expect-error TS(2792): Cannot find module '@lezer/common'. Did you mean t... Remove this comment to see the full error message
import type { PartialParse, TreeFragment } from "@lezer/common"
export type { PartialParse, TreeFragment }
