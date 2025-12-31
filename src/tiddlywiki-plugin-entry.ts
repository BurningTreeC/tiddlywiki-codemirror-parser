/**
 * TiddlyWiki5 CodeMirror 6 Plugin Entry Point
 * 
 * This module exports the plugin interface expected by the CM6 engine.
 * It provides TiddlyWiki5 syntax highlighting and language support.
 * 
 * module-type: codemirror6-plugin
 */

import {Extension, Compartment} from "@codemirror/state"
import {keymap, EditorView} from "@codemirror/view"
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

// ============================================================================
// Constants
// ============================================================================

/**
 * TiddlyWiki content types that activate this plugin
 */
const TW_TYPES = [
  "",  // Empty = default wikitext
  "text/vnd.tiddlywiki",
  "text/x-tiddlywiki"
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

/**
 * Build language support with options from context
 */
function buildLanguageSupport(context: CM6PluginContext): Extension {
  const options = context.options || {}
  
  return tiddlywiki({
    addKeymap: false, // We add our own keymap separately
    completeHTMLTags: options.completeHTMLTags !== false,
    completeWidgets: options.completeWidgets !== false,
    completeMacros: options.completeMacros !== false
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
    
    // Keymap (unless read-only)
    if (!context.readOnly) {
      extensions.push(tiddlywikiKeymap)
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
       */
      textOperation(operation: any) {
        if (!operation || engine._destroyed) return
        
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
