/**
 * TiddlyWiki Language Support
 *
 * This module re-exports all TiddlyWiki language support components.
 * The implementation has been split into separate modules for maintainability.
 *
 * Note: tiddlywikiLanguage and headerIndent are exported from ./language (via index.ts)
 */

// Main entry point (tiddlywiki function only - language/headerIndent come from ./language)
export { tiddlywiki } from "./tiddlywiki"

// Configuration types
export { TiddlyWikiLanguageConfig } from "./config"

// Highlighting
export { tiddlywikiHighlightStyle } from "./highlighting"

// Keymap
export { tiddlywikiKeymap, createTiddlywikiKeymap } from "./keymap"
export type { TabBehavior, ShiftTabBehavior, EnterIndentBehavior, KeymapConfig } from "./keymap"

// Mixed language support
export { mimeToLanguage, createMixedLanguageWrapper } from "./mixed-language"

// Completion sources (for advanced customization)
export {
  triggerCompletionEffect,
  triggerCompletionOnAccept,
  selfClosingTags,
  selfClosingWidgets,
  buildMultiSelectionChanges,
  extractLocalDefinitions,
  widgetCompletion,
  widgetAttributeCompletion,
  attributeValueCompletion,
  wikitextAttributeCompletion,
  macroCompletion,
  macroParamCompletion,
  tiddlerCompletion,
  systemTiddlerCompletion,
  transclusionFieldCompletion,
  htmlTagCompletion,
  htmlAttributeCompletion,
  filterOperatorCompletion,
  filterRunPrefixCompletion,
  filterOperatorSuffixCompletion,
  filterOperandValueCompletion,
  conditionalCompletion,
  pragmaCompletion,
  pragmaEndNameCompletion,
  coreWikiRules,
  wikiruleCompletion,
  generalContextCompletion,
// @ts-expect-error TS(2792): Cannot find module './completions'. Did you mean t... Remove this comment to see the full error message
} from "./completions"
