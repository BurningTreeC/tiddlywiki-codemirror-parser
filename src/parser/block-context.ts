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

  /** Get the end position of the current parsing range */
  get rangeEnd(): number { return this.to }

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
    // Step back over the line terminator. lineStart-1 is the \n; if preceded by
    // a \r (CRLF), step back once more so the \r is excluded from line content.
    let end = this.lineStart - 1
    if (end > 0 && this.input.read(end - 1, end).charCodeAt(0) === Ch.CarriageReturn) {
      end--
    }
    return end
  }

  /**
   * Position where the next line begins, i.e. the end of the current line
   * including its terminator. Terminator-aware (correct for both LF and CRLF),
   * so prefer this over `lineStart + line.text.length + 1` when computing the
   * start of multi-line block content.
   */
  get nextLineStart(): number {
    return this.lineEnd
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
   * Skip to a specific position in the document
   * Used when sibling content has been parsed recursively and we need to skip past it
   */
  skipToPosition(pos: number): boolean {
    if (pos >= this.to) {
      this.lineStart = this.to
      this.lineEnd = this.to
      this._atEnd = true
      this._line.reset("")
      return false
    }
    // Find the line containing this position
    this.lineStart = pos
    this.lineEnd = this.findLineEnd(pos)
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
   * HTML comments (<!-- -->) are allowed before and between pragmas - they
   * don't count as "content" that ends the pragma section.
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

      // Handle HTML comments - they don't count as content that ends pragma section
      if (trimmed.startsWith("<!--")) {
        const commentStart = this.lineStart
        const commentChildren: Element[] = []

        // Check for --> on this line (single-line comment)
        const endIdx = lineText.indexOf("-->")
        if (endIdx !== -1) {
          // Single-line comment
          const afterComment = lineText.slice(endIdx + 3)
          const commentEndPos = commentStart + endIdx + 3
          commentChildren.push(elt(Type.CommentMarker, commentStart, commentStart + 4))
          commentChildren.push(elt(Type.CommentMarker, commentEndPos - 3, commentEndPos))
          this.addElement(elt(Type.CommentBlock, commentStart, commentEndPos, commentChildren))

          if (afterComment.trim()) {
            // Content after comment - parse it as a paragraph and end pragma section
            const inlineElements = this.parser.parseInline(afterComment, commentEndPos)
            const paragraphElt = this.elt(Type.Paragraph, commentEndPos, commentEndPos + afterComment.length, inlineElements as Element[])
            this.addElement(paragraphElt)
            this.nextLine()
            break
          }
          this.nextLine()
          continue
        }

        // Multi-line comment - consume lines until we find -->
        let foundEnd = false
        let hasContentAfter = false
        while (this.nextLine()) {
          const currentLine = this._line.text
          const closeIdx = currentLine.indexOf('-->')
          if (closeIdx !== -1) {
            // Check if there's content after --> on the closing line
            const afterComment = currentLine.slice(closeIdx + 3)
            const commentEndPos = this.lineStart + closeIdx + 3
            this.addElement(elt(Type.CommentBlock, commentStart, commentEndPos))
            foundEnd = true
            if (afterComment.trim()) {
              // Content after comment - parse it as a paragraph and end pragma section
              const inlineElements = this.parser.parseInline(afterComment, commentEndPos)
              const paragraphElt = this.elt(Type.Paragraph, commentEndPos, commentEndPos + afterComment.length, inlineElements as Element[])
              this.addElement(paragraphElt)
              hasContentAfter = true
            }
            this.nextLine()
            break
          }
        }

        if (!foundEnd) {
          // Unclosed comment - add what we have
          this.addElement(elt(Type.CommentBlock, commentStart, this.lineStart))
        }

        // If there was content after the closing -->, end pragma section
        if (hasContentAfter) {
          break
        }
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
   *
   * In TiddlyWiki, block elements (headings, lists, tables, etc.) are only
   * recognized as separate blocks when preceded by a blank line. Without a
   * blank line, they become part of the paragraph content.
   *
   * Example: "text\n!heading" → single paragraph
   *          "text\n\n!heading" → paragraph + heading
   */
  private parseParagraph() {
    const start = this.lineStart
    const content: string[] = [this._line.text]
    // Document end position of each accumulated line (excludes the trailing
    // newline) so we can read the exact source range below
    const lineEnds: number[] = [this.lineStart + this._line.text.length]

    // Track blank lines - block elements only start new blocks after blank lines
    let hadBlankLine = false

    // Consume lines until we hit a blank line followed by a block element
    while (this.nextLine()) {
      const text = this._line.text

      // Track blank lines - they create a potential block boundary
      if (text.trim() === "") {
        content.push(text)
        lineEnds.push(this.lineStart + text.length)
        hadBlankLine = true
        continue
      }

      // Only check for block starters if we had a blank line before
      // Without a blank line, everything continues as paragraph content
      if (hadBlankLine) {
        // Use skipNext/textAfterIndent to allow leading whitespace before block elements
        const firstChar = this._line.skipNext
        const trimmedText = this._line.textAfterIndent
        const hasLeadingWhitespace = this._line.skipPos > 0
        if (this.isBlockStarter(trimmedText, firstChar, hasLeadingWhitespace)) {
          // Remove trailing blank lines from paragraph content
          // since they separate this paragraph from the next block
          while (content.length > 0 && content[content.length - 1].trim() === "") {
            content.pop()
            lineEnds.pop()
          }
          break
        }
      }

      // Not a block starter (or no blank line before) - add to paragraph
      content.push(text)
      lineEnds.push(this.lineStart + text.length)
      hadBlankLine = false
    }

    // Read the source directly so real line terminators (\n or \r\n) are
    // preserved; content.join("\n") would drift inline offsets on CRLF docs
    const paragraphEnd = lineEnds[lineEnds.length - 1]
    const fullContent = this.input.read(start, paragraphEnd)
    const inlineElements = this.parser.parseInline(fullContent, start)

    // Create paragraph element
    const paragraphElt = this.elt(Type.Paragraph, start, paragraphEnd, inlineElements as Element[])
    this.addElement(paragraphElt)
  }

  /**
   * Quick check if a line starts a block element
   * @param text - The text after leading whitespace
   * @param firstChar - The first non-whitespace character code
   * @param hasLeadingWhitespace - Whether there is leading whitespace on the line
   */
  private isBlockStarter(text: string, firstChar: number, hasLeadingWhitespace: boolean): boolean {
    // Elements that ALLOW leading whitespace
    if (firstChar === Ch.Exclamation) return true  // Heading
    if (firstChar === Ch.Asterisk || firstChar === Ch.Hash ||
        firstChar === Ch.Semicolon || firstChar === Ch.Colon ||
        firstChar === Ch.GreaterThan) return true  // List
    if (firstChar === Ch.Backtick && text.startsWith("```")) return true  // Code
    if (firstChar === Ch.Dollar && text.startsWith("$$$")) return true  // Typed block
    if (firstChar === Ch.Dash && /^-{3,}$/.test(text.trim())) return true  // HR

    if (firstChar === Ch.LessThan) {
      // Block quote: <<< - allows leading whitespace
      if (text.startsWith("<<<")) return true

      // HTML comment - allows leading whitespace
      if (text.startsWith('<!--')) {
        return !text.includes('-->')  // Block if comment doesn't close on same line
      }

      // Macro call: <<name ...>> - NO leading whitespace allowed
      if (text.startsWith("<<")) {
        if (hasLeadingWhitespace) return false
        // Check for closing >> on same line
        const closeIdx = text.indexOf(">>", 2)
        if (closeIdx === -1) return true  // No closing >> - multi-line macro block
        // Has closing >> - check if there's content after (then it's inline, not block)
        if (text.slice(closeIdx + 2).trim()) return false
        return true  // Single-line macro at start of line is block
      }

      // HTML/Widget: allows leading whitespace
      // Only treat as block if tag doesn't close on same line
      // This allows inline HTML within formatting like ~~<div>text</div>~~

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

    // Elements that do NOT allow leading whitespace - must start at column 0
    if (hasLeadingWhitespace) return false

    if (firstChar === Ch.Pipe) return true  // Table
    if (firstChar === Ch.LeftBrace && text.startsWith("{{")) return true  // Transclusion
    if (firstChar === Ch.Backslash) return true  // Pragma

    // KaTeX block: only if KaTeXBlock parser is registered (KaTeX plugin installed)
    if (firstChar === Ch.Dollar && text.startsWith("$$") && !text.startsWith("$$$")) {
      if (this.parsers.some(p => p.name === "KaTeXBlock")) return true
    }

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
   * Check if content starts with a blank line (determines block vs inline mode)
   *
   * In TiddlyWiki, widget/HTML content is parsed in "block mode" only if there's
   * a blank line after the opening tag. Without a blank line, content is "inline mode"
   * where block elements like headings are not recognized.
   *
   * Example:
   * - <$list>\n! Hello → inline mode (! Hello is text, not heading)
   * - <$list>\n\n! Hello → block mode (! Hello is a heading)
   *
   * @param from Start position of content
   * @param to End position of content
   * @returns true if content starts with a blank line (block mode)
   */
  startsWithBlankLine(from: number, to: number): boolean {
    if (from >= to) return false
    const content = this.input.read(from, Math.min(from + 20, to))
    // Check for blank line: newline followed by another newline (with optional spaces/tabs between)
    return /^[\t ]*[\r\n][\t ]*[\r\n]/.test(content);
  }

  /**
   * Parse a range of content as inline elements only (no block parsing).
   * Used for inline-mode widget/HTML content where block elements should not be recognized.
   *
   * @param from Start position in the document
   * @param to End position in the document
   * @returns Array of parsed inline elements
   */
  parseInlineRange(from: number, to: number): Element[] {
    if (from >= to) return []
    const content = this.input.read(from, to)
    return this.parser.parseInline(content, from) as Element[]
  }

  /**
   * Parse widget/HTML body content, respecting block vs inline mode.
   * - If content starts with a blank line → block mode (parse as blocks)
   * - Otherwise → inline mode (parse as inline only)
   *
   * @param from Start position of content (right after opening tag's >)
   * @param to End position of content (right before closing tag)
   * @returns Array of parsed elements
   */
  parseWidgetContent(from: number, to: number): Element[] {
    if (from >= to) return []

    if (this.startsWithBlankLine(from, to)) {
      // Block mode - parse as blocks
      return this.parseContentRange(from, to, false)
    } else {
      // Inline mode - parse as inline only
      return this.parseInlineRange(from, to)
    }
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
   *
   * Handles foreign parser nodes (from mixed-language parsing like LaTeX)
   * by mapping them to appropriate TiddlyWiki types and not recursing
   * into their children (which use a different nodeSet).
   */
  private nodeToElement(cursor: any, offset: number): Element | null {
    const typeName = cursor.type.name
    const from = cursor.from + offset
    const to = cursor.to + offset

    // Check if this node type exists in TiddlyWiki's Type enum
    // If not, it's from a foreign parser (e.g., LaTeX mixed-language)
    const typeId = (Type as any)[typeName]

    if (typeId === undefined || typeof typeId !== "number") {
      // Foreign node - map known wrapper types to TiddlyWiki types
      // Don't recurse into children (they use a different nodeSet)
      if (typeName === "LaTeX") {
        return new Element(Type.LaTeXContent, from, to, [])
      }
      if (typeName === "JavaScript" || typeName === "CSS" || typeName === "Script") {
        return new Element(Type.CodeText, from, to, [])
      }
      // Unknown foreign node - skip it entirely
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
