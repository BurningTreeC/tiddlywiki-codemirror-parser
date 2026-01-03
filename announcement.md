## Announcing: TiddlyWiki CodeMirror 6 Plugin (New Implementation)

To clarify the CodeMirror 6 situation: my earlier CM6 plugin is now **obsolete**. This is a completely new implementation built from the ground up.

### What's Different

The core of this plugin is a **proper Lezer-based parser** for TiddlyWiki wikitext. Rather than regex-based highlighting, it builds a full syntax tree - the same approach CodeMirror 6 uses for languages like JavaScript or Python. This enables features that weren't possible before.

### Features (v0.0.2)

**Syntax Highlighting**
- Full wikitext support: headings, formatting, links, transclusions, filtered transclusions
- Widgets with attribute parsing
- Pragmas (`\define`, `\procedure`, `\function`, `\import`, etc.)
- Macro calls, filter expressions, tables, code blocks
- Nested language highlighting in code blocks (JS, CSS, Python, HTML, and more)

**Autocompletion**
- Tiddler titles after `[[` and `{{`
- Widget names and attributes after `<$`
- Macro/procedure/function names after `<<`
- Filter operators inside `[]`
- HTML tags and attributes
- Emoji picker with `:name:` syntax

**Editor Enhancements**
- Auto-close brackets, quotes, and tags
- Smart Enter key (list continuation, indent between tags)
- Code folding (headings, widgets, code blocks)
- Search & replace panel (TiddlyWiki-styled)
- Line numbers (optional)
- 10 toolbar styles

**Keymap Plugins**
- Vim - Full Vim emulation (normal, insert, visual, command modes)
- Emacs - Emacs-style keybindings

**17 Theme Plugins**
- Ayu, Catppuccin, Dracula, Everforest, Flexoki, GitHub, Gruvbox, Kanagawa, Material, Monokai, Nord, One, Palenight, Rose Pine, Solarized, Tokyo Night, Zenburn
- Light and dark variants

### Status

This is version 0.0.2 - functional but still in development. Feedback and bug reports welcome.

### Links

- GitHub: [TODO: add link]
- Demo: [TODO: add link]
