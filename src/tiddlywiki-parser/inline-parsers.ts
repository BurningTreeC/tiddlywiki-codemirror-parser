/**
 * TiddlyWiki Parser - Inline Parsers
 *
 * Inline-level parsing rules following the Lezer Markdown architecture.
 */

import { Type } from "./types"
import { Element, elt, InlineParser, DelimiterType, Ch, space, Punctuation } from "./core"
import type { InlineContext } from "./inline-context"

// ============================================================================
// Escape Parser (~WikiWord prevents linking)
// ============================================================================

export const Escape: InlineParser = {
  name: "Escape",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Tilde && next !== Ch.Backslash) return -1

    const after = cx.char(pos + 1)
    if (after < 0) return -1

    // ~ before CamelCase word prevents linking
    if (next === Ch.Tilde) {
      // Check if followed by uppercase letter
      if (after >= 65 && after <= 90) {  // A-Z
        return cx.addElement(cx.elt(Type.Escape, pos, pos + 1))
      }
      return -1
    }

    // Backslash escape
    return cx.addElement(cx.elt(Type.Escape, pos, pos + 2))
  }
}

// ============================================================================
// Entity Parser (&amp; etc)
// ============================================================================

const entityRe = /^&(?:#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/

export const Entity: InlineParser = {
  name: "Entity",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Ampersand) return -1

    const text = cx.slice(pos, cx.end)
    const match = entityRe.exec(text)
    if (!match) return -1

    return cx.addElement(cx.elt(Type.Entity, pos, pos + match[0].length))
  }
}

// ============================================================================
// Inline Code Parser (`code`)
// ============================================================================

export const InlineCode: InlineParser = {
  name: "InlineCode",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Backtick) return -1

    // Find closing backtick
    let end = pos + 1
    while (end < cx.end) {
      if (cx.char(end) === Ch.Backtick) {
        return cx.addElement(cx.elt(Type.InlineCode, pos, end + 1, [
          cx.elt(Type.InlineCodeMark, pos, pos + 1),
          cx.elt(Type.CodeText, pos + 1, end),
          cx.elt(Type.InlineCodeMark, end, end + 1),
        ]))
      }
      end++
    }

    return -1
  }
}

// ============================================================================
// Bold Parser ('')
// ============================================================================

const BoldDelim: DelimiterType = { resolve: "Bold", mark: "BoldMark" }

export const Bold: InlineParser = {
  name: "Bold",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Apostrophe || cx.char(pos + 1) !== Ch.Apostrophe) return -1

    // Check flanking
    const before = cx.slice(pos - 1, pos)
    const after = cx.slice(pos + 2, pos + 3)
    const sBefore = /\s|^$/.test(before)
    const sAfter = /\s|^$/.test(after)
    const pBefore = Punctuation.test(before)
    const pAfter = Punctuation.test(after)

    const canOpen = !sAfter && (!pAfter || sBefore || pBefore)
    const canClose = !sBefore && (!pBefore || sAfter || pAfter)

    return cx.addDelimiter(BoldDelim, pos, pos + 2, canOpen, canClose)
  }
}

// ============================================================================
// Italic Parser (//)
// ============================================================================

const ItalicDelim: DelimiterType = { resolve: "Italic", mark: "ItalicMark" }

export const Italic: InlineParser = {
  name: "Italic",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Slash || cx.char(pos + 1) !== Ch.Slash) return -1

    const before = cx.slice(pos - 1, pos)
    const after = cx.slice(pos + 2, pos + 3)
    const sBefore = /\s|^$/.test(before)
    const sAfter = /\s|^$/.test(after)

    return cx.addDelimiter(ItalicDelim, pos, pos + 2, !sAfter, !sBefore)
  }
}

// ============================================================================
// Underline Parser (__)
// ============================================================================

const UnderlineDelim: DelimiterType = { resolve: "Underline", mark: "UnderlineMark" }

export const Underline: InlineParser = {
  name: "Underline",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Underscore || cx.char(pos + 1) !== Ch.Underscore) return -1

    const before = cx.slice(pos - 1, pos)
    const after = cx.slice(pos + 2, pos + 3)
    const sBefore = /\s|^$/.test(before)
    const sAfter = /\s|^$/.test(after)

    return cx.addDelimiter(UnderlineDelim, pos, pos + 2, !sAfter, !sBefore)
  }
}

// ============================================================================
// Strikethrough Parser (~~)
// ============================================================================

const StrikethroughDelim: DelimiterType = { resolve: "Strikethrough", mark: "StrikethroughMark" }

export const Strikethrough: InlineParser = {
  name: "Strikethrough",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Tilde || cx.char(pos + 1) !== Ch.Tilde) return -1
    // Make sure it's not ~~~
    if (cx.char(pos + 2) === Ch.Tilde) return -1

    const before = cx.slice(pos - 1, pos)
    const after = cx.slice(pos + 2, pos + 3)
    const sBefore = /\s|^$/.test(before)
    const sAfter = /\s|^$/.test(after)

    return cx.addDelimiter(StrikethroughDelim, pos, pos + 2, !sAfter, !sBefore)
  }
}

// ============================================================================
// Superscript Parser (^^)
// ============================================================================

const SuperscriptDelim: DelimiterType = { resolve: "Superscript", mark: "SuperscriptMark" }

export const Superscript: InlineParser = {
  name: "Superscript",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Caret || cx.char(pos + 1) !== Ch.Caret) return -1

    const before = cx.slice(pos - 1, pos)
    const after = cx.slice(pos + 2, pos + 3)
    const sBefore = /\s|^$/.test(before)
    const sAfter = /\s|^$/.test(after)

    return cx.addDelimiter(SuperscriptDelim, pos, pos + 2, !sAfter, !sBefore)
  }
}

// ============================================================================
// Subscript Parser (,,)
// ============================================================================

const SubscriptDelim: DelimiterType = { resolve: "Subscript", mark: "SubscriptMark" }

export const Subscript: InlineParser = {
  name: "Subscript",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Comma || cx.char(pos + 1) !== Ch.Comma) return -1

    const before = cx.slice(pos - 1, pos)
    const after = cx.slice(pos + 2, pos + 3)
    const sBefore = /\s|^$/.test(before)
    const sAfter = /\s|^$/.test(after)

    return cx.addDelimiter(SubscriptDelim, pos, pos + 2, !sAfter, !sBefore)
  }
}

// ============================================================================
// Highlight Parser (@@)
// ============================================================================

const HighlightDelim: DelimiterType = { resolve: "Highlight", mark: "HighlightMark" }

export const Highlight: InlineParser = {
  name: "Highlight",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.At || cx.char(pos + 1) !== Ch.At) return -1

    const before = cx.slice(pos - 1, pos)
    const after = cx.slice(pos + 2, pos + 3)
    const sBefore = /\s|^$/.test(before)
    const sAfter = /\s|^$/.test(after)

    return cx.addDelimiter(HighlightDelim, pos, pos + 2, !sAfter, !sBefore)
  }
}

// ============================================================================
// WikiLink Parser ([[text|target]] or [[target]])
// ============================================================================

const wikiLinkRe = /^\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/

export const WikiLink: InlineParser = {
  name: "WikiLink",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBracket || cx.char(pos + 1) !== Ch.LeftBracket) return -1

    const text = cx.slice(pos, cx.end)
    const match = wikiLinkRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const firstPart = match[1]
    const secondPart = match[2]

    const children: Element[] = [
      cx.elt(Type.WikiLinkMark, pos, pos + 2),
    ]

    if (secondPart !== undefined) {
      // [[text|target]]
      children.push(cx.elt(Type.LinkText, pos + 2, pos + 2 + firstPart.length))
      children.push(cx.elt(Type.LinkSeparator, pos + 2 + firstPart.length, pos + 3 + firstPart.length))
      children.push(cx.elt(Type.LinkTarget, pos + 3 + firstPart.length, end - 2))
    } else {
      // [[target]]
      children.push(cx.elt(Type.LinkTarget, pos + 2, end - 2))
    }

    children.push(cx.elt(Type.WikiLinkMark, end - 2, end))

    return cx.addElement(cx.elt(Type.WikiLink, pos, end, children))
  }
}

// ============================================================================
// External Link Parser ([ext[text|url]] or [ext[url]])
// ============================================================================

const extLinkRe = /^\[ext\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/

export const ExternalLink: InlineParser = {
  name: "ExternalLink",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBracket) return -1

    const text = cx.slice(pos, cx.end)
    const match = extLinkRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const firstPart = match[1]
    const secondPart = match[2]

    const children: Element[] = [
      cx.elt(Type.ExtLinkMark, pos, pos + 5), // [ext[
    ]

    if (secondPart !== undefined) {
      children.push(cx.elt(Type.LinkText, pos + 5, pos + 5 + firstPart.length))
      children.push(cx.elt(Type.LinkSeparator, pos + 5 + firstPart.length, pos + 6 + firstPart.length))
      children.push(cx.elt(Type.URLLink, pos + 6 + firstPart.length, end - 2))
    } else {
      children.push(cx.elt(Type.URLLink, pos + 5, end - 2))
    }

    children.push(cx.elt(Type.ExtLinkMark, end - 2, end))

    return cx.addElement(cx.elt(Type.ExternalLink, pos, end, children))
  }
}

// ============================================================================
// Image Link Parser ([img[src]] or [img width=x height=y [alt|src]])
// ============================================================================

const imgLinkRe = /^\[img(?:\s+[^\[]+)?\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/

export const ImageLink: InlineParser = {
  name: "ImageLink",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBracket) return -1

    const text = cx.slice(pos, cx.end)
    const match = imgLinkRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length

    const children: Element[] = [
      cx.elt(Type.ImageMark, pos, pos + 4), // [img
    ]

    // TODO: Parse width/height/class attributes

    children.push(cx.elt(Type.ImageMark, end - 2, end))

    return cx.addElement(cx.elt(Type.ImageLink, pos, end, children))
  }
}

// ============================================================================
// Transclusion Parser ({{ref}} or {{ref!!field}} etc)
// ============================================================================

const transclusionRe = /^\{\{([^{}|]*?)(?:\|\|([^{}|]+?))?(?:\|([^{}]+?))?\}\}/

export const Transclusion: InlineParser = {
  name: "Transclusion",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBrace || cx.char(pos + 1) !== Ch.LeftBrace) return -1
    // Make sure it's not {{{
    if (cx.char(pos + 2) === Ch.LeftBrace) return -1

    const text = cx.slice(pos, cx.end)
    const match = transclusionRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const target = match[1]
    const template = match[2]

    const children: Element[] = [
      cx.elt(Type.TransclusionMark, pos, pos + 2),
      cx.elt(Type.TransclusionTarget, pos + 2, pos + 2 + target.length),
    ]

    if (template) {
      const templateStart = pos + 2 + target.length + 2
      children.push(cx.elt(Type.TransclusionTemplate, templateStart, templateStart + template.length))
    }

    children.push(cx.elt(Type.TransclusionMark, end - 2, end))

    return cx.addElement(cx.elt(Type.Transclusion, pos, end, children))
  }
}

// ============================================================================
// Filtered Transclusion Parser ({{{filter}}})
// ============================================================================

const filteredRe = /^\{\{\{([^{}]*?)\}\}\}(?:\|\|([^{}]+?))?/

export const FilteredTransclusion: InlineParser = {
  name: "FilteredTransclusion",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBrace || cx.char(pos + 1) !== Ch.LeftBrace || cx.char(pos + 2) !== Ch.LeftBrace) return -1

    const text = cx.slice(pos, cx.end)
    const match = filteredRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const filter = match[1]
    const template = match[2]

    const children: Element[] = [
      cx.elt(Type.FilteredTransclusionMark, pos, pos + 3),
      cx.elt(Type.FilterExpression, pos + 3, pos + 3 + filter.length),
      cx.elt(Type.FilteredTransclusionMark, pos + 3 + filter.length, pos + 6 + filter.length),
    ]

    if (template) {
      children.push(cx.elt(Type.TransclusionTemplate, pos + 8 + filter.length, end))
    }

    return cx.addElement(cx.elt(Type.FilteredTransclusion, pos, end, children))
  }
}

// ============================================================================
// Macro Call Parser (<<macro params>>)
// ============================================================================

const macroRe = /^<<([^\s>]+)([^>]*)>>/

export const MacroCall: InlineParser = {
  name: "MacroCall",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LessThan || cx.char(pos + 1) !== Ch.LessThan) return -1

    const text = cx.slice(pos, cx.end)
    const match = macroRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const name = match[1]
    const params = match[2]

    const children: Element[] = [
      cx.elt(Type.MacroCallMark, pos, pos + 2),
      cx.elt(Type.MacroName, pos + 2, pos + 2 + name.length),
    ]

    if (params.trim()) {
      children.push(cx.elt(Type.MacroParam, pos + 2 + name.length, end - 2))
    }

    children.push(cx.elt(Type.MacroCallMark, end - 2, end))

    return cx.addElement(cx.elt(Type.MacroCall, pos, end, children))
  }
}

// ============================================================================
// Widget Parser (<$widget/>)
// ============================================================================

const widgetRe = /^<(\$[a-zA-Z0-9\-\.]+)([^>]*?)(\/)?\s*>/

export const Widget: InlineParser = {
  name: "Widget",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LessThan) return -1
    if (cx.char(pos + 1) !== Ch.Dollar) return -1

    const text = cx.slice(pos, cx.end)
    const match = widgetRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const name = match[1]
    const attrs = match[2]
    const selfClosing = match[3]

    const children: Element[] = [
      cx.elt(Type.WidgetName, pos + 1, pos + 1 + name.length),
    ]

    // TODO: Parse attributes

    if (selfClosing) {
      children.push(cx.elt(Type.SelfClosingMarker, end - 2, end - 1))
    }

    return cx.addElement(cx.elt(Type.InlineWidget, pos, end, children))
  }
}

// ============================================================================
// HTML Tag Parser (<tag/>)
// ============================================================================

const htmlTagRe = /^<([a-zA-Z][a-zA-Z0-9\-]*)([^>]*?)(\/)?\s*>/

export const HTMLTag: InlineParser = {
  name: "HTMLTag",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LessThan) return -1
    // Skip if it's a widget
    if (cx.char(pos + 1) === Ch.Dollar) return -1

    const text = cx.slice(pos, cx.end)
    const match = htmlTagRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const name = match[1]

    const children: Element[] = [
      cx.elt(Type.TagName, pos + 1, pos + 1 + name.length),
    ]

    return cx.addElement(cx.elt(Type.HTMLTag, pos, end, children))
  }
}

// ============================================================================
// Dash Parser (-- or ---)
// ============================================================================

export const Dash: InlineParser = {
  name: "Dash",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Dash) return -1

    let count = 1
    while (cx.char(pos + count) === Ch.Dash) count++

    if (count === 2) {
      return cx.addElement(cx.elt(Type.Dash, pos, pos + 2))
    } else if (count >= 3) {
      return cx.addElement(cx.elt(Type.Dash, pos, pos + 3))
    }

    return -1
  }
}

// ============================================================================
// CamelCase Link Parser
// ============================================================================

const camelCaseRe = /^[A-Z][a-z]+[A-Z][A-Za-z]*/

export const CamelCaseLink: InlineParser = {
  name: "CamelCaseLink",
  parse(cx: InlineContext, next: number, pos: number): number {
    // Must start with uppercase
    if (next < 65 || next > 90) return -1

    const text = cx.slice(pos, cx.end)
    const match = camelCaseRe.exec(text)
    if (!match) return -1

    // Check it's not escaped with ~
    if (pos > cx.offset && cx.char(pos - 1) === Ch.Tilde) return -1

    return cx.addElement(cx.elt(Type.CamelCaseLink, pos, pos + match[0].length))
  }
}

// ============================================================================
// System Link Parser ($:/...)
// ============================================================================

const sysLinkRe = /^\$:\/[^\s\[\]{}|]*/

export const SystemLink: InlineParser = {
  name: "SystemLink",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Dollar) return -1

    const text = cx.slice(pos, cx.end)
    const match = sysLinkRe.exec(text)
    if (!match) return -1

    return cx.addElement(cx.elt(Type.SystemLink, pos, pos + match[0].length))
  }
}

// ============================================================================
// URL Auto-Link Parser (http://...)
// ============================================================================

const urlRe = /^https?:\/\/[^\s\[\]{}|<>]*/

export const URLAutoLink: InlineParser = {
  name: "URLAutoLink",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== 104) return -1 // 'h'

    const text = cx.slice(pos, cx.end)
    const match = urlRe.exec(text)
    if (!match) return -1

    return cx.addElement(cx.elt(Type.URLLink, pos, pos + match[0].length))
  }
}

// ============================================================================
// Export all default inline parsers
// ============================================================================

export const DefaultInlineParsers: InlineParser[] = [
  Escape,
  Entity,
  InlineCode,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  Highlight,
  WikiLink,
  ExternalLink,
  ImageLink,
  FilteredTransclusion,  // Must come before Transclusion
  Transclusion,
  MacroCall,
  Widget,
  HTMLTag,
  Dash,
  SystemLink,
  CamelCaseLink,
  URLAutoLink,
]
