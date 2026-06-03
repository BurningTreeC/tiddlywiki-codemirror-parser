/**
 * Code block completion source
 * Provides completions for fenced code blocks (```) and typed blocks ($$$)
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/autocomplete'. Did... Remove this comment to see the full error message
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { LanguageDescription } from "@codemirror/language"

/**
 * Check if cursor is on the closing line of a block (not opening)
 * Scans backward to count unclosed opening markers
 */
function isClosingLine(doc: any, lineNumber: number, marker: string): boolean {
  let openCount = 0
  const markerRegex = marker === "```"
    ? /^(\s*)```/
    : /^(\s*)\$\$\$/

  // Scan all lines before current line
  for (let i = 1; i < lineNumber; i++) {
    const line = doc.line(i)
    if (markerRegex.test(line.text)) {
      openCount++
    }
  }

  // If odd number of markers above, we're closing an open block
  return openCount % 2 === 1
}

/**
 * Create completion source for fenced code block language names
 * Triggers after ``` at the start of a line
 * Languages are discovered dynamically from registered language plugins
 */
export function fencedCodeCompletion(
  codeLanguages?: readonly LanguageDescription[] | ((info: string) => any)
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const pos = context.pos
    const line = context.state.doc.lineAt(pos)
    const textBefore = context.state.doc.sliceString(line.from, pos)

    // Check if we're after ``` at line start (with optional whitespace)
    const match = /^(\s*)```(\w*)$/.exec(textBefore)
    if (!match) return null

    // Don't show completions on closing line
    if (isClosingLine(context.state.doc, line.number, "```")) {
      return null
    }

    const indent = match[1]
    const partial = match[2]
    const from = line.from + indent.length + 3

    // Build options from registered language plugins only
    const seen = new Set<string>()
    const options: Completion[] = []

    // Only process if codeLanguages is an array (not a function)
    if (codeLanguages && Array.isArray(codeLanguages)) {
      for (const lang of codeLanguages) {
        const name = lang.name.toLowerCase()
        if (!seen.has(name)) {
          seen.add(name)
          options.push({
            label: name,
            type: "keyword",
            detail: "language",
            boost: 10
          })
        }
        // Also add aliases
        if (lang.alias) {
          for (const alias of lang.alias) {
            const aliasLower = alias.toLowerCase()
            if (!seen.has(aliasLower)) {
              seen.add(aliasLower)
              options.push({
                label: aliasLower,
                type: "keyword",
                detail: `language (${name})`,
                boost: 8
              })
            }
          }
        }
      }
    }

    if (options.length === 0) return null

    // Filter options to those matching the partial input
    // This ensures completions show even with single character input
    const lowerPartial = partial.toLowerCase()
    const filteredOptions = lowerPartial
      ? options.filter(opt => opt.label.toLowerCase().startsWith(lowerPartial))
      : options

    if (filteredOptions.length === 0) return null

    return {
      from,
      to: pos,
      options: filteredOptions,
      validFor: /^\w*$/
    }
  }
}

/**
 * Create completion source for typed block content types
 * Triggers after $$$ at the start of a line
 *
 * TiddlyWiki typed blocks can specify:
 * - MIME types: application/javascript, text/html, image/svg+xml
 * - File extensions: .svg, .js, .css
 */
export function typedBlockCompletion(
  getTypeNames?: () => string[],
  getFileExtensions?: () => string[]
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const pos = context.pos
    const line = context.state.doc.lineAt(pos)
    const textBefore = context.state.doc.sliceString(line.from, pos)

    // Check if we're after $$$ at line start (with optional whitespace)
    const match = /^(\s*)\$\$\$([\w\/\-\.\+]*)$/.exec(textBefore)
    if (!match) return null

    // Don't show completions on closing line
    if (isClosingLine(context.state.doc, line.number, "$$$")) {
      return null
    }

    const indent = match[1]
    const from = line.from + indent.length + 3

    const options: Completion[] = []
    const seen = new Set<string>()

    // Add MIME types from callback
    if (getTypeNames) {
      const types = getTypeNames()
      for (const type of types) {
        if (!seen.has(type)) {
          seen.add(type)
          options.push({
            label: type,
            type: "type",
            detail: "content type",
            boost: 10
          })
        }
      }
    }

    // Add file extensions from callback
    if (getFileExtensions) {
      const extensions = getFileExtensions()
      for (const ext of extensions) {
        // Ensure extension starts with dot
        const label = ext.startsWith(".") ? ext : "." + ext
        if (!seen.has(label)) {
          seen.add(label)
          options.push({
            label: label,
            type: "type",
            detail: "file extension",
            boost: 8
          })
        }
      }
    }

    if (options.length === 0) return null

    return {
      from,
      to: pos,
      options,
      validFor: /^[\w\/\-\.\+]*$/
    }
  }
}
