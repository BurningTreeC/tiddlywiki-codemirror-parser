/**
 * @codemirror/lang-tiddlywiki - Commands
 * 
 * TiddlyWiki-spezifische Editor-Befehle für CodeMirror 6.
 */

import {StateCommand, Text, EditorState, EditorSelection, ChangeSpec, countColumn, Line, Extension} from "@codemirror/state"
import {EditorView} from "@codemirror/view"
import {syntaxTree, indentUnit, getIndentation} from "@codemirror/language"
import {SyntaxNode, Tree} from "@lezer/common"
import {tiddlywikiLanguage} from "./tiddlywiki-parser/language"

// ============================================================================
// Context Class für List/Quote Continuation
// ============================================================================

class Context {
  constructor(
    readonly node: SyntaxNode,
    readonly from: number,
    readonly to: number,
    readonly spaceBefore: string,
    readonly spaceAfter: string,
    readonly type: string,
    readonly item: SyntaxNode | null
  ) {}

  blank(maxWidth: number | null, trailing = true): string {
    let result = this.spaceBefore
    if (this.node.name == "BlockQuote") result += ">"
    if (maxWidth != null) {
      while (result.length < maxWidth) result += " "
      return result
    } else {
      for (let i = this.to - this.from - result.length - this.spaceAfter.length; i > 0; i--) result += " "
      return result + (trailing ? this.spaceAfter : "")
    }
  }

  marker(doc: Text, add: number): string {
    let marker = ""
    if (this.node.name == "OrderedList") {
      // Find current number and increment
      let text = doc.sliceString(this.item!.from, this.item!.from + 10)
      let match = /^(#+)/.exec(text)
      if (match) marker = match[1]
    } else if (this.node.name == "BulletList") {
      let text = doc.sliceString(this.item!.from, this.item!.from + 10)
      let match = /^(\*+)/.exec(text)
      if (match) marker = match[1]
    } else if (this.node.name == "DefinitionList") {
      marker = this.type
    } else if (this.node.name == "BlockQuote" && this.type == ">") {
      // Single-line > quote style
      marker = ">"
    }
    return this.spaceBefore + marker + this.spaceAfter
  }
}

// ============================================================================
// Context Detection
// ============================================================================

function getContext(node: SyntaxNode, doc: Text): Context[] {
  let nodes: SyntaxNode[] = []
  let context: Context[] = []
  
  for (let cur: SyntaxNode | null = node; cur; cur = cur.parent) {
    if (cur.name == "FencedCode" || cur.name == "CodeBlock") return context
    if (cur.name == "ListItem" || cur.name == "BlockQuote" || 
        cur.name == "DefinitionTerm" || cur.name == "DefinitionDescription") {
      nodes.push(cur)
    }
  }
  
  for (let i = nodes.length - 1; i >= 0; i--) {
    let node = nodes[i]
    let line = doc.lineAt(node.from)
    let startPos = node.from - line.from
    let match: RegExpExecArray | null
    
    if (node.name == "BlockQuote") {
      match = /^(\s*)(<<<)(\s*)/.exec(line.text.slice(startPos))
      if (match) {
        context.push(new Context(node, startPos, startPos + match[0].length, match[1], match[3], "<<<", null))
      }
    } else if (node.name == "ListItem" && node.parent?.name == "OrderedList") {
      match = /^(\s*)(#+)(\s+)/.exec(line.text.slice(startPos))
      if (match) {
        context.push(new Context(node.parent!, startPos, startPos + match[0].length, match[1], match[3], match[2], node))
      }
    } else if (node.name == "ListItem" && node.parent?.name == "BulletList") {
      match = /^(\s*)(\*+)(\s+)/.exec(line.text.slice(startPos))
      if (match) {
        context.push(new Context(node.parent!, startPos, startPos + match[0].length, match[1], match[3], match[2], node))
      }
    } else if (node.name == "ListItem" && node.parent?.name == "BlockQuote") {
      // Single-line > quote style
      match = /^(\s*)(>)(\s*)/.exec(line.text.slice(startPos))
      if (match) {
        context.push(new Context(node.parent!, startPos, startPos + match[0].length, match[1], match[3], ">", node))
      }
    } else if (node.name == "DefinitionTerm") {
      match = /^(\s*)(;)(\s*)/.exec(line.text.slice(startPos))
      if (match) {
        context.push(new Context(node.parent!, startPos, startPos + match[0].length, match[1], match[3], ";", node))
      }
    } else if (node.name == "DefinitionDescription") {
      match = /^(\s*)(:)(\s*)/.exec(line.text.slice(startPos))
      if (match) {
        context.push(new Context(node.parent!, startPos, startPos + match[0].length, match[1], match[3], ":", node))
      }
    }
  }
  
  return context
}

// ============================================================================
// Normalize Indentation
// ============================================================================

function normalizeIndent(content: string, state: EditorState): string {
  let blank = /^[ \t]*/.exec(content)![0].length
  if (!blank || state.facet(indentUnit) != "\t") return content
  let col = countColumn(content, 4, blank)
  let space = ""
  for (let i = col; i > 0;) {
    if (i >= 4) { space += "\t"; i -= 4 }
    else { space += " "; i-- }
  }
  return space + content.slice(blank)
}

// ============================================================================
// Insert Newline Continue Markup Command
// ============================================================================

/// Konfigurierbare Version des Continue-Markup Befehls
export const insertNewlineContinueMarkupCommand = (config: {
  /// Verhalten bei leerem zweiten Listen-Item
  nonTightLists?: boolean
} = {}): StateCommand => ({state, dispatch}) => {
  let tree = syntaxTree(state)
  let {doc} = state
  let dont = null
  
  let changes = state.changeByRange(range => {
    if (!range.empty || !tiddlywikiLanguage.isActiveAt(state, range.from, -1) && 
        !tiddlywikiLanguage.isActiveAt(state, range.from, 1)) {
      return dont = {range}
    }
    
    let pos = range.from
    let line = doc.lineAt(pos)
    // Try to resolve node at cursor position; if at end of document/line with no
    // trailing newline, resolveInner may return Document - try pos-1 in that case
    let node = tree.resolveInner(pos, -1)
    if (node.name === "Document" && pos > 0) {
      node = tree.resolveInner(pos - 1, -1)
    }
    let context = getContext(node, doc)
    
    while (context.length && context[context.length - 1].from > pos - line.from) {
      context.pop()
    }

    // No list/quote context - fall back to language indentation
    if (!context.length) {
      const lineText = line.text
      const unit = state.facet(indentUnit)
      const unitSize = unit === "\t" ? state.tabSize : unit.length

      // Get base indent of current line
      let baseIndent = 0
      for (let i = 0; i < lineText.length; i++) {
        const ch = lineText.charCodeAt(i)
        if (ch === 32) baseIndent++ // space
        else if (ch === 9) baseIndent += state.tabSize // tab
        else break
      }

      const cursorCol = pos - line.from
      const textBeforeCursor = lineText.slice(0, cursorCol)
      const textAfterCursor = lineText.slice(cursorCol)

      // Check if cursor is between opening and closing tag: <tag>|</tag> or <$widget>|</$widget>
      // Pattern: text ends with > and next text starts with </
      const betweenTagsMatch = />$/.test(textBeforeCursor) && /^<\//.test(textAfterCursor)
      if (betweenTagsMatch) {
        // Build indentation strings
        let baseIndentStr = ""
        let innerIndentStr = ""
        if (unit === "\t") {
          baseIndentStr = "\t".repeat(Math.floor(baseIndent / state.tabSize))
          const remainder = baseIndent % state.tabSize
          if (remainder > 0) baseIndentStr += " ".repeat(remainder)
          innerIndentStr = baseIndentStr + "\t"
        } else {
          baseIndentStr = " ".repeat(baseIndent)
          innerIndentStr = " ".repeat(baseIndent + unitSize)
        }

        // Insert: newline + inner indent (cursor here) + newline + base indent (closing tag follows)
        const insert = state.lineBreak + innerIndentStr + state.lineBreak + baseIndentStr
        const cursorPos = pos + state.lineBreak.length + innerIndentStr.length
        return {
          range: EditorSelection.cursor(cursorPos),
          changes: {from: pos, insert}
        }
      }

      // Get the indentation for the next line from the language
      let indent = getIndentation(state, pos)

      // Fallback: if indentation is null/0, check line text for patterns that need indentation
      if (indent == null || indent === 0) {
        // Check for patterns that need indentation on next line
        const trimmed = lineText.trim()
        const textAfterCursorTrimmed = textAfterCursor.trim()

        // If line is empty (just whitespace), preserve current indentation
        if (trimmed === "") {
          indent = baseIndent
        // If cursor is BEFORE a tag (opening or closing), keep current indentation (don't add)
        // This handles cases like cursor before <$list>, <div>, <%if, </$list>, <%endif%>, \end, etc.
        } else if (/^<[$a-zA-Z\/]/.test(textAfterCursorTrimmed) ||
            /^<%/.test(textAfterCursorTrimmed) ||
            /^\\end\b/.test(textAfterCursorTrimmed)) {
          indent = baseIndent
        } else if (/<%\s*(if|elseif)\s+.+%>\s*$/.test(trimmed) || /<%\s*else\s*%>\s*$/.test(trimmed)) {
          // Conditional opener - indent next line
          indent = baseIndent + unitSize
        } else if (/<[$a-zA-Z][^>]*>\s*$/.test(trimmed) && !/<\//.test(trimmed) && !trimmed.endsWith("/>")) {
          // Opening widget/HTML tag - indent next line
          indent = baseIndent + unitSize
        } else if (/<%\s*endif\s*%>\s*$/.test(trimmed) || /<\/[$a-zA-Z][^>]*>\s*$/.test(trimmed)) {
          // Closing tag - keep same indent as current line
          indent = baseIndent
        }
      }

      let indentStr = ""
      if (indent != null && indent > 0) {
        // Build the indentation string
        if (unit === "\t") {
          // Tab indentation
          indentStr = "\t".repeat(Math.floor(indent / state.tabSize))
          const remainder = indent % state.tabSize
          if (remainder > 0) indentStr += " ".repeat(remainder)
        } else {
          // Space indentation
          indentStr = " ".repeat(indent)
        }
      }
      // Always insert a newline, even if indentation is null/zero
      const insert = state.lineBreak + indentStr
      return {
        range: EditorSelection.cursor(pos + insert.length),
        changes: {from: pos, insert}
      }
    }
    
    let inner = context[context.length - 1]
    if (inner.to - inner.spaceAfter.length > pos - line.from) return dont = {range}
    
    let emptyLine = pos >= (inner.to - inner.spaceAfter.length) && !/\S/.test(line.text.slice(inner.to))
    
    // Leere Zeile in Liste - Markup entfernen
    if (inner.item && emptyLine) {
      let first = inner.node.firstChild!
      let second = inner.node.getChild("ListItem", "ListItem")
      
      if (first.to >= pos || second && second.to < pos ||
          line.from > 0 && !/[^\s>]/.test(doc.lineAt(line.from - 1).text) ||
          config.nonTightLists === false) {
        let next = context.length > 1 ? context[context.length - 2] : null
        let delTo: number, insert = ""
        
        if (next && next.item) {
          delTo = line.from + next.from
          insert = next.marker(doc, 1)
        } else {
          delTo = line.from + (next ? next.to : 0)
        }
        
        let changes: ChangeSpec[] = [{from: delTo, to: pos, insert}]
        return {range: EditorSelection.cursor(delTo + insert.length), changes}
      }
    }
    
    let changes: ChangeSpec[] = []
    let continued = inner.item && inner.item.from < line.from
    let insert = ""
    
    if (!continued || /^[\s\*#;:>]*/.exec(line.text)![0].length >= inner.to) {
      for (let i = 0, e = context.length - 1; i <= e; i++) {
        insert += i == e && !continued ? context[i].marker(doc, 1)
          : context[i].blank(i < e ? countColumn(line.text, 4, context[i + 1].from) - insert.length : null)
      }
    }
    
    let from = pos
    while (from > line.from && /\s/.test(line.text.charAt(from - line.from - 1))) from--
    insert = normalizeIndent(insert, state)
    changes.push({from, to: pos, insert: state.lineBreak + insert})
    return {range: EditorSelection.cursor(from + insert.length + 1), changes}
  })
  
  if (dont) return false
  dispatch(state.update(changes, {scrollIntoView: true, userEvent: "input"}))
  return true
}

/// Standard Continue-Markup Befehl für TiddlyWiki
export const insertNewlineContinueMarkup = insertNewlineContinueMarkupCommand()

// ============================================================================
// Delete Markup Backward Command
// ============================================================================

function isMark(node: SyntaxNode): boolean {
  return node.name == "QuoteMark" || node.name == "ListMark" || node.name == "HeadingMark"
}

function contextNodeForDelete(tree: Tree, pos: number): SyntaxNode {
  let node = tree.resolveInner(pos, -1)
  let scan = pos
  
  if (isMark(node)) {
    scan = node.from
    node = node.parent!
  }
  
  for (let prev; prev = node.childBefore(scan);) {
    if (isMark(prev)) {
      scan = prev.from
    } else if (prev.name == "OrderedList" || prev.name == "BulletList" || prev.name == "DefinitionList") {
      node = prev.lastChild!
      scan = node.to
    } else {
      break
    }
  }
  
  return node
}

/// Befehl zum Löschen von Markup rückwärts
export const deleteMarkupBackward: StateCommand = ({state, dispatch}) => {
  let tree = syntaxTree(state)
  let dont = null
  
  let changes = state.changeByRange(range => {
    let pos = range.from
    let {doc} = state
    
    if (range.empty && tiddlywikiLanguage.isActiveAt(state, range.from)) {
      let line = doc.lineAt(pos)
      let context = getContext(contextNodeForDelete(tree, pos), doc)
      
      if (context.length) {
        let inner = context[context.length - 1]
        let spaceEnd = inner.to - inner.spaceAfter.length + (inner.spaceAfter ? 1 : 0)
        
        // Lösche überschüssige Leerzeichen nach Markup
        if (pos - line.from > spaceEnd && !/\S/.test(line.text.slice(spaceEnd, pos - line.from))) {
          return {
            range: EditorSelection.cursor(line.from + spaceEnd),
            changes: {from: line.from + spaceEnd, to: pos}
          }
        }
        
        if (pos - line.from == spaceEnd &&
            (!inner.item || line.from <= inner.item.from || !/\S/.test(line.text.slice(0, inner.to)))) {
          let start = line.from + inner.from
          
          // Ersetze List-Marker durch Leerzeichen
          if (inner.item && inner.node.from < inner.item.from && /\S/.test(line.text.slice(inner.from, inner.to))) {
            let insert = inner.blank(countColumn(line.text, 4, inner.to) - countColumn(line.text, 4, inner.from))
            if (start == line.from) insert = normalizeIndent(insert, state)
            return {
              range: EditorSelection.cursor(start + insert.length),
              changes: {from: start, to: line.from + inner.to, insert}
            }
          }
          
          // Lösche eine Ebene der Einrückung
          if (start < pos) {
            return {range: EditorSelection.cursor(start), changes: {from: start, to: pos}}
          }
        }
      }
    }
    return dont = {range}
  })
  
  if (dont) return false
  dispatch(state.update(changes, {scrollIntoView: true, userEvent: "delete"}))
  return true
}

// ============================================================================
// Delete Matching Bracket Pair
// ============================================================================

// Matching bracket pairs: opening -> closing
const bracketPairs: Record<string, string> = {
  '"': '"',
  "'": "'",
  "`": "`",
  "(": ")",
  "[": "]",
  "{": "}",
}

/**
 * Delete matching bracket pair when cursor is between empty brackets.
 * For example: "" -> (empty), [] -> (empty), () -> (empty)
 */
export const deleteBracketPair: StateCommand = ({state, dispatch}) => {
  let changes: ChangeSpec[] = []
  let newSelections: {anchor: number}[] = []

  for (let range of state.selection.ranges) {
    // Only handle empty selections (cursor)
    if (!range.empty) return false

    const pos = range.from
    if (pos === 0) return false

    const charBefore = state.doc.sliceString(pos - 1, pos)
    const charAfter = state.doc.sliceString(pos, pos + 1)

    // Check if we're between matching brackets
    const expectedClosing = bracketPairs[charBefore]
    if (expectedClosing && charAfter === expectedClosing) {
      // Delete both the opening and closing bracket
      changes.push({from: pos - 1, to: pos + 1})
      newSelections.push({anchor: pos - 1})
    } else {
      // Not between matching brackets
      return false
    }
  }

  if (changes.length === 0) return false

  dispatch(state.update({
    changes,
    selection: EditorSelection.create(newSelections.map(s => EditorSelection.cursor(s.anchor))),
    scrollIntoView: true,
    userEvent: "delete"
  }))
  return true
}

// ============================================================================
// Toggle Formatting Commands
// ============================================================================

function toggleInlineFormat(state: EditorState, dispatch: (tr: any) => void, marker: string): boolean {
  let changes: ChangeSpec[] = []
  
  for (let range of state.selection.ranges) {
    if (range.empty) {
      // Bei leerer Selektion: Marker einfügen und Cursor dazwischen
      changes.push({from: range.from, insert: marker + marker})
    } else {
      let text = state.doc.sliceString(range.from, range.to)
      
      // Prüfen ob bereits formatiert
      if (text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2) {
        // Format entfernen
        changes.push({from: range.from, to: range.to, insert: text.slice(marker.length, -marker.length)})
      } else {
        // Format hinzufügen
        changes.push({from: range.from, insert: marker})
        changes.push({from: range.to, insert: marker})
      }
    }
  }
  
  dispatch(state.update({changes, scrollIntoView: true, userEvent: "input"}))
  return true
}

/// Toggle Bold formatierung ('' '')
export const toggleBold: StateCommand = ({state, dispatch}) => {
  return toggleInlineFormat(state, dispatch, "''")
}

/// Toggle Italic formatierung (// //)
export const toggleItalic: StateCommand = ({state, dispatch}) => {
  return toggleInlineFormat(state, dispatch, "//")
}

/// Toggle Underline formatierung (__ __)
export const toggleUnderline: StateCommand = ({state, dispatch}) => {
  return toggleInlineFormat(state, dispatch, "__")
}

/// Toggle Strikethrough formatierung (~~ ~~)
export const toggleStrikethrough: StateCommand = ({state, dispatch}) => {
  return toggleInlineFormat(state, dispatch, "~~")
}

/// Toggle Superscript formatierung (^^ ^^)
export const toggleSuperscript: StateCommand = ({state, dispatch}) => {
  return toggleInlineFormat(state, dispatch, "^^")
}

/// Toggle Subscript formatierung (,, ,,)
export const toggleSubscript: StateCommand = ({state, dispatch}) => {
  return toggleInlineFormat(state, dispatch, ",,")
}

/// Toggle Inline Code formatierung (` `)
export const toggleInlineCode: StateCommand = ({state, dispatch}) => {
  return toggleInlineFormat(state, dispatch, "`")
}

// ============================================================================
// Insert Link Command
// ============================================================================

/// Fügt einen WikiLink ein
export const insertWikiLink: StateCommand = ({state, dispatch}) => {
  let changes: ChangeSpec[] = []
  let selection = state.selection
  
  for (let range of selection.ranges) {
    if (range.empty) {
      changes.push({from: range.from, insert: "[[]]"})
    } else {
      let text = state.doc.sliceString(range.from, range.to)
      changes.push({from: range.from, to: range.to, insert: `[[${text}]]`})
    }
  }
  
  dispatch(state.update({changes, scrollIntoView: true, userEvent: "input"}))
  return true
}

/// Fügt eine Transclusion ein
export const insertTransclusion: StateCommand = ({state, dispatch}) => {
  let changes: ChangeSpec[] = []
  
  for (let range of state.selection.ranges) {
    if (range.empty) {
      changes.push({from: range.from, insert: "{{}}"})
    } else {
      let text = state.doc.sliceString(range.from, range.to)
      changes.push({from: range.from, to: range.to, insert: `{{${text}}}`})
    }
  }
  
  dispatch(state.update({changes, scrollIntoView: true, userEvent: "input"}))
  return true
}

/// Fügt einen Macro-Aufruf ein
export const insertMacroCall: StateCommand = ({state, dispatch}) => {
  let changes: ChangeSpec[] = []
  
  for (let range of state.selection.ranges) {
    if (range.empty) {
      changes.push({from: range.from, insert: "<<>>"})
    } else {
      let text = state.doc.sliceString(range.from, range.to)
      changes.push({from: range.from, to: range.to, insert: `<<${text}>>`})
    }
  }
  
  dispatch(state.update({changes, scrollIntoView: true, userEvent: "input"}))
  return true
}

// ============================================================================
// Heading Commands
// ============================================================================

function setHeadingLevel(state: EditorState, dispatch: (tr: any) => void, level: number): boolean {
  let changes: ChangeSpec[] = []
  let {doc} = state
  
  for (let range of state.selection.ranges) {
    let line = doc.lineAt(range.from)
    let text = line.text
    
    // Entferne existierende Heading-Marker
    let match = /^(!+)\s*/.exec(text)
    let contentStart = match ? match[0].length : 0
    let content = text.slice(contentStart)
    
    // Neuen Heading-Level setzen (0 = kein Heading)
    let newPrefix = level > 0 ? "!".repeat(level) + " " : ""
    changes.push({from: line.from, to: line.from + contentStart, insert: newPrefix})
  }
  
  dispatch(state.update({changes, scrollIntoView: true, userEvent: "input"}))
  return true
}

/// Setzt Heading Level 1
export const setHeading1: StateCommand = ({state, dispatch}) => setHeadingLevel(state, dispatch, 1)

/// Setzt Heading Level 2
export const setHeading2: StateCommand = ({state, dispatch}) => setHeadingLevel(state, dispatch, 2)

/// Setzt Heading Level 3
export const setHeading3: StateCommand = ({state, dispatch}) => setHeadingLevel(state, dispatch, 3)

/// Setzt Heading Level 4
export const setHeading4: StateCommand = ({state, dispatch}) => setHeadingLevel(state, dispatch, 4)

/// Setzt Heading Level 5
export const setHeading5: StateCommand = ({state, dispatch}) => setHeadingLevel(state, dispatch, 5)

/// Setzt Heading Level 6
export const setHeading6: StateCommand = ({state, dispatch}) => setHeadingLevel(state, dispatch, 6)

/// Entfernt Heading
export const removeHeading: StateCommand = ({state, dispatch}) => setHeadingLevel(state, dispatch, 0)

// ============================================================================
// List Commands
// ============================================================================

function toggleListMarker(state: EditorState, dispatch: (tr: any) => void, marker: string): boolean {
  let changes: ChangeSpec[] = []
  let {doc} = state
  
  for (let range of state.selection.ranges) {
    let line = doc.lineAt(range.from)
    let text = line.text
    
    // Prüfe ob Zeile bereits mit diesem Marker beginnt
    let markerMatch = new RegExp(`^(${marker.replace(/[*#]/g, "\\$&")}+)\\s*`).exec(text)
    
    if (markerMatch) {
      // Marker entfernen
      changes.push({from: line.from, to: line.from + markerMatch[0].length, insert: ""})
    } else {
      // Anderen Marker entfernen falls vorhanden
      let otherMatch = /^([*#;:]+)\s*/.exec(text)
      if (otherMatch) {
        changes.push({from: line.from, to: line.from + otherMatch[0].length, insert: marker + " "})
      } else {
        // Marker hinzufügen
        changes.push({from: line.from, insert: marker + " "})
      }
    }
  }
  
  dispatch(state.update({changes, scrollIntoView: true, userEvent: "input"}))
  return true
}

/// Toggle Bullet List (* )
export const toggleBulletList: StateCommand = ({state, dispatch}) => {
  return toggleListMarker(state, dispatch, "*")
}

/// Toggle Numbered List (# )
export const toggleNumberedList: StateCommand = ({state, dispatch}) => {
  return toggleListMarker(state, dispatch, "#")
}

// ============================================================================
// Code Block Command
// ============================================================================

/// Fügt einen Code-Block ein oder wickelt Selektion in Code-Block
export const insertCodeBlock: StateCommand = ({state, dispatch}) => {
  let changes: ChangeSpec[] = []
  
  for (let range of state.selection.ranges) {
    if (range.empty) {
      let line = state.doc.lineAt(range.from)
      // Füge Code-Block mit leerer Zeile ein
      let insert = "```\n\n```"
      changes.push({from: line.from, insert: insert + "\n"})
    } else {
      let text = state.doc.sliceString(range.from, range.to)
      changes.push({from: range.from, to: range.to, insert: "```\n" + text + "\n```"})
    }
  }
  
  dispatch(state.update({changes, scrollIntoView: true, userEvent: "input"}))
  return true
}

/// Fügt eine horizontale Linie ein
export const insertHorizontalRule: StateCommand = ({state, dispatch}) => {
  let line = state.doc.lineAt(state.selection.main.from)
  dispatch(state.update({
    changes: {from: line.to, insert: "\n---\n"},
    scrollIntoView: true,
    userEvent: "input"
  }))
  return true
}

// ============================================================================
// List Marker Upgrade Input Handler
// ============================================================================

/**
 * Input handler that upgrades list markers when typing the marker character
 * right after an existing marker. For example:
 * - "* " + typing "*" → "** "
 * - "# " + typing "#" → "## "
 * - "** " + typing "*" → "*** "
 */
export const listMarkerUpgradeHandler: Extension = EditorView.inputHandler.of(
  (view: EditorView, from: number, to: number, text: string) => {
    // Only handle single character input of * or #
    if (text !== "*" && text !== "#") return false

    // Only handle when cursor is at a single position (not a selection)
    if (from !== to) return false

    let state = view.state
    let line = state.doc.lineAt(from)
    let lineStart = line.from
    let cursorOffset = from - lineStart

    // Check if cursor is right after a list marker + space
    let lineText = line.text

    // Match bullet list: starts with *+ followed by space, cursor right after space
    if (text === "*") {
      let match = /^(\*+) $/.exec(lineText.slice(0, cursorOffset))
      if (match) {
        // Upgrade: replace "* " with "** " (add one more *)
        let newMarker = match[1] + "* "
        view.dispatch({
          changes: {from: lineStart, to: from, insert: newMarker},
          selection: {anchor: lineStart + newMarker.length}
        })
        return true
      }
    }

    // Match ordered list: starts with #+ followed by space, cursor right after space
    if (text === "#") {
      let match = /^(#+) $/.exec(lineText.slice(0, cursorOffset))
      if (match) {
        // Upgrade: replace "# " with "## " (add one more #)
        let newMarker = match[1] + "# "
        view.dispatch({
          changes: {from: lineStart, to: from, insert: newMarker},
          selection: {anchor: lineStart + newMarker.length}
        })
        return true
      }
    }

    return false
  }
)

// ============================================================================
// List Marker Downgrade Command (for Backspace)
// ============================================================================

/**
 * Command that downgrades list markers when pressing backspace at the end
 * of a multi-level marker. For example:
 * - "** " + backspace → "* "
 * - "### " + backspace → "## "
 */
export const listMarkerDowngrade: StateCommand = ({state, dispatch}) => {
  let {doc, selection} = state
  let range = selection.main

  // Only handle empty selection (cursor, not selection)
  if (!range.empty) return false

  let pos = range.from
  let line = doc.lineAt(pos)
  let cursorOffset = pos - line.from
  let lineText = line.text

  // Check if cursor is right after a multi-level list marker + space
  // Match bullet list: **+ followed by space, cursor right after space
  let bulletMatch = /^(\*{2,}) $/.exec(lineText.slice(0, cursorOffset))
  if (bulletMatch && cursorOffset === bulletMatch[0].length) {
    // Downgrade: replace "** " with "* " (remove one *)
    let newMarker = bulletMatch[1].slice(0, -1) + " "
    dispatch(state.update({
      changes: {from: line.from, to: pos, insert: newMarker},
      selection: EditorSelection.cursor(line.from + newMarker.length)
    }))
    return true
  }

  // Match ordered list: ##+ followed by space, cursor right after space
  let orderedMatch = /^(#{2,}) $/.exec(lineText.slice(0, cursorOffset))
  if (orderedMatch && cursorOffset === orderedMatch[0].length) {
    // Downgrade: replace "## " with "# " (remove one #)
    let newMarker = orderedMatch[1].slice(0, -1) + " "
    dispatch(state.update({
      changes: {from: line.from, to: pos, insert: newMarker},
      selection: EditorSelection.cursor(line.from + newMarker.length)
    }))
    return true
  }

  return false
}

/**
 * Indent list item (Tab): increases list nesting level
 * - "* text" → "** text"
 * - "# text" → "## text"
 * Supports multi-line selections - all list lines in selection are indented
 */
export const indentList: StateCommand = ({state, dispatch}) => {
  let {doc, selection} = state
  let changes: ChangeSpec[] = []
  let processedLines = new Set<number>()
  let hasListLine = false

  for (let range of selection.ranges) {
    // Get all lines covered by this selection range
    let startLine = doc.lineAt(range.from)
    let endLine = doc.lineAt(range.to)

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      if (processedLines.has(lineNum)) continue
      processedLines.add(lineNum)

      let line = doc.line(lineNum)
      let lineText = line.text

      // Match bullet list: *+ followed by space
      let bulletMatch = /^(\*+)( )/.exec(lineText)
      if (bulletMatch) {
        let marker = bulletMatch[1]
        let insertPos = line.from + marker.length
        changes.push({from: insertPos, to: insertPos, insert: "*"})
        hasListLine = true
        continue
      }

      // Match ordered list: #+ followed by space
      let orderedMatch = /^(#+)( )/.exec(lineText)
      if (orderedMatch) {
        let marker = orderedMatch[1]
        let insertPos = line.from + marker.length
        changes.push({from: insertPos, to: insertPos, insert: "#"})
        hasListLine = true
        continue
      }
    }
  }

  if (!hasListLine || changes.length === 0) return false

  // Apply changes and let CodeMirror adjust selection automatically
  dispatch(state.update({
    changes,
    scrollIntoView: true,
    userEvent: "input"
  }))
  return true
}

/**
 * Outdent list item (Shift+Tab): decreases list nesting level
 * - "** text" → "* text"
 * - "## text" → "# text"
 * Does nothing if already at level 1
 * Supports multi-line selections - all list lines in selection are outdented
 */
export const outdentList: StateCommand = ({state, dispatch}) => {
  let {doc, selection} = state
  let changes: ChangeSpec[] = []
  let processedLines = new Set<number>()
  let hasListLine = false

  for (let range of selection.ranges) {
    // Get all lines covered by this selection range
    let startLine = doc.lineAt(range.from)
    let endLine = doc.lineAt(range.to)

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      if (processedLines.has(lineNum)) continue
      processedLines.add(lineNum)

      let line = doc.line(lineNum)
      let lineText = line.text

      // Match bullet list with 2+ markers: **+ followed by space
      let bulletMatch = /^(\*{2,})( )/.exec(lineText)
      if (bulletMatch) {
        let marker = bulletMatch[1]
        let deletePos = line.from + marker.length - 1
        changes.push({from: deletePos, to: deletePos + 1})
        hasListLine = true
        continue
      }

      // Match ordered list with 2+ markers: ##+ followed by space
      let orderedMatch = /^(#{2,})( )/.exec(lineText)
      if (orderedMatch) {
        let marker = orderedMatch[1]
        let deletePos = line.from + marker.length - 1
        changes.push({from: deletePos, to: deletePos + 1})
        hasListLine = true
        continue
      }

      // Check if it's a level-1 list (still counts as having a list line)
      if (/^(\*|#) /.test(lineText)) {
        hasListLine = true
      }
    }
  }

  if (!hasListLine) return false
  if (changes.length === 0) return true // Already at level 1, consume the key

  // Apply changes and let CodeMirror adjust selection automatically
  dispatch(state.update({
    changes,
    scrollIntoView: true,
    userEvent: "input"
  }))
  return true
}
