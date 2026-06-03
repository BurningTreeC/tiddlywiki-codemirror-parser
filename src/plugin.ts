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
import {tiddlywikiLanguage, tiddlywiki} from "./parser"
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

// ============================================================================
// Completion Data Cache with Smart Invalidation
// ============================================================================

interface CacheEntry<T> {
  data: T
  valid: boolean
}

// Caches for different data types
const cache = {
  tiddlerTitles: null as CacheEntry<string[]> | null,
  imageTiddlerTitles: null as CacheEntry<string[]> | null,
  tagNames: null as CacheEntry<string[]> | null,
  macroNames: null as CacheEntry<string[]> | null,
  widgetNames: null as CacheEntry<string[]> | null,
  globalWidgetDefs: null as CacheEntry<Record<string, string[]>> | null, // widget name -> params
  filterOperators: null as CacheEntry<string[]> | null,
  wikiRules: null as CacheEntry<{ name: string; types: string }[]> | null,
}

// Track if we've set up the wiki change listener
let _changeListenerInstalled = false

/**
 * Install wiki change listener for smart cache invalidation
 */
function installChangeListener(): void {
  if (_changeListenerInstalled) return
  if (typeof $tw === "undefined" || !$tw.wiki) return

  _changeListenerInstalled = true

  // Listen to wiki changes
  $tw.wiki.addEventListener("change", (changes: Record<string, any>) => {
    if (!changes) return

    let titlesChanged = false
    let tagsChanged = false
    let macrosChanged = false
    let imagesChanged = false

    for (const title of Object.keys(changes)) {
      const change = changes[title]

      // Tiddler created or deleted
      if (change.deleted || change.created) {
        titlesChanged = true
        // Check if it's an image or macro tiddler
        if (title.startsWith("$:/")) {
          // Could be a macro tiddler
          macrosChanged = true
        }
        imagesChanged = true // Could be an image
        tagsChanged = true // New tiddler might have tags
      }

      // Check for modified fields (not just text)
      if (change.modified) {
        // Check specifically which fields changed
        const tiddler = $tw.wiki.getTiddler(title)
        if (tiddler) {
          // Tags changed
          if (tiddler.fields.tags) {
            tagsChanged = true
          }
          // Macro tiddler modified
          if (tiddler.hasTag("$:/tags/Macro") || tiddler.hasTag("$:/tags/Global")) {
            macrosChanged = true
          }
          // Image tiddler
          const type = tiddler.fields.type || ""
          if (type.startsWith("image/")) {
            imagesChanged = true
          }
        }
      }
    }

    // Invalidate relevant caches
    if (titlesChanged && cache.tiddlerTitles) {
      cache.tiddlerTitles.valid = false
    }
    if (tagsChanged && cache.tagNames) {
      cache.tagNames.valid = false
    }
    if (macrosChanged && cache.macroNames) {
      cache.macroNames.valid = false
    }
    if (macrosChanged && cache.globalWidgetDefs) {
      cache.globalWidgetDefs.valid = false
    }
    if (macrosChanged && cache.widgetNames) {
      cache.widgetNames.valid = false
    }
    if (imagesChanged && cache.imageTiddlerTitles) {
      cache.imageTiddlerTitles.valid = false
    }
    // Note: filterOperators, wikiRules don't change at runtime
  })
}

/**
 * Get cached data or compute it
 */
function getCached<T>(
	key: keyof typeof cache,
	compute: () => T
): T {
	const typedCache = cache as Record<string, CacheEntry<T> | null>
	const entry = typedCache[key]

	if (entry && entry.valid) {
		return entry.data
	}

	const data = compute()
	typedCache[key] = { data, valid: true }

	return data
}

/**
 * Get tiddler titles for autocompletion (cached)
 * Uses widget.wiki for proper context
 */
function getTiddlerTitles(): string[] {
  if (typeof $tw === "undefined") return []
  installChangeListener()
  return getCached("tiddlerTitles", () => {
    try {
      const wiki = _currentEngine?.widget?.wiki || $tw.wiki
      if (!wiki) return []

      // Use eachShadowPlusTiddlers to get all titles including shadows
      const allTitles: string[] = []
      if (wiki.eachShadowPlusTiddlers) {
        wiki.eachShadowPlusTiddlers((_tiddler: any, title: string) => {
          allTitles.push(title)
        })
      } else {
        // Fallback: try allTitles + allShadowTitles
        const tiddlers = wiki.allTitles ? wiki.allTitles() : []
        const shadows = wiki.allShadowTitles ? wiki.allShadowTitles() : []
        allTitles.push(...tiddlers, ...shadows)
      }

      // Deduplicate and sort: regular tiddlers first, then system, then drafts
      const uniqueTitles = [...new Set(allTitles)]

      // Check which titles are drafts
      const drafts = new Set<string>()
      for (const title of uniqueTitles) {
        const tiddler = wiki.getTiddler(title)
        if (tiddler && tiddler.fields["draft.of"]) {
          drafts.add(title)
        }
      }

      return uniqueTitles.sort((a, b) => {
        const aDraft = drafts.has(a)
        const bDraft = drafts.has(b)
        // Drafts always at the bottom
        if (aDraft !== bDraft) return aDraft ? 1 : -1

        const aSystem = a.startsWith("$:/")
        const bSystem = b.startsWith("$:/")
        if (aSystem !== bSystem) return aSystem ? 1 : -1
        return a.localeCompare(b)
      })
    } catch (e) {
      return []
    }
  })
}

/**
 * Get image tiddler titles for [img[ autocompletion (cached)
 * Filters for tiddlers with type starting with "image/"
 */
function getImageTiddlerTitles(): string[] {
  if (typeof $tw === "undefined") return []
  installChangeListener()
  return getCached("imageTiddlerTitles", () => {
    try {
      const wiki = _currentEngine?.widget?.wiki || $tw.wiki
      if (!wiki) return []
      const widget = _currentEngine?.widget
      // Use widget context for filter if available (needed for shadows)
      const results = widget
        ? wiki.filterTiddlers("[all[tiddlers+shadows]is[image]]", widget)
        : wiki.filterTiddlers("[all[tiddlers+shadows]is[image]]")
      return results || []
    } catch (e) {
      return []
    }
  })
}

/**
 * Check if a tiddler is a draft (has draft.of field)
 * Not cached since draft status can change frequently
 */
function isDraftTiddler(title: string): boolean {
  if (typeof $tw === "undefined") return false
  try {
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    if (!wiki) return false
    const tiddler = wiki.getTiddler(title)
    return !!(tiddler && tiddler.fields["draft.of"])
  } catch (e) {
    return false
  }
}

/**
 * Get macro names for autocompletion (cached)
 * Uses widget.wiki for proper context
 */
function getMacroNames(): string[] {
  if (typeof $tw === "undefined") return []
  installChangeListener()
  return getCached("macroNames", () => {
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
  })
}

/**
 * Extract parameters from a params string like "param1, param2:'default'"
 */
function extractParams(paramsStr: string | undefined): string[] {
  const params: string[] = []
  if (paramsStr && paramsStr.trim()) {
    const paramParts = paramsStr.split(',')
    for (const part of paramParts) {
      const paramName = part.trim().split(':')[0].trim()
      if (paramName) params.push(paramName)
    }
  }
  return params
}

/**
 * Get widget definitions from global tiddlers (cached)
 * Returns a map of widget name -> param names
 * Handles both inline params: \widget $foo(p1, p2)
 * And \parameters pragma: \widget $foo\n\parameters (p1, p2)
 */
function getGlobalWidgetDefs(): Record<string, string[]> {
  if (typeof $tw === "undefined") return {}
  installChangeListener()
  return getCached("globalWidgetDefs", () => {
    try {
      const defs: Record<string, string[]> = {}
      const wiki = _currentEngine?.widget?.wiki || $tw.wiki
      if (wiki) {
        const globalTiddlers = wiki.filterTiddlers("[all[tiddlers+shadows]tag[$:/tags/Macro]] [all[tiddlers+shadows]tag[$:/tags/Global]]") || []
        for (const title of globalTiddlers) {
          const tiddler = wiki.getTiddler(title)
          if (tiddler) {
            const text = tiddler.fields.text || ""

            // Match \widget definitions with optional inline params
            // Also capture following \parameters pragma if present
            const widgetRegex = /\\widget\s+(\$[^\s(]+)(?:\(([^)]*)\))?/g
            let match
            while ((match = widgetRegex.exec(text)) !== null) {
              const widgetName = match[1]
              const inlineParamsStr = match[2]

              if (!defs[widgetName]) {
                let params = extractParams(inlineParamsStr)

                // If no inline params, check for \parameters pragma after \widget
                if (params.length === 0) {
                  // Look for \parameters on the same or next line
                  const afterWidget = text.slice(match.index + match[0].length)
                  const parametersMatch = /^\s*\n?\s*\\parameters\s*\(([^)]*)\)/.exec(afterWidget)
                  if (parametersMatch) {
                    params = extractParams(parametersMatch[1])
                  }
                }

                defs[widgetName] = params
              }
            }
          }
        }
      }
      return defs
    } catch (e) {
      return {}
    }
  })
}

/**
 * Get widget names for autocompletion (cached)
 * Includes built-in widgets, widget-subclass modules, and custom widgets from global tiddlers
 */
function getWidgetNames(): string[] {
  if (typeof $tw === "undefined") return []
  installChangeListener()
  return getCached("widgetNames", () => {
    try {
      const names: string[] = []
      const seen = new Set<string>()
      // Get widget names from $tw.widgets (they don't have $ prefix in the registry)
      if ($tw.widgets) {
        for (const name of Object.keys($tw.widgets)) {
          const widgetName = "$" + name
          if (!seen.has(widgetName)) {
            seen.add(widgetName)
            names.push(widgetName)
          }
        }
      }
      // Also check widget modules using TiddlyWiki's module API
      if ($tw.modules?.forEachModuleOfType) {
        $tw.modules.forEachModuleOfType("widget", (title: string, mod: Record<string, unknown>) => {
          if (mod) {
            for (const exportName of Object.keys(mod)) {
              if (exportName && typeof exportName === "string") {
                const widgetName = "$" + exportName
                if (!seen.has(widgetName)) {
                  seen.add(widgetName)
                  names.push(widgetName)
                }
              }
            }
          }
        })
        // Also check widget-subclass modules (e.g., $log is a subclass of $action-log)
        $tw.modules.forEachModuleOfType("widget-subclass", (title: string, mod: Record<string, unknown>) => {
          if (mod) {
            const subclassName = (mod.name || mod.baseClass) as string | undefined
            if (subclassName && typeof subclassName === "string") {
              const widgetName = "$" + subclassName
              if (!seen.has(widgetName)) {
                seen.add(widgetName)
                names.push(widgetName)
              }
            }
          }
        })
      }
      // Get custom widgets from global tiddlers
      const globalDefs = getGlobalWidgetDefs()
      for (const name of Object.keys(globalDefs)) {
        if (!seen.has(name)) {
          seen.add(name)
          names.push(name)
        }
      }
      return names
    } catch (e) {
      return []
    }
  })
}

/**
 * Get filter operator names for autocompletion (cached, static - doesn't change at runtime)
 * Uses widget.wiki for proper context
 */
function getFilterOperators(): string[] {
  if (typeof $tw === "undefined") return []
  return getCached("filterOperators", () => {
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
  })
}

/**
 * Get tag names for autocompletion in tag[], tagging[] operators (cached)
 * Uses [all[tiddlers+shadows]is[tag]] filter
 */
function getTagNames(): string[] {
  if (typeof $tw === "undefined") return []
  installChangeListener()
  return getCached("tagNames", () => {
    try {
      const wiki = _currentEngine?.widget?.wiki || $tw.wiki
      if (!wiki) return []
      const widget = _currentEngine?.widget
      // Use widget context for filter if available (needed for shadows)
      const results = widget
        ? wiki.filterTiddlers("[all[tiddlers+shadows]is[tag]]", widget)
        : wiki.filterTiddlers("[all[tiddlers+shadows]is[tag]]")
      return results || []
    } catch (e) {
      return []
    }
  })
}

/**
 * Get field names for a specific tiddler
 * Used for {{tiddler!!field}} completion
 */
function getTiddlerFields(tiddlerTitle: string): string[] {
  if (typeof $tw === "undefined" || !tiddlerTitle) return []
  try {
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    if (!wiki) return []
    const tiddler = wiki.getTiddler(tiddlerTitle)
    if (!tiddler || !tiddler.fields) return []
    return Object.keys(tiddler.fields).sort()
  } catch (e) {
    return []
  }
}

/**
 * Get index/property names for a specific data tiddler
 * Used for {{tiddler##index}} completion
 */
function getTiddlerIndexes(tiddlerTitle: string): string[] {
  if (typeof $tw === "undefined" || !tiddlerTitle) return []
  try {
    const wiki = _currentEngine?.widget?.wiki || $tw.wiki
    if (!wiki) return []
    const data = wiki.getTiddlerDataCached(tiddlerTitle)
    if (!data || typeof data !== "object") return []
    return Object.keys(data).sort()
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
 * Get widget attributes/parameters for autocompletion
 * For custom widgets defined with \widget, tries widget.getVariableInfo first
 * (like macros/procedures), then falls back to global widget defs cache.
 * Returns null for built-in widgets (completion falls back to static list)
 */
function getWidgetAttributes(widgetName: string): string[] | null {
  if (typeof $tw === "undefined") return null
  try {
    // Try widget.getVariableInfo first (like macros/procedures)
    const widget = _currentEngine?.widget
    if (widget?.getVariableInfo) {
      const info = widget.getVariableInfo(widgetName)
      if (info && info.params && Array.isArray(info.params)) {
        return info.params.map((p: any) => p.name)
      }
    }
    // Fallback: check global widget definitions cache
    // (widget.getVariableInfo may not return params for \widget definitions)
    const globalDefs = getGlobalWidgetDefs()
    if (globalDefs[widgetName] && globalDefs[widgetName].length > 0) {
      return globalDefs[widgetName]
    }
    // Return null for built-in widgets - let completion fall back to static list
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
 * Get wiki parser rules for \rules pragma completion (cached, static - doesn't change at runtime)
 * Returns rule names with their types (pragma, block, inline)
 */
function getWikiRules(): { name: string; types: string }[] {
  if (typeof $tw === "undefined") return []
  return getCached("wikiRules", () => {
    try {
      const rules: { name: string; types: string }[] = []
      const wikiruleModules = $tw.modules.getModulesByTypeAsHashmap("wikirule")
      if (!wikiruleModules) return []

      for (const moduleName of Object.keys(wikiruleModules)) {
        const module = wikiruleModules[moduleName]
        if (!module || !module.name) continue

        // Convert types object to string (e.g., {block: true, inline: true} -> "block, inline")
        const typeNames: string[] = []
        if (module.types) {
          if (module.types.pragma) typeNames.push("pragma")
          if (module.types.block) typeNames.push("block")
          if (module.types.inline) typeNames.push("inline")
        }

        rules.push({
          name: module.name,
          types: typeNames.join(", ") || "unknown"
        })
      }

      return rules.sort((a, b) => a.name.localeCompare(b.name))
    } catch (e) {
      return []
    }
  })
}

/**
 * Check if CamelCase links are disabled in TiddlyWiki settings (read once at startup)
 * Reads $:/config/WikiParserRules/Inline/wikilink - "disable" means disabled
 */
const _disableCamelCaseLinks: boolean = (() => {
  if (typeof $tw === "undefined") return false
  try {
    const setting = $tw.wiki?.getTiddlerText("$:/config/WikiParserRules/Inline/wikilink", "enable")
    return setting === "disable"
  } catch (e) {
    return false
  }
})()

/**
 * Check if KaTeX plugin is installed
 * Checks if the $latex or $katex widget exists by iterating widget modules
 */
function isKaTeXEnabled(): boolean {
  if (typeof $tw === "undefined") return false
  try {
    // Use forEachModuleOfType to properly execute and check widget modules
    if ($tw.modules && $tw.modules.forEachModuleOfType) {
      let found = false
      $tw.modules.forEachModuleOfType("widget", (_title: string, mod: any) => {
        if (mod && (mod.latex || mod.katex)) {
          found = true
        }
      })
      return found
    }
    return false
  } catch (e) {
    return false
  }
}

/**
 * Build language support with options from context
 *
 * @param context - Plugin context
 * @param skipNestedLanguageExtensions - If true, don't include nested language support extensions.
 *   Used during compartment reconfiguration to avoid duplicate compartment errors.
 */
function buildLanguageSupport(context: CM6PluginContext, skipNestedLanguageExtensions = false): Extension {
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
    disableCamelCaseLinks: _disableCamelCaseLinks,
    enableKaTeX: isKaTeXEnabled(),
    skipNestedLanguageExtensions, // Skip nested lang extensions on reconfiguration
    getTiddlerTitles,
    isDraftTiddler,
    getImageTiddlerTitles,
    getMacroNames,
    getMacroParams,
    getWidgetNames,
    getWidgetAttributes,
    getFilterOperators,
    getTagNames,
    getTiddlerFields,
    getTiddlerIndexes,
    getWikiRules
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

    // Build the full language support (includes support extensions like autocompletion)
    const langSupport = buildLanguageSupport(context, /* skipNestedLanguageExtensions */ false) as any

    // Put ONLY the Language in the compartment (for reconfiguration on language switch)
    // Support extensions go OUTSIDE the compartment (so they persist across switches)
    if (compartments?.[COMPARTMENT_NAME]) {
      // Wrap just the Language in compartment for later reconfiguration
      extensions.push(compartments[COMPARTMENT_NAME].of(langSupport.language))
      // Add support extensions outside the compartment (they persist)
      if (langSupport.support) {
        extensions.push(langSupport.support)
      }
    } else {
      // No compartment available, add the full LanguageSupport directly
      extensions.push(langSupport)
    }

    // Keymap (unless read-only or custom keymap is active)
    if (!context.readOnly) {
      const wiki = context.engine?.widget?.wiki || (typeof $tw !== "undefined" ? $tw.wiki : null)
      const selectedKeymap = wiki?.getTiddlerText?.("$:/config/codemirror-6/editor/keymap", "default") ?? "default"
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
   *
   * IMPORTANT: For reconfiguration, we only return the Language itself,
   * NOT the full LanguageSupport with all its support extensions.
   * The support extensions (autocompletion, keymaps, highlighting, etc.)
   * are already in the editor state from initial setup and would cause
   * "Duplicate use of compartment" errors if re-added.
   */
  getCompartmentContent(context: CM6PluginContext): Extension[] {
    // Build the language support to get a configured parser
    const langSupport = buildLanguageSupport(context, /* skipNestedLanguageExtensions */ true)

    // Return ONLY the Language (not the full LanguageSupport with support extensions)
    // This avoids Compartment duplication from extensions like autocompletion()
    if (langSupport && typeof langSupport === 'object' && 'language' in langSupport) {
      return [(langSupport as any).language]
    }
    // Fallback: return empty if something went wrong
    return []
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
