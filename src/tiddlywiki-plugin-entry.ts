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
import {LanguageSupport} from "@codemirror/language"
import {tiddlywikiLanguage, tiddlywikiBaseLanguage, headerIndent} from "./language"
import {tiddlywiki} from "./codemirror-index"
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
// tiddlywiki() returns LanguageSupport (use for reconfigureLanguage)
// tiddlywikiLanguage is the Language instance
export {tiddlywikiLanguage, tiddlywikiBaseLanguage, tiddlywiki}

// Alias for backwards compatibility with existing engines
export const TiddlyWikiLanguage = tiddlywikiLanguage

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
    const options = context.options || {}
    
    // Use full LanguageSupport (with autocompletion) or just the language
    const useFullSupport = options.useFullLanguageSupport !== false
    
    if (useFullSupport) {
      // Get full LanguageSupport with autocompletion, etc.
      const langSupport = tiddlywiki({
        addKeymap: false, // We add our own keymap below
        completeHTMLTags: options.completeHTMLTags !== false,
        completeWidgets: options.completeWidgets !== false,
        completeMacros: options.completeMacros !== false
      })
      
      if (compartments?.tiddlywikiLanguage) {
        extensions.push(compartments.tiddlywikiLanguage.of(langSupport))
      } else {
        extensions.push(langSupport)
      }
    } else {
      // Just the language, no extras
      if (compartments?.tiddlywikiLanguage) {
        extensions.push(compartments.tiddlywikiLanguage.of(tiddlywikiLanguage))
      } else {
        extensions.push(tiddlywikiLanguage)
      }
      
      // Header folding support (included in LanguageSupport above)
      extensions.push(headerIndent)
    }
    
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
    // Helper to create properly typed command target from view
    const getCommandTarget = (view: EditorView) => ({
      state: view.state,
      dispatch: (tr: Transaction) => view.dispatch(tr)
    })
    
    return {
      // ==== Formatting Commands ====
      
      toggleBold(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleBold(getCommandTarget(this.view))
      },
      
      toggleItalic(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleItalic(getCommandTarget(this.view))
      },
      
      toggleUnderline(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleUnderline(getCommandTarget(this.view))
      },
      
      toggleStrikethrough(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleStrikethrough(getCommandTarget(this.view))
      },
      
      toggleSuperscript(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleSuperscript(getCommandTarget(this.view))
      },
      
      toggleSubscript(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleSubscript(getCommandTarget(this.view))
      },
      
      toggleInlineCode(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleInlineCode(getCommandTarget(this.view))
      },
      
      // ==== Link/Transclusion Commands ====
      
      insertWikiLink(this: any) {
        if (this._destroyed || !this.view) return false
        return insertWikiLink(getCommandTarget(this.view))
      },
      
      insertTransclusion(this: any) {
        if (this._destroyed || !this.view) return false
        return insertTransclusion(getCommandTarget(this.view))
      },
      
      // ==== Heading Commands ====
      
      setHeading(this: any, level: number) {
        if (this._destroyed || !this.view) return false
        const commands = [null, setHeading1, setHeading2, setHeading3, setHeading4, setHeading5, setHeading6]
        const cmd = commands[level]
        if (!cmd) return false
        return cmd(getCommandTarget(this.view))
      },
      
      removeHeading(this: any) {
        if (this._destroyed || !this.view) return false
        return removeHeading(getCommandTarget(this.view))
      },
      
      // ==== List Commands ====
      
      toggleBulletList(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleBulletList(getCommandTarget(this.view))
      },
      
      toggleNumberedList(this: any) {
        if (this._destroyed || !this.view) return false
        return toggleNumberedList(getCommandTarget(this.view))
      },
      
      // ==== Block Commands ====
      
      insertCodeBlock(this: any) {
        if (this._destroyed || !this.view) return false
        return insertCodeBlock(getCommandTarget(this.view))
      },
      
      // ==== Language Configuration ====
      
      /**
       * Enable/disable TiddlyWiki language support
       * @param enabled - true to enable, false to disable
       * @param options - optional config for tiddlywiki() function
       */
      setTiddlyWikiLanguage(this: any, enabled: boolean, options?: Parameters<typeof tiddlywiki>[0]) {
        if (this._destroyed || !this.view) return
        const compartments = this._compartments as Record<string, Compartment> | undefined
        if (compartments?.tiddlywikiLanguage) {
          const langSupport = enabled ? tiddlywiki(options || {}) : []
          const transaction = {
            effects: compartments.tiddlywikiLanguage.reconfigure(langSupport)
          }
          // Use safeDispatch if available, otherwise direct dispatch
          if (typeof this.safeDispatch === 'function') {
            this.safeDispatch(transaction)
          } else {
            this.view.dispatch(transaction)
          }
        }
      },
      
      /**
       * Reconfigure language - compatible with old CodeMirrorEngine API
       * Usage: engine.reconfigureLanguage(tiddlywiki, TiddlyWikiLanguage, options)
       * @param langFn - Language function (e.g., tiddlywiki)
       * @param _language - Language instance (for compatibility, not used)
       * @param options - Options to pass to langFn
       */
      reconfigureLanguage(this: any, langFn: (opts?: any) => LanguageSupport, _language: any, options?: any) {
        if (this._destroyed || !this.view) return
        const compartments = this._compartments as Record<string, Compartment> | undefined
        if (compartments?.tiddlywikiLanguage) {
          const langSupport = options ? langFn(options) : langFn()
          const transaction = {
            effects: compartments.tiddlywikiLanguage.reconfigure(langSupport)
          }
          // Use safeDispatch if available, otherwise direct dispatch
          if (typeof this.safeDispatch === 'function') {
            this.safeDispatch(transaction)
          } else {
            this.view.dispatch(transaction)
          }
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
