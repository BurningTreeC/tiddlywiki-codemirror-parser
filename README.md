# CodeMirror 6 for TiddlyWiki

A modern, feature-rich text editor for TiddlyWiki5 based on [CodeMirror 6](https://codemirror.net/), providing syntax highlighting, intelligent autocompletion, code folding, linting, and extensive customization options.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Available Plugins](#available-plugins)
- [Configuration](#configuration)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Autocompletion](#autocompletion)
- [Linting](#linting)
- [Themes](#themes)
- [API Reference](#api-reference)
- [Developer Guide](#developer-guide)
- [Building from Source](#building-from-source)
- [License](#license)

---

## Features

### Core Editor Features

- **Syntax Highlighting** - Full TiddlyWiki5 wikitext highlighting with nested language support
- **Intelligent Autocompletion** - Context-aware completions for tiddlers, macros, widgets, fields, filters, and more
- **Code Folding** - Collapse headings, widgets, pragmas, code blocks, and other structures
- **Multiple Cursors** - Edit multiple locations simultaneously
- **Search & Replace** - Powerful search with regex support
- **Bracket Matching** - Highlight matching brackets, auto-close brackets
- **Undo/Redo** - Full history with unlimited undo levels
- **Line Numbers** - Optional line number gutter with active line highlighting

### TiddlyWiki-Specific Features

- **Ctrl+Click Navigation** - Navigate to tiddlers, macros, and widgets
- **Link Preview** - Hover over links to see tiddler content
- **Image Preview** - Inline preview of images in the editor
- **Wikitext Linting** - Real-time validation with quick fixes
- **Code Snippets** - Expandable templates with tab stops
- **Toolbar Integration** - Full TiddlyWiki editor toolbar support
- **Color Picker** - Visual color editing for hex/rgb/hsl values
- **Emoji Picker** - Insert emojis via autocompletion
- **Zen Mode** - Distraction-free fullscreen editing
- **Word Count** - Live word, character, and line statistics

### Syntax Support

#### Block-Level Elements

| Element | Syntax | Description |
|---------|--------|-------------|
| Headings | `!` to `!!!!!!` | Six heading levels |
| Bullet Lists | `*`, `**`, etc. | Nested bullet lists |
| Numbered Lists | `#`, `##`, etc. | Nested numbered lists |
| Definition Lists | `;` and `:` | Term and definition pairs |
| Block Quotes | `<<<` | Multi-line quotes |
| Code Blocks | ` ``` ` | Fenced code with language support |
| Typed Blocks | `$$$` | Raw content blocks with type |
| Tables | `\|cell\|cell\|` | Pipe-delimited tables |
| Horizontal Rules | `---` | Separator lines |
| HTML Blocks | `<div>...</div>` | Full HTML support |

#### Pragmas

| Pragma | Description |
|--------|-------------|
| `\define name()` | Macro definition |
| `\procedure name()` | Procedure definition |
| `\function name()` | Function definition |
| `\widget $name()` | Widget definition |
| `\parameters()` | Parameter declarations |
| `\import [filter]` | Import macros from tiddlers |
| `\rules only/except` | Parser rule configuration |
| `\whitespace trim/notrim` | Whitespace handling |

#### Inline Elements

| Element | Syntax | Description |
|---------|--------|-------------|
| Bold | `''text''` | Bold text |
| Italic | `//text//` | Italic text |
| Underline | `__text__` | Underlined text |
| Strikethrough | `~~text~~` | Strikethrough text |
| Superscript | `^^text^^` | Superscript text |
| Subscript | `,,text,,` | Subscript text |
| Inline Code | `` `code` `` | Monospace code |
| WikiLinks | `[[target]]` | Internal links |
| Pretty Links | `[[text\|target]]` | Links with display text |
| External Links | `[ext[text\|url]]` | External URLs |
| Images | `[img[source]]` | Image embedding |
| Transclusions | `{{tiddler}}` | Content transclusion |
| Filtered Transclusions | `{{{filter}}}` | Filter-based transclusion |
| Macros | `<<name params>>` | Macro calls |
| Widgets | `<$widget attrs/>` | Widget elements |
| Variables | `$(variable)$` | Variable substitution |
| HTML | `<tag>` | HTML elements |

---

## Installation

### For TiddlyWiki Users

1. Download the plugin from the [releases page](https://github.com/BurningTreeC/tiddlywiki-codemirror-parser/releases)
2. Drag and drop the plugin file into your TiddlyWiki
3. Save and reload

### For Node.js TiddlyWiki

```bash
npm install @BurningTreeC/tiddlywiki-codemirror
```

Add to your `tiddlywiki.info`:

```json
{
  "plugins": [
    "BurningTreeC/tiddlywiki-codemirror"
  ]
}
```

### For npm Projects

```bash
npm install @BurningTreeC/lang-tiddlywiki
```

```javascript
import { EditorView, basicSetup } from "codemirror"
import { tiddlywiki } from "@BurningTreeC/lang-tiddlywiki"

const view = new EditorView({
  parent: document.body,
  doc: "! Hello TiddlyWiki\n\nThis is ''bold'' text.",
  extensions: [basicSetup, tiddlywiki()]
})
```

---

## Available Plugins

### Core Plugins

| Plugin | Description |
|--------|-------------|
| **editor** | Main CodeMirror 6 editor engine |
| **lang-tiddlywiki** | TiddlyWiki wikitext syntax support |
| **fold** | Code folding for all block structures |
| **line-numbers** | Line number gutter and active line highlighting |
| **auto-close-tags** | Automatic closing of widgets and HTML tags |

### Enhancement Plugins

| Plugin | Description |
|--------|-------------|
| **lint** | Real-time wikitext validation with quick fixes |
| **snippets** | User-defined code snippets with tab stops |
| **click-navigate** | Ctrl+Click navigation to tiddlers |
| **link-preview** | Hover preview for links and transclusions |
| **image-preview** | Inline image preview below `[img[]]` syntax |
| **color-picker** | Visual color picker for color values |
| **emoji-picker** | Emoji autocompletion with `:name:` syntax |
| **word-count** | Live word/character/line statistics |
| **zen-mode** | Distraction-free fullscreen editing |
| **toolbars** | Custom toolbar button styles |

### Keymap Plugins

| Plugin | Description |
|--------|-------------|
| **keymap-vim** | Full Vim emulation with all modes |
| **keymap-emacs** | Emacs-style keybindings |

### Language Plugins

| Plugin | Languages |
|--------|-----------|
| **lang-javascript** | JavaScript, TypeScript, JSX, TSX |
| **lang-css** | CSS |
| **lang-html** | HTML with nested CSS/JS |
| **lang-json** | JSON |
| **lang-markdown** | Markdown |
| **lang-python** | Python |
| **lang-xml** | XML, SVG |
| **lang-sql** | SQL |
| **lang-yaml** | YAML |

### Theme Plugins

| Plugin | Variants |
|--------|----------|
| **theme-dracula** | Dark, Light |
| **theme-github** | Light, Dark |
| **theme-gruvbox** | Light, Dark |
| **theme-monokai** | Dark |
| **theme-nord** | Dark |
| **theme-one** | Light, Dark |
| **theme-solarized** | Light, Dark |
| **theme-tokyo-night** | Night, Storm, Day |
| **theme-catppuccin** | Latte, Frappe, Macchiato, Mocha |
| **theme-ayu** | Light, Mirage, Dark |
| **theme-everforest** | Light, Dark |
| **theme-rose-pine** | Dawn, Moon, Main |
| **theme-palenight** | Dark |
| **theme-material** | Light, Dark |
| **theme-kanagawa** | Wave, Dragon, Lotus |
| **theme-flexoki** | Light, Dark |
| **theme-zenburn** | Dark |

---

## Configuration

### Editor Settings

All settings are stored in config tiddlers under `$:/config/codemirror-6/`:

| Config Tiddler | Default | Description |
|----------------|---------|-------------|
| `lineNumbers` | `yes` | Show line numbers |
| `lineWrapping` | `yes` | Wrap long lines |
| `highlightActiveLine` | `yes` | Highlight current line |
| `bracketMatching` | `yes` | Highlight matching brackets |
| `closeBrackets` | `yes` | Auto-close brackets |
| `foldGutter` | `yes` | Show fold gutter |
| `tabSize` | `4` | Tab width in spaces |
| `indentUnit` | `  ` | Indentation string |
| `fontSize` | `14px` | Editor font size |
| `fontFamily` | (system) | Editor font family |
| `theme` | `default` | Color theme |

### Autocompletion Settings

| Config Tiddler | Default | Description |
|----------------|---------|-------------|
| `autocomplete` | `yes` | Enable autocompletion |
| `completeTiddlers` | `yes` | Complete tiddler titles |
| `completeMacros` | `yes` | Complete macro/procedure/function names |
| `completeWidgets` | `yes` | Complete widget names |
| `completeFields` | `yes` | Complete field names |
| `completeFilterOperators` | `yes` | Complete filter operators |
| `emojiPicker` | `yes` | Enable emoji completion |

### Lint Settings

| Config Tiddler | Default | Description |
|----------------|---------|-------------|
| `lint` | `yes` | Enable linting |
| `lint/missingLinks` | `yes` | Check for missing tiddlers |
| `lint/undefinedMacros` | `yes` | Check for undefined macros |
| `lint/unknownWidgets` | `yes` | Check for unknown widgets |
| `lint/unclosedWidgets` | `yes` | Check for unclosed widgets |
| `lint/unclosedPragmas` | `yes` | Check for unclosed pragmas |
| `lint/misplacedPragmas` | `yes` | Check for misplaced pragmas |
| `lint/filterSyntax` | `yes` | Check filter bracket balance |
| `lint/unclosedConditionals` | `yes` | Check for unclosed <%if blocks |
| `lint/unclosedCodeBlocks` | `yes` | Check for unclosed code blocks |
| `lint/duplicateDefinitions` | `yes` | Check for duplicate definitions |
| `lint/unusedDefinitions` | `no` | Check for unused definitions |

### Feature Toggles

| Config Tiddler | Default | Description |
|----------------|---------|-------------|
| `clickNavigate` | `yes` | Ctrl+Click navigation |
| `linkPreview` | `yes` | Hover link preview |
| `imagePreview` | `yes` | Inline image preview |
| `colorPicker` | `yes` | Color picker swatches |
| `wordCount` | `yes` | Word count panel |
| `toolbar-style` | `classic` | Toolbar button style |

---

## Keyboard Shortcuts

### Text Formatting

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Toggle bold |
| `Ctrl+I` | Toggle italic |
| `Ctrl+U` | Toggle underline |
| `` Ctrl+` `` | Toggle inline code |
| `Ctrl+K` | Insert wiki link |
| `Ctrl+Shift+K` | Insert transclusion |

### Headings

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` to `Ctrl+6` | Set heading level |
| `Ctrl+0` | Remove heading |

### Lists

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+8` | Toggle bullet list |
| `Ctrl+Shift+7` | Toggle numbered list |
| `Tab` | Indent list item |
| `Shift+Tab` | Outdent list item |
| `Enter` | Continue list markup |
| `Backspace` | Remove list level (at start) |

### Code

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Insert code block |

### Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl+G` | Go to line |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find and replace |
| `F3` / `Ctrl+G` | Find next |
| `Shift+F3` | Find previous |
| `Ctrl+D` | Select next occurrence |

### Editing

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+/` | Toggle line comment |
| `Alt+Up` | Move line up |
| `Alt+Down` | Move line down |
| `Ctrl+Shift+K` | Delete line |
| `Ctrl+Enter` | Insert line below |
| `Ctrl+Shift+Enter` | Insert line above |

### Folding

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+[` | Fold at cursor |
| `Ctrl+Shift+]` | Unfold at cursor |

### Linting

| Shortcut | Action |
|----------|--------|
| `F8` | Go to next issue |
| `Shift+F8` | Go to previous issue |

### Zen Mode

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Z` | Toggle Zen Mode |
| `Escape` | Exit Zen Mode |

---

## Autocompletion

### Triggers

| Trigger | Completions |
|---------|-------------|
| `[[` | Tiddler titles |
| `{{` | Tiddler titles (transclusion) |
| `<<` | Macro, procedure, function names |
| `<$` | Widget names |
| `\` at line start | Pragma keywords |
| `[` in filter | Filter operators |
| `[tag[` | Tag names |
| `[field:` | Field names |
| `!!` after `{{tiddler` | Field names |
| `##` after `{{tiddler` | Index names |
| `:` in filter | Run prefixes (`:filter`, `:map`, etc.) |
| `:` after emoji trigger | Emoji names |

### Filter Operator Completion

The editor provides intelligent completion for filter operators including:

- All built-in operators with descriptions
- Operator suffixes (`:casesensitive`, `:reverse`, etc.)
- Field names for field operators
- Variable completions in angle brackets

### Custom Snippets

Create custom snippets by adding tiddlers with the tag `$:/tags/CodeMirror/Snippet`:

```
title: My Snippet
tags: $:/tags/CodeMirror/Snippet
trigger: mysnip
caption: My Snippet
description: Insert my custom pattern
scope: text/vnd.tiddlywiki

<$list filter="${1:[tag[Example]]}">
  ${2:content}
</$list>
$0
```

**Placeholder Syntax:**
- `${1}` - Tab stop 1
- `${1:default}` - Tab stop with default text
- `$0` - Final cursor position

---

## Linting

The lint plugin checks for common issues in your wikitext:

### Error Levels

| Level | Color | Description |
|-------|-------|-------------|
| Error | Red | Syntax errors that will cause problems |
| Warning | Yellow | Issues that may cause unexpected behavior |
| Info | Blue | Suggestions and possibly undefined references |
| Hint | Grey | Style suggestions |

### Quick Fixes

Click on lint markers to see available automatic fixes:

- **Add closing tag** - Insert missing `</$widget>` or `\end`
- **Make self-closing** - Convert `<$widget>` to `<$widget/>`
- **Move to top** - Move misplaced pragma to document top
- **Remove definition** - Remove unused macro/procedure
- **Add <%endif%>** - Close unclosed conditional
- **Add closing ``` ** - Close unclosed code block

---

## Themes

### Setting a Theme

Set your theme in `$:/config/codemirror-6/theme` or via Control Panel.

### Theme Variants

Most themes include light and dark variants:

```
theme-name        # Default variant
theme-name-light  # Light variant
theme-name-dark   # Dark variant
```

### Custom Themes

Create custom themes by defining CSS variables:

```css
.cm-editor {
  --cm-background: #1a1a2e;
  --cm-foreground: #eee;
  --cm-selection: #44475a;
  --cm-cursor: #f8f8f2;
  --cm-activeLine: #44475a40;

  /* Syntax colors */
  --cm-keyword: #ff79c6;
  --cm-string: #f1fa8c;
  --cm-number: #bd93f9;
  --cm-comment: #6272a4;
  --cm-function: #50fa7b;
  --cm-variable: #f8f8f2;
  --cm-operator: #ff79c6;
}
```

---

## API Reference

### Engine Methods

#### Document Operations

```javascript
// Get/set content
engine.getText()                    // Get full document text
engine.setText(text)                // Set document text
engine.getLine(n)                   // Get line n (1-based)
engine.getLineCount()               // Get number of lines
engine.getRange(from, to)           // Get text in range
engine.replaceRange(from, to, text) // Replace range with text
engine.insert(text, pos)            // Insert text at position
```

#### Selection & Cursor

```javascript
engine.getCursor()                  // Get cursor position
engine.setCursor(pos)               // Set cursor position
engine.getSelection()               // Get selection info
engine.setSelection(anchor, head)   // Set selection
engine.selectAll()                  // Select all text
engine.replaceSelection(text)       // Replace selection
```

#### History

```javascript
engine.undo()                       // Undo last change
engine.redo()                       // Redo last undone change
engine.canUndo()                    // Check if undo available
engine.canRedo()                    // Check if redo available
```

#### Formatting (TiddlyWiki)

```javascript
engine.toggleBold()                 // Toggle bold formatting
engine.toggleItalic()               // Toggle italic formatting
engine.toggleUnderline()            // Toggle underline formatting
engine.toggleStrikethrough()        // Toggle strikethrough
engine.toggleCode()                 // Toggle inline code
engine.toggleSuperscript()          // Toggle superscript
engine.toggleSubscript()            // Toggle subscript
```

#### Structure (TiddlyWiki)

```javascript
engine.setHeading(level)            // Set heading level (1-6)
engine.removeHeading()              // Remove heading
engine.toggleBulletList()           // Toggle bullet list
engine.toggleNumberedList()         // Toggle numbered list
engine.insertWikiLink()             // Insert [[link]]
engine.insertTransclusion()         // Insert {{transclusion}}
engine.insertCodeBlock()            // Insert fenced code block
```

#### Folding

```javascript
engine.foldAt(pos)                  // Fold at position
engine.unfoldAt(pos)                // Unfold at position
engine.foldAll()                    // Fold all regions
engine.unfoldAll()                  // Unfold all regions
engine.toggleFold(pos)              // Toggle fold state
engine.isFoldable(pos)              // Check if foldable
engine.getFoldedRanges()            // Get folded ranges
```

#### Search

```javascript
engine.openSearch()                 // Open search panel
engine.closeSearch()                // Close search panel
engine.findNext()                   // Find next match
engine.findPrevious()               // Find previous match
engine.replaceNext()                // Replace next match
engine.replaceAll()                 // Replace all matches
```

#### Navigation

```javascript
engine.navigateToTiddler(title)     // Navigate to tiddler
engine.openTiddlerInNewWindow(title) // Open in new window
engine.getLinkAtCursor()            // Get link under cursor
```

#### Snippets

```javascript
engine.getUserSnippets()            // Get user-defined snippets
engine.getSnippets(contentType)     // Get snippets for content type
engine.insertUserSnippet(trigger)   // Insert snippet by trigger
engine.clearSnippetCache()          // Clear snippet cache
```

#### Linting

```javascript
engine.lint()                       // Force lint check
engine.nextDiagnostic()             // Go to next issue
engine.previousDiagnostic()         // Go to previous issue
```

#### Configuration

```javascript
engine.setLineNumbers(show)         // Show/hide line numbers
engine.setLineWrapping(wrap)        // Enable/disable wrapping
engine.setHighlightActiveLine(show) // Enable/disable active line
engine.setFoldGutter(show)          // Show/hide fold gutter
engine.setTheme(themeName)          // Change theme
engine.reconfigure(key, extension)  // Reconfigure compartment
```

---

## Developer Guide

### Creating a Plugin

Plugins use the `module-type: codemirror6-plugin` format:

```javascript
/*\
title: $:/plugins/yourname/myplugin/plugin.js
type: application/javascript
module-type: codemirror6-plugin
\*/
(function(){
"use strict";

exports.plugin = {
    // Required: Unique plugin name
    name: "my-plugin",

    // Optional: Description
    description: "My custom plugin",

    // Optional: Load order (higher = earlier, default: 0)
    priority: 50,

    // Optional: Conditional loading
    condition: function(context) {
        // Return true to load, false to skip
        return context.tiddlerType === "text/vnd.tiddlywiki";
    },

    // Optional: Initialize with CM6 core reference
    init: function(cm6Core) {
        this._core = cm6Core;
    },

    // Optional: Register compartments for dynamic config
    registerCompartments: function() {
        return {
            myFeature: new this._core.state.Compartment()
        };
    },

    // Required: Return CodeMirror 6 extensions
    getExtensions: function(context) {
        return [
            // Your CM6 extensions
        ];
    },

    // Optional: Add methods to engine API
    extendAPI: function(engine, context) {
        return {
            myMethod: function() {
                return engine.getText();
            }
        };
    },

    // Optional: Register event handlers
    registerEvents: function(engine, context) {
        return {
            settingsChanged: function(settings) {
                if (settings.myFeature !== undefined) {
                    engine.reconfigure("myFeature",
                        settings.myFeature ? myExtension : []);
                }
            }
        };
    }
};

})();
```

### Plugin Context Object

```javascript
{
    tiddlerTitle: "MyTiddler",          // Tiddler being edited
    tiddlerType: "text/vnd.tiddlywiki", // Content type
    tiddlerFields: { ... },             // All tiddler fields
    readOnly: false,                    // Read-only mode
    parentNode: HTMLElement,            // Container element
    widget: EditTextWidget,             // TiddlyWiki widget
    engine: CodeMirrorEngine,           // Engine instance
    options: { ... }                    // Engine options
}
```

### Plugin Lifecycle

1. **Discovery** - Engine finds all `codemirror6-plugin` modules
2. **Sorting** - Plugins sorted by priority (descending)
3. **Condition Check** - `condition()` called for each plugin
4. **Initialization** - `init()` called with CM6 core
5. **Compartments** - `registerCompartments()` registers dynamic configs
6. **Extensions** - `getExtensions()` returns CM6 extensions
7. **API** - `extendAPI()` adds methods to engine
8. **Events** - `registerEvents()` registers handlers

### Available Events

| Event | Description |
|-------|-------------|
| `settingsChanged` | Configuration tiddler changed |
| `themeChanged` | Theme changed |
| `contentTypeChanged` | Tiddler type changed |
| `beforeDestroy` | Engine about to be destroyed |

### Accessing CodeMirror 6 APIs

```javascript
init: function(cm6Core) {
    // State
    const { EditorState, StateField, StateEffect, Compartment } = cm6Core.state;

    // View
    const { EditorView, ViewPlugin, Decoration, WidgetType } = cm6Core.view;

    // Language
    const { syntaxTree, Language, LanguageSupport } = cm6Core.language;

    // Commands
    const { defaultKeymap, history, historyKeymap } = cm6Core.commands;

    // Autocomplete
    const { autocompletion, completionKeymap } = cm6Core.autocomplete;

    // Search
    const { search, searchKeymap } = cm6Core.search;

    // Lint
    const { linter, lintGutter } = cm6Core.lint;
}
```

---

## Building from Source

### Prerequisites

- Node.js 18+
- npm 9+

### Build Commands

```bash
# Install dependencies
npm install

# Build everything (ESM, CJS, types, TiddlyWiki plugin)
npm run build

# Build individual targets
npm run build:parser      # Parser only (dist/parser.js)
npm run build:codemirror  # Full bundle (dist/index.js)
npm run build:tiddlywiki  # TiddlyWiki plugin (plugins/lang-tiddlywiki/)

# Development
npm run dev               # Watch mode with rebuilds

# Clean
npm run clean             # Remove dist/ directory

# Test
npm test                  # Run test suite
```

### Project Structure

```
src/
├── index.ts                    # Main entry point
├── commands.ts                 # Editor commands
├── linter.ts                   # Wikitext linter
├── tiddlywiki-plugin-entry.ts  # TiddlyWiki plugin entry
└── tiddlywiki-parser/
    ├── language.ts             # Language definition
    ├── language-support.ts     # CodeMirror integration
    ├── parser.ts               # Main parser
    ├── block-context.ts        # Block parsing context
    ├── block-parsers.ts        # Block-level parsers
    ├── inline-context.ts       # Inline parsing context
    ├── inline-parsers.ts       # Inline-level parsers
    ├── pragma-parsers.ts       # Pragma parsers
    ├── parser-utils.ts         # Shared utilities
    ├── core.ts                 # Core types and functions
    └── types.ts                # Node type definitions

plugins/
├── editor/                     # Main editor engine
├── lang-tiddlywiki/            # TiddlyWiki language support
├── lint/                       # Linting plugin
├── fold/                       # Code folding
├── snippets/                   # User snippets
├── click-navigate/             # Ctrl+Click navigation
├── link-preview/               # Hover previews
├── image-preview/              # Image previews
├── color-picker/               # Color picker
├── emoji-picker/               # Emoji completion
├── word-count/                 # Statistics
├── zen-mode/                   # Fullscreen mode
├── toolbars/                   # Toolbar styles
├── auto-close-tags/            # Tag closing
├── line-numbers/               # Line numbers
├── keymap-vim/                 # Vim bindings
├── keymap-emacs/               # Emacs bindings
├── lang-*/                     # Language support plugins
└── theme-*/                    # Color themes

dist/
├── index.js                    # ESM bundle
├── index.cjs                   # CommonJS bundle
├── index.d.ts                  # TypeScript definitions
├── parser.js                   # Parser-only ESM
├── parser.cjs                  # Parser-only CJS
└── parser.d.ts                 # Parser type definitions
```

### Type Definitions

The package includes full TypeScript definitions:

```typescript
import {
    tiddlywiki,
    tiddlywikiLanguage,
    TiddlyWikiConfig
} from "@BurningTreeC/lang-tiddlywiki"

import {
    parser,
    TiddlyWikiParser
} from "@BurningTreeC/lang-tiddlywiki/parser"
```

---

## License

MIT License

Copyright (c) 2026 Simon Huber

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
