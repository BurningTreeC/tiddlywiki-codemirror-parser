/**
 * TiddlyWiki CodeMirror 6 Theme
 *
 * A beautiful, easy-on-the-eyes color scheme for TiddlyWiki wikitext
 * Inspired by Nord, with warm accents for better readability
 */

import {HighlightStyle, syntaxHighlighting} from "@codemirror/language"
import {Extension} from "@codemirror/state"
import {EditorView} from "@codemirror/view"
import {tags as t} from "@lezer/highlight"

// ============================================================================
// Color Palettes
// ============================================================================

const lightPalette = {
  // Base
  background: "#fafafa",
  foreground: "#2e3440",
  selection: "#d8dee9",
  cursor: "#3b4252",
  lineHighlight: "#eceff41a",

  // Syntax - Blues & Cyans
  heading: "#5e81ac",
  headingMark: "#81a1c1",
  link: "#5e81ac",
  linkTarget: "#81a1c1",
  url: "#88c0d0",

  // Syntax - Warm accents
  bold: "#bf616a",
  italic: "#a3be8c",
  underline: "#d08770",
  strikethrough: "#888a85",
  highlight: "#ebcb8b",
  highlightBg: "#ebcb8b22",

  // Transclusions & Filters
  transclusion: "#b48ead",
  transclusionTarget: "#a3688a",
  filter: "#bf616a",
  filterOperator: "#d08770",
  filterOperand: "#a3be8c",
  filterVariable: "#88c0d0",

  // Macros & Widgets
  macro: "#d08770",
  macroName: "#c96a48",
  widget: "#8fbcbb",
  widgetName: "#5e9c98",
  attributeName: "#88c0d0",
  attributeValue: "#a3be8c",

  // Code
  code: "#bf616a",
  codeBg: "#f0f0f0",
  codeInfo: "#b48ead",

  // Structure
  listMark: "#d08770",
  quote: "#a3be8c",
  quoteMark: "#8aa57a",
  tableDelimiter: "#b48ead",
  hr: "#4c566a",

  // Meta
  comment: "#8a9199",
  pragma: "#b48ead",
  pragmaKeyword: "#a3688a",
  pragmaName: "#bf616a",

  // Special
  escape: "#d08770",
  entity: "#88c0d0",
  variable: "#ebcb8b",
  mark: "#9ca3ad",
  conditional: "#b48ead",
}

const darkPalette = {
  // Base
  background: "#2e3440",
  foreground: "#eceff4",
  selection: "#434c5e",
  cursor: "#d8dee9",
  lineHighlight: "#3b425215",

  // Syntax - Blues & Cyans
  heading: "#88c0d0",
  headingMark: "#81a1c1",
  link: "#88c0d0",
  linkTarget: "#81a1c1",
  url: "#8fbcbb",

  // Syntax - Warm accents
  bold: "#bf616a",
  italic: "#a3be8c",
  underline: "#d08770",
  strikethrough: "#6b7280",
  highlight: "#ebcb8b",
  highlightBg: "#ebcb8b33",

  // Transclusions & Filters
  transclusion: "#b48ead",
  transclusionTarget: "#c792b6",
  filter: "#bf616a",
  filterOperator: "#d08770",
  filterOperand: "#a3be8c",
  filterVariable: "#88c0d0",

  // Macros & Widgets
  macro: "#ebcb8b",
  macroName: "#d9b96e",
  widget: "#8fbcbb",
  widgetName: "#6eb0ac",
  attributeName: "#88c0d0",
  attributeValue: "#a3be8c",

  // Code
  code: "#bf616a",
  codeBg: "#3b4252",
  codeInfo: "#b48ead",

  // Structure
  listMark: "#d08770",
  quote: "#a3be8c",
  quoteMark: "#8fbcbb",
  tableDelimiter: "#b48ead",
  hr: "#81a1c1",

  // Meta
  comment: "#616e7c",
  pragma: "#b48ead",
  pragmaKeyword: "#c792b6",
  pragmaName: "#bf616a",

  // Special
  escape: "#d08770",
  entity: "#88c0d0",
  variable: "#ebcb8b",
  mark: "#6b7280",
  conditional: "#b48ead",
}

// ============================================================================
// Theme Creator
// ============================================================================

function createTheme(palette: typeof lightPalette, isDark: boolean) {
  const editorTheme = EditorView.theme({
    "&": {
      color: palette.foreground,
      backgroundColor: palette.background,
    },
    ".cm-content": {
      caretColor: palette.cursor,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Source Code Pro", "Menlo", monospace',
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: palette.cursor,
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: palette.selection,
    },
    ".cm-activeLine": {
      backgroundColor: palette.lineHighlight,
    },
    ".cm-activeLineGutter": {
      backgroundColor: palette.lineHighlight,
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: `1px solid ${palette.selection}`,
      color: palette.comment,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 12px",
    },
    // Autocomplete
    ".cm-tooltip.cm-tooltip-autocomplete": {
      backgroundColor: palette.background,
      border: `1px solid ${palette.selection}`,
      borderRadius: "6px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: palette.selection,
      color: palette.foreground,
    },
    ".cm-completionMatchedText": {
      color: palette.link,
      fontWeight: "600",
      textDecoration: "none",
    },
    ".cm-completionDetail": {
      color: palette.comment,
      fontStyle: "italic",
    },
  }, { dark: isDark })

  const highlightStyle = HighlightStyle.define([
    // Headings
    { tag: t.heading1, color: palette.heading, fontWeight: "600", fontSize: "1.5em" },
    { tag: t.heading2, color: palette.heading, fontWeight: "600", fontSize: "1.35em" },
    { tag: t.heading3, color: palette.heading, fontWeight: "600", fontSize: "1.2em" },
    { tag: t.heading4, color: palette.heading, fontWeight: "600", fontSize: "1.1em" },
    { tag: t.heading5, color: palette.heading, fontWeight: "600", fontSize: "1.05em" },
    { tag: t.heading6, color: palette.heading, fontWeight: "600" },

    // Text formatting
    { tag: t.strong, color: palette.bold, fontWeight: "700" },
    { tag: t.emphasis, color: palette.italic, fontStyle: "italic" },
    { tag: t.strikethrough, color: palette.strikethrough, textDecoration: "line-through" },
    { tag: t.special(t.emphasis), color: palette.underline, textDecoration: "underline" },
    { tag: t.special(t.content), backgroundColor: palette.highlightBg, color: palette.highlight },

    // Code
    { tag: t.monospace, color: palette.code, backgroundColor: palette.codeBg, borderRadius: "3px" },
    { tag: t.labelName, color: palette.codeInfo, fontStyle: "italic" },

    // Links
    { tag: t.link, color: palette.link },
    { tag: t.url, color: palette.url },
    { tag: t.string, color: palette.linkTarget },

    // Special links (transclusions)
    { tag: t.special(t.link), color: palette.transclusion },
    { tag: t.special(t.string), color: palette.transclusionTarget },

    // Properties
    { tag: t.propertyName, color: palette.attributeName },

    // Operators and filters
    { tag: t.operator, color: palette.filterOperator },
    { tag: t.operatorKeyword, color: palette.filter, fontWeight: "500" },
    { tag: t.regexp, color: palette.escape },

    // Macros
    { tag: t.macroName, color: palette.macro, fontWeight: "500" },

    // Widgets/HTML
    { tag: t.tagName, color: palette.widget, fontWeight: "500" },
    { tag: t.attributeName, color: palette.attributeName },
    { tag: t.attributeValue, color: palette.attributeValue },
    { tag: t.number, color: palette.filterOperator },

    // Lists & structure
    { tag: t.list, color: palette.foreground },
    { tag: t.quote, color: palette.quote, fontStyle: "italic" },
    { tag: t.heading, color: palette.heading, fontWeight: "600" },
    { tag: t.contentSeparator, color: palette.hr },

    // Comments
    { tag: t.comment, color: palette.comment, fontStyle: "italic" },

    // Pragmas & definitions
    { tag: t.definitionKeyword, color: palette.pragma, fontWeight: "600" },
    { tag: t.keyword, color: palette.pragmaKeyword, fontWeight: "500" },
    { tag: t.controlKeyword, color: palette.conditional, fontWeight: "600" },
    { tag: t.definition(t.macroName), color: palette.pragmaName },
    { tag: t.definition(t.variableName), color: palette.variable },
    { tag: t.className, color: palette.widget },

    // Variables
    { tag: t.variableName, color: palette.filterVariable },
    { tag: t.special(t.variableName), color: palette.variable, fontWeight: "500" },

    // Special characters
    { tag: t.escape, color: palette.escape },
    { tag: t.character, color: palette.entity },
    { tag: t.punctuation, color: palette.foreground },
    { tag: t.processingInstruction, color: palette.mark },
  ])

  return [editorTheme, syntaxHighlighting(highlightStyle)]
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Light theme for TiddlyWiki syntax highlighting
 */
export const tiddlywikiLightTheme: Extension = createTheme(lightPalette, false)

/**
 * Dark theme for TiddlyWiki syntax highlighting
 */
export const tiddlywikiDarkTheme: Extension = createTheme(darkPalette, true)

/**
 * Default theme (light)
 */
export const tiddlywikiTheme = tiddlywikiLightTheme

/**
 * Get theme based on preference
 */
export function getTiddlywikiTheme(dark: boolean = false): Extension {
  return dark ? tiddlywikiDarkTheme : tiddlywikiLightTheme
}

/**
 * Color palettes for external use
 */
export { lightPalette, darkPalette }
