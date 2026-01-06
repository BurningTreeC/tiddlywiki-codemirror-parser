/**
 * TiddlyWiki Parser - Block Context
 *
 * Handles block-level parsing following the Lezer Markdown architecture.
 */

import { Tree, TreeBuffer, TreeCursor, NodeSet, NodeProp, Input, TreeFragment, PartialParse } from "@lezer/common"
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
  private _atEnd = false
  private dontInject = new Set<Tree>()

  // Fragment parsing (for incremental updates)
  private fragments: readonly TreeFragment[] | null = null
  private fragmentIndex = 0
  private fragmentEnd = -1
  private to: number

  lineStart: number = 0
  private lineEnd: number = 0

  stoppedAt: number | null = null

  // Track macro/procedure/function parameters for __param__ validation
  private _macroParams: Set<string> | null = null

  /** Set the current macro parameters (for __param__ validation) */
  setMacroParams(params: string[] | null) {
    this._macroParams = params ? new Set(params) : null
  }

  /** Check if a name is a valid macro parameter */
  isValidMacroParam(name: string): boolean {
    return this._macroParams !== null && this._macroParams.has(name)
  }

  /** Check if we're inside a macro definition with parameters */
  get hasMacroParams(): boolean {
    return this._macroParams !== null
  }

  /** Whether we've reached the end of the document */
  get atEnd(): boolean { return this._atEnd }

  /**
   * Save the current parsing position for potential restore
   */
  savePosition(): { lineStart: number, lineEnd: number, lineText: string, atEnd: boolean } {
    return {
      lineStart: this.lineStart,
      lineEnd: this.lineEnd,
      lineText: this._line.text,
      atEnd: this._atEnd
    }
  }

  /**
   * Restore a previously saved parsing position
   */
  restorePosition(saved: { lineStart: number, lineEnd: number, lineText: string, atEnd: boolean }) {
    this.lineStart = saved.lineStart
    this.lineEnd = saved.lineEnd
    this._line.reset(saved.lineText)
    this._atEnd = saved.atEnd
  }

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
   * Get the end position of the previous line's content (excluding newline)
   * For the last line without trailing newline, returns the document end
   */
  prevLineEnd(): number {
    if (this.lineStart <= 0) return 0
    // If we're at the document end (atEnd is true), lineStart is the doc end
    // In this case, return lineStart (not lineStart - 1) since there's no newline to skip
    if (this.atEnd && this.lineStart === this.to) {
      return this.lineStart
    }
    return this.lineStart - 1
  }

  /**
   * Move to the next line
   */
  nextLine(): boolean {
    this.lineStart = this.lineEnd
    if (this.lineStart >= this.to) {
      this._atEnd = true
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
   *
   * Pragmas are only valid at the very top of the document (or within another
   * pragma's body). Once we encounter non-pragma content, no more pragmas.
   *
   * For better editor UX, we're forgiving about malformed pragma bodies:
   * - After parsing at least one pragma, if orphan content appears but more
   *   pragmas follow, we skip the orphan lines and continue
   * - This handles cases like `\define foo() <<` where the body is malformed
   *   but subsequent \procedure/\function lines should still be recognized
   * - However, if no pragma has been parsed yet, any non-pragma content
   *   immediately ends the pragma section (no forgiving behavior)
   */
  private parsePragmas() {
    // Track whether we've parsed at least one pragma
    // Only be "forgiving" about orphan content AFTER parsing a pragma
    let parsedAnyPragma = false

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
        // This line doesn't start with \ - it's not a pragma
        // Only be forgiving about orphan content if we've already parsed at least one pragma
        // (handles malformed pragma bodies leaking content)
        // If we haven't parsed any pragma yet, this is regular content - stop immediately
        if (parsedAnyPragma && !this.looksLikeBlockStart(trimmed) && this.hasUpcomingPragma()) {
          // Skip this orphan non-pragma line and continue looking for pragmas
          this.nextLine()
          continue
        }
        break
      }

      // Handle lone backslash (line continuation) - skip and continue pragma parsing
      if (trimmed === "\\") {
        this.nextLine()
        continue
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
          parsedAnyPragma = true
          break
        }
      }

      if (!matched) {
        // Unknown \something - skip and continue if more pragmas are coming
        // Only be forgiving if we've already parsed at least one pragma
        if (parsedAnyPragma && this.hasUpcomingPragma()) {
          this.nextLine()
          continue
        }
        break
      }
    }
  }

  /**
   * Check if a line looks like the start of a valid block element
   * (not orphan content from a malformed pragma)
   */
  private looksLikeBlockStart(text: string): boolean {
    if (!text) return false
    const ch = text.charCodeAt(0)
    // Code fence ```
    if (text.startsWith("```")) return true
    // Typed block $$$
    if (text.startsWith("$$$")) return true
    // Heading !
    if (ch === Ch.Exclamation) return true
    // List items * # ; :
    if (ch === Ch.Asterisk || ch === Ch.Hash || ch === Ch.Semicolon || ch === Ch.Colon) return true
    // Block quote <<<
    if (text.startsWith("<<<")) return true
    // Horizontal rule ---
    if (/^-{3,}\s*$/.test(text)) return true
    // Table |
    if (ch === Ch.Pipe) return true
    // HTML/Widget <
    if (ch === Ch.LessThan) return true
    // Transclusion {{
    if (text.startsWith("{{")) return true
    // Macro call <<
    if (text.startsWith("<<")) return true
    // Conditional <%
    if (text.startsWith("<%")) return true
    return false
  }

  /**
   * Check if there's a pragma line anywhere in the remaining document
   * Used to be forgiving about malformed pragma bodies
   */
  private hasUpcomingPragma(): boolean {
    const savedPos = this.savePosition()
    let foundPragma = false

    while (this.nextLine()) {
      const text = this._line.text.trim()
      if (text === "") continue  // Skip blank lines

      // Skip over code blocks - don't look for pragmas inside them
      if (text.startsWith("```")) {
        // Found a code fence, skip until closing fence
        while (this.nextLine()) {
          if (this._line.text.trim().startsWith("```")) break
        }
        continue
      }
      if (text.startsWith("$$$")) {
        // Found a typed block, skip until closing marker
        while (this.nextLine()) {
          if (this._line.text.trim().startsWith("$$$")) break
        }
        continue
      }

      // Check if this line starts with backslash (potential pragma)
      if (text.charCodeAt(0) === Ch.Backslash) {
        foundPragma = true
        break
      }
      // Continue looking through non-pragma lines
    }

    this.restorePosition(savedPos)
    return foundPragma
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

    // Consume lines until we hit a block element
    // Blank lines are included to allow inline formatting (like ~~strikethrough~~)
    // to span across visual paragraph breaks, matching TiddlyWiki's behavior
    while (this.nextLine()) {
      const text = this._line.text

      // Include blank lines - they don't end paragraphs in TiddlyWiki
      // (inline formatting can span across them)
      if (text.trim() === "") {
        content.push(text)
        continue
      }

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
    if (firstChar === Ch.LessThan) {
      // HTML/Widget: only treat as block if tag doesn't close on same line
      // This allows inline HTML within formatting like ~~<div>text</div>~~

      // HTML comment
      if (text.startsWith('<!--')) {
        return !text.includes('-->')  // Block if comment doesn't close on same line
      }

      // Match opening tag (HTML or widget)
      const tagMatch = text.match(/^<(\$?[a-zA-Z][a-zA-Z0-9\-\.]*)/)
      if (!tagMatch) return false  // Not a recognizable tag pattern

      const tagName = tagMatch[1]

      // Self-closing tag: <tag ... />
      if (/\/>\s*$/.test(text)) return false

      // Check if closing tag exists on same line
      const escapedName = tagName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      const closeTagRegex = new RegExp(`</${escapedName}>`)
      if (closeTagRegex.test(text)) return false

      // Opening tag without close on same line - treat as block
      return true
    }
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

  /**
   * Parse a range of content as blocks and return Elements.
   * Used for recursive parsing of pragma bodies and widget content.
   *
   * This creates a fresh parse of the content range and extracts elements
   * from the resulting tree, avoiding buffer corruption issues.
   *
   * @param from Start position in the document
   * @param to End position in the document
   * @param parsePragmasFirst Whether to parse pragmas at the start of the range
   * @returns Array of parsed elements
   */
  parseContentRange(from: number, to: number, parsePragmasFirst: boolean = true): Element[] {
    if (from >= to) return []

    // Parse the content range as a fresh document
    const content = this.input.read(from, to)
    const tree = this.parser.parse(content)

    // Extract elements from the tree, adjusting positions
    return this.extractElements(tree, from)
  }

  /**
   * Extract Elements from a parsed Tree, adjusting positions by offset
   */
  private extractElements(tree: Tree, offset: number): Element[] {
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
    const type = cursor.type.id
    const from = cursor.from + offset
    const to = cursor.to + offset
    const children: Element[] = []

    // Recursively convert children
    if (cursor.firstChild()) {
      do {
        const child = this.nodeToElement(cursor, offset)
        if (child) {
          children.push(child)
        }
      } while (cursor.nextSibling())
      cursor.parent()
    }

    return new Element(type, from, to, children)
  }
}
