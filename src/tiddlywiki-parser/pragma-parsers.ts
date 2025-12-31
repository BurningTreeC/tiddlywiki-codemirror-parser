/**
 * TiddlyWiki Parser - Pragma Parsers
 *
 * Pragmas are special directives at the start of tiddlers:
 * - \define name(params) body
 * - \procedure name(params) body
 * - \function name(params) body
 * - \widget $name(params) body
 * - \rules only/except rulenames
 * - \import filter
 * - \parameters (params)
 * - \whitespace trim/notrim
 */

import { Type } from "./types"
import { Element, elt, Line, PragmaParser, Ch, space } from "./core"
import type { BlockContext } from "./block-context"

/**
 * Match pattern for \define pragma
 * Single line: \define name(params) body
 * Multiline: \define name(params)\n body \n\end
 */
const defineRe = /^\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*(.*)$/
const defineMultilineRe = /^\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*$/

/**
 * Match pattern for \procedure/\function/\widget pragma
 * Single line: \function name(params) body
 * Multiline: \function name(params)\n body \n\end
 */
const fnprocRe = /^\\(function|procedure|widget)\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*(.*)$/
const fnprocMultilineRe = /^\\(function|procedure|widget)\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)$/

/**
 * Match pattern for \rules pragma
 */
const rulesRe = /^\\rules\s+(only|except)\s+(.*)$/

/**
 * Match pattern for \import pragma
 */
const importRe = /^\\import\s+(.*)$/

/**
 * Match pattern for \parameters pragma
 */
const parametersRe = /^\\parameters\s*\(\s*([^)]*)\s*\)$/

/**
 * Match pattern for \whitespace pragma
 */
const whitespaceRe = /^\\whitespace\s+(trim|notrim)$/

/**
 * Find the \end marker for a multi-line pragma
 */
function findEnd(cx: BlockContext, name: string): { body: string, endPos: number } | null {
  const endRe = new RegExp(`^\\s*\\\\end(?:\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?\\s*$`)
  let body = ""
  let startLineEnd = cx.lineStart + cx.line.text.length

  while (cx.nextLine()) {
    if (endRe.test(cx.line.text)) {
      return { body, endPos: cx.lineStart + cx.line.text.length }
    }
    if (body) body += "\n"
    body += cx.line.text
  }

  // No \end found, treat body as empty
  return null
}

/**
 * Parse parameter definitions: name:default, name2:"default2"
 */
function parseParams(paramStr: string, basePos: number): Element[] {
  const params: Element[] = []
  if (!paramStr.trim()) return params

  const paramRe = /\s*([A-Za-z0-9\-_]+)(?:\s*:\s*(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)'|\[\[([^\]]*)\]\]|([^,\s)]+)))?/g
  let match

  while ((match = paramRe.exec(paramStr)) !== null) {
    const paramStart = basePos + match.index
    const paramEnd = paramStart + match[0].length
    params.push(elt(Type.PragmaParams, paramStart, paramEnd))
  }

  return params
}

/**
 * \define macro pragma
 */
export const MacroDefPragma: PragmaParser = {
  name: "macrodef",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const text = line.text

    // Check for multiline vs single line
    const multiMatch = defineMultilineRe.exec(text)
    if (multiMatch) {
      const pragmaStart = cx.lineStart
      const name = multiMatch[1]
      const paramStr = multiMatch[2]

      // Create elements for pragma mark, keyword, name, params
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "define"
        elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
      ]

      // Parse parameters
      if (paramStr) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        children.push(...parseParams(paramStr, paramStart))
      }

      // Find body and \end
      const endInfo = findEnd(cx, name)
      if (endInfo) {
        children.push(elt(Type.PragmaBody, cx.lineStart - endInfo.body.length - 1, cx.lineStart - 1))
        children.push(elt(Type.PragmaEnd, cx.lineStart, cx.lineStart + cx.line.text.length))
        cx.nextLine()

        return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)]
      }

      // No \end, single line after all
      cx.nextLine()
      return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Single line define
    const singleMatch = defineRe.exec(text)
    if (singleMatch) {
      const pragmaStart = cx.lineStart
      const name = singleMatch[1]
      const paramStr = singleMatch[2]
      const body = singleMatch[3]

      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7),
        elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
      ]

      if (paramStr) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        children.push(...parseParams(paramStr, paramStart))
      }

      // Add body if present
      if (body) {
        const bodyStart = pragmaStart + text.indexOf(")") + 1
        const bodyEnd = pragmaStart + text.length
        children.push(elt(Type.PragmaBody, bodyStart, bodyEnd))
      }

      cx.nextLine()
      return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)]
    }

    return null
  }
}

/**
 * \function/\procedure/\widget pragma
 */
export const FnProcDefPragma: PragmaParser = {
  name: "fnprocdef",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const text = line.text

    // Check for multiline
    const multiMatch = fnprocMultilineRe.exec(text)
    if (multiMatch) {
      const pragmaStart = cx.lineStart
      const keyword = multiMatch[1]
      const name = multiMatch[2]
      const paramStr = multiMatch[3]

      let nodeType: Type
      switch (keyword) {
        case "function": nodeType = Type.FunctionDefinition; break
        case "procedure": nodeType = Type.ProcedureDefinition; break
        case "widget": nodeType = Type.WidgetDefinition; break
        default: return null
      }

      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
        elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
      ]

      if (paramStr) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        children.push(...parseParams(paramStr, paramStart))
      }

      const endInfo = findEnd(cx, name)
      if (endInfo) {
        children.push(elt(Type.PragmaBody, cx.lineStart - endInfo.body.length - 1, cx.lineStart - 1))
        children.push(elt(Type.PragmaEnd, cx.lineStart, cx.lineStart + cx.line.text.length))
        cx.nextLine()

        return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)]
      }

      cx.nextLine()
      return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Single line function/procedure/widget
    const singleMatch = fnprocRe.exec(text)
    if (singleMatch) {
      const pragmaStart = cx.lineStart
      const keyword = singleMatch[1]
      const name = singleMatch[2]
      const paramStr = singleMatch[3]
      const body = singleMatch[4]

      let nodeType: Type
      switch (keyword) {
        case "function": nodeType = Type.FunctionDefinition; break
        case "procedure": nodeType = Type.ProcedureDefinition; break
        case "widget": nodeType = Type.WidgetDefinition; break
        default: return null
      }

      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
        elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
      ]

      if (paramStr) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        children.push(...parseParams(paramStr, paramStart))
      }

      // Add body if present
      if (body) {
        const bodyStart = pragmaStart + text.indexOf(")") + 1
        const bodyEnd = pragmaStart + text.length
        children.push(elt(Type.PragmaBody, bodyStart, bodyEnd))
      }

      cx.nextLine()
      return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)]
    }

    return null
  }
}

/**
 * \rules pragma
 */
export const RulesPragma: PragmaParser = {
  name: "rules",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const match = rulesRe.exec(line.text)
    if (!match) return null

    const pragmaStart = cx.lineStart
    const action = match[1]
    const rules = match[2]

    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
      elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 6), // "rules"
    ]

    cx.nextLine()
    return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)]
  }
}

/**
 * \import pragma
 */
export const ImportPragma: PragmaParser = {
  name: "import",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const match = importRe.exec(line.text)
    if (!match) return null

    const pragmaStart = cx.lineStart
    const filter = match[1]

    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
      elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "import"
      elt(Type.FilterExpression, pragmaStart + 8, pragmaStart + 8 + filter.length),
    ]

    cx.nextLine()
    return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)]
  }
}

/**
 * \parameters pragma
 */
export const ParametersPragma: PragmaParser = {
  name: "parameters",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const match = parametersRe.exec(line.text)
    if (!match) return null

    const pragmaStart = cx.lineStart
    const paramStr = match[1]

    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
      elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "parameters"
    ]

    if (paramStr) {
      const paramStart = pragmaStart + line.text.indexOf("(") + 1
      children.push(...parseParams(paramStr, paramStart))
    }

    cx.nextLine()
    return [elt(Type.ParametersPragma, pragmaStart, cx.prevLineEnd(), children)]
  }
}

/**
 * \whitespace pragma
 */
export const WhitespacePragma: PragmaParser = {
  name: "whitespace",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const match = whitespaceRe.exec(line.text)
    if (!match) return null

    const pragmaStart = cx.lineStart

    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
      elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "whitespace"
    ]

    cx.nextLine()
    return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)]
  }
}

/**
 * All pragma parsers
 */
export const DefaultPragmaParsers: PragmaParser[] = [
  MacroDefPragma,
  FnProcDefPragma,
  RulesPragma,
  ImportPragma,
  ParametersPragma,
  WhitespacePragma,
]
