/**
 * Pragma completion sources (\define, \procedure, etc.)
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { syntaxTree } from "@codemirror/language"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/autocomplete'. Did... Remove this comment to see the full error message
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import { triggerCompletionEffect } from "./common"

// Simple keyword completions - just insert the keyword name
// Full templates are handled by snippets
const pragmaKeywords: { label: string; detail: string }[] = [
  { label: "define", detail: "Define a macro" },
  { label: "procedure", detail: "Define a procedure" },
  { label: "function", detail: "Define a function" },
  { label: "widget", detail: "Define a widget" },
  { label: "import", detail: "Import tiddlers" },
  { label: "rules", detail: "Set parser rules" },
  { label: "parameters", detail: "Declare parameters" },
  { label: "whitespace", detail: "Whitespace handling" },
  { label: "parsermode", detail: "Set parser mode" },
  { label: "end", detail: "End a definition" },
]

/**
 * Pragma completion source
 * Just completes the keyword name - full templates are handled by snippets
 */
export function pragmaCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  // Match \ followed by optional partial keyword at start of line
  const match = /^(\s*)\\(\w*)$/.exec(textBefore)
  if (!match) return null

  const from = line.from + match[1].length + 1  // After the backslash

  // Check if there's already whitespace after cursor
  const textAfter = doc.sliceString(pos, line.to)
  const hasWhitespaceAfter = /^\s/.test(textAfter)

  // Keywords that should trigger autocompletion after insert
  const triggerCompletionKeywords = new Set(["whitespace", "rules"])

  const options: Completion[] = pragmaKeywords.map(kw => {
    // Don't add space after \end - it doesn't take required arguments
    const insertText = hasWhitespaceAfter || kw.label === "end" ? kw.label : kw.label + " "
    const shouldTrigger = triggerCompletionKeywords.has(kw.label) && !hasWhitespaceAfter

    return {
      label: kw.label,
      type: "keyword",
      detail: kw.detail,
      apply: shouldTrigger
        ? (view: any, _completion: any, from: any, to: any) => {
            view.dispatch({
              changes: { from, to, insert: insertText },
              selection: { anchor: from + insertText.length },
              effects: triggerCompletionEffect.of(null)
            })
          }
        : insertText,
    };
  })

  return {
    from,
    to: pos,
    options,
    validFor: /^\w*$/
  };
}

/**
 * Rules pragma keyword completion source (\rules only/except)
 */
export function rulesKeywordCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  // Match \rules followed by optional partial word (only first word)
  const match = /^(\s*)\\rules\s+(\w*)$/.exec(textBefore)
  if (!match) return null

  const partial = match[2]
  const from = pos - partial.length

  const options: Completion[] = [
    { label: "only", type: "keyword", detail: "Only enable specified rules" },
    { label: "except", type: "keyword", detail: "Disable specified rules" },
  ]

  return {
    from,
    to: pos,
    options,
    validFor: /^\w*$/
  };
}

/**
 * Whitespace pragma value completion source (\whitespace trim/notrim)
 */
export function whitespaceValueCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  // Match \whitespace followed by optional partial word (only first word)
  const match = /^(\s*)\\whitespace\s+(\w*)$/.exec(textBefore)
  if (!match) return null

  const partial = match[2]
  const from = pos - partial.length

  const options: Completion[] = [
    { label: "trim", type: "keyword", detail: "Remove leading/trailing whitespace" },
    { label: "notrim", type: "keyword", detail: "Preserve whitespace" },
  ]

  return {
    from,
    to: pos,
    options,
    validFor: /^\w*$/
  };
}

/**
 * Parsermode pragma value completion source (\parsermode block/inline)
 */
export function parsermodeValueCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  // Match \parsermode followed by optional partial word (only first word)
  const match = /^(\s*)\\parsermode\s+(\w*)$/.exec(textBefore)
  if (!match) return null

  const partial = match[2]
  const from = pos - partial.length

  const options: Completion[] = [
    { label: "block", type: "keyword", detail: "Parse as block content" },
    { label: "inline", type: "keyword", detail: "Parse as inline content" },
  ]

  return {
    from,
    to: pos,
    options,
    validFor: /^\w*$/
  };
}

/**
 * Pragma end name completion source
 */
export function pragmaEndNameCompletion(context: CompletionContext): CompletionResult | null {
  const pos = context.pos
  const doc = context.state.doc

  const line = doc.lineAt(pos)
  const textBefore = doc.sliceString(line.from, pos)

  const match = /^(\s*)\\end\s+(\S*)$/.exec(textBefore)
  if (!match) return null

  const from = line.from + textBefore.length - match[2].length

  const tree = syntaxTree(context.state)
  const openPragmas: { name: string; type: string }[] = []

  tree.iterate({
    enter: (node: any) => {
      const nodeType = node.name
      if (nodeType === "MacroDefinition" ||
          nodeType === "ProcedureDefinition" ||
          nodeType === "FunctionDefinition" ||
          nodeType === "WidgetDefinition") {
        if (node.from <= pos && node.to >= pos) {
          let pragmaName: string | null = null
          const cursor = node.node.cursor()
          cursor.firstChild()
          do {
            if (cursor.name === "PragmaName") {
              pragmaName = doc.sliceString(cursor.from, cursor.to)
              break
            }
          } while (cursor.nextSibling())

          if (pragmaName) {
            openPragmas.push({
              name: pragmaName,
              type: nodeType.replace("Definition", "")
            })
          }
        }
      }
    }
  })

  if (openPragmas.length === 0) return null

  const options: Completion[] = openPragmas.reverse().map((pragma, index) => ({
    label: pragma.name,
    type: "variable",
    detail: `Close ${pragma.type.toLowerCase()}`,
    boost: openPragmas.length - index
  }))

  return {
    from,
    to: pos,
    options,
    validFor: /^\S*$/
  };
}
