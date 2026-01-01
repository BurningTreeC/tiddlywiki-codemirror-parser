/**
 * TiddlyWiki Language Support - Core Language Definition
 *
 * Creates the TiddlyWiki Language for CodeMirror 6, similar to how
 * lang-markdown creates the Markdown language.
 */

import {
  Language, defineLanguageFacet, languageDataProp, foldNodeProp,
  indentNodeProp, foldService, syntaxTree, LanguageDescription, ParseContext
} from "@codemirror/language"
import { SyntaxNode, NodeType, NodeProp } from "@lezer/common"
import { TiddlyWikiParser, parser as baseParser } from "./parser"
import { Type } from "./types"

/**
 * Language facet with TiddlyWiki-specific data
 */
const data = defineLanguageFacet({
  commentTokens: {
    block: { open: "<!--", close: "-->" },
  }
})

/**
 * Node prop for heading levels
 */
const headingProp = new NodeProp<number>()

/**
 * Check if a node type is a heading and return its level
 */
function isHeading(type: NodeType): number | undefined {
  const match = /^Heading(\d)$/.exec(type.name)
  return match ? +match[1] : undefined
}

/**
 * Check if a node type is a list
 */
function isList(type: NodeType): boolean {
  return type.name === "BulletList" || type.name === "OrderedList" || type.name === "DefinitionList"
}

/**
 * Check if a node type is a block element
 */
function isBlock(type: NodeType): boolean {
  // Check common block types
  return /^(Paragraph|Heading\d|BulletList|OrderedList|DefinitionList|BlockQuote|Table|FencedCode|TypedBlock|Widget|HTMLBlock|TransclusionBlock|FilteredTransclusionBlock|MacroCallBlock|CommentBlock|HorizontalRule)$/.test(type.name)
}

/**
 * Configure the base parser with CodeMirror-specific props
 * NOTE: languageDataProp is NOT configured here because it must use
 * the same instance at runtime as the one used for lookups.
 * It's configured in mkLang() instead.
 */
const configured = baseParser.configure({
  props: [
    // Folding support
    foldNodeProp.add(type => {
      // Don't fold document, headings (they use section folding), or lists
      if (!isBlock(type) || type.name === "Document" || isHeading(type) != null || isList(type)) {
        return undefined
      }
      // Fold from end of first line to end of block
      return (tree, state) => ({
        from: state.doc.lineAt(tree.from).to,
        to: tree.to
      })
    }),

    // Add heading level prop
    headingProp.add(isHeading),

    // Indentation
    indentNodeProp.add({
      Document: () => null
    })

    // NOTE: languageDataProp is added at runtime in mkLang()
  ]
})

/**
 * Find the end of a section (for heading folding)
 */
function findSectionEnd(headerNode: SyntaxNode, level: number): number {
  let last = headerNode
  for (;;) {
    const next = last.nextSibling
    if (!next) break
    const heading = isHeading(next.type)
    if (heading != null && heading <= level) break
    last = next
  }
  return last.to
}

/**
 * Fold service for heading sections
 * Allows folding from a heading to the next heading of same or higher level
 */
export const headerIndent = foldService.of((state, start, end) => {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(end, -1); node; node = node.parent) {
    if (node.from < start) break
    const heading = node.type.prop(headingProp)
    if (heading == null) continue
    const upto = findSectionEnd(node, heading)
    if (upto > end) return { from: end, to: upto }
  }
  return null
})

/**
 * Create a Language from a TiddlyWiki parser
 * Configures languageDataProp at runtime to ensure the same instance
 * is used for both configuration and lookups.
 */
export function mkLang(parser: TiddlyWikiParser): Language {
  // Configure languageDataProp at runtime
  const configuredParser = parser.configure({
    props: [
      languageDataProp.add({
        Document: data
      })
    ]
  })
  return new Language(data, configuredParser, [], "tiddlywiki")
}

/**
 * The base TiddlyWiki language (without extensions)
 */
export const tiddlywikiLanguage = mkLang(configured)

/**
 * Get a code parser for nested code blocks
 */
export function getCodeParser(
  languages: readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null) | undefined,
  defaultLanguage?: Language
) {
  return (info: string) => {
    if (info && languages) {
      let found = null
      // Strip anything after whitespace
      info = /\S*/.exec(info)![0]
      if (typeof languages === "function") {
        found = languages(info)
      } else {
        found = LanguageDescription.matchLanguageName(languages, info, true)
      }
      if (found instanceof LanguageDescription) {
        return found.support ? found.support.language.parser : ParseContext.getSkippingParser(found.load())
      } else if (found) {
        return found.parser
      }
    }
    return defaultLanguage ? defaultLanguage.parser : null
  }
}
