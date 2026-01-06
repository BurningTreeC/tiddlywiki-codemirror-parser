/**
 * TiddlyWiki Linter
 *
 * Provides lint diagnostics for TiddlyWiki wikitext.
 */

import { syntaxTree } from "@codemirror/language"
import { Diagnostic, linter } from "@codemirror/lint"
import { EditorView } from "@codemirror/view"
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
 * Extract parameter names from a definition node.
 * Parameters can be in:
 * - PragmaParams nodes (for \define, \procedure, \function, \widget pragmas)
 * - MacroParam/MacroParamName nodes (for other contexts)
 */
function extractParameterNames(defNode: SyntaxNode, doc: string): Set<string> {
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
 * Find all SubstitutedParam nodes within a definition and validate them.
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
  tree.iterate({
    enter: (node) => {
      if (definitionTypes.has(node.name)) {
        const defNode = node.node

        // Extract parameter names
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

        // Don't descend into this node again (we handle it manually)
        return false
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
 */
export const tiddlywikiLinter = linter(lintParameters)
