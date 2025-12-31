# @prtw/lang-tiddlywiki

TiddlyWiki5 language support for [CodeMirror 6](https://codemirror.net/), providing syntax highlighting, autocompletion, and editing commands for TiddlyWiki's Wikitext format.

This package provides an incremental parser for TiddlyWiki5 Wikitext, analogous to [@lezer/markdown](https://github.com/lezer-parser/markdown). It integrates with the [Lezer](https://lezer.codemirror.net/) parser system, producing compact syntax trees suitable for syntax highlighting and code analysis.

## Features

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

### With Configuration

```javascript
import {tiddlywiki} from "@prtw/lang-tiddlywiki"
import {javascript} from "@codemirror/lang-javascript"

const view = new EditorView({
  extensions: [
    tiddlywiki({
      // Default language for code blocks without info string
      defaultCodeLanguage: javascript(),
      
      // Enable/disable features
      addKeymap: true,
      completeHTMLTags: true,
      completeWidgets: true,
      completeMacros: true
    })
  ]
})
```

### Parser Only (without CodeMirror)

```javascript
import {parser} from "@prtw/lang-tiddlywiki/parser"

const tree = parser.parse(`! Heading\n\nParagraph text`)
// Use the syntax tree for analysis
```

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

## API Reference

### `tiddlywiki(config?)`

Creates a `LanguageSupport` instance for TiddlyWiki.

**Options:**
- `defaultCodeLanguage`: Default language for code blocks
- `codeLanguages`: Language descriptions for code block highlighting
- `addKeymap`: Whether to add the TiddlyWiki keymap (default: `true`)
- `extensions`: Parser extensions
- `base`: Base language (default: `tiddlywikiBaseLanguage`)
- `completeHTMLTags`: Enable HTML tag completion (default: `true`)
- `completeWidgets`: Enable widget completion (default: `true`)
- `completeMacros`: Enable macro completion (default: `true`)
- `htmlTagLanguage`: Language support for embedded HTML

### Languages

- `tiddlywikiLanguage`: Full TiddlyWiki language with all extensions
- `tiddlywikiBaseLanguage`: Base CommonMark-like TiddlyWiki parser

### Commands

Formatting toggles:
- `toggleBold`, `toggleItalic`, `toggleUnderline`
- `toggleStrikethrough`, `toggleSuperscript`, `toggleSubscript`
- `toggleInlineCode`

Insertions:
- `insertWikiLink`, `insertTransclusion`, `insertMacroCall`
- `insertCodeBlock`, `insertHorizontalRule`

Headings:
- `setHeading1` through `setHeading6`, `removeHeading`

Lists:
- `toggleBulletList`, `toggleNumberedList`

Navigation:
- `insertNewlineContinueMarkup`, `deleteMarkupBackward`

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

# Build TiddlyWiki plugin bundle
npm run build:tiddlywiki

# Clean build output
npm run clean
```

## TiddlyWiki Plugin

The package can be built as a TiddlyWiki5 plugin:

```bash
npm run build:tiddlywiki
```

This creates a bundle in `dist/tiddlywiki-plugin/` that can be installed in TiddlyWiki5.

## Project Structure

```
src/
├── tiddlywiki.ts          # Core Lezer-style parser
├── extension.ts           # Parser extensions (math, comments, etc.)
├── index.ts               # Parser exports
├── codemirror-tiddlywiki.ts  # CodeMirror language integration
├── commands.ts            # Editor commands
└── codemirror-index.ts    # Main entry point
```

## License

MIT

## Related Projects

- [CodeMirror 6](https://codemirror.net/)
- [Lezer](https://lezer.codemirror.net/)
- [@lezer/markdown](https://github.com/lezer-parser/markdown)
- [TiddlyWiki5](https://tiddlywiki.com/)
