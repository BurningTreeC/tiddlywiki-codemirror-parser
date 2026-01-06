/**
 * TiddlyWiki Parser - Block Parsers
 *
 * Block-level parsing rules following the Lezer Markdown architecture.
 */

import { Type } from "./types"
import { Element, elt, Line, BlockParser, BlockResult, Ch, space } from "./core"
import type { BlockContext } from "./block-context"
import { parseTransclusionTarget, parseMacroParams } from "./utils"

// ============================================================================
// Heading Parser (! to !!!!!!)
// ============================================================================

function isHeading(line: Line): number {
  if (line.next !== Ch.Exclamation) return -1
  let level = 1
  let pos = 1
  while (pos < line.text.length && line.text.charCodeAt(pos) === Ch.Exclamation && level < 6) {
    level++
    pos++
  }
  return level
}

export const Heading: BlockParser = {
  name: "Heading",
  parse(cx: BlockContext, line: Line): BlockResult {
    const level = isHeading(line)
    if (level < 0) return false

    const start = cx.lineStart
    const markEnd = start + level
    const textStart = markEnd

    // Parse inline content after the !
    const contentText = line.text.slice(level)
    const inlineElements = cx.parser.parseInline(contentText, textStart)

    // Determine heading type based on level
    const headingType = [Type.Heading1, Type.Heading2, Type.Heading3, Type.Heading4, Type.Heading5, Type.Heading6][level - 1]

    const children: Element[] = [
      elt(Type.HeadingMark, start, markEnd),
      ...(inlineElements as Element[])
    ]

    cx.addElement(elt(headingType, start, start + line.text.length, children))
    return true
  }
}

// ============================================================================
// Horizontal Rule Parser (---)
// ============================================================================

const hrRe = /^-{3,}\s*$/

export const HorizontalRule: BlockParser = {
  name: "HorizontalRule",
  parse(cx: BlockContext, line: Line): BlockResult {
    if (!hrRe.test(line.text)) return false

    cx.addElement(elt(Type.HorizontalRule, cx.lineStart, cx.lineStart + line.text.length))
    return true
  }
}

// ============================================================================
// Fenced Code Block (```)
// ============================================================================

const codeStartRe = /^```(\S*)/
const codeEndRe = /^```\s*$/

export const FencedCode: BlockParser = {
  name: "FencedCode",
  parse(cx: BlockContext, line: Line): BlockResult {
    const match = codeStartRe.exec(line.text)
    if (!match) return false

    const start = cx.lineStart
    const lang = match[1]
    const children: Element[] = [
      elt(Type.CodeMark, start, start + 3)
    ]

    if (lang) {
      children.push(elt(Type.CodeInfo, start + 3, start + 3 + lang.length))
    }

    // Find closing ```
    let codeContent = ""
    let codeStart = cx.lineStart + line.text.length + 1
    let foundEnd = false

    while (cx.nextLine()) {
      if (codeEndRe.test(cx.line.text)) {
        children.push(elt(Type.CodeText, codeStart, cx.prevLineEnd()))
        children.push(elt(Type.CodeMark, cx.lineStart, cx.lineStart + 3))
        foundEnd = true
        break
      }
      if (codeContent) codeContent += "\n"
      codeContent += cx.line.text
    }

    if (!foundEnd) {
      // Unclosed code block - include all remaining content as code
      const codeEnd = cx.prevLineEnd()
      if (codeEnd > codeStart) {
        children.push(elt(Type.CodeText, codeStart, codeEnd))
      }
    }

    const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.prevLineEnd()
    cx.addElement(elt(Type.FencedCode, start, end, children))
    return true
  }
}

// ============================================================================
// Typed Block ($$$)
// ============================================================================

const typedStartRe = /^\$\$\$([\w\/\-\.\+]*)$/
const typedEndRe = /^\$\$\$\s*$/

export const TypedBlock: BlockParser = {
  name: "TypedBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const match = typedStartRe.exec(line.text)
    if (!match) return false

    const start = cx.lineStart
    const typeName = match[1]
    const children: Element[] = [
      elt(Type.TypedBlockMark, start, start + 3)
    ]

    if (typeName) {
      children.push(elt(Type.TypedBlockType, start + 3, start + 3 + typeName.length))
    }

    // Use PlainText for text/plain, CodeText for everything else
    const contentType = typeName === "text/plain" ? Type.PlainText : Type.CodeText

    // Find closing $$$
    let contentStart = cx.lineStart + line.text.length + 1
    let foundEnd = false

    while (cx.nextLine()) {
      if (typedEndRe.test(cx.line.text)) {
        children.push(elt(contentType, contentStart, cx.prevLineEnd()))
        children.push(elt(Type.TypedBlockMark, cx.lineStart, cx.lineStart + 3))
        foundEnd = true
        break
      }
    }

    if (!foundEnd) {
      // Unclosed typed block - include all remaining content
      const contentEnd = cx.prevLineEnd()
      if (contentEnd > contentStart) {
        children.push(elt(contentType, contentStart, contentEnd))
      }
    }

    const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.prevLineEnd()
    cx.addElement(elt(Type.TypedBlock, start, end, children))
    return true
  }
}

// ============================================================================
// Hard Line Breaks Block (""" ... """)
// ============================================================================

const hardLineBreaksRe = /^"""\s*$/

export const HardLineBreaks: BlockParser = {
  name: "HardLineBreaks",
  parse(cx: BlockContext, line: Line): BlockResult {
    if (!hardLineBreaksRe.test(line.text)) return false

    const start = cx.lineStart
    const children: Element[] = [
      elt(Type.HardLineBreaksMark, start, start + 3)
    ]

    // Find closing """
    let contentStart = cx.lineStart + line.text.length + 1
    let foundEnd = false

    while (cx.nextLine()) {
      if (hardLineBreaksRe.test(cx.line.text)) {
        // Parse content between opening and closing """ as inline content
        if (cx.lineStart - 1 > contentStart) {
          const contentText = cx.input.read(contentStart, cx.lineStart - 1)
          const inlineElements = cx.parser.parseInline(contentText, contentStart)
          children.push(...(inlineElements as Element[]))
        }
        children.push(elt(Type.HardLineBreaksMark, cx.lineStart, cx.lineStart + 3))
        foundEnd = true
        break
      }
    }

    if (!foundEnd) {
      // Parse content even if unclosed
      if (cx.lineStart > contentStart) {
        const contentText = cx.input.read(contentStart, cx.lineStart)
        const inlineElements = cx.parser.parseInline(contentText, contentStart)
        children.push(...(inlineElements as Element[]))
      }
    }

    const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.lineStart
    cx.addElement(elt(Type.HardLineBreaks, start, end, children))
    return true
  }
}

// ============================================================================
// List Parser (* # ; : >)
// ============================================================================

const listMarkerRe = /^([*#;:>]+)/

const listTypeMap: { [ch: string]: { list: Type, item: Type } } = {
  "*": { list: Type.BulletList, item: Type.ListItem },
  "#": { list: Type.OrderedList, item: Type.ListItem },
  ";": { list: Type.DefinitionList, item: Type.DefinitionTerm },
  ":": { list: Type.DefinitionList, item: Type.DefinitionDescription },
  ">": { list: Type.BlockQuote, item: Type.ListItem },
}

/**
 * Check if a marker character is compatible with continuing a list
 * Definition lists allow both ; and : as compatible markers
 */
function isCompatibleMarker(firstMarker: string, currentMarker: string): boolean {
  if (firstMarker === currentMarker) return true
  // Definition lists: ; (term) and : (description) are compatible
  if ((firstMarker === ";" || firstMarker === ":") &&
      (currentMarker === ";" || currentMarker === ":")) {
    return true
  }
  return false
}

export const List: BlockParser = {
  name: "List",
  parse(cx: BlockContext, line: Line): BlockResult {
    const match = listMarkerRe.exec(line.text)
    if (!match) return false

    const markers = match[1]
    const firstMarker = markers[0]
    const listInfo = listTypeMap[firstMarker]
    if (!listInfo) return false

    const start = cx.lineStart
    const items: Element[] = []

    // Parse list items
    while (true) {
      const itemMatch = listMarkerRe.exec(cx.line.text)
      if (!itemMatch || !isCompatibleMarker(firstMarker, itemMatch[1][0])) break

      const itemMarkers = itemMatch[1]
      const itemStart = cx.lineStart
      const markerEnd = itemStart + itemMarkers.length

      // Parse inline content
      const contentText = cx.line.text.slice(itemMarkers.length)
      const inlineElements = cx.parser.parseInline(contentText, markerEnd)

      const itemChildren: Element[] = [
        elt(Type.ListMark, itemStart, markerEnd),
        ...(inlineElements as Element[])
      ]

      const itemType = listTypeMap[itemMarkers[itemMarkers.length - 1]]?.item || Type.ListItem
      items.push(elt(itemType, itemStart, itemStart + cx.line.text.length, itemChildren))

      // Peek at next line before advancing - don't consume non-list lines
      const nextText = cx.peekLine()
      if (nextText === null) break

      const nextMatch = listMarkerRe.exec(nextText)
      if (!nextMatch || !isCompatibleMarker(firstMarker, nextMatch[1][0])) break

      // Next line continues the list, so advance to it
      cx.nextLine()
    }

    // cx.line is at the last list item (not advanced past it)
    cx.addElement(elt(listInfo.list, start, cx.lineStart + cx.line.text.length, items))
    return true
  }
}

// ============================================================================
// Multi-line Block Quote (<<<...<<<)
// ============================================================================

// Opening: <<< (optionally with class)
const blockQuoteOpenRe = /^<<<(.*)$/
// Closing: <<< (optionally with citation)
const blockQuoteCloseRe = /^<<<(.*)$/

export const MultiLineBlockQuote: BlockParser = {
  name: "MultiLineBlockQuote",
  parse(cx: BlockContext, line: Line): BlockResult {
    const openMatch = blockQuoteOpenRe.exec(line.text)
    if (!openMatch) return false

    // Check it's actually <<< at start (not <<<<)
    if (!line.text.startsWith("<<<") || line.text.startsWith("<<<<")) return false

    const start = cx.lineStart
    const openingMarkEnd = start + 3 // Length of "<<<""
    const classText = openMatch[1].trim()

    const children: Element[] = [
      elt(Type.QuoteMark, start, openingMarkEnd)
    ]

    // Parse class/style info after opening <<<
    if (classText) {
      const rawClassText = openMatch[1]
      const leadingSpaces = rawClassText.length - rawClassText.trimStart().length
      const classStart = openingMarkEnd + leadingSpaces
      children.push(elt(Type.BlockQuoteClass, classStart, classStart + classText.length))
    }

    // Find the closing <<<
    const contentStart = start + line.text.length + 1 // After opening line + newline
    let contentEnd = contentStart
    let closingStart = -1
    let closingEnd = -1
    let citation = ""
    let closingLineText = ""

    while (cx.nextLine()) {
      const lineText = cx.line.text

      // Check for closing <<<
      if (lineText.startsWith("<<<") && !lineText.startsWith("<<<<")) {
        closingStart = cx.lineStart
        closingEnd = cx.lineStart + lineText.length
        contentEnd = closingStart - 1 // Before closing line (exclude newline)
        closingLineText = lineText
        citation = lineText.slice(3).trim()
        break
      }
    }

    // Parse content between opening and closing <<< recursively
    if (contentEnd > contentStart) {
      const contentElements = cx.parseContentRange(contentStart, contentEnd, false)
      children.push(...contentElements)
    }

    // Add closing mark
    if (closingStart >= 0) {
      children.push(elt(Type.QuoteMark, closingStart, closingStart + 3))

      // If there's a citation, parse it as inline content
      if (citation) {
        const rawCitation = closingLineText.slice(3)
        const leadingSpaces = rawCitation.length - rawCitation.trimStart().length
        const citationStart = closingStart + 3 + leadingSpaces
        const citationElements = cx.parser.parseInline(citation, citationStart)
        children.push(...(citationElements as Element[]))
      }
    }

    const blockEnd = closingEnd >= 0 ? closingEnd : cx.prevLineEnd()
    cx.addElement(elt(Type.BlockQuote, start, blockEnd, children))
    return true
  }
}

// ============================================================================
// Table Parser (|...|)
// ============================================================================

const tableRowRe = /^\|.*\|([fhck])?\s*$/

// Map row suffix markers to row types
const tableRowTypeMap: { [key: string]: Type } = {
  "c": Type.TableCaption,
  "k": Type.TableClass,
  "h": Type.TableHeader,
  "f": Type.TableFooter,
}

export const Table: BlockParser = {
  name: "Table",
  parse(cx: BlockContext, line: Line): BlockResult {
    if (!tableRowRe.test(line.text)) return false

    const start = cx.lineStart
    const rows: Element[] = []

    while (true) {
      const rowText = cx.line.text
      const match = tableRowRe.exec(rowText)
      if (!match) break

      const rowStart = cx.lineStart
      const marker = match[1]  // c, k, h, f, or undefined
      const rowType = marker ? tableRowTypeMap[marker] : Type.TableRow
      const cells = parseTableRow(rowText, rowStart, cx, marker)
      rows.push(elt(rowType, rowStart, rowStart + rowText.length, cells))

      if (!cx.nextLine()) break
    }

    cx.addElement(elt(Type.Table, start, cx.prevLineEnd(), rows))
    return true
  }
}

function parseTableRow(text: string, offset: number, cx: BlockContext, marker?: string): Element[] {
  const cells: Element[] = []
  let pos = 0
  let cellStart = -1

  // If there's a marker, we need to stop before it
  const endPos = marker ? text.length - 1 : text.length

  while (pos < endPos) {
    const ch = text.charCodeAt(pos)

    if (ch === Ch.Pipe) {
      if (cellStart >= 0) {
        // End of cell content
        const rawCellText = text.slice(cellStart, pos)
        const leadingSpaces = rawCellText.length - rawCellText.trimStart().length
        const cellText = rawCellText.trim()
        const isHeader = cellText.startsWith("!")
        const cellType = isHeader ? Type.TableHeaderCell : Type.TableCell

        // Parse inline content - account for leading whitespace from trim
        const contentStart = cellStart + leadingSpaces + (isHeader ? 1 : 0)
        const contentText = isHeader ? cellText.slice(1) : cellText
        const inlineElements = cx.parser.parseInline(contentText, offset + contentStart)

        cells.push(elt(cellType, offset + cellStart, offset + pos, inlineElements as Element[]))
      }
      cells.push(elt(Type.TableDelimiter, offset + pos, offset + pos + 1))
      cellStart = -1
      pos++
    } else {
      if (cellStart < 0) cellStart = pos
      pos++
    }
  }

  // Add the row marker if present
  if (marker) {
    cells.push(elt(Type.TableMarker, offset + text.length - 1, offset + text.length))
  }

  return cells
}

// ============================================================================
// Comment Block (<!-- -->)
// ============================================================================

const htmlCommentStartRe = /^<!--/
const htmlCommentEndRe = /-->/

export const CommentBlock: BlockParser = {
  name: "CommentBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const text = line.text.trim()

    // HTML-style comment
    if (htmlCommentStartRe.test(text)) {
      const start = cx.lineStart

      // Check for --> on this line
      const endMatch = text.match(/-->/)
      if (endMatch) {
        const commentEndPos = start + line.text.indexOf('-->') + 3
        cx.addElement(elt(Type.CommentBlock, start, commentEndPos, [
          elt(Type.CommentMarker, start, start + 4),
          elt(Type.CommentMarker, commentEndPos - 3, commentEndPos),
        ]))

        // Parse any inline content after the comment on the same line
        const afterComment = line.text.slice(line.text.indexOf('-->') + 3)
        if (afterComment.trim()) {
          const inlineElements = cx.parser.parseInline(afterComment, commentEndPos)
          const paragraphElt = cx.elt(Type.Paragraph, commentEndPos, commentEndPos + afterComment.length, inlineElements as Element[])
          cx.addElement(paragraphElt)
        }
        return true
      }

      // Multi-line comment
      while (cx.nextLine()) {
        const lineText = cx.line.text
        const endIdx = lineText.indexOf('-->')
        if (endIdx !== -1) {
          const commentEndPos = cx.lineStart + endIdx + 3
          cx.addElement(elt(Type.CommentBlock, start, commentEndPos))

          // Parse any inline content after the comment
          const afterComment = lineText.slice(endIdx + 3)
          if (afterComment.trim()) {
            const inlineElements = cx.parser.parseInline(afterComment, commentEndPos)
            const paragraphElt = cx.elt(Type.Paragraph, commentEndPos, commentEndPos + afterComment.length, inlineElements as Element[])
            cx.addElement(paragraphElt)
          }
          return true
        }
      }

      // Unclosed comment
      cx.addElement(elt(Type.CommentBlock, start, cx.lineStart))
      return true
    }

    return false
  }
}

// ============================================================================
// Block Transclusion ({{...}})
// ============================================================================

const transclusionBlockRe = /^\{\{([^{}|]*)(?:\|\|([^{}|]+))?(?:\|([^{}]+))?\}\}\s*$/

// parseTransclusionTarget is now imported from utils.ts

export const TransclusionBlock: BlockParser = {
  name: "TransclusionBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const match = transclusionBlockRe.exec(line.text)
    if (!match) return false

    const start = cx.lineStart
    const target = match[1]
    const template = match[2]
    const params = match[3]

    const children: Element[] = [
      elt(Type.TransclusionMark, start, start + 2),
    ]

    // Parse target details (tiddler!!field or tiddler##index)
    const targetChildren = parseTransclusionTarget(target, start + 2)
    children.push(...targetChildren)

    let pos = start + 2 + target.length
    if (template) {
      children.push(elt(Type.TransclusionTemplate, pos + 2, pos + 2 + template.length))
      pos += 2 + template.length
    }

    children.push(elt(Type.TransclusionMark, start + line.text.length - 2, start + line.text.length))

    cx.addElement(elt(Type.TransclusionBlock, start, start + line.text.length, children))
    return true
  }
}

// ============================================================================
// Filtered Transclusion Block ({{{...}}})
// ============================================================================

/**
 * Parse filter expression content into detailed elements
 * Handles chained operators like [<var>operator{ref}]
 */
function parseFilterExpressionBlock(filterContent: string, offset: number): Element[] {
  const elements: Element[] = []
  let pos = 0
  const len = filterContent.length

  while (pos < len) {
    const ch = filterContent[pos]

    if (/\s/.test(ch)) {
      pos++
      continue
    }

    // Filter step: [operators...]
    if (ch === '[') {
      const stepStart = pos
      pos++ // skip [

      const stepChildren: Element[] = []

      while (pos < len && filterContent[pos] !== ']') {
        if (filterContent[pos] === '!') {
          pos++
        }

        const operandCh = filterContent[pos]

        if (operandCh === '[') {
          pos++
          const operandStart = pos
          let depth = 1
          while (pos < len && depth > 0) {
            if (filterContent[pos] === '[') depth++
            else if (filterContent[pos] === ']') depth--
            if (depth > 0) pos++
          }
          stepChildren.push(elt(Type.FilterOperand, offset + operandStart, offset + pos))
          if (pos < len && filterContent[pos] === ']') pos++
        } else if (operandCh === '<') {
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '>') pos++
          stepChildren.push(elt(Type.FilterVariable, offset + operandStart, offset + pos))
          if (pos < len) pos++
        } else if (operandCh === '{') {
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '}') pos++
          stepChildren.push(elt(Type.FilterTextRef, offset + operandStart, offset + pos))
          if (pos < len) pos++
        } else if (operandCh === '/') {
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '/') {
            if (filterContent[pos] === '\\') pos++
            pos++
          }
          stepChildren.push(elt(Type.FilterRegexp, offset + operandStart, offset + pos))
          if (pos < len) pos++
          while (pos < len && /[gimsuy]/.test(filterContent[pos])) pos++
        } else if (/[a-zA-Z]/.test(operandCh)) {
          const opStart = pos
          while (pos < len && /[a-zA-Z0-9\-_:!]/.test(filterContent[pos])) pos++
          stepChildren.push(elt(Type.FilterOperatorName, offset + opStart, offset + pos))
        } else {
          pos++
        }
      }

      if (pos < len && filterContent[pos] === ']') pos++

      const stepEnd = pos
      elements.push(elt(Type.FilterOperator, offset + stepStart, offset + stepEnd, stepChildren))
      continue
    }

    // Standalone title: [[Title]]
    if (ch === '[' && filterContent[pos + 1] === '[') {
      const start = pos
      pos += 2
      while (pos < len && !(filterContent[pos] === ']' && filterContent[pos + 1] === ']')) pos++
      pos += 2
      elements.push(elt(Type.FilterOperand, offset + start, offset + pos))
      continue
    }

    // Run prefix
    if (ch === '+' || ch === '-' || ch === '~' || ch === ':') {
      pos++
      while (pos < len && /[a-zA-Z]/.test(filterContent[pos])) pos++
      continue
    }

    pos++
  }

  return elements
}

export const FilteredTransclusionBlock: BlockParser = {
  name: "FilteredTransclusionBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    if (!line.text.startsWith("{{{")) return false

    // Find closing }}}
    const closeIdx = line.text.indexOf("}}}", 3)
    if (closeIdx === -1) return false

    // Check that rest of line is empty or has template
    const afterClose = line.text.slice(closeIdx + 3).trim()
    let template = ""
    if (afterClose) {
      if (!afterClose.startsWith("||")) return false
      template = afterClose.slice(2)
    }

    const start = cx.lineStart
    const filter = line.text.slice(3, closeIdx)

    // Parse filter expression details
    const filterChildren = parseFilterExpressionBlock(filter, start + 3)

    const children: Element[] = [
      elt(Type.FilteredTransclusionMark, start, start + 3),
      elt(Type.FilterExpression, start + 3, start + 3 + filter.length, filterChildren),
      elt(Type.FilteredTransclusionMark, start + 3 + filter.length, start + 6 + filter.length),
    ]

    if (template) {
      children.push(elt(Type.TransclusionTemplate, start + closeIdx + 5, start + closeIdx + 5 + template.length))
    }

    cx.addElement(elt(Type.FilteredTransclusionBlock, start, start + line.text.length, children))
    return true
  }
}

// ============================================================================
// Macro Call Block (<<...>>)
// ============================================================================

// parseMacroParams is imported from utils.ts

export const MacroCallBlock: BlockParser = {
  name: "MacroCallBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    if (!line.text.startsWith("<<")) return false

    const start = cx.lineStart

    // Parse macro name (stop at whitespace or >)
    let nameEnd = 2
    while (nameEnd < line.text.length && !/[\s>]/.test(line.text[nameEnd])) nameEnd++
    const name = line.text.slice(2, nameEnd)
    if (!name) return false

    // Find closing >> - could be on same line or subsequent lines
    let closeIdx = line.text.indexOf(">>", 2)
    let allContent = line.text
    let endPos = cx.lineStart + line.text.length

    // Helper to build macro children with name element
    const buildNameElement = (children: Element[]) => {
      // Check if name is a substituted parameter: __param__
      const substitutedMatch = /^__([^_]+)__$/.exec(name)
      if (substitutedMatch) {
        const paramName = substitutedMatch[1]
        const nameStart = start + 2
        const nameChildren: Element[] = [
          elt(Type.SubstitutedParamMark, nameStart, nameStart + 2),  // __
          elt(Type.SubstitutedParamName, nameStart + 2, nameStart + 2 + paramName.length),
          elt(Type.SubstitutedParamMark, nameStart + 2 + paramName.length, nameStart + name.length),  // __
        ]
        children.push(elt(Type.SubstitutedParam, nameStart, nameStart + name.length, nameChildren))
      } else {
        children.push(elt(Type.MacroName, start + 2, start + 2 + name.length))
      }
    }

    if (closeIdx === -1) {
      // Multi-line macro: accumulate lines until we find >>
      while (cx.nextLine()) {
        const currentLine = cx.line.text
        allContent += "\n" + currentLine
        endPos = cx.lineStart + currentLine.length

        // Check if this line ends with >> (possibly with trailing whitespace)
        const trimmedLine = currentLine.trimEnd()
        if (trimmedLine.endsWith(">>")) {
          closeIdx = allContent.length - (currentLine.length - trimmedLine.lastIndexOf(">>"))
          break
        }
      }

      // If still no closing >>, this is an incomplete multi-line macro
      if (closeIdx === -1) {
        // Parse as incomplete macro with whatever content we have
        const children: Element[] = [
          elt(Type.MacroCallMark, start, start + 2),
        ]
        buildNameElement(children)

        // Parse parameters - everything after name
        const paramsStr = allContent.slice(nameEnd)
        if (paramsStr.trim()) {
          const paramElements = parseMacroParams(paramsStr, start + nameEnd)
          children.push(...paramElements)
        }

        cx.addElement(elt(Type.MacroCallBlock, start, endPos, children))
        return true
      }
    } else {
      // Single-line macro: check rest of line is empty
      if (line.text.slice(closeIdx + 2).trim()) return false
    }

    const children: Element[] = [
      elt(Type.MacroCallMark, start, start + 2),
    ]

    buildNameElement(children)

    // Parse parameters - everything between name and >>
    const paramsStr = allContent.slice(nameEnd, closeIdx)
    if (paramsStr.trim()) {
      const paramElements = parseMacroParams(paramsStr, start + nameEnd)
      children.push(...paramElements)
    }

    // Calculate position of closing >>
    const closeMarkPos = start + closeIdx
    children.push(elt(Type.MacroCallMark, closeMarkPos, closeMarkPos + 2))

    cx.addElement(elt(Type.MacroCallBlock, start, endPos, children))
    return true
  }
}

// ============================================================================
// HTML Block and Widget Block
// ============================================================================

/**
 * Parse widget/HTML tag attributes
 * Supports:
 * - name="value" or name='value' (quoted string)
 * - name=value (unquoted, no spaces)
 * - name={{reference}} (indirect/transclusion)
 * - name={{{filter}}} (filtered)
 * - name=<<macro>> (macro call)
 * - name=`substituted` or name=```substituted``` (substituted string)
 * - name (boolean, no value)
 */
function parseAttributes(attrString: string, offset: number, isWidget: boolean): Element[] {
  const elements: Element[] = []
  let pos = 0
  const len = attrString.length

  while (pos < len) {
    // Skip whitespace
    while (pos < len && /\s/.test(attrString[pos])) pos++
    if (pos >= len) break

    // Parse attribute name (allows letters, numbers, hyphens, underscores, colons, dots, $)
    const nameStart = pos
    while (pos < len && /[a-zA-Z0-9\-_:.$]/.test(attrString[pos])) pos++
    if (pos === nameStart) {
      // Not a valid attribute name, skip character
      pos++
      continue
    }
    const nameEnd = pos

    // Check for = sign
    while (pos < len && /\s/.test(attrString[pos])) pos++

    if (pos >= len || attrString[pos] !== '=') {
      // Boolean attribute (no value)
      const attrChildren: Element[] = [
        elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
      ]
      elements.push(elt(Type.Attribute, offset + nameStart, offset + nameEnd, attrChildren))
      continue
    }

    // Skip the =
    pos++

    // Skip whitespace after =
    while (pos < len && /\s/.test(attrString[pos])) pos++
    if (pos >= len) {
      // Attribute with = but no value
      const attrChildren: Element[] = [
        elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
      ]
      elements.push(elt(Type.Attribute, offset + nameStart, offset + pos, attrChildren))
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
        elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
        elt(valueType, offset + valueStart, offset + valueEnd)
      ]
      elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
      continue
    } else if (ch === '"' || ch === "'") {
      // Quoted string: "value" or 'value'
      const quote = ch
      pos++ // skip opening quote
      const stringStart = pos
      while (pos < len && attrString[pos] !== quote) {
        if (attrString[pos] === '\\' && pos + 1 < len) pos++ // skip escaped char
        pos++
      }
      const stringEnd = pos
      if (pos < len) pos++ // skip closing quote
      valueEnd = pos
      valueType = Type.AttributeString

      // Check if this is a filter attribute - parse content as filter expression
      const attrName = attrString.slice(nameStart, nameEnd).toLowerCase()
      if (attrName === 'filter' || attrName === '$filter') {
        const filterContent = attrString.slice(stringStart, stringEnd)
        const filterChildren = parseFilterExpressionBlock(filterContent, offset + stringStart)
        const valueChildren: Element[] = [
          elt(Type.Mark, offset + valueStart, offset + stringStart),  // Opening quote
          elt(Type.FilterExpression, offset + stringStart, offset + stringEnd, filterChildren),
          elt(Type.Mark, offset + stringEnd, offset + valueEnd)  // Closing quote
        ]
        const attrChildren: Element[] = [
          elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
          elt(Type.AttributeFiltered, offset + valueStart, offset + valueEnd, valueChildren)
        ]
        elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
        continue
      }
    } else if (ch === '{') {
      // Could be {{indirect}} or {{{filtered}}}
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
        const filterChildren = parseFilterExpressionBlock(filterContent, offset + filterStart)
        // Create child elements for filtered transclusion
        const valueChildren: Element[] = [
          elt(Type.FilteredTransclusionMark, offset + openMarkStart, offset + openMarkStart + 3),
          elt(Type.FilterExpression, offset + filterStart, offset + filterEnd, filterChildren),
          elt(Type.FilteredTransclusionMark, offset + filterEnd, offset + valueEnd)
        ]
        const attrChildren: Element[] = [
          elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
          elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
        ]
        elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
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
          elt(Type.TransclusionMark, offset + openMarkStart, offset + openMarkStart + 2),
          ...targetChildren,
          elt(Type.TransclusionMark, offset + targetEnd, offset + valueEnd)
        ]
        const attrChildren: Element[] = [
          elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
          elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
        ]
        elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
        continue
      } else {
        // Just a { character, treat as unquoted value
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
      const macroName = attrString.slice(macroContentStart, macroNameEnd)
      const valueChildren: Element[] = [
        elt(Type.MacroCallMark, offset + openMarkStart, offset + openMarkStart + 2),
      ]
      // Check if name is a substituted parameter: __param__
      const attrSubstitutedMatch = /^__([^_]+)__$/.exec(macroName)
      if (attrSubstitutedMatch) {
        const paramName = attrSubstitutedMatch[1]
        const nameStart = offset + macroContentStart
        const nameChildren: Element[] = [
          elt(Type.SubstitutedParamMark, nameStart, nameStart + 2),
          elt(Type.SubstitutedParamName, nameStart + 2, nameStart + 2 + paramName.length),
          elt(Type.SubstitutedParamMark, nameStart + 2 + paramName.length, offset + macroNameEnd),
        ]
        valueChildren.push(elt(Type.SubstitutedParam, nameStart, offset + macroNameEnd, nameChildren))
      } else {
        valueChildren.push(elt(Type.MacroName, offset + macroContentStart, offset + macroNameEnd))
      }
      valueChildren.push(elt(Type.MacroCallMark, offset + closeMarkStart, offset + valueEnd))
      const attrChildren: Element[] = [
        elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
        elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
      ]
      elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
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
        pos++ // skip opening `
        while (pos < len && attrString[pos] !== '`') pos++
        closeMarkStart = pos
        if (pos < len) pos++ // skip closing `
      }
      valueEnd = pos
      valueType = Type.AttributeSubstituted

      // Parse $(variable)$ and ${ filter }$ patterns inside the substituted string
      const valueChildren: Element[] = [
        elt(Type.Mark, offset + valueStart, offset + openMarkEnd)  // Opening `
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
            const filterChildren = parseFilterExpressionBlock(filterContent, filterExprStart + (filterMatch[1].length - filterMatch[1].trimStart().length))

            valueChildren.push(elt(Type.FilterSubstitution, filterStart, filterEnd, [
              elt(Type.FilterSubstitutionMark, filterStart, filterStart + 2),
              elt(Type.FilterExpression, filterExprStart, filterExprEnd, filterChildren),
              elt(Type.FilterSubstitutionMark, filterEnd - 2, filterEnd)
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

          valueChildren.push(elt(Type.Variable, varStart, varEnd, [
            elt(Type.VariableMark, varStart, varStart + 2),
            elt(Type.VariableName, varNameStart, varNameEnd),
            elt(Type.VariableMark, varNameEnd, varEnd)
          ]))

          contentPos += varMatch[0].length
        } else {
          contentPos++
        }
      }

      valueChildren.push(elt(Type.Mark, offset + closeMarkStart, offset + valueEnd))  // Closing `

      const attrChildren: Element[] = [
        elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
        elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
      ]
      elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
      continue
    } else {
      // Unquoted value - read until whitespace or >
      while (pos < len && !/[\s>\/]/.test(attrString[pos])) pos++
      valueEnd = pos
      // Check if it looks like a number
      const valueText = attrString.slice(valueStart, valueEnd)
      if (/^-?\d+(\.\d+)?$/.test(valueText)) {
        valueType = Type.AttributeNumber
      } else {
        valueType = Type.AttributeString
      }
    }

    const attrChildren: Element[] = [
      elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
      elt(valueType, offset + valueStart, offset + valueEnd)
    ]
    elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren))
  }

  return elements
}

// Opening tag start: <tagname or <$widget or <$ns.widget (may not have closing >)
const openTagStartRe = /^(\s*)<([a-zA-Z$][a-zA-Z0-9\-\.]*)/
// Closing tag: </tagname> or </$widget> or </$ns.widget>
const closeTagRe = /^(\s*)<\/([a-zA-Z$][a-zA-Z0-9\-\.]*)>/
// Self-closing check
const selfClosingRe = /\/>\s*$/

export const HTMLBlock: BlockParser = {
  name: "HTMLBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const text = line.text

    // Try closing tag first (orphaned closing tag)
    const closeMatch = closeTagRe.exec(text)
    if (closeMatch) {
      const indent = closeMatch[1].length
      const tagName = closeMatch[2]
      const isWidget = tagName.startsWith("$")
      const start = cx.lineStart

      const children: Element[] = []
      const openBracketPos = start + indent
      children.push(elt(Type.TagMark, openBracketPos, openBracketPos + 1)) // <
      children.push(elt(Type.TagMark, openBracketPos + 1, openBracketPos + 2)) // /
      const tagStart = start + indent + 2  // After "</"
      children.push(elt(isWidget ? Type.WidgetName : Type.TagName, tagStart, tagStart + tagName.length))

      // End the closing tag element at the actual tag end, not end of line
      const closeTagEnd = start + closeMatch[0].length
      children.push(elt(Type.TagMark, closeTagEnd - 1, closeTagEnd)) // >
      cx.addElement(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, start, closeTagEnd, children))

      // Parse any inline content after the closing tag on the same line
      const afterTag = text.slice(closeMatch[0].length)
      if (afterTag.trim()) {
        const inlineElements = cx.parser.parseInline(afterTag, closeTagEnd)
        const paragraphElt = cx.elt(Type.Paragraph, closeTagEnd, closeTagEnd + afterTag.length, inlineElements as Element[])
        cx.addElement(paragraphElt)
      }

      return true
    }

    // Check for opening tag start
    const openStartMatch = openTagStartRe.exec(text)
    if (!openStartMatch) return false

    const indent = openStartMatch[1].length
    const tagName = openStartMatch[2]
    const isWidget = tagName.startsWith("$")
    const start = cx.lineStart

    const children: Element[] = []
    const openBracketPos = start + indent
    children.push(elt(Type.TagMark, openBracketPos, openBracketPos + 1)) // Opening <
    const tagStart = start + indent + 1  // After "<"
    children.push(elt(isWidget ? Type.WidgetName : Type.TagName, tagStart, tagStart + tagName.length))

    let openingTagEnd: number
    let selfClose: boolean
    let attrsStart = tagStart + tagName.length
    let openingTagLineEnd: number // Position after the line containing >

    /**
     * Find the first > or /> that closes the opening tag, properly handling
     * > inside quoted strings, macros, transclusions, etc.
     */
    const findOpeningTagEnd = (text: string): { pos: number, selfClose: boolean } | null => {
      let pos = 0
      const len = text.length

      while (pos < len) {
        const ch = text[pos]

        if (ch === '>') {
          return { pos: pos + 1, selfClose: false }
        }
        if (ch === '/' && text[pos + 1] === '>') {
          return { pos: pos + 2, selfClose: true }
        }
        if (ch === '"' || ch === "'") {
          // Skip quoted string
          const quote = ch
          pos++
          while (pos < len && text[pos] !== quote) {
            if (text[pos] === '\\') pos++
            pos++
          }
          pos++
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
        } else if (ch === '<') {
          // Check if this is the start of another tag (not a macro/transclusion)
          const nextCh = text[pos + 1]
          if (nextCh && /[a-zA-Z$\/]/.test(nextCh)) {
            // Found another tag - stop searching, this opening tag is incomplete
            return null
          }
          pos++
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

    // Find the opening tag's closing > starting from after the tag name
    const afterTagName = text.slice(indent + 1 + tagName.length)
    let tagEndResult = findOpeningTagEnd(afterTagName)
    let accumulatedText = afterTagName

    // If not found on current line, keep reading lines until end of document
    // Save position so we can restore if we don't find the tag end
    const savedPos = cx.savePosition()
    while (!tagEndResult) {
      if (!cx.nextLine()) break
      accumulatedText += '\n' + cx.line.text
      tagEndResult = findOpeningTagEnd(accumulatedText)
    }

    // If we didn't find the tag end, restore position to just after the first line
    if (!tagEndResult) {
      cx.restorePosition(savedPos)
    }

    if (tagEndResult) {
      selfClose = tagEndResult.selfClose
      openingTagEnd = start + indent + 1 + tagName.length + tagEndResult.pos
      openingTagLineEnd = cx.lineStart + cx.line.text.length

      // Extract attribute content (between tag name and closing >)
      let attrContent = accumulatedText.slice(0, tagEndResult.pos - 1)
      if (selfClose && attrContent.endsWith('/')) {
        attrContent = attrContent.slice(0, -1)
      }

      if (attrContent.trim()) {
        const attrElements = parseAttributes(attrContent, attrsStart, isWidget)
        children.push(...attrElements)
      }

      // Add closing marks for the opening tag
      if (selfClose) {
        children.push(elt(Type.SelfClosingMarker, openingTagEnd - 2, openingTagEnd - 1)) // /
        children.push(elt(Type.TagMark, openingTagEnd - 1, openingTagEnd)) // >
      } else {
        children.push(elt(Type.TagMark, openingTagEnd - 1, openingTagEnd)) // >
      }
    } else {
      // No > found, treat as incomplete - only include the first line
      // Don't consume more lines looking for a closing tag
      selfClose = false
      openingTagEnd = start + text.length
      openingTagLineEnd = openingTagEnd

      // Still parse whatever attributes we have on this line
      if (afterTagName.trim()) {
        const attrElements = parseAttributes(afterTagName, attrsStart, isWidget)
        children.push(...attrElements)
      }

      // For incomplete opening tags, just output what we have and return
      cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, openingTagEnd, children))
      return true
    }

    // Determine if this is a multi-line block with content
    if (!selfClose) {
      const openRe = new RegExp(`<${tagName.replace(/\$/g, '\\$')}(?:\\s|>|/>)`)
      const closeRe = new RegExp(`</${tagName.replace(/\$/g, '\\$')}>`)
      // For multi-line: match closing tag at start of line with optional indent
      const closeReWithIndent = new RegExp(`^(\\s*)</${tagName.replace(/\$/g, '\\$')}>`)
      let blockEnd = openingTagLineEnd
      let foundClose = false

      // First, check if closing tag is on the same line after the opening tag
      const restOfLine = cx.input.read(openingTagEnd, openingTagLineEnd)
      const sameLineClose = closeRe.exec(restOfLine)

      if (sameLineClose) {
        // Closing tag on same line - check for nested tags in between
        const beforeClose = restOfLine.slice(0, sameLineClose.index)
        const openMatches = beforeClose.match(openRe) || []
        const closeMatches = beforeClose.match(new RegExp(closeRe.source, 'g')) || []

        // Simple case: no nested same-name tags between open and close
        if (openMatches.length === closeMatches.length) {
          const contentStart = openingTagEnd
          const contentEnd = openingTagEnd + sameLineClose.index

          // Parse inline content between opening and closing tags
          if (contentEnd > contentStart) {
            const contentText = cx.input.read(contentStart, contentEnd)
            const inlineElements = cx.parser.parseInline(contentText, contentStart)
            children.push(...(inlineElements as Element[]))
          }

          // Add closing tag element with marks - wrapped in WidgetEnd/HTMLEndTag
          const closingTagOpenBracket = openingTagEnd + sameLineClose.index
          const closeTagEnd = openingTagEnd + sameLineClose.index + sameLineClose[0].length

          const closeTagChildren: Element[] = []
          closeTagChildren.push(elt(Type.TagMark, closingTagOpenBracket, closingTagOpenBracket + 1)) // <
          closeTagChildren.push(elt(Type.TagMark, closingTagOpenBracket + 1, closingTagOpenBracket + 2)) // /
          const closeTagStart = openingTagEnd + sameLineClose.index + 2 // After </
          closeTagChildren.push(elt(isWidget ? Type.WidgetName : Type.TagName, closeTagStart, closeTagStart + tagName.length))
          closeTagChildren.push(elt(Type.TagMark, closeTagEnd - 1, closeTagEnd)) // >

          // Wrap in WidgetEnd/HTMLEndTag for proper tree structure (needed for folding)
          children.push(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, closingTagOpenBracket, closeTagEnd, closeTagChildren))

          // Parse any inline content AFTER the closing tag on the same line
          const afterCloseTag = restOfLine.slice(sameLineClose.index + sameLineClose[0].length)
          if (afterCloseTag.trim()) {
            const afterCloseStart = closeTagEnd
            const inlineElements = cx.parser.parseInline(afterCloseTag, afterCloseStart)
            children.push(...(inlineElements as Element[]))
          }

          blockEnd = openingTagLineEnd
          foundClose = true
        }
      }

      if (!foundClose) {
        // Multi-line content: find the closing tag on subsequent lines
        // But first, there may be inline content on the same line as the opening tag
        const sameLineContent = cx.input.read(openingTagEnd, openingTagLineEnd)
        const blockContentStart = openingTagLineEnd + 1
        let contentEnd = blockContentStart
        let nestLevel = 1

        // Save position in case we don't find a closing tag
        const savedPosForClose = cx.savePosition()

        while (cx.nextLine()) {
          const lineText = cx.line.text

          // Check for nested opening tags of the same name (complete tags only)
          const nestedOpen = openRe.exec(lineText)
          if (nestedOpen && !selfClosingRe.test(lineText)) {
            nestLevel++
          }

          // Check for closing tag (use closeReWithIndent to capture indentation)
          const closeMatch = closeReWithIndent.exec(lineText)
          if (closeMatch) {
            nestLevel--
            if (nestLevel === 0) {
              // Found our closing tag
              contentEnd = cx.lineStart - 1 // Before closing tag line (exclude newline)

              // First, parse any inline content on the same line as the opening tag
              if (sameLineContent.trim()) {
                const inlineElements = cx.parser.parseInline(sameLineContent, openingTagEnd)
                children.push(...(inlineElements as Element[]))
              }

              // Then parse block content between opening line and closing tag
              if (contentEnd > blockContentStart) {
                const contentElements = cx.parseContentRange(blockContentStart, contentEnd, false)
                children.push(...contentElements)
              }

              // Add closing tag element with marks - wrapped in WidgetEnd/HTMLEndTag
              const closeIndent = closeMatch[1].length
              const closingTagOpenBracket = cx.lineStart + closeIndent
              const closeTagFullEnd = closeMatch[0].length
              const closingTagEndPos = cx.lineStart + closeTagFullEnd

              const closeTagChildren: Element[] = []
              closeTagChildren.push(elt(Type.TagMark, closingTagOpenBracket, closingTagOpenBracket + 1)) // <
              closeTagChildren.push(elt(Type.TagMark, closingTagOpenBracket + 1, closingTagOpenBracket + 2)) // /
              const closeTagStart = cx.lineStart + closeIndent + 2
              closeTagChildren.push(elt(isWidget ? Type.WidgetName : Type.TagName, closeTagStart, closeTagStart + tagName.length))
              closeTagChildren.push(elt(Type.TagMark, closingTagEndPos - 1, closingTagEndPos)) // >

              // Wrap in WidgetEnd/HTMLEndTag for proper tree structure (needed for folding)
              children.push(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, closingTagOpenBracket, closingTagEndPos, closeTagChildren))

              // Parse any inline content AFTER the closing tag on the same line
              // Note: closeMatch[0].length already includes the indent
              const afterCloseTag = lineText.slice(closeTagFullEnd)
              if (afterCloseTag.trim()) {
                const afterCloseStart = cx.lineStart + closeTagFullEnd
                const inlineElements = cx.parser.parseInline(afterCloseTag, afterCloseStart)
                children.push(...(inlineElements as Element[]))
              }

              blockEnd = cx.lineStart + lineText.length
              foundClose = true
              break
            }
          }
        }

        // If no closing tag found, restore position and only output the opening tag
        // Let the content be parsed separately
        if (!foundClose) {
          cx.restorePosition(savedPosForClose)
          blockEnd = openingTagLineEnd
        }
      }

      cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, blockEnd, children))
      return true
    }

    // Self-closing tag
    cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, openingTagEnd, children))
    return true
  }
}

// ============================================================================
// Export all default block parsers
// ============================================================================

// ============================================================================
// Multi-line Styled Block (@@.className ... @@)
// ============================================================================

const styledBlockOpenRe = /^@@(\.[a-zA-Z_][a-zA-Z0-9_\-]*)*\s*$/

export const StyledBlock: BlockParser = {
  name: "StyledBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    // Match opening line: @@ or @@.className
    const match = styledBlockOpenRe.exec(line.text)
    if (!match) return false

    const start = cx.lineStart
    const children: Element[] = [
      elt(Type.HighlightMark, start, start + 2),  // Opening @@
    ]

    // Parse class names after @@
    let pos = 2
    while (pos < line.text.length) {
      if (line.text[pos] === '.') {
        const markStart = pos
        pos++
        const classStart = pos
        while (pos < line.text.length && /[a-zA-Z0-9_\-]/.test(line.text[pos])) pos++
        if (pos > classStart) {
          children.push(elt(Type.StyledBlockMark, start + markStart, start + markStart + 1))
          children.push(elt(Type.StyledBlockClass, start + classStart, start + pos))
        }
      } else {
        pos++
      }
    }

    const openingLineEnd = start + line.text.length

    // Find closing @@ on its own line
    let closingLine = cx.lineStart + line.text.length + 1
    let contentEnd = closingLine
    let foundClose = false

    while (closingLine < cx.input.length) {
      // Read until end of line
      let lineEnd = closingLine
      while (lineEnd < cx.input.length && cx.input.read(lineEnd, lineEnd + 1) !== '\n') {
        lineEnd++
      }

      const lineText = cx.input.read(closingLine, lineEnd)

      if (lineText.trim() === '@@') {
        foundClose = true
        contentEnd = closingLine

        // Parse content between opening and closing
        if (contentEnd > openingLineEnd + 1) {
          const contentElements = cx.parseContentRange(openingLineEnd + 1, contentEnd)
          children.push(...contentElements)
        }

        // Add closing mark
        const closeStart = closingLine + lineText.indexOf('@@')
        children.push(elt(Type.HighlightMark, closeStart, closeStart + 2))

        cx.addElement(elt(Type.Highlight, start, lineEnd, children))

        // Advance to the closing @@ line (parseBlock will call nextLine() to move past it)
        while (cx.lineStart < closingLine) {
          cx.nextLine()
        }
        return true
      }

      closingLine = lineEnd + 1
    }

    // No closing found - don't match
    return false
  }
}

// ============================================================================
// Conditional Block (<%if%> <%elseif%> <%else%> <%endif%>)
// ============================================================================

const conditionalIfRe = /^\s*<%\s*if\s+(.+?)\s*%>/
const conditionalElseifRe = /^\s*<%\s*elseif\s+(.+?)\s*%>/
const conditionalElseRe = /^\s*<%\s*else\s*%>/
const conditionalEndifRe = /^\s*<%\s*endif\s*%>/

export const ConditionalBlock: BlockParser = {
  name: "ConditionalBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const ifMatch = conditionalIfRe.exec(line.text)
    if (!ifMatch) return false

    const start = cx.lineStart
    const filter = ifMatch[1]
    const children: Element[] = []

    // Parse opening <%if [filter] %> or <% if [filter] %>
    const openMarkStart = start + line.text.indexOf('<%')
    const ifKeywordStart = start + line.text.indexOf('if')
    children.push(elt(Type.ConditionalMark, openMarkStart, openMarkStart + 2))  // <%
    children.push(elt(Type.ConditionalKeyword, ifKeywordStart, ifKeywordStart + 2))  // if

    // Parse the filter expression
    const filterStart = start + line.text.indexOf(filter)
    const filterChildren = parseFilterExpressionBlock(filter, filterStart)
    children.push(elt(Type.FilterExpression, filterStart, filterStart + filter.length, filterChildren))

    // Find the closing %> of the if tag
    const closeMarkPos = start + line.text.indexOf('%>')
    children.push(elt(Type.ConditionalMark, closeMarkPos, closeMarkPos + 2))  // %>

    const openingLineEnd = start + line.text.length

    // Track branches and find <%endif%>
    // Content can start right after %> on the same line
    let branchStart = closeMarkPos + 2
    let currentPos = branchStart
    let depth = 1
    let endPos = -1
    let endifLineStart = -1

    // First check the rest of the opening line for inline closing tags
    const restOfLine = line.text.slice(closeMarkPos + 2 - start)
    const inlineEndifMatch = /<%\s*endif\s*%>/.exec(restOfLine)
    if (inlineEndifMatch) {
      // Found <%endif%> on the same line
      const contentBeforeEndif = restOfLine.slice(0, inlineEndifMatch.index)
      if (contentBeforeEndif.trim()) {
        // Parse inline content as branch
        const contentStart = closeMarkPos + 2
        const contentEnd = closeMarkPos + 2 + inlineEndifMatch.index
        const branchContent = cx.parser.parseInline(contentBeforeEndif, contentStart)
        children.push(elt(Type.ConditionalBranch, contentStart, contentEnd, branchContent))
      }

      // Parse <% endif %> on same line
      const endifStart = closeMarkPos + 2 + inlineEndifMatch.index
      const endifKeywordPos = restOfLine.indexOf('endif', inlineEndifMatch.index)
      const endifKeywordStart = closeMarkPos + 2 + endifKeywordPos
      const endifClosePos = restOfLine.indexOf('%>', inlineEndifMatch.index)
      const endifClose = closeMarkPos + 2 + endifClosePos
      children.push(elt(Type.ConditionalMark, endifStart, endifStart + 2))
      children.push(elt(Type.ConditionalKeyword, endifKeywordStart, endifKeywordStart + 5))
      children.push(elt(Type.ConditionalMark, endifClose, endifClose + 2))

      endPos = endifClose + 2
      cx.addElement(elt(Type.ConditionalBlock, start, endPos, children))
      return true
    }

    // Move to next line for scanning
    currentPos = openingLineEnd + 1

    while (currentPos < cx.input.length && depth > 0) {
      // Read until end of line
      let lineEnd = currentPos
      while (lineEnd < cx.input.length && cx.input.read(lineEnd, lineEnd + 1) !== '\n') {
        lineEnd++
      }

      const lineText = cx.input.read(currentPos, lineEnd)

      // Check for nested <%if%>
      if (conditionalIfRe.test(lineText)) {
        depth++
      } else if (conditionalEndifRe.test(lineText)) {
        depth--
        if (depth === 0) {
          // Parse content before <%endif%>
          if (currentPos > branchStart) {
            const branchContent = cx.parseContentRange(branchStart, currentPos)
            if (branchContent.length > 0) {
              children.push(elt(Type.ConditionalBranch, branchStart, currentPos, branchContent))
            }
          }

          // Parse <% endif %> (with optional whitespace)
          const endifStart = currentPos + lineText.indexOf('<%')
          const endifKeywordStart = currentPos + lineText.indexOf('endif')
          const endifClose = currentPos + lineText.indexOf('%>')
          children.push(elt(Type.ConditionalMark, endifStart, endifStart + 2))
          children.push(elt(Type.ConditionalKeyword, endifKeywordStart, endifKeywordStart + 5))  // endif
          children.push(elt(Type.ConditionalMark, endifClose, endifClose + 2))

          endifLineStart = currentPos
          endPos = lineEnd
          break
        }
      } else if (depth === 1 && conditionalElseifRe.test(lineText)) {
        // Parse content before <%elseif%>
        if (currentPos > branchStart) {
          const branchContent = cx.parseContentRange(branchStart, currentPos)
          if (branchContent.length > 0) {
            children.push(elt(Type.ConditionalBranch, branchStart, currentPos, branchContent))
          }
        }

        // Parse <%elseif [filter] %> or <% elseif [filter] %>
        const elseifMatch = conditionalElseifRe.exec(lineText)
        if (elseifMatch) {
          const elseifStart = currentPos + lineText.indexOf('<%')
          const elseifKeywordStart = currentPos + lineText.indexOf('elseif')
          children.push(elt(Type.ConditionalMark, elseifStart, elseifStart + 2))
          children.push(elt(Type.ConditionalKeyword, elseifKeywordStart, elseifKeywordStart + 6))  // elseif

          const elseifFilter = elseifMatch[1]
          const elseifFilterStart = currentPos + lineText.indexOf(elseifFilter)
          const elseifFilterChildren = parseFilterExpressionBlock(elseifFilter, elseifFilterStart)
          children.push(elt(Type.FilterExpression, elseifFilterStart, elseifFilterStart + elseifFilter.length, elseifFilterChildren))

          children.push(elt(Type.ConditionalMark, currentPos + lineText.indexOf('%>'), currentPos + lineText.indexOf('%>') + 2))
        }

        branchStart = lineEnd + 1
      } else if (depth === 1 && conditionalElseRe.test(lineText)) {
        // Parse content before <%else%>
        if (currentPos > branchStart) {
          const branchContent = cx.parseContentRange(branchStart, currentPos)
          if (branchContent.length > 0) {
            children.push(elt(Type.ConditionalBranch, branchStart, currentPos, branchContent))
          }
        }

        // Parse <% else %> (with optional whitespace)
        const elseStart = currentPos + lineText.indexOf('<%')
        const elseKeywordStart = currentPos + lineText.indexOf('else')
        const elseClose = currentPos + lineText.indexOf('%>')
        children.push(elt(Type.ConditionalMark, elseStart, elseStart + 2))
        children.push(elt(Type.ConditionalKeyword, elseKeywordStart, elseKeywordStart + 4))  // else
        children.push(elt(Type.ConditionalMark, elseClose, elseClose + 2))

        branchStart = lineEnd + 1
      }

      currentPos = lineEnd + 1
    }

    if (endPos === -1) {
      // No closing <%endif%> found - extend block to end of document for indentation support
      // Always create a branch for content after the last opening tag (<%if%>, <%else%>, <%elseif%>)
      // This ensures proper indentation even when the branch is empty
      if (branchStart <= cx.input.length) {
        const branchContent = cx.parseContentRange(branchStart, cx.input.length)
        // Create branch even if empty for indentation purposes
        children.push(elt(Type.ConditionalBranch, branchStart, cx.input.length, branchContent))
      }
      cx.addElement(elt(Type.ConditionalBlock, start, cx.input.length, children))
      // Move to end of document
      while (!cx.atEnd) {
        cx.nextLine()
      }
      return true
    }

    cx.addElement(elt(Type.ConditionalBlock, start, endPos, children))

    // Advance to the <%endif%> line (parseBlock will call nextLine() to move past it)
    while (cx.lineStart < endifLineStart) {
      cx.nextLine()
    }

    return true
  }
}

export const DefaultBlockParsers: BlockParser[] = [
  FencedCode,
  TypedBlock,
  ConditionalBlock,  // <%if%> ... <%endif%>
  StyledBlock,  // Multi-line @@...@@
  Heading,
  HorizontalRule,
  HardLineBreaks,  // """ ... """
  MultiLineBlockQuote,
  List,
  Table,
  CommentBlock,
  TransclusionBlock,
  FilteredTransclusionBlock,
  MacroCallBlock,
  HTMLBlock,
]
