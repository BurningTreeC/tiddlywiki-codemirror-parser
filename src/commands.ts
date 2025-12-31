/**
 * @prtw/lang-tiddlywiki - Commands
 *
 * TiddlyWiki-spezifische Editor-Befehle für CodeMirror 6.
 *
 * Production-ready notes:
 * - Exportierte Commands sind durchgehend `StateCommand` (CM6-konform).
 * - `dispatch` ist optional → wir guard-en sauber (dry-run / keymap query).
 * - Imports sind auf tatsächlich verwendete Symbole reduziert (TS6133-fest).
 */

import {
  type StateCommand,
  type Text,
  type EditorState,
  EditorSelection,
  type ChangeSpec,
  countColumn
} from "@codemirror/state";
import { syntaxTree, indentUnit } from "@codemirror/language";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { tiddlywikiLanguage } from "./codemirror-tiddlywiki";

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
    let result = this.spaceBefore;
    if (this.node.name === "BlockQuote") result += ">";
    if (maxWidth != null) {
      while (result.length < maxWidth) result += " ";
      return result;
    } else {
      for (
        let i = this.to - this.from - result.length - this.spaceAfter.length;
        i > 0;
        i--
      )
        result += " ";
      return result + (trailing ? this.spaceAfter : "");
    }
  }

  marker(doc: Text, _add: number): string {
    let marker = "";
    if (this.node.name === "NumberedList") {
      const text = doc.sliceString(this.item!.from, this.item!.from + 10);
      const match = /^(#+)/.exec(text);
      if (match) marker = match[1];
    } else if (this.node.name === "BulletList") {
      const text = doc.sliceString(this.item!.from, this.item!.from + 10);
      const match = /^(\*+)/.exec(text);
      if (match) marker = match[1];
    } else if (this.node.name === "DefinitionList") {
      marker = this.type;
    }
    return this.spaceBefore + marker + this.spaceAfter;
  }
}

// ============================================================================
// Context Detection
// ============================================================================

function getContext(node: SyntaxNode, doc: Text): Context[] {
  const nodes: SyntaxNode[] = [];
  const context: Context[] = [];

  for (let cur: SyntaxNode | null = node; cur; cur = cur.parent) {
    if (cur.name === "FencedCode" || cur.name === "CodeBlock") return context;
    if (
      cur.name === "ListItem" ||
      cur.name === "BlockQuote" ||
      cur.name === "DefinitionTerm" ||
      cur.name === "DefinitionDescription"
    ) {
      nodes.push(cur);
    }
  }

  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const line = doc.lineAt(n.from);
    const startPos = n.from - line.from;

    let match: RegExpExecArray | null;

    if (n.name === "BlockQuote") {
      match = /^(\s*)(<<<)(\s*)/.exec(line.text.slice(startPos));
      if (match) {
        context.push(
          new Context(n, startPos, startPos + match[0].length, match[1], match[3], "<<<", null)
        );
      }
    } else if (n.name === "ListItem" && n.parent?.name === "NumberedList") {
      match = /^(\s*)(#+)(\s+)/.exec(line.text.slice(startPos));
      if (match) {
        context.push(
          new Context(n.parent!, startPos, startPos + match[0].length, match[1], match[3], match[2], n)
        );
      }
    } else if (n.name === "ListItem" && n.parent?.name === "BulletList") {
      match = /^(\s*)(\*+)(\s+)/.exec(line.text.slice(startPos));
      if (match) {
        context.push(
          new Context(n.parent!, startPos, startPos + match[0].length, match[1], match[3], match[2], n)
        );
      }
    } else if (n.name === "DefinitionTerm") {
      match = /^(\s*)(;)(\s*)/.exec(line.text.slice(startPos));
      if (match) {
        context.push(
          new Context(n.parent!, startPos, startPos + match[0].length, match[1], match[3], ";", n)
        );
      }
    } else if (n.name === "DefinitionDescription") {
      match = /^(\s*)(:)(\s*)/.exec(line.text.slice(startPos));
      if (match) {
        context.push(
          new Context(n.parent!, startPos, startPos + match[0].length, match[1], match[3], ":", n)
        );
      }
    }
  }

  return context;
}

// ============================================================================
// Normalize Indentation
// ============================================================================

function normalizeIndent(content: string, state: EditorState): string {
  const blank = /^[ \t]*/.exec(content)![0].length;
  if (!blank || state.facet(indentUnit) !== "\t") return content;

  const col = countColumn(content, 4, blank);
  let space = "";
  for (let i = col; i > 0; ) {
    if (i >= 4) {
      space += "\t";
      i -= 4;
    } else {
      space += " ";
      i--;
    }
  }
  return space + content.slice(blank);
}

// ============================================================================
// Insert Newline Continue Markup Command
// ============================================================================

/**
 * Konfigurierbare Version des Continue-Markup Befehls
 */
export const insertNewlineContinueMarkupCommand = (
  config: {
    /** Verhalten bei leerem zweiten Listen-Item */
    nonTightLists?: boolean;
  } = {}
): StateCommand => {
  return ({ state, dispatch }) => {
    if (!dispatch) return false;

    const tree = syntaxTree(state);
    const { doc } = state;
    let dont: { range: any } | null = null;

    const changes = state.changeByRange((range) => {
      if (
        !range.empty ||
        (!tiddlywikiLanguage.isActiveAt(state, range.from, -1) &&
          !tiddlywikiLanguage.isActiveAt(state, range.from, 1))
      ) {
        return (dont = { range });
      }

      const pos = range.from;
      const line = doc.lineAt(pos);
      let context = getContext(tree.resolveInner(pos, -1), doc);

      while (context.length && context[context.length - 1].from > pos - line.from) {
        context.pop();
      }
      if (!context.length) return (dont = { range });

      const inner = context[context.length - 1];
      if (inner.to - inner.spaceAfter.length > pos - line.from) return (dont = { range });

      const emptyLine =
        pos >= inner.to - inner.spaceAfter.length && !/\S/.test(line.text.slice(inner.to));

      // Leere Zeile in Liste - Markup entfernen
      if (inner.item && emptyLine) {
        const first = inner.node.firstChild!;
        const second = inner.node.getChild("ListItem", "ListItem");

        if (
          first.to >= pos ||
          (second && second.to < pos) ||
          (line.from > 0 && !/[^\s>]/.test(doc.lineAt(line.from - 1).text)) ||
          config.nonTightLists === false
        ) {
          const next = context.length > 1 ? context[context.length - 2] : null;
          let delTo: number;
          let insert = "";

          if (next && next.item) {
            delTo = line.from + next.from;
            insert = next.marker(doc, 1);
          } else {
            delTo = line.from + (next ? next.to : 0);
          }

          const localChanges: ChangeSpec[] = [{ from: delTo, to: pos, insert }];
          return { range: EditorSelection.cursor(delTo + insert.length), changes: localChanges };
        }
      }

      const localChanges: ChangeSpec[] = [];
      const continued = inner.item && inner.item.from < line.from;
      let insert = "";

      if (!continued || /^[\s\*#;:>]*/.exec(line.text)![0].length >= inner.to) {
        for (let i = 0, e = context.length - 1; i <= e; i++) {
          insert +=
            i === e && !continued
              ? context[i].marker(doc, 1)
              : context[i].blank(
                  i < e
                    ? countColumn(line.text, 4, context[i + 1].from) - insert.length
                    : null
                );
        }
      }

      let from = pos;
      while (from > line.from && /\s/.test(line.text.charAt(from - line.from - 1))) from--;

      insert = normalizeIndent(insert, state);
      localChanges.push({ from, to: pos, insert: state.lineBreak + insert });

      return { range: EditorSelection.cursor(from + insert.length + 1), changes: localChanges };
    });

    if (dont) return false;
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
};

/** Standard Continue-Markup Befehl für TiddlyWiki */
export const insertNewlineContinueMarkup: StateCommand = insertNewlineContinueMarkupCommand();

// ============================================================================
// Delete Markup Backward Command
// ============================================================================

function isMark(node: SyntaxNode): boolean {
  return node.name === "QuoteMark" || node.name === "ListMark" || node.name === "HeadingMark";
}

function contextNodeForDelete(tree: Tree, pos: number): SyntaxNode {
  let node = tree.resolveInner(pos, -1);
  let scan = pos;

  if (isMark(node)) {
    scan = node.from;
    node = node.parent!;
  }

  for (let prev; (prev = node.childBefore(scan)); ) {
    if (isMark(prev)) {
      scan = prev.from;
    } else if (
      prev.name === "NumberedList" ||
      prev.name === "BulletList" ||
      prev.name === "DefinitionList"
    ) {
      node = prev.lastChild!;
      scan = node.to;
    } else {
      break;
    }
  }

  return node;
}

/** Befehl zum Löschen von Markup rückwärts */
export const deleteMarkupBackward: StateCommand = ({ state, dispatch }) => {
  if (!dispatch) return false;

  const tree = syntaxTree(state);
  let dont: { range: any } | null = null;

  const changes = state.changeByRange((range) => {
    const pos = range.from;
    const { doc } = state;

    if (range.empty && tiddlywikiLanguage.isActiveAt(state, range.from)) {
      const line = doc.lineAt(pos);
      const context = getContext(contextNodeForDelete(tree, pos), doc);

      if (context.length) {
        const inner = context[context.length - 1];
        const spaceEnd = inner.to - inner.spaceAfter.length + (inner.spaceAfter ? 1 : 0);

        // Lösche überschüssige Leerzeichen nach Markup
        if (
          pos - line.from > spaceEnd &&
          !/\S/.test(line.text.slice(spaceEnd, pos - line.from))
        ) {
          return {
            range: EditorSelection.cursor(line.from + spaceEnd),
            changes: { from: line.from + spaceEnd, to: pos }
          };
        }

        if (
          pos - line.from === spaceEnd &&
          (!inner.item || line.from <= inner.item.from || !/\S/.test(line.text.slice(0, inner.to)))
        ) {
          const start = line.from + inner.from;

          // Ersetze List-Marker durch Leerzeichen
          if (
            inner.item &&
            inner.node.from < inner.item.from &&
            /\S/.test(line.text.slice(inner.from, inner.to))
          ) {
            let insert = inner.blank(
              countColumn(line.text, 4, inner.to) - countColumn(line.text, 4, inner.from)
            );
            if (start === line.from) insert = normalizeIndent(insert, state);
            return {
              range: EditorSelection.cursor(start + insert.length),
              changes: { from: start, to: line.from + inner.to, insert }
            };
          }

          // Lösche eine Ebene der Einrückung
          if (start < pos) {
            return { range: EditorSelection.cursor(start), changes: { from: start, to: pos } };
          }
        }
      }
    }
    return (dont = { range });
  });

  if (dont) return false;
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "delete" }));
  return true;
};

// ============================================================================
// Toggle Formatting Commands
// ============================================================================

function toggleInlineFormat(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
  marker: string
): boolean {
  if (!dispatch) return false;

  const changes: ChangeSpec[] = [];

  for (const range of state.selection.ranges) {
    if (range.empty) {
      changes.push({ from: range.from, insert: marker + marker });
    } else {
      const text = state.doc.sliceString(range.from, range.to);

      if (text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2) {
        changes.push({
          from: range.from,
          to: range.to,
          insert: text.slice(marker.length, -marker.length)
        });
      } else {
        changes.push({ from: range.from, insert: marker });
        changes.push({ from: range.to, insert: marker });
      }
    }
  }

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
  return true;
}

/** Toggle Bold ('' '') */
export const toggleBold: StateCommand = ({ state, dispatch }) =>
  toggleInlineFormat(state, dispatch, "''");

/** Toggle Italic (// //) */
export const toggleItalic: StateCommand = ({ state, dispatch }) =>
  toggleInlineFormat(state, dispatch, "//");

/** Toggle Underline (__ __) */
export const toggleUnderline: StateCommand = ({ state, dispatch }) =>
  toggleInlineFormat(state, dispatch, "__");

/** Toggle Strikethrough (~~ ~~) */
export const toggleStrikethrough: StateCommand = ({ state, dispatch }) =>
  toggleInlineFormat(state, dispatch, "~~");

/** Toggle Superscript (^^ ^^) */
export const toggleSuperscript: StateCommand = ({ state, dispatch }) =>
  toggleInlineFormat(state, dispatch, "^^");

/** Toggle Subscript (,, ,,) */
export const toggleSubscript: StateCommand = ({ state, dispatch }) =>
  toggleInlineFormat(state, dispatch, ",,");

/** Toggle Inline Code (` `) */
export const toggleInlineCode: StateCommand = ({ state, dispatch }) =>
  toggleInlineFormat(state, dispatch, "`");

// ============================================================================
// Insert Link / Transclusion / Macro Commands
// ============================================================================

/** Fügt einen WikiLink ein */
export const insertWikiLink: StateCommand = ({ state, dispatch }) => {
  if (!dispatch) return false;

  const changes: ChangeSpec[] = [];
  const selection = state.selection;

  for (const range of selection.ranges) {
    if (range.empty) {
      changes.push({ from: range.from, insert: "[[]]" });
    } else {
      const text = state.doc.sliceString(range.from, range.to);
      changes.push({ from: range.from, to: range.to, insert: `[[${text}]]` });
    }
  }

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** Fügt eine Transclusion ein */
export const insertTransclusion: StateCommand = ({ state, dispatch }) => {
  if (!dispatch) return false;

  const changes: ChangeSpec[] = [];

  for (const range of state.selection.ranges) {
    if (range.empty) {
      changes.push({ from: range.from, insert: "{{}}" });
    } else {
      const text = state.doc.sliceString(range.from, range.to);
      changes.push({ from: range.from, to: range.to, insert: `{{${text}}}` });
    }
  }

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** Fügt einen Macro-Aufruf ein */
export const insertMacroCall: StateCommand = ({ state, dispatch }) => {
  if (!dispatch) return false;

  const changes: ChangeSpec[] = [];

  for (const range of state.selection.ranges) {
    if (range.empty) {
      changes.push({ from: range.from, insert: "<<>>" });
    } else {
      const text = state.doc.sliceString(range.from, range.to);
      changes.push({ from: range.from, to: range.to, insert: `<<${text}>>` });
    }
  }

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
  return true;
};

// ============================================================================
// Heading Commands
// ============================================================================

function setHeadingLevel(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
  level: number
): boolean {
  if (!dispatch) return false;

  const changes: ChangeSpec[] = [];
  const { doc } = state;

  for (const range of state.selection.ranges) {
    const line = doc.lineAt(range.from);
    const text = line.text;

    const match = /^(!+)\s*/.exec(text);
    const contentStart = match ? match[0].length : 0;

    const newPrefix = level > 0 ? "!".repeat(level) + " " : "";
    changes.push({ from: line.from, to: line.from + contentStart, insert: newPrefix });
  }

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
  return true;
}

/** Setzt Heading Level 1 */
export const setHeading1: StateCommand = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 1);
/** Setzt Heading Level 2 */
export const setHeading2: StateCommand = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 2);
/** Setzt Heading Level 3 */
export const setHeading3: StateCommand = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 3);
/** Setzt Heading Level 4 */
export const setHeading4: StateCommand = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 4);
/** Setzt Heading Level 5 */
export const setHeading5: StateCommand = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 5);
/** Setzt Heading Level 6 */
export const setHeading6: StateCommand = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 6);
/** Entfernt Heading */
export const removeHeading: StateCommand = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 0);

// ============================================================================
// List Commands
// ============================================================================

function toggleListMarker(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
  marker: string
): boolean {
  if (!dispatch) return false;

  const changes: ChangeSpec[] = [];
  const { doc } = state;

  for (const range of state.selection.ranges) {
    const line = doc.lineAt(range.from);
    const text = line.text;

    // Prüfe ob Zeile bereits mit diesem Marker beginnt
    const markerMatch = new RegExp(`^(${marker.replace(/[*#]/g, "\\$&")}+)\\s*`).exec(text);

    if (markerMatch) {
      changes.push({ from: line.from, to: line.from + markerMatch[0].length, insert: "" });
    } else {
      const otherMatch = /^([*#;:]+)\s*/.exec(text);
      if (otherMatch) {
        changes.push({ from: line.from, to: line.from + otherMatch[0].length, insert: marker + " " });
      } else {
        changes.push({ from: line.from, insert: marker + " " });
      }
    }
  }

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
  return true;
}

/** Toggle Bullet List (* ) */
export const toggleBulletList: StateCommand = ({ state, dispatch }) => toggleListMarker(state, dispatch, "*");
/** Toggle Numbered List (# ) */
export const toggleNumberedList: StateCommand = ({ state, dispatch }) => toggleListMarker(state, dispatch, "#");

// ============================================================================
// Code Block Commands
// ============================================================================

/** Fügt einen Code-Block ein oder wickelt Selektion in Code-Block */
export const insertCodeBlock: StateCommand = ({ state, dispatch }) => {
  if (!dispatch) return false;

  const changes: ChangeSpec[] = [];

  for (const range of state.selection.ranges) {
    if (range.empty) {
      const line = state.doc.lineAt(range.from);
      const insert = "```\n\n```";
      changes.push({ from: line.from, insert: insert + "\n" });
    } else {
      const text = state.doc.sliceString(range.from, range.to);
      changes.push({ from: range.from, to: range.to, insert: "```\n" + text + "\n```" });
    }
  }

  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** Fügt eine horizontale Linie ein */
export const insertHorizontalRule: StateCommand = ({ state, dispatch }) => {
  if (!dispatch) return false;

  const line = state.doc.lineAt(state.selection.main.from);
  dispatch(
    state.update({
      changes: { from: line.to, insert: "\n---\n" },
      scrollIntoView: true,
      userEvent: "input"
    })
  );
  return true;
};
