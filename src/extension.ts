/**
 * @lezer/tiddlywiki - Extensions
 * 
 * Zusätzliche Parser-Erweiterungen für TiddlyWiki5 Syntax.
 */

import {InlineContext, BlockContext, TiddlyWikiConfig,
        LeafBlockParser, LeafBlock, Line, Element, space, Punctuation} from "./tiddlywiki"
import {tags as t} from "@lezer/highlight"

// ============================================================================
// LaTeX/KaTeX Math Extension
// ============================================================================

const MathDelim = {resolve: "Math", mark: "MathMark"}
const DisplayMathDelim = {resolve: "DisplayMath", mark: "MathMark"}

/// Extension for inline and display math using $ and $$ delimiters
export const MathExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "Math", style: t.special(t.string)},
    {name: "DisplayMath", block: true, style: t.special(t.string)},
    {name: "MathMark", style: t.processingInstruction}
  ],
  parseInline: [{
    name: "Math",
    parse(cx, next, pos) {
      if (next != 36 /* '$' */) return -1
      
      // Check for display math $$...$$
      if (cx.char(pos + 1) == 36) {
        let end = pos + 2
        while (end < cx.end) {
          if (cx.char(end) == 36 && cx.char(end + 1) == 36) {
            return cx.addElement(cx.elt("DisplayMath", pos, end + 2, [
              cx.elt("MathMark", pos, pos + 2),
              cx.elt("MathMark", end, end + 2)
            ]))
          }
          end++
        }
        return -1
      }
      
      // Inline math $...$
      let end = pos + 1
      while (end < cx.end) {
        if (cx.char(end) == 36 && cx.char(end - 1) != 92 /* not escaped */) {
          return cx.addElement(cx.elt("Math", pos, end + 1, [
            cx.elt("MathMark", pos, pos + 1),
            cx.elt("MathMark", end, end + 1)
          ]))
        }
        end++
      }
      return -1
    }
  }]
}

// ============================================================================
// Wikitext Comment Extension
// ============================================================================

/// Extension for HTML-style comments <!-- -->
export const CommentExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "Comment", style: t.comment},
    {name: "CommentBlock", block: true, style: t.comment}
  ],
  parseInline: [{
    name: "Comment",
    parse(cx, next, pos) {
      if (next != 60 /* '<' */) return -1
      if (cx.slice(pos, pos + 4) !== "<!--") return -1
      
      let end = pos + 4
      while (end < cx.end) {
        if (cx.slice(end, end + 3) === "-->") {
          return cx.addElement(cx.elt("Comment", pos, end + 3))
        }
        end++
      }
      return -1
    }
  }],
  parseBlock: [{
    name: "CommentBlock",
    parse(cx, line) {
      if (!line.text.slice(line.pos).startsWith("<!--")) return false
      
      let from = cx.lineStart + line.pos
      let content = line.text.slice(line.pos)
      
      // Check if comment ends on same line
      let endIdx = content.indexOf("-->", 4)
      if (endIdx >= 0) {
        cx.addNode(cx.elt("CommentBlock", from, from + endIdx + 3).toTree(cx.parser.nodeSet), from)
        cx.nextLine()
        return true
      }
      
      // Multi-line comment
      while (cx.nextLine()) {
        let closeIdx = line.text.indexOf("-->")
        if (closeIdx >= 0) {
          cx.addNode(cx.elt("CommentBlock", from, cx.lineStart + closeIdx + 3).toTree(cx.parser.nodeSet), from)
          cx.nextLine()
          return true
        }
      }
      
      // Unclosed comment
      cx.addNode(cx.elt("CommentBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from)
      return true
    }
  }]
}

// ============================================================================
// Raw/Verbatim Block Extension
// ============================================================================

/// Extension for raw content blocks using <nowiki>...</nowiki> or """"
export const RawExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "RawBlock", block: true, style: t.monospace},
    {name: "RawInline", style: t.monospace},
    {name: "RawMark", style: t.processingInstruction}
  ],
  parseInline: [{
    name: "RawInline",
    parse(cx, next, pos) {
      // Check for "" (double quote literal)
      if (next == 34 /* '"' */ && cx.char(pos + 1) == 34) {
        let end = pos + 2
        while (end < cx.end) {
          if (cx.char(end) == 34 && cx.char(end + 1) == 34) {
            return cx.addElement(cx.elt("RawInline", pos, end + 2, [
              cx.elt("RawMark", pos, pos + 2),
              cx.elt("RawMark", end, end + 2)
            ]))
          }
          end++
        }
      }
      return -1
    }
  }],
  parseBlock: [{
    name: "RawBlock",
    parse(cx, line) {
      // Multi-line raw block with """"
      if (!line.text.slice(line.pos).startsWith('"""')) return false
      
      let from = cx.lineStart + line.pos
      
      while (cx.nextLine()) {
        if (line.text.trim() === '"""') {
          cx.nextLine()
          break
        }
      }
      
      cx.addNode(cx.elt("RawBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from)
      return true
    }
  }]
}

// ============================================================================
// Stylish Block Extension (CSS Classes)
// ============================================================================

/// Extension for styled blocks using @@.class or @@color:value;
export const StyleExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "StyledBlock", block: true, style: t.content},
    {name: "StyledInline", style: t.content},
    {name: "StyleMark", style: t.processingInstruction},
    {name: "StyleSpec", style: t.attributeValue}
  ],
  parseInline: [{
    name: "StyledInline",
    parse(cx, next, pos) {
      if (next != 64 /* '@' */ || cx.char(pos + 1) != 64) return -1
      
      let styleEnd = pos + 2
      // Skip style spec (class or CSS)
      while (styleEnd < cx.end && cx.char(styleEnd) != 32 && cx.char(styleEnd) != 64) styleEnd++
      
      // Find closing @@
      let end = styleEnd
      while (end < cx.end) {
        if (cx.char(end) == 64 && cx.char(end + 1) == 64) {
          return cx.addElement(cx.elt("StyledInline", pos, end + 2, [
            cx.elt("StyleMark", pos, pos + 2),
            cx.elt("StyleSpec", pos + 2, styleEnd),
            cx.elt("StyleMark", end, end + 2)
          ]))
        }
        end++
      }
      return -1
    }
  }],
  parseBlock: [{
    name: "StyledBlock",
    parse(cx, line) {
      if (!line.text.slice(line.pos).startsWith("@@")) return false
      
      let from = cx.lineStart + line.pos
      
      // Check for single-line style
      let restOfLine = line.text.slice(line.pos + 2)
      if (restOfLine.includes("@@")) {
        cx.nextLine()
        return true
      }
      
      // Multi-line styled block
      while (cx.nextLine()) {
        if (line.text.trim() === "@@") {
          cx.nextLine()
          break
        }
      }
      
      cx.addNode(cx.elt("StyledBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from)
      return true
    }
  }]
}

// ============================================================================
// Hard Linebreak Extension
// ============================================================================

/// Extension for forced linebreaks (newline characters)
export const LineBreakExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "LineBreak", style: t.processingInstruction}
  ],
  parseInline: [{
    name: "LineBreak",
    parse(cx, next, pos) {
      // TiddlyWiki uses \n or double-space at end of line for hard breaks
      // In inline context, we check for explicit <br> or <br/>
      if (next == 60 /* '<' */) {
        let tag = cx.slice(pos, Math.min(pos + 5, cx.end)).toLowerCase()
        if (tag.startsWith("<br>") || tag.startsWith("<br/")) {
          let end = pos + 4
          if (cx.char(end) == 62) end++
          return cx.addElement(cx.elt("LineBreak", pos, end))
        }
      }
      return -1
    }
  }]
}

// ============================================================================
// Footnote Extension
// ============================================================================

/// Extension for footnotes using ^[text] syntax
export const FootnoteExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "Footnote", style: t.special(t.content)},
    {name: "FootnoteMark", style: t.processingInstruction}
  ],
  parseInline: [{
    name: "Footnote",
    parse(cx, next, pos) {
      if (next != 94 /* '^' */ || cx.char(pos + 1) != 91 /* '[' */) return -1
      
      let depth = 1
      let end = pos + 2
      while (end < cx.end && depth > 0) {
        let ch = cx.char(end)
        if (ch == 91) depth++
        else if (ch == 93) depth--
        end++
      }
      
      if (depth == 0) {
        return cx.addElement(cx.elt("Footnote", pos, end, [
          cx.elt("FootnoteMark", pos, pos + 2),
          cx.elt("FootnoteMark", end - 1, end)
        ]))
      }
      return -1
    }
  }]
}

// ============================================================================
// Image with Attributes Extension
// ============================================================================

/// Extended image syntax [img width=200 [tooltip|url]]
export const ExtendedImageExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "ExtendedImage", style: t.link},
    {name: "ImageAttr", style: t.attributeValue}
  ],
  parseInline: [{
    name: "ExtendedImage",
    parse(cx, next, pos) {
      if (next != 91 /* '[' */) return -1
      if (cx.slice(pos + 1, pos + 5) !== "img ") return -1
      
      let end = pos + 5
      let attrStart = end
      
      // Find the inner [
      while (end < cx.end && cx.char(end) != 91) end++
      if (end >= cx.end) return -1
      
      let attrEnd = end
      end++ // skip [
      
      // Find closing ]]
      while (end < cx.end) {
        if (cx.char(end) == 93 && cx.char(end + 1) == 93) {
          let children: Element[] = [
            cx.elt("LinkMark", pos, pos + 5)
          ]
          if (attrEnd > attrStart) {
            children.push(cx.elt("ImageAttr", attrStart, attrEnd))
          }
          children.push(cx.elt("LinkMark", end, end + 2))
          return cx.addElement(cx.elt("ExtendedImage", pos, end + 2, children))
        }
        end++
      }
      return -1
    },
    before: "ExternalLink"
  }]
}

// ============================================================================
// Conditional/Reveal Widgets shorthand
// ============================================================================

/// Extension for shorthand conditional syntax
export const ConditionalExtension: TiddlyWikiConfig = {
  defineNodes: [
    {name: "ConditionalBlock", block: true, style: t.keyword},
    {name: "ConditionMark", style: t.processingInstruction}
  ],
  parseBlock: [{
    name: "ConditionalBlock",
    parse(cx, line) {
      // Check for <%if condition%> syntax
      if (!line.text.slice(line.pos).startsWith("<%")) return false
      
      let from = cx.lineStart + line.pos
      let depth = 1
      
      while (cx.nextLine() && depth > 0) {
        let text = line.text
        if (text.includes("<%endif%>") || text.includes("<%/if%>")) depth--
        else if (text.includes("<%if ")) depth++
      }
      
      cx.addNode(cx.elt("ConditionalBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from)
      return true
    }
  }]
}

// ============================================================================
// Bundle: All TiddlyWiki Extensions
// ============================================================================

/// Bundle containing all TiddlyWiki5 extensions
export const TiddlyWikiExtensions = [
  MathExtension,
  CommentExtension,
  RawExtension,
  StyleExtension,
  LineBreakExtension,
  FootnoteExtension,
  ExtendedImageExtension,
  ConditionalExtension
]

// ============================================================================
// Individual Exports
// ============================================================================

export {
  MathExtension,
  CommentExtension,
  RawExtension,
  StyleExtension,
  LineBreakExtension,
  FootnoteExtension,
  ExtendedImageExtension,
  ConditionalExtension
}
