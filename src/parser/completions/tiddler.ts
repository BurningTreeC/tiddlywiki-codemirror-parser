/**
 * Tiddler title and transclusion completion sources
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { syntaxTree } from "@codemirror/language"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/autocomplete'. Did... Remove this comment to see the full error message
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import { buildMultiSelectionChanges, getTiddlerBoost, getTiddlerSortText } from "./common"
import { filterOperatorMeta } from "./filter"

/**
 * Tiddler title completion source
 */
export function tiddlerCompletion(
  getTiddlerTitles?: () => string[],
  getImageTiddlerTitles?: () => string[],
  isDraftTiddler?: (title: string) => boolean
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    const linkMatch = /\[\[[^\]|]*$/.exec(textBefore)
    const linkTargetMatch = /\[\[.*?\|[^\]]*$/.exec(textBefore)
    let transcludeMatch = /(?<!\{)\{\{[^{}|]*$/.exec(textBefore)
    if (transcludeMatch && (transcludeMatch[0].includes('!!') || transcludeMatch[0].includes('##'))) {
      transcludeMatch = null
    }
    const imageMatch = /\[img(?:\s+[^\[]*)?\[[^\]|]*$/.exec(textBefore)
    const extLinkMatch = /\[ext\[[^\]|]*$/.exec(textBefore)
    const filterOperandMatch = /[\[\]}>][\w\-:!]*\[[^\]]*$/.exec(textBefore)
    let filterTextRefMatch = /[\[\]}>][\w\-:!]*\{[^}]*$/.exec(textBefore)
    if (filterTextRefMatch && (filterTextRefMatch[0].includes('!!') || filterTextRefMatch[0].includes('##'))) {
      filterTextRefMatch = null
    }

    const inFilterContext = (
      /\{\{\{[^}]*$/.test(textBefore) ||
      /\bfilter\s*=\s*(?:"[^"]*|'[^']*|"""[^"]*)$/.test(textBefore) ||
      /<\$\w+[^>]*\bfilter\s*=\s*(?:"[^"]*|'[^']*|"""[^"]*)$/.test(textBefore)
    )

    let match: RegExpExecArray | null
    if (imageMatch) {
      match = imageMatch
    } else if (extLinkMatch) {
      return null
    } else if (inFilterContext && linkMatch && filterOperandMatch) {
      match = filterOperandMatch
    } else {
      match = linkMatch || linkTargetMatch || transcludeMatch || filterOperandMatch || filterTextRefMatch
    }
    if (!match) return null

    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    let inImageLink = false
    let inExtLink = false
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      if (node.name === "ImageLink" || node.name === "ImageSource") {
        inImageLink = true
      }
      if (node.name === "ExternalLink" || node.name === "URLLink") {
        inExtLink = true
      }
      node = node.parent!
    }

    if (inExtLink) {
      return null
    }

    if (inImageLink && imageMatch) {
      match = imageMatch
    }

    let titles = getTiddlerTitles ? getTiddlerTitles() : []
    if (titles.length === 0) return null

    let prefix: string
    let suffix: string
    let validFor: RegExp
    let detail: string

    if (match === filterTextRefMatch) {
      prefix = match[0].slice(0, match[0].lastIndexOf('{') + 1)
      validFor = /^[\[\]}>][\w\-:!]*\{[^}]*$/
      detail = "text reference"
      const patternLen = match[0].length

      const options: Completion[] = titles.map(title => ({
        label: prefix + title,
        type: "variable",
        detail,
        boost: getTiddlerBoost(title, isDraftTiddler),
        sortText: getTiddlerSortText(title, isDraftTiddler),
        apply: (view: any, _completion: any, from: any, to: any) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasClosingBrace = textAfter[0] === "}"
          const hasOuterBracket = textAfter[1] === "]" || textAfter[0] === "]"

          // @ts-expect-error TS(6133): 'suffix' is declared but its value is never read.
          let suffix = "}"
          if (hasClosingBrace) suffix = ""
          if (!hasClosingBrace && !hasOuterBracket) suffix = "}]"

          const needsOuterBracket = !hasOuterBracket && !(hasClosingBrace && textAfter[1] === "]")
          const insert = prefix + title + (hasClosingBrace ? "" : "}") + (needsOuterBracket ? "]" : "")
          const cursorPos = from + prefix.length + title.length + 1
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos }
          })
        }
      }))

      return {
        from: pos - match[0].length,
        to: pos,
        options,
        validFor
      }
    } else if (match === imageMatch) {
      const bracketPos = match[0].lastIndexOf('[')
      prefix = match[0].slice(0, bracketPos + 1)
      suffix = "]]"
      validFor = /^\[img(?:\s+[^\[]*)?\[[^\]|]*$/
      detail = "image"
      if (getImageTiddlerTitles) {
        const imageTitles = getImageTiddlerTitles()
        if (imageTitles.length > 0) {
          titles = imageTitles
        }
      }
    } else if (match === filterOperandMatch) {
      const operatorMatch = /[\[\]}>](!?)([\w.]+)(?::[\w]+)*\[[^\]]*$/.exec(match[0])
      if (operatorMatch) {
        const operator = operatorMatch[2]
        if (filterOperatorMeta[operator]) {
          return null
        }
      }

      prefix = match[0].slice(0, match[0].lastIndexOf('[') + 1)
      validFor = /^[\[\]}>][\w\-:!]*\[[^\]]*$/
      detail = "filter operand"
      const patternLen = match[0].length

      const options: Completion[] = titles.map(title => ({
        label: prefix + title,
        type: "variable",
        detail,
        boost: getTiddlerBoost(title, isDraftTiddler),
        sortText: getTiddlerSortText(title, isDraftTiddler),
        apply: (view: any, _completion: any, from: any, to: any) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasFirstBracket = textAfter[0] === "]"
          const hasSecondBracket = textAfter[1] === "]"

          let suffix = "]]"
          if (hasFirstBracket && hasSecondBracket) {
            suffix = ""
          } else if (hasFirstBracket) {
            suffix = "]"
          }

          const insert = prefix + title + suffix
          const cursorPos = from + prefix.length + title.length + 1
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos }
          })
        }
      }))

      return {
        from: pos - match[0].length,
        to: pos,
        options,
        validFor
      }
    } else if (match === linkMatch) {
      prefix = "[["
      suffix = "]]"
      validFor = /^\[\[[^\]|]*$/
      detail = "tiddler"
    } else if (match === linkTargetMatch) {
      const pipePos = match[0].lastIndexOf('|')
      prefix = match[0].slice(0, pipePos + 1)
      suffix = "]]"
      validFor = /^\[\[.*?\|[^\]]*$/
      detail = "tiddler"
    } else if (match === transcludeMatch) {
      prefix = "{{"
      suffix = "}}"
      validFor = /^(?<!\{)\{\{[^{}|]*$/
      detail = "tiddler"
    } else {
      return null
    }

    const patternLen = match[0].length
    const options: Completion[] = titles.map(title => ({
      label: prefix + title,
      type: "variable",
      detail,
      boost: getTiddlerBoost(title, isDraftTiddler),
      sortText: getTiddlerSortText(title, isDraftTiddler),
      apply: (view: any, _completion: any, from: any, to: any) => {
        const textAfter = view.state.sliceDoc(to, to + suffix.length)
        let actualSuffix = suffix
        let skipChars = 0

        if (textAfter === suffix) {
          actualSuffix = ""
          skipChars = suffix.length
        } else if (suffix === "]]" && textAfter.startsWith("]")) {
          actualSuffix = "]"
          skipChars = 1
        } else if (suffix === "}}" && textAfter.startsWith("}")) {
          actualSuffix = "}"
          skipChars = 1
        }

        const insert = prefix + title + actualSuffix
        const cursorPos = from + insert.length + skipChars
        const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: cursorPos }
        })
      }
    }))

    return {
      from: pos - match[0].length,
      to: pos,
      options,
      validFor
    }
  };
}

/**
 * System tiddler completion source (for $:/ patterns)
 * Triggers when typing $:/ outside of link/transclusion contexts
 */
export function systemTiddlerCompletion(
  getTiddlerTitles?: () => string[],
  isDraftTiddler?: (title: string) => boolean
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    // Match $:/ followed by any path characters
    const systemMatch = /\$:\/[\w\-\/\.]*$/.exec(textBefore)
    if (!systemMatch) return null

    // Don't trigger if we're inside [[ ]] or {{ }} or other tiddler contexts
    // Check if there's an unclosed [[ or {{ before our match
    const beforeMatch = textBefore.slice(0, textBefore.length - systemMatch[0].length)
    if (/\[\[[^\]]*$/.test(beforeMatch)) return null
    if (/\{\{[^}]*$/.test(beforeMatch)) return null
    if (/\[img[^\]]*\[[^\]]*$/.test(beforeMatch)) return null

    // Check syntax tree for code blocks
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      node = node.parent!
    }

    // Get system tiddlers
    let titles = getTiddlerTitles ? getTiddlerTitles() : []
    const systemTitles = titles.filter(t => t.startsWith("$:/"))
    if (systemTitles.length === 0) return null

    const partial = systemMatch[0]
    const from = pos - partial.length

    const options: Completion[] = systemTitles.map(title => ({
      label: title,
      type: "variable",
      detail: "system tiddler",
      boost: getTiddlerBoost(title, isDraftTiddler),
      sortText: getTiddlerSortText(title, isDraftTiddler),
    }))

    return {
      from,
      to: pos,
      options,
      validFor: /^\$:\/[\w\-\/\.]*$/
    };
  };
}

/**
 * Transclusion field/index completion source
 */
export function transclusionFieldCompletion(
  getTiddlerFields?: (tiddlerTitle: string) => string[],
  getTiddlerIndexes?: (tiddlerTitle: string) => string[]
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    const transcludeFieldMatch = /(?<!\{)\{\{([^{}|]*?)!![^{}|!]*$/.exec(textBefore)
    const transcludeIndexMatch = /(?<!\{)\{\{([^{}|]*?)##[^{}|#]*$/.exec(textBefore)

    let textRefFieldMatch: RegExpExecArray | null = null
    let textRefIndexMatch: RegExpExecArray | null = null

    const inFilterContext = (
      /\[[^\]]*\{[^{}]*$/.test(textBefore) ||
      /\{\{\{[^}]*\{[^{}]*$/.test(textBefore) ||
      /\bfilter\s*=\s*(?:"[^"]*|'[^']*|"""[^"]*)\{[^{}]*$/.test(textBefore)
    )

    if (inFilterContext) {
      textRefFieldMatch = /(?<!\{)\{(?!\{)([^{}]*?)!![^{}!]*$/.exec(textBefore)
      textRefIndexMatch = /(?<!\{)\{(?!\{)([^{}]*?)##[^{}#]*$/.exec(textBefore)
    }

    const isTransclusion = !!(transcludeFieldMatch || transcludeIndexMatch)
    const isFieldCompletion = !!(transcludeFieldMatch || textRefFieldMatch)

    const match = transcludeFieldMatch || transcludeIndexMatch || textRefFieldMatch || textRefIndexMatch
    if (!match) return null

    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      node = node.parent!
    }

    const separator = isFieldCompletion ? "!!" : "##"
    const tiddlerTitle = match[1] || ""

    const sepIndex = match[0].lastIndexOf(separator)
    const prefix = match[0].slice(0, sepIndex + 2)
    const partialValue = match[0].slice(sepIndex + 2)

    let values: string[]
    let detail: string

    if (isFieldCompletion) {
      if (getTiddlerFields && tiddlerTitle) {
        values = getTiddlerFields(tiddlerTitle)
      } else {
        values = []
      }
      detail = "field"
    } else {
      if (getTiddlerIndexes && tiddlerTitle) {
        values = getTiddlerIndexes(tiddlerTitle)
      } else {
        values = []
      }
      detail = "index"
    }

    const filtered = values.filter(v =>
      v.toLowerCase().startsWith(partialValue.toLowerCase())
    )

    if (filtered.length === 0) return null

    const patternLen = match[0].length
    const closingSuffix = isTransclusion ? "}}" : "}"

    const options: Completion[] = filtered.map(value => ({
      label: prefix + value,
      type: "property",
      detail,
      apply: (view: any, _completion: any, from: any, to: any) => {
        const textAfter = view.state.sliceDoc(to, to + 2)
        let suffix = closingSuffix
        if (isTransclusion) {
          if (textAfter === "}}") {
            suffix = ""
          } else if (textAfter.startsWith("}")) {
            suffix = "}"
          }
        } else {
          if (textAfter.startsWith("}")) {
            suffix = ""
          }
        }

        const insert = prefix + value + suffix
        const cursorPos = from + insert.length
        const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: cursorPos }
        })
      }
    }))

    let validForPattern: RegExp
    if (isTransclusion) {
      validForPattern = isFieldCompletion
        ? /^(?<!\{)\{\{[^{}|]*!![^{}|!]*$/
        : /^(?<!\{)\{\{[^{}|]*##[^{}|#]*$/
    } else {
      validForPattern = isFieldCompletion
        ? /^(?<!\{)\{(?!\{)[^{}]*!![^{}!]*$/
        : /^(?<!\{)\{(?!\{)[^{}]*##[^{}#]*$/
    }

    return {
      from: pos - match[0].length,
      to: pos,
      options,
      validFor: validForPattern
    }
  };
}
