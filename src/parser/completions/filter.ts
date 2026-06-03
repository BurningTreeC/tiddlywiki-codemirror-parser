/**
 * Filter completion sources
 */

import { syntaxTree } from "@codemirror/language"
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import { EditorState } from "@codemirror/state"
import { defaultFieldNames, extractLocalDefinitions, getTiddlerBoost } from "./common"
import type { SyntaxNode } from "@lezer/common"

/**
 * Check if the cursor position is inside a conditional context (<%if%>...<%endif%>).
 * This handles both block-level ConditionalBlock nodes and inline Conditional siblings.
 */
function isInsideConditionalContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state)
  const node = tree.resolveInner(pos, -1)

  // First check for ConditionalBlock ancestor
  let current: SyntaxNode | null = node
  while (current && !current.type.isTop) {
    if (current.name === "ConditionalBlock") {
      return true
    }
    current = current.parent
  }

  // For inline conditionals, check if we're between <%if%> and <%endif%> siblings
  current = node
  while (current && !current.type.isTop) {
    // @ts-expect-error TS(7022): 'parent' implicitly has type 'any' because it does... Remove this comment to see the full error message
    const parent = current.parent
    if (parent) {
      const conditionals: Array<{ type: string, from: number, to: number }> = []
      let sibling = parent.firstChild
      while (sibling) {
        if (sibling.name === "Conditional") {
          const text = state.sliceDoc(sibling.from, sibling.to)
          let type: string | null = null
          if (/<%\s*if\b/.test(text)) type = "if"
          else if (/<%\s*endif\s*%>/.test(text)) type = "endif"
          if (type) {
            conditionals.push({ type, from: sibling.from, to: sibling.to })
          }
        }
        sibling = sibling.nextSibling
      }

      if (conditionals.length >= 2) {
        conditionals.sort((a, b) => a.from - b.from)
        let depth = 0
        let lastIfEnd = -1
        for (const cond of conditionals) {
          if (cond.type === "if") {
            if (depth === 0) lastIfEnd = cond.to
            depth++
          } else if (cond.type === "endif") {
            depth--
            if (depth === 0 && lastIfEnd !== -1) {
              if (pos > lastIfEnd && pos < cond.from) {
                return true
              }
              lastIfEnd = -1
            }
          }
        }
        if (depth > 0 && lastIfEnd !== -1 && pos > lastIfEnd) {
          return true
        }
      }
    }
    current = parent
  }

  return false
}

// TiddlyWiki Filter Operators
export const coreFilterOperators = [
  // Selection constructors
  "all", "title", "field", "tag", "has", "is", "indexes", "fields", "tags", "links",
  "backlinks", "list", "listed", "tagging", "untagged",
  // String operators
  "prefix", "suffix", "contains", "match", "regexp", "search", "trim", "lowercase",
  "uppercase", "titlecase", "sentencecase", "splitbefore", "split", "join", "stringify",
  // Comparison
  "compare", "minlength", "maxlength",
  // List operators
  "first", "last", "nth", "limit", "rest", "butlast", "range", "sort", "nsort", "sortby",
  "nsortby", "reverse", "count", "unique", "duplicates", "allafter", "allbefore",
  "after", "before", "prepend", "append", "insertbefore", "move", "putafter",
  "putbefore", "putfirst", "putlast", "remove", "replace", "toggle", "cycle",
  // Math operators
  "add", "subtract", "multiply", "divide", "negate", "abs", "ceil", "floor", "round",
  "trunc", "sign", "min", "max", "average", "sum", "product", "log", "power", "sqrt",
  "exp", "fixed", "precision", "remainder", "random", "sin", "cos", "tan", "asin",
  "acos", "atan", "atan2",
  // Date operators
  "now", "format", "days", "weeks", "months", "years", "hours", "minutes", "seconds",
  "milliseconds", "adddays", "subtractdays", "year", "month", "day", "hour", "minute", "second",
  // Transclusion
  "get", "getindex", "getvariable", "lookup", "jsonget", "jsonindexes", "jsontype",
  "jsonextract", "jsonstringify",
  // Encoding
  "encodehtml", "decodehtml", "encodeuri", "encodeuricomponent", "decodeuri",
  "decodeuricomponent", "escaperegexp", "escapecss", "base64encode", "base64decode",
  // Others
  "each", "eachday", "filter", "reduce", "map", "subfilter", "else", "then",
  "variables", "modules", "plugintiddlers", "shadowsource", "storyviews", "editions",
  "lengths", "commands", "sha256hash", "md5hash", "encryptbase64", "decryptbase64",
  "draft.of", "draft.for", "draft", "draftof", "draftfor"
]

// Cached lowercase Set of core operators for deduplication
const _coreOperatorsLowerSet = new Set(coreFilterOperators.map(o => o.toLowerCase()))

// Cache for custom operators lowercase Sets (keyed by array reference)
let _customOperatorsCache: WeakMap<string[], Set<string>> | null = null

/**
 * Get a lowercase Set from an operators array.
 * Results are cached to avoid repeated map + Set creation on every keystroke.
 */
function getOperatorsLowerSet(operators: string[]): Set<string> {
  // For core operators, use the pre-computed Set
  if (operators === coreFilterOperators) {
    return _coreOperatorsLowerSet
  }

  // For custom operators, use WeakMap cache
  if (!_customOperatorsCache) {
    _customOperatorsCache = new WeakMap()
  }

  let cached = _customOperatorsCache.get(operators)
  if (!cached) {
    cached = new Set(operators.map(o => o.toLowerCase()))
    _customOperatorsCache.set(operators, cached)
  }
  return cached
}

// Filter Run Prefixes
export const filterRunPrefixes = [
  { label: "+", detail: "intersection - filter the input (same as :and)" },
  { label: "-", detail: "subtraction - remove from results (same as :except)" },
  { label: "~", detail: "else - use if previous was empty (same as :else)" },
  { label: "=", detail: "literal - add title literally (same as :all)" },
  { label: ":and", detail: "intersection - same as +" },
  { label: ":except", detail: "subtraction - same as -" },
  { label: ":else", detail: "else - same as ~" },
  { label: ":all", detail: "literal - same as =" },
  { label: ":filter", detail: "filter each title through subfilter" },
  { label: ":map", detail: "transform each title via subfilter" },
  { label: ":reduce", detail: "reduce to single value" },
  { label: ":intersection", detail: "keep titles common to all runs" },
  { label: ":cascade", detail: "cascade through filters" },
  { label: ":some", detail: "pass to any matching run" },
  { label: ":sort", detail: "sort by subfilter result" },
  { label: ":flat", detail: "flatten list output" },
  { label: ":let", detail: "assign results to multi-valued variable" },
  { label: "=>", detail: "assign to variable (shortcut for :let)" },
]

// Filter operator metadata
export const filterOperatorMeta: Record<string, {
  operands?: string[]
  suffixes?: string[]
  flags?: string[]
  dynamicOperands?: 'fields' | 'tags' | 'tiddlers' | 'functions' | 'variables' | 'types'
  allowPlus?: boolean
}> = {
  "all": { operands: ["current", "missing", "orphans", "shadows", "tags", "tiddlers"], allowPlus: true },
  "is": { operands: ["binary", "blank", "current", "draft", "image", "missing", "orphan", "shadow", "system", "tag", "tiddler", "variable"] },
  "has": { dynamicOperands: "fields", suffixes: ["field", "index", "tag"] },
  "get": { dynamicOperands: "fields" },
  "getindex": { dynamicOperands: "fields" },
  "field": { dynamicOperands: "fields" },
  "fields": { operands: [] },
  "type": { dynamicOperands: "types" },
  "indexes": { operands: [] },
  "tag": { dynamicOperands: "tags" },
  "tagging": { operands: [] },
  "tags": { operands: [] },
  "untagged": { operands: [] },
  "function": { dynamicOperands: "functions" },
  "subfilter": { dynamicOperands: "functions" },
  "contains": { flags: ["casesensitive"], suffixes: ["field", "index"] },
  "match": { flags: ["casesensitive"] },
  "regexp": { flags: ["casesensitive"] },
  "search": {
    flags: ["casesensitive", "anchored", "literal", "whitespace", "regexp", "words", "some", "all"],
    suffixes: ["field"]
  },
  "prefix": { flags: ["casesensitive"] },
  "suffix": { flags: ["casesensitive"] },
  "sort": {
    dynamicOperands: "fields",
    flags: ["reverse", "casesensitive"],
    suffixes: ["alphanumeric", "number", "string", "date", "naturaldate"]
  },
  "nsort": { dynamicOperands: "fields", flags: ["reverse"] },
  "sortan": { dynamicOperands: "fields", flags: ["reverse"] },
  "sortcs": { dynamicOperands: "fields", flags: ["reverse"] },
  "sortby": { dynamicOperands: "fields", flags: ["reverse"] },
  "nsortby": { dynamicOperands: "fields", flags: ["reverse"] },
  "compare": {
    suffixes: ["number", "string", "integer", "date", "version"],
    flags: ["casesensitive"]
  },
  "limit": { operands: [] },
  "first": { operands: [] },
  "last": { operands: [] },
  "nth": { operands: [] },
  "range": { operands: [] },
  "format": { operands: ["date", "relativedate", "json", "timestamp", "titlelist"] },
  "jsonget": { operands: [] },
  "jsontype": { operands: [] },
  "jsonindexes": { operands: [] },
  "jsonextract": { operands: [] },
  "lookup": { dynamicOperands: "fields" },
  "getvariable": { dynamicOperands: "variables" },
  "list": { dynamicOperands: "tiddlers" },
  "listed": { dynamicOperands: "fields" },
  "enlist": { operands: [] },
  "split": { operands: [] },
  "draft.of": { operands: [] },
  "draft.for": { operands: [] },
  "each": { dynamicOperands: "fields" },
  "eachday": { dynamicOperands: "fields" },
  "backlinks": { operands: [] },
  "backtranscludes": { operands: [] },
  "commands": { operands: [] },
  "count": { operands: [] },
  "deserializers": { operands: [] },
  "duplicateslugs": { operands: [] },
  "editions": { operands: [] },
  "haschanged": { operands: [] },
  "links": { operands: [] },
  "moduletypes": { operands: [] },
  "plugintiddlers": { operands: [] },
  "shadowsource": { operands: [] },
  "slugify": { operands: [] },
  "storyviews": { operands: [] },
  "title": { operands: [] },
  "transcludes": { operands: [] },
  "variables": { operands: [] },
}

export type FilterBracketMode = "always" | "smart" | "none"

/**
 * Filter operator completion source
 */
export function filterOperatorCompletion(
  getFilterOperators?: () => string[],
  getFilterBracketMode?: () => FilterBracketMode,
  getFunctionParams?: (name: string) => string[] | null
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    // Skip if we're inside an operand (between operator[ and ])
    // Require at least one operator character - otherwise ]][ is "new run", not "inside operand"
    // Operator names can contain dots for functions like my.function
    // Also handles comma-separated multiple operands: [func[a],[b] or [func<v1>,<v2>]
    if (/[\[\]}>][\w\-:!.]+\[[^\]]*$/.test(textBefore) ||
        /[\[\]}>][\w\-:!.]+\{[^}]*$/.test(textBefore) ||
        /[\[\]}>][\w\-:!.]+<[^>]*$/.test(textBefore) ||
        /\],\[[^\]]*$/.test(textBefore) ||
        /\],\{[^}]*$/.test(textBefore) ||
        /\],<[^>]*$/.test(textBefore) ||
        /\},\[[^\]]*$/.test(textBefore) ||
        /\},\{[^}]*$/.test(textBefore) ||
        /\},<[^>]*$/.test(textBefore) ||
        />,\[[^\]]*$/.test(textBefore) ||
        />,\{[^}]*$/.test(textBefore) ||
        />,<[^>]*$/.test(textBefore)) {
      return null
    }

    // Check if we're after ]] which closes a filter run (not inside filter anymore)
    if (/\]\](?::\w+)*\w*$/.test(textBefore)) {
      return null
    }

    // Determine which pattern matches and extract prefix/partial
    let prefix = ""
    let partial = ""
    let matchLength = 0

    // Note: [\w.]* allows dots in operator/function names (e.g., .shadow-data)
    const filterOperatorMatch = /\[(!?)([\w.]*)$/.exec(textBefore)
    // Match chained operator: ]word or just ] (ready to type next operator)
    const chainedMatch = /\](?::\w+)*([\w.]*)$/.exec(textBefore)
    // Match after > or } (closing filter variable like <actionTiddler>, <__tag__>, or {field})
    const afterVariableMatch = /[>}](?::\w+)*(!?)([\w.]*)$/.exec(textBefore)

    if (filterOperatorMatch) {
      prefix = filterOperatorMatch[1]
      partial = filterOperatorMatch[2]
      matchLength = partial.length + prefix.length + 1
    } else if (chainedMatch) {
      partial = chainedMatch[1]
      matchLength = partial.length
    } else if (afterVariableMatch) {
      prefix = afterVariableMatch[1]
      partial = afterVariableMatch[2]
      matchLength = partial.length + prefix.length
    } else {
      return null
    }

    // Check filter context using syntax tree - applies to all match types
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree
    let inFilter = false
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      // Check for actual filter content nodes, not wrapper nodes like AttributeFiltered
      // (AttributeFiltered spans entire attribute value, even content after ]])
      // IncompleteFilterRun is created by the parser for [operator... patterns in plain text
      // Conditional is the inline version of ConditionalBlock (<%if%> in inline mode)
      if (node.name === "FilterExpression" || node.name === "FilteredTransclusion" ||
          node.name === "FilteredTransclusionBlock" ||
          node.name === "ConditionalBlock" || node.name === "Conditional" ||
          node.name === "FilterRun" ||
          node.name === "FilterOperator" || node.name === "FilterOperatorName" ||
          node.name === "IncompleteFilterRun") {
        inFilter = true
      }
      node = node.parent!
    }

    const hasFilterContext = inFilter ||
                             /\{\{\{[^}]*$/.test(textBefore) ||
                             /<%(?:if|elseif)\s+[^%]*$/.test(textBefore) ||
                             /filter\s*=\s*["'][^"']*$/.test(textBefore)

    if (!hasFilterContext) {
      let inRestrictedContext = false
      let checkNode = tree
      while (checkNode && !checkNode.type.isTop) {
        // Note: WikiLink and ImageLink are NOT included here because when we just
        // typed `[`, the parser might create those nodes speculatively, but we still
        // want to offer filter/img/ext completions at that point
        if (checkNode.name === "Widget" || checkNode.name === "WidgetBlock" ||
            checkNode.name === "MacroCall" || checkNode.name === "MacroCallBlock" ||
            checkNode.name === "HTMLTag" || checkNode.name === "HTMLBlock" ||
            checkNode.name === "Attribute" || checkNode.name === "AttributeName" ||
            checkNode.name === "AttributeValue" || checkNode.name === "AttributeString" ||
            checkNode.name === "PragmaImport" || checkNode.name === "PragmaDefine" ||
            checkNode.name === "PragmaProcedure" || checkNode.name === "PragmaFunction" ||
            checkNode.name === "PragmaWidget" || checkNode.name === "PragmaParameters" ||
            checkNode.name === "Transclusion" || checkNode.name === "TransclusionBlock") {
          inRestrictedContext = true
          break
        }
        checkNode = checkNode.parent!
      }

      if (inRestrictedContext) return null
    }

    // For chained and afterVariable matches, require filter context
    // The parser now creates IncompleteFilterRun nodes for [operator... patterns in plain text,
    // so we rely on the syntax tree instead of regex heuristics
    // Exception: [<variable> or [{field}] patterns suggest filter context even without syntax tree support
    const likelyFilterContext = /\[[^\]]*[>}][\w.]*$/.test(textBefore)
    if (!filterOperatorMatch && !inFilter && !likelyFilterContext) {
      return null
    }

    return createFilterOperatorResult(context, partial, matchLength, hasFilterContext, getFilterOperators, getFilterBracketMode, getFunctionParams)
  };
}

function createFilterOperatorResult(
  context: CompletionContext,
  partial: string,
  _matchLength: number,
  inFilterContext: boolean,
  getFilterOperators?: () => string[],
  getFilterBracketMode?: () => FilterBracketMode,
  getFunctionParams?: (name: string) => string[] | null
): CompletionResult {
  const { pos, state } = context
  const textBefore = state.sliceDoc(Math.max(0, pos - 50), pos)

  // Check if we just typed [ (not inside an existing filter run)
  // In this case, also offer img and ext completions
  const justOpenedBracket = /\[([\w.]*)$/.test(textBefore) && !/\][\w.]*$/.test(textBefore)

  const customOperators = getFilterOperators ? getFilterOperators() : []
  const operators = customOperators.length > 0 ? customOperators : coreFilterOperators

  // Extract local function definitions for parameter-aware completion
  const docText = state.doc.toString()
  const localDefs = extractLocalDefinitions(docText)
  const localFunctions = localDefs.functions
  const localParams = localDefs.definitionParams

  const options: Completion[] = []

  // Add img and ext at the top when we just typed [ in plain text (not in a filter context)
  // In confirmed filter contexts like {{{ }}}, filter="", or <%if%>, img/ext are not valid
  if (justOpenedBracket && !inFilterContext) {
    const imgMatches = partial.length === 0 || "img".toLowerCase().startsWith(partial.toLowerCase())
    const extMatches = partial.length === 0 || "ext".toLowerCase().startsWith(partial.toLowerCase())

    if (imgMatches) {
      options.push({
        label: "img",
        type: "keyword",
        detail: "[img[...]] - embed image",
        boost: "img".startsWith(partial.toLowerCase()) ? 100 : 10,
        apply: (view: any, _completion: any, from: any, to: any) => {
          view.dispatch({
            changes: { from, to, insert: "img[" },
            selection: { anchor: from + 4 }
          })
        }
      })
    }

    if (extMatches) {
      options.push({
        label: "ext",
        type: "keyword",
        detail: "[ext[...]] - external link",
        boost: "ext".startsWith(partial.toLowerCase()) ? 100 : 10,
        apply: (view: any, _completion: any, from: any, to: any) => {
          view.dispatch({
            changes: { from, to, insert: "ext[" },
            selection: { anchor: from + 4 }
          })
        }
      })
    }
  }

  // Add filter operators
  operators.forEach(op => {
    const meta = filterOperatorMeta[op]
    const noOperand = meta && Array.isArray(meta.operands) && meta.operands.length === 0

    options.push({
      label: op,
      type: "function",
      detail: "filter operator",
      apply: (view: any, _completion: any, from: any, to: any) => {
        const mode = getFilterBracketMode ? getFilterBracketMode() : "always"

        // Check what's after the cursor
        const textAfter = view.state.sliceDoc(to, to + 2)
        const firstCharAfter = textAfter.charAt(0)

        // If there's already an operand opener after cursor, just insert operator name
        if (firstCharAfter === "[" || firstCharAfter === "<" || firstCharAfter === "{") {
          view.dispatch({
            changes: { from, to, insert: op },
            selection: { anchor: from + op.length }
          })
          return
        }

        if (mode === "none") {
          // Just insert the operator name, no brackets
          view.dispatch({
            changes: { from, to, insert: op },
            selection: { anchor: from + op.length }
          })
          return
        }

        const hasClosingBracket = textAfter.startsWith("]")
        const hasDoubleClose = textAfter === "]]"

        if (mode === "smart") {
          if (noOperand) {
            // Operators like count[] that take no operand
            if (hasDoubleClose) {
              // Already have ]], just need inner []
              view.dispatch({
                changes: { from, to, insert: op + "[]" },
                selection: { anchor: from + op.length + 1 }
              })
            } else if (hasClosingBracket) {
              // Have single ], add [] before it
              view.dispatch({
                changes: { from, to, insert: op + "[]" },
                selection: { anchor: from + op.length + 1 }
              })
            } else {
              // No closing bracket, add []
              view.dispatch({
                changes: { from, to, insert: op + "[]" },
                selection: { anchor: from + op.length + 1 }
              })
            }
          } else {
            // Operators that take operands
            if (hasClosingBracket) {
              // Already have ], just add opening [
              view.dispatch({
                changes: { from, to, insert: op + "[" },
                selection: { anchor: from + op.length + 1 }
              })
            } else {
              // No closing bracket, add []
              view.dispatch({
                changes: { from, to, insert: op + "[]" },
                selection: { anchor: from + op.length + 1 }
              })
            }
          }
          return
        }

        // mode === "always" (default) - original behavior
        if (noOperand) {
          if (hasDoubleClose) {
            view.dispatch({
              changes: { from, to, insert: op + "[" },
              selection: { anchor: from + op.length + 1 }
            })
          } else {
            view.dispatch({
              changes: { from, to, insert: op + "[]" },
              selection: { anchor: from + op.length + 1 }
            })
          }
        } else {
          view.dispatch({
            changes: { from, to, insert: op + "[" },
            selection: { anchor: from + op.length + 1 }
          })
        }
      }
    })
  })

  // Add local functions with parameter-aware completion
  // Track what we've added to avoid duplicates (use cached lowercase Set)
  const addedOps = new Set(getOperatorsLowerSet(operators))

  localFunctions.forEach(fn => {
    if (addedOps.has(fn.toLowerCase())) return
    addedOps.add(fn.toLowerCase())

    const params = localParams[fn] || []
    const paramCount = params.length

    options.push({
      label: fn,
      type: "function",
      detail: paramCount > 0 ? `function (${paramCount} param${paramCount > 1 ? 's' : ''})` : "function",
      boost: 5, // Boost local functions
      apply: (view: any, _completion: any, from: any, to: any) => {
        const mode = getFilterBracketMode ? getFilterBracketMode() : "always"
        const textAfter = view.state.sliceDoc(to, to + 2)
        const firstCharAfter = textAfter.charAt(0)

        // If there's already an operand opener after cursor, just insert function name
        if (firstCharAfter === "[" || firstCharAfter === "<" || firstCharAfter === "{") {
          view.dispatch({
            changes: { from, to, insert: fn },
            selection: { anchor: from + fn.length }
          })
          return
        }

        if (mode === "none") {
          view.dispatch({
            changes: { from, to, insert: fn },
            selection: { anchor: from + fn.length }
          })
          return
        }

        // Build brackets based on parameter count
        // e.g., 2 params -> "[],[]", 3 params -> "[],[],[]"
        let brackets = "[]"
        if (paramCount > 1) {
          brackets = "[]" + ",[]".repeat(paramCount - 1)
        }

        const hasClosingBracket = textAfter.startsWith("]")
        if (mode === "smart" && hasClosingBracket && paramCount <= 1) {
          // Just add opening bracket
          view.dispatch({
            changes: { from, to, insert: fn + "[" },
            selection: { anchor: from + fn.length + 1 }
          })
        } else {
          view.dispatch({
            changes: { from, to, insert: fn + brackets },
            selection: { anchor: from + fn.length + 1 } // Position inside first []
          })
        }
      }
    })
  })

  // Add functions from external source (TiddlyWiki) with parameter awareness
  if (getFunctionParams) {
    const externalFunctions = customOperators.filter(op =>
      !coreFilterOperators.includes(op) && !addedOps.has(op.toLowerCase())
    )

    externalFunctions.forEach(fn => {
      if (addedOps.has(fn.toLowerCase())) return
      addedOps.add(fn.toLowerCase())

      const params = getFunctionParams(fn)
      const paramCount = params ? params.length : 0

      if (paramCount > 0) {
        // Override the default completion for this function with parameter-aware version
        const existingIdx = options.findIndex(o => o.label === fn)
        if (existingIdx >= 0) {
          options.splice(existingIdx, 1)
        }

        options.push({
          label: fn,
          type: "function",
          detail: `function (${paramCount} param${paramCount > 1 ? 's' : ''})`,
          boost: 3,
          apply: (view: any, _completion: any, from: any, to: any) => {
            const mode = getFilterBracketMode ? getFilterBracketMode() : "always"
            const textAfter = view.state.sliceDoc(to, to + 2)
            const firstCharAfter = textAfter.charAt(0)

            if (firstCharAfter === "[" || firstCharAfter === "<" || firstCharAfter === "{") {
              view.dispatch({
                changes: { from, to, insert: fn },
                selection: { anchor: from + fn.length }
              })
              return
            }

            if (mode === "none") {
              view.dispatch({
                changes: { from, to, insert: fn },
                selection: { anchor: from + fn.length }
              })
              return
            }

            let brackets = "[]"
            if (paramCount > 1) {
              brackets = "[]" + ",[]".repeat(paramCount - 1)
            }

            const hasClosingBracket = textAfter.startsWith("]")
            if (mode === "smart" && hasClosingBracket && paramCount <= 1) {
              view.dispatch({
                changes: { from, to, insert: fn + "[" },
                selection: { anchor: from + fn.length + 1 }
              })
            } else {
              view.dispatch({
                changes: { from, to, insert: fn + brackets },
                selection: { anchor: from + fn.length + 1 }
              })
            }
          }
        })
      }
    })
  }

  return {
    from: pos - partial.length,
    to: pos,
    options,
    validFor: /^[\w.]*$/  // Allow dots in function names like tf.get-tag
  };
}

/**
 * Filter run prefix completion source
 */
export function filterRunPrefixCompletion(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context

  const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)
  const runPrefixMatch = /(?:\{\{\{|[\]\s])\s*([:+\-~][\w]*|=>?[\w]*)$/.exec(textBefore)
  if (!runPrefixMatch) return null

  const tree = syntaxTree(state).resolveInner(pos, -1)
  let node = tree
  let inFilter = false
  while (node && !node.type.isTop) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" ||
        node.name === "TypedBlock" || node.name === "CommentBlock" ||
        node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
      return null
    }
    if (node.name === "FilterExpression" || node.name === "FilteredTransclusion" ||
        node.name === "FilteredTransclusionBlock" || node.name === "AttributeFiltered" ||
        node.name === "ConditionalBlock") {
      inFilter = true
    }
    node = node.parent!
  }

  const hasFilterContext = inFilter ||
                           /\{\{\{[^}]*$/.test(textBefore) ||
                           /<%(?:if|elseif)\s+[^%]*$/.test(textBefore) ||
                           /filter\s*=\s*["'][^"']*$/.test(textBefore)

  if (!hasFilterContext) return null

  const partial = runPrefixMatch[1]

  const options: Completion[] = filterRunPrefixes.map(p => ({
    label: p.label,
    type: "keyword",
    detail: p.detail,
    apply: p.label.startsWith(":") ? (view: any, _completion: any, from: any, to: any) => {
      const textAfter = view.state.sliceDoc(to, to + 10)
      const hasClosingBracket = /^\s*\]/.test(textAfter)
      const insert = hasClosingBracket ? p.label + "[" : p.label + "[]"
      const cursorPos = from + p.label.length + 1
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: cursorPos }
      })
    } : p.label
  }))

  return {
    from: pos - partial.length,
    to: pos,
    options,
    validFor: /^(?:[:+\-~][\w]*|=>?[\w]*)$/
  };
}

/**
 * Filter operator suffix completion source
 */
export function filterOperatorSuffixCompletion(
  getFieldNames?: () => string[]
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    // Match operator after [ (start of step), ] (after operand), > (after variable), } (after field), or ) (after mvv)
    const match = /[\[\]}>)](!?)([\w.]+)((?::[\w]*)*)$/.exec(textBefore)
    if (!match) return null

    const operator = match[2]
    const suffixPart = match[3]

    if (!suffixPart || !suffixPart.includes(':')) return null

    const colonMatch = /:(\w*)$/.exec(suffixPart)
    if (!colonMatch) return null

    const partial = colonMatch[1]

    const meta = filterOperatorMeta[operator]
    if (!meta) return null

    if (!meta.flags && !meta.suffixes) return null

    const usedSuffixes = suffixPart.split(':').filter(s => s && s !== partial)
    const options: Completion[] = []

    if (meta.flags) {
      for (const flag of meta.flags) {
        if (!usedSuffixes.includes(flag)) {
          options.push({
            label: flag,
            type: "keyword",
            detail: "flag"
          })
        }
      }
    }

    if (meta.suffixes) {
      for (const suffix of meta.suffixes) {
        if (!usedSuffixes.includes(suffix)) {
          if (suffix === "field") {
            options.push({
              label: suffix,
              type: "property",
              detail: "use field suffix"
            })
          } else {
            options.push({
              label: suffix,
              type: "property",
              detail: "type"
            })
          }
        }
      }
    }

    // Only show field names after user has explicitly typed :field suffix
    if (usedSuffixes.includes("field")) {
      const fields = getFieldNames ? getFieldNames() : defaultFieldNames
      for (const field of fields) {
        if (!usedSuffixes.includes(field)) {
          options.push({
            label: field,
            type: "variable",
            detail: "field name"
          })
        }
      }
    }

    if (options.length === 0) return null

    const filteredOptions = partial.length > 0
      ? options.filter(o => o.label.toLowerCase().startsWith(partial.toLowerCase()))
      : options

    if (filteredOptions.length === 0) return null

    return {
      from: pos - partial.length,
      to: pos,
      options: filteredOptions,
      validFor: /^[\w.]*$/  // Allow dots in function names (e.g., .shadow-data)
    };
  };
}

/**
 * Filter operand value completion source
 * Handles [operand], {operand}, <operand> and comma-separated multiple operands
 */
export function filterOperandValueCompletion(
  getTiddlerNames?: () => string[],
  getTagNames?: () => string[],
  getFieldNames?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[],
  getTypeNames?: () => string[]
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    // Match first operand: operator[content or operator{content or operator<content or operator(content
    // Operator names can contain dots (like my.function)
    const firstOperandMatch = /[\[\]}>)](!?)([\w.]+)((?::[\w]+)*)([\[{<(])([^\]}>)]*)$/.exec(textBefore)
    // Match subsequent operand after comma: ],[content or ],{content or ],<content or ],(content (and same for } > ))
    const commaOperandMatch = /[\]}>)],([\[{<(])([^\]}>)]*)$/.exec(textBefore)

    let operator: string | null = null
    let operandContent: string
    let operandType: string  // '[', '{', '<', or '('

    if (firstOperandMatch) {
      operator = firstOperandMatch[2]
      operandType = firstOperandMatch[4]
      operandContent = firstOperandMatch[5]
    } else if (commaOperandMatch) {
      // For comma-separated operands, we need to find the operator by looking further back
      operandType = commaOperandMatch[1]
      operandContent = commaOperandMatch[2]
      // Try to find the operator name from the beginning of the filter step
      const operatorMatch = /\[(!?)([\w.]+)/.exec(textBefore)
      if (operatorMatch) {
        operator = operatorMatch[2]
      }
    } else {
      return null
    }

    // For <variable> operands, provide variable completions
    if (operandType === '<') {
      const varNames = getVariableNames ? getVariableNames() : []
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)
      const allVars = [...new Set([...varNames, ...localDefs.variables, ...localDefs.functions, ...localDefs.procedures, ...localDefs.macros])]

      // Add "condition" when inside a conditional context (<%if%>...<%endif%>)
      if (isInsideConditionalContext(state, pos) && !allVars.includes("condition")) {
        allVars.push("condition")
      }

      if (allVars.length === 0) return null

      const partial = operandContent
      const filteredOptions = partial.length > 0
        ? allVars.filter(v => v.toLowerCase().startsWith(partial.toLowerCase()))
        : allVars

      if (filteredOptions.length === 0) return null

      return {
        from: pos - partial.length,
        to: pos,
        options: filteredOptions.map(v => ({
          label: v,
          type: "variable",
          detail: "variable"
        })),
        validFor: /^[\w.]*$/
      };
    }

    // For (variable) multi-valued operands, provide variable completions
    if (operandType === '(') {
      const varNames = getVariableNames ? getVariableNames() : []
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)
      const allVars = [...new Set([...varNames, ...localDefs.variables, ...localDefs.functions, ...localDefs.procedures, ...localDefs.macros])]

      if (allVars.length === 0) return null

      const partial = operandContent
      const filteredOptions = partial.length > 0
        ? allVars.filter(v => v.toLowerCase().startsWith(partial.toLowerCase()))
        : allVars

      if (filteredOptions.length === 0) return null

      return {
        from: pos - partial.length,
        to: pos,
        options: filteredOptions.map(v => ({
          label: v,
          type: "variable",
          detail: "multi-valued variable"
        })),
        validFor: /^[\w.]*$/
      };
    }

    // For {text reference} operands, we could provide tiddler/field completions
    // but this is complex due to the !!field and ##index syntax - skip for now
    if (operandType === '{') {
      return null
    }

    // For [hard operand], use operator metadata if available
    if (!operator) return null

    const meta = filterOperatorMeta[operator]
    if (!meta) return null

    if (meta.operands && meta.operands.length === 0 && !meta.dynamicOperands) {
      return null
    }

    let partial: string
    let usedValues: string[]

    if (meta.allowPlus && operandContent.includes('+')) {
      const parts = operandContent.split('+')
      partial = parts[parts.length - 1]
      usedValues = parts.slice(0, -1)
    } else {
      partial = operandContent
      usedValues = []
    }

    let options: Completion[] = []

    if (meta.operands && meta.operands.length > 0) {
      options = meta.operands
        .filter(op => !usedValues.includes(op))
        .map(op => ({
          label: op,
          type: "constant",
          detail: `${operator}[] value`
        }))
    }

    if (meta.dynamicOperands) {
      const docText = state.doc.toString()
      const localDefs = extractLocalDefinitions(docText)

      let values: string[] = []
      let localValues: string[] = []
      let detailType = ""
      switch (meta.dynamicOperands) {
        case 'fields':
          values = getFieldNames ? getFieldNames() : defaultFieldNames
          detailType = "field"
          break
        case 'tags':
          values = getTagNames ? getTagNames() : []
          detailType = "tag"
          break
        case 'tiddlers':
          values = getTiddlerNames ? getTiddlerNames() : []
          detailType = "tiddler"
          break
        case 'functions':
          values = getFunctionNames ? getFunctionNames() : []
          localValues = localDefs.functions
          detailType = "function"
          break
        case 'variables':
          values = getVariableNames ? getVariableNames() : []
          localValues = localDefs.variables
          detailType = "variable"
          break
        case 'types':
          values = getTypeNames ? getTypeNames() : []
          detailType = "type"
          break
      }

      const seen = new Set<string>(usedValues)
      const needsBoost = meta.dynamicOperands === 'tags' || meta.dynamicOperands === 'tiddlers'
      options.push(...values
        .filter(v => {
          if (seen.has(v)) return false
          seen.add(v)
          return true
        })
        .map(v => ({
          label: v,
          type: meta.dynamicOperands === 'fields' ? 'variable' as const :
                meta.dynamicOperands === 'functions' ? 'function' as const :
                'text' as const,
          detail: detailType,
          ...(needsBoost ? { boost: getTiddlerBoost(v) } : {})
        })))

      if (localValues.length > 0) {
        if (meta.dynamicOperands === 'variables') {
          options.push(...localDefs.builtIns
            .filter(v => {
              if (seen.has(v)) return false
              seen.add(v)
              return true
            })
            .map(v => ({
              label: v,
              type: 'keyword' as const,
              detail: `${detailType} (built-in)`
            })))

          const trueLocalVars = [
            ...localDefs.functions,
            ...localDefs.procedures,
            ...localDefs.macros,
            ...localDefs.widgets,
            ...localDefs.widgetVars
          ]
          options.push(...trueLocalVars
            .filter(v => {
              if (seen.has(v)) return false
              seen.add(v)
              return true
            })
            .map(v => ({
              label: v,
              type: 'function' as const,
              detail: `${detailType} (local)`
            })))
        } else {
          options.push(...localValues
            .filter(v => {
              if (seen.has(v)) return false
              seen.add(v)
              return true
            })
            .map(v => ({
              label: v,
              type: 'function' as const,
              detail: `${detailType} (local)`
            })))
        }
      }
    }

    if (options.length === 0) return null

    const filteredOptions = partial.length > 0
      ? options.filter(o => o.label.toLowerCase().startsWith(partial.toLowerCase()))
      : options

    if (filteredOptions.length === 0) return null

    return {
      from: pos - partial.length,
      to: pos,
      options: filteredOptions,
      validFor: /^[^\]]*$/
    };
  };
}

/**
 * Image and external link bracket completion source
 *
 * When user types `[` followed by characters that could match img or ext,
 * this provides completions for:
 * - [img[path]] - embed image
 * - [ext[url]] - external link
 *
 * This complements filterOperatorCompletion by adding img/ext options.
 * CodeMirror merges results from both sources.
 */
export function imageLinkCompletion(): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos)

    // Match `[` followed by optional partial word
    const bracketMatch = /\[(\w*)$/.exec(textBefore)
    if (!bracketMatch) return null

    const partial = bracketMatch[1]

    // Don't trigger if we're inside an operand (after [operator[)
    // Require at least one operator character (can include dots for functions)
    if (/[\[\]}>][\w\-:!.]+\[[^\]]*$/.test(textBefore)) return null

    // Don't trigger for wiki links [[ - check if there's a [ right before the matched [
    const beforeBracket = textBefore.slice(0, -(partial.length + 1))
    if (beforeBracket.endsWith("[")) return null

    // Check syntax tree context - skip if in code blocks
    const tree = syntaxTree(state).resolveInner(pos, -1)
    let node = tree

    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      // Note: We don't skip for WikiLink/ImageLink because when we just typed `[`,
      // the parser might create those nodes speculatively

      node = node.parent!
    }

    // Build completion options for img and ext only
    const options: Completion[] = []

    // Add img and ext with high boost when partial matches
    const imgMatches = partial.length === 0 || "img".startsWith(partial.toLowerCase())
    const extMatches = partial.length === 0 || "ext".startsWith(partial.toLowerCase())

    if (imgMatches) {
      options.push({
        label: "img",
        type: "keyword",
        detail: "[img[image]] - embed image",
        boost: partial.length > 0 && "img".startsWith(partial.toLowerCase()) ? 100 : 10,
        apply: (view: any, _completion: any, from: any, to: any) => {
          // Insert [img[] with cursor inside for image path
          view.dispatch({
            changes: { from: from - 1, to, insert: "[img[]" },
            selection: { anchor: from + 4 }
          })
        }
      })
    }

    if (extMatches) {
      options.push({
        label: "ext",
        type: "keyword",
        detail: "[ext[url]] - external link",
        boost: partial.length > 0 && "ext".startsWith(partial.toLowerCase()) ? 100 : 10,
        apply: (view: any, _completion: any, from: any, to: any) => {
          // Insert [ext[] with cursor inside for URL
          view.dispatch({
            changes: { from: from - 1, to, insert: "[ext[]" },
            selection: { anchor: from + 4 }
          })
        }
      })
    }

    if (options.length === 0) return null

    return {
      from: pos - partial.length,
      to: pos,
      options,
      validFor: /^\w*$/
    };
  };
}
