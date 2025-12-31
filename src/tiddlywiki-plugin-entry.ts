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
import {tiddlywikiLanguage, tiddlywikiBaseLanguage, headerIndent} from "./language"
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
  extendAPI(_engine: any, _context: CM6PluginContext): Record<string, any> {
    return {
      // ==== Formatting Commands ====
      
      toggleBold(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleBold({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      toggleItalic(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleItalic({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      toggleUnderline(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleUnderline({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      toggleStrikethrough(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleStrikethrough({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      toggleSuperscript(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleSuperscript({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      toggleSubscript(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleSubscript({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      toggleInlineCode(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleInlineCode({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      // ==== Link/Transclusion Commands ====
      
      insertWikiLink(this: any) {
        if (this._destroyed || !this.view) return false
        return insertWikiLink({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      insertTransclusion(this: any) {
        if (this._destroyed || !this.view) return false
        return insertTransclusion({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      // ==== Heading Commands ====
      
      setHeading(this: any, level: number) {
        if (this._destroyed || !this.view) return false
        const commands = [null, setHeading1, setHeading2, setHeading3, setHeading4, setHeading5, setHeading6]
        const cmd = commands[level]
        if (!cmd) return false
        return cmd({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      removeHeading(this: any) {
        if (this._destroyed || !this.view) return false
        return removeHeading({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      // ==== List Commands ====
      
      toggleBulletList(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleBulletList({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      toggleNumberedList(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleNumberedList({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      // ==== Block Commands ====
      
      insertCodeBlock(this: any) {
        if (this._destroyed || !this.view) return false
        return insertCodeBlock({state: this.view.state, dispatch: this.view.dispatch.bind(this.view)})
      },
      
      // ==== Language Configuration ====
      
      setTiddlyWikiLanguage(this: any, enabled: boolean) {
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
  registerEvents(_engine: any, _context: CM6PluginContext): Record<string, any> {
    return {
      // Handle TiddlyWiki-specific text operations
      textOperation(this: any, operation: any) {
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
