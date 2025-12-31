/**
 * TiddlyWiki Parser - Block Parsers
 *
 * Block-level parsing rules following the Lezer Markdown architecture.
 */

import { Type } from "./types"
import { Element, elt, Line, BlockParser, BlockResult, Ch, space } from "./core"
import type { BlockContext } from "./block-context"

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

const codeStartRe = /^```(\w*)$/
const codeEndRe = /^```$/

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
        children.push(elt(Type.CodeText, codeStart, cx.lineStart - 1))
        children.push(elt(Type.CodeMark, cx.lineStart, cx.lineStart + 3))
        foundEnd = true
        break
      }
      if (codeContent) codeContent += "\n"
      codeContent += cx.line.text
    }

    if (!foundEnd && codeContent) {
      children.push(elt(Type.CodeText, codeStart, cx.lineStart - 1))
    }

    const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.lineStart
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

    // Find closing $$$
    let contentStart = cx.lineStart + line.text.length + 1
    let foundEnd = false

    while (cx.nextLine()) {
      if (typedEndRe.test(cx.line.text)) {
        children.push(elt(Type.CodeText, contentStart, cx.lineStart - 1))
        children.push(elt(Type.TypedBlockMark, cx.lineStart, cx.lineStart + 3))
        foundEnd = true
        break
      }
    }

    if (!foundEnd) {
      children.push(elt(Type.CodeText, contentStart, cx.lineStart - 1))
    }

    const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.lineStart
    cx.addElement(elt(Type.TypedBlock, start, end, children))
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
    let currentLine = line
    while (true) {
      const itemMatch = listMarkerRe.exec(currentLine.text)
      if (!itemMatch || !isCompatibleMarker(firstMarker, itemMatch[1][0])) break

      const itemMarkers = itemMatch[1]
      const itemStart = cx.lineStart
      const markerEnd = itemStart + itemMarkers.length

      // Parse inline content
      const contentText = currentLine.text.slice(itemMarkers.length)
      const inlineElements = cx.parser.parseInline(contentText, markerEnd)

      const itemChildren: Element[] = [
        elt(Type.ListMark, itemStart, markerEnd),
        ...(inlineElements as Element[])
      ]

      const itemType = listTypeMap[itemMarkers[itemMarkers.length - 1]]?.item || Type.ListItem
      items.push(elt(itemType, itemStart, itemStart + currentLine.text.length, itemChildren))

      if (!cx.nextLine()) break
      currentLine = cx.line
    }

    cx.addElement(elt(listInfo.list, start, cx.prevLineEnd(), items))
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
        const cellText = text.slice(cellStart, pos).trim()
        const isHeader = cellText.startsWith("!")
        const cellType = isHeader ? Type.TableHeaderCell : Type.TableCell

        // Parse inline content
        const contentStart = isHeader ? cellStart + 1 : cellStart
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
// Comment Block (<!-- --> or /% %/)
// ============================================================================

const htmlCommentStartRe = /^<!--/
const htmlCommentEndRe = /-->$/
const twCommentStartRe = /^\/%/
const twCommentEndRe = /%\/$/

export const CommentBlock: BlockParser = {
  name: "CommentBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const text = line.text.trim()

    // HTML-style comment
    if (htmlCommentStartRe.test(text)) {
      const start = cx.lineStart

      // Single line comment?
      if (htmlCommentEndRe.test(text)) {
        cx.addElement(elt(Type.CommentBlock, start, start + line.text.length, [
          elt(Type.CommentMarker, start, start + 4),
          elt(Type.CommentMarker, start + line.text.length - 3, start + line.text.length),
        ]))
        return true
      }

      // Multi-line comment
      while (cx.nextLine()) {
        if (htmlCommentEndRe.test(cx.line.text)) {
          cx.addElement(elt(Type.CommentBlock, start, cx.lineStart + cx.line.text.length))
          return true
        }
      }

      // Unclosed comment
      cx.addElement(elt(Type.CommentBlock, start, cx.lineStart))
      return true
    }

    // TiddlyWiki-style comment
    if (twCommentStartRe.test(text)) {
      const start = cx.lineStart

      if (twCommentEndRe.test(text)) {
        cx.addElement(elt(Type.CommentBlock, start, start + line.text.length))
        return true
      }

      while (cx.nextLine()) {
        if (twCommentEndRe.test(cx.line.text)) {
          cx.addElement(elt(Type.CommentBlock, start, cx.lineStart + cx.line.text.length))
          return true
        }
      }

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
      elt(Type.TransclusionTarget, start + 2, start + 2 + target.length),
    ]

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

const filteredBlockRe = /^\{\{\{([^{}]*)\}\}\}(?:\|\|([^{}]+))?\s*$/

export const FilteredTransclusionBlock: BlockParser = {
  name: "FilteredTransclusionBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const match = filteredBlockRe.exec(line.text)
    if (!match) return false

    const start = cx.lineStart
    const filter = match[1]
    const template = match[2]

    const children: Element[] = [
      elt(Type.FilteredTransclusionMark, start, start + 3),
      elt(Type.FilterExpression, start + 3, start + 3 + filter.length),
      elt(Type.FilteredTransclusionMark, start + 3 + filter.length, start + 6 + filter.length),
    ]

    if (template) {
      children.push(elt(Type.TransclusionTemplate, start + 8 + filter.length, start + 8 + filter.length + template.length))
    }

    cx.addElement(elt(Type.FilteredTransclusionBlock, start, start + line.text.length, children))
    return true
  }
}

// ============================================================================
// Macro Call Block (<<...>>)
// ============================================================================

const macroBlockRe = /^<<([^\s>]+)([^>]*)>>\s*$/

export const MacroCallBlock: BlockParser = {
  name: "MacroCallBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const match = macroBlockRe.exec(line.text)
    if (!match) return false

    const start = cx.lineStart
    const name = match[1]
    const params = match[2]

    const children: Element[] = [
      elt(Type.MacroCallMark, start, start + 2),
      elt(Type.MacroName, start + 2, start + 2 + name.length),
    ]

    // TODO: Parse parameters properly
    if (params.trim()) {
      children.push(elt(Type.MacroParam, start + 2 + name.length, start + line.text.length - 2))
    }

    children.push(elt(Type.MacroCallMark, start + line.text.length - 2, start + line.text.length))

    cx.addElement(elt(Type.MacroCallBlock, start, start + line.text.length, children))
    return true
  }
}

// ============================================================================
// HTML Block and Widget Block
// ============================================================================

// Opening tag: <tagname or <$widget
const openTagRe = /^(\s*)<([a-zA-Z$][a-zA-Z0-9\-]*)([^>]*?)(\/?)>/
// Closing tag: </tagname> or </$widget>
const closeTagRe = /^(\s*)<\/([a-zA-Z$][a-zA-Z0-9\-]*)>/
// Self-closing check
const selfClosingRe = /\/>$/

export const HTMLBlock: BlockParser = {
  name: "HTMLBlock",
  parse(cx: BlockContext, line: Line): BlockResult {
    const text = line.text

    // Try closing tag first
    const closeMatch = closeTagRe.exec(text)
    if (closeMatch) {
      const indent = closeMatch[1].length
      const tagName = closeMatch[2]
      const isWidget = tagName.startsWith("$")
      const start = cx.lineStart

      const children: Element[] = []
      const tagStart = start + indent + 2  // After "</"
      children.push(elt(isWidget ? Type.WidgetName : Type.TagName, tagStart, tagStart + tagName.length))

      cx.addElement(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, start, start + text.length, children))
      return true
    }

    // Try opening tag
    const openMatch = openTagRe.exec(text)
    if (!openMatch) return false

    const indent = openMatch[1].length
    const tagName = openMatch[2]
    const attrs = openMatch[3]
    const selfClose = openMatch[4] === "/"
    const isWidget = tagName.startsWith("$")
    const start = cx.lineStart

    const children: Element[] = []
    const tagStart = start + indent + 1  // After "<"
    children.push(elt(isWidget ? Type.WidgetName : Type.TagName, tagStart, tagStart + tagName.length))

    // Parse attributes if present
    if (attrs.trim()) {
      const attrsStart = tagStart + tagName.length
      children.push(elt(Type.TagAttributes, attrsStart, attrsStart + attrs.length))
    }

    // Determine if this is a multi-line block
    if (!selfClose && !selfClosingRe.test(text)) {
      // Look for closing tag on same line
      const closeOnSameLine = new RegExp(`</${tagName.replace(/\$/g, '\\$')}>`).exec(text)

      if (!closeOnSameLine) {
        // Multi-line: find the closing tag
        const closeRe = new RegExp(`^\\s*</${tagName.replace(/\$/g, '\\$')}>`)
        let blockEnd = start + text.length
        let foundClose = false

        while (cx.nextLine()) {
          const lineText = cx.line.text
          if (closeRe.test(lineText)) {
            // Add closing tag as child
            const closeIndent = lineText.match(/^\s*/)?.[0].length || 0
            const closeTagStart = cx.lineStart + closeIndent + 2
            children.push(elt(isWidget ? Type.WidgetName : Type.TagName, closeTagStart, closeTagStart + tagName.length))
            blockEnd = cx.lineStart + lineText.length
            foundClose = true
            break
          }
        }

        cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, blockEnd, children))
        return true
      }
    }

    // Single line or self-closing
    cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, start + text.length, children))
    return true
  }
}

// ============================================================================
// Export all default block parsers
// ============================================================================

export const DefaultBlockParsers: BlockParser[] = [
  Heading,
  HorizontalRule,
  FencedCode,
  TypedBlock,
  List,
  Table,
  CommentBlock,
  TransclusionBlock,
  FilteredTransclusionBlock,
  MacroCallBlock,
  HTMLBlock,
]
