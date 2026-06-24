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
import { createFilterTextRef, createFilterVariable, createFilterMultiVariable, parseMacroParams, skipBracedBlock } from "./utils"
import type { BlockContext } from "./block-context"

/**
 * Match pattern for \define pragma
 * Single line: \define name(params) body
 * Multiline: \define name(params)\n body \n\end
 * Pragmas can be indented with leading whitespace
 */
const defineRe = /^\s*\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)(.*)$/
const defineMultilineRe = /^\s*\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*$/

/**
 * Match pattern for \procedure/\function/\widget pragma
 * Single line: \function name(params) body
 * Multiline: \function name(params)\n body \n\end
 * Pragmas can be indented with leading whitespace
 */
const fnprocRe = /^\s*\\(function|procedure|widget)\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)(.*)$/
const fnprocMultilineRe = /^\s*\\(function|procedure|widget)\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)$/

/**
 * Match pattern for \rules pragma
 * Pragmas can be indented with leading whitespace
 */
const rulesRe = /^\s*\\rules\s+(only|except)\s+(.*)$/

/**
 * Match pattern for \import pragma
 * Pragmas can be indented with leading whitespace
 */
const importRe = /^\s*\\import\s+(.*)$/

/**
 * Match pattern for \parameters pragma
 * Pragmas can be indented with leading whitespace
 */
const parametersRe = /^\s*\\parameters\s*\(\s*([^)]*)\s*\)$/

/**
 * Match pattern for \whitespace pragma
 * Pragmas can be indented with leading whitespace
 */
const whitespaceRe = /^\s*\\whitespace\s+(trim|notrim)$/

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
  // Allow leading whitespace for indented nested definitions
  const openRe = /^\s*\\(define|procedure|function|widget)\s+([^(\s]+)\s*\([^)]*\)\s*$/
  // Match any \end (bare or named)
  const endRe = /^\s*\\end(?:\s+(\S+))?\s*$/

  const bodyStart = cx.nextLineStart // Start of the line after the declaration
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
            bodyEnd: cx.prevLineEnd(), // Before the \end line (exclude \n or \r\n)
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
            bodyEnd: cx.prevLineEnd(),
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
 * Check if a string looks like a filter expression.
 * A filter starts with [ and ends with ], but is NOT:
 * - [img[...]] (image syntax)
 * - [ext[...]] (external link syntax)
 * Note: [[title]...] IS a valid filter (literal title operand)
 */
function looksLikeFilter(str: string): boolean {
  const trimmed = str.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return false
  // Not an image [img[...]]
  if (/^\[img\[/i.test(trimmed)) return false
  // Not an external link [ext[...]]
  if (/^\[ext\[/i.test(trimmed)) return false
  return true
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
      let currentOperatorName = ''  // Track operator name for special handling (e.g., regexp)

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
          // Use FilterRegexp for regexp operator operands
          const operandType = currentOperatorName === 'regexp' ? Type.FilterRegexp : Type.FilterOperand
          stepChildren.push(elt(operandType, offset + operandStart, offset + pos))
          if (pos < len && filterContent[pos] === ']') pos++
          currentOperatorName = ''  // Reset after consuming operand
        } else if (operandCh === '<') {
          // Variable: <varname> or <__param__>
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '>') {
            // Skip braced blocks so {{{...}}} content doesn't break > scanning
            const afterBraced = skipBracedBlock(filterContent, pos)
            if (afterBraced > pos) { pos = afterBraced; continue }
            pos++
          }
          const varContent = filterContent.slice(operandStart, pos)
          // Always create SubstitutedParam for __param__ pattern for proper syntax highlighting
          // (linter can validate if param is actually defined)
          const hasClosingAngle = pos < len && filterContent[pos] === '>'
          const substitutedMatch = /^__(.+)__$/.exec(varContent)
          if (substitutedMatch) {
            const paramName = substitutedMatch[1]
            const varStart = offset + operandStart - 1  // Include <
            const varEnd = offset + pos + 1  // Include >
            const innerStart = offset + operandStart
            const nameChildren: Element[] = [
              elt(Type.SubstitutedParamMark, innerStart, innerStart + 2),  // __
              elt(Type.SubstitutedParamName, innerStart + 2, innerStart + 2 + paramName.length),
              elt(Type.SubstitutedParamMark, innerStart + 2 + paramName.length, offset + pos),  // __
            ]
            stepChildren.push(elt(Type.SubstitutedParam, varStart, varEnd, nameChildren))
          } else {
            // Check if this is a macro call with params (contains whitespace)
            const spaceIdx = varContent.search(/\s/)
            if (spaceIdx !== -1) {
              // Macro call: <macroname params>
              const macroStart = offset + operandStart - 1  // Include <
              const macroEnd = hasClosingAngle ? offset + pos + 1 : offset + pos
              const macroChildren: Element[] = [
                elt(Type.MacroCallMark, macroStart, macroStart + 1),  // <
              ]

              const macroName = varContent.slice(0, spaceIdx)
              const nameStart = offset + operandStart
              const nameEnd = nameStart + macroName.length

              // Check if macro name is a placeholder
              const placeholderMatch = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/.exec(macroName)
              if (placeholderMatch) {
                const pName = placeholderMatch[1]
                macroChildren.push(elt(Type.Placeholder, nameStart, nameEnd, [
                  elt(Type.PlaceholderMark, nameStart, nameStart + 1),
                  elt(Type.VariableName, nameStart + 1, nameStart + 1 + pName.length),
                  elt(Type.PlaceholderMark, nameEnd - 1, nameEnd)
                ]))
              } else {
                macroChildren.push(elt(Type.MacroName, nameStart, nameEnd))
              }

              // Parse params
              const paramsStr = varContent.slice(spaceIdx)
              const paramsStart = offset + operandStart + spaceIdx
              const paramElements = parseMacroParams(paramsStr.trim(), paramsStart + (paramsStr.length - paramsStr.trimStart().length))
              macroChildren.push(...paramElements)

              if (hasClosingAngle) {
                macroChildren.push(elt(Type.MacroCallMark, offset + pos, offset + pos + 1))  // >
              }

              stepChildren.push(elt(Type.MacroCall, macroStart, macroEnd, macroChildren))
            } else {
              // Simple variable reference: <varname>
              const varStart = offset + operandStart - 1  // Include <
              const varEnd = hasClosingAngle ? offset + pos + 1 : offset + pos  // Include > if present
              stepChildren.push(createFilterVariable(varContent, varStart, varEnd))
            }
          }
          if (pos < len) pos++
        } else if (operandCh === '{') {
          // Text reference: {textref}
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== '}') pos++
          const textRef = filterContent.slice(operandStart, pos)
          const hasClosingBrace = pos < len && filterContent[pos] === '}'
          const refStart = offset + operandStart - 1  // Include {
          const refEnd = hasClosingBrace ? offset + pos + 1 : offset + pos  // Include } if present
          stepChildren.push(createFilterTextRef(textRef, refStart, refEnd))
          if (pos < len) pos++
        } else if (operandCh === '(') {
          // Multi-valued variable: (varname)
          pos++
          const operandStart = pos
          while (pos < len && filterContent[pos] !== ')') pos++
          const varContent = filterContent.slice(operandStart, pos)
          const hasClosingParen = pos < len && filterContent[pos] === ')'
          const varStart = offset + operandStart - 1  // Include (
          const varEnd = hasClosingParen ? offset + pos + 1 : offset + pos  // Include ) if present
          stepChildren.push(createFilterMultiVariable(varContent, varStart, varEnd))
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
        } else if (operandCh === ',') {
          // Comma separates multiple operands for functions: [func[a],<b>]
          // Just skip the comma and continue parsing next operand
          pos++
        } else if (/[^\s\[\]<>{},]/.test(operandCh)) {
          // Filter operator/function name - TiddlyWiki allows any char except brackets, whitespace, and comma
          const opStart = pos
          while (pos < len && /[^\s\[\]<>{},]/.test(filterContent[pos])) pos++
          const opName = filterContent.slice(opStart, pos)
          // Track the operator name (strip ! prefix and : suffix for matching)
          currentOperatorName = opName.replace(/^!/, '').replace(/:.*$/, '')
          stepChildren.push(elt(Type.FilterOperatorName, offset + opStart, offset + pos))
        } else {
          pos++
        }
      }

      // Skip closing ]
      if (pos < len && filterContent[pos] === ']') pos++

      elements.push(elt(Type.FilterOperator, offset + stepStart, offset + pos, stepChildren))
    } else if (ch === '+' || ch === '-' || ch === '~' || ch === '=') {
      // Run prefix: + - ~ = =>
      pos++
      // => shortcut for :let
      if (ch === '=' && pos < len && filterContent[pos] === '>') pos++
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

  // Parameter names: TiddlyWiki uses [^:),\s]+ - anything except :, ), comma, whitespace
  const paramRe = /\s*([^:),\s]+)(?:\s*:\s*(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)'|\[\[([^\]]*)\]\]|([^,\s)]+)))?/g
  let match

  while ((match = paramRe.exec(paramStr)) !== null) {
    const paramStart = basePos + match.index
    const paramEnd = paramStart + match[0].length
    params.push(elt(Type.PragmaParams, paramStart, paramEnd))
  }

  return params
}

/**
 * Create the common header elements for a pragma.
 * All pragmas have PragmaMark and PragmaKeyword, optionally PragmaName and params.
 *
 * @param pragmaStart - Absolute position of the pragma line start
 * @param text - The full line text
 * @param keyword - The keyword (e.g., "define", "procedure", "function")
 * @param name - Optional pragma name (for \define, \procedure, etc.)
 * @param paramStr - Optional parameter string (contents between parentheses)
 */
function createPragmaHeader(
  pragmaStart: number,
  text: string,
  keyword: string,
  name?: string,
  paramStr?: string
): Element[] {
  const backslashOffset = text.indexOf("\\")
  const children: Element[] = [
    elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
    elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
  ]

  if (name) {
    const nameStart = pragmaStart + text.indexOf(name)
    children.push(elt(Type.PragmaName, nameStart, nameStart + name.length))
  }

  if (paramStr) {
    const paramStart = pragmaStart + text.indexOf("(") + 1
    children.push(...parseParams(paramStr, paramStart))
  }

  return children
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
        const children = createPragmaHeader(pragmaStart, text, "define", name, paramStr)

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
          const children = createPragmaHeader(pragmaStart, text, "define", name, paramStr)

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

      const children = createPragmaHeader(pragmaStart, text, "define", name, paramStr)

      // Single-line body
      if (body) {
        // Find where body actually starts in text (after the regex matched \s*)
        const bodyStart = pragmaStart + text.length - body.length

        // Check if body looks like a filter expression (starts with [ ends with ], not [img[ or [ext[)
        if (looksLikeFilter(body)) {
          const trimmedBody = body.trim()
          const trimOffset = body.indexOf(trimmedBody)
          const filterStart = bodyStart + trimOffset
          const filterElements = parseFilterBody(trimmedBody, filterStart)
          children.push(elt(Type.FilterExpression, filterStart, filterStart + trimmedBody.length, filterElements))
        } else {
          // Parse as inline wikitext
          const inlineElements = cx.parser.parseInline(body, bodyStart)
          children.push(...inlineElements)
        }
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
        const children = createPragmaHeader(pragmaStart, text, keyword, name, paramStr)

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
          const children = createPragmaHeader(pragmaStart, text, keyword, name, paramStr)

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

      const children = createPragmaHeader(pragmaStart, text, keyword, name, paramStr)

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
    // Find the actual backslash position (accounting for leading whitespace)
    const backslashOffset = line.text.indexOf("\\")

    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
      elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 6), // "rules"
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
    // Find the actual backslash position (accounting for leading whitespace)
    const backslashOffset = line.text.indexOf("\\")
    const filterStart = pragmaStart + line.text.indexOf(filter)

    // Parse filter with detailed structure
    const filterElements = parseFilterBody(filter, filterStart)
    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
      elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 7), // "import"
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
    // Find the actual backslash position (accounting for leading whitespace)
    const backslashOffset = line.text.indexOf("\\")

    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
      elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 11), // "parameters"
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
    // Find the actual backslash position (accounting for leading whitespace)
    const backslashOffset = line.text.indexOf("\\")

    const children: Element[] = [
      elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
      elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 11), // "whitespace"
    ]

    cx.nextLine()
    return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)]
  }
}

/**
 * Partial/incomplete pragma patterns for highlighting while typing
 * These match pragmas that are being typed but aren't complete yet
 * All patterns allow leading whitespace for indented pragmas
 */

// Partial \define - matches incomplete define statements (including partial keyword)
const definePartialRe = /^\s*\\define(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
// Partial define keyword - with optional name and params
const defineKeywordPartialRe = /^\s*\\(d|de|def|defi|defin)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/

// Partial \function/\procedure/\widget (including partial keywords)
const fnprocPartialRe = /^\s*\\(function|procedure|widget)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
// Partial keywords - with optional name and params
const functionKeywordPartialRe = /^\s*\\(f|fu|fun|func|funct|functi|functio)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
const procedureKeywordPartialRe = /^\s*\\(p|pr|pro|proc|proce|proced|procedu|procedur)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/
const widgetKeywordPartialRe = /^\s*\\(w|wi|wid|widg|widge)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)\)?)?\s*$/

// Partial \rules - just the keyword or with only/except (including partial keyword)
const rulesPartialRe = /^\s*\\rules(?:\s+(only|except)?)?(?:\s+(.*))?$/
const rulesKeywordPartialRe = /^\s*\\(r|ru|rul|rule)\s*$/

// Partial \import - just the keyword (including partial keyword)
const importPartialRe = /^\s*\\import\s*(.*)$/
const importKeywordPartialRe = /^\s*\\(i|im|imp|impo|impor)\s*$/

// Partial \parameters - incomplete (including partial keyword)
const parametersPartialRe = /^\s*\\parameters(?:\s*\(([^)]*)?)?\s*$/
const parametersKeywordPartialRe = /^\s*\\(pa|par|para|param|parame|paramet|paramete|parameter)\s*$/

// Partial \whitespace - just the keyword (including partial keyword)
const whitespacePartialRe = /^\s*\\whitespace(?:\s+(.*))?$/
const whitespaceKeywordPartialRe = /^\s*\\(wh|whi|whit|white|whites|whitesp|whitespa|whitespac)\s*$/

// Partial \end
const endKeywordPartialRe = /^\s*\\(e|en|end)(?:\s+.*)?\s*$/

/**
 * Partial pragma parser - catches incomplete pragmas while typing
 * This must be LAST in the parser list
 */
export const PartialPragma: PragmaParser = {
  name: "partial",

  parse(cx: BlockContext, line: Line): Element[] | null {
    const text = line.text
    const pragmaStart = cx.lineStart
    // Find the actual backslash position (accounting for leading whitespace)
    const backslashOffset = text.indexOf("\\")

    // Try partial \define
    let match = definePartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 7), // "define"
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 6), // "rules"
      ]

      cx.nextLine()
      return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial \import
    match = importPartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 7), // "import"
      ]

      const filter = match[1]
      if (filter && filter.trim()) {
        const filterStart = pragmaStart + text.indexOf(filter)
        children.push(elt(Type.FilterExpression, filterStart, filterStart + filter.length))
      }

      cx.nextLine()
      return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // Try partial \parameters
    match = parametersPartialRe.exec(text)
    if (match) {
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 11), // "parameters"
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 11), // "whitespace"
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
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
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \i, \im, \imp, etc. -> partial import
    match = importKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \pa, \par, etc. -> partial parameters
    match = parametersKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.ParametersPragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \wh, \whi, etc. -> partial whitespace
    match = whitespaceKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
      ]
      cx.nextLine()
      return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)]
    }

    // \e, \en, \end -> partial end marker
    match = endKeywordPartialRe.exec(text)
    if (match) {
      const keyword = match[1]
      const children: Element[] = [
        elt(Type.PragmaMark, pragmaStart + backslashOffset, pragmaStart + backslashOffset + 1),
        elt(Type.PragmaKeyword, pragmaStart + backslashOffset + 1, pragmaStart + backslashOffset + 1 + keyword.length),
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
