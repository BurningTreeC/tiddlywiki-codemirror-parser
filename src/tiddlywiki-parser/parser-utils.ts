/**
 * TiddlyWiki Parser - Shared Utilities
 *
 * Common utilities and patterns used across inline, block, and pragma parsers.
 */

import { Type } from "./types"
import { Element, elt, DelimiterType, Ch } from "./core"
import type { InlineContext } from "./inline-context"

// ============================================================================
// Common Regex Patterns
// ============================================================================

/**
 * Common regex patterns used across parsers
 */
export const Patterns = {
  /** Whitespace or start of string - used for flanking rules */
  whitespaceOrStart: /\s|^$/,

  /** Valid attribute name characters */
  attributeName: /^[a-zA-Z_][a-zA-Z0-9_\-]*/,

  /** WikiLink pattern: [[target]] or [[target|text]] */
  wikiLink: /^\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/,

  /** Incomplete WikiLink */
  incompleteWikiLink: /^\[\[([^\]\n]*)$/,

  /** External link pattern: [ext[url]] or [ext[text|url]] */
  extLink: /^\[ext\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/,

  /** Image pattern: [img[source]] or [img[tooltip|source]] */
  imageLink: /^\[img(?:\[([^\]]*?)\])?\[([^\]]*?)\]\]/,

  /** URL pattern */
  url: /^(?:https?|mailto|ftp|file|data|tel|geo|javascript):\/\/[^\s<>\[\]{}|"^`\\]*|^(?:https?|mailto|ftp|file|data|tel|geo|javascript):[^\s<>\[\]{}|"^`\\]+/i,

  /** CamelCase word (for auto-linking) */
  camelCase: /^[A-Z][a-z]+[A-Z][A-Za-z]*/,

  /** HTML/Widget tag name */
  tagName: /^(\$?[a-zA-Z][a-zA-Z0-9\-\.]*)/,

  /** Filter step pattern */
  filterStep: /^\[([^\[\]]*)\]/,
}

// ============================================================================
// Whitespace Utilities
// ============================================================================

/**
 * Check if a string is whitespace or empty (for flanking rules)
 */
export function isWhitespaceOrEmpty(text: string): boolean {
  return Patterns.whitespaceOrStart.test(text)
}

/**
 * Skip whitespace in a string starting at position
 */
export function skipWhitespace(text: string, pos: number): number {
  while (pos < text.length && /\s/.test(text[pos])) pos++
  return pos
}

// ============================================================================
// Delimiter Run Detection
// ============================================================================

/**
 * Configuration for a delimiter type
 */
export interface DelimiterConfig {
  /** The character code for this delimiter (e.g., Ch.Apostrophe for bold) */
  charCode: number
  /** The delimiter type configuration */
  delimType: DelimiterType
  /** Number of characters in the delimiter (default: 2) */
  delimLength?: number
  /** If true, odd-length runs are rejected (e.g., ~~~ for strikethrough) */
  rejectOddRuns?: boolean
}

/**
 * Result of run detection
 */
export interface RunInfo {
  /** Start position of the full run */
  runStart: number
  /** End position of the full run */
  runEnd: number
  /** Length of the full run */
  runLength: number
  /** The position where the delimiter should match */
  matchStart: number
  /** Whether this can be an opener */
  canOpen: boolean
  /** Whether this can be a closer */
  canClose: boolean
}

/**
 * Detect a run of delimiter characters and determine match position.
 *
 * For runs of 3+ characters:
 * - Openers match at the START of the run (first N chars)
 * - Closers match at the END of the run (last N chars)
 *
 * This ensures '''text''' renders as bold with quotes inside: 'text'
 */
export function detectDelimiterRun(
  cx: InlineContext,
  pos: number,
  charCode: number,
  delimLength: number = 2
): RunInfo | null {
  // Find the full run of consecutive delimiter characters
  let runStart = pos
  while (cx.char(runStart - 1) === charCode) runStart--
  let runEnd = pos + delimLength
  while (cx.char(runEnd) === charCode) runEnd++
  const runLength = runEnd - runStart

  // Check flanking based on what's before/after the FULL run
  const beforeRun = cx.slice(runStart - 1, runStart)
  const afterRun = cx.slice(runEnd, runEnd + 1)
  const sBeforeRun = isWhitespaceOrEmpty(beforeRun)
  const sAfterRun = isWhitespaceOrEmpty(afterRun)

  // Determine match position: first N for opener, last N for closer
  // A closer can match if something non-space precedes the run
  let matchStart: number
  if (!sBeforeRun && runLength > delimLength) {
    // Can be closer with extra chars: match last N
    matchStart = runEnd - delimLength
  } else {
    // Opener or exactly N chars: match first N
    matchStart = runStart
  }

  // Flanking for the actual delimiter position
  const before = cx.slice(matchStart - 1, matchStart)
  const after = cx.slice(matchStart + delimLength, matchStart + delimLength + 1)
  const sBefore = isWhitespaceOrEmpty(before)
  const sAfter = isWhitespaceOrEmpty(after)

  return {
    runStart,
    runEnd,
    runLength,
    matchStart,
    // TiddlyWiki uses simpler delimiter matching than CommonMark
    // Don't require strict flanking - allow delimiters regardless of surrounding whitespace
    canOpen: true,
    canClose: true,
  }
}

/**
 * Create a delimiter parser function for paired delimiters like '', //, __, etc.
 *
 * This is a factory function that creates inline parsers for delimiter-based
 * formatting (bold, italic, underline, strikethrough, superscript, subscript).
 */
export function createDelimiterParser(config: DelimiterConfig) {
  const { charCode, delimType, delimLength = 2, rejectOddRuns = false } = config

  return function parseDelimiter(cx: InlineContext, next: number, pos: number): number {
    // Check if we're at the start of a potential delimiter
    if (next !== charCode) return -1

    // Check we have enough consecutive characters
    for (let i = 1; i < delimLength; i++) {
      if (cx.char(pos + i) !== charCode) return -1
    }

    // Detect the full run
    const run = detectDelimiterRun(cx, pos, charCode, delimLength)
    if (!run) return -1

    // Reject odd-length runs if configured (e.g., ~~~ for strikethrough)
    if (rejectOddRuns && run.runLength % 2 === 1) return -1

    // Only proceed if we're at the correct match position
    if (pos !== run.matchStart) return -1

    return cx.addDelimiter(delimType, pos, pos + delimLength, run.canOpen, run.canClose)
  }
}

// ============================================================================
// Transclusion Target Parsing
// ============================================================================

/**
 * Parse a transclusion target like "tiddler!!field" or "tiddler##index"
 * Returns elements for the target, field indicator, and index indicator
 */
export function parseTransclusionTarget(target: string, offset: number): Element[] {
  const elements: Element[] = []

  // Check for field reference (!!field)
  const fieldIdx = target.indexOf("!!")
  if (fieldIdx >= 0) {
    if (fieldIdx > 0) {
      elements.push(elt(Type.TransclusionTarget, offset, offset + fieldIdx))
    }
    elements.push(elt(Type.TransclusionField, offset + fieldIdx, offset + target.length))
    return elements
  }

  // Check for index reference (##index)
  const indexIdx = target.indexOf("##")
  if (indexIdx >= 0) {
    if (indexIdx > 0) {
      elements.push(elt(Type.TransclusionTarget, offset, offset + indexIdx))
    }
    elements.push(elt(Type.TransclusionIndex, offset + indexIdx, offset + target.length))
    return elements
  }

  // Simple target
  if (target.length > 0) {
    elements.push(elt(Type.TransclusionTarget, offset, offset + target.length))
  }

  return elements
}

// ============================================================================
// Tag End Finding
// ============================================================================

/**
 * Result of finding a tag end
 */
export interface TagEndResult {
  /** Position of the closing > or /> */
  endPos: number
  /** Whether it's self-closing (/>) */
  selfClosing: boolean
}

/**
 * Find the end of an HTML/Widget tag, handling nested quotes, macros, etc.
 *
 * This properly handles:
 * - Quoted strings (single and double quotes)
 * - Macro calls <<...>>
 * - Transclusions {{...}}
 * - Filtered transclusions {{{...}}}
 * - Substituted strings `...`
 */
export function findTagEnd(text: string, startPos: number = 0): TagEndResult | null {
  let pos = startPos
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false

  while (pos < text.length) {
    const ch = text[pos]

    // Handle quotes
    if (ch === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote
      pos++
      continue
    }
    if (ch === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote
      pos++
      continue
    }
    if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick
      pos++
      continue
    }

    // Skip content inside quotes
    if (inSingleQuote || inDoubleQuote || inBacktick) {
      pos++
      continue
    }

    // Skip macro calls <<...>>
    if (ch === '<' && text[pos + 1] === '<') {
      let depth = 1
      pos += 2
      while (pos < text.length && depth > 0) {
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
      continue
    }

    // Skip filtered transclusions {{{...}}}
    if (ch === '{' && text[pos + 1] === '{' && text[pos + 2] === '{') {
      pos += 3
      while (pos < text.length - 2) {
        if (text[pos] === '}' && text[pos + 1] === '}' && text[pos + 2] === '}') {
          pos += 3
          break
        }
        pos++
      }
      continue
    }

    // Skip transclusions {{...}}
    if (ch === '{' && text[pos + 1] === '{') {
      pos += 2
      while (pos < text.length - 1) {
        if (text[pos] === '}' && text[pos + 1] === '}') {
          pos += 2
          break
        }
        pos++
      }
      continue
    }

    // Check for self-closing />
    if (ch === '/' && text[pos + 1] === '>') {
      return { endPos: pos + 2, selfClosing: true }
    }

    // Check for closing >
    if (ch === '>') {
      return { endPos: pos + 1, selfClosing: false }
    }

    // Check for newline (tag must be on single line for inline)
    if (ch === '\n') {
      return null
    }

    pos++
  }

  return null
}

// ============================================================================
// Filter Expression Parsing
// ============================================================================

/**
 * Parse a filter expression and return elements for syntax highlighting.
 *
 * Handles:
 * - Filter steps: [operator[operand]]
 * - Variables: <variable>
 * - Text references: {textref}
 * - Regex: /pattern/flags
 * - Run prefixes: +, -, ~, :named
 */
export function parseFilterExpression(
  content: string,
  offset: number,
  options: { allowRegex?: boolean } = {}
): Element[] {
  const elements: Element[] = []
  let pos = 0

  while (pos < content.length) {
    const ch = content[pos]

    // Skip whitespace
    if (/\s/.test(ch)) {
      pos++
      continue
    }

    // Run prefix: + - ~ or :name
    if (ch === '+' || ch === '-' || ch === '~') {
      pos++
      continue
    }
    if (ch === ':') {
      // Named run prefix :name
      const nameMatch = content.slice(pos + 1).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)
      if (nameMatch) {
        pos += 1 + nameMatch[0].length
      } else {
        pos++
      }
      continue
    }

    // Filter step: [...]
    if (ch === '[') {
      const stepStart = pos
      let depth = 1
      pos++

      while (pos < content.length && depth > 0) {
        const c = content[pos]
        if (c === '[') depth++
        else if (c === ']') depth--
        pos++
      }

      if (depth === 0) {
        const stepContent = content.slice(stepStart + 1, pos - 1)
        const stepElements = parseFilterStep(stepContent, offset + stepStart + 1)
        elements.push(elt(Type.FilterRun, offset + stepStart, offset + pos, stepElements))
      }
      continue
    }

    // Variable: <varname>
    if (ch === '<') {
      const varMatch = content.slice(pos).match(/^<([^<>]+)>/)
      if (varMatch) {
        elements.push(elt(Type.FilterVariable, offset + pos, offset + pos + varMatch[0].length))
        pos += varMatch[0].length
        continue
      }
    }

    // Text reference: {textref}
    if (ch === '{') {
      const refMatch = content.slice(pos).match(/^\{([^{}]+)\}/)
      if (refMatch) {
        elements.push(elt(Type.FilterTextRef, offset + pos, offset + pos + refMatch[0].length))
        pos += refMatch[0].length
        continue
      }
    }

    // Regex: /pattern/flags (if allowed)
    if (options.allowRegex && ch === '/') {
      const regexMatch = content.slice(pos).match(/^\/(?:[^\/\\]|\\.)*\/[gimsuy]*/)
      if (regexMatch) {
        elements.push(elt(Type.FilterRegexp, offset + pos, offset + pos + regexMatch[0].length))
        pos += regexMatch[0].length
        continue
      }
    }

    pos++
  }

  return elements
}

/**
 * Parse a single filter step like "operator[operand]" or "operator{textref}"
 */
function parseFilterStep(content: string, offset: number): Element[] {
  const elements: Element[] = []

  // Match operator name (with optional : suffix)
  const opMatch = content.match(/^(!?)([a-zA-Z_][a-zA-Z0-9_\-\.]*)?(:?)/)
  if (!opMatch) return elements

  let pos = 0
  const [fullMatch, negation, opName, colonSuffix] = opMatch

  if (fullMatch.length > 0) {
    elements.push(elt(Type.FilterOperator, offset, offset + fullMatch.length))
    pos = fullMatch.length
  }

  // Parse operand(s)
  while (pos < content.length) {
    const ch = content[pos]

    // Operand in brackets: [value]
    if (ch === '[') {
      const closePos = findMatchingBracket(content, pos, '[', ']')
      if (closePos > pos) {
        elements.push(elt(Type.FilterOperand, offset + pos, offset + closePos + 1))
        pos = closePos + 1
        continue
      }
    }

    // Operand in braces: {textref}
    if (ch === '{') {
      const closePos = findMatchingBracket(content, pos, '{', '}')
      if (closePos > pos) {
        elements.push(elt(Type.FilterTextRef, offset + pos, offset + closePos + 1))
        pos = closePos + 1
        continue
      }
    }

    // Operand in angle brackets: <variable>
    if (ch === '<') {
      const closePos = findMatchingBracket(content, pos, '<', '>')
      if (closePos > pos) {
        elements.push(elt(Type.FilterVariable, offset + pos, offset + closePos + 1))
        pos = closePos + 1
        continue
      }
    }

    // Regex operand: /pattern/
    if (ch === '/') {
      const regexMatch = content.slice(pos).match(/^\/(?:[^\/\\]|\\.)*\/[gimsuy]*/)
      if (regexMatch) {
        elements.push(elt(Type.FilterRegexp, offset + pos, offset + pos + regexMatch[0].length))
        pos += regexMatch[0].length
        continue
      }
    }

    pos++
  }

  return elements
}

/**
 * Find the matching closing bracket
 */
function findMatchingBracket(text: string, pos: number, open: string, close: string): number {
  let depth = 0
  while (pos < text.length) {
    if (text[pos] === open) depth++
    else if (text[pos] === close) {
      depth--
      if (depth === 0) return pos
    }
    pos++
  }
  return -1
}

// ============================================================================
// Macro Parameter Parsing
// ============================================================================

/**
 * Parse macro parameters and return elements.
 *
 * Handles:
 * - Named parameters: name:value or name:"quoted value"
 * - Positional parameters: value or "quoted value"
 * - Triple bracketed: [[[value]]]
 * - Double bracketed: [[value]]
 * - Single and double quoted strings
 *
 * Returns MacroParam elements wrapping MacroParamName (optional) and MacroParamValue
 */
export function parseMacroParams(paramsStr: string, offset: number): Element[] {
  const elements: Element[] = []
  let pos = 0
  const len = Math.min(paramsStr.length, 5000)  // Safety limit
  let iterations = 0
  const maxIterations = 200  // Safety limit on number of parameters

  while (pos < len && iterations < maxIterations) {
    iterations++
    // Skip whitespace
    while (pos < len && /\s/.test(paramsStr[pos])) pos++
    if (pos >= len) break

    const paramStart = pos

    // Check if it's a named parameter (name:value)
    let nameEnd = pos
    while (nameEnd < len && /[a-zA-Z0-9\-_]/.test(paramsStr[nameEnd])) nameEnd++

    if (nameEnd > pos && paramsStr[nameEnd] === ':') {
      // Named parameter
      const nameStart = pos
      pos = nameEnd + 1 // skip the :

      // Parse value
      const valueStart = pos
      let valueEnd = pos

      if (paramsStr[pos] === '"' || paramsStr[pos] === "'") {
        // Quoted value
        const quote = paramsStr[pos]
        pos++
        while (pos < len && paramsStr[pos] !== quote) {
          if (paramsStr[pos] === '\\') pos++
          pos++
        }
        if (pos < len) pos++
        valueEnd = pos
      } else if (paramsStr.slice(pos, pos + 3) === '[[[') {
        // Triple bracket: [[[value]]]
        pos += 3
        while (pos < len && paramsStr.slice(pos, pos + 3) !== ']]]') pos++
        if (pos < len) pos += 3  // Only skip if we found the closing
        valueEnd = pos
      } else if (paramsStr.slice(pos, pos + 2) === '[[') {
        // Double bracket: [[value]]
        pos += 2
        while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]') pos++
        if (pos < len) pos += 2  // Only skip if we found the closing
        valueEnd = pos
      } else {
        // Unquoted value
        while (pos < len && !/[\s>]/.test(paramsStr[pos])) pos++
        valueEnd = pos
      }

      const paramChildren: Element[] = [
        elt(Type.MacroParamName, offset + nameStart, offset + nameEnd),
        elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd)
      ]
      elements.push(elt(Type.MacroParam, offset + paramStart, offset + valueEnd, paramChildren))
    } else {
      // Positional parameter (just a value)
      const valueStart = pos

      if (paramsStr[pos] === '"' || paramsStr[pos] === "'") {
        const quote = paramsStr[pos]
        pos++
        while (pos < len && paramsStr[pos] !== quote) {
          if (paramsStr[pos] === '\\') pos++
          pos++
        }
        if (pos < len) pos++
      } else if (paramsStr.slice(pos, pos + 3) === '[[[') {
        pos += 3
        while (pos < len && paramsStr.slice(pos, pos + 3) !== ']]]') pos++
        if (pos < len) pos += 3
      } else if (paramsStr.slice(pos, pos + 2) === '[[') {
        pos += 2
        while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]') pos++
        if (pos < len) pos += 2
      } else {
        while (pos < len && !/[\s>]/.test(paramsStr[pos])) pos++
      }

      const paramChildren: Element[] = [
        elt(Type.MacroParamValue, offset + valueStart, offset + pos)
      ]
      elements.push(elt(Type.MacroParam, offset + paramStart, offset + pos, paramChildren))
    }
  }

  return elements
}
