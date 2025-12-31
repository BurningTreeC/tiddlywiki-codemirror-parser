/**
 * @lezer/tiddlywiki - TiddlyWiki5 Parser für Lezer/CodeMirror 6
 * 
 * Analog zum @lezer/markdown Parser, aber für TiddlyWiki5 Wikitext Syntax.
 * Unterstützt alle Block- und Inline-Level Konstrukte von TiddlyWiki5.
 */

import {Tree, TreeBuffer, NodeType, NodeProp, NodePropSource, TreeFragment, NodeSet, TreeCursor,
        Input, Parser, PartialParse, SyntaxNode, ParseWrapper} from "@lezer/common"
import {styleTags, tags as t, Tag} from "@lezer/highlight"

// ============================================================================
// Composite Block Helper
// ============================================================================

class CompositeBlock {
  static create(type: number, value: number, from: number, parentHash: number, end: number) {
    let hash = (parentHash + (parentHash << 8) + type + (value << 4)) | 0
    return new CompositeBlock(type, value, from, hash, end, [], [])
  }

  hashProp: [NodeProp<any>, any][]

  constructor(
    readonly type: number,
    readonly value: number,
    readonly from: number,
    readonly hash: number,
    public end: number,
    readonly children: (Tree | TreeBuffer)[],
    readonly positions: number[]
  ) {
    this.hashProp = [[NodeProp.contextHash, hash]]
  }

  addChild(child: Tree, pos: number) {
    if (child.prop(NodeProp.contextHash) != this.hash)
      child = new Tree(child.type, child.children, child.positions, child.length, this.hashProp)
    this.children.push(child)
    this.positions.push(pos)
  }

  toTree(nodeSet: NodeSet, end = this.end) {
    let last = this.children.length - 1
    if (last >= 0) end = Math.max(end, this.positions[last] + this.children[last].length + this.from)
    return new Tree(nodeSet.types[this.type], this.children, this.positions, end - this.from).balance({
      makeTree: (children, positions, length) => new Tree(NodeType.none, children, positions, length, this.hashProp)
    })
  }
}

// ============================================================================
// Node Types Enumeration
// ============================================================================

export enum Type {
  Document = 1,

  // Block-Level
  CodeBlock,
  FencedCode,
  BlockQuote,
  HorizontalRule,
  BulletList,
  NumberedList,
  DefinitionList,
  ListItem,
  DefinitionTerm,
  DefinitionDescription,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  HTMLBlock,
  Paragraph,
  CommentBlock,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TypedBlock,

  // Pragma Blocks
  PragmaBlock,
  MacroDefinition,
  ProcedureDefinition,
  FunctionDefinition,
  WidgetDefinition,
  RulesPragma,
  ImportPragma,
  ParametersPragma,
  WhitespacePragma,

  // Inline
  Escape,
  Entity,
  HardBreak,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  InlineCode,
  Highlight,
  WikiLink,
  ExternalLink,
  ImageLink,
  Transclusion,
  FilteredTransclusion,
  MacroCall,
  Widget,
  WidgetAttr,
  Variable,
  HTMLTag,
  Comment,

  // Smaller tokens / Marks
  HeadingMark,
  QuoteMark,
  ListMark,
  LinkMark,
  EmphasisMark,
  CodeMark,
  CodeText,
  CodeInfo,
  LinkTarget,
  LinkText,
  TransclusionTarget,
  MacroName,
  MacroParams,
  WidgetName,
  FilterExpression,
  PragmaMark,
  PragmaName,
  PragmaParams,
  TableDelimiter,
  TypedBlockMark,
  TypedBlockInfo,
  URL
}

// ============================================================================
// Data Structures
// ============================================================================

export class LeafBlock {
  marks: Element[] = []
  parsers: LeafBlockParser[] = []

  constructor(
    readonly start: number,
    public content: string
  ) {}
}

export class Line {
  text = ""
  baseIndent = 0
  basePos = 0
  depth = 0
  markers: Element[] = []
  pos = 0
  indent = 0
  next = -1

  forward() {
    if (this.basePos > this.pos) this.forwardInner()
  }

  forwardInner() {
    let newPos = this.skipSpace(this.basePos)
    this.indent = this.countIndent(newPos, this.pos, this.indent)
    this.pos = newPos
    this.next = newPos == this.text.length ? -1 : this.text.charCodeAt(newPos)
  }

  skipSpace(from: number) { return skipSpace(this.text, from) }

  reset(text: string) {
    this.text = text
    this.baseIndent = this.basePos = this.pos = this.indent = 0
    this.forwardInner()
    this.depth = 1
    while (this.markers.length) this.markers.pop()
  }

  moveBase(to: number) {
    this.basePos = to
    this.baseIndent = this.countIndent(to, this.pos, this.indent)
  }

  moveBaseColumn(indent: number) {
    this.baseIndent = indent
    this.basePos = this.findColumn(indent)
  }

  addMarker(elt: Element) {
    this.markers.push(elt)
  }

  countIndent(to: number, from = 0, indent = 0) {
    for (let i = from; i < to; i++)
      indent += this.text.charCodeAt(i) == 9 ? 4 - indent % 4 : 1
    return indent
  }

  findColumn(goal: number) {
    let i = 0
    for (let indent = 0; i < this.text.length && indent < goal; i++)
      indent += this.text.charCodeAt(i) == 9 ? 4 - indent % 4 : 1
    return i
  }

  scrub() {
    if (!this.baseIndent) return this.text
    let result = ""
    for (let i = 0; i < this.basePos; i++) result += " "
    return result + this.text.slice(this.basePos)
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function space(ch: number) { return ch == 32 || ch == 9 || ch == 10 || ch == 13 }

function skipSpace(line: string, i = 0) {
  while (i < line.length && space(line.charCodeAt(i))) i++
  return i
}

function skipSpaceBack(line: string, i: number, to: number) {
  while (i > to && space(line.charCodeAt(i - 1))) i--
  return i
}

// ============================================================================
// Block-Level Detection Functions
// ============================================================================

// TiddlyWiki Heading: ! !! !!! etc.
function isHeading(line: Line): number {
  if (line.next != 33 /* '!' */) return -1
  let pos = line.pos + 1
  while (pos < line.text.length && line.text.charCodeAt(pos) == 33) pos++
  let level = pos - line.pos
  // Must have space or end of line after markers
  if (pos < line.text.length && !space(line.text.charCodeAt(pos))) return -1
  return level > 6 ? -1 : level
}

// TiddlyWiki Horizontal Rule: ---
function isHorizontalRule(line: Line): boolean {
  if (line.next != 45 /* '-' */) return false
  let pos = line.pos
  let count = 0
  while (pos < line.text.length && line.text.charCodeAt(pos) == 45) {
    count++
    pos++
  }
  // Rest must be whitespace
  while (pos < line.text.length) {
    if (!space(line.text.charCodeAt(pos))) return false
    pos++
  }
  return count >= 3
}

// TiddlyWiki Fenced Code: ```
function isFencedCode(line: Line): number {
  if (line.next != 96 /* '`' */) return -1
  let pos = line.pos + 1
  while (pos < line.text.length && line.text.charCodeAt(pos) == 96) pos++
  if (pos < line.pos + 3) return -1
  return pos
}

// TiddlyWiki Block Quote: <<<
function isBlockQuote(line: Line): number {
  if (line.next != 60 /* '<' */) return -1
  let pos = line.pos
  let count = 0
  while (pos < line.text.length && line.text.charCodeAt(pos) == 60) {
    count++
    pos++
  }
  return count >= 3 ? pos : -1
}

// TiddlyWiki Bullet List: * ** ***
function isBulletList(line: Line): number {
  if (line.next != 42 /* '*' */) return -1
  let pos = line.pos + 1
  while (pos < line.text.length && line.text.charCodeAt(pos) == 42) pos++
  // Must have space after markers
  if (pos < line.text.length && !space(line.text.charCodeAt(pos))) return -1
  return pos - line.pos
}

// TiddlyWiki Numbered List: # ## ###
function isNumberedList(line: Line): number {
  if (line.next != 35 /* '#' */) return -1
  let pos = line.pos + 1
  while (pos < line.text.length && line.text.charCodeAt(pos) == 35) pos++
  // Must have space after markers
  if (pos < line.text.length && !space(line.text.charCodeAt(pos))) return -1
  return pos - line.pos
}

// TiddlyWiki Definition List: ; term : definition
function isDefinitionTerm(line: Line): boolean {
  return line.next == 59 /* ';' */
}

function isDefinitionDescription(line: Line): boolean {
  return line.next == 58 /* ':' */
}

// TiddlyWiki Table: |cell|cell|
function isTable(line: Line): boolean {
  return line.next == 124 /* '|' */
}

// TiddlyWiki Typed Block: $$$.type
function isTypedBlock(line: Line): { end: number, info: string } | null {
  if (line.next != 36 /* '$' */) return null
  let pos = line.pos
  if (line.text.charCodeAt(pos + 1) != 36 || line.text.charCodeAt(pos + 2) != 36) return null
  pos += 3
  if (pos < line.text.length && line.text.charCodeAt(pos) == 46 /* '.' */) {
    let infoStart = pos + 1
    while (pos < line.text.length && !space(line.text.charCodeAt(pos))) pos++
    return { end: pos, info: line.text.slice(infoStart, pos) }
  }
  return { end: pos, info: "" }
}

// TiddlyWiki Pragma: \define, \procedure, \function, \widget, \rules, \import, \parameters, \whitespace
function isPragma(line: Line): { type: string, end: number } | null {
  if (line.next != 92 /* '\\' */) return null
  let pos = line.pos + 1
  let nameStart = pos
  while (pos < line.text.length && /[a-zA-Z]/.test(line.text[pos])) pos++
  let name = line.text.slice(nameStart, pos).toLowerCase()
  
  const pragmaTypes = ['define', 'procedure', 'function', 'widget', 'rules', 'import', 'parameters', 'whitespace']
  if (pragmaTypes.includes(name)) {
    return { type: name, end: pos }
  }
  return null
}

// HTML Block detection
function isHTMLBlock(line: Line): boolean {
  if (line.next != 60 /* '<' */) return false
  let rest = line.text.slice(line.pos)
  // Check for HTML tags (not widgets which start with <$)
  return /^<(?![\$\/\$])[a-zA-Z][^>]*>/.test(rest) || /^<\/[a-zA-Z][^>]*>/.test(rest)
}

// ============================================================================
// Block Parsers
// ============================================================================

type BlockResult = boolean | null

function addCodeText(marks: Element[], from: number, to: number) {
  let last = marks.length - 1
  if (last >= 0 && marks[last].to == from && marks[last].type == Type.CodeText) 
    (marks[last] as any).to = to
  else 
    marks.push(elt(Type.CodeText, from, to))
}

const DefaultBlockParsers: {[name: string]: ((cx: BlockContext, line: Line) => BlockResult) | undefined} = {
  
  Pragma(cx, line) {
    let pragma = isPragma(line)
    if (!pragma) return false
    
    let from = cx.lineStart + line.pos
    let marks: Element[] = [elt(Type.PragmaMark, from, from + 1)] // backslash
    let nameEnd = cx.lineStart + pragma.end
    marks.push(elt(Type.PragmaName, from + 1, nameEnd))
    
    // Handle multi-line pragmas (\define, \procedure, \function, \widget)
    const multiLinePragmas = ['define', 'procedure', 'function', 'widget']
    
    if (multiLinePragmas.includes(pragma.type)) {
      // Parse until \end
      let to = cx.lineStart + line.text.length
      while (cx.nextLine()) {
        let trimmed = line.text.trim()
        if (trimmed === '\\end' || trimmed.startsWith('\\end ')) {
          marks.push(elt(Type.PragmaMark, cx.lineStart + line.pos, cx.lineStart + line.text.length))
          to = cx.lineStart + line.text.length
          cx.nextLine()
          break
        }
        to = cx.lineStart + line.text.length
      }
      
      let nodeType = pragma.type === 'define' ? Type.MacroDefinition :
                     pragma.type === 'procedure' ? Type.ProcedureDefinition :
                     pragma.type === 'function' ? Type.FunctionDefinition :
                     Type.WidgetDefinition
      
      cx.addNode(cx.buffer.writeElements(marks, -from).finish(nodeType, to - from), from)
    } else {
      // Single-line pragmas
      let to = cx.lineStart + line.text.length
      let nodeType = pragma.type === 'rules' ? Type.RulesPragma :
                     pragma.type === 'import' ? Type.ImportPragma :
                     pragma.type === 'parameters' ? Type.ParametersPragma :
                     Type.WhitespacePragma
      
      cx.addNode(cx.buffer.writeElements(marks, -from).finish(nodeType, to - from), from)
      cx.nextLine()
    }
    return true
  },

  Heading(cx, line) {
    let level = isHeading(line)
    if (level < 0) return false
    
    let from = cx.lineStart + line.pos
    let headingType = Type.Heading1 - 1 + level
    
    let buf = cx.buffer
      .write(Type.HeadingMark, 0, level)
      .writeElements(cx.parser.parseInline(line.text.slice(line.pos + level), from + level), -from)
    
    let node = buf.finish(headingType, line.text.length - line.pos)
    cx.nextLine()
    cx.addNode(node, from)
    return true
  },

  HorizontalRule(cx, line) {
    if (!isHorizontalRule(line)) return false
    let from = cx.lineStart + line.pos
    cx.nextLine()
    cx.addNode(Type.HorizontalRule, from)
    return true
  },

  FencedCode(cx, line) {
    let fenceEnd = isFencedCode(line)
    if (fenceEnd < 0) return false
    
    let from = cx.lineStart + line.pos
    let len = fenceEnd - line.pos
    let infoFrom = line.skipSpace(fenceEnd)
    let infoTo = skipSpaceBack(line.text, line.text.length, infoFrom)
    let marks: Element[] = [elt(Type.CodeMark, from, from + len)]
    
    if (infoFrom < infoTo)
      marks.push(elt(Type.CodeInfo, cx.lineStart + infoFrom, cx.lineStart + infoTo))
    
    while (cx.nextLine() && line.depth >= cx.stack.length) {
      let i = line.pos
      while (i < line.text.length && line.text.charCodeAt(i) == 96) i++
      if (i - line.pos >= len && line.skipSpace(i) == line.text.length) {
        marks.push(elt(Type.CodeMark, cx.lineStart + line.pos, cx.lineStart + i))
        cx.nextLine()
        break
      } else {
        let textStart = cx.lineStart + line.basePos
        let textEnd = cx.lineStart + line.text.length
        if (textStart < textEnd) addCodeText(marks, textStart, textEnd)
      }
    }
    
    cx.addNode(cx.buffer.writeElements(marks, -from).finish(Type.FencedCode, cx.prevLineEnd() - from), from)
    return true
  },

  BlockQuote(cx, line) {
    let end = isBlockQuote(line)
    if (end < 0) return false
    
    let from = cx.lineStart + line.pos
    let marks: Element[] = [elt(Type.QuoteMark, from, cx.lineStart + end)]
    let content: Element[] = []
    
    // Parse content until closing <<<
    while (cx.nextLine()) {
      let closeEnd = isBlockQuote(line)
      if (closeEnd >= 0) {
        marks.push(elt(Type.QuoteMark, cx.lineStart + line.pos, cx.lineStart + closeEnd))
        cx.nextLine()
        break
      }
      // Parse inline content
      let lineContent = cx.parser.parseInline(line.text.slice(line.pos), cx.lineStart + line.pos)
      content.push(...lineContent)
    }
    
    cx.addNode(cx.buffer.writeElements([...marks, ...content], -from)
      .finish(Type.BlockQuote, cx.prevLineEnd() - from), from)
    return true
  },

  BulletList(cx, line) {
    let size = isBulletList(line)
    if (size < 0) return false
    
    if (cx.block.type != Type.BulletList)
      cx.startContext(Type.BulletList, line.basePos, line.next)
    
    let newBase = line.pos + size + 1
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent)
    cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + size)
    line.moveBaseColumn(newBase)
    return null
  },

  NumberedList(cx, line) {
    let size = isNumberedList(line)
    if (size < 0) return false
    
    if (cx.block.type != Type.NumberedList)
      cx.startContext(Type.NumberedList, line.basePos, line.next)
    
    let newBase = line.pos + size + 1
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent)
    cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + size)
    line.moveBaseColumn(newBase)
    return null
  },

  DefinitionList(cx, line) {
    if (!isDefinitionTerm(line) && !isDefinitionDescription(line)) return false
    
    if (cx.block.type != Type.DefinitionList)
      cx.startContext(Type.DefinitionList, line.basePos, 0)
    
    let isTerm = isDefinitionTerm(line)
    let nodeType = isTerm ? Type.DefinitionTerm : Type.DefinitionDescription
    
    cx.startContext(nodeType, line.basePos, 1)
    cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + 1)
    line.moveBase(line.pos + 1)
    return null
  },

  Table(cx, line) {
    if (!isTable(line)) return false
    
    let from = cx.lineStart + line.pos
    let rows: Element[] = []
    let isHeader = true
    
    do {
      let rowFrom = cx.lineStart + line.pos
      let cells: Element[] = []
      let text = line.text
      let pos = line.pos
      
      while (pos < text.length) {
        if (text.charCodeAt(pos) == 124 /* '|' */) {
          cells.push(elt(Type.TableDelimiter, cx.lineStart + pos, cx.lineStart + pos + 1))
          pos++
          let cellStart = pos
          // Find cell content
          while (pos < text.length && text.charCodeAt(pos) != 124) pos++
          if (pos > cellStart) {
            let cellContent = text.slice(cellStart, pos).trim()
            if (cellContent) {
              let cellType = isHeader ? Type.TableHeader : Type.TableCell
              let inline = cx.parser.parseInline(cellContent, cx.lineStart + cellStart)
              cells.push(elt(cellType, cx.lineStart + cellStart, cx.lineStart + pos, inline))
            }
          }
        } else {
          pos++
        }
      }
      
      if (cells.length > 0) {
        rows.push(elt(Type.TableRow, rowFrom, cx.lineStart + line.text.length, cells))
      }
      
      // Check for header separator |---|---|
      if (isHeader && /^\|[-:|\s]+\|$/.test(text.slice(line.pos))) {
        isHeader = false
      } else {
        isHeader = false
      }
      
    } while (cx.nextLine() && isTable(line))
    
    cx.addNode(cx.buffer.writeElements(rows, -from).finish(Type.Table, cx.prevLineEnd() - from), from)
    return true
  },

  TypedBlock(cx, line) {
    let typed = isTypedBlock(line)
    if (!typed) return false
    
    let from = cx.lineStart + line.pos
    let marks: Element[] = [elt(Type.TypedBlockMark, from, cx.lineStart + typed.end)]
    
    if (typed.info) {
      marks.push(elt(Type.TypedBlockInfo, cx.lineStart + 3, cx.lineStart + typed.end))
    }
    
    // Parse until closing $$$
    while (cx.nextLine()) {
      if (line.text.trim() === '$$$') {
        marks.push(elt(Type.TypedBlockMark, cx.lineStart + line.pos, cx.lineStart + line.text.length))
        cx.nextLine()
        break
      }
      let textStart = cx.lineStart + line.pos
      let textEnd = cx.lineStart + line.text.length
      if (textStart < textEnd) addCodeText(marks, textStart, textEnd)
    }
    
    cx.addNode(cx.buffer.writeElements(marks, -from).finish(Type.TypedBlock, cx.prevLineEnd() - from), from)
    return true
  },

  HTMLBlock(cx, line) {
    if (!isHTMLBlock(line)) return false
    
    let from = cx.lineStart + line.pos
    let depth = 1
    let text = line.text.slice(line.pos)
    
    // Simple HTML block handling - find matching close tag or empty line
    while (cx.nextLine() && depth > 0) {
      if (line.text.trim() === '') break
      // Count opening and closing tags
      let matches = line.text.match(/<[a-zA-Z][^>]*>/g) || []
      let closes = line.text.match(/<\/[a-zA-Z][^>]*>/g) || []
      depth += matches.length - closes.length
    }
    
    cx.addNode(Type.HTMLBlock, from, cx.prevLineEnd())
    return true
  }
}

// Skip markup handlers for composite blocks
function skipForList(bl: CompositeBlock, cx: BlockContext, line: Line) {
  if (line.pos == line.text.length ||
      (bl != cx.block && line.indent >= cx.stack[line.depth + 1].value + line.baseIndent)) return true
  if (line.indent >= line.baseIndent + 4) return false
  
  let size = bl.type == Type.NumberedList ? isNumberedList(line) : isBulletList(line)
  return size > 0
}

const DefaultSkipMarkup: {[type: number]: (bl: CompositeBlock, cx: BlockContext, line: Line) => boolean} = {
  [Type.BlockQuote](bl, cx, line) {
    // Block quotes don't need continuation markers in TiddlyWiki
    return true
  },
  [Type.ListItem](bl, _cx, line) {
    if (line.indent < line.baseIndent + bl.value && line.next > -1) return false
    line.moveBaseColumn(line.baseIndent + bl.value)
    return true
  },
  [Type.BulletList]: skipForList,
  [Type.NumberedList]: skipForList,
  [Type.DefinitionList](bl, cx, line) {
    return isDefinitionTerm(line) || isDefinitionDescription(line)
  },
  [Type.DefinitionTerm]() { return true },
  [Type.DefinitionDescription]() { return true },
  [Type.Document]() { return true }
}

// Leaf block parsers
const DefaultLeafBlocks: {[name: string]: (cx: BlockContext, leaf: LeafBlock) => LeafBlockParser | null} = {
  Pragma() { return null },
  Heading() { return null },
  HorizontalRule() { return null },
  FencedCode() { return null },
  BlockQuote() { return null },
  BulletList() { return null },
  NumberedList() { return null },
  DefinitionList() { return null },
  Table() { return null },
  TypedBlock() { return null },
  HTMLBlock() { return null }
}

const DefaultEndLeaf: readonly ((cx: BlockContext, line: Line) => boolean)[] = [
  (_, line) => isHeading(line) >= 0,
  (_, line) => isFencedCode(line) >= 0,
  (_, line) => isBlockQuote(line) >= 0,
  (_, line) => isBulletList(line) >= 0,
  (_, line) => isNumberedList(line) >= 0,
  (_, line) => isHorizontalRule(line),
  (_, line) => isTable(line),
  (_, line) => isTypedBlock(line) != null,
  (_, line) => isPragma(line) != null
]

// ============================================================================
// Inline Parsers
// ============================================================================

export let Punctuation = /[!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~\xA1\u2010-\u2027]/
try { Punctuation = new RegExp("[\\p{S}|\\p{P}]", "u") } catch (_) {}

const enum Mark { None = 0, Open = 1, Close = 2 }

export interface DelimiterType {
  resolve?: string
  mark?: string
}

class InlineDelimiter {
  constructor(
    readonly type: DelimiterType,
    readonly from: number,
    readonly to: number,
    public side: Mark
  ) {}
}

// Delimiter types for TiddlyWiki formatting
const BoldDelim: DelimiterType = {resolve: "Bold", mark: "EmphasisMark"}
const ItalicDelim: DelimiterType = {resolve: "Italic", mark: "EmphasisMark"}
const UnderlineDelim: DelimiterType = {resolve: "Underline", mark: "EmphasisMark"}
const StrikethroughDelim: DelimiterType = {resolve: "Strikethrough", mark: "EmphasisMark"}
const SuperscriptDelim: DelimiterType = {resolve: "Superscript", mark: "EmphasisMark"}
const SubscriptDelim: DelimiterType = {resolve: "Subscript", mark: "EmphasisMark"}
const HighlightDelim: DelimiterType = {resolve: "Highlight", mark: "EmphasisMark"}
const WikiLinkStart: DelimiterType = {}
const TransclusionStart: DelimiterType = {}
const MacroStart: DelimiterType = {}
const WidgetStart: DelimiterType = {}

const DefaultInline: {[name: string]: (cx: InlineContext, next: number, pos: number) => number} = {
  
  // Escape: ~ before wikitext characters
  Escape(cx, next, start) {
    if (next != 126 /* '~' */) return -1
    let escaped = cx.char(start + 1)
    if (escaped < 0) return -1
    // TiddlyWiki escape prevents wikitext interpretation
    return cx.append(elt(Type.Escape, start, start + 2))
  },

  // HTML Entity: &entity;
  Entity(cx, next, start) {
    if (next != 38 /* '&' */) return -1
    let m = /^(?:#\d+|#x[a-f\d]+|\w+);/i.exec(cx.slice(start + 1, start + 31))
    return m ? cx.append(elt(Type.Entity, start, start + 1 + m[0].length)) : -1
  },

  // Inline Code: `code`
  InlineCode(cx, next, start) {
    if (next != 96 /* '`' */) return -1
    let pos = start + 1
    while (pos < cx.end && cx.char(pos) == 96) pos++
    let size = pos - start
    let curSize = 0
    for (; pos < cx.end; pos++) {
      if (cx.char(pos) == 96) {
        curSize++
        if (curSize == size && cx.char(pos + 1) != 96)
          return cx.append(elt(Type.InlineCode, start, pos + 1, [
            elt(Type.CodeMark, start, start + size),
            elt(Type.CodeMark, pos + 1 - size, pos + 1)
          ]))
      } else {
        curSize = 0
      }
    }
    return -1
  },

  // Bold: ''text''
  Bold(cx, next, start) {
    if (next != 39 /* '\'' */ || cx.char(start + 1) != 39) return -1
    let after = cx.slice(start + 2, start + 3)
    let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start))
    let sAfter = /\s|^$/.test(after)
    return cx.append(new InlineDelimiter(BoldDelim, start, start + 2,
      (!sAfter ? Mark.Open : Mark.None) | (!sBefore ? Mark.Close : Mark.None)))
  },

  // Italic: //text//
  Italic(cx, next, start) {
    if (next != 47 /* '/' */ || cx.char(start + 1) != 47) return -1
    let after = cx.slice(start + 2, start + 3)
    let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start))
    let sAfter = /\s|^$/.test(after)
    return cx.append(new InlineDelimiter(ItalicDelim, start, start + 2,
      (!sAfter ? Mark.Open : Mark.None) | (!sBefore ? Mark.Close : Mark.None)))
  },

  // Underline: __text__
  Underline(cx, next, start) {
    if (next != 95 /* '_' */ || cx.char(start + 1) != 95) return -1
    let after = cx.slice(start + 2, start + 3)
    let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start))
    let sAfter = /\s|^$/.test(after)
    return cx.append(new InlineDelimiter(UnderlineDelim, start, start + 2,
      (!sAfter ? Mark.Open : Mark.None) | (!sBefore ? Mark.Close : Mark.None)))
  },

  // Strikethrough: ~~text~~
  Strikethrough(cx, next, start) {
    if (next != 126 /* '~' */ || cx.char(start + 1) != 126) return -1
    // Check it's not an escape (single ~)
    if (cx.char(start + 2) == 126) return -1 // ~~~ is not strikethrough
    let after = cx.slice(start + 2, start + 3)
    let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start))
    let sAfter = /\s|^$/.test(after)
    return cx.append(new InlineDelimiter(StrikethroughDelim, start, start + 2,
      (!sAfter ? Mark.Open : Mark.None) | (!sBefore ? Mark.Close : Mark.None)))
  },

  // Superscript: ^^text^^
  Superscript(cx, next, start) {
    if (next != 94 /* '^' */ || cx.char(start + 1) != 94) return -1
    let after = cx.slice(start + 2, start + 3)
    let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start))
    let sAfter = /\s|^$/.test(after)
    return cx.append(new InlineDelimiter(SuperscriptDelim, start, start + 2,
      (!sAfter ? Mark.Open : Mark.None) | (!sBefore ? Mark.Close : Mark.None)))
  },

  // Subscript: ,,text,,
  Subscript(cx, next, start) {
    if (next != 44 /* ',' */ || cx.char(start + 1) != 44) return -1
    let after = cx.slice(start + 2, start + 3)
    let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start))
    let sAfter = /\s|^$/.test(after)
    return cx.append(new InlineDelimiter(SubscriptDelim, start, start + 2,
      (!sAfter ? Mark.Open : Mark.None) | (!sBefore ? Mark.Close : Mark.None)))
  },

  // WikiLink: [[link]] or [[text|link]]
  WikiLink(cx, next, start) {
    if (next != 91 /* '[' */ || cx.char(start + 1) != 91) return -1
    
    let pos = start + 2
    let hasText = false
    let textEnd = pos
    
    // Find closing ]]
    while (pos < cx.end) {
      let ch = cx.char(pos)
      if (ch == 124 /* '|' */ && !hasText) {
        hasText = true
        textEnd = pos
      } else if (ch == 93 /* ']' */ && cx.char(pos + 1) == 93) {
        let children: Element[] = [elt(Type.LinkMark, start, start + 2)]
        
        if (hasText) {
          children.push(elt(Type.LinkText, start + 2, textEnd))
          children.push(elt(Type.LinkMark, textEnd, textEnd + 1))
          children.push(elt(Type.LinkTarget, textEnd + 1, pos))
        } else {
          children.push(elt(Type.LinkTarget, start + 2, pos))
        }
        
        children.push(elt(Type.LinkMark, pos, pos + 2))
        return cx.append(elt(Type.WikiLink, start, pos + 2, children))
      }
      pos++
    }
    return -1
  },

  // External Link: [ext[text|url]] or [img[tooltip|url]]
  ExternalLink(cx, next, start) {
    if (next != 91 /* '[' */) return -1
    
    let pos = start + 1
    let type = ""
    
    // Check for ext[ or img[
    if (cx.slice(pos, pos + 4) === "ext[") {
      type = "ext"
      pos += 4
    } else if (cx.slice(pos, pos + 4) === "img[") {
      type = "img"
      pos += 4
    } else {
      return -1
    }
    
    let textStart = pos
    let textEnd = pos
    let hasText = false
    
    // Find closing ]]
    while (pos < cx.end) {
      let ch = cx.char(pos)
      if (ch == 124 /* '|' */ && !hasText) {
        hasText = true
        textEnd = pos
      } else if (ch == 93 /* ']' */ && cx.char(pos + 1) == 93) {
        let children: Element[] = [elt(Type.LinkMark, start, start + 1 + type.length + 1)]
        
        if (hasText) {
          children.push(elt(Type.LinkText, textStart, textEnd))
          children.push(elt(Type.LinkMark, textEnd, textEnd + 1))
          children.push(elt(Type.URL, textEnd + 1, pos))
        } else {
          children.push(elt(Type.URL, textStart, pos))
        }
        
        children.push(elt(Type.LinkMark, pos, pos + 2))
        let nodeType = type === "img" ? Type.ImageLink : Type.ExternalLink
        return cx.append(elt(nodeType, start, pos + 2, children))
      }
      pos++
    }
    return -1
  },

  // Transclusion: {{tiddler}} or {{tiddler!!field}} or {{tiddler##index}}
  Transclusion(cx, next, start) {
    if (next != 123 /* '{' */ || cx.char(start + 1) != 123) return -1
    
    // Check for filtered transclusion {{{ }}}
    if (cx.char(start + 2) == 123) {
      return -1 // Let FilteredTransclusion handle it
    }
    
    let pos = start + 2
    
    // Find closing }}
    while (pos < cx.end) {
      if (cx.char(pos) == 125 /* '}' */ && cx.char(pos + 1) == 125) {
        let children: Element[] = [
          elt(Type.LinkMark, start, start + 2),
          elt(Type.TransclusionTarget, start + 2, pos),
          elt(Type.LinkMark, pos, pos + 2)
        ]
        return cx.append(elt(Type.Transclusion, start, pos + 2, children))
      }
      pos++
    }
    return -1
  },

  // Filtered Transclusion: {{{ filter }}}
  FilteredTransclusion(cx, next, start) {
    if (next != 123 /* '{' */ || cx.char(start + 1) != 123 || cx.char(start + 2) != 123) return -1
    
    let pos = start + 3
    
    // Find closing }}}
    while (pos < cx.end) {
      if (cx.char(pos) == 125 /* '}' */ && cx.char(pos + 1) == 125 && cx.char(pos + 2) == 125) {
        let children: Element[] = [
          elt(Type.LinkMark, start, start + 3),
          elt(Type.FilterExpression, start + 3, pos),
          elt(Type.LinkMark, pos, pos + 3)
        ]
        return cx.append(elt(Type.FilteredTransclusion, start, pos + 3, children))
      }
      pos++
    }
    return -1
  },

  // Macro Call: <<macroname params>>
  MacroCall(cx, next, start) {
    if (next != 60 /* '<' */ || cx.char(start + 1) != 60) return -1
    
    let pos = start + 2
    let nameStart = pos
    
    // Skip whitespace
    while (pos < cx.end && space(cx.char(pos))) pos++
    nameStart = pos
    
    // Read macro name
    while (pos < cx.end && /[\w\-\$]/.test(cx.slice(pos, pos + 1))) pos++
    let nameEnd = pos
    
    if (nameEnd == nameStart) return -1 // No name
    
    // Find closing >>
    let depth = 1
    while (pos < cx.end && depth > 0) {
      if (cx.char(pos) == 60 && cx.char(pos + 1) == 60) depth++
      else if (cx.char(pos) == 62 && cx.char(pos + 1) == 62) depth--
      if (depth > 0) pos++
    }
    
    if (depth != 0) return -1
    
    let children: Element[] = [
      elt(Type.LinkMark, start, start + 2),
      elt(Type.MacroName, nameStart, nameEnd)
    ]
    
    if (nameEnd < pos) {
      children.push(elt(Type.MacroParams, nameEnd, pos))
    }
    
    children.push(elt(Type.LinkMark, pos, pos + 2))
    return cx.append(elt(Type.MacroCall, start, pos + 2, children))
  },

  // Widget: <$widget attr="value">...</$widget> or <$widget/>
  Widget(cx, next, start) {
    if (next != 60 /* '<' */ || cx.char(start + 1) != 36 /* '$' */) return -1
    
    let pos = start + 2
    let nameStart = pos
    
    // Read widget name
    while (pos < cx.end && /[\w\-]/.test(cx.slice(pos, pos + 1))) pos++
    let nameEnd = pos
    
    if (nameEnd == nameStart) return -1 // No name
    
    // Parse attributes until > or />
    let attrs: Element[] = []
    while (pos < cx.end) {
      // Skip whitespace
      while (pos < cx.end && space(cx.char(pos))) pos++
      
      if (cx.char(pos) == 47 /* '/' */ && cx.char(pos + 1) == 62 /* '>' */) {
        // Self-closing
        let children: Element[] = [
          elt(Type.LinkMark, start, start + 2),
          elt(Type.WidgetName, nameStart, nameEnd),
          ...attrs,
          elt(Type.LinkMark, pos, pos + 2)
        ]
        return cx.append(elt(Type.Widget, start, pos + 2, children))
      }
      
      if (cx.char(pos) == 62 /* '>' */) {
        // Opening tag - look for closing tag
        let openEnd = pos + 1
        let depth = 1
        pos++
        
        while (pos < cx.end && depth > 0) {
          if (cx.char(pos) == 60 /* '<' */) {
            if (cx.char(pos + 1) == 36 /* '$' */) {
              // Check if it's the same widget name
              let checkPos = pos + 2
              while (checkPos < cx.end && /[\w\-]/.test(cx.slice(checkPos, checkPos + 1))) checkPos++
              depth++
            } else if (cx.char(pos + 1) == 47 /* '/' */ && cx.char(pos + 2) == 36 /* '$' */) {
              // Closing tag
              let closeNameStart = pos + 3
              let closeNameEnd = closeNameStart
              while (closeNameEnd < cx.end && /[\w\-]/.test(cx.slice(closeNameEnd, closeNameEnd + 1))) closeNameEnd++
              let closeName = cx.slice(closeNameStart, closeNameEnd)
              let openName = cx.slice(nameStart, nameEnd)
              if (closeName === openName) {
                depth--
                if (depth == 0) {
                  // Find the >
                  while (closeNameEnd < cx.end && cx.char(closeNameEnd) != 62) closeNameEnd++
                  let children: Element[] = [
                    elt(Type.LinkMark, start, start + 2),
                    elt(Type.WidgetName, nameStart, nameEnd),
                    ...attrs,
                    elt(Type.LinkMark, pos, pos + 1),
                    elt(Type.LinkMark, pos, closeNameEnd + 1)
                  ]
                  return cx.append(elt(Type.Widget, start, closeNameEnd + 1, children))
                }
              }
            }
          }
          pos++
        }
        return -1
      }
      
      // Try to parse attribute
      let attrStart = pos
      while (pos < cx.end && /[\w\-]/.test(cx.slice(pos, pos + 1))) pos++
      if (pos > attrStart) {
        let attrNameEnd = pos
        // Check for =
        while (pos < cx.end && space(cx.char(pos))) pos++
        if (cx.char(pos) == 61 /* '=' */) {
          pos++
          while (pos < cx.end && space(cx.char(pos))) pos++
          // Parse value
          let quote = cx.char(pos)
          if (quote == 34 /* '"' */ || quote == 39 /* '\'' */) {
            pos++
            while (pos < cx.end && cx.char(pos) != quote) pos++
            if (cx.char(pos) == quote) pos++
          } else if (quote == 123 /* '{' */ && cx.char(pos + 1) == 123) {
            // Indirect attribute {{ref}}
            pos += 2
            while (pos < cx.end && !(cx.char(pos) == 125 && cx.char(pos + 1) == 125)) pos++
            if (cx.char(pos) == 125) pos += 2
          } else if (quote == 60 /* '<' */ && cx.char(pos + 1) == 60) {
            // Macro attribute <<macro>>
            pos += 2
            let depth = 1
            while (pos < cx.end && depth > 0) {
              if (cx.char(pos) == 60 && cx.char(pos + 1) == 60) depth++
              else if (cx.char(pos) == 62 && cx.char(pos + 1) == 62) depth--
              pos++
            }
            pos++
          } else {
            // Unquoted value
            while (pos < cx.end && !space(cx.char(pos)) && cx.char(pos) != 62 && cx.char(pos) != 47) pos++
          }
        }
        attrs.push(elt(Type.WidgetAttr, attrStart, pos))
      } else {
        break
      }
    }
    return -1
  },

  // Variable: $(varname)$
  Variable(cx, next, start) {
    if (next != 36 /* '$' */ || cx.char(start + 1) != 40 /* '(' */) return -1
    
    let pos = start + 2
    
    // Find closing )$
    while (pos < cx.end) {
      if (cx.char(pos) == 41 /* ')' */ && cx.char(pos + 1) == 36 /* '$' */) {
        return cx.append(elt(Type.Variable, start, pos + 2))
      }
      pos++
    }
    return -1
  },

  // HTML Tag
  HTMLTag(cx, next, start) {
    if (next != 60 /* '<' */) return -1
    // Don't match widgets
    if (cx.char(start + 1) == 36 /* '$' */) return -1
    
    let after = cx.slice(start + 1, cx.end)
    let m = /^(?:\/\s*[a-zA-Z][\w-]*\s*>|[a-zA-Z][\w-]*(?:\s+[a-zA-Z:_][\w-.]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)/.exec(after)
    if (!m) return -1
    return cx.append(elt(Type.HTMLTag, start, start + 1 + m[0].length))
  },

  // Hard Break
  HardBreak(cx, next, start) {
    if (next == 60 /* '<' */) {
      let after = cx.slice(start, start + 4).toLowerCase()
      if (after === "<br>" || after === "<br/") {
        let end = start + 4
        if (cx.char(end) == 62) end++
        return cx.append(elt(Type.HardBreak, start, end))
      }
    }
    return -1
  }
}

// ============================================================================
// Element and Buffer Classes
// ============================================================================

const none: readonly any[] = []

class Buffer {
  content: number[] = []
  nodes: Tree[] = []
  constructor(readonly nodeSet: NodeSet) {}

  write(type: Type, from: number, to: number, children = 0) {
    this.content.push(type, from, to, 4 + children * 4)
    return this
  }

  writeElements(elts: readonly (Element | TreeElement)[], offset = 0) {
    for (let e of elts) e.writeTo(this, offset)
    return this
  }

  finish(type: Type, length: number) {
    return Tree.build({
      buffer: this.content,
      nodeSet: this.nodeSet,
      reused: this.nodes,
      topID: type,
      length
    })
  }
}

export class Element {
  constructor(
    readonly type: number,
    readonly from: number,
    readonly to: number,
    readonly children: readonly (Element | TreeElement)[] = none
  ) {}

  writeTo(buf: Buffer, offset: number) {
    let startOff = buf.content.length
    buf.writeElements(this.children, offset)
    buf.content.push(this.type, this.from + offset, this.to + offset, buf.content.length + 4 - startOff)
  }

  toTree(nodeSet: NodeSet): Tree {
    return new Buffer(nodeSet).writeElements(this.children, -this.from).finish(this.type, this.to - this.from)
  }
}

class TreeElement {
  constructor(readonly tree: Tree, readonly from: number) {}

  get to() { return this.from + this.tree.length }
  get type() { return this.tree.type.id }
  get children() { return none }

  writeTo(buf: Buffer, offset: number) {
    buf.nodes.push(this.tree)
    buf.content.push(buf.nodes.length - 1, this.from + offset, this.to + offset, -1)
  }

  toTree(): Tree { return this.tree }
}

function elt(type: Type, from: number, to: number, children?: readonly (Element | TreeElement)[]) {
  return new Element(type, from, to, children)
}

// ============================================================================
// Inline Context
// ============================================================================

export class InlineContext {
  parts: (Element | InlineDelimiter | null)[] = []

  constructor(
    readonly parser: TiddlyWikiParser,
    readonly text: string,
    readonly offset: number
  ) {}

  char(pos: number) { return pos >= this.end ? -1 : this.text.charCodeAt(pos - this.offset) }
  get end() { return this.offset + this.text.length }
  slice(from: number, to: number) { return this.text.slice(from - this.offset, to - this.offset) }

  append(elt: Element | InlineDelimiter) {
    this.parts.push(elt)
    return elt.to
  }

  addDelimiter(type: DelimiterType, from: number, to: number, open: boolean, close: boolean) {
    return this.append(new InlineDelimiter(type, from, to, (open ? Mark.Open : Mark.None) | (close ? Mark.Close : Mark.None)))
  }

  addElement(elt: Element) {
    return this.append(elt)
  }

  resolveMarkers(from: number) {
    for (let i = from; i < this.parts.length; i++) {
      let close = this.parts[i]
      if (!(close instanceof InlineDelimiter && close.type.resolve && (close.side & Mark.Close))) continue

      let closeSize = close.to - close.from
      let open: InlineDelimiter | undefined, j = i - 1

      for (; j >= from; j--) {
        let part = this.parts[j]
        if (part instanceof InlineDelimiter && (part.side & Mark.Open) && part.type == close.type) {
          open = part
          break
        }
      }
      if (!open) continue

      let type = close.type.resolve!, content = []
      let start = open.from, end = close.to

      if (open.type.mark) content.push(this.elt(open.type.mark, start, open.to))
      for (let k = j + 1; k < i; k++) {
        if (this.parts[k] instanceof Element) content.push(this.parts[k] as Element)
        this.parts[k] = null
      }
      if (close.type.mark) content.push(this.elt(close.type.mark, close.from, end))
      
      let element = this.elt(type, start, end, content)
      this.parts[j] = null
      this.parts[i] = element
    }

    let result = []
    for (let i = from; i < this.parts.length; i++) {
      let part = this.parts[i]
      if (part instanceof Element) result.push(part)
    }
    return result
  }

  skipSpace(from: number) { return skipSpace(this.text, from - this.offset) + this.offset }

  elt(type: string, from: number, to: number, children?: readonly Element[]): Element
  elt(tree: Tree, at: number): Element
  elt(type: string | Tree, from: number, to?: number, children?: readonly Element[]): Element {
    if (typeof type == "string") return elt(this.parser.getNodeType(type), from, to!, children)
    return new TreeElement(type, from)
  }
}

// ============================================================================
// Block Context
// ============================================================================

export class BlockContext implements PartialParse {
  block: CompositeBlock
  stack: CompositeBlock[]
  private line = new Line()
  private atEnd = false
  private fragments: FragmentCursor | null
  private to: number
  reusePlaceholders: Map<Tree, Tree> = new Map
  stoppedAt: number | null = null

  lineStart: number
  absoluteLineStart: number
  rangeI = 0
  absoluteLineEnd: number

  constructor(
    readonly parser: TiddlyWikiParser,
    readonly input: Input,
    fragments: readonly TreeFragment[],
    readonly ranges: readonly {from: number, to: number}[]
  ) {
    this.to = ranges[ranges.length - 1].to
    this.lineStart = this.absoluteLineStart = this.absoluteLineEnd = ranges[0].from
    this.block = CompositeBlock.create(Type.Document, 0, this.lineStart, 0, 0)
    this.stack = [this.block]
    this.fragments = fragments.length ? new FragmentCursor(fragments, input) : null
    this.readLine()
  }

  get parsedPos() {
    return this.absoluteLineStart
  }

  advance() {
    if (this.stoppedAt != null && this.absoluteLineStart > this.stoppedAt)
      return this.finish()

    let {line} = this
    for (;;) {
      for (let markI = 0;;) {
        let next = line.depth < this.stack.length ? this.stack[this.stack.length - 1] : null
        while (markI < line.markers.length && (!next || line.markers[markI].from < next.end)) {
          let mark = line.markers[markI++]
          this.addNode(mark.type, mark.from, mark.to)
        }
        if (!next) break
        this.finishContext()
      }
      if (line.pos < line.text.length) break
      if (!this.nextLine()) return this.finish()
    }

    if (this.fragments && this.reuseFragment(line.basePos)) return null

    start: for (;;) {
      for (let type of this.parser.blockParsers) if (type) {
        let result = type(this, line)
        if (result != false) {
          if (result == true) return null
          line.forward()
          continue start
        }
      }
      break
    }

    let leaf = new LeafBlock(this.lineStart + line.pos, line.text.slice(line.pos))
    for (let parse of this.parser.leafBlockParsers) if (parse) {
      let parser = parse!(this, leaf)
      if (parser) leaf.parsers.push(parser!)
    }
    
    lines: while (this.nextLine()) {
      if (line.pos == line.text.length) break
      if (line.indent < line.baseIndent + 4) {
        for (let stop of this.parser.endLeafBlock) if (stop(this, line, leaf)) break lines
      }
      for (let parser of leaf.parsers) if (parser.nextLine(this, line, leaf)) return null
      leaf.content += "\n" + line.scrub()
      for (let m of line.markers) leaf.marks.push(m)
    }
    this.finishLeaf(leaf)
    return null
  }

  stopAt(pos: number) {
    if (this.stoppedAt != null && this.stoppedAt < pos) throw new RangeError("Can't move stoppedAt forward")
    this.stoppedAt = pos
  }

  private reuseFragment(start: number) {
    if (!this.fragments!.moveTo(this.absoluteLineStart + start, this.absoluteLineStart) ||
        !this.fragments!.matches(this.block.hash)) return false
    let taken = this.fragments!.takeNodes(this)
    if (!taken) return false
    this.absoluteLineStart += taken
    this.lineStart = toRelative(this.absoluteLineStart, this.ranges)
    this.moveRangeI()
    if (this.absoluteLineStart < this.to) {
      this.lineStart++
      this.absoluteLineStart++
      this.readLine()
    } else {
      this.atEnd = true
      this.readLine()
    }
    return true
  }

  get depth() {
    return this.stack.length
  }

  parentType(depth = this.depth - 1) {
    return this.parser.nodeSet.types[this.stack[depth].type]
  }

  nextLine() {
    this.lineStart += this.line.text.length
    if (this.absoluteLineEnd >= this.to) {
      this.absoluteLineStart = this.absoluteLineEnd
      this.atEnd = true
      this.readLine()
      return false
    } else {
      this.lineStart++
      this.absoluteLineStart = this.absoluteLineEnd + 1
      this.moveRangeI()
      this.readLine()
      return true
    }
  }

  private moveRangeI() {
    while (this.rangeI < this.ranges.length - 1 && this.absoluteLineStart >= this.ranges[this.rangeI].to) {
      this.rangeI++
      this.absoluteLineStart = Math.max(this.absoluteLineStart, this.ranges[this.rangeI].from)
    }
  }

  scanLine(start: number) {
    let r = {text: "", end: start}
    if (start >= this.to) {
      r.text = ""
    } else {
      r.text = this.lineChunkAt(start)
      r.end += r.text.length
      if (this.ranges.length > 1) {
        let textOffset = this.absoluteLineStart, rangeI = this.rangeI
        while (this.ranges[rangeI].to < r.end) {
          rangeI++
          let nextFrom = this.ranges[rangeI].from
          let after = this.lineChunkAt(nextFrom)
          r.end = nextFrom + after.length
          r.text = r.text.slice(0, this.ranges[rangeI - 1].to - textOffset) + after
          textOffset = r.end - r.text.length
        }
      }
    }
    return r
  }

  readLine() {
    let {line} = this, {text, end} = this.scanLine(this.absoluteLineStart)
    this.absoluteLineEnd = end
    line.reset(text)
    for (; line.depth < this.stack.length; line.depth++) {
      let cx = this.stack[line.depth], handler = this.parser.skipContextMarkup[cx.type]
      if (!handler) throw new Error("Unhandled block context " + Type[cx.type])
      let marks = this.line.markers.length
      if (!handler(cx, this, line)) {
        if (this.line.markers.length > marks)
          cx.end = this.line.markers[this.line.markers.length - 1].to
        line.forward()
        break
      }
      line.forward()
    }
  }

  private lineChunkAt(pos: number) {
    let next = this.input.chunk(pos), text
    if (!this.input.lineChunks) {
      let eol = next.indexOf("\n")
      text = eol < 0 ? next : next.slice(0, eol)
    } else {
      text = next == "\n" ? "" : next
    }
    return pos + text.length > this.to ? text.slice(0, this.to - pos) : text
  }

  prevLineEnd() { return this.atEnd ? this.lineStart : this.lineStart - 1 }

  startContext(type: Type, start: number, value = 0) {
    this.block = CompositeBlock.create(type, value, this.lineStart + start, this.block.hash, this.lineStart + this.line.text.length)
    this.stack.push(this.block)
  }

  startComposite(type: string, start: number, value = 0) {
    this.startContext(this.parser.getNodeType(type), start, value)
  }

  addNode(block: Type | Tree, from: number, to?: number) {
    if (typeof block == "number") block = new Tree(this.parser.nodeSet.types[block], none, none, (to ?? this.prevLineEnd()) - from)
    this.block.addChild(block, from - this.block.from)
  }

  addElement(elt: Element) {
    this.block.addChild(elt.toTree(this.parser.nodeSet), elt.from - this.block.from)
  }

  addLeafElement(leaf: LeafBlock, elt: Element) {
    this.addNode(this.buffer
      .writeElements(injectMarks(elt.children, leaf.marks), -elt.from)
      .finish(elt.type, elt.to - elt.from), elt.from)
  }

  finishContext() {
    let cx = this.stack.pop()!
    let top = this.stack[this.stack.length - 1]
    top.addChild(cx.toTree(this.parser.nodeSet), cx.from - top.from)
    this.block = top
  }

  private finish() {
    while (this.stack.length > 1) this.finishContext()
    return this.addGaps(this.block.toTree(this.parser.nodeSet, this.lineStart))
  }

  private addGaps(tree: Tree) {
    return this.ranges.length > 1 ?
      injectGaps(this.ranges, 0, tree.topNode, this.ranges[0].from, this.reusePlaceholders) : tree
  }

  finishLeaf(leaf: LeafBlock) {
    for (let parser of leaf.parsers) if (parser.finish(this, leaf)) return
    let inline = injectMarks(this.parser.parseInline(leaf.content, leaf.start), leaf.marks)
    this.addNode(this.buffer
      .writeElements(inline, -leaf.start)
      .finish(Type.Paragraph, leaf.content.length), leaf.start)
  }

  elt(type: string, from: number, to: number, children?: readonly Element[]): Element
  elt(tree: Tree, at: number): Element
  elt(type: string | Tree, from: number, to?: number, children?: readonly Element[]): Element {
    if (typeof type == "string") return elt(this.parser.getNodeType(type), from, to!, children)
    return new TreeElement(type, from)
  }

  get buffer() { return new Buffer(this.parser.nodeSet) }
}

// ============================================================================
// Helper Functions
// ============================================================================

function injectGaps(
  ranges: readonly {from: number, to: number}[], rangeI: number,
  tree: SyntaxNode, offset: number, dummies: Map<Tree, Tree>
): Tree {
  let rangeEnd = ranges[rangeI].to
  let children = [], positions = [], start = tree.from + offset
  
  function movePastNext(upto: number, inclusive: boolean) {
    while (inclusive ? upto >= rangeEnd : upto > rangeEnd) {
      let size = ranges[rangeI + 1].from - rangeEnd
      offset += size
      upto += size
      rangeI++
      rangeEnd = ranges[rangeI].to
    }
  }
  
  for (let ch = tree.firstChild; ch; ch = ch.nextSibling) {
    movePastNext(ch.from + offset, true)
    let from = ch.from + offset, node, reuse = dummies.get(ch.tree!)
    if (reuse) {
      node = reuse
    } else if (ch.to + offset > rangeEnd) {
      node = injectGaps(ranges, rangeI, ch, offset, dummies)
      movePastNext(ch.to + offset, false)
    } else {
      node = ch.toTree()
    }
    children.push(node)
    positions.push(from - start)
  }
  movePastNext(tree.to + offset, false)
  return new Tree(tree.type, children, positions, tree.to + offset - start, tree.tree ? tree.tree.propValues : undefined)
}

function toRelative(abs: number, ranges: readonly {from: number, to: number}[]) {
  let pos = abs
  for (let i = 1; i < ranges.length; i++) {
    let gapFrom = ranges[i - 1].to, gapTo = ranges[i].from
    if (gapFrom < abs) pos -= gapTo - gapFrom
  }
  return pos
}

function injectMarks(elements: readonly (Element | TreeElement)[], marks: Element[]) {
  if (!marks.length) return elements
  if (!elements.length) return marks
  let elts = elements.slice(), eI = 0
  for (let mark of marks) {
    while (eI < elts.length && elts[eI].to < mark.to) eI++
    if (eI < elts.length && elts[eI].from < mark.from) {
      let e = elts[eI]
      if (e instanceof Element)
        elts[eI] = new Element(e.type, e.from, e.to, injectMarks(e.children, [mark]))
    } else {
      elts.splice(eI++, 0, mark)
    }
  }
  return elts
}

// ============================================================================
// Fragment Cursor for Incremental Parsing
// ============================================================================

const NotLast = [Type.CodeBlock, Type.ListItem, Type.BulletList, Type.NumberedList]

class FragmentCursor {
  i = 0
  fragment: TreeFragment | null = null
  fragmentEnd = -1
  cursor: TreeCursor | null = null

  constructor(readonly fragments: readonly TreeFragment[], readonly input: Input) {
    if (fragments.length) this.fragment = fragments[this.i++]
  }

  nextFragment() {
    this.fragment = this.i < this.fragments.length ? this.fragments[this.i++] : null
    this.cursor = null
    this.fragmentEnd = -1
  }

  moveTo(pos: number, lineStart: number) {
    while (this.fragment && this.fragment.to <= pos) this.nextFragment()
    if (!this.fragment || this.fragment.from > (pos ? pos - 1 : 0)) return false
    if (this.fragmentEnd < 0) {
      let end = this.fragment.to
      while (end > 0 && this.input.read(end - 1, end) != "\n") end--
      this.fragmentEnd = end ? end - 1 : 0
    }

    let c = this.cursor
    if (!c) {
      c = this.cursor = this.fragment.tree.cursor()
      c.firstChild()
    }

    let rPos = pos + this.fragment.offset
    while (c.to <= rPos) if (!c.parent()) return false
    for (;;) {
      if (c.from >= rPos) return this.fragment.from <= lineStart
      if (!c.childAfter(rPos)) return false
    }
  }

  matches(hash: number) {
    let tree = this.cursor!.tree
    return tree && tree.prop(NodeProp.contextHash) == hash
  }

  takeNodes(cx: BlockContext) {
    let cur = this.cursor!, off = this.fragment!.offset, fragEnd = this.fragmentEnd - (this.fragment!.openEnd ? 1 : 0)
    let start = cx.absoluteLineStart, end = start, blockI = cx.block.children.length
    let prevEnd = end, prevI = blockI
    for (;;) {
      if (cur.to - off > fragEnd) {
        if (cur.type.isAnonymous && cur.firstChild()) continue
        break
      }
      let pos = toRelative(cur.from - off, cx.ranges)
      if (cur.to - off <= cx.ranges[cx.rangeI].to) {
        cx.addNode(cur.tree!, pos)
      } else {
        let dummy = new Tree(cx.parser.nodeSet.types[Type.Paragraph], [], [], 0, cx.block.hashProp)
        cx.reusePlaceholders.set(dummy, cur.tree!)
        cx.addNode(dummy, pos)
      }
      if (cur.type.is("Block")) {
        if (NotLast.indexOf(cur.type.id) < 0) {
          end = cur.to - off
          blockI = cx.block.children.length
        } else {
          end = prevEnd
          blockI = prevI
          prevEnd = cur.to - off
          prevI = cx.block.children.length
        }
      }
      if (!cur.nextSibling()) break
    }
    while (cx.block.children.length > blockI) {
      cx.block.children.pop()
      cx.block.positions.pop()
    }
    return end - start
  }
}

// ============================================================================
// Parser Interfaces
// ============================================================================

export interface LeafBlockParser {
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean
  finish(cx: BlockContext, leaf: LeafBlock): boolean
}

export interface NodeSpec {
  name: string
  block?: boolean
  composite?(cx: BlockContext, line: Line, value: number): boolean
  style?: Tag | readonly Tag[] | {[selector: string]: Tag | readonly Tag[]}
}

export interface InlineParser {
  name: string
  parse(cx: InlineContext, next: number, pos: number): number
  before?: string
  after?: string
}

export interface BlockParser {
  name: string
  parse?(cx: BlockContext, line: Line): BlockResult
  leaf?(cx: BlockContext, leaf: LeafBlock): LeafBlockParser | null
  endLeaf?(cx: BlockContext, line: Line, leaf: LeafBlock): boolean
  before?: string
  after?: string
}

export interface TiddlyWikiConfig {
  props?: readonly NodePropSource[]
  defineNodes?: readonly (string | NodeSpec)[]
  parseBlock?: readonly BlockParser[]
  parseInline?: readonly InlineParser[]
  remove?: readonly string[]
  wrap?: ParseWrapper
}

export type TiddlyWikiExtension = TiddlyWikiConfig | readonly TiddlyWikiExtension[]

// ============================================================================
// Main Parser Class
// ============================================================================

export class TiddlyWikiParser extends Parser {
  nodeTypes: {[name: string]: number} = Object.create(null)

  constructor(
    readonly nodeSet: NodeSet,
    readonly blockParsers: readonly (((cx: BlockContext, line: Line) => BlockResult) | undefined)[],
    readonly leafBlockParsers: readonly (((cx: BlockContext, leaf: LeafBlock) => LeafBlockParser | null) | undefined)[],
    readonly blockNames: readonly string[],
    readonly endLeafBlock: readonly ((cx: BlockContext, line: Line, leaf: LeafBlock) => boolean)[],
    readonly skipContextMarkup: {readonly [type: number]: (bl: CompositeBlock, cx: BlockContext, line: Line) => boolean},
    readonly inlineParsers: readonly (((cx: InlineContext, next: number, pos: number) => number) | undefined)[],
    readonly inlineNames: readonly string[],
    readonly wrappers: readonly ParseWrapper[]
  ) {
    super()
    for (let t of nodeSet.types) this.nodeTypes[t.name] = t.id
  }

  createParse(input: Input, fragments: readonly TreeFragment[], ranges: readonly {from: number, to: number}[]): PartialParse {
    let parse: PartialParse = new BlockContext(this, input, fragments, ranges)
    for (let w of this.wrappers) parse = w(parse, input, fragments, ranges)
    return parse
  }

  configure(spec: TiddlyWikiExtension) {
    let config = resolveConfig(spec)
    if (!config) return this
    let {nodeSet, skipContextMarkup} = this
    let blockParsers = this.blockParsers.slice(), leafBlockParsers = this.leafBlockParsers.slice(),
        blockNames = this.blockNames.slice(), inlineParsers = this.inlineParsers.slice(),
        inlineNames = this.inlineNames.slice(), endLeafBlock = this.endLeafBlock.slice(),
        wrappers = this.wrappers

    if (nonEmpty(config.defineNodes)) {
      skipContextMarkup = Object.assign({}, skipContextMarkup)
      let nodeTypes = nodeSet.types.slice(), styles: {[selector: string]: Tag | readonly Tag[]} | undefined
      for (let s of config.defineNodes) {
        let {name, block, composite, style} = typeof s == "string" ? {name: s} as NodeSpec : s
        if (nodeTypes.some(t => t.name == name)) continue
        if (composite) (skipContextMarkup as any)[nodeTypes.length] =
          (bl: CompositeBlock, cx: BlockContext, line: Line) => composite!(cx, line, bl.value)
        let id = nodeTypes.length
        let group = composite ? ["Block", "BlockContext"] : !block ? undefined
          : id >= Type.Heading1 && id <= Type.Heading6 ? ["Block", "LeafBlock", "Heading"] : ["Block", "LeafBlock"]
        nodeTypes.push(NodeType.define({
          id,
          name,
          props: group && [[NodeProp.group, group]]
        }))
        if (style) {
          if (!styles) styles = {}
          if (Array.isArray(style) || style instanceof Tag) styles[name] = style
          else Object.assign(styles, style)
        }
      }
      nodeSet = new NodeSet(nodeTypes)
      if (styles) nodeSet = nodeSet.extend(styleTags(styles))
    }

    if (nonEmpty(config.props)) nodeSet = nodeSet.extend(...config.props)

    if (nonEmpty(config.remove)) {
      for (let rm of config.remove) {
        let block = this.blockNames.indexOf(rm), inline = this.inlineNames.indexOf(rm)
        if (block > -1) blockParsers[block] = leafBlockParsers[block] = undefined
        if (inline > -1) inlineParsers[inline] = undefined
      }
    }

    if (nonEmpty(config.parseBlock)) {
      for (let spec of config.parseBlock) {
        let found = blockNames.indexOf(spec.name)
        if (found > -1) {
          blockParsers[found] = spec.parse
          leafBlockParsers[found] = spec.leaf
        } else {
          let pos = spec.before ? findName(blockNames, spec.before)
            : spec.after ? findName(blockNames, spec.after) + 1 : blockNames.length - 1
          blockParsers.splice(pos, 0, spec.parse)
          leafBlockParsers.splice(pos, 0, spec.leaf)
          blockNames.splice(pos, 0, spec.name)
        }
        if (spec.endLeaf) endLeafBlock.push(spec.endLeaf)
      }
    }

    if (nonEmpty(config.parseInline)) {
      for (let spec of config.parseInline) {
        let found = inlineNames.indexOf(spec.name)
        if (found > -1) {
          inlineParsers[found] = spec.parse
        } else {
          let pos = spec.before ? findName(inlineNames, spec.before)
            : spec.after ? findName(inlineNames, spec.after) + 1 : inlineNames.length - 1
          inlineParsers.splice(pos, 0, spec.parse)
          inlineNames.splice(pos, 0, spec.name)
        }
      }
    }

    if (config.wrap) wrappers = wrappers.concat(config.wrap)

    return new TiddlyWikiParser(nodeSet,
                                blockParsers, leafBlockParsers, blockNames,
                                endLeafBlock, skipContextMarkup,
                                inlineParsers, inlineNames, wrappers)
  }

  getNodeType(name: string) {
    let found = this.nodeTypes[name]
    if (found == null) throw new RangeError(`Unknown node type '${name}'`)
    return found
  }

  parseInline(text: string, offset: number) {
    let cx = new InlineContext(this, text, offset)
    outer: for (let pos = offset; pos < cx.end;) {
      let next = cx.char(pos)
      for (let token of this.inlineParsers) if (token) {
        let result = token(cx, next, pos)
        if (result >= 0) { pos = result; continue outer }
      }
      pos++
    }
    return cx.resolveMarkers(0)
  }
}

// ============================================================================
// Helper Functions for Configuration
// ============================================================================

function nonEmpty<T>(a: undefined | readonly T[]): a is readonly T[] {
  return a != null && a.length > 0
}

function resolveConfig(spec: TiddlyWikiExtension): TiddlyWikiConfig | null {
  if (!Array.isArray(spec)) return spec as TiddlyWikiConfig
  if (spec.length == 0) return null
  let conf = resolveConfig(spec[0])
  if (spec.length == 1) return conf
  let rest = resolveConfig(spec.slice(1))
  if (!rest || !conf) return conf || rest
  let conc: <T>(a: readonly T[] | undefined, b: readonly T[] | undefined) => readonly T[] =
    (a, b) => (a || none).concat(b || none)
  let wrapA = conf.wrap, wrapB = rest.wrap
  return {
    props: conc(conf.props, rest.props),
    defineNodes: conc(conf.defineNodes, rest.defineNodes),
    parseBlock: conc(conf.parseBlock, rest.parseBlock),
    parseInline: conc(conf.parseInline, rest.parseInline),
    remove: conc(conf.remove, rest.remove),
    wrap: !wrapA ? wrapB : !wrapA ? wrapA :
      (inner, input, fragments, ranges) => wrapA!(wrapB!(inner, input, fragments, ranges), input, fragments, ranges)
  }
}

function findName(names: readonly string[], name: string) {
  let found = names.indexOf(name)
  if (found < 0) throw new RangeError(`Position specified relative to unknown parser ${name}`)
  return found
}

// ============================================================================
// Node Type Definitions
// ============================================================================

let nodeTypes = [NodeType.none]
for (let i = 1, name; name = Type[i]; i++) {
  nodeTypes[i] = NodeType.define({
    id: i,
    name,
    props: i >= Type.Escape ? [] : [[NodeProp.group, i in DefaultSkipMarkup ? ["Block", "BlockContext"] : ["Block", "LeafBlock"]]],
    top: name == "Document"
  })
}

// ============================================================================
// Syntax Highlighting
// ============================================================================

const tiddlywikiHighlighting = styleTags({
  "BlockQuote/...": t.quote,
  HorizontalRule: t.contentSeparator,
  "Heading1/...": t.heading1,
  "Heading2/...": t.heading2,
  "Heading3/...": t.heading3,
  "Heading4/...": t.heading4,
  "Heading5/...": t.heading5,
  "Heading6/...": t.heading6,
  "CommentBlock Comment": t.comment,
  Escape: t.escape,
  Entity: t.character,
  "Bold/...": t.strong,
  "Italic/...": t.emphasis,
  "Underline/...": t.special(t.emphasis),
  "Strikethrough/...": t.strikethrough,
  "Superscript/...": t.special(t.content),
  "Subscript/...": t.special(t.content),
  "Highlight/...": t.special(t.content),
  "WikiLink/... ExternalLink/... ImageLink/...": t.link,
  "Transclusion/... FilteredTransclusion/...": t.special(t.link),
  "MacroCall/...": t.macroName,
  "Widget/...": t.tagName,
  Variable: t.variableName,
  "BulletList/... NumberedList/... DefinitionList/...": t.list,
  "InlineCode CodeText": t.monospace,
  "FencedCode/... CodeBlock/... TypedBlock/...": t.monospace,
  "URL LinkTarget": t.url,
  "HeadingMark QuoteMark ListMark LinkMark EmphasisMark CodeMark PragmaMark TypedBlockMark TableDelimiter": t.processingInstruction,
  "CodeInfo TypedBlockInfo PragmaName MacroName WidgetName": t.labelName,
  "LinkText": t.string,
  "FilterExpression": t.special(t.string),
  "MacroParams PragmaParams WidgetAttr": t.attributeValue,
  Paragraph: t.content,
  "Table/...": t.content,
  "TableHeader/...": t.heading,
  "MacroDefinition/... ProcedureDefinition/... FunctionDefinition/... WidgetDefinition/...": t.definitionKeyword,
  "RulesPragma ImportPragma ParametersPragma WhitespacePragma": t.keyword,
  HTMLBlock: t.content,
  HTMLTag: t.tagName
})

// ============================================================================
// Default Parser Export
// ============================================================================

export const parser = new TiddlyWikiParser(
  new NodeSet(nodeTypes).extend(tiddlywikiHighlighting),
  Object.keys(DefaultBlockParsers).map(n => DefaultBlockParsers[n]),
  Object.keys(DefaultBlockParsers).map(n => DefaultLeafBlocks[n]),
  Object.keys(DefaultBlockParsers),
  DefaultEndLeaf,
  DefaultSkipMarkup,
  Object.keys(DefaultInline).map(n => DefaultInline[n]),
  Object.keys(DefaultInline),
  []
)
