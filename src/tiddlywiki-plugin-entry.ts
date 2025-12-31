/**
 * TiddlyWiki5 CodeMirror 6 Plugin Entry Point
 * 
 * This module exports the plugin interface expected by the CM6 engine.
 * It provides TiddlyWiki5 syntax highlighting and language support.
 * 
 * module-type: codemirror6-plugin
 */

import {Extension} from "@codemirror/state"
import {keymap} from "@codemirror/view"
import {tiddlywikiLanguage, tiddlywikiBaseLanguage, headerIndent} from "./codemirror-tiddlywiki"
import {
  insertNewlineContinueMarkup,
  deleteMarkupBackward,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  toggleSuperscript,
  toggleSubscript,
  toggleInlineCode,
  insertWikiLink,
  insertTransclusion,
  setHeading1,
  setHeading2,
  setHeading3,
  setHeading4,
  setHeading5,
  setHeading6,
  removeHeading,
  toggleBulletList,
  toggleNumberedList,
  insertCodeBlock
} from "./commands"

// Re-export for external use
export {tiddlywikiLanguage, tiddlywikiBaseLanguage}
export * from "./commands"

/**
 * Plugin configuration interface
 * This is the contract that CM6 plugins must follow
 */
export interface CM6PluginContext {
  /** The tiddler being edited */
  tiddlerTitle?: string
  /** The tiddler's content type */
  tiddlerType?: string
  /** The tiddler fields */
  tiddlerFields?: Record<string, any>
  /** Whether the editor is read-only */
  readOnly?: boolean
  /** The CM6 core library reference */
  cm6Core?: any
  /** Additional options passed from the widget */
  [key: string]: any
}

/**
 * Plugin condition types
 */
export type PluginCondition = (context: CM6PluginContext) => boolean

/**
 * Plugin definition interface
 */
export interface CM6PluginDefinition {
  /** Unique plugin name */
  name: string
  /** Plugin description */
  description?: string
  /** Priority for extension ordering (higher = loaded first, default 0) */
  priority?: number
  /** 
   * Condition function - returns true if plugin should be active
   * If not provided, plugin is always active
   */
  condition?: PluginCondition
  /**
   * Returns CodeMirror 6 extensions for this plugin
   */
  getExtensions: (context: CM6PluginContext) => Extension[]
}

// ============================================================================
// TiddlyWiki Language Plugin Definition
// ============================================================================

/**
 * Standard TiddlyWiki keymap
 */
const tiddlywikiKeymap = keymap.of([
  {key: "Enter", run: insertNewlineContinueMarkup},
  {key: "Backspace", run: deleteMarkupBackward},
  {key: "Mod-b", run: toggleBold},
  {key: "Mod-i", run: toggleItalic},
  {key: "Mod-u", run: toggleUnderline},
  {key: "Mod-`", run: toggleInlineCode},
  {key: "Mod-k", run: insertWikiLink},
  {key: "Mod-Shift-k", run: insertTransclusion},
  {key: "Mod-1", run: setHeading1},
  {key: "Mod-2", run: setHeading2},
  {key: "Mod-3", run: setHeading3},
  {key: "Mod-4", run: setHeading4},
  {key: "Mod-5", run: setHeading5},
  {key: "Mod-6", run: setHeading6},
  {key: "Mod-0", run: removeHeading},
  {key: "Mod-Shift-8", run: toggleBulletList},
  {key: "Mod-Shift-7", run: toggleNumberedList},
  {key: "Mod-Shift-c", run: insertCodeBlock},
])

/**
 * Condition: Only activate for TiddlyWiki content types
 */
function isTiddlyWikiType(context: CM6PluginContext): boolean {
  const type = context.tiddlerType
  
  // No type = default TiddlyWiki wikitext
  if (!type || type === "") {
    return true
  }
  
  // Explicit TiddlyWiki types
  const twTypes = [
    "text/vnd.tiddlywiki",
    "text/x-tiddlywiki",
    // Also handle these as they often contain wikitext
    "text/vnd.tiddlywiki-multiple"
  ]
  
  return twTypes.includes(type)
}

/**
 * Get extensions based on context
 */
function getExtensions(context: CM6PluginContext): Extension[] {
  const extensions: Extension[] = []
  
  // Always add language support
  extensions.push(tiddlywikiLanguage)
  
  // Add header folding support
  extensions.push(headerIndent)
  
  // Add keymap unless read-only
  if (!context.readOnly) {
    extensions.push(tiddlywikiKeymap)
  }
  
  return extensions
}

/**
 * The plugin definition exported for the engine
 */
export const plugin: CM6PluginDefinition = {
  name: "tiddlywiki-syntax",
  description: "TiddlyWiki5 Wikitext syntax highlighting and editing support",
  priority: 100, // High priority - language support should load early
  condition: isTiddlyWikiType,
  getExtensions: getExtensions
}

// Default export for convenient requiring
export default plugin
