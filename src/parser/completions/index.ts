/**
 * TiddlyWiki Autocompletion Sources
 *
 * This module exports all completion sources for TiddlyWiki language support.
 */

// Common utilities and constants
export {
  triggerCompletionEffect,
  triggerCompletionOnAccept,
  selfClosingTags,
  selfClosingWidgets,
  builtInVariables,
  defaultFieldNames,
  buildMultiSelectionChanges,
  getTiddlerBoost,
  extractLocalDefinitions,
} from "./common"

// Widget completions
export {
  coreWidgets,
  widgetAttributes,
  widgetCompletion,
  widgetAttributeCompletion,
  closingTagCompletion,
} from "./widget"

// Attribute value completions
export {
  defaultStoryViews,
  defaultDeserializers,
  tiddlyWikiMessages,
  attributeValueCompletion,
  wikitextAttributeCompletion,
} from "./attribute-value"

// Macro completions
export {
  commonMacros,
  macroCompletion,
  mvvCompletion,
  macroParamCompletion,
  macroParamValueCompletion,
  substitutedParamCompletion,
} from "./macro"

// Tiddler completions
export {
  tiddlerCompletion,
  systemTiddlerCompletion,
  transclusionFieldCompletion,
} from "./tiddler"

// HTML completions
export {
  commonHtmlTags,
  htmlGlobalAttributes,
  htmlTagAttributes,
  htmlTagCompletion,
  htmlAttributeCompletion,
} from "./html"

// Filter completions
export {
  coreFilterOperators,
  filterRunPrefixes,
  filterOperatorMeta,
  filterOperatorCompletion,
  filterRunPrefixCompletion,
  filterOperatorSuffixCompletion,
  filterOperandValueCompletion,
  imageLinkCompletion,
} from "./filter"
export type { FilterBracketMode } from "./filter"

// Conditional completions
export {
  conditionalCompletion,
} from "./conditional"

// Pragma completions
export {
  pragmaCompletion,
  pragmaEndNameCompletion,
  rulesKeywordCompletion,
  whitespaceValueCompletion,
  parsermodeValueCompletion,
} from "./pragma"

// Wiki rule completions
export {
  coreWikiRules,
  wikiruleCompletion,
  WikiRuleInfo,
} from "./wikirule"

// General context completions
export {
  generalContextCompletion,
} from "./general"

// Code block completions
export {
  fencedCodeCompletion,
  typedBlockCompletion,
} from "./codeblock"

// Styled span completions
export {
  styledSpanClassCompletion,
  styledSpanPropertyCompletion,
  blockQuoteClassCompletion,
} from "./styled-span"
