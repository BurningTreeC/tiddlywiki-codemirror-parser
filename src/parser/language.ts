/**
 * TiddlyWiki Language Support - Core Language Definition
 *
 * Creates the TiddlyWiki Language for CodeMirror 6, similar to how
 * lang-markdown creates the Markdown language.
 */

import {
  Language, defineLanguageFacet, languageDataProp, foldNodeProp,
  indentNodeProp, foldService, syntaxTree, LanguageDescription, ParseContext,
  // @ts-expect-error TS(6133): 'getIndentUnit' is declared but its value is never... Remove this comment to see the full error message
  TreeIndentContext, getIndentUnit
} from "@codemirror/language"
import { SyntaxNode, NodeType, NodeProp } from "@lezer/common"
import { TiddlyWikiParser, parser as baseParser } from "./parser"
// @ts-expect-error TS(6133): 'Type' is declared but its value is never read.
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
  return /^(Paragraph|Heading\d|BulletList|OrderedList|DefinitionList|BlockQuote|Table|FencedCode|TypedBlock|Widget|HTMLBlock|TransclusionBlock|FilteredTransclusionBlock|MacroCallBlock|CommentBlock|HorizontalRule|HardLineBreaks|ConditionalBlock|MacroDefinition|ProcedureDefinition|FunctionDefinition|WidgetDefinition|StyledBlock)$/.test(type.name);
}

/**
 * Check if a node type is a container that should indent its contents
 */
// @ts-expect-error TS(6133): 'isIndentingContainer' is declared but its value i... Remove this comment to see the full error message
function isIndentingContainer(name: string): boolean {
  return /^(Widget|HTMLBlock|ConditionalBlock|ConditionalBranch|BlockQuote|MacroDefinition|ProcedureDefinition|FunctionDefinition|WidgetDefinition)$/.test(name);
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

/**
 * Calculate indentation for container nodes
 */
function containerIndent(context: TreeIndentContext): number | null {
  // Get the node at the current position
  const node = context.node

  // Find the opening line of this container
  const openLine = context.state.doc.lineAt(node.from)
  const closeLine = context.state.doc.lineAt(node.to)
  const baseIndent = getLineIndent(context, node.from)
  const cursorLine = context.state.doc.lineAt(context.pos)

  // For pragma definitions, use tree-based detection for semantic correctness
  if (isPragmaDefinition(node.name)) {
    // Find PragmaEnd child node (if pragma is complete)
    let pragmaEnd: SyntaxNode | null = null
    for (let child = node.lastChild; child; child = child.prevSibling) {
      if (child.name === "PragmaEnd") {
        pragmaEnd = child
        break
      }
    }

    // Check if cursor is on the opening line
    if (cursorLine.number === openLine.number) {
      const lineText = cursorLine.text
      const atLineEnd = context.pos >= cursorLine.from + lineText.trimEnd().length
      if (atLineEnd) {
        // Check if it's a multi-line opener (ends with closing paren, no body content on same line)
        if (/^\s*\\(?:define|procedure|function|widget)\s+\S+\s*\([^)]*\)\s*$/.test(lineText)) {
          return baseIndent + context.unit
        }
      }
      return null
    }

    // If pragma has a PragmaEnd, check cursor position relative to it
    if (pragmaEnd) {
      const endLine = context.state.doc.lineAt(pragmaEnd.from)

      // Cursor is on the \end line - use base indent (same as pragma opener)
      if (cursorLine.number === endLine.number) {
        return baseIndent
      }

      // Cursor is after the \end line - use base indent (outside pragma)
      if (cursorLine.number > endLine.number) {
        return baseIndent
      }

      // Cursor is before \end (inside body) - indent one level
      return baseIndent + context.unit
    }

    // Pragma is incomplete (no PragmaEnd yet)
    // Single-line pragma with body on same line - no indent change
    if (openLine.number === closeLine.number) {
      const lineText = openLine.text.trim()
      // Multi-line opener (just declaration, no body) - indent body
      if (/^\\(?:define|procedure|function|widget)\s+\S+\s*\([^)]*\)\s*$/.test(lineText)) {
        return baseIndent + context.unit
      }
      // Has body content on same line - no indent change
      return baseIndent
    }

    // Multi-line incomplete pragma - cursor is inside body, indent
    return baseIndent + context.unit
  }

  // If node spans only a single line, check if it's an opening container that should indent
  // ConditionalBlock, Widget, HTMLBlock should still indent even when incomplete
  if (openLine.number === closeLine.number) {
    // Allow indentation for opening tags that expect content
    const openingContainers = /^(ConditionalBlock|Widget|HTMLBlock)$/
    if (!openingContainers.test(node.name)) {
      return null
    }
  }

  // Check if cursor is on the same line as opening tag
  if (cursorLine.number === openLine.number) {
    const lineText = cursorLine.text
    // Check if cursor is at end of line (after %> or closing tag)
    const atLineEnd = context.pos >= cursorLine.from + lineText.trimEnd().length

    if (atLineEnd) {
      // Check for <%if%>, <%elseif%>, <%else%> openers - indent content
      if (/<%\s*(if|elseif)\s+.+%>\s*$/.test(lineText) || /<%\s*else\s*%>\s*$/.test(lineText)) {
        return baseIndent + context.unit
      }
      // Check for <%endif%> - stay at same indent
      if (/<%\s*endif\s*%>\s*$/.test(lineText)) {
        return baseIndent
      }
      // Check for opening widget/HTML tag - indent content
      // But NOT self-closing tags (ending with />)
      if (/<[$a-zA-Z][^>]*>\s*$/.test(lineText) && !/<\//.test(lineText) && !/\/>\s*$/.test(lineText)) {
        return baseIndent + context.unit
      }
      // Check for self-closing tags - stay at same indent
      if (/\/>\s*$/.test(lineText)) {
        return baseIndent
      }
      // Check for closing widget/HTML tag - stay at same indent
      if (/<\/[$a-zA-Z][^>]*>\s*$/.test(lineText)) {
        return baseIndent
      }
    }
    return null // Let default behavior handle it
  }

  // Check if previous line is a branch opener (<%if%>, <%else%>, <%elseif%>)
  if (cursorLine.number > 1) {
    const prevLine = context.state.doc.line(cursorLine.number - 1)
    const prevText = prevLine.text.trim()
    if (/<%\s*(if|elseif)\s+.+%>\s*$/.test(prevText) || /<%\s*else\s*%>\s*$/.test(prevText)) {
      return baseIndent + context.unit
    }
  }

  // Check if this is a pure closing line (<%endif%> or closing tags)
  const lineText = cursorLine.text.trim()
  if (/^<\/[$a-zA-Z]|^<%\s*endif\s*%>/.test(lineText)) {
    return baseIndent // Same indent as opening
  }

  // Check if this is a branch opener line (<%else%> or <%elseif%>) - these outdent but their content indents
  if (/^<%\s*(else|elseif)\s/.test(lineText) || /^<%\s*else\s*%>/.test(lineText)) {
    return baseIndent // The line itself is at base indent
  }

  // Content inside other containers: indent one level
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
  return /^(MacroDefinition|ProcedureDefinition|FunctionDefinition|WidgetDefinition)$/.test(name);
}

const configured = baseParser.configure({
  props: [
    // Folding support for TiddlyWiki5 syntax
    foldNodeProp.add((type: any) => {
      // Allow inline widgets and HTML tags (they can span multiple lines and be foldable)
      // Note: Inline conditionals are handled by inlineConditionalFold service, not foldNodeProp
      const isInlineFoldable = type.name === "InlineWidget" || type.name === "HTMLTag"

      // Don't fold document, headings (they use section folding via headerIndent), or lists
      if ((!isBlock(type) && !isInlineFoldable) || type.name === "Document" || isHeading(type) != null || isList(type)) {
        return undefined
      }

      // Paragraph - don't fold single paragraphs
      if (type.name === "Paragraph") {
        return undefined
      }

      // Pragma definitions (\define, \procedure, \function, \widget)
      // Fold from end of first line to before \end
      if (isPragmaDefinition(type.name)) {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the element spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
          // Find PragmaEnd child to fold up to (but not including) it
          let endNode = tree.lastChild
          if (endNode && endNode.name === "PragmaEnd") {
            // Fold to start of \end line
            const endLine = state.doc.lineAt(endNode.from)
            if (endLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: endLine.from - 1 }
            }
            return null
          }
          return { from: firstLineEnd, to: tree.to }
        };
      }

      // Widgets and HTML blocks - fold content between tags
      if (type.name === "Widget" || type.name === "HTMLBlock") {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the element spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
          // Find closing tag to fold up to (but not including) it
          const closeTag = type.name === "Widget" ? tree.getChild("WidgetEnd") : tree.getChild("HTMLEndTag")
          if (closeTag) {
            // Fold to start of closing tag line
            const closeLine = state.doc.lineAt(closeTag.from)
            if (closeLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: closeLine.from - 1 }
            }
            // Closing tag on same line - not foldable
            return null
          }
          // No closing tag found but element spans multiple lines - fold to end
          return { from: firstLineEnd, to: tree.to }
        };
      }

      // Inline widgets and HTML tags that span multiple lines - also foldable
      if (type.name === "InlineWidget" || type.name === "HTMLTag") {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the element spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
          // Find closing tag to fold up to (but not including) it
          const closeTag = type.name === "InlineWidget" ? tree.getChild("WidgetEnd") : tree.getChild("CloseTag")
          if (closeTag) {
            // Fold to start of closing tag line
            const closeLine = state.doc.lineAt(closeTag.from)
            if (closeLine.from > firstLineEnd) {
              return { from: firstLineEnd, to: closeLine.from - 1 }
            }
          }
          return { from: firstLineEnd, to: tree.to }
        };
      }

      // Conditional blocks (<%if%>...<%endif%>)
      // Note: Inline conditionals (Conditional marker nodes) are handled by inlineConditionalFold service
      if (type.name === "ConditionalBlock") {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the element spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
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
            // End mark on same line - not foldable
            return null
          }
          // No end mark found but element spans multiple lines - fold to end
          return { from: firstLineEnd, to: tree.to }
        };
      }

      // Block quotes - fold from opening <<< to closing <<<
      if (type.name === "BlockQuote") {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the element spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
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
            return null
          }
          return { from: firstLineEnd, to: tree.to }
        };
      }

      // Fenced code blocks - fold from ``` to closing ```
      if (type.name === "FencedCode") {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the element spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
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
            return null
          }
          return { from: firstLineEnd, to: tree.to }
        };
      }

      // Typed blocks ($$$) - fold from $$$ to closing $$$
      if (type.name === "TypedBlock") {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the element spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
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
            return null
          }
          return { from: firstLineEnd, to: tree.to }
        };
      }

      // Tables - fold from header row to end
      if (type.name === "Table") {
        return (tree: any, state: any) => {
          const firstLineEnd = state.doc.lineAt(tree.from).to
          // Only fold if the table spans multiple lines
          if (tree.to <= firstLineEnd) {
            return null
          }
          // For tables, we want to keep at least the header visible
          // Fold from after first row to end of table
          const header = tree.getChild("TableHeader") || tree.getChild("TableRow")
          if (header) {
            const headerEnd = state.doc.lineAt(header.to).to
            if (headerEnd < tree.to) {
              return { from: headerEnd, to: tree.to }
            }
          }
          // Header takes entire table - nothing to fold
          return null
        };
      }

      // Default: fold from end of first line to end of block
      // This handles: TransclusionBlock, FilteredTransclusionBlock, MacroCallBlock,
      // CommentBlock, StyledBlock, etc.
      return (tree: any, state: any) => {
        const firstLineEnd = state.doc.lineAt(tree.from).to
        // Only fold if the element spans multiple lines
        if (tree.to <= firstLineEnd) {
          return null
        }
        return { from: firstLineEnd, to: tree.to }
      };
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

          // Check for multi-line pragma opener: \define foo(), \procedure bar(), etc.
          // These end with just ) and no body on the same line
          if (/^\s*\\(?:define|procedure|function|widget)\s+\S+\s*\([^)]*\)\s*$/.test(prevLineText)) {
            const baseIndent = getLineIndent(context, prevLine.from)
            return baseIndent + context.unit
          }

          // Check for conditional opener: <%if%>, <%elseif%>, <%else%>
          if (/<%\s*(if|elseif)\s+.+%>\s*$/.test(prevLineText) || /<%\s*else\s*%>\s*$/.test(prevLineText)) {
            const baseIndent = getLineIndent(context, prevLine.from)
            return baseIndent + context.unit
          }

          // Check for widget/HTML opening tags: <$widget> or <div>
          // But NOT self-closing tags (ending with />)
          if (/<[$a-zA-Z][^>]*>\s*$/.test(prevLineText) && !/<\//.test(prevLineText) && !/\/>\s*$/.test(prevLineText)) {
            const baseIndent = getLineIndent(context, prevLine.from)
            return baseIndent + context.unit
          }

          // Check for \end on previous line using tree-based detection
          // Find any PragmaEnd node that ends on the previous line
          const tree = syntaxTree(context.state)
          const prevLineEnd = prevLine.to
          const nodeAtPrevEnd = tree.resolveInner(prevLineEnd, -1)

          // Walk up to find if we're at/after a PragmaEnd
          let foundPragmaEnd = false
          let pragmaBaseIndent = 0
          for (let n: SyntaxNode | null = nodeAtPrevEnd; n; n = n.parent) {
            if (n.name === "PragmaEnd") {
              foundPragmaEnd = true
              // Find the parent pragma definition to get its indent
              if (n.parent && isPragmaDefinition(n.parent.name)) {
                pragmaBaseIndent = getLineIndent(context, n.parent.from)
              }
              break
            }
          }

          if (foundPragmaEnd) {
            return pragmaBaseIndent
          }

          // Fallback: regex check for \end (for partial/incomplete trees)
          if (/^\s*\\end(?:\s|$)/.test(prevLineText)) {
            const endLineIndent = getLineIndent(context, prevLine.from)
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
export const headerIndent = foldService.of((state: any, start: any, end: any) => {
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
 * Fold service for inline conditionals
 * Allows folding from <%if%> to matching <%endif%> when they're inline (not ConditionalBlock)
 */
export const inlineConditionalFold = foldService.of((state: any, lineStart: any, lineEnd: any) => {
  const tree = syntaxTree(state)
  const doc = state.doc

  // Use a cursor to find Conditional nodes on this line
  const cursor = tree.cursor()
  let ifNode: { from: number, to: number } | null = null

  // First pass: find a Conditional <%if%> that starts on this line
  while (cursor.next()) {
    // Skip nodes that start after our line
    if (cursor.from > lineEnd) break

    // Skip nodes that start before our line
    if (cursor.from < lineStart) continue

    // Skip ConditionalBlock nodes (handled by foldNodeProp)
    if (cursor.name === "ConditionalBlock") {
      // Don't enter ConditionalBlock children, skip the whole subtree
      let skipped = cursor.nextSibling()
      if (!skipped) {
        while (cursor.parent()) {
          if (cursor.nextSibling()) {
            skipped = true
            break
          }
        }
      }
      // If we reached the root with no more siblings, we're done traversing
      if (!skipped) break
      continue
    }

    if (cursor.name === "Conditional") {
      const text = doc.sliceString(cursor.from, cursor.to)
      if (/<%\s*if\b/.test(text)) {
        ifNode = { from: cursor.from, to: cursor.to }
        break
      }
    }
  }

  if (!ifNode) return null

  // Found an <%if%> - now find the matching <%endif%>
  const ifLineEnd = doc.lineAt(ifNode.to).to
  let depth = 1

  // Continue from current cursor position to find matching <%endif%>
  while (cursor.next()) {
    // Skip ConditionalBlock nodes
    if (cursor.name === "ConditionalBlock") {
      let skipped = cursor.nextSibling()
      if (!skipped) {
        while (cursor.parent()) {
          if (cursor.nextSibling()) {
            skipped = true
            break
          }
        }
      }
      // If we reached the root with no more siblings, we're done traversing
      if (!skipped) break
      continue
    }

    if (cursor.name === "Conditional") {
      const text = doc.sliceString(cursor.from, cursor.to)
      if (/<%\s*if\b/.test(text)) {
        depth++
      } else if (/<%\s*endif\s*%>/.test(text)) {
        depth--
        if (depth === 0) {
          // Found matching <%endif%>
          const endifLine = doc.lineAt(cursor.from)
          // Only fold if endif is on a different line
          if (endifLine.from > ifLineEnd) {
            return { from: ifLineEnd, to: endifLine.from - 1 }
          }
          return null
        }
      }
    }
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
  };
}
