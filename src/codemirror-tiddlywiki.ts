/**
 * @codemirror/lang-tiddlywiki - Markdown-style Integration
 * 
 * CodeMirror 6 Language Support für TiddlyWiki5 Wikitext.
 */

import {Language, defineLanguageFacet, languageDataProp, foldNodeProp, indentNodeProp, foldService,
        syntaxTree, LanguageDescription, ParseContext} from "@codemirror/language"
import {parser as baseParser, TiddlyWikiParser, TiddlyWikiExtensions, Type} from "./index"
import {SyntaxNode, NodeType, NodeProp} from "@lezer/common"

// ============================================================================
// Language Facet Configuration
// ============================================================================

const data = defineLanguageFacet({
  commentTokens: {block: {open: "<!--", close: "-->"}},
  // TiddlyWiki uses HTML-style comments
})

const headingProp = new NodeProp<number>()

// ============================================================================
// Base Parser Configuration
// ============================================================================

const tiddlywikiBase = baseParser.configure({
  props: [
    // Folding für verschiedene Block-Typen
    foldNodeProp.add(type => {
      if (!type.is("Block") || type.is("Document")) return undefined
      let heading = isHeading(type)
      if (heading != null) return undefined // Headings get special handling
      if (isList(type)) return undefined
      // Default folding für andere Blocks
      return (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to})
    }),
    
    headingProp.add(isHeading),
    
    indentNodeProp.add({
      Document: () => null
    }),
    
    languageDataProp.add({
      Document: data
    })
  ]
})

// ============================================================================
// Helper Functions
// ============================================================================

function isHeading(type: NodeType): number | undefined {
  let match = /^Heading(\d)$/.exec(type.name)
  return match ? +match[1] : undefined
}

function isList(type: NodeType): boolean {
  return type.name == "BulletList" || type.name == "NumberedList" || type.name == "DefinitionList"
}

function findSectionEnd(headerNode: SyntaxNode, level: number): number {
  let last = headerNode
  for (;;) {
    let next = last.nextSibling
    if (!next) break
    let heading = next.type.prop(headingProp)
    if (heading != null && heading <= level) break
    last = next
  }
  return last.to
}

// ============================================================================
// Heading Folding Service
// ============================================================================

export const headerIndent = foldService.of((state, start, end) => {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(end, -1); node; node = node.parent) {
    if (node.from < start) break
    let heading = node.type.prop(headingProp)
    if (heading == null) continue
    let upto = findSectionEnd(node, heading)
    if (upto > end) return {from: end, to: upto}
  }
  return null
})

// ============================================================================
// Language Creation
// ============================================================================

export function mkLang(parser: TiddlyWikiParser): Language {
  return new Language(data, parser, [], "tiddlywiki")
}

/// Language support für CommonMark-style TiddlyWiki (Basis-Syntax)
export const tiddlywikiBaseLanguage = mkLang(tiddlywikiBase)

// Extended parser mit allen Erweiterungen
const extended = tiddlywikiBase.configure([
  ...TiddlyWikiExtensions,
  {
    props: [
      foldNodeProp.add({
        Table: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to}),
        FencedCode: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to}),
        BlockQuote: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to}),
        MacroDefinition: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to}),
        ProcedureDefinition: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to}),
        FunctionDefinition: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to}),
        WidgetDefinition: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to}),
        TypedBlock: (tree, state) => ({from: state.doc.lineAt(tree.from).to, to: tree.to})
      })
    ]
  }
])

/// Language support für TiddlyWiki5 mit allen Erweiterungen
export const tiddlywikiLanguage = mkLang(extended)

// ============================================================================
// Code Parser Integration
// ============================================================================

export function getCodeParser(
  languages: readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null) | undefined,
  defaultLanguage?: Language
) {
  return (info: string) => {
    if (info && languages) {
      let found = null
      // Strip anything after whitespace
      info = /\S*/.exec(info)![0]
      if (typeof languages == "function") found = languages(info)
      else found = LanguageDescription.matchLanguageName(languages, info, true)
      if (found instanceof LanguageDescription)
        return found.support ? found.support.language.parser : ParseContext.getSkippingParser(found.load())
      else if (found)
        return found.parser
    }
    return defaultLanguage ? defaultLanguage.parser : null
  }
}
