/**
 * Styled span and style attribute completion sources
 *
 * Provides CSS class name and property completions inside:
 * - TiddlyWiki styled spans (@@...@@)
 * - HTML/widget style attributes (style="...")
 *
 * Data is sourced from the lang-css plugin via callback functions.
 */

import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import { syntaxTree } from "@codemirror/language"

/**
 * Get content inside a style attribute (style="...")
 * Returns null if not in a style attribute context
 *
 * For widgets, checks if the widget supports the style attribute using getWidgetAttributes.
 * HTML tags always support style (it's a global attribute).
 *
 * @param context The completion context
 * @param getWidgetAttributes Optional callback to get widget attributes
 */
function getStyleAttributeContent(
  context: CompletionContext,
  getWidgetAttributes?: (widgetName: string) => string[] | null
): string | null {
  const tree = syntaxTree(context.state)
  let node = tree.resolveInner(context.pos, -1)

  // Walk up to find AttributeString
  let current = node
  while (current && !current.type.isTop) {
    if (current.name === "AttributeString") {
      // Check if this is a style attribute
      const attrParent = current.parent
      if (attrParent?.name === "Attribute") {
        const attrNameNode = attrParent.getChild("AttributeName")
        if (attrNameNode) {
          const attrName = context.state.doc.sliceString(attrNameNode.from, attrNameNode.to)
          if (attrName === "style") {
            // Check if we're in a widget or HTML tag
            const elementParent = attrParent.parent
            if (elementParent) {
              // Widget: check if it supports style attribute
              if (elementParent.name === "Widget" || elementParent.name === "InlineWidget") {
                const widgetNameNode = elementParent.getChild("WidgetName")
                if (widgetNameNode && getWidgetAttributes) {
                  const widgetName = context.state.doc.sliceString(widgetNameNode.from, widgetNameNode.to)
                  const attrs = getWidgetAttributes(widgetName)
                  // If we can't get attributes or style is not in the list, don't complete
                  if (attrs && !attrs.includes("style")) {
                    return null
                  }
                }
              }
              // HTML tags always support style (global attribute) - no check needed
            }

            // Get content inside quotes (skip opening quote)
            const content = context.state.doc.sliceString(current.from + 1, context.pos)
            return content
          }
        }
      }
      return null
    }
    current = current.parent!
  }

  // Text-based fallback: look for style=" pattern before cursor
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = context.state.doc.sliceString(line.from, context.pos)

  // Match style="content (without closing quote yet)
  // Also need to check if we're in a widget that supports style
  const styleMatch = /style=["']([^"']*)$/.exec(textBefore)
  if (styleMatch) {
    // Check for widget context - look for <$widgetName pattern before style=
    const widgetMatch = /<(\$[a-zA-Z][a-zA-Z0-9-]*)[^>]*style=["'][^"']*$/.exec(textBefore)
    if (widgetMatch && getWidgetAttributes) {
      const widgetName = widgetMatch[1]
      const attrs = getWidgetAttributes(widgetName)
      if (attrs && !attrs.includes("style")) {
        return null
      }
    }
    return styleMatch[1]
  }

  return null
}

/**
 * Get the content after @@ for styled span completion context
 * Returns null if not in a valid styled span context
 *
 * Uses parse tree when available, falls back to text detection for incomplete structures
 */
function getStyledSpanContent(context: CompletionContext): string | null {
  const tree = syntaxTree(context.state)
  let node = tree.resolveInner(context.pos, -1)

  // First try: Find Highlight or StyledBlock node in parse tree
  let current = node
  while (current && !current.type.isTop) {
    if (current.name === "Highlight" || current.name === "StyledBlock") {
      // Get the start of content (after opening @@)
      const nodeText = context.state.doc.sliceString(current.from, context.pos)
      // Skip the opening @@
      if (nodeText.startsWith("@@")) {
        return nodeText.slice(2)
      }
      return null
    }
    current = current.parent!
  }

  // Second try: Text-based detection for incomplete structures
  // This handles cases like typing "@@b" before the parser recognizes it
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = context.state.doc.sliceString(line.from, context.pos)

  // Check if current line starts with @@ (potential block styled span)
  if (textBefore.startsWith("@@")) {
    // Make sure there's no closing @@ on this line after our position
    const textAfter = context.state.doc.sliceString(context.pos, line.to)
    // If there's a closing @@ after cursor, we might be outside - check carefully
    if (textAfter.includes("@@")) {
      // There's a @@ after cursor - this could be inline closing
      // For inline: @@content@@ - if we're between the @@s, we're inside
      const fullLine = context.state.doc.sliceString(line.from, line.to)
      const firstAt = fullLine.indexOf("@@")
      const secondAt = fullLine.indexOf("@@", firstAt + 2)
      if (secondAt !== -1) {
        // There are two @@ on this line
        const posInLine = context.pos - line.from
        if (posInLine > firstAt + 2 && posInLine <= secondAt) {
          // We're between opening and closing @@ - return content
          return textBefore.slice(2)
        }
        // We're after the closing @@
        return null
      }
    }
    // No closing @@ after cursor on this line - we're in a block or incomplete inline
    return textBefore.slice(2)
  }

  // Check if we're on a continuation line of a block styled span
  // Look backwards for a line starting with @@ without a closing @@
  let lineNum = line.number - 1
  while (lineNum >= 1) {
    const prevLine = context.state.doc.line(lineNum)
    const prevText = prevLine.text

    // Found closing @@ - we're not in a styled block
    if (prevText.trim() === "@@") {
      return null
    }

    // Found opening @@ at start of line
    if (prevText.startsWith("@@")) {
      // Check if it's a block opener (no closing @@ on same line, or @@ is alone)
      const afterOpening = prevText.slice(2)
      if (!afterOpening.includes("@@")) {
        // This is a block opener - we're inside it
        // Return content from opening line + current line content
        // For simplicity, just return current line's text for property/class matching
        return textBefore
      }
      // It's an inline styled span - not inside
      return null
    }

    lineNum--
  }

  return null
}

/**
 * Create a completion source for CSS classes in styled spans
 *
 * Detects patterns like:
 * - @@.tc-        (class at start)
 * - @@color:red;.tc-  (class after styles)
 * - @@.foo.tc-   (additional class)
 *
 * @param getPageClasses Function that returns available CSS class names
 */
export function styledSpanClassCompletion(getPageClasses?: () => string[]) {
  return function(context: CompletionContext): CompletionResult | null {
    if (!getPageClasses) return null

    // Must be inside a styled span (Highlight or StyledBlock node)
    const content = getStyledSpanContent(context)
    if (content === null) return null

    // Match class pattern: .partialClassName at end
    const classMatch = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)?$/.exec(content)
    if (!classMatch) return null

    const partial = classMatch[1] || ""
    const from = context.pos - partial.length

    // Get available classes
    const pageClasses = getPageClasses()
    if (!pageClasses || pageClasses.length === 0) return null

    // Filter classes that match the prefix (case-insensitive)
    const lowerPartial = partial.toLowerCase()
    const matchingClasses = pageClasses.filter(cls =>
      cls.toLowerCase().startsWith(lowerPartial)
    )

    if (matchingClasses.length === 0) return null

    const options: Completion[] = matchingClasses.map(cls => ({
      label: cls,
      type: "class",
      detail: "CSS class"
    }))

    return {
      from,
      to: context.pos,
      options,
      validFor: /^[a-zA-Z_-][a-zA-Z0-9_-]*$/
    }
  }
}

/**
 * Create a completion source for CSS properties in styled spans and style attributes
 *
 * Detects patterns like:
 * - @@back        (property at start of styled span)
 * - @@color:red;back  (property after other styles)
 * - style="back   (property in style attribute)
 * - style="color:red;back  (property after other styles in attribute)
 *
 * Does NOT trigger when:
 * - After a dot (that's class completion, styled spans only)
 * - After a colon (that's value completion, handled by CSS parser)
 * - In a widget that doesn't support the style attribute
 *
 * @param getCSSProperties Function that returns available CSS property names
 * @param getWidgetAttributes Function to get widget attributes (to check if style is supported)
 */
export function styledSpanPropertyCompletion(
  getCSSProperties?: () => string[],
  getWidgetAttributes?: (widgetName: string) => string[] | null
) {
  return function(context: CompletionContext): CompletionResult | null {
    if (!getCSSProperties) return null

    // Try styled span first, then style attribute
    let content = getStyledSpanContent(context)
    const isStyledSpan = content !== null

    if (content === null) {
      content = getStyleAttributeContent(context, getWidgetAttributes)
    }

    if (content === null) return null

    // Don't complete if we're after a dot (class context - styled spans only)
    if (isStyledSpan && /\.[a-zA-Z_-]*$/.test(content)) return null

    // Don't complete if we're after a colon (value context)
    // But do complete after semicolon (new property)
    if (/:[^;]*$/.test(content)) return null

    // Match property name being typed
    // Either at start, or after a semicolon
    const propMatch = /(?:^|;)\s*([a-zA-Z-]*)$/.exec(content)
    if (!propMatch) return null

    const partial = propMatch[1]
    const from = context.pos - partial.length

    // Get available properties
    const cssProperties = getCSSProperties()
    if (!cssProperties || cssProperties.length === 0) return null

    // Filter properties that match
    const lowerPartial = partial.toLowerCase()
    const matchingProps = cssProperties.filter(prop =>
      prop.toLowerCase().startsWith(lowerPartial)
    )

    if (matchingProps.length === 0) return null

    const options: Completion[] = matchingProps.map(prop => ({
      label: prop,
      type: "property",
      detail: "CSS property",
      apply: (view, _completion, from, to) => {
        const textAfter = view.state.sliceDoc(to, to + 1)
        const suffix = textAfter === ":" ? "" : ":"
        view.dispatch({
          changes: { from, to, insert: prop + suffix },
          selection: { anchor: from + prop.length + 1 }
        })
      }
    }))

    return {
      from,
      to: context.pos,
      options,
      validFor: /^[a-zA-Z-]*$/
    }
  }
}
