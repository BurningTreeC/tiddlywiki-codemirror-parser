/**
 * TiddlyWiki Linter
 *
 * Provides lint diagnostics for TiddlyWiki wikitext.
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { syntaxTree } from "@codemirror/language"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/lint'. Did you mea... Remove this comment to see the full error message
import { Diagnostic, linter } from "@codemirror/lint"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/view'. Did you mea... Remove this comment to see the full error message
import { EditorView } from "@codemirror/view"
// @ts-expect-error TS(2792): Cannot find module '@lezer/common'. Did you mean t... Remove this comment to see the full error message
import type { SyntaxNode } from "@lezer/common"

/**
 * All definition types (for general iteration)
 */
const definitionTypes = new Set([
  "MacroDefinition",
  "ProcedureDefinition",
  "FunctionDefinition",
  "WidgetDefinition",
])

/**
 * Definition types that can have __param__ substitutions (\define only)
 * Note: \procedure, \function, and \widget should use regular variable access instead
 */
const substitutionValidTypes = new Set([
  "MacroDefinition",
])

/**
 * Definition types that can have $param$ placeholders (only \define)
 */
const macroDefinitionTypes = new Set([
  "MacroDefinition",
])

/**
 * Built-in variables that are always available and should never be flagged as undefined.
 * These are core TiddlyWiki variables that are always in scope.
 */
const builtInVariables = new Set([
  "currentTiddler",
  "storyTiddler",
  "transclusion",
])

/**
 * Map of widgets to the implicit variables they provide within their action attributes.
 * These variables are available in the scope of the action content and passed to
 * sub-macro-calls (<$macrocall>) and sub-transclusions (<$transclude>).
 * Patterns ending with "*" are wildcards (e.g., "dom-*" matches "dom-x", "dom-clientX", etc.)
 *
 * Based on actual TiddlyWiki widget source code - see core/modules/widgets/*.js
 */
export const ACTION_IMPLICIT_VARIABLES: Record<string, string[]> = {
  // Drag and drop widgets (see droppable.js, draggable.js)
  "$droppable": ["actionTiddler", "actionTiddlerList", "modifier"],
  "$dropzone": ["actionTiddler", "actionTiddlerList", "modifier"],
  "$draggable": ["actionTiddler"],

  // Form widgets (see button.js, checkbox.js, radio.js, select.js, range.js)
  // $button only provides variables when using selector attribute (collectDOMVariables)
  "$button": ["modifier"],
  // $checkbox does NOT pass any variables to invokeActionString
  // $radio passes actionValue
  "$radio": ["actionValue"],
  // $select does NOT pass any variables to invokeActionString
  // $range passes actionValue and actionValueHasChanged
  "$range": ["actionValue", "actionValueHasChanged"],

  // Event handling widgets (see linkcatcher.js, messagecatcher.js, eventcatcher.js, keyboard.js)
  "$linkcatcher": ["navigateTo", "modifier"],
  "$messagecatcher": ["modifier", "event-*", "event-paramObject-*", "list-event", "list-event-paramObject"],
  "$eventcatcher": [
    "dom-*",  // All DOM attributes with dom- prefix (from collectDOMVariables)
    "modifier",
    "event-mousebutton",
    "event-type",
    "event-detail-*",  // Properties in event.detail with event-detail- prefix
    "tv-popup-coords",
    "tv-popup-abs-coords",
    "tv-widgetnode-width",
    "tv-widgetnode-height",
    "tv-selectednode-posx",
    "tv-selectednode-posy",
    "tv-selectednode-width",
    "tv-selectednode-height",
    "event-fromselected-posx",
    "event-fromselected-posy",
    "event-fromcatcher-posx",
    "event-fromcatcher-posy",
    "event-fromviewport-posx",
    "event-fromviewport-posy",
  ],
  "$keyboard": ["modifier", "event-key-descriptor"],
}

/**
 * Map of widgets to their action attribute names.
 * These are the attributes where implicit action variables are available.
 * Only includes widgets that actually provide implicit variables.
 */
export const ACTION_ATTRIBUTE_NAMES: Record<string, string[]> = {
  "$droppable": ["actions"],
  "$dropzone": ["actions"],
  "$draggable": ["startactions", "endactions"],
  "$button": ["actions"],
  "$radio": ["actions"],
  "$range": ["actions", "actionsStart", "actionsStop"],
  "$linkcatcher": ["actions"],
  "$messagecatcher": ["actions"],
  "$eventcatcher": [
    // New $event syntax
    "$click", "$dblclick", "$contextmenu",
    "$mousedown", "$mouseup", "$mouseover", "$mouseout", "$mouseenter", "$mouseleave", "$mousemove",
    "$pointerdown", "$pointerup", "$pointermove", "$pointerover", "$pointerout", "$pointerenter", "$pointerleave", "$pointercancel",
    "$dragstart", "$dragend", "$dragenter", "$dragleave", "$dragover", "$drop", "$drag",
    "$focusin", "$focusout", "$focus", "$blur",
    "$keydown", "$keyup", "$keypress",
    "$input", "$change", "$submit",
    "$touchstart", "$touchend", "$touchmove", "$touchcancel",
    "$wheel", "$scroll",
    // Legacy actions-event syntax
    "actions-click", "actions-dblclick", "actions-contextmenu",
    "actions-mousedown", "actions-mouseup", "actions-mouseover", "actions-mouseout",
    "actions-focusin", "actions-focusout",
    "actions-keydown", "actions-keyup",
    "actions-input", "actions-change",
    "actions-dragstart", "actions-dragend", "actions-dragenter", "actions-dragleave", "actions-dragover", "actions-drop",
    "actions-pointerdown", "actions-pointerup", "actions-pointermove", "actions-pointerover", "actions-pointerout", "actions-pointerenter", "actions-pointerleave", "actions-pointercancel"
  ],
  "$keyboard": ["actions"],
}

/**
 * Get the widget name from a Widget node by finding its WidgetName child.
 */
function getWidgetName(widgetNode: SyntaxNode, doc: string): string | null {
  let child = widgetNode.firstChild
  while (child) {
    if (child.name === "WidgetName") {
      return doc.slice(child.from, child.to)
    }
    child = child.nextSibling
  }
  return null
}

/**
 * Get the attribute name from an Attribute node by finding its AttributeName child.
 */
function getAttributeName(attrNode: SyntaxNode, doc: string): string | null {
  let child = attrNode.firstChild
  while (child) {
    if (child.name === "AttributeName") {
      return doc.slice(child.from, child.to)
    }
    child = child.nextSibling
  }
  return null
}

/**
 * Check if a variable name matches a wildcard pattern.
 * Patterns use "*" as a suffix wildcard (e.g., "dom-*" matches "dom-x", "dom-clientX").
 */
export function matchesWildcardPattern(varName: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1)
    return varName.startsWith(prefix)
  }
  return varName === pattern
}

/**
 * Result of checking action context - contains both exact variables and wildcard patterns.
 */
export interface ActionContextVariables {
  variables: string[]
  patterns: string[]  // Wildcard patterns like "dom-*"
}

/**
 * Get the action implicit variables available at a given node position.
 * Walks up the tree to find ALL enclosing action attributes of widgets.
 * Variables are accumulated because in TiddlyWiki, action variables from outer
 * widgets are inherited by nested widgets within the action string.
 */
export function getActionContextVariables(node: SyntaxNode, doc: string): ActionContextVariables {
  const result: ActionContextVariables = {
    variables: [],
    patterns: []
  }
  const seenVariables = new Set<string>()
  const seenPatterns = new Set<string>()

  // Walk up looking for Attribute nodes - accumulate ALL action contexts
  let current: SyntaxNode | null = node
  while (current) {
    // If we hit an attribute node, check if it's an action attribute
    if (current.name === "Attribute") {
      const attrName = getAttributeName(current, doc)
      if (attrName) {
        // Find the parent widget
        let parent = current.parent
        while (parent) {
          if (parent.name === "Widget" || parent.name === "InlineWidget") {
            const widgetName = getWidgetName(parent, doc)
            if (widgetName) {
              // Check if this attribute is an action attribute for this widget
              const actionAttrs = ACTION_ATTRIBUTE_NAMES[widgetName]
              if (actionAttrs && actionAttrs.includes(attrName)) {
                // Get the implicit variables for this widget
                const implicitVars = ACTION_IMPLICIT_VARIABLES[widgetName]
                if (implicitVars) {
                  for (const v of implicitVars) {
                    if (v.includes("*")) {
                      if (!seenPatterns.has(v)) {
                        seenPatterns.add(v)
                        result.patterns.push(v)
                      }
                    } else {
                      if (!seenVariables.has(v)) {
                        seenVariables.add(v)
                        result.variables.push(v)
                      }
                    }
                  }
                }
                // Don't return - continue walking up to find more action contexts
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

  return result
}

/**
 * Check if a variable name is available in the action context.
 */
export function isActionContextVariable(varName: string, context: ActionContextVariables): boolean {
  if (context.variables.includes(varName)) {
    return true
  }
  for (const pattern of context.patterns) {
    if (matchesWildcardPattern(varName, pattern)) {
      return true
    }
  }
  return false
}

/**
 * Extract parameter names from a single definition node.
 * Parameters can be in:
 * - PragmaParams nodes (for \define, \procedure, \function, \widget pragmas)
 * - MacroParam/MacroParamName nodes (for other contexts)
 */
function extractParameterNamesFromNode(defNode: SyntaxNode, doc: string): Set<string> {
  const params = new Set<string>()

  // Walk direct children looking for parameter nodes
  let child = defNode.firstChild
  while (child) {
    if (child.name === "PragmaParams") {
      // PragmaParams contains the parameter text like "name" or " name:default"
      // Extract just the parameter name (before any : default value)
      const paramText = doc.slice(child.from, child.to).trim()
      // Parse parameter: could be "name" or "name:default" or "name:\"default\""
      const colonIdx = paramText.indexOf(":")
      const paramName = colonIdx >= 0 ? paramText.slice(0, colonIdx).trim() : paramText
      if (paramName) {
        params.add(paramName)
      }
    } else if (child.name === "MacroParamName") {
      const paramName = doc.slice(child.from, child.to)
      params.add(paramName)
    } else if (child.name === "MacroParam") {
      // MacroParamName is inside MacroParam
      let inner = child.firstChild
      while (inner) {
        if (inner.name === "MacroParamName") {
          const paramName = doc.slice(inner.from, inner.to)
          params.add(paramName)
        }
        inner = inner.nextSibling
      }
    }
    child = child.nextSibling
  }

  return params
}

/**
 * Extract parameter names from a definition node AND all its ancestor definitions.
 * In TiddlyWiki, variables are inherited through the widget prototype chain,
 * so parameters from outer pragmas are accessible in inner pragmas.
 */
function extractParameterNames(defNode: SyntaxNode, doc: string): Set<string> {
  const params = new Set<string>()

  // First, get parameters from this node
  const ownParams = extractParameterNamesFromNode(defNode, doc)
  for (const p of ownParams) {
    params.add(p)
  }

  // Then, walk up the ancestor chain and collect parameters from enclosing pragmas
  let ancestor = defNode.parent
  while (ancestor) {
    if (definitionTypes.has(ancestor.name)) {
      const ancestorParams = extractParameterNamesFromNode(ancestor, doc)
      for (const p of ancestorParams) {
        params.add(p)
      }
    }
    ancestor = ancestor.parent
  }

  return params
}

/**
 * Find all SubstitutedParam nodes within a definition and validate them.
 * Skips nested definitions (they'll be handled separately with their own parameters).
 */
function validateSubstitutedParams(
  defNode: SyntaxNode,
  validParams: Set<string>,
  doc: string,
  diagnostics: Diagnostic[]
): void {
  // Use a stack-based traversal to find all SubstitutedParam nodes
  const stack: SyntaxNode[] = []
  let node = defNode.firstChild

  while (node) {
    // Skip nested definitions - they'll be handled separately with inherited params
    if (definitionTypes.has(node.name)) {
      if (node.nextSibling) {
        node = node.nextSibling
      } else {
        node = null
        while (stack.length > 0) {
          const parent = stack.pop()!
          if (parent.nextSibling) {
            node = parent.nextSibling
            break
          }
        }
      }
      continue
    }

    if (node.name === "SubstitutedParam") {
      // Find the SubstitutedParamName child
      let paramNameNode = node.firstChild
      while (paramNameNode) {
        if (paramNameNode.name === "SubstitutedParamName") {
          const paramName = doc.slice(paramNameNode.from, paramNameNode.to)
          if (!validParams.has(paramName) && !builtInVariables.has(paramName)) {
            diagnostics.push({
              from: node.from,
              to: node.to,
              severity: "error",
              message: `Unknown parameter "${paramName}". Available parameters: ${
                validParams.size > 0 ? Array.from(validParams).join(", ") : "(none)"
              }`,
            })
          }
          break
        }
        paramNameNode = paramNameNode.nextSibling
      }
    }

    // Traverse children
    if (node.firstChild) {
      stack.push(node)
      node = node.firstChild
    } else if (node.nextSibling) {
      node = node.nextSibling
    } else {
      // Go back up and find next sibling
      node = null
      while (stack.length > 0) {
        const parent = stack.pop()!
        if (parent.nextSibling) {
          node = parent.nextSibling
          break
        }
      }
    }
  }
}

/**
 * Find SubstitutedParam nodes that are NOT inside any definition (always invalid).
 */
function findOrphanedSubstitutedParams(
  tree: SyntaxNode,
  defRanges: Array<{ from: number; to: number }>,
  doc: string,
  diagnostics: Diagnostic[]
): void {
  const stack: SyntaxNode[] = []
  let node = tree.firstChild

  while (node) {
    if (node.name === "SubstitutedParam") {
      // Check if this node is inside any definition
      const isInDefinition = defRanges.some(
        (range) => node!.from >= range.from && node!.to <= range.to
      )

      if (!isInDefinition) {
        // Find the param name for the error message
        let paramName = "?"
        let paramNameNode = node.firstChild
        while (paramNameNode) {
          if (paramNameNode.name === "SubstitutedParamName") {
            paramName = doc.slice(paramNameNode.from, paramNameNode.to)
            break
          }
          paramNameNode = paramNameNode.nextSibling
        }

        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message: `Parameter substitution "__${paramName}__" is only valid inside \\define macros`,
        })
      }
    }

    // Traverse children (skip definition bodies since we handle those separately)
    if (node.firstChild && !definitionTypes.has(node.name)) {
      stack.push(node)
      node = node.firstChild
    } else if (node.nextSibling) {
      node = node.nextSibling
    } else {
      node = null
      while (stack.length > 0) {
        const parent = stack.pop()!
        if (parent.nextSibling) {
          node = parent.nextSibling
          break
        }
      }
    }
  }
}

/**
 * Find all Placeholder ($param$) nodes within a macro definition and validate them.
 * Skips nested definitions (they'll be handled separately with their own parameters).
 */
function validatePlaceholders(
  defNode: SyntaxNode,
  validParams: Set<string>,
  doc: string,
  diagnostics: Diagnostic[]
): void {
  const stack: SyntaxNode[] = []
  let node = defNode.firstChild

  while (node) {
    // Skip nested definitions - they'll be handled separately with inherited params
    if (definitionTypes.has(node.name)) {
      if (node.nextSibling) {
        node = node.nextSibling
      } else {
        node = null
        while (stack.length > 0) {
          const parent = stack.pop()!
          if (parent.nextSibling) {
            node = parent.nextSibling
            break
          }
        }
      }
      continue
    }

    if (node.name === "Placeholder") {
      // Find the VariableName child (the parameter name)
      let paramNameNode = node.firstChild
      while (paramNameNode) {
        if (paramNameNode.name === "VariableName") {
          const paramName = doc.slice(paramNameNode.from, paramNameNode.to)
          if (!validParams.has(paramName) && !builtInVariables.has(paramName)) {
            diagnostics.push({
              from: node.from,
              to: node.to,
              severity: "error",
              message: `Unknown parameter "$${paramName}$". Available parameters: ${
                validParams.size > 0 ? Array.from(validParams).join(", ") : "(none)"
              }`,
            })
          }
          break
        }
        paramNameNode = paramNameNode.nextSibling
      }
    }

    // Traverse children
    if (node.firstChild) {
      stack.push(node)
      node = node.firstChild
    } else if (node.nextSibling) {
      node = node.nextSibling
    } else {
      node = null
      while (stack.length > 0) {
        const parent = stack.pop()!
        if (parent.nextSibling) {
          node = parent.nextSibling
          break
        }
      }
    }
  }
}

/**
 * Find Placeholder ($param$) nodes that are NOT inside a \define (always invalid).
 * $param$ is only valid in \define, not in \procedure, \function, or \widget.
 */
function findOrphanedPlaceholders(
  tree: SyntaxNode,
  macroDefRanges: Array<{ from: number; to: number }>,
  doc: string,
  diagnostics: Diagnostic[]
): void {
  const stack: SyntaxNode[] = []
  let node = tree.firstChild

  while (node) {
    if (node.name === "Placeholder") {
      // Check if this node is inside a macro definition (\define only)
      const isInMacroDef = macroDefRanges.some(
        (range) => node!.from >= range.from && node!.to <= range.to
      )

      if (!isInMacroDef) {
        // Find the param name for the error message
        let paramName = "?"
        let paramNameNode = node.firstChild
        while (paramNameNode) {
          if (paramNameNode.name === "VariableName") {
            paramName = doc.slice(paramNameNode.from, paramNameNode.to)
            break
          }
          paramNameNode = paramNameNode.nextSibling
        }

        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message: `Parameter placeholder "$${paramName}$" is only valid inside \\define macros (not \\procedure, \\function, or \\widget)`,
        })
      }
    }

    // Traverse children (skip macro definitions since we handle those separately)
    if (node.firstChild && !macroDefinitionTypes.has(node.name)) {
      stack.push(node)
      node = node.firstChild
    } else if (node.nextSibling) {
      node = node.nextSibling
    } else {
      node = null
      while (stack.length > 0) {
        const parent = stack.pop()!
        if (parent.nextSibling) {
          node = parent.nextSibling
          break
        }
      }
    }
  }
}

/**
 * Warn about SubstitutedParam usage in definitions that don't support it.
 * \procedure and \function should use regular variable access (<<param>>) instead of <<__param__>>.
 * Skips nested definitions (they'll be handled separately).
 */
function warnSubstitutedParamsInWrongContext(
  defNode: SyntaxNode,
  defType: string,
  doc: string,
  diagnostics: Diagnostic[]
): void {
  const stack: SyntaxNode[] = []
  let node = defNode.firstChild

  // Get the pragma name for the error message
  const pragmaName = defType === "ProcedureDefinition" ? "\\procedure"
    : defType === "FunctionDefinition" ? "\\function"
    : "\\widget"

  while (node) {
    // Skip nested definitions - they'll be handled separately
    if (definitionTypes.has(node.name)) {
      if (node.nextSibling) {
        node = node.nextSibling
      } else {
        node = null
        while (stack.length > 0) {
          const parent = stack.pop()!
          if (parent.nextSibling) {
            node = parent.nextSibling
            break
          }
        }
      }
      continue
    }

    if (node.name === "SubstitutedParam") {
      // Find the SubstitutedParamName child for the error message
      let paramName = "?"
      let paramNameNode = node.firstChild
      while (paramNameNode) {
        if (paramNameNode.name === "SubstitutedParamName") {
          paramName = doc.slice(paramNameNode.from, paramNameNode.to)
          break
        }
        paramNameNode = paramNameNode.nextSibling
      }

      diagnostics.push({
        from: node.from,
        to: node.to,
        severity: "warning",
        message: `Parameter substitution "__${paramName}__" is not recommended in ${pragmaName}. Use <<${paramName}>> instead.`,
      })
    }

    // Traverse children
    if (node.firstChild) {
      stack.push(node)
      node = node.firstChild
    } else if (node.nextSibling) {
      node = node.nextSibling
    } else {
      node = null
      while (stack.length > 0) {
        const parent = stack.pop()!
        if (parent.nextSibling) {
          node = parent.nextSibling
          break
        }
      }
    }
  }
}

/**
 * Lint function for TiddlyWiki parameter validation.
 */
function lintParameters(view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const tree = syntaxTree(view.state)
  const doc = view.state.doc.toString()

  // Track definition ranges for orphan detection
  const substitutionDefRanges: Array<{ from: number; to: number }> = []
  const macroDefRanges: Array<{ from: number; to: number }> = []

  // First pass: find all definitions and validate their parameters
  // Note: We let the iterator descend into definitions so nested definitions are also visited.
  // The validation functions skip nested definitions to avoid double-processing.
  tree.iterate({
    enter: (node: any) => {
      if (definitionTypes.has(node.name)) {
        const defNode = node.node

        // Extract parameter names (includes inherited params from ancestor definitions)
        const validParams = extractParameterNames(defNode, doc)

        // Check if this definition type allows __param__ substitutions
        if (substitutionValidTypes.has(node.name)) {
          substitutionDefRanges.push({ from: defNode.from, to: defNode.to })
          // Validate SubstitutedParams (__param__) within this definition
          validateSubstitutedParams(defNode, validParams, doc, diagnostics)
        } else {
          // For \procedure and \function, warn about any __param__ usage
          warnSubstitutedParamsInWrongContext(defNode, node.name, doc, diagnostics)
        }

        // For MacroDefinition only, also validate Placeholders ($param$)
        if (node.name === "MacroDefinition") {
          macroDefRanges.push({ from: defNode.from, to: defNode.to })
          validatePlaceholders(defNode, validParams, doc, diagnostics)
        }
      }
    },
  })

  // Second pass: find orphaned SubstitutedParams (outside any valid definition)
  findOrphanedSubstitutedParams(tree.topNode, substitutionDefRanges, doc, diagnostics)

  // Third pass: find orphaned Placeholders (outside \define)
  findOrphanedPlaceholders(tree.topNode, macroDefRanges, doc, diagnostics)

  return diagnostics
}

/**
 * CodeMirror linter extension for TiddlyWiki parameter validation.
 *
 * This linter checks that:
 * 1. `__param__` substitutions (in `<<__param__>>` or `<__param__>`) are only used
 *    inside \define macros (warns when used in \procedure, \function, or \widget)
 * 2. `$param$` placeholders are only used inside \define macros
 * 3. The parameter name matches an actual parameter of the surrounding definition
 */
export const substitutedParamLinter = linter(lintParameters)

/**
 * Combined TiddlyWiki linter (includes all lint checks).
 * Currently same as substitutedParamLinter - syntax checks are in the TiddlyWiki lint plugin.
 */
export const tiddlywikiLinter = linter(lintParameters)
