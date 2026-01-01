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
const defineRe = /^\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)(.*)$/
const defineMultilineRe = /^\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*$/

/**
 * Match pattern for \procedure/\function/\widget pragma
 * Single line: \function name(params) body
 * Multiline: \function name(params)\n body \n\end
 */
const fnprocRe = /^\\(function|procedure|widget)\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)(.*)$/
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
 * Find the \end marker for a multi-line pragma, properly handling nested definitions.
 *
 * TiddlyWiki rules:
 * - \end (bare) closes the most recently opened definition
 * - \end name closes specifically that named definition
 * - Nested \procedure/\function/\widget/\define blocks must be tracked
 *
 * Returns positions for the body content and end marker, not the content itself.
 * The body should be parsed recursively by the caller.
 */
function findEnd(cx: BlockContext, name: string): { bodyStart: number, bodyEnd: number, endStart: number, endEnd: number } | null {
  // Match any multi-line definition start (nothing after closing paren)
  const openRe = /^\\(define|procedure|function|widget)\s+([^(\s]+)\s*\([^)]*\)\s*$/
  // Match any \end (bare or named)
  const endRe = /^\s*\\end(?:\s+(\S+))?\s*$/

  const bodyStart = cx.lineStart + cx.line.text.length + 1 // After the declaration line + newline
  const nestedNames: string[] = [] // Stack of nested definition names

  while (cx.nextLine()) {
    const text = cx.line.text

    // Check for nested multi-line definition opening
    const openMatch = openRe.exec(text)
    if (openMatch) {
      nestedNames.push(openMatch[2])
      continue
    }

    // Check for \end
    const endMatch = endRe.exec(text)
    if (endMatch) {
      const endName = endMatch[1] // undefined for bare \end

      if (nestedNames.length === 0) {
        // No nesting - this \end is for us
        // Accept bare \end or \end ourname
        if (!endName || endName === name) {
          return {
            bodyStart,
            bodyEnd: cx.lineStart - 1, // Before the \end line (exclude newline)
            endStart: cx.lineStart,
            endEnd: cx.lineStart + text.length
          }
        }
        // Named \end for different name at top level - error in source, continue
      } else {
        // We have nesting
        if (!endName) {
          // Bare \end closes innermost nested definition
          nestedNames.pop()
        } else if (endName === nestedNames[nestedNames.length - 1]) {
          // Named \end matches innermost nested definition
          nestedNames.pop()
        } else if (endName === name) {
          // Named \end for our name while nested - closes our definition
          return {
            bodyStart,
            bodyEnd: cx.lineStart - 1,
            endStart: cx.lineStart,
            endEnd: cx.lineStart + text.length
          }
        }
        // Named \end that doesn't match - continue
      }
    }
  }

  // No \end found
  return null
}

/**
 * Parse a filter expression into elements
 * Used for \function body parsing
 */
function parseFilterBody(filterContent: string, offset: number): Element[] {
  const elements: Element[] = []
  let pos = 0
  const len = filterContent.length

  while (pos < len) {
    const ch = filterContent[pos]

    // Skip whitespace
    if (/\s/.test(ch)) {
      pos++
      continue
    }

    // Filter step: [operators...]
    if (ch === '[') {
      const stepStart = pos
      pos++ // skip [

      // Parse operators within this step
      const stepChildren: Element[] = []

      while (pos < len && filterContent[pos] !== ']') {
        // Check for negation
        if (filterContent[pos] === '!') {
          pos++
        }

        const operandCh = filterContent[pos]

        if (operandCh === '[') {
          // Literal operand: [value]
          pos++
          const operandStart = pos
          let depth = 1
          while (pos < len && depth > 0) {
            if (filterContent[pos] === '[') depth++
            else if (filterContent[pos] === ']') depth--
            if (depth > 0) pos++
          }
          stepChildren.push(elt(Type.FilterOperand, offset + operandStart, offset + pos))
          if (pos < len && filterContent[pos] === ']') pos++
        } else if (operandCh === '<') {
          // Variable: <varname>
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '>') pos++
          stepChildren.push(elt(Type.FilterVariable, offset + operandStart, offset + pos))
          if (pos < len) pos++
        } else if (operandCh === '{') {
          // Text reference: {textref}
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '}') pos++
          stepChildren.push(elt(Type.FilterTextRef, offset + operandStart, offset + pos))
          if (pos < len) pos++
        } else if (operandCh === '/') {
          // Regexp: /regexp/flags
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '/') {
            if (filterContent[pos] === '\\') pos++
            pos++
          }
          stepChildren.push(elt(Type.FilterRegexp, offset + operandStart, offset + pos))
          if (pos < len) pos++
          while (pos < len && /[gimsuy]/.test(filterContent[pos])) pos++
        } else if (/[a-zA-Z]/.test(operandCh)) {
          // Operator name
          const opStart = pos
          while (pos < len && /[a-zA-Z0-9\-_:!]/.test(filterContent[pos])) pos++
          stepChildren.push(elt(Type.FilterOperatorName, offset + opStart, offset + pos))
        } else {
          pos++
        }
      }

      // Skip closing ]
      if (pos < len && filterContent[pos] === ']') pos++

      elements.push(elt(Type.FilterOperator, offset + stepStart, offset + pos, stepChildren))
    } else if (ch === '+' || ch === '-' || ch === '~' || ch === '=') {
      // Run prefix
      pos++
    } else if (ch === ':') {
      // Named run prefix
      pos++
      while (pos < len && /[a-zA-Z0-9\-_]/.test(filterContent[pos])) pos++
    } else {
      pos++
    }
  }

  return elements
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

      // Save position in case we need to fall back to single-line
      const savedPos = cx.savePosition()

      // Find body and \end
      const endInfo = findEnd(cx, name)
      if (endInfo) {
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

        // Parse body content recursively
        if (endInfo.bodyEnd > endInfo.bodyStart) {
          const bodyElements = cx.parseContentRange(endInfo.bodyStart, endInfo.bodyEnd, true)
          children.push(...bodyElements)
        }
        children.push(elt(Type.PragmaEnd, endInfo.endStart, endInfo.endEnd))
        cx.nextLine()

        return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)]
      }

      // No \end found - restore position and treat as single-line (no body)
      cx.restorePosition(savedPos)
    }

    // Single line define
    const singleMatch = defineRe.exec(text)
    if (singleMatch) {
      const pragmaStart = cx.lineStart
      const name = singleMatch[1]
      const paramStr = singleMatch[2]
      const body = singleMatch[3]

      // If there's any body content, check for \end and treat as multi-line if found
      if (body) {
        const savedPos = cx.savePosition()
        const endInfo = findEnd(cx, name)
        if (endInfo) {
          // Found \end - treat as multi-line
          const children: Element[] = [
            elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
            elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7),
            elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
          ]

          if (paramStr) {
            const paramStart = pragmaStart + text.indexOf("(") + 1
            children.push(...parseParams(paramStr, paramStart))
          }

          // Parse body content recursively (includes the incomplete part from first line)
          const bodyStart = pragmaStart + text.length - body.length
          if (endInfo.bodyEnd > bodyStart) {
            const bodyElements = cx.parseContentRange(bodyStart, endInfo.bodyEnd, true)
            children.push(...bodyElements)
          }
          children.push(elt(Type.PragmaEnd, endInfo.endStart, endInfo.endEnd))
          cx.nextLine()

          return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)]
        }
        // No \end found - restore and fall through to single-line handling
        cx.restorePosition(savedPos)
      }

      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7),
        elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
      ]

      if (paramStr) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        children.push(...parseParams(paramStr, paramStart))
      }

      // Single-line body - parse as inline wikitext
      if (body) {
        // Find where body actually starts in text (after the regex matched \s*)
        const bodyStart = pragmaStart + text.length - body.length
        const inlineElements = cx.parser.parseInline(body, bodyStart)
        children.push(...inlineElements)
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

      // Save position in case we need to fall back to single-line
      const savedPos = cx.savePosition()

      const endInfo = findEnd(cx, name)
      if (endInfo) {
        const children: Element[] = [
          elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
          elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
          elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
        ]

        if (paramStr) {
          const paramStart = pragmaStart + text.indexOf("(") + 1
          children.push(...parseParams(paramStr, paramStart))
        }

        // Parse body content
        if (endInfo.bodyEnd > endInfo.bodyStart) {
          if (keyword === "function") {
            // Function body is a filter expression
            const bodyContent = cx.input.read(endInfo.bodyStart, endInfo.bodyEnd)
            const filterElements = parseFilterBody(bodyContent, endInfo.bodyStart)
            children.push(elt(Type.FilterExpression, endInfo.bodyStart, endInfo.bodyEnd, filterElements))
          } else {
            // Procedure/widget body is wikitext - parse recursively
            const bodyElements = cx.parseContentRange(endInfo.bodyStart, endInfo.bodyEnd, true)
            children.push(...bodyElements)
          }
        }
        children.push(elt(Type.PragmaEnd, endInfo.endStart, endInfo.endEnd))
        cx.nextLine()

        return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)]
      }

      // No \end found - restore position and treat as single-line (no body)
      cx.restorePosition(savedPos)
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

      // If there's any body content, check for \end and treat as multi-line if found
      if (body) {
        const savedPos = cx.savePosition()
        const endInfo = findEnd(cx, name)
        if (endInfo) {
          // Found \end - treat as multi-line
          const children: Element[] = [
            elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
            elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
          ]

          if (paramStr) {
            const paramStart = pragmaStart + text.indexOf("(") + 1
            children.push(...parseParams(paramStr, paramStart))
          }

          // Parse body content (includes the incomplete part from first line)
          const bodyStart = pragmaStart + text.length - body.length
          if (endInfo.bodyEnd > bodyStart) {
            if (keyword === "function") {
              // Function body is a filter expression
              const bodyContent = cx.input.read(bodyStart, endInfo.bodyEnd)
              const filterElements = parseFilterBody(bodyContent, bodyStart)
              children.push(elt(Type.FilterExpression, bodyStart, endInfo.bodyEnd, filterElements))
            } else {
              // Procedure/widget body is wikitext
              const bodyElements = cx.parseContentRange(bodyStart, endInfo.bodyEnd, true)
              children.push(...bodyElements)
            }
          }
          children.push(elt(Type.PragmaEnd, endInfo.endStart, endInfo.endEnd))
          cx.nextLine()

          return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)]
        }
        // No \end found - restore and fall through to single-line handling
        cx.restorePosition(savedPos)
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

      // Single-line body parsing
      if (body) {
        // Find where body actually starts in text (after the regex matched \s*)
        const bodyStart = pragmaStart + text.length - body.length

        if (keyword === "function") {
          // Function body is a filter expression
          const filterElements = parseFilterBody(body, bodyStart)
          children.push(elt(Type.FilterExpression, bodyStart, pragmaStart + text.length, filterElements))
        } else {
          // Procedure/widget body is inline wikitext
          const inlineElements = cx.parser.parseInline(body, bodyStart)
          children.push(...inlineElements)
        }
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
    const filterStart = pragmaStart + 8  // After "\import "

    // Parse filter with detailed structure
    const filterElements = parseFilterBody(filter, filterStart)
    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
      elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "import"
      elt(Type.FilterExpression, filterStart, filterStart + filter.length, filterElements),
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
 * Partial/incomplete pragma patterns for highlighting while typing
 * These match pragmas that are being typed but aren't complete yet
 */

// Partial \define - matches incomplete define statements (including partial keyword)
// Note: \s* at end handles trailing whitespace like "\define "
const definePartialRe = /^\\define(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
// Partial define keyword - with optional name and params
const defineKeywordPartialRe = /^\\(d|de|def|defi|defin)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/

// Partial \function/\procedure/\widget (including partial keywords)
const fnprocPartialRe = /^\\(function|procedure|widget)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
// Partial keywords - with optional name and params
const functionKeywordPartialRe = /^\\(f|fu|fun|func|funct|functi|functio)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
const procedureKeywordPartialRe = /^\\(p|pr|pro|proc|proce|proced|procedu|procedur)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
const widgetKeywordPartialRe = /^\\(w|wi|wid|widg|widge)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/

// Partial \rules - just the keyword or with only/except (including partial keyword)
const rulesPartialRe = /^\\rules(?:\s+(only|except)?)?(?:\s+(.*))?$/
const rulesKeywordPartialRe = /^\\(r|ru|rul|rule)\s*$/

// Partial \import - just the keyword (including partial keyword)
const importPartialRe = /^\\import\s*(.*)$/
const importKeywordPartialRe = /^\\(i|im|imp|impo|impor)\s*$/

// Partial \parameters - incomplete (including partial keyword)
const parametersPartialRe = /^\\parameters(?:\s*\(([^)]*)?)?\s*$/
const parametersKeywordPartialRe = /^\\(pa|par|para|param|parame|paramet|paramete|parameter)\s*$/

// Partial \whitespace - just the keyword (including partial keyword)
const whitespacePartialRe = /^\\whitespace(?:\s+(.*))?$/
const whitespaceKeywordPartialRe = /^\\(wh|whi|whit|white|whites|whitesp|whitespa|whitespac)\s*$/

// Partial \end
const endKeywordPartialRe = /^\\(e|en|end)(?:\s+.*)?\s*$/

/**
 * Partial pragma parser - catches incomplete pragmas while typing
 * This must be LAST in the parser list
 */
export const PartialPragma: PragmaParser = {
  name: "partial",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const text = line.text
    const pragmaStart = cx.lineStart

    // Try partial \define
    let match = definePartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "define"
      ]

      const name = match[1]
      if (name) {
        const nameStart = pragmaStart + text.indexOf(name)
        children.push(elt(Type.PragmaName, nameStart, nameStart + name.length))
      }

      const paramStr = match[2]
      if (paramStr !== undefined) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        if (paramStr) {
          children.push(...parseParams(paramStr, paramStart))
        }
      }

      cx.nextLine()
      return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial \function/\procedure/\widget
    match = fnprocPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
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
      ]

      const name = match[2]
      if (name) {
        const nameStart = pragmaStart + text.indexOf(name)
        children.push(elt(Type.PragmaName, nameStart, nameStart + name.length))
      }

      const paramStr = match[3]
      if (paramStr !== undefined) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        if (paramStr) {
          children.push(...parseParams(paramStr, paramStart))
        }
      }

      cx.nextLine()
      return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial \rules
    match = rulesPartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 6), // "rules"
      ]

      cx.nextLine()
      return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial \import
    match = importPartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "import"
      ]

      const filter = match[1]
      if (filter && filter.trim()) {
        children.push(elt(Type.FilterExpression, pragmaStart + 8, pragmaStart + 8 + filter.length))
      }

      cx.nextLine()
      return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial \parameters
    match = parametersPartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "parameters"
      ]

      const paramStr = match[1]
      if (paramStr !== undefined) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        if (paramStr) {
          children.push(...parseParams(paramStr, paramStart))
        }
      }

      cx.nextLine()
      return [elt(Type.ParametersPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial \whitespace
    match = whitespacePartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "whitespace"
      ]

      cx.nextLine()
      return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial keywords (typing in progress)
    // \d, \de, \def, \defi, \defin -> partial define (with optional name and params)
    match = defineKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const name = match[2]
      const paramStr = match[3]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      if (name) {
        const nameStart = pragmaStart + text.indexOf(name)
        children.push(elt(Type.PragmaName, nameStart, nameStart + name.length))
      }
      if (paramStr !== undefined) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        if (paramStr) {
          children.push(...parseParams(paramStr, paramStart))
        }
      }
      cx.nextLine()
      return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \f, \fu, \fun, etc. -> partial function (with optional name and params)
    match = functionKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const name = match[2]
      const paramStr = match[3]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      if (name) {
        const nameStart = pragmaStart + text.indexOf(name)
        children.push(elt(Type.PragmaName, nameStart, nameStart + name.length))
      }
      if (paramStr !== undefined) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        if (paramStr) {
          children.push(...parseParams(paramStr, paramStart))
        }
      }
      cx.nextLine()
      return [elt(Type.FunctionDefinition, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \p, \pr, \pro, etc. -> partial procedure (with optional name and params)
    match = procedureKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const name = match[2]
      const paramStr = match[3]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      if (name) {
        const nameStart = pragmaStart + text.indexOf(name)
        children.push(elt(Type.PragmaName, nameStart, nameStart + name.length))
      }
      if (paramStr !== undefined) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        if (paramStr) {
          children.push(...parseParams(paramStr, paramStart))
        }
      }
      cx.nextLine()
      return [elt(Type.ProcedureDefinition, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \w, \wi, \wid, etc. -> partial widget (with optional name and params)
    match = widgetKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const name = match[2]
      const paramStr = match[3]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      if (name) {
        const nameStart = pragmaStart + text.indexOf(name)
        children.push(elt(Type.PragmaName, nameStart, nameStart + name.length))
      }
      if (paramStr !== undefined) {
        const paramStart = pragmaStart + text.indexOf("(") + 1
        if (paramStr) {
          children.push(...parseParams(paramStr, paramStart))
        }
      }
      cx.nextLine()
      return [elt(Type.WidgetDefinition, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \r, \ru, \rul, \rule -> partial rules
    match = rulesKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \i, \im, \imp, etc. -> partial import
    match = importKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \pa, \par, etc. -> partial parameters
    match = parametersKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.ParametersPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \wh, \whi, etc. -> partial whitespace
    match = whitespaceKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \e, \en, \end -> partial end marker
    match = endKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
        elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.PragmaEnd, pragmaStart, cx.prevLineEnd(), children)]
    }

    return null
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
  PartialPragma,  // Must be last - catches incomplete pragmas
]
