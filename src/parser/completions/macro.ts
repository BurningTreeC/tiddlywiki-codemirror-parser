/**
 * Macro completion sources
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { syntaxTree } from "@codemirror/language"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/autocomplete'. Did... Remove this comment to see the full error message
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/state'. Did you me... Remove this comment to see the full error message
import { EditorState } from "@codemirror/state"
import { buildMultiSelectionChanges, triggerCompletionEffect, extractLocalDefinitions, builtInVariables, findPragmaSectionEnd, getScopedWidgetVariables } from "./common"
import { getActionContextVariables, ACTION_IMPLICIT_VARIABLES, ACTION_ATTRIBUTE_NAMES } from "../../linter"
// @ts-expect-error TS(2792): Cannot find module '@lezer/common'. Did you mean t... Remove this comment to see the full error message
import type { SyntaxNode } from "@lezer/common"

/**
 * Check if the cursor position is inside a conditional context (<%if%>...<%endif%>).
 * This handles both block-level ConditionalBlock nodes and inline Conditional siblings.
 * @param state - Editor state
 * @param pos - Cursor position
 * @returns true if inside a conditional context
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
  // Walk up to find a parent that might contain Conditional siblings
  current = node
  while (current && !current.type.isTop) {
    const parent = current.parent
    if (parent) {
      // Collect Conditional siblings in this parent
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

      // Check if pos is between a matched <%if%> and <%endif%>
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
        // Also check if after an unmatched <%if%>
        if (depth > 0 && lastIfEnd !== -1 && pos > lastIfEnd) {
          return true
        }
      }
    }
    current = parent
  }

  return false
}

/**
 * Find all call sites of a definition and check if any are in action contexts.
 * Returns the action variables that would be available through call-chain inheritance.
 *
 * For example, if we have:
 *   \procedure foo()
 *   <<actionTiddler>>
 *   \end
 *   <$droppable actions="""<$transclude $variable="foo"/>"""/>
 *
 * Then when editing inside \procedure foo(), we should offer actionTiddler
 * because foo is called from the actions attribute of $droppable.
 */
function getActionVariablesFromCallSites(
  defName: string,
  tree: SyntaxNode,
  doc: string,
  defFrom: number,
  defTo: number
): { variables: string[], patterns: string[] } {
  const result: { variables: string[], patterns: string[] } = {
    variables: [],
    patterns: []
  }
  const seenVars = new Set<string>()
  const seenPatterns = new Set<string>()

  // Helper to get widget name from a Widget/InlineWidget node
  function getWidgetName(widgetNode: SyntaxNode): string | null {
    let child = widgetNode.firstChild
    while (child) {
      if (child.name === "WidgetName") {
        return doc.slice(child.from, child.to)
      }
      child = child.nextSibling
    }
    return null
  }

  // Helper to get attribute name from an Attribute node
  function getAttributeName(attrNode: SyntaxNode): string | null {
    let child = attrNode.firstChild
    while (child) {
      if (child.name === "AttributeName") {
        return doc.slice(child.from, child.to)
      }
      child = child.nextSibling
    }
    return null
  }

  // Helper to check if a node is inside the definition being edited (skip self-references)
  // @ts-expect-error TS(6133): 'isInsideDefinition' is declared but its value is ... Remove this comment to see the full error message
  function isInsideDefinition(node: SyntaxNode): boolean {
    return node.from >= defFrom && node.to <= defTo
  }

  // Helper to check if a node is in an action attribute and get the action variables
  function getActionVarsAtNode(node: SyntaxNode): { variables: string[], patterns: string[] } | null {
    let current: SyntaxNode | null = node
    while (current) {
      if (current.name === "Attribute") {
        const attrName = getAttributeName(current)
        if (attrName) {
          // Find parent widget
          let parent = current.parent
          while (parent) {
            if (parent.name === "Widget" || parent.name === "InlineWidget") {
              const widgetName = getWidgetName(parent)
              if (widgetName) {
                const actionAttrs = ACTION_ATTRIBUTE_NAMES[widgetName]
                if (actionAttrs && actionAttrs.includes(attrName)) {
                  const implicitVars = ACTION_IMPLICIT_VARIABLES[widgetName]
                  if (implicitVars) {
                    const vars: string[] = []
                    const pats: string[] = []
                    for (const v of implicitVars) {
                      if (v.includes("*")) {
                        pats.push(v)
                      } else {
                        vars.push(v)
                      }
                    }
                    return { variables: vars, patterns: pats }
                  }
                }
              }
              break
            }
            parent = parent.parent
          }
        }
      }
      current = current.parent
    }
    return null
  }

  // Search for macro calls: <<defName ...>>
  const macroCallRegex = new RegExp(`<<\\s*${defName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|>|$)`, 'g')
  let match
  while ((match = macroCallRegex.exec(doc)) !== null) {
    const callPos = match.index
    // Skip if this is inside the definition itself
    if (callPos >= defFrom && callPos <= defTo) continue

    // Find the syntax node at this position
    const callNode = tree.resolveInner(callPos + 2, 1) // +2 to get past <<
    const actionVars = getActionVarsAtNode(callNode)
    if (actionVars) {
      for (const v of actionVars.variables) {
        if (!seenVars.has(v)) {
          seenVars.add(v)
          result.variables.push(v)
        }
      }
      for (const p of actionVars.patterns) {
        if (!seenPatterns.has(p)) {
          seenPatterns.add(p)
          result.patterns.push(p)
        }
      }
    }
  }

  // Search for <$transclude $variable="defName"> calls
  const transcludeRegex = /<\$transclude\s+[^>]*\$variable\s*=\s*["']([^"']+)["']/gi
  while ((match = transcludeRegex.exec(doc)) !== null) {
    if (match[1] === defName) {
      const callPos = match.index
      if (callPos >= defFrom && callPos <= defTo) continue

      const callNode = tree.resolveInner(callPos + 2, 1)
      const actionVars = getActionVarsAtNode(callNode)
      if (actionVars) {
        for (const v of actionVars.variables) {
          if (!seenVars.has(v)) {
            seenVars.add(v)
            result.variables.push(v)
          }
        }
        for (const p of actionVars.patterns) {
          if (!seenPatterns.has(p)) {
            seenPatterns.add(p)
            result.patterns.push(p)
          }
        }
      }
    }
  }

  // Search for <$macrocall $name="defName"> calls
  const macrocallRegex = /<\$macrocall\s+[^>]*\$name\s*=\s*["']([^"']+)["']/gi
  while ((match = macrocallRegex.exec(doc)) !== null) {
    if (match[1] === defName) {
      const callPos = match.index
      if (callPos >= defFrom && callPos <= defTo) continue

      const callNode = tree.resolveInner(callPos + 2, 1)
      const actionVars = getActionVarsAtNode(callNode)
      if (actionVars) {
        for (const v of actionVars.variables) {
          if (!seenVars.has(v)) {
            seenVars.add(v)
            result.variables.push(v)
          }
        }
        for (const p of actionVars.patterns) {
          if (!seenPatterns.has(p)) {
            seenPatterns.add(p)
            result.patterns.push(p)
          }
        }
      }
    }
  }

  return result
}

/**
 * Find all call sites of a definition and collect variables from enclosing
 * <$set>, <$let>, <$vars> widgets. These variables are available via
 * $(variable)$ substitution syntax in \define macros.
 *
 * For example, if we have:
 *   \define macro-test()
 *   $(test)$
 *   \end
 *   <$set name="test" value="123">
 *   <<macro-test>>
 *   </$set>
 *
 * Then when editing inside \define macro-test(), we should offer "test"
 * because macro-test is called from within the <$set> scope.
 */
function getWidgetVariablesFromCallSites(
  defName: string,
  doc: string,
  defFrom: number,
  defTo: number
): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  // Helper to extract variables from widget text using regex
  // This is simpler than tree traversal and works for our needs
  function extractVariablesFromEnclosingWidgets(callPos: number): void {
    // Look backwards from callPos to find enclosing variable-defining widgets
    const textBefore = doc.slice(0, callPos)

    // Track open/close tags to find enclosing widgets
    // We'll use a simple approach: find all <$set>, <$let>, <$vars> that opened before callPos
    // and haven't been closed yet

    // Find <$set name="..."> patterns
    const setRegex = /<\$set\s+[^>]*name\s*=\s*["']([^"']+)["'][^>]*>/gi
    let match
    while ((match = setRegex.exec(textBefore)) !== null) {
      const varName = match[1]
      const openPos = match.index
      // Check if this <$set> is closed before callPos
      const closeRegex = /<\/\$set\s*>/gi
      closeRegex.lastIndex = openPos + match[0].length
      // @ts-expect-error TS(6133): 'closeMatch' is declared but its value is never re... Remove this comment to see the full error message
      let closeMatch
      let isClosed = false
      while ((closeMatch = closeRegex.exec(textBefore)) !== null) {
        // Found a close tag - but we need to match it with opens
        // For simplicity, just check if there's any close after open and before callPos
        isClosed = true
        break
      }
      // If not closed before callPos, this variable is in scope
      if (!isClosed && !seen.has(varName)) {
        seen.add(varName)
        result.push(varName)
      }
    }

    // Find <$let attr="..."> patterns - attributes are variable names
    const letRegex = /<\$let\s+([^>]+)>/gi
    while ((match = letRegex.exec(textBefore)) !== null) {
      const attrs = match[1]
      const openPos = match.index
      // Check if closed
      const closeRegex = /<\/\$let\s*>/gi
      closeRegex.lastIndex = openPos + match[0].length
      let isClosed = false
      while (closeRegex.exec(textBefore) !== null) {
        isClosed = true
        break
      }
      if (!isClosed) {
        // Extract attribute names (they become variable names)
        const attrRegex = /([a-zA-Z_][\w-]*)\s*=/g
        let attrMatch
        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
          const varName = attrMatch[1]
          if (!seen.has(varName)) {
            seen.add(varName)
            result.push(varName)
          }
        }
      }
    }

    // Find <$vars attr="..."> patterns - same as $let
    const varsRegex = /<\$vars\s+([^>]+)>/gi
    while ((match = varsRegex.exec(textBefore)) !== null) {
      const attrs = match[1]
      const openPos = match.index
      const closeRegex = /<\/\$vars\s*>/gi
      closeRegex.lastIndex = openPos + match[0].length
      let isClosed = false
      while (closeRegex.exec(textBefore) !== null) {
        isClosed = true
        break
      }
      if (!isClosed) {
        const attrRegex = /([a-zA-Z_][\w-]*)\s*=/g
        let attrMatch
        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
          const varName = attrMatch[1]
          if (!seen.has(varName)) {
            seen.add(varName)
            result.push(varName)
          }
        }
      }
    }
  }

  // Search for macro calls: <<defName ...>>
  const macroCallRegex = new RegExp(`<<\\s*${defName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|>|$)`, 'g')
  let match
  while ((match = macroCallRegex.exec(doc)) !== null) {
    const callPos = match.index
    // Skip if this is inside the definition itself
    if (callPos >= defFrom && callPos <= defTo) continue
    extractVariablesFromEnclosingWidgets(callPos)
  }

  // Search for <$transclude $variable="defName"> calls
  const transcludeRegex = /<\$transclude\s+[^>]*\$variable\s*=\s*["']([^"']+)["']/gi
  while ((match = transcludeRegex.exec(doc)) !== null) {
    if (match[1] === defName) {
      const callPos = match.index
      if (callPos >= defFrom && callPos <= defTo) continue
      extractVariablesFromEnclosingWidgets(callPos)
    }
  }

  // Search for <$macrocall $name="defName"> calls
  const macrocallRegex = /<\$macrocall\s+[^>]*\$name\s*=\s*["']([^"']+)["']/gi
  while ((match = macrocallRegex.exec(doc)) !== null) {
    if (match[1] === defName) {
      const callPos = match.index
      if (callPos >= defFrom && callPos <= defTo) continue
      extractVariablesFromEnclosingWidgets(callPos)
    }
  }

  return result
}

// Common TiddlyWiki Macros
export const commonMacros = [
  "now", "tag", "tabs", "timeline", "toc", "toc-hierarchical", "toc-selective-expandable",
  "list-links", "list-links-draggable", "list-tagged-draggable", "copy-to-clipboard",
  "colour-picker", "image-picker", "keyboard-shortcut", "dumpvariables", "qualify",
  "csvtiddlers", "jsontiddlers", "datauri", "makedatauri", "translink"
]

/**
 * Macro completion source
 * Also includes pragma parameter completions when inside a pragma block
 */
export function macroCompletion(
  getMacroNames?: () => string[],
  getFunctionNames?: () => string[],
  getVariableNames?: () => string[]
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(pos - 50, pos)

    const macroMatch = /<<[\w\-\.]*$/.exec(textBefore)
    // Skip if this is actually <<< (widget start with extra <)
    if (macroMatch && macroMatch.index > 0 && textBefore[macroMatch.index - 1] === '<') {
      return null
    }
    // Skip if this looks like a substituted parameter pattern <<__
    if (macroMatch && /<<__/.test(macroMatch[0])) {
      return null
    }
    const filterVarMatch = /[\[\]}>][\w\-:!]*<[\w\-\.]*$/.exec(textBefore)
    // Skip if filter var looks like a substituted parameter pattern <__
    if (filterVarMatch && /<__/.test(filterVarMatch[0])) {
      return null
    }

    const tree = syntaxTree(state).resolveInner(pos, -1)

    // For filter variable completion, verify we're actually inside a filter context
    // The regex [\[\]}>]<... can incorrectly match after widget/HTML tag closings like <$list ...><
    if (filterVarMatch && !macroMatch) {
      let inFilterContext = false
      let node = tree
      while (node && !node.type.isTop) {
        // Check if we're inside a filter-related context
        if (node.name === "FilterExpression" || node.name === "FilterRun" ||
            node.name === "FilterOperator" || node.name === "AttributeFiltered" ||
            node.name === "FilteredTransclusion" || node.name === "FilteredTransclusionBlock") {
          inFilterContext = true
          break
        }
        // Check if we're inside a filter attribute value (e.g., filter="...")
        if (node.name === "AttributeString" || node.name === "AttributeValue") {
          // Look for parent Attribute node to check if it's a filter attribute
          let attrNode = node.parent
          while (attrNode && attrNode.name !== "Attribute" && !attrNode.type.isTop) {
            attrNode = attrNode.parent
          }
          if (attrNode && attrNode.name === "Attribute") {
            // Get the attribute name
            const attrNameNode = attrNode.getChild("AttributeName")
            if (attrNameNode) {
              const attrName = state.sliceDoc(attrNameNode.from, attrNameNode.to)
              // Common filter attribute names
              if (attrName === "filter" || attrName === "$filter" ||
                  attrName.endsWith("Filter") || attrName.endsWith("filter")) {
                inFilterContext = true
                break
              }
            }
          }
        }
        node = node.parent!
      }
      if (!inFilterContext) {
        return null
      }
    }

    const m = macroMatch || filterVarMatch
    if (!m) return null

    let node = tree
    while (node && !node.type.isTop) {
      if (node.name === "FencedCode" || node.name === "CodeBlock" ||
          node.name === "TypedBlock" || node.name === "CommentBlock" ||
          node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
        return null
      }
      node = node.parent!
    }

    const seen = new Set<string>()
    const allNames: { name: string, detail: string, type: 'function' | 'variable' | 'keyword', boost?: number }[] = []

    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)

    // Check if we're inside a pragma and add parameter completions first (with boost)
    const enclosingPragma = findEnclosingPragma(docText, pos)
    if (enclosingPragma && enclosingPragma.params.length > 0) {
      for (const param of enclosingPragma.params) {
        if (!seen.has(param)) {
          seen.add(param)
          allNames.push({ name: param, detail: "parameter", type: "variable", boost: 10 })
        }
      }
    }

    for (const name of localDefs.macros) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "macro (local)", type: "function" })
      }
    }

    for (const name of localDefs.procedures) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "procedure (local)", type: "function" })
      }
    }

    for (const name of localDefs.functions) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "function (local)", type: "function" })
      }
    }

    // Use lexically scoped widget variables (true scoping based on cursor position)
    const scopedVars = getScopedWidgetVariables(state, pos)
    for (const name of scopedVars) {
      if (!seen.has(name)) {
        seen.add(name)
        // Higher boost for scoped variables since they're contextually relevant
        allNames.push({ name, detail: "variable (scoped)", type: "variable", boost: 8 })
      }
    }

    for (const name of localDefs.builtIns) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "variable (built-in)", type: "keyword" })
      }
    }

    // Add action context variables if inside an action attribute (direct context)
    const treeNode = syntaxTree(state).resolveInner(pos, -1)
    const actionContext = getActionContextVariables(treeNode, docText)

    const hasDirectActionContext = actionContext.variables.length > 0 || actionContext.patterns.length > 0

    // If we're directly in an action attribute, add those specific variables with high boost
    if (hasDirectActionContext) {
      for (const name of actionContext.variables) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable (action)", type: "variable", boost: 5 })
        }
      }
    }

    // If we're inside a pragma definition, check if it's called from an action context elsewhere
    // This enables action variable completion for macros/procedures that are used in action attributes
    if (enclosingPragma && !hasDirectActionContext) {
      const callSiteActionVars = getActionVariablesFromCallSites(
        enclosingPragma.name,
        syntaxTree(state).topNode,
        docText,
        enclosingPragma.from,
        enclosingPragma.to
      )
      for (const name of callSiteActionVars.variables) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable (action context)", type: "variable", boost: 3 })
        }
      }
      // Merge patterns for dom-* expansion below
      for (const p of callSiteActionVars.patterns) {
        if (!actionContext.patterns.includes(p)) {
          actionContext.patterns.push(p)
        }
      }
    }

    // For wildcard patterns like "dom-*", add all available dom variables
    if (actionContext.patterns.includes("dom-*")) {
      const domVars = [
        // Position - viewport relative
        "dom-x", "dom-y", "dom-clientX", "dom-clientY",
        // Position - element relative
        "dom-offsetX", "dom-offsetY",
        // Position - document relative
        "dom-pageX", "dom-pageY",
        // Position - screen relative
        "dom-screenX", "dom-screenY",
        // Movement
        "dom-movementX", "dom-movementY",
        // Element dimensions and position
        "dom-width", "dom-height", "dom-top", "dom-left", "dom-right", "dom-bottom",
        // Element info
        "dom-target", "dom-currentTarget", "dom-relatedTarget", "dom-type",
        // Mouse buttons
        "dom-button", "dom-buttons",
        // Modifier keys
        "dom-altKey", "dom-ctrlKey", "dom-metaKey", "dom-shiftKey",
        // Keyboard
        "dom-key", "dom-code",
        // Touch events
        "dom-touches", "dom-targetTouches", "dom-changedTouches",
        // Wheel events
        "dom-deltaX", "dom-deltaY", "dom-deltaZ", "dom-deltaMode",
        // Pointer events
        "dom-pointerId", "dom-pointerType", "dom-pressure", "dom-tiltX", "dom-tiltY",
        "dom-isPrimary", "dom-twist", "dom-tangentialPressure",
        // Drag/drop
        "dom-dataTransfer-types", "dom-dataTransfer-files", "dom-dataTransfer-dropEffect", "dom-dataTransfer-effectAllowed"
      ]
      for (const name of domVars) {
        if (!seen.has(name)) {
          seen.add(name)
          allNames.push({ name, detail: "variable (dom)", type: "variable", boost: 5 })
        }
      }
    }

    // For "event-detail-*" pattern, add placeholder hint (actual values depend on the event)
    if (actionContext.patterns.includes("event-detail-*")) {
      // event-detail-* is dynamic based on CustomEvent.detail properties
      // We add the prefix as a hint that this pattern is available
      if (!seen.has("event-detail-")) {
        seen.add("event-detail-")
        allNames.push({ name: "event-detail-", detail: "variable (event detail prefix)", type: "variable", boost: 4 })
      }
    }

    const customMacros = getMacroNames ? getMacroNames() : []
    const macros = customMacros.length > 0 ? customMacros : commonMacros
    for (const name of macros) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "macro", type: "function" })
      }
    }

    const functions = getFunctionNames ? getFunctionNames() : []
    for (const name of functions) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "function", type: "function" })
      }
    }

    const variables = getVariableNames ? getVariableNames() : []
    for (const name of variables) {
      if (!seen.has(name)) {
        seen.add(name)
        allNames.push({ name, detail: "variable", type: "variable" })
      }
    }

    // Add "condition" variable when inside a conditional context (<%if%>...<%endif%>)
    if (!seen.has("condition") && isInsideConditionalContext(state, pos)) {
      seen.add("condition")
      allNames.push({ name: "condition", detail: "conditional result", type: "variable" })
    }

    if (filterVarMatch) {
      const prefix = m[0].slice(0, m[0].lastIndexOf('<') + 1)
      const patternLen = filterVarMatch[0].length
      const options: Completion[] = allNames.map(({ name, detail, type, boost }) => ({
        label: prefix + name,
        type,
        detail,
        boost,
        apply: (view: any, _completion: any, from: any, to: any) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasClosingAngle = textAfter[0] === ">"

          // Only add what's needed to complete the <variable> syntax
          // Don't add ] - that's for the outer filter operand, not the variable reference
          // Examples:
          //   [<var| -> need >  (hasClosingAngle=false)
          //   [<var|>match[x]] -> need nothing (hasClosingAngle=true)
          //   [<var|>] -> need nothing (hasClosingAngle=true)
          const suffix = hasClosingAngle ? "" : ">"

          const insert = prefix + name + suffix
          const cursorPos = from + prefix.length + name.length + (hasClosingAngle ? 0 : 1)
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos }
          })
        }
      }))

      return {
        from: pos - filterVarMatch[0].length,
        to: pos,
        options,
        validFor: /^[\[\]}>][\w\-:!]*<[\w\-\.]*$/
      };
    }

    const options: Completion[] = allNames.map(({ name, detail, type, boost }) => ({
      label: "<<" + name,
      type,
      detail,
      boost,
      apply: "<<" + name + ">>"
    }))

    return {
      from: pos - m[0].length,
      to: pos,
      options,
      validFor: /^<<[\w\-\.]*$/
    };
  };
}

/**
 * Macro parameter completion source
 */
export function macroParamCompletion(getMacroParams?: (name: string) => string[] | null) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    const macroCallMatch = /<<([\w\-\.]+)\s+[^>]*$/.exec(textBefore)
    const macrocallWidgetMatch = /<\$macrocall\s+[^>]*\$name=(?:"([^"]+)"|'([^']+)'|<<([^>]+)>>)[^>]*$/.exec(textBefore)

    let macroName: string | null = null

    if (macroCallMatch) {
      macroName = macroCallMatch[1]
    } else if (macrocallWidgetMatch) {
      macroName = macrocallWidgetMatch[1] || macrocallWidgetMatch[2] || macrocallWidgetMatch[3]
    }

    if (!macroName) return null

    const afterMacro = macroCallMatch
      ? textBefore.slice(textBefore.lastIndexOf('<<'))
      : textBefore.slice(textBefore.lastIndexOf('<$macrocall'))
    let inQuote = false
    let quoteChar = ''
    for (const ch of afterMacro) {
      if (!inQuote && (ch === '"' || ch === "'")) {
        inQuote = true
        quoteChar = ch
      } else if (inQuote && ch === quoteChar) {
        inQuote = false
      }
    }
    if (inQuote) return null

    const paramMatch = /\s([$\w\-]*)$/.exec(textBefore)
    if (!paramMatch) return null

    const partial = paramMatch[1]
    const from = pos - partial.length

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

    const docText = state.doc.toString()
    const localDefs = extractLocalDefinitions(docText)
    let params: string[] | null = null

    if (localDefs.definitionParams[macroName]) {
      params = localDefs.definitionParams[macroName]
    }
    else if (getMacroParams) {
      params = getMacroParams(macroName)
    }

    if (!params || params.length === 0) return null

    const options: Completion[] = params.map(param => ({
      label: param,
      type: "property",
      detail: "parameter",
      apply: (view: any, _completion: any, from: any, to: any) => {
        const textAfter = view.state.sliceDoc(to, to + 1)
        const suffix = textAfter === ":" ? "" : ":"
        view.dispatch({
          changes: { from, to, insert: param + suffix },
          selection: { anchor: from + param.length + 1 }
        })
      }
    }))

    return {
      from,
      to: pos,
      options,
      validFor: /^[$\w\-]*$/
    };
  };
}

/**
 * Find the enclosing pragma definition at a given position
 * Returns the definition name, type, parameters, and position range, or null if not inside a pragma
 */
function findEnclosingPragma(text: string, pos: number): { name: string, type: string, params: string[], from: number, to: number } | null {
  // Pragmas are only valid in the pragma section at the top of the document
  const pragmaSectionEnd = findPragmaSectionEnd(text)

  // If pos is beyond the pragma section, we're not inside a pragma
  if (pos > pragmaSectionEnd) {
    return null
  }

  // Search backwards from pos for pragma definitions within the pragma section
  const textBefore = text.slice(0, pos)

  // Find all pragma definitions with their positions
  // Pragmas must be at start of line with only whitespace in front
  const pragmaRegex = /(?:^|[\r\n])[ \t]*\\(define|procedure|function|widget)\s+([^\s(]+)(?:\(([^)]*)\))?/gm
  let match
  let lastPragma: { name: string, type: string, params: string[], startPos: number } | null = null

  while ((match = pragmaRegex.exec(textBefore)) !== null) {
    const type = match[1]  // define, procedure, function, or widget
    const name = match[2]
    const paramsStr = match[3]
    let params: string[] = []

    // Calculate the actual start position of the pragma (at the \)
    // The regex match may include leading newline/whitespace
    const backslashOffset = match[0].indexOf("\\")
    const pragmaStartPos = match.index + backslashOffset

    if (paramsStr !== undefined && paramsStr.trim()) {
      params = paramsStr.split(',').map(p => {
        const paramName = p.trim().split(':')[0].trim()
        return paramName
      }).filter(p => p.length > 0)
    } else {
      // Check for \parameters pragma on the next line
      const afterDef = text.slice(match.index + match[0].length)
      const parametersMatch = /^\s*\n?\s*\\parameters\s*\(([^)]*)\)/.exec(afterDef)
      if (parametersMatch) {
        params = parametersMatch[1].split(',').map(p => {
          const paramName = p.trim().split(':')[0].trim()
          return paramName
        }).filter(p => p.length > 0)
      }
    }

    lastPragma = { name, type, params, startPos: pragmaStartPos }
  }

  if (!lastPragma) return null

  // Check if we're still inside this pragma (before \end or next pragma)
  const textAfterPragma = text.slice(lastPragma.startPos)

  // Find the end of this pragma block
  // \end and next pragma must be at start of line with only whitespace in front
  const endMatch = /[\r\n][ \t]*\\end\b/.exec(textAfterPragma)
  const nextPragmaMatch = /[\r\n][ \t]*\\(define|procedure|function|widget)\s+/.exec(textAfterPragma)

  // Use pragma section end as the maximum boundary
  let endPos = pragmaSectionEnd
  if (endMatch) {
    // Find the position of the actual \end (after the newline/whitespace)
    const backslashOffset = endMatch[0].indexOf("\\")
    const endMatchPos = lastPragma.startPos + endMatch.index + backslashOffset + 4 // +4 for "\end"
    if (endMatchPos < endPos) {
      endPos = endMatchPos
    }
  }
  if (nextPragmaMatch) {
    // Find the position of the actual \ (after the newline/whitespace)
    const backslashOffset = nextPragmaMatch[0].indexOf("\\")
    const nextPragmaPos = lastPragma.startPos + nextPragmaMatch.index + backslashOffset
    if (nextPragmaPos < endPos) {
      endPos = nextPragmaPos
    }
  }

  // Check if pos is within this pragma block
  if (pos <= endPos) {
    return { name: lastPragma.name, type: lastPragma.type, params: lastPragma.params, from: lastPragma.startPos, to: endPos }
  }

  return null
}

/**
 * Substituted parameter completion source
 * Offers parameter completions when inside a pragma block for specialized syntaxes:
 * - <<__param__>> for substituted parameter in macro call (all pragma types)
 * - <__param__> for substituted parameter in filter (all pragma types)
 * - $param$ for placeholder syntax (only \define macros - legacy syntax)
 * - $(param)$ for variable substitution (all pragma types)
 *
 * Note: <<param>> and <param> are handled by macroCompletion which merges them
 * with macro/variable completions.
 */
export function substitutedParamCompletion() {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 50), pos)

    // Check for <<__ pattern (substituted macro param) - most specific, check first
    const macroSubstMatch = /<<__[\w]*$/.exec(textBefore)

    // Check for <__ pattern (substituted filter param) - but not <<__
    let filterSubstMatch: RegExpExecArray | null = null
    if (!macroSubstMatch) {
      filterSubstMatch = /<__[\w]*$/.exec(textBefore)
    }

    // Check for $( pattern (variable substitution syntax) - $(param)$
    let varSubstMatch: RegExpExecArray | null = null
    if (!macroSubstMatch && !filterSubstMatch) {
      varSubstMatch = /\$\([\w]*$/.exec(textBefore)
    }

    // Check for $param$ placeholder pattern (only valid in \define blocks)
    let placeholderMatch: RegExpExecArray | null = null
    if (!macroSubstMatch && !filterSubstMatch && !varSubstMatch) {
      // Match $ followed by at least one word char (to avoid triggering on $( $: $$)
      placeholderMatch = /\$[\w]+$/.exec(textBefore)
    }

    const m = macroSubstMatch || filterSubstMatch || varSubstMatch || placeholderMatch
    if (!m) return null

    const syntaxType = macroSubstMatch ? "macroSubst"
      : filterSubstMatch ? "filterSubst"
      : varSubstMatch ? "varsubst"
      : "placeholder"

    // Check we're not in a code block
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

    // Find the enclosing pragma
    const docText = state.doc.toString()
    const enclosingPragma = findEnclosingPragma(docText, pos)

    // $(variable)$ substitution is ONLY valid in \define blocks
    if (syntaxType === "varsubst") {
      if (!enclosingPragma || enclosingPragma.type !== "define") {
        return null
      }
    }

    // $param$ placeholder syntax is only valid in \define blocks (legacy macro syntax)
    // \procedure, \function, and \widget use <<__param__>> and <__param__> instead
    if (syntaxType === "placeholder" && (!enclosingPragma || enclosingPragma.type !== "define")) {
      return null
    }

    // For <<__param__>> and <__param__>, need an enclosing pragma with parameters
    if ((syntaxType === "macroSubst" || syntaxType === "filterSubst") &&
        (!enclosingPragma || enclosingPragma.params.length === 0)) {
      return null
    }

    let options: Completion[]

    if (syntaxType === "macroSubst") {
      options = enclosingPragma!.params.map(param => ({
        label: "<<__" + param + "__>>",
        type: "variable",
        detail: "parameter",
        boost: 10
      }))
    } else if (syntaxType === "filterSubst") {
      options = enclosingPragma!.params.map(param => ({
        label: "<__" + param + "__>",
        type: "variable",
        detail: "parameter",
        boost: 10
      }))
    } else if (syntaxType === "varsubst") {
      // Variable substitution syntax $(variable)$ - only valid in \define blocks
      // NOTE: $(variable)$ substitutes variables from OUTER scope (at call site),
      // NOT the current macro's parameters (use $param$ for those)
      options = []
      const seen = new Set<string>()

      // Exclude the current \define's own name and parameters
      const currentDefName = enclosingPragma!.name
      seen.add(currentDefName)
      for (const param of enclosingPragma!.params) {
        seen.add(param)
      }

      // Helper to create varsubst completion with proper apply function
      // that removes trailing )$ or ) that was auto-inserted
      const makeVarsubstCompletion = (name: string, detail: string, boost: number): Completion => ({
        label: "$(" + name + ")$",
        type: "variable",
        detail,
        boost,
        apply: (view: any, _completion: any, from: any, to: any) => {
          // Check what's after the cursor - remove auto-inserted )$ or )
          const textAfter = view.state.sliceDoc(to, to + 2)
          let adjustedTo = to
          if (textAfter === ")$") {
            adjustedTo = to + 2
          } else if (textAfter[0] === ")") {
            adjustedTo = to + 1
          }
          view.dispatch({
            changes: { from, to: adjustedTo, insert: "$(" + name + ")$" },
            selection: { anchor: from + name.length + 4 } // After )$
          })
        }
      })

      // Variables from outer definitions (procedures, functions, macros, widgets)
      const localDefs = extractLocalDefinitions(docText)
      for (const name of localDefs.procedures) {
        if (!seen.has(name)) {
          seen.add(name)
          options.push(makeVarsubstCompletion(name, "procedure", 10))
        }
      }
      for (const name of localDefs.functions) {
        if (!seen.has(name)) {
          seen.add(name)
          options.push(makeVarsubstCompletion(name, "function", 10))
        }
      }
      for (const name of localDefs.macros) {
        if (!seen.has(name)) {
          seen.add(name)
          options.push(makeVarsubstCompletion(name, "macro", 10))
        }
      }

      // Built-in variables
      for (const name of builtInVariables) {
        if (!seen.has(name)) {
          seen.add(name)
          options.push(makeVarsubstCompletion(name, "built-in", 5))
        }
      }

      // Variables from call sites (from enclosing <$set>, <$let>, <$vars> widgets)
      const callSiteVars = getWidgetVariablesFromCallSites(
        enclosingPragma!.name,
        docText,
        enclosingPragma!.from,
        enclosingPragma!.to
      )
      for (const name of callSiteVars) {
        if (!seen.has(name)) {
          seen.add(name)
          options.push(makeVarsubstCompletion(name, "inherited", 8))
        }
      }
    } else {
      // placeholder syntax ($param$) - only for \define
      if (!enclosingPragma || enclosingPragma.params.length === 0) return null
      options = enclosingPragma.params.map(param => ({
        label: "$" + param + "$",
        type: "variable",
        detail: "parameter",
        boost: 10
      }))
    }

    if (options.length === 0) return null

    const validForPattern = syntaxType === "macroSubst" ? /^<<__[\w]*$/
      : syntaxType === "filterSubst" ? /^<__[\w]*$/
      : syntaxType === "varsubst" ? /^\$\([\w]*$/
      : /^\$[\w]*$/

    return {
      from: pos - m[0].length,
      to: pos,
      options,
      validFor: validForPattern
    }
  };
}

/**
 * Macro parameter value completion source
 * Offers ={{ and ={{{ options when cursor is right after `paramname=` inside a <<macro>> call.
 * This lets users discover the dynamic parameter value syntax.
 */
export function macroParamValueCompletion() {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const textBefore = state.sliceDoc(Math.max(0, pos - 200), pos)

    // Must be right after paramname= inside a macro call
    const paramEqMatch = /[\w\-]+=$/. exec(textBefore)
    if (!paramEqMatch) return null

    // Verify we're inside a <<macro ...>> call
    const macroCtxMatch = /<<[\w\-\.]+\s+/.exec(textBefore)
    if (!macroCtxMatch) return null

    // Check we're not in a code block
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

    const from = pos
    const patternLen = 0

    const options: Completion[] = [
      {
        label: "={{",
        type: "variable",
        detail: "transclusion",
        boost: 2,
        apply: (view: any, _completion: any, from: any, to: any) => {
          const insert = "{{}}"
          const cursorPos = from + 2
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos },
            effects: triggerCompletionEffect.of(null)
          })
        }
      },
      {
        label: "={{{",
        type: "variable",
        detail: "filtered transclusion",
        boost: 1,
        apply: (view: any, _completion: any, from: any, to: any) => {
          const insert = "{{{}}}"
          const cursorPos = from + 3
          const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos },
            effects: triggerCompletionEffect.of(null)
          })
        }
      }
    ]

    return {
      from,
      to: pos,
      options,
      validFor: /^$/
    };
  };
}
