/**
 * General context completion source
 * Provides completions when pressing Ctrl+Space in plain text
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/autocomplete'. Did... Remove this comment to see the full error message
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { syntaxTree } from "@codemirror/language"
import { coreWidgets } from "./widget"
import { commonMacros } from "./macro"
// @ts-expect-error TS(6133): 'htmlGlobalAttributes' is declared but its value i... Remove this comment to see the full error message
import { commonHtmlTags, htmlGlobalAttributes } from "./html"
import { builtInVariables, selfClosingTags, extractLocalDefinitions, getTiddlerBoost, getTiddlerSortText } from "./common"

/**
 * Check if we're in a context where another completion source should handle things
 */
function isInSpecificContext(textBefore: string): boolean {
  // Check for patterns that other completion sources handle
  const patterns = [
    /<[a-zA-Z$][^>]*$/,           // HTML tag or widget
    /<<[^>]*$/,                    // Macro call
    /\[\[[^\]]*$/,                 // Link
    /\{\{[^}]*$/,                  // Transclusion
    /\[img\[[^\]]*$/,              // Image
    /\[[^\[\]]*$/,                 // Filter (inside brackets)
    /^\s*\\[\w]*$/,                // Pragma at line start
    /^\s*\\rules\s+(only|except)\s+/,  // Rules pragma
    /<%([ \t]*\w*)?$/,             // Conditional
  ]

  return patterns.some(p => p.test(textBefore))
}

/**
 * General context completion source
 * Activates on explicit completion (Ctrl+Space) in plain text
 */
export function generalContextCompletion(
  getTiddlerTitles?: () => string[],
  getMacroNames?: () => string[],
  getWidgetNames?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[],
  isDraftTiddler?: (title: string) => boolean,
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    // Only activate on explicit completion (Ctrl+Space)
    if (!context.explicit) return null

    const pos = context.pos
    const doc = context.state.doc
    const line = doc.lineAt(pos)
    const textBefore = doc.sliceString(line.from, pos)

    // Don't interfere with specific contexts
    if (isInSpecificContext(textBefore)) return null

    // Check if we're inside a code block or other non-wikitext context
    const tree = syntaxTree(context.state)
    const node = tree.resolveInner(pos, -1)
    let current = node
    while (current && !current.type.isTop) {
      if (current.name === "FencedCode" || current.name === "CodeBlock" ||
          current.name === "TypedBlock" || current.name === "CommentBlock" ||
          current.name === "KaTeXBlock" || current.name === "LaTeXContent") {
        return null
      }
      current = current.parent!
    }

    // Get the partial word being typed (if any)
    const wordMatch = /(\w*)$/.exec(textBefore)
    const partial = wordMatch ? wordMatch[1] : ""
    const from = pos - partial.length

    const options: Completion[] = []

    // Add tiddler titles
    if (getTiddlerTitles) {
      const titles = getTiddlerTitles()
      for (const title of titles) {
        options.push({
          label: title,
          type: "text",
          detail: "tiddler",
          boost: getTiddlerBoost(title, isDraftTiddler),
          sortText: getTiddlerSortText(title, isDraftTiddler),
          apply: (view: any, _completion: any, from: any, to: any) => {
            const insert = `[[${title}]]`
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length }
            })
          }
        })
      }
    }

    // Add macro names (from callback + built-in)
    const macroNames = new Set<string>()
    if (getMacroNames) {
      for (const name of getMacroNames()) {
        macroNames.add(name)
      }
    }
    for (const macro of commonMacros) {
      macroNames.add(macro)
    }

    // Add local definitions
    const docText = context.state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)
    for (const def of localDefs.macros) {
      macroNames.add(def)
    }

    for (const name of macroNames) {
      options.push({
        label: name,
        type: "function",
        detail: "macro",
        boost: 2,
        apply: (view: any, _completion: any, from: any, to: any) => {
          const insert = `<<${name}>>`
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length - 2 }
          })
        }
      })
    }

    // Add widget names (from callback + built-in)
    const widgetNames = new Set<string>()
    if (getWidgetNames) {
      for (const name of getWidgetNames()) {
        widgetNames.add(name)
      }
    }
    for (const widget of coreWidgets) {
      widgetNames.add(widget)
    }
    for (const def of localDefs.widgets) {
      widgetNames.add(def)
    }

    for (const name of widgetNames) {
      options.push({
        label: name,
        type: "type",
        detail: "widget",
        boost: 1,
        apply: (view: any, _completion: any, from: any, to: any) => {
          const insert = `<$${name}></$${name}>`
          const cursorPos = from + name.length + 3
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: cursorPos }
          })
        }
      })
    }

    // Add function names
    const functionNames = new Set<string>()
    if (getFunctionNames) {
      for (const name of getFunctionNames()) {
        functionNames.add(name)
      }
    }
    for (const def of localDefs.functions) {
      functionNames.add(def)
    }

    for (const name of functionNames) {
      if (!macroNames.has(name)) {
        options.push({
          label: name,
          type: "function",
          detail: "function",
          boost: 2,
          apply: (view: any, _completion: any, from: any, to: any) => {
            const insert = `<<${name}>>`
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length - 2 }
            })
          }
        })
      }
    }

    // Add variable names
    const variableNames = new Set<string>()
    if (getVariableNames) {
      for (const name of getVariableNames()) {
        variableNames.add(name)
      }
    }
    for (const name of builtInVariables) {
      variableNames.add(name)
    }
    for (const def of localDefs.procedures) {
      variableNames.add(def)
    }

    for (const name of variableNames) {
      if (!macroNames.has(name) && !functionNames.has(name)) {
        options.push({
          label: name,
          type: "variable",
          detail: "variable",
          boost: 1,
          apply: (view: any, _completion: any, from: any, to: any) => {
            const insert = `<<${name}>>`
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length - 2 }
            })
          }
        })
      }
    }

    // Add HTML tags
    for (const tag of commonHtmlTags) {
      const isSelfClosing = selfClosingTags.has(tag)
      options.push({
        label: tag,
        type: "keyword",
        detail: isSelfClosing ? "html (self-closing)" : "html",
        boost: 0,
        apply: (view: any, _completion: any, from: any, to: any) => {
          let insert: string
          let cursorPos: number
          if (isSelfClosing) {
            insert = `<${tag}>`
            cursorPos = from + insert.length
          } else {
            insert = `<${tag}></${tag}>`
            cursorPos = from + tag.length + 2
          }
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: cursorPos }
          })
        }
      })
    }

    if (options.length === 0) return null

    return {
      from,
      to: pos,
      options,
      validFor: /^\w*$/
    };
  };
}
