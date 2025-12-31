/**
 * TiddlyWiki Parser - Block Context
 *
 * Handles block-level parsing following the Lezer Markdown architecture.
 */

import { Tree, TreeBuffer, NodeSet, NodeProp, Input, TreeFragment, PartialParse } from "@lezer/common"
import { Type, CompositeBlockTypes } from "./types"
import {
  Line, Element, elt, CompositeBlock, LeafBlock,
  BlockParser, LeafBlockParser, PragmaParser, BlockResult,
  space, lineEnd, Ch
} from "./core"
import type { TiddlyWikiParser } from "./parser"

// Buffer for building parse tree
class Buffer {
  content: number[] = []
  nodes: (Tree | TreeBuffer)[] = []

  write(type: number, from: number, to: number, children: number = 0) {
    this.content.push(type, from, to, 4 + children * 4)
  }

  writeElements(elts: readonly Element[], offset: number = 0) {
    for (const elt of elts) this.writeElement(elt, offset)
  }

  writeElement(elt: Element, offset: number = 0) {
    const startOff = this.content.length
    this.writeElements(elt.children, offset)
    this.content.push(elt.type, elt.from + offset, elt.to + offset, (this.content.length + 4 - startOff))
  }

  finish(type: number, length: number): Tree {
    return Tree.build({
      buffer: this.content,
      nodeSet: (this as any).nodeSet as NodeSet, // Will be set by context
      topID: type,
      length
    })
  }
}

/**
 * BlockContext manages block-level parsing state
 */
export class BlockContext implements PartialParse {
  private buf = new Buffer()
  private stack: CompositeBlock[] = []
  private _line!: Line
  private atEnd = false
  private dontInject = new Set<Tree>()

  // Fragment parsing (for incremental updates)
  private fragments: readonly TreeFragment[] | null = null
  private fragmentIndex = 0
  private fragmentEnd = -1
  private to: number

  lineStart: number = 0
  private lineEnd: number = 0

  stoppedAt: number | null = null

  constructor(
    readonly parser: TiddlyWikiParser,
    readonly input: Input,
    fragments: readonly TreeFragment[],
    readonly ranges: readonly { from: number, to: number }[]
  ) {
    this.to = ranges[ranges.length - 1].to
    this.fragments = fragments.length ? fragments : null
    ;(this.buf as any).nodeSet = parser.nodeSet

    // Initialize the document composite block
    const rootBlock = CompositeBlock.create(Type.Document, 0, ranges[0].from, 0, 0)
    this.stack.push(rootBlock)

    this._line = new Line()
    this.lineStart = ranges[0].from
    this.lineEnd = this.lineStart

    this.moveToNextLine()
  }

  get line(): Line { return this._line }

  get parsers(): readonly BlockParser[] {
    return this.parser.blockParsers
  }

  get pragmaParsers(): readonly PragmaParser[] {
    return this.parser.pragmaParsers
  }

  /**
   * The current block context
   */
  get block(): CompositeBlock {
    return this.stack[this.stack.length - 1]
  }

  /**
   * Get the end position of the previous line
   */
  prevLineEnd(): number {
    return this.lineStart > 0 ? this.lineStart - 1 : 0
  }

  /**
   * Move to the next line
   */
  nextLine(): boolean {
    this.lineStart = this.lineEnd
    if (this.lineStart >= this.to) {
      this.atEnd = true
      return false
    }
    this.lineEnd = this.findLineEnd()
    this._line.reset(this.readLineText())
    return true
  }

  /**
   * Peek at the next line without consuming it (without trailing newline)
   */
  peekLine(): string | null {
    const start = this.lineEnd
    if (start >= this.to) return null
    let end = this.findLineEnd(start)
    // Strip trailing newline
    if (end > start) {
      const lastChar = this.input.read(end - 1, end).charCodeAt(0)
      if (lastChar === Ch.Newline) {
        end--
        if (end > start && this.input.read(end - 1, end).charCodeAt(0) === Ch.CarriageReturn) {
          end--
        }
      }
    }
    return this.input.read(start, end)
  }

  /**
   * Find the end of the line starting at pos (position after the newline)
   * lineEnd points to after the newline, but line.text excludes the newline
   */
  private findLineEnd(pos: number = this.lineEnd): number {
    let end = pos
    while (end < this.to) {
      const ch = this.input.read(end, end + 1).charCodeAt(0)
      if (ch === Ch.Newline) {
        return end + 1  // Return position after newline
      }
      if (ch === Ch.CarriageReturn) {
        end++
        if (end < this.to && this.input.read(end, end + 1).charCodeAt(0) === Ch.Newline) end++
        return end
      }
      end++
    }
    return end
  }

  /**
   * Read line text without the trailing newline
   */
  private readLineText(): string {
    let end = this.lineEnd
    // Strip trailing newline
    if (end > this.lineStart) {
      const lastChar = this.input.read(end - 1, end).charCodeAt(0)
      if (lastChar === Ch.Newline) {
        end--
        if (end > this.lineStart && this.input.read(end - 1, end).charCodeAt(0) === Ch.CarriageReturn) {
          end--
        }
      }
    }
    return this.input.read(this.lineStart, end)
  }

  /**
   * Move to the next line for parsing
   */
  private moveToNextLine() {
    if (!this.nextLine()) {
      this._line.reset("")
    }
  }

  /**
   * Start a new composite block context
   */
  startContext(type: number, start: number, value: number = 0) {
    const block = CompositeBlock.create(type, value, start, this.block.hash, start)
    this.stack.push(block)
    this.addNode(type, start)
  }

  /**
   * Start a composite block without immediately adding it
   */
  startComposite(type: number, start: number, value: number = 0) {
    const block = CompositeBlock.create(type, value, start, this.block.hash, start)
    this.stack.push(block)
  }

  /**
   * Add an element to the buffer
   */
  addElement(elt: Element) {
    this.buf.writeElement(elt, -this.block.from)
  }

  /**
   * Add a node to the current composite block
   */
  addNode(block: Type | Tree, from: number, to?: number) {
    if (typeof block === "number") {
      this.buf.write(block, from - this.block.from, (to ?? from) - this.block.from, 0)
    } else {
      this.block.addChild(block, from - this.block.from)
    }
  }

  /**
   * Add an element for a leaf block
   */
  addLeafElement(leaf: LeafBlock, elt: Element) {
    this.addElement(this.elt(elt.type, elt.from, elt.to, [
      ...leaf.marks.map(m => this.elt(m.type, m.from, m.to)),
      ...elt.children
    ]))
  }

  /**
   * Finish the current composite block context
   */
  finishContext() {
    const cx = this.stack.pop()!
    const tree = cx.toTree(this.parser.nodeSet)
    if (!this.dontInject.has(tree)) {
      this.block.addChild(tree, cx.from - this.block.from)
    }
  }

  /**
   * Create an element
   */
  elt(type: number, from: number, to: number, children?: readonly Element[]): Element {
    return new Element(type, from, to, children)
  }

  /**
   * Main parsing loop - called to advance parsing
   */
  advance(): Tree | null {
    if (this.stoppedAt !== null && this.lineStart > this.stoppedAt) {
      return this.finishDocument()
    }

    // Parse pragmas at start of document
    if (this.lineStart === this.ranges[0].from) {
      this.parsePragmas()
    }

    // Parse blocks until we run out of input
    while (!this.atEnd) {
      this.parseBlock()
    }

    return this.finishDocument()
  }

  /**
   * Parse pragmas at document start
   */
  private parsePragmas() {
    while (!this.atEnd) {
      // Skip whitespace lines
      const lineText = this._line.text
      const trimmed = lineText.trim()
      if (trimmed === "") {
        this.nextLine()
        continue
      }

      // Check if this line starts with a pragma
      if (lineText.charCodeAt(this._line.skipSpace(0)) !== Ch.Backslash) {
        break
      }

      // Try each pragma parser
      let matched = false
      for (const parser of this.pragmaParsers) {
        const result = parser.parse(this, this._line)
        if (result !== null) {
          for (const elt of result) {
            this.addElement(elt)
          }
          matched = true
          break
        }
      }

      if (!matched) break
    }
  }

  /**
   * Parse a single block
   */
  private parseBlock() {
    // Skip empty lines
    const lineText = this._line.text
    if (lineText.trim() === "") {
      this.nextLine()
      return
    }

    // Try each block parser
    for (const parser of this.parsers) {
      const result = parser.parse(this, this._line)
      if (result !== false) {
        if (result === true) {
          // Leaf block consumed, move to next line
          this.nextLine()
        }
        // null means composite block started, continue on same line
        return
      }
    }

    // Default: parse as paragraph
    this.parseParagraph()
  }

  /**
   * Parse a paragraph (default fallback)
   */
  private parseParagraph() {
    const start = this.lineStart
    const content: string[] = [this._line.text]

    // Consume lines until we hit a blank line or block element
    while (this.nextLine()) {
      const text = this._line.text
      if (text.trim() === "") break

      // Check if this line starts a new block
      let startsBlock = false
      for (const parser of this.parsers) {
        // Simple check - if any parser matches at position 0, it's a new block
        const firstChar = text.charCodeAt(0)
        if (this.isBlockStarter(text, firstChar)) {
          startsBlock = true
          break
        }
      }

      if (startsBlock) break
      content.push(text)
    }

    // Parse inline content
    const fullContent = content.join("\n")
    const inlineElements = this.parser.parseInline(fullContent, start)

    // Create paragraph element
    const paragraphElt = this.elt(Type.Paragraph, start, start + fullContent.length, inlineElements as Element[])
    this.addElement(paragraphElt)
  }

  /**
   * Quick check if a line starts a block element
   */
  private isBlockStarter(text: string, firstChar: number): boolean {
    if (firstChar === Ch.Exclamation) return true  // Heading
    if (firstChar === Ch.Asterisk || firstChar === Ch.Hash ||
        firstChar === Ch.Semicolon || firstChar === Ch.Colon ||
        firstChar === Ch.GreaterThan) return true  // List
    if (firstChar === Ch.Pipe) return true  // Table
    if (firstChar === Ch.Backtick && text.startsWith("```")) return true  // Code
    if (firstChar === Ch.Dollar && text.startsWith("$$$")) return true  // Typed block
    if (firstChar === Ch.Dash && /^-{3,}$/.test(text.trim())) return true  // HR
    if (firstChar === Ch.LessThan) return true  // HTML/Widget
    if (firstChar === Ch.LeftBrace && text.startsWith("{{")) return true  // Transclusion
    if (firstChar === Ch.Backslash) return true  // Pragma
    return false
  }

  /**
   * Finish parsing and return the document tree
   */
  private finishDocument(): Tree {
    // Close any remaining open contexts
    while (this.stack.length > 1) {
      this.finishContext()
    }

    // Build tree from buffer content
    const docBlock = this.stack[0]
    const bufferContent = this.buf.content

    if (bufferContent.length > 0) {
      // Use Tree.build to properly interpret the buffer
      const tree = Tree.build({
        buffer: bufferContent,
        nodeSet: this.parser.nodeSet,
        topID: Type.Document,
        length: this.to - docBlock.from
      })
      return tree
    }

    return docBlock.toTree(this.parser.nodeSet, this.to)
  }

  // PartialParse interface
  get parsedPos(): number {
    return this.lineStart
  }

  stopAt(pos: number) {
    this.stoppedAt = pos
  }
}
