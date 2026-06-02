/**
 * @codemirror/lang-tiddlywiki - Main Entry Point
 *
 * CodeMirror 6 Language Support für TiddlyWiki5 Wikitext.
 */

import { EditorView } from "@codemirror/view"
import { syntaxTree } from "@codemirror/language"

// Re-export everything from the parser index
export * from "./index"

import { tiddlywikiLanguage } from "./parser"

// Re-export commands
export {
  insertNewlineContinueMarkup,
  insertNewlineContinueMarkupCommand,
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
  insertMacroCall,
  setHeading1,
  setHeading2,
  setHeading3,
  setHeading4,
  setHeading5,
  setHeading6,
  removeHeading,
  toggleBulletList,
  toggleNumberedList,
  insertCodeBlock,
  insertHorizontalRule
} from "./commands"

// Re-export linter and action context utilities
export {
  substitutedParamLinter,
  tiddlywikiLinter,
  // Action context utilities for autocompletion and scope tracking
  ACTION_IMPLICIT_VARIABLES,
  ACTION_ATTRIBUTE_NAMES,
  getActionContextVariables,
  isActionContextVariable,
  matchesWildcardPattern
} from "./linter"
export type { ActionContextVariables } from "./linter"

// ============================================================================
// Paste URL as Link Extension
// ============================================================================

const nonPlainText = /code|horizontalrule|html|link|comment|transclusion|macro|widget|escape|entity|image|mark|url/i

/// Extension die URLs beim Einfügen automatisch als WikiLinks formatiert
export const pasteURLAsLink = EditorView.domEventHandlers({
  paste: (event, view) => {
    let { main } = view.state.selection
    if (main.empty) return false

    let link = event.clipboardData?.getData("text/plain")
    if (!link || !/^(https?:\/\/|mailto:|xmpp:|www\.)/.test(link)) return false
    if (/^www\./.test(link)) link = "https://" + link

    if (!tiddlywikiLanguage.isActiveAt(view.state, main.from, 1)) return false

    let tree = syntaxTree(view.state)
    let crossesNode = false

    tree.iterate({
      from: main.from,
      to: main.to,
      enter: node => { if (node.from > main.from || nonPlainText.test(node.name)) crossesNode = true },
      leave: node => { if (node.to < main.to) crossesNode = true }
    })

    if (crossesNode) return false

    // TiddlyWiki external link format
    let text = view.state.doc.sliceString(main.from, main.to)
    view.dispatch({
      changes: [{ from: main.from, to: main.to, insert: `[ext[${text}|${link}]]` }],
      userEvent: "input.paste",
      scrollIntoView: true
    })
    return true
  }
})

