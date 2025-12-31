/**
 * TiddlyWiki5 CodeMirror 6 Plugin Entry Point
 * 
 * This module exports the plugin interface expected by the CM6 engine.
 * It provides TiddlyWiki5 syntax highlighting and language support.
 * 
 * module-type: codemirror6-plugin
 */

import {Extension, Compartment} from "@codemirror/state"
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
 * Plugin context interface
 */
export interface CM6PluginContext {
  tiddlerTitle?: string
  tiddlerType?: string
  tiddlerFields?: Record<string, any>
  readOnly?: boolean
  cm6Core?: any
  engine?: any
  options?: Record<string, any>
}

/**
 * CM6 Core reference (set in init)
 */
let _core: any = null

/**
 * TiddlyWiki content types
 */
const TW_TYPES = [
  "",  // Empty = default wikitext
  "text/vnd.tiddlywiki",
  "text/x-tiddlywiki"
]

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
 * The plugin definition
 */
export const plugin = {
  name: "tiddlywiki-syntax",
  description: "TiddlyWiki5 Wikitext syntax highlighting and editing support",
  priority: 100,
  
  /**
   * Initialize with CM6 core reference
   */
  init(cm6Core: any) {
    _core = cm6Core
  },
  
  /**
   * Only activate for TiddlyWiki content types
   */
  condition(context: CM6PluginContext): boolean {
    const type = context.tiddlerType
    return TW_TYPES.includes(type || "")
  },
  
  /**
   * Register language compartment
   */
  registerCompartments(): Record<string, Compartment> {
    if (!_core) return {}
    const Compartment = _core.state.Compartment
    return {
      tiddlywikiLanguage: new Compartment()
    }
  },
  
  /**
   * Get CodeMirror extensions
   */
  getExtensions(context: CM6PluginContext): Extension[] {
    const extensions: Extension[] = []
    const engine = context.engine
    const compartments = engine?._compartments
    
    // Language support via compartment if available
    if (compartments?.tiddlywikiLanguage) {
      extensions.push(
        compartments.tiddlywikiLanguage.of(tiddlywikiLanguage)
      )
    } else {
      extensions.push(tiddlywikiLanguage)
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
   * Extend engine API with TiddlyWiki-specific methods
   */
  extendAPI(engine: any, context: CM6PluginContext): Record<string, Function> {
    return {
      // ==== Formatting Commands ====
      
      toggleBold() {
        if (this._destroyed) return false
        return toggleBold(this.view)
      },
      
      toggleItalic() {
        if (this._destroyed) return false
        return toggleItalic(this.view)
      },
      
      toggleUnderline() {
        if (this._destroyed) return false
        return toggleUnderline(this.view)
      },
      
      toggleStrikethrough() {
        if (this._destroyed) return false
        return toggleStrikethrough(this.view)
      },
      
      toggleSuperscript() {
        if (this._destroyed) return false
        return toggleSuperscript(this.view)
      },
      
      toggleSubscript() {
        if (this._destroyed) return false
        return toggleSubscript(this.view)
      },
      
      toggleInlineCode() {
        if (this._destroyed) return false
        return toggleInlineCode(this.view)
      },
      
      // ==== Link/Transclusion Commands ====
      
      insertWikiLink() {
        if (this._destroyed) return false
        return insertWikiLink(this.view)
      },
      
      insertTransclusion() {
        if (this._destroyed) return false
        return insertTransclusion(this.view)
      },
      
      // ==== Heading Commands ====
      
      setHeading(level: number) {
        if (this._destroyed) return false
        const commands = [null, setHeading1, setHeading2, setHeading3, setHeading4, setHeading5, setHeading6]
        const cmd = commands[level]
        return cmd ? cmd(this.view) : false
      },
      
      removeHeading() {
        if (this._destroyed) return false
        return removeHeading(this.view)
      },
      
      // ==== List Commands ====
      
      toggleBulletList() {
        if (this._destroyed) return false
        return toggleBulletList(this.view)
      },
      
      toggleNumberedList() {
        if (this._destroyed) return false
        return toggleNumberedList(this.view)
      },
      
      // ==== Block Commands ====
      
      insertCodeBlock() {
        if (this._destroyed) return false
        return insertCodeBlock(this.view)
      },
      
      // ==== Language Configuration ====
      
      setTiddlyWikiLanguage(enabled: boolean) {
        if (this._destroyed) return
        const compartments = this._compartments
        if (compartments?.tiddlywikiLanguage) {
          this.reconfigure("tiddlywikiLanguage", enabled ? tiddlywikiLanguage : [])
        }
      }
    }
  },
  
  /**
   * Register event handlers
   */
  registerEvents(engine: any, context: CM6PluginContext): Record<string, Function> {
    return {
      // Handle TiddlyWiki-specific text operations
      textOperation(operation: any) {
        if (!operation) return
        
        switch (operation.type) {
          case "toggle-bold":
            this.toggleBold?.()
            break
          case "toggle-italic":
            this.toggleItalic?.()
            break
          case "toggle-underline":
            this.toggleUnderline?.()
            break
          case "insert-link":
            this.insertWikiLink?.()
            break
          case "insert-transclusion":
            this.insertTransclusion?.()
            break
        }
      }
    }
  }
}

// Default export
export default plugin
