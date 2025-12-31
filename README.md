# @prtw/lang-tiddlywiki

TiddlyWiki5 language support for [CodeMirror 6](https://codemirror.net/), providing syntax highlighting, autocompletion, and editing commands for TiddlyWiki's Wikitext format.

This package provides an incremental parser for TiddlyWiki5 Wikitext, analogous to [@lezer/markdown](https://github.com/lezer-parser/markdown). It integrates with the [Lezer](https://lezer.codemirror.net/) parser system, producing compact syntax trees suitable for syntax highlighting and code analysis.

## Features

### Plugin System

The engine uses a modular plugin architecture via `module-type: codemirror6-plugin`. Plugins are:

- **Auto-discovered** by the engine at startup
- **Conditionally loaded** based on tiddler content type
- **Priority-ordered** for proper extension stacking

### Block-Level Syntax

- **Headings**: `!` through `!!!!!!` (6 levels)
- **Lists**: Bullets (`*`), Numbered (`#`), Definitions (`;` and `:`)
- **Tables**: Pipe-delimited tables with header detection
- **Code Blocks**: Fenced (triple backticks) and indented
- **Block Quotes**: `<<<` syntax
- **Typed Blocks**: `$$$` syntax for raw content
- **Horizontal Rules**: `---`
- **HTML Blocks**: Full HTML support

### Pragmas

- `\define` - Macro definitions
- `\procedure` - Procedure definitions  
- `\function` - Function definitions
- `\widget` - Widget definitions
- `\rules` - Parser rule configuration
- `\import` - Import macros from other tiddlers
- `\parameters` - Parameter definitions
- `\whitespace` - Whitespace handling directives

### Inline Syntax

- **Text Formatting**: Bold (`''`), Italic (`//`), Underline (`__`), Strikethrough (`~~`), Superscript (`^^`), Subscript (`,,`)
- **Code**: Inline code with backticks
- **Links**: WikiLinks (`[[link]]`, `[[text|target]]`), External Links (`[ext[text|url]]`)
- **Images**: `[img[tooltip|source]]` with attribute support
- **Transclusions**: `{{tiddler}}` and filtered `{{{filter}}}`
- **Macros**: `<<macroname params>>`
- **Widgets**: `<$widget attributes/>`
- **Variables**: `$(variable)$`
- **HTML**: Tags and entities

## Installation

```bash
npm install @prtw/lang-tiddlywiki
```

## Usage

### Basic Usage

```javascript
import {EditorView, basicSetup} from "codemirror"
import {tiddlywiki} from "@prtw/lang-tiddlywiki"

const view = new EditorView({
  parent: document.body,
  doc: `! Welcome to TiddlyWiki

This is ''bold'' and //italic// text.

* Bullet item
* Another item

[[Link to a tiddler]]
`,
  extensions: [basicSetup, tiddlywiki()]
})
```

### Parser Only (without CodeMirror)

```javascript
import {parser} from "@prtw/lang-tiddlywiki/parser"

const tree = parser.parse(`! Heading\n\nParagraph text`)
// Use the syntax tree for analysis
```

## TiddlyWiki5 Plugin System

The engine (`engine.js`) discovers and loads plugins with `module-type: codemirror6-plugin`.

### Creating a Plugin

```javascript
/*\
title: $:/plugins/yourname/yourplugin/plugin.js
type: application/javascript
module-type: codemirror6-plugin
\*/
(function(){
"use strict";

exports.plugin = {
    name: "your-plugin-name",
    description: "Description of your plugin",
    priority: 50, // Higher = loaded first (default: 0)
    
    // Optional: Only load for specific content types
    condition: function(context) {
        // context.tiddlerType is the content type
        // Return true to load, false to skip
        return context.tiddlerType === "text/plain";
    },
    
    // Required: Return array of CM6 extensions
    getExtensions: function(context) {
        return [
            // Your CodeMirror 6 extensions here
        ];
    }
};

})();
```

### Plugin Context Object

The `condition` and `getExtensions` functions receive a context object:

| Property | Description |
|----------|-------------|
| `tiddlerTitle` | Title of the tiddler being edited |
| `tiddlerType` | Content type (empty string = wikitext) |
| `tiddlerFields` | All tiddler fields |
| `readOnly` | Whether editor is read-only |
| `cm6Core` | Reference to CM6 core library |

### Built-in TiddlyWiki Plugin

The TiddlyWiki syntax plugin automatically loads for:
- Empty type (no type field)
- `text/vnd.tiddlywiki`
- `text/x-tiddlywiki`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Mod-b` | Toggle bold |
| `Mod-i` | Toggle italic |
| `Mod-u` | Toggle underline |
| `Mod-`` ` | Toggle inline code |
| `Mod-k` | Insert wiki link |
| `Mod-Shift-k` | Insert transclusion |
| `Mod-1` to `Mod-6` | Set heading level |
| `Mod-0` | Remove heading |
| `Mod-Shift-8` | Toggle bullet list |
| `Mod-Shift-7` | Toggle numbered list |
| `Mod-Shift-c` | Insert code block |
| `Enter` | Continue list/quote markup |
| `Backspace` | Delete markup level |

## Building

```bash
# Install dependencies
npm install

# Build all (ESM, CJS, types)
npm run build

# Build parser only
npm run build:parser

# Build CodeMirror integration only
npm run build:codemirror

# Build TiddlyWiki plugin (CommonJS for require())
npm run build:tiddlywiki

# Clean build output
npm run clean
```

## Project Structure

```
src/
├── tiddlywiki.ts              # Core Lezer-style parser
├── extension.ts               # Parser extensions (math, comments, etc.)
├── index.ts                   # Parser exports
├── codemirror-tiddlywiki.ts   # CodeMirror language integration
├── commands.ts                # Editor commands
├── codemirror-index.ts        # Main entry point
└── tiddlywiki-plugin-entry.ts # TW5 plugin entry point

dist/tiddlywiki-plugin/
├── engine.js                  # Enhanced CM6 engine with plugin system
├── lang-tiddlywiki.js         # TW5 syntax plugin (CommonJS)
├── plugin.info                # TW5 plugin metadata
├── readme.tid                 # Plugin documentation
├── license.tid                # License
├── startup.js                 # Initialization module
├── styles.tid                 # Syntax highlighting CSS
└── examples/                  # Example plugins for other content types
```

## License

MIT
