import {
  Input,
  Parser,
  PartialParse,
  Tree,
  TreeFragment,
} from "@lezer/common"

import {tw5NodeSet, TW5Node} from "./tw5-nodes"

type Range = {from: number, to: number}

/**
 * TiddlyWiki5 wiki-text parser (hand-written, Lezer tree output).
 *
 * This is designed for CodeMirror 6 language support:
 * - Fast, robust highlighting-oriented parse tree
 * - Useful block structure (headings, lists, quote/code/table blocks, paragraphs)
 * - Inline structure for core TW5 constructs (links/macros/transclusions/filters)
 *
 * Notes:
 * - TW5 wikitext is context-sensitive; this parser targets editor correctness,
 *   not a full execution-grade TW renderer.
 * - Incrementality: CodeMirror can still do incremental editor updates without
 *   a fully incremental parser. This parser currently reparses the full
 *   document on changes; it keeps the interfaces ready for future fragment
 *   reuse.
 */

export class TW5Parser extends Parser {
  readonly nodeSet = tw5NodeSet

  // We currently ignore fragments/ranges and parse the whole document each time.
  // This is reliable and keeps complexity manageable; optimize later if needed.
  createParse(input: Input, _fragments: readonly TreeFragment[], ranges: readonly Range[]): PartialParse {
    return new TW5SingleParse(this, input, ranges)
  }
}

class TW5SingleParse implements PartialParse {
  private done = false
  private stoppedAt: number | null = null
  parsedPos = 0

  constructor(
    private parser: TW5Parser,
    private input: Input,
    private ranges: readonly Range[],
  ) {}

  stopAt(pos: number) {
    this.stoppedAt = pos
  }

  advance(): Tree | null {
    if (this.done) return null
    this.done = true

    const length = this.stoppedAt ?? this.input.length
    const tree = parseTW5(this.input, length, this.ranges)
    this.parsedPos = length
    return tree
  }
}

// ---- Tree building helpers -------------------------------------------------

class Writer {
  // Lezer Tree.build expects a flat buffer describing a tree.
  // Each node entry: [type, from, to, size] where size = 4 + children*4.
  content: number[] = []

  write(type: number, from: number, to: number, childCount: number) {
    this.content.push(type, from, to, 4 + childCount * 4)
  }

  finish(topID: number, length: number) {
    return Tree.build({
      buffer: this.content,
      nodeSet: tw5NodeSet,
      topID,
      length,
    })
  }
}

type FlatNode = {type: number, from: number, to: number, children?: FlatNode[]}

function emit(w: Writer, n: FlatNode) {
  const children = n.children ?? []
  w.write(n.type, n.from, n.to, children.length)
  for (const c of children) emit(w, c)
}

// ---- Line helpers ----------------------------------------------------------

type Line = {from: number, to: number, text: string}

function splitLines(text: string): Line[] {
  const out: Line[] = []
  let from = 0
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10 /* \n */) {
      const to = i === text.length ? i : i + 1
      out.push({from, to, text: text.slice(from, to)})
      from = to
    }
  }
  return out
}

function isBlankLine(line: Line) {
  return line.text.trim().length === 0
}

// ---- Actual parsing --------------------------------------------------------

function parseTW5(input: Input, length: number, _ranges: readonly Range[]): Tree {
  const text = input.read(0, length)
  const lines = splitLines(text)
  const nodes: FlatNode[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isBlankLine(line)) { i++; continue }

    // --- Code block: {{{ ... }}}
    if (/^\{\{\{\s*$/.test(line.text.trim())) {
      const from = line.from
      i++
      while (i < lines.length) {
        const l = lines[i]
        if (/^\}\}\}\s*$/.test(l.text.trim())) { i++; break }
        i++
      }
      const to = (i - 1 >= 0 ? lines[Math.min(i - 1, lines.length - 1)].to : line.to)
      nodes.push({type: TW5Node.CodeBlock, from, to})
      continue
    }

    // --- Quote block: <<< ... <<<
    if (/^<<<\s*$/.test(line.text.trim())) {
      const from = line.from
      i++
      while (i < lines.length) {
        const l = lines[i]
        if (/^<<<\s*$/.test(l.text.trim())) { i++; break }
        i++
      }
      const to = (i - 1 >= 0 ? lines[Math.min(i - 1, lines.length - 1)].to : line.to)
      nodes.push({type: TW5Node.QuoteBlock, from, to})
      continue
    }

    // --- Table: consecutive lines starting with |
    if (/^\|/.test(line.text)) {
      const tableFrom = line.from
      const rows: FlatNode[] = []
      while (i < lines.length && /^\|/.test(lines[i].text)) {
        rows.push(parseTableRow(lines[i]))
        i++
      }
      const tableTo = rows.length ? rows[rows.length - 1].to : line.to
      nodes.push({type: TW5Node.Table, from: tableFrom, to: tableTo, children: rows})
      continue
    }

    // --- Heading: !..!!!!!! followed by whitespace
    const hm = /^(!{1,6})\s+/.exec(line.text)
    if (hm) {
      const markLen = hm[1].length
      const contentStart = line.from + hm[0].length
      const headingChildren: FlatNode[] = [
        {type: TW5Node.HeadingMark, from: line.from, to: line.from + markLen},
      ]
      const rest = line.text.slice(hm[0].length)
      headingChildren.push(...inlineNodes(contentStart, line.to, contentStart, line.to, rest))
      nodes.push({type: TW5Node.Heading, from: line.from, to: line.to, children: headingChildren})
      i++
      continue
    }

    // --- List: lines starting with one or more * or #
    if (/^([*#]+)\s+/.test(line.text)) {
      const {node, nextIndex} = parseList(lines, i)
      nodes.push(node)
      i = nextIndex
      continue
    }

    // --- Paragraph: consume until blank or a block opener
    const paraFrom = line.from
    let paraTo = line.to
    let paraText = line.text
    i++
    while (i < lines.length) {
      const l = lines[i]
      if (isBlankLine(l)) break
      if (/^\{\{\{\s*$/.test(l.text.trim())) break
      if (/^<<<\s*$/.test(l.text.trim())) break
      if (/^\|/.test(l.text)) break
      if (/^(!{1,6})\s+/.test(l.text)) break
      if (/^([*#]+)\s+/.test(l.text)) break
      paraTo = l.to
      paraText += l.text
      i++
    }

    nodes.push({
      type: TW5Node.Paragraph,
      from: paraFrom,
      to: paraTo,
      children: inlineNodes(paraFrom, paraTo, paraFrom, paraTo, paraText),
    })
  }

  const w = new Writer()
  w.write(TW5Node.Document, 0, length, nodes.length)
  for (const n of nodes) emit(w, n)
  return w.finish(TW5Node.Document, length)
}

// ---- Block parsers ---------------------------------------------------------

function parseList(lines: Line[], startIndex: number): {node: FlatNode, nextIndex: number} {
  const listFrom = lines[startIndex].from

  // Root list is the level of the first item.
  const first = /^([*#]+)\s+/.exec(lines[startIndex].text)!
  const rootLevel = first[1].length

  const root: FlatNode = {type: TW5Node.List, from: listFrom, to: lines[startIndex].to, children: []}
  type Frame = {level: number, list: FlatNode, lastItem: FlatNode | null}
  const stack: Frame[] = [{level: rootLevel, list: root, lastItem: null}]

  let i = startIndex
  while (i < lines.length) {
    const line = lines[i]
    const m = /^([*#]+)\s+/.exec(line.text)
    if (!m) break

    const level = m[1].length
    const markerLen = m[1].length
    const markerTo = line.from + markerLen
    const contentStart = line.from + m[0].length
    const content = line.text.slice(m[0].length)

    // Pop until we find the parent level (or root)
    while (stack.length && level < stack[stack.length - 1].level) stack.pop()
    if (!stack.length) stack.push({level: rootLevel, list: root, lastItem: null})

    // If deeper, create nested lists under the previous item
    while (level > stack[stack.length - 1].level) {
      const parent = stack[stack.length - 1]
      const attachTo = parent.lastItem
      if (!attachTo) break
      const nested: FlatNode = {type: TW5Node.List, from: line.from, to: line.to, children: []}
      attachTo.children = attachTo.children ?? []
      attachTo.children.push(nested)
      stack.push({level: parent.level + 1, list: nested, lastItem: null})
    }

    const cur = stack[stack.length - 1]
    const itemChildren: FlatNode[] = [
      {type: TW5Node.ListMark, from: line.from, to: markerTo},
      ...inlineNodes(contentStart, line.to, contentStart, line.to, content),
    ]
    const item: FlatNode = {type: TW5Node.ListItem, from: line.from, to: line.to, children: itemChildren}
    cur.list.children = cur.list.children ?? []
    cur.list.children.push(item)
    cur.lastItem = item
    root.to = line.to
    cur.list.to = line.to
    i++
  }

  return {node: root, nextIndex: i}
}

function parseTableRow(line: Line): FlatNode {
  const from = line.from
  const to = line.to
  const rowChildren: FlatNode[] = []

  const text = line.text
  // Split cells by |, keeping offsets. We treat the leading | as table start.
  let cellStart = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 124 /* | */) {
      if (i > cellStart) {
        // previous cell content is (cellStart..i)
        const cFrom = from + cellStart
        const cTo = from + i
        rowChildren.push({type: TW5Node.TableCell, from: cFrom, to: cTo})
      }
      cellStart = i + 1
    }
  }
  // last segment
  if (cellStart < text.length) {
    rowChildren.push({type: TW5Node.TableCell, from: from + cellStart, to})
  }

  return {type: TW5Node.TableRow, from, to, children: rowChildren}
}

// ---- Inline parser ---------------------------------------------------------

function inlineNodes(blockFrom: number, blockTo: number, base: number, _limitTo: number, content: string): FlatNode[] {
  const nodes: FlatNode[] = []
  let lastEnd = 0

  function pushText(from: number, to: number) {
    if (to > from) nodes.push({type: TW5Node.Text, from, to})
  }

  for (let i = 0; i < content.length; ) {
    // [[link]] or [[caption|target]]
    if (content.charCodeAt(i) === 91 && content.charCodeAt(i + 1) === 91) {
      const end = content.indexOf("]]", i + 2)
      if (end !== -1) {
        pushText(base + lastEnd, base + i)

        const inner = content.slice(i + 2, end)
        const pipe = inner.indexOf("|")
        const linkChildren: FlatNode[] = [
          {type: TW5Node.LinkMark, from: base + i, to: base + i + 2},
        ]
        if (pipe === -1) {
          const tFrom = base + i + 2
          const tTo = base + end
          linkChildren.push({type: TW5Node.LinkTarget, from: tFrom, to: tTo})
        } else {
          const textFrom = base + i + 2
          const textTo = base + i + 2 + pipe
          const sepFrom = textTo
          const sepTo = sepFrom + 1
          const targetFrom = sepTo
          const targetTo = base + end
          linkChildren.push({type: TW5Node.LinkText, from: textFrom, to: textTo})
          linkChildren.push({type: TW5Node.LinkSep, from: sepFrom, to: sepTo})
          linkChildren.push({type: TW5Node.LinkTarget, from: targetFrom, to: targetTo})
        }
        linkChildren.push({type: TW5Node.LinkMark, from: base + end, to: base + end + 2})

        nodes.push({type: TW5Node.TWLink, from: base + i, to: base + end + 2, children: linkChildren})
        i = end + 2
        lastEnd = i
        continue
      }
    }

    // <<macro ...>>
    if (content.charCodeAt(i) === 60 && content.charCodeAt(i + 1) === 60) {
      const end = content.indexOf(">>", i + 2)
      if (end !== -1) {
        pushText(base + lastEnd, base + i)

        const inner = content.slice(i + 2, end)
        const ws = inner.search(/\s/)
        const namePart = ws === -1 ? inner : inner.slice(0, ws)
        const paramsPart = ws === -1 ? "" : inner.slice(ws)

        const macroChildren: FlatNode[] = [
          {type: TW5Node.MacroMark, from: base + i, to: base + i + 2},
          {type: TW5Node.MacroName, from: base + i + 2, to: base + i + 2 + namePart.length},
        ]
        if (paramsPart.trim().length) {
          macroChildren.push({
            type: TW5Node.MacroParams,
            from: base + i + 2 + namePart.length,
            to: base + end,
          })
        }
        macroChildren.push({type: TW5Node.MacroMark, from: base + end, to: base + end + 2})

        nodes.push({type: TW5Node.TWMacro, from: base + i, to: base + end + 2, children: macroChildren})
        i = end + 2
        lastEnd = i
        continue
      }
    }

    // {{transclusion}}
    if (content.charCodeAt(i) === 123 && content.charCodeAt(i + 1) === 123) {
      const end = content.indexOf("}}", i + 2)
      if (end !== -1) {
        pushText(base + lastEnd, base + i)

        const transChildren: FlatNode[] = [
          {type: TW5Node.TransclusionMark, from: base + i, to: base + i + 2},
          {type: TW5Node.TransclusionTarget, from: base + i + 2, to: base + end},
          {type: TW5Node.TransclusionMark, from: base + end, to: base + end + 2},
        ]

        nodes.push({type: TW5Node.TWTransclusion, from: base + i, to: base + end + 2, children: transChildren})
        i = end + 2
        lastEnd = i
        continue
      }
    }

    // [filter[...]] - balanced brackets, single token node
    if (content.charCodeAt(i) === 91 /* [ */ && content.charCodeAt(i + 1) !== 91 /* not [[ */) {
      let depth = 0
      let j = i
      for (; j < content.length; j++) {
        const ch = content.charCodeAt(j)
        if (ch === 91) depth++
        else if (ch === 93) {
          depth--
          if (depth === 0) { j++; break }
        }
        if (ch === 10 /* newline */) break
      }
      if (depth === 0 && j > i + 1) {
        pushText(base + lastEnd, base + i)
        nodes.push({type: TW5Node.TWFilter, from: base + i, to: base + j})
        i = j
        lastEnd = i
        continue
      }
    }

    i++
  }

  pushText(base + lastEnd, base + content.length)

  // Clamp to block bounds to avoid weirdness on multi-line paragraphs.
  for (const n of nodes) {
    n.from = Math.max(n.from, blockFrom)
    n.to = Math.min(n.to, blockTo)
  }
  return nodes.filter(n => n.to > n.from)
}

export const tw5Parser = new TW5Parser()
