/**
 * TiddlyWiki Parser - Inline Parsers
 *
 * Inline-level parsing rules following the Lezer Markdown architecture.
 */

import { Type } from "./types"
import { Element, elt, InlineParser, DelimiterType, Ch, space, Punctuation } from "./core"
import type { InlineContext } from "./inline-context"
import {
  createDelimiterParser,
  parseTransclusionTarget,
  findTagEnd as findTagEndUtil,
  parseMacroParams as parseMacroParamsUtil,
  Patterns,
  isWhitespaceOrEmpty,
} from "./parser-utils"

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
// Delimiter-based Formatters (Bold, Italic, Underline, Strikethrough, etc.)
// ============================================================================
// These all use the createDelimiterParser factory from parser-utils.ts

const BoldDelim: DelimiterType = { resolve: "Bold", mark: "BoldMark" }
const ItalicDelim: DelimiterType = { resolve: "Italic", mark: "ItalicMark" }
const UnderlineDelim: DelimiterType = { resolve: "Underline", mark: "UnderlineMark" }
const StrikethroughDelim: DelimiterType = { resolve: "Strikethrough", mark: "StrikethroughMark" }
const SuperscriptDelim: DelimiterType = { resolve: "Superscript", mark: "SuperscriptMark" }
const SubscriptDelim: DelimiterType = { resolve: "Subscript", mark: "SubscriptMark" }

export const Bold: InlineParser = {
  name: "Bold",
  parse: createDelimiterParser({ charCode: Ch.Apostrophe, delimType: BoldDelim })
}

export const Italic: InlineParser = {
  name: "Italic",
  parse: createDelimiterParser({ charCode: Ch.Slash, delimType: ItalicDelim })
}

export const Underline: InlineParser = {
  name: "Underline",
  parse: createDelimiterParser({ charCode: Ch.Underscore, delimType: UnderlineDelim })
}

export const Strikethrough: InlineParser = {
  name: "Strikethrough",
  parse: createDelimiterParser({ charCode: Ch.Tilde, delimType: StrikethroughDelim, rejectOddRuns: true })
}

export const Superscript: InlineParser = {
  name: "Superscript",
  parse: createDelimiterParser({ charCode: Ch.Caret, delimType: SuperscriptDelim })
}

export const Subscript: InlineParser = {
  name: "Subscript",
  parse: createDelimiterParser({ charCode: Ch.Comma, delimType: SubscriptDelim })
}

// ============================================================================
// Highlight/Styled Parser (@@.className content@@ or @@color:red;content@@)
// ============================================================================

export const Highlight: InlineParser = {
  name: "Highlight",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.At || cx.char(pos + 1) !== Ch.At) return -1

    const text = cx.slice(pos, cx.end)

    // Find closing @@
    let closePos = -1
    for (let i = 2; i < text.length - 1; i++) {
      if (text[i] === '@' && text[i + 1] === '@') {
        closePos = i
        break
      }
    }
    if (closePos === -1) return -1

    const end = pos + closePos + 2
    const content = text.slice(2, closePos)

    const children: Element[] = [
      cx.elt(Type.HighlightMark, pos, pos + 2),  // Opening @@
    ]

    // Check for .className or CSS styles at the start
    let contentStart = 0
    let hasClasses = false

    // Parse .className(s)
    while (contentStart < content.length && content[contentStart] === '.') {
      hasClasses = true
      const classStart = contentStart
      contentStart++ // skip .
      const classNameStart = contentStart
      while (contentStart < content.length && /[a-zA-Z0-9_\-]/.test(content[contentStart])) {
        contentStart++
      }
      if (contentStart > classNameStart) {
        children.push(cx.elt(Type.StyledBlockMark, pos + 2 + classStart, pos + 2 + classStart + 1))
        children.push(cx.elt(Type.StyledBlockClass, pos + 2 + classNameStart, pos + 2 + contentStart))
      }
    }

    // Check for CSS styles (property:value;)
    if (!hasClasses && content.includes(':') && content.includes(';')) {
      const styleEnd = content.indexOf(';') + 1
      // The style part is implicitly included in Highlight
      contentStart = styleEnd
    }

    // Skip leading space after classes/styles
    if (contentStart < content.length && /\s/.test(content[contentStart])) {
      contentStart++
    }

    // The rest is content - parse it as inline
    if (contentStart < closePos) {
      const innerContent = content.slice(contentStart)
      const innerElements = cx.parser.parseInline(innerContent, pos + 2 + contentStart)
      children.push(...innerElements)
    }

    children.push(cx.elt(Type.HighlightMark, end - 2, end))  // Closing @@

    return cx.addElement(cx.elt(Type.Highlight, pos, end, children))
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
    if (!match) {
      // Handle incomplete wiki link - [[ without ]]
      // Match content up to end of line or newline
      const incompleteMatch = /^\[\[([^\]\n]*)$/.exec(text)
      if (incompleteMatch) {
        const end = pos + incompleteMatch[0].length
        const content = incompleteMatch[1]
        const children: Element[] = [
          cx.elt(Type.WikiLinkMark, pos, pos + 2),
        ]
        // Check for | separator
        const pipeIdx = content.indexOf('|')
        if (pipeIdx !== -1) {
          children.push(cx.elt(Type.LinkText, pos + 2, pos + 2 + pipeIdx))
          children.push(cx.elt(Type.LinkSeparator, pos + 2 + pipeIdx, pos + 3 + pipeIdx))
          if (content.length > pipeIdx + 1) {
            children.push(cx.elt(Type.LinkTarget, pos + 3 + pipeIdx, end))
          }
        } else if (content) {
          children.push(cx.elt(Type.LinkTarget, pos + 2, end))
        }
        return cx.addElement(cx.elt(Type.WikiLink, pos, end, children))
      }
      return -1
    }

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
    if (!match) {
      // Handle incomplete external link - [ext[ without ]]
      const incompleteMatch = /^\[ext\[([^\]\n]*)$/.exec(text)
      if (incompleteMatch) {
        const end = pos + incompleteMatch[0].length
        const content = incompleteMatch[1]
        const children: Element[] = [
          cx.elt(Type.ExtLinkMark, pos, pos + 5), // [ext[
        ]
        // Check for | separator
        const pipeIdx = content.indexOf('|')
        if (pipeIdx !== -1) {
          children.push(cx.elt(Type.LinkText, pos + 5, pos + 5 + pipeIdx))
          children.push(cx.elt(Type.LinkSeparator, pos + 5 + pipeIdx, pos + 6 + pipeIdx))
          if (content.length > pipeIdx + 1) {
            children.push(cx.elt(Type.URLLink, pos + 6 + pipeIdx, end))
          }
        } else if (content) {
          children.push(cx.elt(Type.URLLink, pos + 5, end))
        }
        return cx.addElement(cx.elt(Type.ExternalLink, pos, end, children))
      }
      return -1
    }

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
// Image Link Parser ([img[src]] or [img width=x height=y [tooltip|src]])
// ============================================================================

const imgLinkRe = /^\[img(\s+[^\[]+)?\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/

export const ImageLink: InlineParser = {
  name: "ImageLink",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBracket) return -1

    const text = cx.slice(pos, cx.end)
    const match = imgLinkRe.exec(text)
    if (!match) {
      // Handle incomplete image link - [img[ without ]]
      const incompleteMatch = /^\[img(\s+[^\[\n]+)?\[([^\]\n]*)$/.exec(text)
      if (incompleteMatch) {
        const end = pos + incompleteMatch[0].length
        const attrs = incompleteMatch[1]
        const content = incompleteMatch[2]

        const children: Element[] = [
          cx.elt(Type.ImageMark, pos, pos + 4), // [img
        ]

        let attrEnd = pos + 4

        // Parse attributes if present
        if (attrs) {
          const attrStart = pos + 4
          attrEnd = attrStart + attrs.length
          const attrElements = parseInlineAttributes(cx, attrs.trim(), attrStart + (attrs.length - attrs.trimStart().length))
          children.push(...attrElements)
        }

        // Add the opening [ of the source bracket
        children.push(cx.elt(Type.ImageMark, attrEnd, attrEnd + 1)) // [

        // Parse content
        if (content) {
          const innerStart = attrEnd + 1
          const pipeIdx = content.indexOf('|')
          if (pipeIdx !== -1) {
            children.push(cx.elt(Type.ImageTooltip, innerStart, innerStart + pipeIdx))
            children.push(cx.elt(Type.LinkSeparator, innerStart + pipeIdx, innerStart + pipeIdx + 1))
            if (content.length > pipeIdx + 1) {
              children.push(cx.elt(Type.ImageSource, innerStart + pipeIdx + 1, end))
            }
          } else {
            children.push(cx.elt(Type.ImageSource, innerStart, end))
          }
        }

        return cx.addElement(cx.elt(Type.ImageLink, pos, end, children))
      }
      return -1
    }

    const end = pos + match[0].length
    const attrs = match[1] // attributes like " width=100 class=thumb"
    const tooltipOrSource = match[2] // tooltip if | present, otherwise source
    const source = match[3] // source after |

    const children: Element[] = [
      cx.elt(Type.ImageMark, pos, pos + 4), // [img
    ]

    let attrEnd = pos + 4

    // Parse attributes if present
    if (attrs) {
      const attrStart = pos + 4
      attrEnd = attrStart + attrs.length
      // Parse individual attributes
      const attrElements = parseInlineAttributes(cx, attrs.trim(), attrStart + (attrs.length - attrs.trimStart().length))
      children.push(...attrElements)
    }

    // Add the opening [ of the source bracket
    const sourceBracketStart = attrEnd
    children.push(cx.elt(Type.ImageMark, sourceBracketStart, sourceBracketStart + 1)) // [

    // Parse tooltip and source
    const innerStart = sourceBracketStart + 1
    if (source !== undefined) {
      // Has tooltip|source format
      const tooltipEnd = innerStart + tooltipOrSource.length
      if (tooltipOrSource) {
        children.push(cx.elt(Type.ImageTooltip, innerStart, tooltipEnd))
      }
      children.push(cx.elt(Type.LinkSeparator, tooltipEnd, tooltipEnd + 1)) // |
      const sourceStart = tooltipEnd + 1
      const sourceEnd = sourceStart + source.length
      if (source) {
        children.push(cx.elt(Type.ImageSource, sourceStart, sourceEnd))
      }
    } else {
      // Just source, no tooltip
      const sourceEnd = innerStart + tooltipOrSource.length
      if (tooltipOrSource) {
        children.push(cx.elt(Type.ImageSource, innerStart, sourceEnd))
      }
    }

    children.push(cx.elt(Type.ImageMark, end - 2, end)) // ]]

    return cx.addElement(cx.elt(Type.ImageLink, pos, end, children))
  }
}

// ============================================================================
// Transclusion Parser ({{ref}} or {{ref!!field}} etc)
// ============================================================================

const transclusionRe = /^\{\{([^{}|]*?)(?:\|\|([^{}|]+?))?(?:\|([^{}]+?))?\}\}/

// parseTransclusionTarget is now imported from parser-utils.ts

export const Transclusion: InlineParser = {
  name: "Transclusion",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBrace || cx.char(pos + 1) !== Ch.LeftBrace) return -1
    // Make sure it's not {{{
    if (cx.char(pos + 2) === Ch.LeftBrace) return -1

    const text = cx.slice(pos, cx.end)
    const match = transclusionRe.exec(text)
    if (!match) {
      // Handle incomplete transclusion - {{ without }}
      // Don't match if there are formatting delimiters after {{ (they should close their own constructs)
      const incompleteMatch = /^\{\{([^{}\n~'^/_`<\[]*?)(?=~~|''|\/\/|^^|,,|``|<<|__|$)/.exec(text)
      if (incompleteMatch && incompleteMatch[0].length > 2) {
        const end = pos + incompleteMatch[0].length
        const target = incompleteMatch[1]

        const children: Element[] = [
          cx.elt(Type.TransclusionMark, pos, pos + 2),
        ]

        if (target) {
          // Parse target details (tiddler!!field or tiddler##index)
          const targetChildren = parseTransclusionTarget(target, pos + 2)
          children.push(...targetChildren)
        }

        return cx.addElement(cx.elt(Type.Transclusion, pos, end, children))
      }
      return -1
    }

    const end = pos + match[0].length
    const target = match[1]
    const template = match[2]

    const children: Element[] = [
      cx.elt(Type.TransclusionMark, pos, pos + 2),
    ]

    // Parse target details (tiddler!!field or tiddler##index)
    const targetChildren = parseTransclusionTarget(target, pos + 2)
    children.push(...targetChildren)

    if (template) {
      const templateStart = pos + 2 + target.length + 2
      children.push(cx.elt(Type.TransclusionTemplate, templateStart, templateStart + template.length))
    }

    children.push(cx.elt(Type.TransclusionMark, end - 2, end))

    return cx.addElement(cx.elt(Type.Transclusion, pos, end, children))
  }
}

// ============================================================================
// Filter Expression Parser Helper
// ============================================================================

/**
 * Parse filter expression content into detailed elements
 * Handles: [operator[operand]], [operator<variable>], [operator{textref}]
 * Also handles chained operators like [<var>operator{ref}]
 */
function parseFilterExpression(cx: InlineContext, filterContent: string, offset: number): Element[] {
  const elements: Element[] = []
  let pos = 0
  const len = filterContent.length

  while (pos < len) {
    const ch = filterContent[pos]

    // Skip whitespace
    if (/\s/.test(ch)) {
      pos++
      continue
    }

    // Filter step: [operators...]
    if (ch === '[') {
      const stepStart = pos
      pos++ // skip [

      // Parse operators within this step (can be chained)
      const stepChildren: Element[] = []

      while (pos < len && filterContent[pos] !== ']') {
        // Check for negation
        if (filterContent[pos] === '!') {
          pos++
        }

        // Check for operand-only (title selection): [literal], <variable>, {textref}
        const operandCh = filterContent[pos]

        if (operandCh === '[') {
          // Literal operand: [value]
          pos++
          const operandStart = pos
          let depth = 1
          while (pos < len && depth > 0) {
            if (filterContent[pos] === '[') depth++
            else if (filterContent[pos] === ']') depth--
            if (depth > 0) pos++
          }
          stepChildren.push(cx.elt(Type.FilterOperand, offset + operandStart, offset + pos))
          if (pos < len && filterContent[pos] === ']') pos++
        } else if (operandCh === '<') {
          // Variable: <varname>
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '>') pos++
          stepChildren.push(cx.elt(Type.FilterVariable, offset + operandStart, offset + pos))
          if (pos < len) pos++
        } else if (operandCh === '{') {
          // Text reference: {textref}
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '}') pos++
          stepChildren.push(cx.elt(Type.FilterTextRef, offset + operandStart, offset + pos))
          if (pos < len) pos++
        } else if (operandCh === '/') {
          // Regexp: /regexp/flags
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '/') {
            if (filterContent[pos] === '\\') pos++
            pos++
          }
          stepChildren.push(cx.elt(Type.FilterRegexp, offset + operandStart, offset + pos))
          if (pos < len) pos++
          while (pos < len && /[gimsuy]/.test(filterContent[pos])) pos++
        } else if (/[a-zA-Z]/.test(operandCh)) {
          // Operator name (and optional :suffix)
          const opStart = pos
          while (pos < len && /[a-zA-Z0-9\-_:!]/.test(filterContent[pos])) pos++
          stepChildren.push(cx.elt(Type.FilterOperatorName, offset + opStart, offset + pos))
        } else {
          // Unknown character, skip
          pos++
        }
      }

      // Skip closing ]
      if (pos < len && filterContent[pos] === ']') pos++

      const stepEnd = pos
      elements.push(cx.elt(Type.FilterOperator, offset + stepStart, offset + stepEnd, stepChildren))
      continue
    }

    // Standalone title: [[Title]]
    if (ch === '[' && filterContent[pos + 1] === '[') {
      const start = pos
      pos += 2
      while (pos < len && !(filterContent[pos] === ']' && filterContent[pos + 1] === ']')) pos++
      pos += 2
      elements.push(cx.elt(Type.FilterOperand, offset + start, offset + pos))
      continue
    }

    // Run prefix: + - ~ :prefix
    if (ch === '+' || ch === '-' || ch === '~' || ch === ':') {
      pos++
      while (pos < len && /[a-zA-Z]/.test(filterContent[pos])) pos++
      continue
    }

    pos++
  }

  return elements
}

// ============================================================================
// Filtered Transclusion Parser ({{{filter}}})
// ============================================================================

export const FilteredTransclusion: InlineParser = {
  name: "FilteredTransclusion",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LeftBrace || cx.char(pos + 1) !== Ch.LeftBrace || cx.char(pos + 2) !== Ch.LeftBrace) return -1

    const text = cx.slice(pos, cx.end)

    // Find closing }}} - need to handle nested braces properly
    let filterEnd = -1
    for (let i = 3; i < text.length - 2; i++) {
      if (text[i] === '}' && text[i + 1] === '}' && text[i + 2] === '}') {
        filterEnd = i
        break
      }
    }
    if (filterEnd === -1) {
      // Handle incomplete filtered transclusion - {{{ without }}}
      // Don't match if there are formatting delimiters after {{{ (they should close their own constructs)
      const incompleteMatch = /^\{\{\{([^\n~'^/_`<\[]*?)(?=~~|''|\/\/|^^|,,|``|<<|__|$)/.exec(text)
      if (incompleteMatch && incompleteMatch[0].length > 3) {
        const end = pos + incompleteMatch[0].length
        const filter = incompleteMatch[1]

        // Parse filter expression details
        const filterChildren = parseFilterExpression(cx, filter, pos + 3)

        const children: Element[] = [
          cx.elt(Type.FilteredTransclusionMark, pos, pos + 3),
        ]

        if (filter) {
          children.push(cx.elt(Type.FilterExpression, pos + 3, end, filterChildren))
        }

        return cx.addElement(cx.elt(Type.FilteredTransclusion, pos, end, children))
      }
      return -1
    }

    const filter = text.slice(3, filterEnd)
    let end = pos + filterEnd + 3

    // Check for template
    let template = ""
    if (text.slice(filterEnd + 3, filterEnd + 5) === "||") {
      const templateStart = filterEnd + 5
      let templateEnd = templateStart
      while (templateEnd < text.length && !/[\s}]/.test(text[templateEnd])) templateEnd++
      template = text.slice(templateStart, templateEnd)
      end = pos + templateEnd
    }

    // Parse filter expression details
    const filterChildren = parseFilterExpression(cx, filter, pos + 3)

    const children: Element[] = [
      cx.elt(Type.FilteredTransclusionMark, pos, pos + 3),
      cx.elt(Type.FilterExpression, pos + 3, pos + 3 + filter.length, filterChildren),
      cx.elt(Type.FilteredTransclusionMark, pos + 3 + filter.length, pos + filterEnd + 3),
    ]

    if (template) {
      children.push(cx.elt(Type.TransclusionTemplate, pos + filterEnd + 5, end))
    }

    return cx.addElement(cx.elt(Type.FilteredTransclusion, pos, end, children))
  }
}

// ============================================================================
// Macro Call Parser (<<macro params>>)
// ============================================================================

// parseMacroParams is imported from parser-utils.ts as parseMacroParamsUtil

export const MacroCall: InlineParser = {
  name: "MacroCall",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LessThan || cx.char(pos + 1) !== Ch.LessThan) return -1

    const text = cx.slice(pos, cx.end)

    // Find closing >> handling nested macros
    const maxSearch = text.length - 1
    let closePos = -1
    let depth = 1
    let lineEnd = -1  // Track end of first line for incomplete macros
    for (let i = 2; i < maxSearch; i++) {
      if (lineEnd === -1 && text[i] === '\n') {
        lineEnd = i
      }
      if (text[i] === '<' && text[i + 1] === '<') {
        depth++
        i++
      } else if (text[i] === '>' && text[i + 1] === '>') {
        depth--
        if (depth === 0) {
          closePos = i
          break
        }
        i++
      }
    }

    // Handle incomplete macro (no closing >>) - only on same line
    const isIncomplete = closePos === -1
    if (isIncomplete) {
      // Only parse incomplete macros on the same line (for typing experience)
      if (lineEnd === -1) {
        // No newline found, use end of text
        closePos = text.length
      } else {
        closePos = lineEnd
      }
      // Must have at least a name
      let nameEnd = 2
      while (nameEnd < closePos && !/[\s\n]/.test(text[nameEnd])) nameEnd++
      if (nameEnd === 2) return -1  // No name found
    }

    const end = pos + closePos + (isIncomplete ? 0 : 2)

    // Sanity check: end must be greater than pos and within document bounds
    if (end <= pos || end > cx.end) return -1

    // Parse macro name
    let nameEnd = 2
    while (nameEnd < closePos && !/\s/.test(text[nameEnd])) nameEnd++
    const name = text.slice(2, nameEnd)
    if (!name) return -1

    const children: Element[] = [
      cx.elt(Type.MacroCallMark, pos, pos + 2),
      cx.elt(Type.MacroName, pos + 2, pos + 2 + name.length),
    ]

    // Parse parameters - only if we have valid range
    if (nameEnd < closePos) {
      const paramsStr = text.slice(nameEnd, closePos)
      if (paramsStr.trim()) {
        const paramElements = parseMacroParamsUtil(paramsStr, pos + nameEnd)
        children.push(...paramElements)
      }
    }

    if (!isIncomplete) {
      children.push(cx.elt(Type.MacroCallMark, end - 2, end))
    }

    return cx.addElement(cx.elt(Type.MacroCall, pos, end, children))
  }
}

// ============================================================================
// Inline Attribute Parsing Helper
// ============================================================================

/**
 * Find the end of an inline tag, properly handling > inside attribute values
 * Returns the position after the closing > or -1 if not found
 */
function findTagEnd(text: string): { end: number, selfClose: boolean } | null {
  let pos = 0
  const len = text.length

  while (pos < len) {
    const ch = text[pos]

    if (ch === '>') {
      return { end: pos + 1, selfClose: false }
    }
    if (ch === '/' && text[pos + 1] === '>') {
      return { end: pos + 2, selfClose: true }
    }
    if (ch === '"' || ch === "'") {
      // Skip quoted string
      const quote = ch
      pos++
      while (pos < len && text[pos] !== quote) {
        if (text[pos] === '\\') pos++ // skip escaped char
        pos++
      }
      pos++ // skip closing quote
    } else if (ch === '<' && text[pos + 1] === '<') {
      // Skip macro <<...>>
      pos += 2
      let depth = 1
      while (pos < len && depth > 0) {
        if (text[pos] === '<' && text[pos + 1] === '<') {
          depth++
          pos += 2
        } else if (text[pos] === '>' && text[pos + 1] === '>') {
          depth--
          pos += 2
        } else {
          pos++
        }
      }
    } else if (ch === '{' && text[pos + 1] === '{' && text[pos + 2] === '{') {
      // Skip filtered {{{...}}}
      pos += 3
      while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}' && text[pos + 2] === '}')) pos++
      pos += 3
    } else if (ch === '{' && text[pos + 1] === '{') {
      // Skip indirect {{...}}
      pos += 2
      while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}')) pos++
      pos += 2
    } else if (ch === '`') {
      // Skip substituted string
      if (text.slice(pos, pos + 3) === '```') {
        pos += 3
        while (pos < len && text.slice(pos, pos + 3) !== '```') pos++
        pos += 3
      } else {
        pos++
        while (pos < len && text[pos] !== '`') pos++
        pos++
      }
    } else {
      pos++
    }
  }
  return null
}

/**
 * Parse inline widget/HTML tag attributes
 */
function parseInlineAttributes(cx: InlineContext, attrString: string, offset: number): Element[] {
  const elements: Element[] = []
  let pos = 0
  const len = attrString.length

  while (pos < len) {
    // Skip whitespace
    while (pos < len && /\s/.test(attrString[pos])) pos++
    if (pos >= len) break

    // Parse attribute name
    const nameStart = pos
    while (pos < len && /[a-zA-Z0-9\-_:.$]/.test(attrString[pos])) pos++
    if (pos === nameStart) {
      pos++
      continue
    }
    const nameEnd = pos

    // Check for = sign
    while (pos < len && /\s/.test(attrString[pos])) pos++

    if (pos >= len || attrString[pos] !== '=') {
      // Boolean attribute
      const attrChildren: Element[] = [
        cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
      ]
      elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + nameEnd, attrChildren))
      continue
    }

    // Skip the =
    pos++

    // Skip whitespace after =
    while (pos < len && /\s/.test(attrString[pos])) pos++
    if (pos >= len) {
      const attrChildren: Element[] = [
        cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
      ]
      elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + pos, attrChildren))
      continue
    }

    const valueStart = pos
    let valueEnd = pos
    let valueType = Type.AttributeValue
    const ch = attrString[pos]

    if (ch === '"' && attrString.slice(pos, pos + 3) === '"""') {
      // Triple-quoted string: """value"""
      pos += 3 // skip opening """
      const stringStart = pos
      while (pos < len && attrString.slice(pos, pos + 3) !== '"""') {
        pos++
      }
      const stringEnd = pos
      if (attrString.slice(pos, pos + 3) === '"""') pos += 3 // skip closing """
      valueEnd = pos
      valueType = Type.AttributeString

      const attrChildren: Element[] = [
        cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
        cx.elt(valueType, offset + valueStart, offset + valueEnd)
      ]
      elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
      continue
    } else if (ch === '"' || ch === "'") {
      const quote = ch
      const stringStart = pos + 1
      pos++
      while (pos < len && attrString[pos] !== quote) {
        if (attrString[pos] === '\\' && pos + 1 < len) pos++
        pos++
      }
      const stringEnd = pos
      if (pos < len) pos++
      valueEnd = pos
      valueType = Type.AttributeString

      // Check if this is a filter attribute - parse content as filter expression
      const attrName = attrString.slice(nameStart, nameEnd).toLowerCase()
      if (attrName === 'filter' || attrName === '$filter') {
        const filterContent = attrString.slice(stringStart, stringEnd)
        const filterChildren = parseFilterExpression(cx, filterContent, offset + stringStart)
        const valueChildren: Element[] = [
          cx.elt(Type.Mark, offset + valueStart, offset + stringStart),  // Opening quote
          cx.elt(Type.FilterExpression, offset + stringStart, offset + stringEnd, filterChildren),
          cx.elt(Type.Mark, offset + stringEnd, offset + valueEnd)  // Closing quote
        ]
        const attrChildren: Element[] = [
          cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
          cx.elt(Type.AttributeFiltered, offset + valueStart, offset + valueEnd, valueChildren)
        ]
        elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
        continue
      }
    } else if (ch === '{') {
      if (attrString.slice(pos, pos + 3) === '{{{') {
        // Filtered: {{{filter}}}
        const openMarkStart = pos
        pos += 3
        const filterStart = pos
        while (pos < len && attrString.slice(pos, pos + 3) !== '}}}') pos++
        const filterEnd = pos
        if (attrString.slice(pos, pos + 3) === '}}}') pos += 3
        valueEnd = pos
        valueType = Type.AttributeFiltered
        // Parse filter expression children for proper highlighting
        const filterContent = attrString.slice(filterStart, filterEnd)
        const filterChildren = parseFilterExpression(cx, filterContent, offset + filterStart)
        // Create child elements for filtered transclusion
        const valueChildren: Element[] = [
          cx.elt(Type.FilteredTransclusionMark, offset + openMarkStart, offset + openMarkStart + 3),
          cx.elt(Type.FilterExpression, offset + filterStart, offset + filterEnd, filterChildren),
          cx.elt(Type.FilteredTransclusionMark, offset + filterEnd, offset + valueEnd)
        ]
        const attrChildren: Element[] = [
          cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
          cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
        ]
        elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
        continue
      } else if (attrString.slice(pos, pos + 2) === '{{') {
        // Indirect: {{reference}}
        const openMarkStart = pos
        pos += 2
        const targetStart = pos
        while (pos < len && attrString.slice(pos, pos + 2) !== '}}') pos++
        const targetEnd = pos
        if (attrString.slice(pos, pos + 2) === '}}') pos += 2
        valueEnd = pos
        valueType = Type.AttributeIndirect
        // Parse transclusion target details (tiddler!!field or tiddler##index)
        const targetContent = attrString.slice(targetStart, targetEnd)
        const targetChildren = parseTransclusionTarget(targetContent, offset + targetStart)
        // Create child elements for transclusion
        const valueChildren: Element[] = [
          cx.elt(Type.TransclusionMark, offset + openMarkStart, offset + openMarkStart + 2),
          ...targetChildren,
          cx.elt(Type.TransclusionMark, offset + targetEnd, offset + valueEnd)
        ]
        const attrChildren: Element[] = [
          cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
          cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
        ]
        elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
        continue
      } else {
        while (pos < len && !/[\s>]/.test(attrString[pos])) pos++
        valueEnd = pos
      }
    } else if (ch === '<' && attrString[pos + 1] === '<') {
      // Macro: <<macroname params>>
      const openMarkStart = pos
      pos += 2
      const macroContentStart = pos
      // Parse macro name
      while (pos < len && /[a-zA-Z0-9\-_.$]/.test(attrString[pos])) pos++
      const macroNameEnd = pos
      // Skip to end of macro
      let depth = 1
      while (pos < len && depth > 0) {
        if (attrString.slice(pos, pos + 2) === '<<') {
          depth++
          pos += 2
        } else if (attrString.slice(pos, pos + 2) === '>>') {
          depth--
          if (depth === 0) break
          pos += 2
        } else {
          pos++
        }
      }
      const closeMarkStart = pos
      if (attrString.slice(pos, pos + 2) === '>>') pos += 2
      valueEnd = pos
      valueType = Type.AttributeMacro
      // Create child elements for macro
      const valueChildren: Element[] = [
        cx.elt(Type.MacroCallMark, offset + openMarkStart, offset + openMarkStart + 2),
        cx.elt(Type.MacroName, offset + macroContentStart, offset + macroNameEnd),
        cx.elt(Type.MacroCallMark, offset + closeMarkStart, offset + valueEnd)
      ]
      const attrChildren: Element[] = [
        cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
        cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
      ]
      elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
      continue
    } else if (ch === '`') {
      // Substituted string: `value` or ```value```
      let openMarkEnd: number
      let closeMarkStart: number
      if (attrString.slice(pos, pos + 3) === '```') {
        openMarkEnd = pos + 3
        pos += 3
        while (pos < len && attrString.slice(pos, pos + 3) !== '```') pos++
        closeMarkStart = pos
        if (attrString.slice(pos, pos + 3) === '```') pos += 3
      } else {
        openMarkEnd = pos + 1
        pos++
        while (pos < len && attrString[pos] !== '`') pos++
        closeMarkStart = pos
        if (pos < len) pos++
      }
      valueEnd = pos
      valueType = Type.AttributeSubstituted

      // Parse $(variable)$ and ${ filter }$ patterns inside the substituted string
      const valueChildren: Element[] = [
        cx.elt(Type.Mark, offset + valueStart, offset + openMarkEnd)  // Opening `
      ]

      const content = attrString.slice(openMarkEnd, closeMarkStart)
      let contentPos = 0
      const contentOffset = offset + openMarkEnd

      while (contentPos < content.length) {
        // Check for ${ filter }$ pattern first (filter expressions are substituted before variables)
        // Note: can't use simple regex since filter may contain } characters
        if (content.slice(contentPos, contentPos + 2) === '${') {
          // Find the closing }$
          const searchStart = contentPos + 2
          let filterEndPos = -1
          for (let i = searchStart; i < content.length - 1; i++) {
            if (content[i] === '}' && content[i + 1] === '$') {
              filterEndPos = i
              break
            }
          }
          if (filterEndPos !== -1) {
            const filterMatch = [
              content.slice(contentPos, filterEndPos + 2),
              content.slice(contentPos + 2, filterEndPos)
            ]
            const filterStart = contentOffset + contentPos
            const filterEnd = filterStart + filterMatch[0].length
            const filterExprStart = filterStart + 2
            const filterExprEnd = filterEnd - 2

            // Parse the filter expression inside
            const filterContent = filterMatch[1].trim()
            const filterChildren = parseFilterExpression(cx, filterContent, filterExprStart + (filterMatch[1].length - filterMatch[1].trimStart().length))

            valueChildren.push(cx.elt(Type.FilterSubstitution, filterStart, filterEnd, [
              cx.elt(Type.FilterSubstitutionMark, filterStart, filterStart + 2),
              cx.elt(Type.FilterExpression, filterExprStart, filterExprEnd, filterChildren),
              cx.elt(Type.FilterSubstitutionMark, filterEnd - 2, filterEnd)
            ]))

            contentPos += filterMatch[0].length
            continue
          }
        }

        // Check for $(variable)$ pattern
        const varMatch = content.slice(contentPos).match(/^\$\(([^)]+)\)\$/)
        if (varMatch) {
          const varStart = contentOffset + contentPos
          const varEnd = varStart + varMatch[0].length
          const varNameStart = varStart + 2
          const varNameEnd = varNameStart + varMatch[1].length

          valueChildren.push(cx.elt(Type.Variable, varStart, varEnd, [
            cx.elt(Type.VariableMark, varStart, varStart + 2),
            cx.elt(Type.VariableName, varNameStart, varNameEnd),
            cx.elt(Type.VariableMark, varNameEnd, varEnd)
          ]))

          contentPos += varMatch[0].length
        } else {
          contentPos++
        }
      }

      valueChildren.push(cx.elt(Type.Mark, offset + closeMarkStart, offset + valueEnd))  // Closing `

      const attrChildren: Element[] = [
        cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
        cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
      ]
      elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
      continue
    } else {
      while (pos < len && !/[\s>\/]/.test(attrString[pos])) pos++
      valueEnd = pos
      const valueText = attrString.slice(valueStart, valueEnd)
      if (/^-?\d+(\.\d+)?$/.test(valueText)) {
        valueType = Type.AttributeNumber
      } else {
        valueType = Type.AttributeString
      }
    }

    const attrChildren: Element[] = [
      cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
      cx.elt(valueType, offset + valueStart, offset + valueEnd)
    ]
    elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
  }

  return elements
}

// ============================================================================
// Widget Parser (<$widget>content</$widget> or <$widget/>)
// ============================================================================

const widgetStartRe = /^<(\$[a-zA-Z0-9\-\.]+)/

export const Widget: InlineParser = {
  name: "Widget",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LessThan) return -1
    if (cx.char(pos + 1) !== Ch.Dollar) return -1

    const text = cx.slice(pos, cx.end)
    const startMatch = widgetStartRe.exec(text)
    if (!startMatch) return -1

    const name = startMatch[1]
    const afterName = startMatch[0].length

    // Find the proper end of the tag (handling > inside attribute values)
    const tagResult = findTagEnd(text.slice(afterName))
    if (!tagResult) return -1

    const openTagEnd = pos + afterName + tagResult.end
    const attrString = text.slice(afterName, afterName + tagResult.end - (tagResult.selfClose ? 2 : 1))

    const children: Element[] = [
      cx.elt(Type.TagMark, pos, pos + 1), // <
      cx.elt(Type.WidgetName, pos + 1, pos + 1 + name.length),
    ]

    // Parse attributes
    if (attrString.trim()) {
      const attrElements = parseInlineAttributes(cx, attrString, pos + afterName)
      children.push(...attrElements)
    }

    if (tagResult.selfClose) {
      children.push(cx.elt(Type.SelfClosingMarker, openTagEnd - 2, openTagEnd - 1))
      children.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)) // >
      return cx.addElement(cx.elt(Type.InlineWidget, pos, openTagEnd, children))
    }

    children.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)) // >

    // Look for closing tag </$name>
    const closeTagPattern = `</${name}>`
    const restOfText = text.slice(afterName + tagResult.end)
    const closeTagIndex = restOfText.indexOf(closeTagPattern)

    if (closeTagIndex === -1) {
      // No closing tag found - just return the opening tag
      return cx.addElement(cx.elt(Type.InlineWidget, pos, openTagEnd, children))
    }

    // Parse content between opening and closing tags
    const contentStart = openTagEnd
    const contentEnd = openTagEnd + closeTagIndex
    const contentText = cx.slice(contentStart, contentEnd)

    if (contentText.length > 0) {
      const contentElements = cx.parser.parseInline(contentText, contentStart)
      children.push(...contentElements)
    }

    // Add closing tag elements
    const closeTagStart = contentEnd
    const closeTagEnd = closeTagStart + closeTagPattern.length
    const closeTagChildren: Element[] = [
      cx.elt(Type.TagMark, closeTagStart, closeTagStart + 2), // </
      cx.elt(Type.WidgetName, closeTagStart + 2, closeTagEnd - 1),
      cx.elt(Type.TagMark, closeTagEnd - 1, closeTagEnd) // >
    ]
    children.push(cx.elt(Type.WidgetEnd, closeTagStart, closeTagEnd, closeTagChildren))

    return cx.addElement(cx.elt(Type.InlineWidget, pos, closeTagEnd, children))
  }
}

// ============================================================================
// HTML Tag Parser (<tag>content</tag> or <tag/>)
// ============================================================================

const htmlTagStartRe = /^<([a-zA-Z][a-zA-Z0-9\-]*)/

export const HTMLTag: InlineParser = {
  name: "HTMLTag",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.LessThan) return -1
    // Skip if it's a widget
    if (cx.char(pos + 1) === Ch.Dollar) return -1

    const text = cx.slice(pos, cx.end)
    const startMatch = htmlTagStartRe.exec(text)
    if (!startMatch) return -1

    const name = startMatch[1]
    const afterName = startMatch[0].length

    // Find the proper end of the tag (handling > inside attribute values)
    const tagResult = findTagEnd(text.slice(afterName))
    if (!tagResult) return -1

    const openTagEnd = pos + afterName + tagResult.end
    const attrString = text.slice(afterName, afterName + tagResult.end - (tagResult.selfClose ? 2 : 1))

    const children: Element[] = [
      cx.elt(Type.TagMark, pos, pos + 1), // <
      cx.elt(Type.TagName, pos + 1, pos + 1 + name.length),
    ]

    // Parse attributes
    if (attrString.trim()) {
      const attrElements = parseInlineAttributes(cx, attrString, pos + afterName)
      children.push(...attrElements)
    }

    if (tagResult.selfClose) {
      children.push(cx.elt(Type.SelfClosingMarker, openTagEnd - 2, openTagEnd - 1))
      children.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)) // >
      return cx.addElement(cx.elt(Type.HTMLTag, pos, openTagEnd, children))
    }

    children.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)) // >

    // Look for closing tag </name>
    const closeTagPattern = `</${name}>`
    const restOfText = text.slice(afterName + tagResult.end)
    const closeTagIndex = restOfText.indexOf(closeTagPattern)

    if (closeTagIndex === -1) {
      // No closing tag found - just return the opening tag
      return cx.addElement(cx.elt(Type.HTMLTag, pos, openTagEnd, children))
    }

    // Parse content between opening and closing tags
    const contentStart = openTagEnd
    const contentEnd = openTagEnd + closeTagIndex
    const contentText = cx.slice(contentStart, contentEnd)

    if (contentText.length > 0) {
      const contentElements = cx.parser.parseInline(contentText, contentStart)
      children.push(...contentElements)
    }

    // Add closing tag elements
    const closeTagStart = contentEnd
    const closeTagEnd = closeTagStart + closeTagPattern.length
    const closeTagChildren: Element[] = [
      cx.elt(Type.TagMark, closeTagStart, closeTagStart + 2), // </
      cx.elt(Type.TagName, closeTagStart + 2, closeTagEnd - 1),
      cx.elt(Type.TagMark, closeTagEnd - 1, closeTagEnd) // >
    ]
    children.push(cx.elt(Type.HTMLEndTag, closeTagStart, closeTagEnd, closeTagChildren))

    return cx.addElement(cx.elt(Type.HTMLTag, pos, closeTagEnd, children))
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
// Variable Substitution Parser $(variable)$
// ============================================================================

const variableRe = /^\$\(([^)]+)\)\$/

export const VariableSubstitution: InlineParser = {
  name: "VariableSubstitution",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Dollar) return -1
    if (cx.char(pos + 1) !== 40) return -1 // '('

    const text = cx.slice(pos, cx.end)
    const match = variableRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const varName = match[1]
    const varNameStart = pos + 2 // After $(
    const varNameEnd = varNameStart + varName.length

    const children: Element[] = [
      cx.elt(Type.VariableMark, pos, pos + 2),           // $(
      cx.elt(Type.VariableName, varNameStart, varNameEnd),
      cx.elt(Type.VariableMark, varNameEnd, end)         // )$
    ]

    return cx.addElement(cx.elt(Type.Variable, pos, end, children))
  }
}

// ============================================================================
// Placeholder Parser $param$ (in macro definitions)
// ============================================================================

const placeholderRe = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/

export const PlaceholderParam: InlineParser = {
  name: "PlaceholderParam",
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== Ch.Dollar) return -1

    const text = cx.slice(pos, cx.end)
    const match = placeholderRe.exec(text)
    if (!match) return -1

    const end = pos + match[0].length
    const paramName = match[1]
    const paramNameStart = pos + 1 // After $
    const paramNameEnd = paramNameStart + paramName.length

    const children: Element[] = [
      cx.elt(Type.PlaceholderMark, pos, pos + 1),              // $
      cx.elt(Type.VariableName, paramNameStart, paramNameEnd),
      cx.elt(Type.PlaceholderMark, paramNameEnd, end)          // $
    ]

    return cx.addElement(cx.elt(Type.Placeholder, pos, end, children))
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

    // Must be at word boundary (previous char must not be a letter)
    if (pos > cx.offset) {
      const prev = cx.char(pos - 1)
      // Check if previous char is a letter (a-z or A-Z)
      if ((prev >= 65 && prev <= 90) || (prev >= 97 && prev <= 122)) return -1
      // Check it's not escaped with ~
      if (prev === Ch.Tilde) return -1
    }

    const text = cx.slice(pos, cx.end)
    const match = camelCaseRe.exec(text)
    if (!match) return -1

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
// Conditional Syntax Parser (<%if, <%else, <%elseif, <%endif, %>)
// Progressive highlighting - highlights as you type
// ============================================================================

export const ConditionalSyntax: InlineParser = {
  name: "ConditionalSyntax",
  parse(cx: InlineContext, next: number, pos: number): number {
    // Match <% at current position
    if (next !== Ch.LessThan) return -1
    if (cx.char(pos + 1) !== Ch.Percent) return -1

    const text = cx.slice(pos, cx.end)
    const children: Element[] = []

    // Always add the <% mark
    children.push(cx.elt(Type.ConditionalMark, pos, pos + 2))

    // Try to match a keyword after <%
    // Check for <%if, <%elseif, <%else, <%endif (with optional whitespace)
    const keywordMatch = /^<%\s*(if|elseif|else|endif)\b/.exec(text)

    if (keywordMatch) {
      const keyword = keywordMatch[1]
      const keywordStart = pos + text.indexOf(keyword, 2)
      const keywordEnd = keywordStart + keyword.length
      children.push(cx.elt(Type.ConditionalKeyword, keywordStart, keywordEnd))

      // For <%if and <%elseif, try to parse filter expression
      if (keyword === 'if' || keyword === 'elseif') {
        // Look for filter after keyword
        const afterKeyword = text.slice(keywordEnd - pos)
        const filterMatch = /^\s+(.+?)(?:\s*%>|$)/.exec(afterKeyword)
        if (filterMatch) {
          const filterContent = filterMatch[1]
          const filterStart = keywordEnd + afterKeyword.indexOf(filterContent)
          const filterEnd = filterStart + filterContent.length
          // Parse filter expression for nested highlighting
          const filterChildren = parseFilterExpression(cx, filterContent, filterStart)
          children.push(cx.elt(Type.FilterExpression, filterStart, filterEnd, filterChildren))
        }
      }

      // Look for closing %>
      const closeIdx = text.indexOf('%>')
      if (closeIdx !== -1) {
        children.push(cx.elt(Type.ConditionalMark, pos + closeIdx, pos + closeIdx + 2))
        return cx.addElement(cx.elt(Type.Conditional, pos, pos + closeIdx + 2, children))
      } else {
        // Incomplete - highlight what we have so far
        return cx.addElement(cx.elt(Type.Conditional, pos, keywordEnd, children))
      }
    }

    // Just <% with no recognized keyword yet - still highlight it
    // Check if there's a closing %>
    const closeIdx = text.indexOf('%>')
    if (closeIdx !== -1 && closeIdx > 2) {
      // There's content between <% and %> - might be unrecognized keyword
      children.push(cx.elt(Type.ConditionalMark, pos + closeIdx, pos + closeIdx + 2))
      return cx.addElement(cx.elt(Type.Conditional, pos, pos + closeIdx + 2, children))
    }

    // Just <% alone - highlight it
    return cx.addElement(cx.elt(Type.ConditionalMark, pos, pos + 2))
  }
}

// ============================================================================
// Export all default inline parsers
// ============================================================================

export const DefaultInlineParsers: InlineParser[] = [
  ConditionalSyntax,  // Must come early to catch <%
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
  VariableSubstitution,  // $(var)$ - must come before SystemLink and PlaceholderParam
  SystemLink,
  PlaceholderParam,      // $param$ - must come after VariableSubstitution
  CamelCaseLink,
  URLAutoLink,
]
