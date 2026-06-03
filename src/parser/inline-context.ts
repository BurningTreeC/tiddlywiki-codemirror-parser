/**
 * TiddlyWiki Parser - Inline Context
 *
 * Handles inline-level parsing following the Lezer Markdown architecture.
 */

import { Type } from "./types"
import {
  // @ts-expect-error TS(6133): 'elt' is declared but its value is never read.
  Element, elt, InlineDelimiter, DelimiterType,
  // @ts-expect-error TS(6133): 'InlineParser' is declared but its value is never ... Remove this comment to see the full error message
  InlineParser, space, Punctuation, Ch
} from "./core"
import type { TiddlyWikiParser } from "./parser"

// Flags for delimiter sides
const Open = 1, Close = 2

/**
 * InlineContext manages inline-level parsing state
 */
export class InlineContext {
  /** Collected parts (elements and delimiters) */
  parts: (Element | InlineDelimiter | null)[] = []

  constructor(
    readonly parser: TiddlyWikiParser,
    readonly text: string,
    readonly offset: number
  ) {}

  /**
   * End position of the text
   */
  get end(): number {
    return this.offset + this.text.length
  }

  /**
   * Get character code at absolute position
   */
  char(pos: number): number {
    const rel = pos - this.offset
    if (rel < 0 || rel >= this.text.length) return -1
    return this.text.charCodeAt(rel)
  }

  /**
   * Get a slice of text (absolute positions)
   */
  slice(from: number, to: number): string {
    const relFrom = Math.max(0, from - this.offset)
    const relTo = Math.min(this.text.length, to - this.offset)
    return this.text.slice(relFrom, relTo)
  }

  /**
   * Check if there's an open link (affects autolink parsing)
   */
  get hasOpenLink(): boolean {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = this.parts[i]
      if (part instanceof InlineDelimiter && (part.type as any).isLink) return true
    }
    return false
  }

  /**
   * Skip whitespace starting at position
   */
  skipSpace(from: number): number {
    let pos = from - this.offset
    while (pos < this.text.length && space(this.text.charCodeAt(pos))) pos++
    return pos + this.offset
  }

  /**
   * Add an element directly
   */
  addElement(elt: Element): number {
    this.parts.push(elt)
    return elt.to
  }

  /**
   * Add a delimiter for later resolution
   */
  addDelimiter(type: DelimiterType, from: number, to: number, open: boolean, close: boolean): number {
    const side = (open ? Open : 0) | (close ? Close : 0)
    this.parts.push(new InlineDelimiter(type, from, to, side))
    return to
  }

  /**
   * Append an element or delimiter
   */
  append(elt: Element | InlineDelimiter): number {
    this.parts.push(elt)
    return elt.to
  }

  /**
   * Create an element
   */
  elt(type: number, from: number, to: number, children?: readonly Element[]): Element {
    return new Element(type, from, to, children)
  }

  /**
   * Find an opening delimiter of the given type
   */
  findOpeningDelimiter(type: DelimiterType): number | null {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = this.parts[i]
      if (part instanceof InlineDelimiter && part.type === type && (part.side & Open)) {
        return i
      }
    }
    return null
  }

  /**
   * Take content from parts starting at an index
   */
  takeContent(startIndex: number): readonly Element[] {
    const content: Element[] = []
    for (let i = startIndex; i < this.parts.length; i++) {
      const part = this.parts[i]
      if (part instanceof Element) content.push(part)
      else if (part instanceof InlineDelimiter) {
        // Convert delimiter to plain text element
        content.push(this.elt(Type.Text, part.from, part.to))
      }
      // null parts are skipped
    }
    // Remove taken items
    this.parts.length = startIndex
    return content
  }

  /**
   * Resolve all collected delimiters into elements
   */
  resolveDelimiters(): readonly Element[] {
    // Go through all delimiters and try to match them
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i]
      if (!(part instanceof InlineDelimiter) || !(part.side & Close)) continue

      const type = part.type
      if (!type.resolve) continue

      // Look for matching opener
      let opener: number | null = null
      for (let j = i - 1; j >= 0; j--) {
        const p = this.parts[j]
        if (p instanceof InlineDelimiter && p.type === type && (p.side & Open)) {
          opener = j
          break
        }
      }

      if (opener === null) continue

      // Collect content between opener and closer
      const openDelim = this.parts[opener] as InlineDelimiter
      const content: Element[] = []

      // Add opening mark
      if (type.mark) {
        content.push(this.elt(this.getMarkType(type.mark), openDelim.from, openDelim.to))
      }

      // Add content between
      for (let j = opener + 1; j < i; j++) {
        const p = this.parts[j]
        if (p instanceof Element) content.push(p)
        else if (p instanceof InlineDelimiter) {
          // Convert unmatched delimiter to text
          content.push(this.elt(Type.Text, p.from, p.to))
        }
        this.parts[j] = null
      }

      // Add closing mark
      if (type.mark) {
        content.push(this.elt(this.getMarkType(type.mark), part.from, part.to))
      }

      // Create the resolved element
      const resolvedType = this.getResolveType(type.resolve)
      const element = this.elt(resolvedType, openDelim.from, part.to, content)

      // Replace opener with element, remove closer
      this.parts[opener] = element
      this.parts[i] = null
    }

    // Collect remaining elements
    const result: Element[] = []
    for (const part of this.parts) {
      if (part instanceof Element) result.push(part)
      else if (part instanceof InlineDelimiter) {
        // Unmatched delimiter becomes text
        result.push(this.elt(Type.Text, part.from, part.to))
      }
    }

    return result
  }

  /**
   * Get the Type for a resolve name
   */
  private getResolveType(name: string): Type {
    const typeMap: { [key: string]: Type } = {
      "Bold": Type.Bold,
      "Italic": Type.Italic,
      "Underline": Type.Underline,
      "Strikethrough": Type.Strikethrough,
      "Superscript": Type.Superscript,
      "Subscript": Type.Subscript,
      "Highlight": Type.Highlight,
      "InlineCode": Type.InlineCode,
    }
    return typeMap[name] || Type.Text
  }

  /**
   * Get the Type for a mark name
   */
  private getMarkType(name: string): Type {
    const typeMap: { [key: string]: Type } = {
      "BoldMark": Type.BoldMark,
      "ItalicMark": Type.ItalicMark,
      "UnderlineMark": Type.UnderlineMark,
      "StrikethroughMark": Type.StrikethroughMark,
      "SuperscriptMark": Type.SuperscriptMark,
      "SubscriptMark": Type.SubscriptMark,
      "HighlightMark": Type.HighlightMark,
      "InlineCodeMark": Type.InlineCodeMark,
    }
    return typeMap[name] || Type.Mark
  }

  /**
   * Parse the text and return elements
   */
  parse(): readonly Element[] {
    const parsers = this.parser.inlineParsers
    let pos = this.offset

    while (pos < this.end) {
      const next = this.char(pos)
      let matched = false

      // Try each inline parser
      for (const parser of parsers) {
        const result = parser.parse(this, next, pos)
        if (result >= 0) {
          pos = result
          matched = true
          break
        }
      }

      if (!matched) {
        // No parser matched, advance one character
        pos++
      }
    }

    // Resolve delimiters and collect elements
    return this.resolveDelimiters()
  }
}

/**
 * Parse inline content
 */
export function parseInline(parser: TiddlyWikiParser, text: string, offset: number): readonly Element[] {
  const cx = new InlineContext(parser, text, offset)
  return cx.parse()
}
