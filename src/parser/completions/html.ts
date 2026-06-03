/**
 * HTML tag and attribute completion sources
 */

// @ts-expect-error TS(2792): Cannot find module '@codemirror/language'. Did you... Remove this comment to see the full error message
import { syntaxTree } from "@codemirror/language"
// @ts-expect-error TS(2792): Cannot find module '@codemirror/autocomplete'. Did... Remove this comment to see the full error message
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import { selfClosingTags, buildMultiSelectionChanges, triggerCompletionEffect } from "./common"

// Common HTML tags for completion - comprehensive list of standard HTML5 tags
export const commonHtmlTags = [
  // Document structure
  "html", "head", "body", "title", "base",

  // Basic structure
  "div", "span", "p", "br", "hr",

  // Headings
  "h1", "h2", "h3", "h4", "h5", "h6",

  // Text semantics
  "a", "strong", "em", "b", "i", "u", "s", "small", "mark", "del", "ins",
  "sub", "sup", "abbr", "cite", "q", "blockquote",

  // Code and preformatted
  "code", "pre", "kbd", "samp", "var", "dfn",

  // Lists
  "ul", "ol", "li", "dl", "dt", "dd", "menu",

  // Tables
  "table", "tr", "td", "th", "thead", "tbody", "tfoot", "caption", "colgroup", "col",

  // Forms
  "form", "input", "button", "select", "option", "optgroup", "textarea",
  "label", "fieldset", "legend", "datalist", "output", "progress", "meter",

  // Interactive
  "details", "summary", "dialog",

  // Media and embedded content
  "img", "video", "audio", "source", "track", "picture",
  "iframe", "embed", "object", "param", "canvas", "svg",
  "figure", "figcaption", "map", "area",

  // HTML5 semantic sections
  "header", "footer", "nav", "main", "section", "article", "aside",
  "address", "time", "data", "template", "slot",

  // Document metadata and scripting
  "script", "style", "link", "meta", "noscript",

  // Ruby annotations (for East Asian typography)
  "ruby", "rt", "rp",

  // Text direction and isolation
  "bdi", "bdo", "wbr",

  // Deprecated but still commonly used
  "center",
]

// Common HTML global attributes
export const htmlGlobalAttributes = [
  "class", "id", "style", "title", "lang", "dir", "hidden", "tabindex",
  "accesskey", "contenteditable", "draggable", "spellcheck", "translate",
  "data-", "aria-", "role"
]

// Tag-specific attributes
export const htmlTagAttributes: Record<string, string[]> = {
  // Links
  a: ["href", "target", "rel", "download", "hreflang", "type"],

  // Images
  img: ["src", "alt", "width", "height", "loading", "srcset", "sizes", "usemap"],

  // Forms
  input: ["type", "name", "value", "placeholder", "required", "disabled", "readonly", "checked", "maxlength", "minlength", "pattern", "min", "max", "step", "list", "form", "autocomplete"],
  button: ["type", "disabled", "name", "value", "form"],
  form: ["action", "method", "enctype", "target", "autocomplete", "novalidate", "accept-charset"],
  label: ["for"],
  select: ["name", "multiple", "required", "disabled", "size", "form", "autocomplete"],
  option: ["value", "selected", "disabled", "label"],
  optgroup: ["label", "disabled"],
  textarea: ["name", "rows", "cols", "placeholder", "required", "disabled", "readonly", "maxlength", "minlength", "wrap", "form", "autocomplete"],
  fieldset: ["disabled", "form", "name"],
  datalist: [],
  output: ["for", "form", "name"],
  progress: ["value", "max"],
  meter: ["value", "min", "max", "low", "high", "optimum"],

  // Document metadata
  link: ["href", "rel", "type", "media", "sizes", "crossorigin", "integrity"],
  script: ["src", "type", "async", "defer", "crossorigin", "integrity", "nomodule"],
  meta: ["name", "content", "charset", "http-equiv"],
  base: ["href", "target"],
  style: ["media", "type"],

  // Media
  iframe: ["src", "width", "height", "frameborder", "allowfullscreen", "sandbox", "srcdoc", "loading", "allow", "name"],
  video: ["src", "width", "height", "controls", "autoplay", "loop", "muted", "poster", "preload", "crossorigin", "playsinline"],
  audio: ["src", "controls", "autoplay", "loop", "muted", "preload", "crossorigin"],
  source: ["src", "type", "media", "srcset", "sizes"],
  track: ["src", "kind", "srclang", "label", "default"],
  picture: [],
  embed: ["src", "type", "width", "height"],
  object: ["data", "type", "width", "height", "name", "usemap", "form"],
  param: ["name", "value"],
  canvas: ["width", "height"],

  // Tables
  table: ["border", "cellpadding", "cellspacing"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "headers", "scope", "abbr"],
  col: ["span"],
  colgroup: ["span"],

  // Image maps
  map: ["name"],
  area: ["href", "alt", "shape", "coords", "target", "download", "rel"],

  // Interactive
  details: ["open"],
  dialog: ["open"],

  // Text semantics
  time: ["datetime"],
  data: ["value"],
  abbr: ["title"],
  q: ["cite"],
  blockquote: ["cite"],
  del: ["cite", "datetime"],
  ins: ["cite", "datetime"],

  // Text direction
  bdo: ["dir"],

  // Empty attribute lists for tags with only global attributes
  div: [],
  span: [],
  p: [],
}

// ============================================================================
// Attribute cache - pre-compute merged tag+global attributes per tag
// ============================================================================

// Cache of merged attributes per tag (tag-specific + global)
const _tagAttributeCache: Record<string, string[]> = {}

/**
 * Get merged attributes for a tag (tag-specific + global).
 * Results are cached per tag to avoid repeated Set creation and spreading.
 */
function getMergedAttributes(tagName: string): string[] {
  if (!_tagAttributeCache[tagName]) {
    const tagSpecific = htmlTagAttributes[tagName] || []
    // Use Set for deduplication, then convert to array
    _tagAttributeCache[tagName] = [...new Set([...tagSpecific, ...htmlGlobalAttributes])]
  }
  return _tagAttributeCache[tagName]
}

/**
 * HTML tag completion source
 */
export function htmlTagCompletion(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context
  const m = /<[:\-\.\w\u00b7-\uffff!]*$/.exec(state.sliceDoc(pos - 25, pos))
  if (!m) return null

  if (m[0].startsWith("<$")) return null

  const tree = syntaxTree(state).resolveInner(pos, -1)
  let node = tree
  while (node && !node.type.isTop) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" ||
        node.name === "TypedBlock" || node.name === "CommentBlock" ||
        node.name === "KaTeXBlock" || node.name === "LaTeXContent") {
      return null
    }
    // Don't complete HTML tags inside attribute values
    if (node.name === "AttributeValue" || node.name === "AttributeString") {
      return null
    }
    node = node.parent!
  }

  const patternLen = m[0].length
  const options: Completion[] = []

  // Add HTML comment completion when typing "<!" or just "<"
  const isTypingComment = m[0] === "<!" || m[0] === "<"
  if (isTypingComment) {
    options.push({
      label: "<!--",
      displayLabel: "<!-- comment -->",
      type: "keyword",
      detail: "comment",
      boost: m[0] === "<!" ? 10 : 0,  // Boost when typing "<!""
      apply: (view: any, _completion: any, from: any, to: any) => {
        const insert = "<!-- comment -->"
        // Select "comment" so user can immediately type their comment
        const selectFrom = from + 5  // After "<!-- "
        const selectTo = from + 12   // Before " -->"
        const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: selectFrom, head: selectTo }
        })
      }
    })
  }

  // Add regular HTML tag completions
  for (const tag of commonHtmlTags) {
    const isSelfClosing = selfClosingTags.has(tag)
    options.push({
      label: "<" + tag,
      type: "type",
      detail: isSelfClosing ? "self-closing" : "tag",
      apply: (view: any, _completion: any, from: any, to: any) => {
        const tagText = "<" + tag
        const textAfter = view.state.sliceDoc(to, to + 1)
        const hasClosingBracket = textAfter === ">"
        const endTo = hasClosingBracket ? to + 1 : to

        let insert: string
        let cursorOffset: number
        if (isSelfClosing) {
          insert = tagText + ">"
          cursorOffset = insert.length
        } else {
          // Insert space before > so cursor is positioned for adding attributes
          // Like widgets: <div |></div>
          const closingTag = "</" + tag + ">"
          insert = tagText + " >" + closingTag
          cursorOffset = tagText.length + 1  // After space, before >
        }

        const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: from + cursorOffset },
          // Trigger attribute completion for non-self-closing tags
          effects: isSelfClosing ? undefined : triggerCompletionEffect.of(null)
        })
      }
    })
  }

  return {
    from: pos - m[0].length,
    to: pos,
    options,
    validFor: /^<[:\-\.\w\u00b7-\uffff!]*$/
  };
}

/**
 * Check if we're inside an open HTML tag (before the closing >)
 * Returns the tag name and start position if found, null otherwise
 * Scans through text while skipping protected contexts (quotes, macros, filters, etc.)
 */
function findOpenHTMLTag(text: string): { name: string; start: number } | null {
  const len = text.length
  let pos = 0

  // Track the last open HTML tag we found
  let lastTagStart = -1
  let lastTagName = ""

  while (pos < len) {
    const ch = text[pos]

    // Skip triple-quoted strings
    if (ch === '"' && text[pos + 1] === '"' && text[pos + 2] === '"') {
      pos += 3
      while (pos < len && !(text[pos] === '"' && text[pos + 1] === '"' && text[pos + 2] === '"')) {
        pos++
      }
      pos += 3
      continue
    }

    // Skip quoted strings (but only when inside a tag)
    if ((ch === '"' || ch === "'") && lastTagStart !== -1) {
      const quote = ch
      pos++
      while (pos < len && text[pos] !== quote) {
        if (text[pos] === '\\') pos++
        pos++
      }
      pos++
      continue
    }

    // Skip macro <<...>>
    if (ch === '<' && text[pos + 1] === '<') {
      pos += 2
      let depth = 1
      while (pos < len && depth > 0) {
        if (text[pos] === '<' && text[pos + 1] === '<') {
          depth++
          pos += 2
        } else if (text[pos] === '>' && text[pos + 1] === '>') {
          depth--
          pos += 2
        } else {
          pos++
        }
      }
      continue
    }

    // Skip filtered transclusion {{{...}}}
    if (ch === '{' && text[pos + 1] === '{' && text[pos + 2] === '{') {
      pos += 3
      while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}' && text[pos + 2] === '}')) {
        pos++
      }
      pos += 3
      continue
    }

    // Skip transclusion {{...}}
    if (ch === '{' && text[pos + 1] === '{') {
      pos += 2
      while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}')) {
        pos++
      }
      pos += 2
      continue
    }

    // Skip substituted strings `...` or ```...```
    if (ch === '`') {
      if (text.slice(pos, pos + 3) === '```') {
        pos += 3
        while (pos < len && text.slice(pos, pos + 3) !== '```') pos++
        pos += 3
      } else {
        pos++
        while (pos < len && text[pos] !== '`') pos++
        pos++
      }
      continue
    }

    // Check for tag start: <tagname (but not <$ for widgets)
    if (ch === '<' && text[pos + 1] && /[a-zA-Z]/.test(text[pos + 1]) && text[pos + 1] !== '$') {
      const tagStart = pos
      pos++ // skip <

      // Read tag name
      let name = ""
      while (pos < len && /[a-zA-Z0-9]/.test(text[pos])) {
        name += text[pos]
        pos++
      }

      if (name) {
        // Check what follows the tag name
        const afterName = text[pos]

        if (afterName === '>') {
          // Complete tag <tag> - clear our tracking, not inside it
          lastTagStart = -1
          lastTagName = ""
          pos++
          continue
        }

        if (afterName === '/' && text[pos + 1] === '>') {
          // Self-closing <tag/> - clear tracking
          lastTagStart = -1
          lastTagName = ""
          pos += 2
          continue
        }

        if (afterName && (/\s/.test(afterName) || afterName === '=')) {
          // Tag with attributes <tag ... - track it as potentially open
          lastTagStart = tagStart
          lastTagName = name
          continue
        }

        // <tagname followed by something else - not a real tag, skip
        continue
      }
      continue
    }

    // Check for closing > when we're tracking an open tag
    if (ch === '>' && lastTagStart !== -1) {
      // Tag is complete
      lastTagStart = -1
      lastTagName = ""
      pos++
      continue
    }

    // Check for /> when we're tracking an open tag
    if (ch === '/' && text[pos + 1] === '>' && lastTagStart !== -1) {
      // Self-closing tag complete
      lastTagStart = -1
      lastTagName = ""
      pos += 2
      continue
    }

    pos++
  }

  // If we're still tracking an open tag at end of text, we're inside it
  if (lastTagStart !== -1 && lastTagName) {
    return { name: lastTagName, start: lastTagStart }
  }

  return null
}

/**
 * HTML attribute completion source
 *
 * Also handles style.property-name completion for HTML tags.
 */
export function htmlAttributeCompletion(
  getCSSProperties?: () => string[] | null
) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context

    const textBefore = state.sliceDoc(Math.max(0, pos - 500), pos)

    // Use the smarter detection that handles > inside attributes
    const tagInfo = findOpenHTMLTag(textBefore)
    if (!tagInfo) return null

    const tagName = tagInfo.name

    // Check if we're inside a quoted value, filter, or macro
    const afterTag = textBefore.slice(tagInfo.start)
    let inQuote = false
    let quoteChar = ''
    let filterDepth = 0
    let macroDepth = 0
    for (let i = 0; i < afterTag.length; i++) {
      const ch = afterTag[i]
      if (!inQuote) {
        if (ch === '"' || ch === "'") {
          inQuote = true
          quoteChar = ch
        } else if (ch === '{' && afterTag[i+1] === '{' && afterTag[i+2] === '{') {
          filterDepth++
          i += 2
        } else if (ch === '}' && afterTag[i+1] === '}' && afterTag[i+2] === '}') {
          filterDepth--
          i += 2
        } else if (ch === '<' && afterTag[i+1] === '<') {
          macroDepth++
          i += 1
        } else if (ch === '>' && afterTag[i+1] === '>') {
          macroDepth--
          i += 1
        }
      } else if (ch === quoteChar) {
        inQuote = false
      }
    }
    // Don't complete if inside a quoted string, filter, or macro
    if (inQuote || filterDepth > 0 || macroDepth > 0) return null

    // Match attribute names including style.property-name pattern
    // Also match when cursor is right after whitespace (no partial typed yet)
    const attrMatch = /\s([a-zA-Z][a-zA-Z0-9\-\.]*)?$/.exec(textBefore)
    if (!attrMatch) return null

    const partial = attrMatch[1] || ""
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

    // Check for style.property-name pattern - HTML tags always support style
    if (partial.startsWith("style.") && getCSSProperties) {
      const cssProps = getCSSProperties()
      if (!cssProps || cssProps.length === 0) return null

      const propPartial = partial.slice(6) // Remove "style."
      const lowerPartial = propPartial.toLowerCase()
      const matchingProps = cssProps.filter(prop =>
        prop.toLowerCase().startsWith(lowerPartial)
      )

      if (matchingProps.length === 0) return null

      const options: Completion[] = matchingProps.map(prop => ({
        label: "style." + prop,
        type: "property",
        detail: "CSS property",
        apply: (view: any, _completion: any, from: any, to: any) => {
          const textAfter = view.state.sliceDoc(to, to + 2)
          const hasEquals = textAfter[0] === '='
          const hasQuoteAfterEquals = textAfter === '="'

          let insert: string
          let endTo = to
          let cursorPos: number
          const prefix = "style." + prop

          if (hasQuoteAfterEquals) {
            insert = prefix
            endTo = to + 2
            cursorPos = from + prefix.length + 2
          } else if (hasEquals) {
            insert = prefix + '="'
            endTo = to + 1
            cursorPos = from + prefix.length + 2
          } else {
            insert = prefix + '=""'
            cursorPos = from + prefix.length + 2
          }

          const changes = buildMultiSelectionChanges(view, from, endTo, insert, partial.length)
          view.dispatch({
            changes,
            selection: { anchor: cursorPos },
            effects: triggerCompletionEffect.of(null)
          })
        }
      }))

      return {
        from,
        to: pos,
        options,
        validFor: /^style\.[a-zA-Z\-]*$/
      };
    }

    // Use cached merged attributes for this tag
    const allAttrs = getMergedAttributes(tagName)
    const patternLen = partial.length

    const options: Completion[] = allAttrs.map(attr => ({
      label: attr,
      type: "property",
      apply: (view: any, _completion: any, from: any, to: any) => {
        if (attr.endsWith("-")) {
          const changes = buildMultiSelectionChanges(view, from, to, attr, patternLen)
          view.dispatch({
            changes,
            selection: { anchor: from + attr.length }
          })
          return
        }
        const textAfter = view.state.sliceDoc(to, to + 2)
        const hasEquals = textAfter[0] === '='
        const hasQuoteAfterEquals = textAfter === '="'

        let insert: string
        let endTo = to
        let cursorPos: number

        if (hasQuoteAfterEquals) {
          insert = attr
          endTo = to + 2
          cursorPos = from + attr.length + 2
        } else if (hasEquals) {
          insert = attr + '="'
          endTo = to + 1
          cursorPos = from + attr.length + 2
        } else {
          insert = attr + '=""'
          cursorPos = from + attr.length + 2
        }

        const changes = buildMultiSelectionChanges(view, from, endTo, insert, patternLen)
        view.dispatch({
          changes,
          selection: { anchor: cursorPos }
        })
      }
    }))

    return {
      from,
      to: pos,
      options,
      validFor: /^[a-zA-Z][a-zA-Z0-9\-\.]*$/
    };
  };
}
