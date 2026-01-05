/**
 * TiddlyWiki5 CodeMirror 6 Plugin Entry Point
 * 
 * This module exports the plugin interface expected by the CM6 engine.
 * It provides TiddlyWiki5 syntax highlighting and language support.
 * 
 * module-type: codemirror6-plugin
 */

import {Extension, Compartment, Prec} from "@codemirror/state"
import {keymap, EditorView} from "@codemirror/view"
import {LanguageDescription} from "@codemirror/language"
import {tiddlywikiLanguage, headerIndent, tiddlywiki} from "./tiddlywiki-parser"
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

// ============================================================================
// Re-exports for external use
// ============================================================================

// tiddlywiki() returns LanguageSupport (use for reconfigureLanguage)
// tiddlywikiLanguage is the Language instance
export {tiddlywikiLanguage, tiddlywiki}

// Backwards compatibility alias
export const tiddlywikiBaseLanguage = tiddlywikiLanguage

// Alias for backwards compatibility with existing engines
export const TiddlyWikiLanguage = tiddlywikiLanguage

export * from "./commands"

// ============================================================================
// Types
// ============================================================================

/**
 * Plugin context interface - matches engine's buildPluginContext
 */
export interface CM6PluginContext {
  tiddlerTitle: string | null
  tiddlerType: string | null
  tiddlerFields: Record<string, any> | null
  readOnly: boolean
  cm6Core: any
  engine: any
  options: Record<string, any>
}

/**
 * Engine interface (subset of what we use)
 */
interface CM6Engine {
  _destroyed: boolean
  _compartments: Record<string, Compartment>
  view: EditorView
  // Methods may be added by other plugins
  [key: string]: any
}

// ============================================================================
// Module State
// ============================================================================

let _core: any = null
let _currentEngine: CM6Engine | null = null

// ============================================================================
// Constants
// ============================================================================

/**
 * TiddlyWiki content types that activate this plugin
 */
const TW_TYPES = [
  "",  // Empty = default wikitext
  "text/vnd.tiddlywiki",
  "text/x-tiddlywiki",
  "application/x-tiddler-dictionary"
]

/**
 * Compartment name for this plugin
 */
const COMPARTMENT_NAME = "tiddlywikiLanguage"

// ============================================================================
// Keymap
// ============================================================================

/**
 * Standard TiddlyWiki keymap
 */
const tiddlywikiKeymap = Prec.high(keymap.of([
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
]))

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create command target from EditorView
 */
function getCommandTarget(view: EditorView) {
  return {
    state: view.state,
    dispatch: view.dispatch.bind(view)
  }
}

// Declare $tw global (provided by TiddlyWiki)
declare const $tw: any

/**
 * Get tiddler titles for autocompletion
 * Uses widget.wiki for proper context
 */
function getTiddlerTitles(): string[] {
  if (typeof $tw === "undefined") return []
  try {
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    if (!wiki) return []
    // Get all tiddlers including shadows, with system tiddlers ($:/) sorted last
    return wiki.filterTiddlers("[all[tiddlers+shadows]!prefix[$:/]sort[title]] [all[tiddlers+shadows]prefix[$:/]sort[title]]") || []
  } catch (e) {
    return []
  }
}

/**
 * Get image tiddler titles for [img[ autocompletion
 * Filters for tiddlers with type starting with "image/"
 */
function getImageTiddlerTitles(): string[] {
  if (typeof $tw === "undefined") return []
  try {
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    if (!wiki) return []
    // Get tiddlers with image type using is[image] operator
    return wiki.filterTiddlers("[all[tiddlers+shadows]is[image]]") || []
  } catch (e) {
    return []
  }
}

/**
 * Get macro names for autocompletion
 * Uses widget.wiki for proper context
 */
function getMacroNames(): string[] {
  if (typeof $tw === "undefined") return []
  try {
    const names: string[] = []
    // Get built-in macros
    if ($tw.macros) {
      names.push(...Object.keys($tw.macros))
    }
    // Get macro tiddlers (both $:/tags/Macro and $:/tags/Global)
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    if (wiki) {
      const macroTiddlers = wiki.filterTiddlers("[all[tiddlers+shadows]tag[$:/tags/Macro]] [all[tiddlers+shadows]tag[$:/tags/Global]]") || []
      for (const title of macroTiddlers) {
        // Extract macro/procedure/function names from tiddler
        const tiddler = wiki.getTiddler(title)
        if (tiddler) {
          const text = tiddler.fields.text || ""
          // Match \define, \procedure, \function declarations
          const defineMatches = text.matchAll(/\\(?:define|procedure|function)\s+([^\s(]+)/g)
          for (const match of defineMatches) {
            names.push(match[1])
          }
        }
      }
    }
    return [...new Set(names)] // deduplicate
  } catch (e) {
    return []
  }
}

/**
 * Get widget names for autocompletion
 */
function getWidgetNames(): string[] {
  if (typeof $tw === "undefined") return []
  try {
    const names: string[] = []
    // Get widget names from $tw.widgets (they don't have $ prefix in the registry)
    if ($tw.widgets) {
      for (const name of Object.keys($tw.widgets)) {
        names.push("$" + name)
      }
    }
    return names
  } catch (e) {
    return []
  }
}

/**
 * Get filter operator names for autocompletion
 * Uses widget.wiki for proper context
 */
function getFilterOperators(): string[] {
  if (typeof $tw === "undefined") return []
  try {
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    // Filter operators are registered in wiki.filterOperators
    if (wiki?.filterOperators) {
      return Object.keys(wiki.filterOperators).sort()
    }
    return []
  } catch (e) {
    return []
  }
}

/**
 * Get tag names for autocompletion in tag[], tagging[] operators
 * Uses [all[tiddlers+shadows]is[tag]] filter
 */
function getTagNames(): string[] {
  if (typeof $tw === "undefined") return []
  try {
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    if (!wiki) return []
    return wiki.filterTiddlers("[all[tiddlers+shadows]is[tag]]") || []
  } catch (e) {
    return []
  }
}

/**
 * Get macro/procedure/function parameters for autocompletion
 * Uses widget.wiki for proper context (locally defined macros/procedures)
 */
function getMacroParams(macroName: string): string[] | null {
  if (typeof $tw === "undefined") return null
  try {
    // First check built-in JavaScript macros ($tw.macros)
    if ($tw.macros && $tw.macros[macroName] && $tw.macros[macroName].params) {
      const params = $tw.macros[macroName].params
      if (Array.isArray(params)) {
        return params.map((p: any) => p.name)
      }
    }
    // Use widget.getVariableInfo for context-aware variable lookup
    const widget = _currentEngine?.widget
    if (widget?.getVariableInfo) {
      const info = widget.getVariableInfo(macroName)
      if (info && info.params && Array.isArray(info.params)) {
        return info.params.map((p: any) => p.name)
      }
    }
    return null
  } catch (e) {
    return null
  }
}

/**
 * Get code languages from context or return empty array
 * The CM6 engine can pass available languages via context.options.codeLanguages
 * These should be LanguageDescription objects from @codemirror/language-data
 */
function getCodeLanguages(): readonly LanguageDescription[] {
  // Try to get languages from the engine's context
  const engine = _currentEngine as any
  if (engine?.options?.codeLanguages) {
    return engine.options.codeLanguages
  }
  // Fallback: empty array (no mixed parsing)
  return []
}

/**
 * Build language support with options from context
 */
function buildLanguageSupport(context: CM6PluginContext): Extension {
  const options = context.options || {}

  // Store engine reference for context-aware completions
  _currentEngine = context.engine as CM6Engine | null

  return tiddlywiki({
    addKeymap: false, // We add our own keymap separately
    codeLanguages: getCodeLanguages(), // Enable mixed parsing for code blocks (from engine.options.codeLanguages)
    completeHTMLTags: options.completeHTMLTags !== false,
    completeWidgets: options.completeWidgets !== false,
    completeMacros: options.completeMacros !== false,
    completeTiddlers: options.completeTiddlers !== false,
    completeFilterOperators: options.completeFilterOperators !== false,
    completeFilterRunPrefixes: options.completeFilterRunPrefixes !== false,
    getTiddlerTitles,
    getImageTiddlerTitles,
    getMacroNames,
    getMacroParams,
    getWidgetNames,
    getFilterOperators,
    getTagNames
  })
}

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * The plugin definition - implements the engine's plugin interface
 */
export const plugin = {
  name: "tiddlywiki-syntax",
  description: "TiddlyWiki5 Wikitext syntax highlighting and editing support",
  priority: 100,
  
  /**
   * Initialize with CM6 core reference
   * Called once when plugin is discovered
   */
  init(cm6Core: any): void {
    _core = cm6Core
  },
  
  /**
   * Condition for activation
   * Only activate for TiddlyWiki content types
   */
  condition(context: CM6PluginContext): boolean {
    const type = context.tiddlerType
    return TW_TYPES.includes(type || "")
  },
  
  /**
   * Register compartments
   * ALWAYS called, even if condition is false (for later reconfiguration)
   */
  registerCompartments(): Record<string, Compartment> {
    if (!_core) return {}
    const Compartment = _core.state.Compartment
    return {
      [COMPARTMENT_NAME]: new Compartment()
    }
  },
  
  /**
   * Get CodeMirror extensions
   * Called when condition is true (initial setup)
   * Must wrap content in compartment.of() ourselves
   */
  getExtensions(context: CM6PluginContext): Extension[] {
    const extensions: Extension[] = []
    const engine = context.engine as CM6Engine | undefined
    const compartments = engine?._compartments
    
    // Language support via compartment
    const langSupport = buildLanguageSupport(context)
    
    if (compartments?.[COMPARTMENT_NAME]) {
      // Wrap in compartment for later reconfiguration
      extensions.push(compartments[COMPARTMENT_NAME].of(langSupport))
    } else {
      // No compartment available, add directly
      extensions.push(langSupport)
    }
    
    // Header folding support
    extensions.push(headerIndent)
    
    // Keymap (unless read-only or custom keymap is active)
    if (!context.readOnly) {
      const wiki = context.engine?.widget?.wiki || (typeof $tw !== "undefined" ? $tw.wiki : null)
      const selectedKeymap = wiki?.getTiddlerText?.("$:/config/codemirror-6/keymap", "default") ?? "default"
      if (selectedKeymap === "default") {
        extensions.push(tiddlywikiKeymap)
      }
    }
    
    return extensions
  },
  
  /**
   * Get compartment content for dynamic reconfiguration
   * Called by engine.setType() when switching content types
   * Returns RAW content (without compartment.of wrapper)
   */
  getCompartmentContent(context: CM6PluginContext): Extension[] {
    const langSupport = buildLanguageSupport(context)
    
    // Return array of extensions (engine wraps in compartment.reconfigure)
    return [langSupport, headerIndent]
  },
  
  /**
   * Extend engine API with TiddlyWiki-specific methods
   * Methods are bound to engine instance by the engine
   */
  extendAPI(engine: CM6Engine, _context: CM6PluginContext): Record<string, Function> {
    return {
      // ================================================================
      // Formatting Commands
      // ================================================================
      
      toggleBold() {
        if (engine._destroyed || !engine.view) return false
        return toggleBold(getCommandTarget(engine.view))
      },
      
      toggleItalic() {
        if (engine._destroyed || !engine.view) return false
        return toggleItalic(getCommandTarget(engine.view))
      },
      
      toggleUnderline() {
        if (engine._destroyed || !engine.view) return false
        return toggleUnderline(getCommandTarget(engine.view))
      },
      
      toggleStrikethrough() {
        if (engine._destroyed || !engine.view) return false
        return toggleStrikethrough(getCommandTarget(engine.view))
      },
      
      toggleSuperscript() {
        if (engine._destroyed || !engine.view) return false
        return toggleSuperscript(getCommandTarget(engine.view))
      },
      
      toggleSubscript() {
        if (engine._destroyed || !engine.view) return false
        return toggleSubscript(getCommandTarget(engine.view))
      },
      
      toggleInlineCode() {
        if (engine._destroyed || !engine.view) return false
        return toggleInlineCode(getCommandTarget(engine.view))
      },
      
      // ================================================================
      // Link/Transclusion Commands
      // ================================================================
      
      insertWikiLink() {
        if (engine._destroyed || !engine.view) return false
        return insertWikiLink(getCommandTarget(engine.view))
      },
      
      insertTransclusion() {
        if (engine._destroyed || !engine.view) return false
        return insertTransclusion(getCommandTarget(engine.view))
      },
      
      // ================================================================
      // Heading Commands
      // ================================================================
      
      setHeading(level: number) {
        if (engine._destroyed || !engine.view) return false
        const commands = [null, setHeading1, setHeading2, setHeading3, setHeading4, setHeading5, setHeading6]
        const cmd = commands[level]
        if (!cmd) return false
        return cmd(getCommandTarget(engine.view))
      },
      
      removeHeading() {
        if (engine._destroyed || !engine.view) return false
        return removeHeading(getCommandTarget(engine.view))
      },
      
      // ================================================================
      // List Commands
      // ================================================================
      
      toggleBulletList() {
        if (engine._destroyed || !engine.view) return false
        return toggleBulletList(getCommandTarget(engine.view))
      },
      
      toggleNumberedList() {
        if (engine._destroyed || !engine.view) return false
        return toggleNumberedList(getCommandTarget(engine.view))
      },
      
      // ================================================================
      // Block Commands
      // ================================================================
      
      insertCodeBlock() {
        if (engine._destroyed || !engine.view) return false
        return insertCodeBlock(getCommandTarget(engine.view))
      }
    }
  },
  
  /**
   * Register event handlers
   * Handlers are bound to engine instance by the engine
   */
  registerEvents(engine: CM6Engine, _context: CM6PluginContext): Record<string, Function> {
    return {
      /**
       * Handle TiddlyWiki-specific text operations
       * Called when engine._triggerEvent("textOperation", operation) is invoked
       *
       * NOTE: If operation.replacement was set, the engine's _applyTextOperation
       * already handled it with multi-cursor support. We only call our commands
       * when replacement is NOT set (direct command invocation).
       */
      textOperation(operation: any) {
        if (!operation || engine._destroyed) return

        // Skip if engine already processed this via _applyTextOperation
        // (it sets replacement for wrap-style operations)
        if (operation.replacement !== null && operation.replacement !== undefined) {
          return
        }

        switch (operation.type) {
          case "toggle-bold":
            (engine as any).toggleBold?.()
            break
          case "toggle-italic":
            (engine as any).toggleItalic?.()
            break
          case "toggle-underline":
            (engine as any).toggleUnderline?.()
            break
          case "toggle-strikethrough":
            (engine as any).toggleStrikethrough?.()
            break
          case "toggle-superscript":
            (engine as any).toggleSuperscript?.()
            break
          case "toggle-subscript":
            (engine as any).toggleSubscript?.()
            break
          case "toggle-code":
            (engine as any).toggleInlineCode?.()
            break
          case "insert-link":
            (engine as any).insertWikiLink?.()
            break
          case "insert-transclusion":
            (engine as any).insertTransclusion?.()
            break
          case "set-heading":
            if (typeof operation.level === "number") {
              (engine as any).setHeading?.(operation.level)
            }
            break
          case "remove-heading":
            (engine as any).removeHeading?.()
            break
          case "toggle-bullet-list":
            (engine as any).toggleBulletList?.()
            break
          case "toggle-numbered-list":
            (engine as any).toggleNumberedList?.()
            break
          case "insert-code-block":
            (engine as any).insertCodeBlock?.()
            break
        }
      }
    }
  },
  
  /**
   * Cleanup when engine is destroyed
   */
  destroy(_engine: CM6Engine): void {
    // Nothing to clean up for this plugin
  }
}

// Default export
export default plugin
