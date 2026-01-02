# CodeMirror 6 TiddlyWiki Plugin — Architecture Summary

## Overview

This document summarizes the architecture discussion for a modular CodeMirror 6 editor plugin for TiddlyWiki5. The design emphasizes modularity, with a lean core and separate plugins for extended functionality.

## Core Architecture

### Key Files

| File | Purpose |
|------|---------|
| `core.js` | Thin adapter re-exporting CM6 modules (`state`, `view`, `commands`, `language`, `autocomplete`, `lezer-*`) plus language/extension registration APIs |
| `engine.js` | Editor instantiation, plugin discovery, compartment management, TiddlyWiki event integration, dynamic language switching |

### Plugin System

Plugins use module-type `codemirror6-plugin` and can provide:

- `condition(context)` — Conditional activation based on tiddler type, title, etc.
- `registerCompartments()` — Register CM6 Compartments for dynamic reconfiguration
- `getExtensions(context)` — Return CM6 extensions
- `getCompartmentContent(context)` — Raw compartment content (required for conditional plugins with compartments)
- `extendAPI(engine, context)` — Add methods to engine instance
- `registerEvents(engine, context)` — Subscribe to engine events
- `init(core)` / `destroy(engine)` — Lifecycle hooks

Plugins are sorted by `priority` (higher loads first).

### Dynamic Language Switching

The engine supports switching languages at runtime via `setType(newType)`. This works by:

1. Re-evaluating all conditional plugins
2. Reconfiguring compartments for plugins that change activation state
3. Plugins must implement `getCompartmentContent()` for this to work correctly

## What Core Ships

### Currently Included
- History (undo/redo)
- Basic keymap + `indentWithTab`
- Line wrapping
- Bracket matching
- Autocompletion infrastructure (popup mechanics, keymaps)
- Syntax highlighting with `classHighlighter` fallback
- Read-only compartment
- TiddlyWiki event integration (keyboard, drop, paste, click)
- Multi-cursor text operations

### Recommended Additions
- Line numbers (toggleable via config)
- Active line highlight
- Search/replace (`@codemirror/search`)
- Close brackets
- Indentation markers

## Plugin Distribution Strategy

Separate TiddlyWiki plugins, not bundled in core.

### Naming Convention
```
$:/plugins/BurningTreeC/codemirror6-<name>
```

### Plugin Structure
```
$:/plugins/BurningTreeC/codemirror6-<name>
├── plugin.info
├── lib/
│   └── <bundled-cm6-module>.js
├── plugin.js (module-type: codemirror6-plugin)
└── readme
```

### Dependency Declaration (plugin.info)
```json
{
    "title": "$:/plugins/BurningTreeC/codemirror6-lang-tiddlywiki",
    "dependents": "$:/plugins/BurningTreeC/tiddlywiki-codemirror"
}
```

## Plugin Ideas

### Language Plugins (conditional on tiddler type)

| Plugin | Type Match |
|--------|------------|
| `codemirror6-lang-tiddlywiki` | `""`, `text/vnd.tiddlywiki` |
| `codemirror6-lang-markdown` | `text/x-markdown` |
| `codemirror6-lang-javascript` | `application/javascript` |
| `codemirror6-lang-json` | `application/json` |
| `codemirror6-lang-css` | `text/css` |
| `codemirror6-lang-html` | `text/html` |

### Feature Plugins (user-toggleable)

| Plugin | Description |
|--------|-------------|
| `codemirror6-vim` | Vim keybindings |
| `codemirror6-emacs` | Emacs keybindings |
| `codemirror6-search` | Search/replace panel |
| `codemirror6-line-numbers` | Toggleable line numbers |
| `codemirror6-minimap` | Document overview |
| `codemirror6-focus-mode` | Dim non-active paragraphs |
| `codemirror6-word-count` | Status bar with counts |
| `codemirror6-spell-check` | Spell checking |

### TiddlyWiki Integration Plugins

| Plugin | Description |
|--------|-------------|
| `codemirror6-tw-link-preview` | Hover preview for `[[links]]` |
| `codemirror6-tw-transclusion-preview` | Inline preview of transcluded content |
| `codemirror6-tw-lint` | Warn about broken links, unknown macros |
| `codemirror6-tw-snippets` | Expand shortcuts (e.g., `btn→` to `<$button>`) |
| `codemirror6-tw-table-mode` | Table editing with tab navigation |
| `codemirror6-tw-fold-sections` | Fold by heading level |
| `codemirror6-tw-image-paste` | Paste images → create tiddler → insert reference |

### Theme Plugins

| Plugin | Description |
|--------|-------------|
| `codemirror6-theme-dracula` | Dracula theme |
| `codemirror6-theme-solarized` | Solarized light/dark |
| `codemirror6-theme-nord` | Nord theme |

## lang-tiddlywiki Specifics

The TiddlyWiki language plugin provides:

### Completion Sources
- Tiddler titles (cached, excludes `$:/temp/` and `$:/state/`)
- Macro/procedure/function names (from `$:/tags/Macro`, `$:/tags/Global`, `$tw.macros`)
- Macro parameters
- Widget names (core + custom)
- Filter operators (core + custom)
- Filter run prefixes
- HTML tags

### Caching Strategy
- 5-second TTL for tiddler titles
- Lazy population for other caches
- `$tw.CodeMirror.clearAutocompleteCache()` exposed for manual invalidation

### Suggested Additions
- Field name completion (from all tiddlers)
- Tag completion
- Automatic cache invalidation via `$tw.wiki.addEventListener("change", ...)`

## Configuration Pattern

For user-toggleable plugins:

```javascript
var CONFIG_TIDDLER = "$:/config/codemirror6/lineNumbers";

exports.plugin = {
    name: "line-numbers",
    
    condition: function(context) {
        return $tw.wiki.getTiddlerText(CONFIG_TIDDLER, "yes") === "yes";
    },
    
    registerCompartments: function() {
        return { lineNumbers: myCompartment };
    },
    
    getExtensions: function(context) {
        return [myCompartment.of(lineNumbers())];
    },
    
    getCompartmentContent: function(context) {
        return [lineNumbers()];
    }
};
```

Pair with a config UI tiddler tagged `$:/tags/ControlPanel/Settings`.

## Architectural Recommendations

1. **Enforce `getCompartmentContent()`** — Conditional plugins with compartments must implement this; fail loudly if missing instead of falling back to `getExtensions()`.

2. **Settings integration** — Standardize how plugins declare config tiddlers.

3. **Plugin dependencies** — Add a `requires: ["plugin-name"]` field for explicit dependencies beyond load order.

4. **Status bar API** — Shared compartment for plugins that want to display info (word count, cursor position, language name).

5. **Hot reload for development** — Utility to re-discover plugins and reconfigure all compartments without full page reload.

6. **Control panel UI** — Tab showing discovered plugins, active state, and toggles for configurable ones.

## Plugin Tiers (Suggested Bundles)

| Tier | Plugins |
|------|---------|
| Essential | lang-tiddlywiki, search, line-numbers |
| Language Pack | lang-markdown, lang-javascript, lang-css, lang-html, lang-json |
| Power User | vim, emacs |
| Themes | theme-dracula, theme-solarized, theme-nord |
| TW Integration | tw-link-preview, tw-snippets, tw-lint |
