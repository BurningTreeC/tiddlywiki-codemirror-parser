/**
 * TiddlyWiki Language Support
 *
 * This module re-exports all TiddlyWiki language support components.
 * The implementation has been split into separate modules for maintainability.
 *
 * Note: tiddlywikiLanguage and headerIndent are exported from ./language (via index.ts)
 */
// Main entry point (tiddlywiki function only - language/headerIndent come from ./language)
export { tiddlywiki } from "./tiddlywiki";
// Highlighting
export { tiddlywikiHighlightStyle } from "./highlighting";
// Keymap
export { tiddlywikiKeymap, createTiddlywikiKeymap } from "./keymap";
// Mixed language support
export { mimeToLanguage, createMixedLanguageWrapper } from "./mixed-language";
// Completion sources (for advanced customization)
export { triggerCompletionEffect, triggerCompletionOnAccept, selfClosingTags, selfClosingWidgets, buildMultiSelectionChanges, extractLocalDefinitions, widgetCompletion, widgetAttributeCompletion, attributeValueCompletion, wikitextAttributeCompletion, macroCompletion, macroParamCompletion, tiddlerCompletion, systemTiddlerCompletion, transclusionFieldCompletion, htmlTagCompletion, htmlAttributeCompletion, filterOperatorCompletion, filterRunPrefixCompletion, filterOperatorSuffixCompletion, filterOperandValueCompletion, conditionalCompletion, pragmaCompletion, pragmaEndNameCompletion, coreWikiRules, wikiruleCompletion, generalContextCompletion, } from "./completions";
//# sourceMappingURL=extensions.js.map