// Shared auto-close placement logic.
//
// When an opening tag is auto-closed (by typing ">" or accepting a tag
// completion), the closing tag should be placed at the end of the wikitext
// block that follows the cursor, NOT glued right after it. But it must never
// cross the closing tag of an element that ENCLOSES the new tag, which would
// produce unbalanced markup, e.g.:
//
//   <span><div>This is text</span></div>   <-- WRONG (</div> after </span>)
//   <span><div>This is text</div></span>   <-- correct
//
// To guarantee balance we scan the following text tracking tag depth. As soon
// as we hit a closing tag at depth 0 (one that closes something we are inside),
// we stop and place our closer right before it.

import type { Text } from "@codemirror/state"

// Matches an HTML/widget tag (<tag ...>, </tag>, <tag/>, <$widget ...>),
// a conditional/case marker (<%if%>, <%elseif%>, <%else%>, <%endif%>, <%end%>),
// or a pragma terminator (\end).
const TOKEN_RE = /<\/?[$a-zA-Z][^>]*>|<%\s*(if|elseif|else|endif|end)\b[^%]*?%>|\\end\b/g

/** Sentinel: the tag is already closed by a matching closer ahead. */
export const ALREADY_CLOSED = -2

/**
 * Find the position at which an auto-close tag should be inserted, given the
 * position where the body text begins (just after the opening tag).
 *
 * Returns:
 *  - ALREADY_CLOSED (-2) if a matching closer for `tagName` already exists at
 *    depth 0 (caller should NOT insert a close), or
 *  - the insert position for the closer, which is either right before the first
 *    depth-0 closing tag of an enclosing element, or the end of the last
 *    non-blank line of the block (stopping at a blank line), or
 *  - -1 if there is no body text to wrap (caller should glue the close right
 *    after the opener).
 *
 * Pass `tagName` (e.g. "div", "$list") to enable the ALREADY_CLOSED check.
 */
export function findAutoCloseEnd(doc: Text, startPos: number, tagName?: string): number {
  const sLine = doc.lineAt(startPos)
  const total = doc.lines
  let depth = 0
  let lastContentEnd = -1

  for (let n = sLine.number; n <= total; n++) {
    const line = doc.line(n)
    const isFirst = n === sLine.number
    const segStart = isFirst ? startPos : line.from
    const text = isFirst ? doc.sliceString(startPos, line.to) : line.text

    if (!isFirst && text.trim() === "") break // blank line ends the block

    TOKEN_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TOKEN_RE.exec(text))) {
      const tok = m[0]
      const absPos = segStart + m.index

      if (tok.charCodeAt(0) === 60 /* < */ && tok.charCodeAt(1) === 47 /* / */) {
        // HTML/widget closing tag
        if (depth === 0) {
          // A depth-0 closer that matches our tag means it is already closed.
          if (tagName != null && closerName(tok) === tagName) return ALREADY_CLOSED
          return contentEnd(doc, segStart, absPos, lastContentEnd)
        }
        depth--
      } else if (tok.charCodeAt(0) === 60 /* < */ && tok.charCodeAt(1) === 37 /* % */) {
        // Conditional/case marker
        const kw = m[1]
        if (kw === "if") {
          depth++
        } else if (depth === 0) {
          // endif/end/else/elseif at depth 0 closes the block we're inside
          return contentEnd(doc, segStart, absPos, lastContentEnd)
        } else if (kw === "endif" || kw === "end") {
          depth--
        }
      } else if (tok.charCodeAt(0) === 92 /* \ */) {
        // \end pragma terminator
        if (depth === 0) return contentEnd(doc, segStart, absPos, lastContentEnd)
        depth--
      } else {
        // HTML/widget opening tag; ignore self-closing (<tag/>)
        if (!/\/\s*>$/.test(tok)) depth++
      }
    }

    if (text.trim() !== "") lastContentEnd = line.to
  }

  return lastContentEnd
}

// Extract the tag name from a closing-tag token, e.g. "</$list>" -> "$list".
function closerName(tok: string): string {
  const m = /^<\/\s*([$a-zA-Z][\w$.-]*)/.exec(tok)
  return m ? m[1] : ""
}

// Where to place the closer when we hit a depth-0 closing tag at `closerPos`.
// `lineContentStart` is where the closer's own line begins (or the cursor, for
// the first line). If there is content on the closer's line before it, close
// inline right before it (e.g. "text</div></span>"). If the closer sits alone
// on its line, close after the last full content line instead, so we don't
// produce a stray blank line or glue our closer onto the enclosing one
// (or -1 = nothing to wrap).
function contentEnd(doc: Text, lineContentStart: number, closerPos: number, lastContentEnd: number): number {
  if (doc.sliceString(lineContentStart, closerPos).trim() !== "") return closerPos
  return lastContentEnd
}
