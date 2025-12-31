import {NodeSet, NodeType} from "@lezer/common"
import {styleTags, tags as t} from "@lezer/highlight"

/**
 * TW5 node IDs (kept stable within this package).
 *
 * This is a pragmatic tree for editor features + highlighting, not a full TW5 AST.
 */
export const enum TW5Node {
  Document = 0,

  // Blocks
  Heading,
  HeadingMark,
  List,
  ListItem,
  ListMark,
  QuoteBlock,
  CodeBlock,
  Table,
  TableRow,
  TableCell,
  Paragraph,

  // Inline / leaves
  Text,
  TWLink,
  LinkMark,
  LinkText,
  LinkSep,
  LinkTarget,

  TWMacro,
  MacroMark,
  MacroName,
  MacroParams,

  TWTransclusion,
  TransclusionMark,
  TransclusionTarget,

  TWFilter,
}

const types: NodeType[] = []

function def(name: string, id: TW5Node, props: any = {}) {
  types[id] = NodeType.define({id, name, props})
}

// --- blocks
def("Document", TW5Node.Document)
def("Heading", TW5Node.Heading, {isBlock: true})
def("HeadingMark", TW5Node.HeadingMark)
def("List", TW5Node.List, {isBlock: true})
def("ListItem", TW5Node.ListItem, {isBlock: true})
def("ListMark", TW5Node.ListMark)
def("QuoteBlock", TW5Node.QuoteBlock, {isBlock: true})
def("CodeBlock", TW5Node.CodeBlock, {isBlock: true})
def("Table", TW5Node.Table, {isBlock: true})
def("TableRow", TW5Node.TableRow, {isBlock: true})
def("TableCell", TW5Node.TableCell)
def("Paragraph", TW5Node.Paragraph, {isBlock: true})

// --- inline / leaves
def("Text", TW5Node.Text)

def("TWLink", TW5Node.TWLink)
def("LinkMark", TW5Node.LinkMark)
def("LinkText", TW5Node.LinkText)
def("LinkSep", TW5Node.LinkSep)
def("LinkTarget", TW5Node.LinkTarget)

def("TWMacro", TW5Node.TWMacro)
def("MacroMark", TW5Node.MacroMark)
def("MacroName", TW5Node.MacroName)
def("MacroParams", TW5Node.MacroParams)

def("TWTransclusion", TW5Node.TWTransclusion)
def("TransclusionMark", TW5Node.TransclusionMark)
def("TransclusionTarget", TW5Node.TransclusionTarget)

def("TWFilter", TW5Node.TWFilter)

export const tw5NodeSet = new NodeSet(types)

export const tw5Highlighting = styleTags({
  Heading: t.heading,
  HeadingMark: t.processingInstruction,

  ListItem: t.list,
  ListMark: t.processingInstruction,

  QuoteBlock: t.quote,
  CodeBlock: t.monospace,

  Table: t.content,
  TableRow: t.content,
  TableCell: t.content,

  Paragraph: t.content,
  Text: t.content,

  TWLink: t.link,
  LinkMark: t.punctuation,
  LinkText: t.string,
  LinkSep: t.punctuation,
  LinkTarget: t.url,

  TWMacro: t.keyword,
  MacroMark: t.punctuation,
  MacroName: t.macroName ?? t.keyword,
  MacroParams: t.special(t.string),

  TWTransclusion: t.special(t.string),
  TransclusionMark: t.punctuation,
  TransclusionTarget: t.string,

  TWFilter: t.regexp,
})
