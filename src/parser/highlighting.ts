/**
 * TiddlyWiki Syntax Highlighting
 *
 * Defines the mapping from semantic tags to CSS classes for syntax highlighting.
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { HighlightStyle } from "@codemirror/language"
// @ts-expect-error TS(2792): Cannot find module '@lezer/highlight'. Did you mea... Remove this comment to see the full error message
import { tags as t } from "@lezer/highlight"
import { twTags } from "./parser"

/**
 * TiddlyWiki-specific highlight style mapping semantic tags to CSS classes
 */
export const tiddlywikiHighlightStyle = HighlightStyle.define([
  // Headings
  { tag: t.heading1, class: "cm-tw-heading1" },
  { tag: t.heading2, class: "cm-tw-heading2" },
  { tag: t.heading3, class: "cm-tw-heading3" },
  { tag: t.heading4, class: "cm-tw-heading4" },
  { tag: t.heading5, class: "cm-tw-heading5" },
  { tag: t.heading6, class: "cm-tw-heading6" },
  { tag: t.heading, class: "cm-tw-tableheader" },

  // Text formatting
  { tag: t.strong, class: "cm-tw-bold" },
  { tag: t.emphasis, class: "cm-tw-italic" },
  { tag: t.strikethrough, class: "cm-tw-strikethrough" },

  // Links
  { tag: t.link, class: "cm-tw-wikilink" },
  { tag: t.url, class: "cm-tw-url" },
  { tag: t.string, class: "cm-tw-linktext" },

  // Transclusions and macros
  { tag: t.special(t.link), class: "cm-tw-transclusion" },
  { tag: t.macroName, class: "cm-tw-macrocall" },
  { tag: t.variableName, class: "cm-tw-variable" },

  // Widgets
  { tag: t.tagName, class: "cm-tw-widget" },

  // Code
  { tag: t.monospace, class: "cm-tw-code" },
  { tag: t.labelName, class: "cm-tw-codeinfo" },

  // Pragmas and definitions
  { tag: t.definitionKeyword, class: "cm-tw-pragma" },
  { tag: t.keyword, class: "cm-tw-pragma-keyword" },
  { tag: t.controlKeyword, class: "cm-tw-conditional" },

  // Lists
  { tag: t.list, class: "cm-tw-list" },

  // Block elements
  { tag: t.quote, class: "cm-tw-blockquote" },
  { tag: t.contentSeparator, class: "cm-tw-hr" },

  // Special characters
  { tag: t.comment, class: "cm-tw-comment" },
  { tag: t.escape, class: "cm-tw-escape" },
  { tag: t.character, class: "cm-tw-entity" },

  // Processing marks
  { tag: t.processingInstruction, class: "cm-tw-mark" },

  // Filters
  { tag: t.special(t.string), class: "cm-tw-filter" },
  { tag: t.regexp, class: "cm-tw-regexp" },

  // Attributes
  { tag: t.attributeValue, class: "cm-tw-attribute-value" },
  { tag: t.attributeName, class: "cm-tw-attribute" },
  { tag: t.special(t.variableName), class: "cm-tw-param-ref" },

  // Property names (field/index references in transclusions)
  { tag: t.propertyName, class: "cm-tw-field-ref" },

  // Special emphasis (underline)
  { tag: t.special(t.emphasis), class: "cm-tw-underline" },

  // Superscript and subscript
  { tag: twTags.twSuperscript, class: "cm-tw-superscript" },
  { tag: twTags.twSubscript, class: "cm-tw-subscript" },

  // Highlight
  { tag: t.special(t.content), class: "cm-tw-highlight" },

  // Invalid/error syntax
  { tag: t.invalid, class: "cm-tw-invalid" },
])
