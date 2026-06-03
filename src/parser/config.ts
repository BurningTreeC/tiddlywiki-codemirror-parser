/**
 * TiddlyWiki Language Configuration
 *
 * Defines the configuration interface for TiddlyWiki language support.
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { Language, LanguageSupport, LanguageDescription } from "@codemirror/language"
import { TiddlyWikiConfig } from "./core"

/**
 * Configuration options for TiddlyWiki language support
 */
export interface TiddlyWikiLanguageConfig {
  /**
   * Default language for code blocks without a language specifier
   */
  defaultCodeLanguage?: Language | LanguageSupport

  /**
   * Languages available for syntax highlighting in fenced code blocks.
   * Can be an array of LanguageDescriptions or a function that returns
   * a Language for a given info string.
   */
  codeLanguages?: readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null)

  /**
   * Whether to add the TiddlyWiki keymap (default: true)
   */
  addKeymap?: boolean

  /**
   * Parser extensions to add
   */
  extensions?: TiddlyWikiConfig

  /**
   * Base language to use (default: tiddlywikiLanguage)
   */
  base?: Language

  /**
   * Whether to enable HTML tag completion (default: true)
   */
  completeHTMLTags?: boolean

  /**
   * Whether to enable widget completion (default: true)
   */
  completeWidgets?: boolean

  /**
   * Whether to enable macro completion (default: true)
   */
  completeMacros?: boolean

  /**
   * Whether to enable tiddler title completion in links (default: true)
   */
  completeTiddlers?: boolean

  /**
   * Function to get tiddler titles for completion
   */
  getTiddlerTitles?: () => string[]

  /**
   * Function to check if a tiddler is a draft (has draft.of field).
   * Draft tiddlers are deprioritized in completion lists.
   */
  isDraftTiddler?: (title: string) => boolean

  /**
   * Function to get image tiddler titles for [img[ completion
   */
  getImageTiddlerTitles?: () => string[]

  /**
   * Function to get macro names for completion
   */
  getMacroNames?: () => string[]

  /**
   * Function to get macro/procedure/function parameters for completion.
   * Returns array of parameter names, or null if macro not found.
   */
  getMacroParams?: (macroName: string) => string[] | null

  /**
   * Function to get widget names for completion
   */
  getWidgetNames?: () => string[]

  /**
   * Function to get widget attributes for completion.
   * Returns array of attribute names for the widget, or null to use built-in defaults.
   * This allows TiddlyWiki to introspect widget modules dynamically.
   */
  getWidgetAttributes?: (widgetName: string) => string[] | null

  /**
   * Whether to enable filter operator completion (default: true)
   */
  completeFilterOperators?: boolean

  /**
   * Whether to enable filter run prefix completion (default: true)
   */
  completeFilterRunPrefixes?: boolean

  /**
   * Function to get filter operator names for completion
   */
  getFilterOperators?: () => string[]

  /**
   * Function to get field names for completion in filter operators like has[], get[], sort[]
   */
  getFieldNames?: () => string[]

  /**
   * Function to get tag names for completion in filter operators like tag[], tagging[]
   */
  getTagNames?: () => string[]

  /**
   * Function to get tiddler type names for completion in type[] filter operator
   * Should return content types like "text/vnd.tiddlywiki", "text/plain", etc.
   */
  getTypeNames?: () => string[]

  /**
   * Function to get file extensions for typed block ($$$.ext) completion
   * Should return extensions like ".svg", ".js", ".css" etc.
   */
  getFileExtensions?: () => string[]

  /**
   * Function to get function names for completion in function[], subfilter[]
   */
  getFunctionNames?: () => string[]

  /**
   * Function to get variable names for completion in getvariable[]
   */
  getVariableNames?: () => string[]

  /**
   * Function to get index/property names for a specific tiddler (for {{tiddler##index}} completion)
   * The tiddler title is passed so indexes can be fetched from the tiddler's data
   */
  getTiddlerIndexes?: (tiddlerTitle: string) => string[]

  /**
   * Function to get field names for a specific tiddler (for {{tiddler!!field}} completion)
   * Returns only the fields that exist on that particular tiddler
   */
  getTiddlerFields?: (tiddlerTitle: string) => string[]

  /**
   * Function to get storyview names for completion in $list widget's storyview attribute
   */
  getStoryViews?: () => string[]

  /**
   * Function to get deserializer names for completion in deserializer attribute
   */
  getDeserializers?: () => string[]

  /**
   * Function to get CSS class names for completion in styled spans (@@.className)
   * Returns array of class names available in the page/stylesheets.
   * This is typically provided by the lang-css plugin's getPageClasses function.
   */
  getPageClasses?: () => string[]

  /**
   * Function to get CSS property names for completion in styled spans (@@property:)
   * Returns array of CSS property names.
   * This is typically provided by the lang-css plugin.
   */
  getCSSProperties?: () => string[]

  /**
   * Function to get CSS value keywords for completion in style.property-name="value" syntax.
   * Returns array of CSS value keywords (colors, keywords like 'auto', 'none', etc.).
   * This is typically provided by the lang-css plugin.
   * @deprecated Use getCSSValuesForProperty for property-specific values
   */
  getCSSValues?: () => string[]

  /**
   * Function to get CSS value keywords for a specific property.
   * Returns array of valid values for that CSS property.
   * This is typically provided by the lang-css plugin.
   */
  getCSSValuesForProperty?: (propertyName: string) => string[]

  /**
   * Language support for HTML tags (default: html without tag matching)
   */
  htmlTagLanguage?: LanguageSupport

  /**
   * Callback to get additional widgets that should auto-close with /> on completion.
   * Action widgets always auto-close. This callback returns more widgets to add to that set.
   * Called dynamically on each completion to support live configuration updates.
   * Example return: ["$transclude", "$macrocall", "$slot"]
   */
  getSelfClosingWidgets?: () => string[]

  /**
   * Function to get wiki parser rules for \rules pragma completion.
   * Returns array of { name: string, types: string } where types is like "block", "inline", or "block, inline".
   * If not provided, uses built-in fallback list.
   */
  getWikiRules?: () => { name: string; types: string }[]

  /**
   * Whether to disable CamelCase link parsing (default: false)
   * When true, CamelCase words like MyTiddler won't be parsed as links.
   * This corresponds to TiddlyWiki's $:/config/WikiParserRules/Inline/wikilink setting.
   */
  disableCamelCaseLinks?: boolean

  /**
   * Whether to enable KaTeX/LaTeX parsing (default: false)
   * When true, $$ ... $$ blocks will be parsed as LaTeX math blocks.
   * Enable this when the KaTeX plugin is installed.
   */
  enableKaTeX?: boolean

  /**
   * Callback to get Tab key behavior when cursor is outside a list.
   * Called on each Tab keypress to allow dynamic configuration.
   * Returns:
   * - "indent": Indent the current line (default if callback not provided)
   * - "insertTab": Insert a literal tab character
   * - "none": Do nothing (let other handlers process the key)
   * Note: When inside a list, Tab always adds a list marker level.
   */
  getTabOutsideListBehavior?: () => "indent" | "insertTab" | "none"

  /**
   * Callback to get Shift-Tab key behavior when cursor is outside a list.
   * Called on each Shift-Tab keypress to allow dynamic configuration.
   * Returns:
   * - "indent": Outdent the current line (default if callback not provided)
   * - "none": Do nothing (let other handlers process the key)
   * Note: When inside a list, Shift-Tab always removes a list marker level.
   */
  getShiftTabOutsideListBehavior?: () => "indent" | "none"

  /**
   * Callback to get filter operator completion bracket behavior.
   * Called on each completion to allow dynamic configuration.
   * Returns:
   * - "always": Always insert opening bracket after operator (default)
   * - "smart": Insert bracket, and smartly add closing ] only if needed
   * - "none": Never insert brackets, just the operator name
   */
  getFilterBracketMode?: () => "always" | "smart" | "none"

  /**
   * Callback to get Enter key indentation behavior.
   * Called on each Enter keypress to allow dynamic configuration.
   * Returns:
   * - "smart": Smart indentation - continue lists, indent inside widgets/tags (default)
   * - "indent": Just match the previous line's indentation
   * - "none": Insert plain newline with no indentation
   */
  getEnterIndentBehavior?: () => "smart" | "indent" | "none"

  /**
   * Whether to skip adding nested language support extensions (default: false)
   *
   * When true, codeLanguages' support.extension arrays won't be added to the
   * returned LanguageSupport. This is used internally during compartment
   * reconfiguration to avoid "Duplicate use of compartment in extensions" errors
   * when nested language extensions are already present in the editor state.
   *
   * Normal users should not need to set this option.
   */
  skipNestedLanguageExtensions?: boolean

  /**
   * Extensions for nested language completions.
   * These are data.of() extensions created once in each language's register.js
   * and passed here to be included in the TiddlyWiki LanguageSupport.
   * This ensures nested code blocks get completions without duplication.
   */
  nestedLanguageExtensions?: any[]

  /**
   * Completion sources for nested languages, keyed by language name.
   * These are raw completion source functions (not data.of extensions).
   * Used to provide completions in nested code blocks without duplication.
   * @deprecated Use nestedLanguageCompletions instead for dynamic detection
   */
  nestedLanguageCompletionSources?: Record<string, (context: any) => any>

  /**
   * Dynamically registered completion sources for nested languages.
   * Each entry has a name, the Language object (for isActiveAt detection),
   * and a completion source function.
   * This allows language plugins to register themselves without hardcoding.
   */
  nestedLanguageCompletions?: Array<{
    name: string
    language: any  // Language object with isActiveAt method
    source: (context: any) => any
  }>
}
