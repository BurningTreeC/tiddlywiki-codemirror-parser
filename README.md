# @BurningTreeC/lang-tiddlywiki

> TiddlyWiki5 wikitext language support for [CodeMirror 6](https://codemirror.net/)

This project is the **parser and language** at the heart of *CodeMirror 6 for TiddlyWiki*. It implements a custom, incremental, [Lezer](https://lezer.codemirror.net/)-compatible parser for TiddlyWiki's wikitext, together with the CodeMirror integration that turns it into syntax highlighting, context‑aware autocompletion, code folding and linting.

It ships in two forms, both built from the source in this repository:

1. **An npm package** — `@BurningTreeC/lang-tiddlywiki` — so you can use TiddlyWiki wikitext as a language in any CodeMirror 6 application.
2. **A set of TiddlyWiki plugins** — the `lang-tiddlywiki` plugin plus the bundled CodeMirror 6 libraries, language packs, keymaps, minimap, search and lint modules that the TiddlyWiki plugin suite loads.

> Looking for the full editor (themes, keymaps, zen mode, click‑navigate, control‑panel settings, …)? Those plugins live in the TiddlyWiki tree this repository builds into — see [Part of CodeMirror 6 for TiddlyWiki](#part-of-codemirror-6-for-tiddlywiki).

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [What the parser understands](#what-the-parser-understands)
- [Autocompletion](#autocompletion)
- [Linting](#linting)
- [Building from source](#building-from-source)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Part of CodeMirror 6 for TiddlyWiki](#part-of-codemirror-6-for-tiddlywiki)
- [License](#license)

---

## Features

- **Incremental wikitext parser** — a Lezer‑compatible `Parser` that produces a syntax tree for TiddlyWiki wikitext and re‑parses efficiently on edits.
- **Syntax highlighting** — full highlighting for pragmas, block elements, inline markup, filters, macros, widgets and HTML.
- **Context‑aware autocompletion** — completion sources for tiddlers, fields, macros/procedures/functions, widgets, HTML, filters, pragmas, wiki rules, conditionals and more.
- **Code folding** — folding hooks for headings, widgets, pragmas, code blocks and other structures.
- **Linting** — wikitext validation (missing links, undefined macros, unknown/unclosed widgets, filter syntax, pragma context, …).
- **Nested / mixed languages** — fenced code blocks and typed blocks are highlighted with the embedded language when the matching language pack is available.
- **Optional KaTeX/LaTeX support** — `$$…$$` math blocks and `<$latex>` content are parsed and highlighted when KaTeX is present.

---

## Installation

```bash
npm install @BurningTreeC/lang-tiddlywiki
# or
pnpm add @BurningTreeC/lang-tiddlywiki
```

Peer dependencies are the standard CodeMirror 6 packages (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/autocomplete`, `@codemirror/commands`, `@codemirror/lint`, `@codemirror/lang-html`).

---

## Usage

### Full language support (default entry)

The package's main entry provides the complete CodeMirror integration: the language, highlighting, completion, the editor commands and the linter.

```javascript
import { EditorView, basicSetup } from "codemirror"
import { tiddlywiki } from "@BurningTreeC/lang-tiddlywiki"

const view = new EditorView({
  parent: document.body,
  doc: "! Hello TiddlyWiki\n\nThis is ''bold'' text.",
  extensions: [basicSetup, tiddlywiki()]
})
```

`tiddlywiki(config?)` returns a CodeMirror `LanguageSupport`. Also exported from the main entry: `tiddlywikiLanguage`, `tiddlywikiHighlightStyle`, `tiddlywikiKeymap`, the formatting/structure commands (`toggleBold`, `insertWikiLink`, `setHeading1`, …), and the linters (`tiddlywikiLinter`, `substitutedParamLinter`).

### Parser only (sub‑path entry)

If you only need the parser/language without the editor commands and extras, import from the `./parser` sub‑path:

```javascript
import { parser, tiddlywikiLanguage } from "@BurningTreeC/lang-tiddlywiki/parser"
```

### Package entry points

| Import | Built from | Output |
|--------|-----------|--------|
| `@BurningTreeC/lang-tiddlywiki` | `src/codemirror.ts` | `dist/index.js` · `dist/index.cjs` · `dist/index.d.ts` |
| `@BurningTreeC/lang-tiddlywiki/parser` | `src/index.ts` | `dist/parser.js` · `dist/parser.cjs` · `dist/parser.d.ts` |

Both ESM and CommonJS builds ship with TypeScript type definitions.

---

## What the parser understands

### Pragmas

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

### Block‑level elements

| Element | Syntax | Description |
|---------|--------|-------------|
| Headings | `!` to `!!!!!!` | Six heading levels |
| Bullet lists | `*`, `**`, … | Nested bullet lists |
| Numbered lists | `#`, `##`, … | Nested numbered lists |
| Definition lists | `;` and `:` | Term and definition pairs |
| Block quotes | `<<<` | Multi‑line quotes |
| Code blocks | ` ``` ` | Fenced code with language support |
| Typed blocks | `$$$` | Raw content blocks with type |
| Tables | `\|cell\|cell\|` | Pipe‑delimited tables |
| Horizontal rules | `---` | Separator lines |
| HTML blocks | `<div>...</div>` | Full HTML support |

### Inline elements

| Element | Syntax | Description |
|---------|--------|-------------|
| Bold | `''text''` | Bold text |
| Italic | `//text//` | Italic text |
| Underline | `__text__` | Underlined text |
| Strikethrough | `~~text~~` | Strikethrough text |
| Superscript | `^^text^^` | Superscript text |
| Subscript | `,,text,,` | Subscript text |
| Inline code | `` `code` `` | Monospace code |
| WikiLinks | `[[target]]` | Internal links |
| Pretty links | `[[text\|target]]` | Links with display text |
| External links | `[ext[text\|url]]` | External URLs |
| Images | `[img[source]]` | Image embedding |
| Transclusions | `{{tiddler}}` | Content transclusion |
| Filtered transclusions | `{{{filter}}}` | Filter‑based transclusion |
| Macros | `<<name params>>` | Macro calls |
| Widgets | `<$widget attrs/>` | Widget elements |
| Variables | `$(variable)$` | Variable substitution |
| HTML | `<tag>` | HTML elements |

---

## Autocompletion

Completion sources live in `src/parser/completions/` and are context‑aware:

| Trigger | Completions |
|---------|-------------|
| `[[` | Tiddler titles |
| `{{` | Tiddler titles (transclusion) |
| `<<` | Macro / procedure / function names |
| `<$` | Widget names and attributes |
| `<` | HTML tags and attributes |
| `\` at line start | Pragma keywords |
| `[` in a filter | Filter operators and suffixes |
| `[tag[` | Tag names |
| `[field:` / `!!` / `##` | Field and index names |
| `:` in a filter | Run prefixes (`:filter`, `:map`, …) |
| `@@` | Styled‑span classes and CSS properties |
| `<%` | Conditionals (`<%if%>`, `<%elseif%>`, …) |

Additional sources cover code‑block language names, wiki rule names (`\rules only/except`), and macro parameter substitutions.

---

## Linting

The linter (`src/linter.ts`) reports:

- Links to missing tiddlers
- Undefined macros / procedures / functions / variables
- Unknown widgets
- Unclosed widgets, brackets, conditionals and code blocks
- Filter syntax problems
- Pragma issues (wrong parameter names, wrong context for `$param$` / `__param__`)

It understands action‑attribute implicit variables (e.g. `actionTiddler`), wildcard variable patterns (`dom-*`, `event-*`) and parameter scope inherited from enclosing pragmas.

---

## Building from source

### Prerequisites

- Node.js 18+
- npm or [pnpm](https://pnpm.io/) (the CI plugin build uses pnpm)

### Commands

```bash
# Install dependencies
npm install            # or: pnpm install

# Build the npm package (ESM + CJS + type declarations -> dist/)
npm run build

# Build the TiddlyWiki plugins (applies patches, then bundles)
npm run build:plugins

# Build both
npm run build:all

# Watch modes
npm run dev            # watch the TiddlyWiki plugin build
npm run watch          # watch the npm package build

# Quality
npm run typecheck      # tsc --noEmit
npm run lint           # eslint the built plugin sources
npm run format         # js-beautify the plugin sources

# Cleaning / rebuilding
npm run clean          # remove dist/
npm run clean:plugins  # remove generated plugin files
npm run rebuild        # clean + build everything
npm run rebuild:plugins # clean + rebuild the plugins only
```

### Where the plugin build goes

`npm run build:plugins` writes into a sibling TiddlyWiki checkout at `../TiddlyWiki5/plugins/tiddlywiki`. Override the destination with the `TW_PLUGIN_OUTPUT_DIR` environment variable (CI builds into `dist/tiddlywiki-plugin/...`).

It produces:

- **`lang-tiddlywiki`** — the TiddlyWiki parser plugin (built from `src/plugin.ts`)
- **Core CodeMirror 6 libraries** — state, view, commands, language, autocomplete, lang‑html, lezer‑common, lezer‑highlight
- **Language packs** — JavaScript/TypeScript, CSS, HTML, JSON, Markdown, XML, YAML, CSV, Python, SQL, Rust, Sass, Go, PHP, C/C++, Java, WAST, Lezer, LaTeX
- **Keymaps** — Vim and Emacs
- **Minimap, search and lint modules**

### Patches

Some bundled dependencies carry local fixes (e.g. wrap‑aware scrolling in `@replit/codemirror-minimap`). Patches are applied in a package‑manager‑agnostic way:

- **pnpm** applies them at install time via `patchedDependencies` in `pnpm-workspace.yaml`.
- **Any package manager** is covered by the build itself: `build:plugins` first runs `scripts/apply-patches.js`, which idempotently applies the files in `patches/` to `node_modules` (and skips anything already patched).

---

## Repository layout

```
parser/
├── src/
│   ├── codemirror.ts          # npm main entry — full CodeMirror integration
│   ├── index.ts               # npm "./parser" entry — parser only
│   ├── plugin.ts              # TiddlyWiki plugin entry (lang-tiddlywiki)
│   ├── commands.ts            # editor commands (formatting, structure)
│   ├── linter.ts              # wikitext linter
│   ├── lang-css-wrapper.js    # CSS language wrapper for the plugin build
│   └── parser/
│       ├── parser.ts          # main TiddlyWikiParser
│       ├── block-context.ts   # block parsing context
│       ├── block-parsers.ts   # block-level parsers
│       ├── inline-context.ts  # inline parsing context
│       ├── inline-parsers.ts  # inline-level parsers
│       ├── pragma-parsers.ts  # pragma parsers
│       ├── language.ts        # CodeMirror language + highlight styles
│       ├── highlighting.ts    # highlight tags
│       ├── mixed-language.ts  # nested/embedded language support
│       ├── extensions.ts      # editor extensions
│       ├── keymap.ts          # default keymap
│       ├── tiddlywiki.ts      # tiddlywiki() LanguageSupport factory
│       ├── config.ts, core.ts, types.ts, utils.ts
│       └── completions/       # autocompletion sources
├── rollup.config.js           # builds the npm package
├── rollup.config.plugins.js   # builds the TiddlyWiki plugins
├── scripts/apply-patches.js   # build-time patch applier
├── patches/                   # dependency patches
├── tsconfig.json · tsconfig.ci.json · eslint.config.js
└── .github/workflows/         # CI (npm package + pnpm plugin build)
```

---

## Architecture

The parser is a custom Lezer‑style incremental parser rather than a grammar‑generated one, so it can faithfully model TiddlyWiki's context‑sensitive rules.

- **Block vs inline parsing** — `block-context.ts` / `block-parsers.ts` handle block structures; `inline-context.ts` / `inline-parsers.ts` handle inline markup. Block elements require a blank line before them when preceded by text, matching TiddlyWiki's behaviour, and widget/HTML content is parsed inline or block depending on whether a blank line follows the opening tag.
- **Pragmas** — `pragma-parsers.ts` parses `\define`, `\procedure`, `\function`, `\widget`, `\parameters`, `\import`, `\rules`, `\whitespace`.
- **Language integration** — `language.ts` defines the CodeMirror `Language` and highlight styles; `tiddlywiki.ts` exposes the `tiddlywiki()` `LanguageSupport` factory; `mixed-language.ts` wires embedded languages into fenced/typed code blocks.
- **Completion & linting** — `parser/completions/` provides the autocompletion sources; `linter.ts` provides the wikitext lint rules.

---

## Part of CodeMirror 6 for TiddlyWiki

This package is one piece of the larger *CodeMirror 6 for TiddlyWiki* project. The build here emits the `lang-tiddlywiki` plugin and the bundled CodeMirror libraries; the rest of the editor — the engine, folding, snippets, click‑navigate, link/image preview, color and emoji pickers, zen mode, toolbars, themes and control‑panel settings — is authored as TiddlyWiki plugins in the TiddlyWiki tree that this repository builds into. End users typically install the assembled plugin suite into a wiki rather than this npm package directly.

---

## License

MIT License — Copyright (c) 2026 Simon Huber.

See the license text below.

<details>
<summary>Full MIT License text</summary>

```
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
```

</details>
