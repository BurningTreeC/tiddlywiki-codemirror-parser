/**
 * TiddlyWiki Language Support - Core Language Definition
 *
 * Creates the TiddlyWiki Language for CodeMirror 6, similar to how
 * lang-markdown creates the Markdown language.
 */

import {
  Language, defineLanguageFacet, languageDataProp, foldNodeProp,
  indentNodeProp, foldService, syntaxTree, LanguageDescription, ParseContext,
  TreeIndentContext, getIndentUnit
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
 * Check if a node type is a block element that can be folded
 */
function isBlock(type: NodeType): boolean {
  // Check common block types - includes all foldable TiddlyWiki elements
  return /^(Paragraph|Heading\d|BulletList|OrderedList|DefinitionList|BlockQuote|Table|FencedCode|TypedBlock|Widget|HTMLBlock|TransclusionBlock|FilteredTransclusionBlock|MacroCallBlock|CommentBlock|HorizontalRule|ConditionalBlock|MacroDefinition|ProcedureDefinition|FunctionDefinition|WidgetDefinition|StyledBlock)$/.test(type.name)
}

/**
 * Check if a node type is a container that should indent its contents
 */
function isIndentingContainer(name: string): boolean {
  return /^(Widget|HTMLBlock|ConditionalBlock|ConditionalBranch|BlockQuote|MacroDefinition|ProcedureDefinition|FunctionDefinition|WidgetDefinition)$/.test(name)
}

/**
 * Get the base indentation of a line
 */
function getLineIndent(context: TreeIndentContext, pos: number): number {
  const line = context.state.doc.lineAt(pos)
  let indent = 0
  for (let i = 0; i < line.text.length; i++) {
    const ch = line.text.charCodeAt(i)
    if (ch === 32) indent++ // space
    else if (ch === 9) indent += context.unit // tab
    else break
  }
  return indent
}

// Debug flag - set to true to enable logging
const DEBUG_INDENT = false

/**
 * Calculate indentation for container nodes
 */
function containerIndent(context: TreeIndentContext): number | null {
  // Get the node at the current position
  const node = context.node

  if (DEBUG_INDENT) {
    console.log(`containerIndent called for ${node.name} [${node.from}-${node.to}] at pos ${context.pos}`)
  }

  // Find the opening line of this container
  const openLine = context.state.doc.lineAt(node.from)
  const closeLine = context.state.doc.lineAt(node.to)
  const baseIndent = getLineIndent(context, node.from)

  if (DEBUG_INDENT) {
    console.log(`  openLine: ${openLine.number}, closeLine: ${closeLine.number}, baseIndent: ${baseIndent}`)
  }

  // If node spans only a single line, check if it's an opening container that should indent
  // ConditionalBlock, Widget, HTMLBlock should still indent even when incomplete
  if (openLine.number === closeLine.number) {
    // Single-line pragma definitions (with body on same line) don't indent
    // But multi-line pragma openers (no body, just declaration) should indent
    if (isPragmaDefinition(node.name)) {
      const lineText = openLine.text.trim()
      // Check if it's a multi-line opener (ends with closing paren, no body content)
      if (/^\\(?:define|procedure|function|widget)\s+\S+\s*\([^)]*\)\s*$/.test(lineText)) {
        // Multi-line pragma opener - indent body
        if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (multi-line pragma opener)`)
        return baseIndent + context.unit
      }
      // Single-line pragma with body - no indent change
      if (DEBUG_INDENT) console.log(`  -> ${baseIndent} (single line pragma, no indent)`)
      return baseIndent
    }
    // Allow indentation for opening tags that expect content
    const openingContainers = /^(ConditionalBlock|Widget|HTMLBlock)$/
    if (!openingContainers.test(node.name)) {
      if (DEBUG_INDENT) console.log(`  -> null (single line, not opening container)`)
      return null
    }
  }

  // Check if cursor is on the same line as opening tag
  const cursorLine = context.state.doc.lineAt(context.pos)
  if (DEBUG_INDENT) {
    console.log(`  cursorLine: ${cursorLine.number}`)
  }
  if (cursorLine.number === openLine.number) {
    const lineText = cursorLine.text
    // Check if cursor is at end of line (after %> or closing tag)
    const atLineEnd = context.pos >= cursorLine.from + lineText.trimEnd().length

    if (atLineEnd) {
      // Check for multi-line pragma opener (ends with closing paren, no body)
      if (/^\s*\\(?:define|procedure|function|widget)\s+\S+\s*\([^)]*\)\s*$/.test(lineText)) {
        if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (cursor after pragma opener)`)
        return baseIndent + context.unit
      }
      // Check for <%if%>, <%elseif%>, <%else%> openers - indent content
      if (/<%\s*(if|elseif)\s+.+%>\s*$/.test(lineText) || /<%\s*else\s*%>\s*$/.test(lineText)) {
        if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (cursor after conditional opener)`)
        return baseIndent + context.unit
      }
      // Check for <%endif%> - stay at same indent
      if (/<%\s*endif\s*%>\s*$/.test(lineText)) {
        if (DEBUG_INDENT) console.log(`  -> ${baseIndent} (cursor after endif)`)
        return baseIndent
      }
      // Check for opening widget/HTML tag - indent content
      // But NOT self-closing tags (ending with />)
      if (/<[$a-zA-Z][^>]*>\s*$/.test(lineText) && !/<\//.test(lineText) && !/\/>\s*$/.test(lineText)) {
        if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (cursor after opening tag)`)
        return baseIndent + context.unit
      }
      // Check for self-closing tags - stay at same indent
      if (/\/>\s*$/.test(lineText)) {
        if (DEBUG_INDENT) console.log(`  -> ${baseIndent} (cursor after self-closing tag)`)
        return baseIndent
      }
      // Check for closing widget/HTML tag - stay at same indent
      if (/<\/[$a-zA-Z][^>]*>\s*$/.test(lineText)) {
        if (DEBUG_INDENT) console.log(`  -> ${baseIndent} (cursor after closing tag)`)
        return baseIndent
      }
    }
    if (DEBUG_INDENT) console.log(`  -> null (cursor on opening line, default)`)
    return null // Let default behavior handle it
  }

  // Check if previous line is a branch opener (<%if%>, <%else%>, <%elseif%>)
  if (cursorLine.number > 1) {
    const prevLine = context.state.doc.line(cursorLine.number - 1)
    const prevText = prevLine.text.trim()
    if (DEBUG_INDENT) {
      console.log(`  prevLine text: "${prevText}"`)
      console.log(`  if/elseif regex: ${/<%\s*(if|elseif)\s+.+%>\s*$/.test(prevText)}`)
      console.log(`  else regex: ${/<%\s*else\s*%>\s*$/.test(prevText)}`)
    }
    if (/<%\s*(if|elseif)\s+.+%>\s*$/.test(prevText) || /<%\s*else\s*%>\s*$/.test(prevText)) {
      if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (prev line is opener)`)
      return baseIndent + context.unit
    }
  }

  // Check if this is a pure closing line (<%endif%> or closing tags)
  const lineText = cursorLine.text.trim()
  if (/^<\/[$a-zA-Z]|^<%\s*endif\s*%>|^\\end(?:\s|$)/.test(lineText)) {
    if (DEBUG_INDENT) console.log(`  -> ${baseIndent} (closing line)`)
    return baseIndent // Same indent as opening
  }

  // Check if this is a branch opener line (<%else%> or <%elseif%>) - these outdent but their content indents
  if (/^<%\s*(else|elseif)\s/.test(lineText) || /^<%\s*else\s*%>/.test(lineText)) {
    if (DEBUG_INDENT) console.log(`  -> ${baseIndent} (branch opener line)`)
    return baseIndent // The line itself is at base indent
  }

  // Multi-line pragma definitions indent their body content by one level
  // \end will outdent back to baseIndent (handled above in closing line check)
  if (isPragmaDefinition(node.name)) {
    if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (pragma body - indent)`)
    return baseIndent + context.unit
  }

  // Content inside other containers: indent one level
  if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (content inside)`)
  return baseIndent + context.unit
}

/**
 * Configure the base parser with CodeMirror-specific props
 * NOTE: languageDataProp is NOT configured here because it must use
 * the same instance at runtime as the one used for lookups.
 * It's configured in mkLang() instead.
 */
/**
 * Check if a node type is a pragma definition (macro, procedure, function, widget)
 */
function isPragmaDefinition(name: string): boolean {
  return /^(MacroDefinition|ProcedureDefinition|FunctionDefinition|WidgetDefinition)$/.test(name)
}

const configured = baseParser.configure({
  props: [
    // Folding support for TiddlyWiki5 syntax
    foldNodeProp.add(type => {
      // Don't fold document, headings (they use section folding via headerIndent), or lists
      if (!isBlock(type) || type.name === "Document" || isHeading(type) != null || isList(type)) {
        return undefined
      }

      // Paragraph - don't fold single paragraphs
      if (type.name === "Paragraph") {
        return undefined
      }

      // Pragma definitions (\define, \procedure, \function, \widget)
      // Fold from end of first line to before \end
      if (isPragmaDefinition(type.name)) {
        return (tree, state) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Find PragmaEnd child to fold up to (but not including) it
          let endNode = tree.lastChild
          if (endNode && endNode.name === "PragmaEnd") {
            // Fold to start of \end line
            const endLine = state.doc.lineAt(endNode.from)
            return { from: firstLineEnd, to: endLine.from > firstLineEnd ? endLine.from - 1 : tree.to }
          }
          return { from: firstLineEnd, to: tree.to }
        }
      }

      // Widgets and HTML blocks - fold content between tags
      if (type.name === "Widget" || type.name === "HTMLBlock") {
        return (tree, state) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Find closing tag to fold up to (but not including) it
          const closeTag = type.name === "Widget" ? tree.getChild("WidgetEnd") : tree.getChild("HTMLEndTag")
          if (closeTag) {
            // Fold to start of closing tag line
            const closeLine = state.doc.lineAt(closeTag.from)
            if (closeLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: closeLine.from - 1 }
            }
          }
          return { from: firstLineEnd, to: tree.to }
        }
      }

      // Conditional blocks (<%if%>...<%endif%>)
      if (type.name === "ConditionalBlock") {
        return (tree, state) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Find the last ConditionalMark (<%endif%>) to fold up to
          let lastMark = tree.lastChild
          while (lastMark && lastMark.name !== "ConditionalMark") {
            lastMark = lastMark.prevSibling
          }
          if (lastMark) {
            const endLine = state.doc.lineAt(lastMark.from)
            if (endLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: endLine.from - 1 }
            }
          }
          return { from: firstLineEnd, to: tree.to }
        }
      }

      // Block quotes - fold from opening <<< to closing <<<
      if (type.name === "BlockQuote") {
        return (tree, state) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Find closing QuoteMark
          let lastQuote = tree.lastChild
          while (lastQuote && lastQuote.name !== "QuoteMark") {
            lastQuote = lastQuote.prevSibling
          }
          if (lastQuote && lastQuote.from > tree.from) {
            const closeLine = state.doc.lineAt(lastQuote.from)
            if (closeLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: closeLine.from - 1 }
            }
          }
          return { from: firstLineEnd, to: tree.to }
        }
      }

      // Fenced code blocks - fold from ``` to closing ```
      if (type.name === "FencedCode") {
        return (tree, state) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Find closing CodeMark
          let closeMark = tree.lastChild
          while (closeMark && closeMark.name !== "CodeMark") {
            closeMark = closeMark.prevSibling
          }
          if (closeMark && closeMark.from > tree.from) {
            const closeLine = state.doc.lineAt(closeMark.from)
            if (closeLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: closeLine.from - 1 }
            }
          }
          return { from: firstLineEnd, to: tree.to }
        }
      }

      // Typed blocks ($$$) - fold from $$$ to closing $$$
      if (type.name === "TypedBlock") {
        return (tree, state) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Find closing TypedBlockMark
          let closeMark = tree.lastChild
          while (closeMark && closeMark.name !== "TypedBlockMark") {
            closeMark = closeMark.prevSibling
          }
          if (closeMark && closeMark.from > tree.from) {
            const closeLine = state.doc.lineAt(closeMark.from)
            if (closeLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: closeLine.from - 1 }
            }
          }
          return { from: firstLineEnd, to: tree.to }
        }
      }

      // Tables - fold from header row to end
      if (type.name === "Table") {
        return (tree, state) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // For tables, we want to keep at least the header visible
          // Fold from after first row to end of table
          const header = tree.getChild("TableHeader") || tree.getChild("TableRow")
          if (header) {
            const headerEnd = state.doc.lineAt(header.to).to
            if (headerEnd < tree.to) {
              return { from: headerEnd, to: tree.to }
            }
          }
          return { from: firstLineEnd, to: tree.to }
        }
      }

      // Default: fold from end of first line to end of block
      // This handles: TransclusionBlock, FilteredTransclusionBlock, MacroCallBlock,
      // CommentBlock, StyledBlock, etc.
      return (tree, state) => ({
        from: state.doc.lineAt(tree.from).to,
        to: tree.to
      })
    }),

    // Add heading level prop
    headingProp.add(isHeading),

    // Indentation for container nodes
    indentNodeProp.add({
      Document: (context: TreeIndentContext) => {
        // Get the current line and check the previous line for openers
        const cursorLine = context.state.doc.lineAt(context.pos)

        // If we're not on the first line, check if previous line is an opener
        if (cursorLine.number > 1) {
          const prevLine = context.state.doc.line(cursorLine.number - 1)
          const prevLineText = prevLine.text

          if (DEBUG_INDENT) {
            console.log(`Document indent: prevLine = "${prevLineText}"`)
          }

          // Check for multi-line pragma opener: \define foo(), \procedure bar(), etc.
          // These end with just ) and no body on the same line
          if (/^\s*\\(?:define|procedure|function|widget)\s+\S+\s*\([^)]*\)\s*$/.test(prevLineText)) {
            const baseIndent = getLineIndent(context, prevLine.from)
            if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (prev line is pragma opener)`)
            return baseIndent + context.unit
          }

          // Check for conditional opener: <%if%>, <%elseif%>, <%else%>
          if (/<%\s*(if|elseif)\s+.+%>\s*$/.test(prevLineText) || /<%\s*else\s*%>\s*$/.test(prevLineText)) {
            const baseIndent = getLineIndent(context, prevLine.from)
            if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (prev line is conditional opener)`)
            return baseIndent + context.unit
          }

          // Check for widget/HTML opening tags: <$widget> or <div>
          // But NOT self-closing tags (ending with />)
          if (/<[$a-zA-Z][^>]*>\s*$/.test(prevLineText) && !/<\//.test(prevLineText) && !/\/>\s*$/.test(prevLineText)) {
            const baseIndent = getLineIndent(context, prevLine.from)
            if (DEBUG_INDENT) console.log(`  -> ${baseIndent + context.unit} (prev line is opening tag)`)
            return baseIndent + context.unit
          }

          // Check for \end on previous line - stay at same indent as \end
          if (/^\s*\\end(?:\s|$)/.test(prevLineText)) {
            const endLineIndent = getLineIndent(context, prevLine.from)
            if (DEBUG_INDENT) console.log(`  -> ${endLineIndent} (prev line is \\end)`)
            return endLineIndent
          }
        }

        return null
      },
      Widget: containerIndent,
      HTMLBlock: containerIndent,
      ConditionalBlock: containerIndent,
      ConditionalBranch: containerIndent,
      BlockQuote: containerIndent,
      MacroDefinition: containerIndent,
      ProcedureDefinition: containerIndent,
      FunctionDefinition: containerIndent,
      WidgetDefinition: containerIndent
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
 * @param tiddlywikiParser - Optional TiddlyWiki parser to use directly (avoids re-loading TiddlyWiki language)
 */
export function getCodeParser(
  languages: readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null) | undefined,
  defaultLanguage?: Language,
  tiddlywikiParser?: TiddlyWikiParser
) {
  // TiddlyWiki aliases - skip loading these via LanguageDescription to avoid circular re-initialization
  const twAliases = ["tiddlywiki", "wikitext", "tw", "tw5"]

  return (info: string) => {
    if (info && languages) {
      let found = null
      // Strip anything after whitespace
      info = /\S*/.exec(info)![0]

      // Check if this is TiddlyWiki - use passed parser directly instead of loading via LanguageDescription
      if (twAliases.includes(info.toLowerCase())) {
        return tiddlywikiParser ?? defaultLanguage?.parser ?? null
      }

      if (typeof languages === "function") {
        found = languages(info)
      } else {
        found = LanguageDescription.matchLanguageName(languages, info, true)
      }
      if (found instanceof LanguageDescription) {
        // Double-check: skip TiddlyWiki to avoid re-loading (matchLanguageName might find it)
        const langName = found.name?.toLowerCase() || ""
        const langAlias = found.alias?.map((a: string) => a.toLowerCase()) || []
        if (langName === "tiddlywiki" || twAliases.some(a => langAlias.includes(a))) {
          return tiddlywikiParser ?? defaultLanguage?.parser ?? null
        }
        return found.support ? found.support.language.parser : ParseContext.getSkippingParser(found.load())
      } else if (found) {
        return found.parser
      }
    }
    return defaultLanguage ? defaultLanguage.parser : null
  }
}
