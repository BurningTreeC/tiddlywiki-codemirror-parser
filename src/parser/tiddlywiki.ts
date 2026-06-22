/**
 * TiddlyWiki Language Support - Main Entry Point
 *
 * Provides the tiddlywiki() function that creates a complete LanguageSupport
 * for CodeMirror 6, similar to markdown() in @codemirror/lang-markdown.
 */

import { Prec } from "@codemirror/state"
import { keymap, EditorView } from "@codemirror/view"
import { Language, LanguageSupport, LanguageDescription, syntaxHighlighting, indentOnInput, syntaxTree } from "@codemirror/language"
import { autocompletion, completionKeymap, completionStatus, startCompletion } from "@codemirror/autocomplete"
import { html, htmlCompletionSource } from "@codemirror/lang-html"
import type { CompletionContext } from "@codemirror/autocomplete"

import { TiddlyWikiParser } from "./parser"
import { TiddlyWikiConfig } from "./core"
import { tiddlywikiLanguage, mkLang, headerIndent, inlineConditionalFold } from "./language"
import { listMarkerUpgradeHandler } from "../commands"
import { findAutoCloseEnd } from "./auto-close"
import { KaTeXBlock } from "./block-parsers"
import { InlineKaTeX } from "./inline-parsers"

import { TiddlyWikiLanguageConfig } from "./config"
import { tiddlywikiHighlightStyle } from "./highlighting"
import { createTiddlywikiKeymap } from "./keymap"
import { createMixedLanguageWrapper } from "./mixed-language"
import {
  selfClosingTags,
  selfClosingWidgets,
  triggerCompletionOnAccept,
  widgetCompletion,
  widgetAttributeCompletion,
  attributeValueCompletion,
  wikitextAttributeCompletion,
  macroCompletion,
  macroParamCompletion,
  macroParamValueCompletion,
  substitutedParamCompletion,
  tiddlerCompletion,
  systemTiddlerCompletion,
  transclusionFieldCompletion,
  htmlTagCompletion,
  htmlAttributeCompletion,
  filterOperatorCompletion,
  filterRunPrefixCompletion,
  filterOperatorSuffixCompletion,
  filterOperandValueCompletion,
  conditionalCompletion,
  pragmaCompletion,
  pragmaEndNameCompletion,
  rulesKeywordCompletion,
  whitespaceValueCompletion,
  parsermodeValueCompletion,
  wikiruleCompletion,
  generalContextCompletion,
  fencedCodeCompletion,
  typedBlockCompletion,
  styledSpanClassCompletion,
  styledSpanPropertyCompletion,
  closingTagCompletion,
} from "./completions"

// Note: tiddlywikiLanguage and headerIndent are exported from ./language (via index.ts)

/**
 * HTML language support without tag matching (for embedded HTML)
 */
const htmlNoMatch = html({ matchClosingTags: false })

/**
 * Create TiddlyWiki language support for CodeMirror 6
 *
 * @example
 * ```ts
 * import { tiddlywiki } from "@anthropic/lang-tiddlywiki"
 * import { javascript } from "@codemirror/lang-javascript"
 *
 * const extensions = [
 *   tiddlywiki({
 *     codeLanguages: [javascript()],
 *     completeWidgets: true,
 *     completeMacros: true,
 *   })
 * ]
 * ```
 */
export function tiddlywiki(config: TiddlyWikiLanguageConfig = {}): LanguageSupport {
  const {
    codeLanguages,
    defaultCodeLanguage,
    addKeymap = true,
    base: { parser } = tiddlywikiLanguage,
    completeHTMLTags = true,
    completeWidgets = true,
    completeMacros = true,
    completeTiddlers = true,
    completeFilterOperators = true,
    completeFilterRunPrefixes = true,
    getTiddlerTitles,
    isDraftTiddler,
    getImageTiddlerTitles,
    getMacroNames,
    getMacroParams,
    getWidgetNames,
    getWidgetAttributes,
    getFilterOperators,
    getFieldNames,
    getTagNames,
    getTypeNames,
    getFileExtensions,
    getFunctionNames,
    getVariableNames,
    getTiddlerIndexes,
    getTiddlerFields,
    getStoryViews,
    getDeserializers,
    getPageClasses,
    getCSSProperties,
    getCSSValues,
    getCSSValuesForProperty,
    htmlTagLanguage = htmlNoMatch,
    getSelfClosingWidgets,
    getWikiRules,
    disableCamelCaseLinks = false,
    enableKaTeX = false,
    getTabOutsideListBehavior,
    getShiftTabOutsideListBehavior,
    getEnterIndentBehavior,
    getFilterBracketMode,
    skipNestedLanguageExtensions = false,
    nestedLanguageExtensions,
    nestedLanguageCompletionSources,
    nestedLanguageCompletions,
  } = config

  // Validate parser
  if (!(parser instanceof TiddlyWikiParser)) {
    throw new RangeError("Base parser provided to `tiddlywiki` should be a TiddlyWiki parser")
  }

  // Build extensions for the parser
  const parserExtensions: TiddlyWikiConfig[] = config.extensions ? [config.extensions] : []

  // Handle disabled CamelCase links
  if (disableCamelCaseLinks) {
    parserExtensions.push({ remove: ["CamelCaseLink"] })
  }

  // Enable KaTeX/LaTeX parsing when the KaTeX plugin is installed
  // KaTeXBlock.after and InlineKaTeX.after ensure correct parser ordering
  // Note: styleTags for KaTeX nodes are defined in parser.ts defaultStyleTags
  // (must be in base nodeSet for parseContentRange to work correctly)
  if (enableKaTeX) {
    parserExtensions.push({
      parseBlock: [KaTeXBlock],
      parseInline: [InlineKaTeX],
    })
  }

  // Build nested language completion source (if sources provided)
  // This needs to be built before autocompletion config so we can add it to override
  let nestedLanguageCompletionOverride: ((context: CompletionContext) => any) | null = null

  // Prefer new dynamic array format, fall back to deprecated object format
  if (nestedLanguageCompletions && nestedLanguageCompletions.length > 0) {
    // Create a completion source that detects language at cursor position dynamically
    nestedLanguageCompletionOverride = (context: CompletionContext) => {
      // Use each language's isActiveAt method to detect which language is at cursor
      for (const lang of nestedLanguageCompletions!) {
        if (lang.language && typeof lang.language.isActiveAt === "function") {
          if (lang.language.isActiveAt(context.state, context.pos)) {
            return lang.source(context)
          }
        }
      }
      return null
    }
  } else if (nestedLanguageCompletionSources && Object.keys(nestedLanguageCompletionSources).length > 0) {
    // Deprecated: hardcoded node type checks for backwards compatibility

    nestedLanguageCompletionOverride = (context: CompletionContext) => {
      const tree = syntaxTree(context.state)
      const node = tree.resolveInner(context.pos, -1)
      const nodeName = node.type.name

      // JavaScript family: look for JS-specific node types
      if (nestedLanguageCompletionSources!["javascript"]) {
        const jsNodeTypes = ["Script", "VariableDeclaration", "FunctionDeclaration", "ExpressionStatement",
                             "CallExpression", "Identifier", "String", "Number", "PropertyName",
                             "Statement", "Expression", "Block", "ArrowFunction", "ClassDeclaration",
                             "VariableName", "PropertyDefinition", "MemberExpression", "BinaryExpression"]
        if (jsNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          return nestedLanguageCompletionSources!["javascript"](context)
        }
      }
      // Python
      if (nestedLanguageCompletionSources!["python"]) {
        const pyNodeTypes = ["Script", "FunctionDefinition", "ClassDefinition", "ImportStatement", "Name"]
        if (pyNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          return nestedLanguageCompletionSources!["python"](context)
        }
      }
      // CSS
      if (nestedLanguageCompletionSources!["css"]) {
        const cssNodeTypes = ["StyleSheet", "RuleSet", "Declaration", "Selector", "PropertyName", "Block"]
        if (cssNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          return nestedLanguageCompletionSources!["css"](context)
        }
      }
      // HTML
      if (nestedLanguageCompletionSources!["html"]) {
        const htmlNodeTypes = ["Document", "Element", "OpenTag", "CloseTag", "TagName", "Attribute"]
        if (htmlNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          return nestedLanguageCompletionSources!["html"](context)
        }
      }
      // Go
      if (nestedLanguageCompletionSources!["go"]) {
        const goNodeTypes = ["SourceFile", "FunctionDecl", "VarDecl", "TypeDecl", "PackageClause", "ImportDecl"]
        if (goNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          return nestedLanguageCompletionSources!["go"](context)
        }
      }
      // SQL
      if (nestedLanguageCompletionSources!["sql"]) {
        const sqlNodeTypes = ["Script", "Statement", "Keyword", "Identifier", "String", "Number"]
        if (sqlNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          return nestedLanguageCompletionSources!["sql"](context)
        }
      }
      // LaTeX
      if (nestedLanguageCompletionSources!["latex"]) {
        const latexNodeTypes = ["Document", "Command", "Environment", "Group", "Text"]
        if (latexNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          return nestedLanguageCompletionSources!["latex"](context)
        }
      }
      // Sass/SCSS
      if (nestedLanguageCompletionSources!["sass"] || nestedLanguageCompletionSources!["scss"]) {
        const sassNodeTypes = ["StyleSheet", "RuleSet", "Declaration", "Selector", "Mixin", "Include"]
        if (sassNodeTypes.some(t => nodeName === t || nodeName.includes(t))) {
          const source = nestedLanguageCompletionSources!["sass"] || nestedLanguageCompletionSources!["scss"]
          return source(context)
        }
      }
      return null
    }
  }

  // Build fenced code and typed block completion sources (need to check these in override
  // because when cursor is at "```c", the parser may see it as entering a code block,
  // so languageDataAt won't return TiddlyWiki completions)
  const fencedCodeCompletionSource = fencedCodeCompletion(codeLanguages)
  const typedBlockCompletionSource = typedBlockCompletion(getTypeNames, getFileExtensions)

  // Create styled span completion sources (called directly, not via languageDataAt)
  const styledSpanClassSource = styledSpanClassCompletion(getPageClasses)
  const styledSpanPropertySource = styledSpanPropertyCompletion(getCSSProperties, getWidgetAttributes)

  // Create completion override that handles:
  // 1. Fenced code block language completion (```lang) - checked first
  // 2. Typed block completion ($$$type) - checked second
  // 3. Styled span completions (@@.class and @@property:) - checked third
  // 4. Nested language completions - checked fourth
  // 5. Falls back to languageDataAt for TiddlyWiki completions
  // Helper to check if a completion result has actual options
  const hasOptions = (result: any) => result?.options?.length > 0

  const completionOverride = (context: CompletionContext) => {
    // First check fenced code block completion (```lang)
    // This must be checked before nested language detection because when typing "```c",
    // the parser may already see cursor as entering a code block
    const fencedResult = fencedCodeCompletionSource(context)
    if (hasOptions(fencedResult)) return fencedResult

    // Check typed block completion ($$$type)
    const typedResult = typedBlockCompletionSource(context)
    if (hasOptions(typedResult)) return typedResult

    // Check styled span completions (@@.className and @@property:)
    // Must be before nested language check since CSS parser may be active
    const styledClassResult = styledSpanClassSource(context)
    if (hasOptions(styledClassResult)) return styledClassResult

    const styledPropResult = styledSpanPropertySource(context)
    if (hasOptions(styledPropResult)) return styledPropResult

    // Try nested language completion if configured
    if (nestedLanguageCompletionOverride) {
      const nestedResult = nestedLanguageCompletionOverride(context)
      if (hasOptions(nestedResult)) return nestedResult
    }

    // Fall back to language data sources (TiddlyWiki completions)
    // Note: languageDataAt is a method on EditorState, not a standalone function
    const sources = context.state.languageDataAt<(ctx: CompletionContext) => any>("autocomplete", context.pos)
    for (const source of sources) {
      const result = source(context)
      if (hasOptions(result)) return result
    }
    return null
  }

  // Build support extensions
  // NOTE: We intentionally do NOT include htmlTagLanguage.support here.
  // The html() LanguageSupport contains Compartments that would cause
  // "Duplicate use of compartment" errors on reconfiguration. Our custom
  // HTML completions (htmlTagCompletion, htmlAttributeCompletion) work without it.
  const support: any[] = [
    headerIndent,
    inlineConditionalFold,
    // Enable re-indentation when typing (pattern provided via language data below)
    indentOnInput(),
    syntaxHighlighting(tiddlywikiHighlightStyle),
    // Enable autocompletion with activate on typing
    // Use override to handle fenced code/typed block completion, nested languages, and TiddlyWiki completions
    autocompletion({
      activateOnTyping: true,
      override: [completionOverride],
    }),
    keymap.of(completionKeymap),
    // Input handler for upgrading list markers (e.g., "* " + "*" → "** ")
    listMarkerUpgradeHandler,
    // Listen for triggerCompletionEffect to chain completions after accept
    triggerCompletionOnAccept,
  ]

  // Handle default code language
  // NOTE: We do NOT add defaultCodeLanguage.support here - it will be added via the loop below
  // along with other languages. Adding it here would cause duplicate completions.
  let defaultCode: Language | undefined
  if (defaultCodeLanguage instanceof LanguageSupport) {
    defaultCode = defaultCodeLanguage.language
  } else if (defaultCodeLanguage) {
    defaultCode = defaultCodeLanguage
  }

  // NOTE: We do NOT add Language objects here for nested languages.
  // The mixed-language wrapper (createMixedLanguageWrapper below) handles syntax highlighting
  // for nested code blocks. Adding Language objects here would cause completion duplication
  // because Language objects can carry their own autocomplete data via data.of().
  // We only add our custom JavaScript completion source explicitly below via nestedLanguageCompletionSources.

  // Add mixed language parsing for code blocks
  const wrap = createMixedLanguageWrapper(
    codeLanguages,
    defaultCode,
    parser,  // Pass the TiddlyWiki parser for nested wikitext in typed blocks
    getWidgetAttributes  // For checking if widgets support style attribute
  )
  parserExtensions.push({ wrap })

  // Add keymap if requested (highest precedence to override completion keymap Tab binding)
  if (addKeymap) {
    const twKeymap = createTiddlywikiKeymap({
      getTabOutsideListBehavior,
      getShiftTabOutsideListBehavior,
      getEnterIndentBehavior,
    })
    support.push(Prec.highest(keymap.of(twKeymap)))
  }

  // Configure the parser with extensions
  let configuredParser = parser
  if (parserExtensions.length > 0) {
    for (const ext of parserExtensions) {
      configuredParser = configuredParser.configure(ext)
    }
  }

  // Create the language
  const lang = mkLang(configuredParser)

  // Add indentOnInput pattern for auto-outdenting when typing closing patterns
  support.push(lang.data.of({
    indentOnInput: /^\s*(<\/[a-zA-Z$][^>]*>|<%\s*(else|elseif|endif)[^%]*%>|\\end\s*)$/
  }))

  // NOTE: Nested language completions are handled via the autocompletion override above
  // (nestedLanguageCompletionOverride checks syntax tree and calls appropriate source)
  // We do NOT use lang.data.of() for nested languages because languageDataAt() won't find
  // TiddlyWiki language data when cursor is in a nested language block.

  // Add completions via language data
  if (completeWidgets) {
    support.push(lang.data.of({
      autocomplete: widgetCompletion(getWidgetNames, getSelfClosingWidgets)
    }))
    support.push(lang.data.of({
      autocomplete: widgetAttributeCompletion(getMacroParams, getWidgetAttributes, getCSSProperties)
    }))
    support.push(lang.data.of({
      autocomplete: attributeValueCompletion(getMacroNames, getTiddlerTitles, getFunctionNames, getVariableNames, getFieldNames, getTiddlerIndexes, getStoryViews, getDeserializers, getCSSValues, isDraftTiddler, getPageClasses, getCSSValuesForProperty)
    }))
    support.push(lang.data.of({
      autocomplete: wikitextAttributeCompletion(getTiddlerTitles, getMacroNames, getWidgetNames, getFunctionNames, getVariableNames, isDraftTiddler, getMacroParams)
    }))
    support.push(lang.data.of({
      autocomplete: closingTagCompletion(getWidgetNames)
    }))

    // Trigger completion when typing opening quote after = in attribute context
    support.push(EditorView.inputHandler.of((view: any, from: any, _to: any, text: any) => {
      if (text !== '"' && text !== "'") return false
      const charBefore = view.state.sliceDoc(Math.max(0, from - 1), from)
      if (charBefore !== "=") return false
      setTimeout(() => {
        if (completionStatus(view.state) === null) {
          startCompletion(view)
        }
      }, 10)
      return false
    }))

    // Trigger completion when typing second _ after <_ or <<_ (substituted parameter)
    support.push(EditorView.inputHandler.of((view: any, from: any, _to: any, text: any) => {
      if (text !== "_") return false
      const textBefore = view.state.sliceDoc(Math.max(0, from - 3), from)
      // Check for <_ or <<_ pattern
      if (textBefore.endsWith("<_") || textBefore.endsWith("<<_")) {
        setTimeout(() => {
          if (completionStatus(view.state) === null) {
            startCompletion(view)
          }
        }, 10)
      }
      return false
    }))

    // Trigger completion when typing "." after "style" in attribute context
    support.push(EditorView.inputHandler.of((view: any, from: any, _to: any, text: any) => {
      if (text !== ".") return false
      const textBefore = view.state.sliceDoc(Math.max(0, from - 5), from)
      // Check for "style" before the dot (case-insensitive for robustness)
      if (textBefore.toLowerCase() === "style") {
        setTimeout(() => {
          if (completionStatus(view.state) === null) {
            startCompletion(view)
          }
        }, 10)
      }
      return false
    }))

    // Trigger completion when typing "=" after a param name inside a <<macro>> call
    support.push(EditorView.inputHandler.of((view: any, from: any, _to: any, text: any) => {
      if (text !== "=") return false
      const textBefore = view.state.sliceDoc(Math.max(0, from - 200), from)
      // Check if inside a macro call and after a param name
      if (/<<[\w\-\.]+\s+.*[\w\-]$/.test(textBefore)) {
        setTimeout(() => {
          if (completionStatus(view.state) === null) {
            startCompletion(view)
          }
        }, 10)
      }
      return false
    }))

    // Auto-close tags when typing ">"
    support.push(EditorView.inputHandler.of((view: any, from: any, _to: any, text: any) => {
      if (text !== ">") return false

      const charBefore = view.state.sliceDoc(Math.max(0, from - 1), from)
      if (charBefore === "/") return false

      // Check if we're completing a closing tag (</tagname> or </$widget>)
      // Look back for </ pattern to avoid auto-closing when typing > for a closing tag
      const textBefore = view.state.sliceDoc(Math.max(0, from - 50), from)
      // Match HTML closing tags: </tagname or widget closing tags: </$widget.name
      // Allow optional trailing whitespace to handle edge cases
      if (/<\/(\$[a-zA-Z0-9\-\$\.]*|[a-zA-Z][a-zA-Z0-9\-]*)\s*$/.test(textBefore)) return false

      const tree = syntaxTree(view.state)
      const node = tree.resolveInner(from, -1)

      let current = node
      let tagNode = null
      let tagName = ""
      let isWidget = false

      while (current && !current.type.isTop) {
        const name = current.name
        if (name === "MacroCall" || name === "MacroName") {
          return false
        }
        if (name === "AttributeValue" || name === "AttributeString") {
          // Only return false if we're actually INSIDE the attribute value
          // If we're at the end (right after closing quote), continue to find the tag
          if (from < current.to) {
            return false
          }
        }
        if (name === "InlineWidget" || name === "Widget" || name === "HTMLBlock" || name === "HTMLTag" ||
            name === "IncompleteWidget" || name === "IncompleteHTMLTag" || name === "IncompleteHTMLBlock") {
          let hasClosingMark = false
          let nameNode = null
          const cursor = current.cursor()
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "WidgetName" || cursor.name === "TagName") {
                nameNode = cursor.node
              }
              if (cursor.name === "TagMark" && cursor.from > current.from) {
                hasClosingMark = true
              }
            } while (cursor.nextSibling())
          }

          if (!hasClosingMark && nameNode) {
            tagNode = current
            // Clamp the name to the cursor: when the opening tag is immediately
            // followed by text (e.g. "<divThis is text"), the parser glues that
            // following text onto the name. The intended name ends at the cursor.
            tagName = view.state.sliceDoc(nameNode.from, Math.min(nameNode.to, from))
            isWidget = name === "InlineWidget" || name === "Widget" || name === "IncompleteWidget"
            break
          }
        }
        current = current.parent!
      }

      if (!tagNode || !tagName) return false

      if (isWidget) {
        const allSelfClosingWidgets = new Set(selfClosingWidgets)
        if (getSelfClosingWidgets) {
          for (const w of getSelfClosingWidgets()) {
            allSelfClosingWidgets.add(w)
          }
        }
        if (allSelfClosingWidgets.has(tagName)) return false
      } else {
        if (selfClosingTags.has(tagName.toLowerCase())) return false
      }

      const closingTag = `</${tagName}>`

      // Check if there's already a matching closing tag by tracking nesting depth
      // Scan through text while skipping protected contexts
      const textAfter = view.state.sliceDoc(from + 1, view.state.doc.length)
      const caseSensitive = isWidget

      // Compare tag names with appropriate case sensitivity
      const tagMatches = (name: string): boolean => {
        return caseSensitive ? name === tagName : name.toLowerCase() === tagName.toLowerCase()
      }

      // Scan text and find opening/closing tags while skipping protected contexts
      const scanForTags = (): boolean => {
        let pos = 0
        const len = textAfter.length
        let depth = 0

        while (pos < len) {
          const ch = textAfter[pos]

          // Skip fenced code blocks ``` ... ```
          if (ch === '`' && textAfter[pos + 1] === '`' && textAfter[pos + 2] === '`') {
            pos += 3
            while (pos < len && !(textAfter[pos] === '`' && textAfter[pos + 1] === '`' && textAfter[pos + 2] === '`')) pos++
            pos += 3
            continue
          }

          // Skip typed blocks $$$ ... $$$
          if (ch === '$' && textAfter[pos + 1] === '$' && textAfter[pos + 2] === '$') {
            pos += 3
            while (pos < len && !(textAfter[pos] === '$' && textAfter[pos + 1] === '$' && textAfter[pos + 2] === '$')) pos++
            pos += 3
            continue
          }

          // Skip HTML comments <!-- ... -->
          if (ch === '<' && textAfter[pos + 1] === '!' && textAfter[pos + 2] === '-' && textAfter[pos + 3] === '-') {
            pos += 4
            while (pos < len && !(textAfter[pos] === '-' && textAfter[pos + 1] === '-' && textAfter[pos + 2] === '>')) pos++
            pos += 3
            continue
          }

          // Skip triple-quoted strings """ ... """
          if (ch === '"' && textAfter[pos + 1] === '"' && textAfter[pos + 2] === '"') {
            pos += 3
            while (pos < len && !(textAfter[pos] === '"' && textAfter[pos + 1] === '"' && textAfter[pos + 2] === '"')) pos++
            pos += 3
            continue
          }

          // Skip macros <<...>>
          if (ch === '<' && textAfter[pos + 1] === '<') {
            pos += 2
            let macroDepth = 1
            while (pos < len && macroDepth > 0) {
              if (textAfter[pos] === '<' && textAfter[pos + 1] === '<') { macroDepth++; pos += 2 }
              else if (textAfter[pos] === '>' && textAfter[pos + 1] === '>') { macroDepth--; pos += 2 }
              else pos++
            }
            continue
          }

          // Skip filtered transclusions {{{...}}}
          if (ch === '{' && textAfter[pos + 1] === '{' && textAfter[pos + 2] === '{') {
            pos += 3
            while (pos < len && !(textAfter[pos] === '}' && textAfter[pos + 1] === '}' && textAfter[pos + 2] === '}')) pos++
            pos += 3
            continue
          }

          // Skip transclusions {{...}}
          if (ch === '{' && textAfter[pos + 1] === '{') {
            pos += 2
            while (pos < len && !(textAfter[pos] === '}' && textAfter[pos + 1] === '}')) pos++
            pos += 2
            continue
          }

          // Skip substituted strings `...` (single backtick, not triple)
          if (ch === '`' && textAfter[pos + 1] !== '`') {
            pos++
            while (pos < len && textAfter[pos] !== '`') pos++
            pos++
            continue
          }

          // Check for closing tag </tagname>
          if (ch === '<' && textAfter[pos + 1] === '/') {
            pos += 2
            // Read tag name
            let closeName = ""
            while (pos < len && /[a-zA-Z0-9\-_$.]/.test(textAfter[pos])) {
              closeName += textAfter[pos]
              pos++
            }
            // Skip whitespace
            while (pos < len && /\s/.test(textAfter[pos])) pos++
            // Check for >
            if (textAfter[pos] === '>' && tagMatches(closeName)) {
              if (depth === 0) {
                // Found closing tag at depth 0 - belongs to our opening tag
                return true
              }
              depth--
            }
            pos++
            continue
          }

          // Check for opening tag <tagname
          if (ch === '<' && /[a-zA-Z$]/.test(textAfter[pos + 1])) {
            const tagStart = pos
            pos++
            // Read tag name
            let openName = ""
            while (pos < len && /[a-zA-Z0-9\-_$.]/.test(textAfter[pos])) {
              openName += textAfter[pos]
              pos++
            }
            // Check if this matches our tag name
            if (tagMatches(openName)) {
              // Need to determine if this is a self-closing tag or opening tag
              // Scan forward to find > or /> while skipping quoted content
              let isSelfClosing = false
              let foundEnd = false
              const scanStart = pos
              while (pos < len && !foundEnd) {
                const sch = textAfter[pos]
                // Skip triple-quoted strings
                if (sch === '"' && textAfter[pos + 1] === '"' && textAfter[pos + 2] === '"') {
                  pos += 3
                  while (pos < len && !(textAfter[pos] === '"' && textAfter[pos + 1] === '"' && textAfter[pos + 2] === '"')) pos++
                  pos += 3
                  continue
                }
                // Skip quoted strings
                if (sch === '"' || sch === "'") {
                  const quote = sch
                  pos++
                  while (pos < len && textAfter[pos] !== quote) {
                    if (textAfter[pos] === '\\') pos++
                    pos++
                  }
                  pos++
                  continue
                }
                // Skip macros in attributes
                if (sch === '<' && textAfter[pos + 1] === '<') {
                  pos += 2
                  let md = 1
                  while (pos < len && md > 0) {
                    if (textAfter[pos] === '<' && textAfter[pos + 1] === '<') { md++; pos += 2 }
                    else if (textAfter[pos] === '>' && textAfter[pos + 1] === '>') { md--; pos += 2 }
                    else pos++
                  }
                  continue
                }
                // Skip filtered transclusions in attributes
                if (sch === '{' && textAfter[pos + 1] === '{' && textAfter[pos + 2] === '{') {
                  pos += 3
                  while (pos < len && !(textAfter[pos] === '}' && textAfter[pos + 1] === '}' && textAfter[pos + 2] === '}')) pos++
                  pos += 3
                  continue
                }
                // Skip transclusions in attributes
                if (sch === '{' && textAfter[pos + 1] === '{') {
                  pos += 2
                  while (pos < len && !(textAfter[pos] === '}' && textAfter[pos + 1] === '}')) pos++
                  pos += 2
                  continue
                }
                // Skip backtick strings in attributes
                if (sch === '`') {
                  if (textAfter[pos + 1] === '`' && textAfter[pos + 2] === '`') {
                    pos += 3
                    while (pos < len && !(textAfter[pos] === '`' && textAfter[pos + 1] === '`' && textAfter[pos + 2] === '`')) pos++
                    pos += 3
                  } else {
                    pos++
                    while (pos < len && textAfter[pos] !== '`') pos++
                    pos++
                  }
                  continue
                }
                // Found end of tag
                if (sch === '/' && textAfter[pos + 1] === '>') {
                  isSelfClosing = true
                  foundEnd = true
                  pos += 2
                } else if (sch === '>') {
                  foundEnd = true
                  pos++
                } else {
                  pos++
                }
              }
              // Only count as opening tag if not self-closing
              if (foundEnd && !isSelfClosing) {
                depth++
              }
            }
            continue
          }

          pos++
        }

        // No matching closing tag found at depth 0
        return false
      }

      const hasMatchingClose = scanForTags()

      if (hasMatchingClose) {
        // Just insert > without adding closing tag
        view.dispatch({
          changes: { from, to: from, insert: ">" },
          selection: { anchor: from + 1 }
        })
        return true
      }

      // Find where the closing tag should go. If a block of text follows the
      // opening tag, close it after that block instead of right at the cursor,
      // but never cross an enclosing element's closing tag (findAutoCloseEnd is
      // depth-aware so the result is always balanced). The ">" is inserted at
      // `from`, so the body text begins at `from` in the original document.
      const doc = view.state.doc
      const blockEnd = findAutoCloseEnd(doc, from)
      if (blockEnd > from) {
        const sLine = doc.lineAt(from)
        // Is there content right after the cursor on the opening tag's line?
        const inlineOpener = doc.sliceString(from, sLine.to).trim() !== ""
        let closeInsert: string
        if (inlineOpener) {
          // Opening tag is inline with text: keep the close inline at the block end
          // e.g. "<div>This is text</div>"
          closeInsert = closingTag
        } else {
          // Opening tag is alone on its line, body on the following lines: put the
          // closing tag on its own new line, aligned with the opener
          // e.g. "<div>\nThis is text\n</div>"
          const openerIndent = /^[ \t]*/.exec(sLine.text)![0]
          closeInsert = view.state.lineBreak + openerIndent + closingTag
        }
        view.dispatch({
          changes: [
            { from, to: from, insert: ">" },
            { from: blockEnd, insert: closeInsert }
          ],
          selection: { anchor: from + 1 }
        })
        return true
      }

      view.dispatch({
        changes: { from, to: from, insert: ">" + closingTag },
        selection: { anchor: from + 1 }
      })
      return true
    }))
  }

  if (completeMacros) {
    // Add substituted parameter completion FIRST for <<__param__>> inside pragma blocks
    // This must come before macroCompletion to get priority for <<__ patterns
    support.push(lang.data.of({
      autocomplete: substitutedParamCompletion()
    }))
    support.push(lang.data.of({
      autocomplete: macroCompletion(getMacroNames, getFunctionNames, getVariableNames)
    }))
    if (getMacroParams) {
      support.push(lang.data.of({
        autocomplete: macroParamCompletion(getMacroParams)
      }))
    }
    support.push(lang.data.of({
      autocomplete: macroParamValueCompletion()
    }))
  }

  if (completeTiddlers) {
    support.push(lang.data.of({
      autocomplete: tiddlerCompletion(getTiddlerTitles, getImageTiddlerTitles, isDraftTiddler)
    }))
    support.push(lang.data.of({
      autocomplete: systemTiddlerCompletion(getTiddlerTitles, isDraftTiddler)
    }))
    support.push(lang.data.of({
      autocomplete: transclusionFieldCompletion(getTiddlerFields, getTiddlerIndexes)
    }))
  }

  if (completeHTMLTags) {
    support.push(lang.data.of({
      autocomplete: htmlTagCompletion
    }))
    support.push(lang.data.of({
      autocomplete: htmlAttributeCompletion(getCSSProperties)
    }))
    support.push(lang.data.of({
      autocomplete: (context: CompletionContext) => {
        const textBefore = context.state.sliceDoc(Math.max(0, context.pos - 100), context.pos)
        // Only activate when in an HTML tag context (after < or inside a tag)
        const inHtmlTag = /<[a-zA-Z][^>]*$/.test(textBefore)
        if (!inHtmlTag) {
          return null
        }
        // Skip if it's a widget
        if (/<\$[\w\-\.]*$/.test(textBefore)) {
          return null
        }
        if (/<\$[\w\-\.]+\s+[^>]*$/.test(textBefore)) {
          return null
        }
        return htmlCompletionSource(context)
      }
    }))
  }

  if (completeFilterOperators) {
    support.push(lang.data.of({
      autocomplete: filterOperatorCompletion(getFilterOperators, getFilterBracketMode, getMacroParams)
    }))
  }

  if (completeFilterRunPrefixes) {
    support.push(lang.data.of({
      autocomplete: filterRunPrefixCompletion
    }))
  }

  if (completeFilterOperators) {
    support.push(lang.data.of({
      autocomplete: filterOperatorSuffixCompletion(getFieldNames)
    }))
  }

  if (completeFilterOperators) {
    support.push(lang.data.of({
      autocomplete: filterOperandValueCompletion(
        getTiddlerTitles,
        getTagNames,
        getFieldNames,
        getFunctionNames,
        getVariableNames,
        getTypeNames
      )
    }))
  }

  // Note: img/ext completions are now integrated into filterOperatorCompletion
  // via createFilterOperatorResult - no separate source needed

  // Always add conditional keyword completion
  support.push(lang.data.of({
    autocomplete: conditionalCompletion
  }))

  // Always add pragma completion
  support.push(lang.data.of({
    autocomplete: pragmaCompletion
  }))

  // Always add \end name completion
  support.push(lang.data.of({
    autocomplete: pragmaEndNameCompletion
  }))

  // Always add \whitespace value completion (trim/notrim)
  support.push(lang.data.of({
    autocomplete: whitespaceValueCompletion
  }))

  // Always add \parsermode value completion (block/inline)
  support.push(lang.data.of({
    autocomplete: parsermodeValueCompletion
  }))

  // Always add \rules keyword completion (only/except)
  support.push(lang.data.of({
    autocomplete: rulesKeywordCompletion
  }))

  // Always add wiki rule completion (for \rules only/except)
  support.push(lang.data.of({
    autocomplete: wikiruleCompletion(getWikiRules)
  }))

  // Add general context completion (Ctrl+Space in plain text)
  support.push(lang.data.of({
    autocomplete: generalContextCompletion(
      getTiddlerTitles,
      getMacroNames,
      getWidgetNames,
      getFunctionNames,
      getVariableNames,
      isDraftTiddler
    )
  }))

  // NOTE: Styled span completions (@@.className and @@property:) are handled
  // directly in completionOverride above, not via lang.data.of(), to ensure
  // they're checked before other completions that might match the same context.

  // NOTE: Fenced code block (```) and typed block ($$$) completions are handled
  // in the completionOverride above, not via lang.data.of(), because when the cursor
  // is at "```c", the parser may already see it as entering a code block and
  // languageDataAt won't return TiddlyWiki language data.

  // NOTE: Auto-close $( with )$ and completion trigger for $(variable)$
  // are handled in engine.js (before closeBrackets) so it gets first chance
  // to handle ( before closeBrackets inserts ). The completion trigger only
  // fires when inside a \define block since $(variable)$ is not valid in
  // \procedure, \function, or \widget.

  return new LanguageSupport(lang, support)
}
