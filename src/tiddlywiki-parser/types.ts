/**
 * TiddlyWiki Parser - Node Types
 *
 * Following the Lezer Markdown architecture, this enum defines all node types
 * used in the TiddlyWiki parse tree.
 */

export enum Type {
  // Document root
  Document = 1,

  // === PRAGMAS (must appear at document start) ===
  Pragma,
  PragmaMark,           // The \ character
  PragmaKeyword,        // define, procedure, function, widget, rules, import, parameters, whitespace
  PragmaName,           // Name of macro/procedure/function/widget
  PragmaParams,         // Parameter list
  PragmaBody,           // Body content
  PragmaEnd,            // \end marker

  MacroDefinition,
  ProcedureDefinition,
  FunctionDefinition,
  WidgetDefinition,
  RulesPragma,
  ImportPragma,
  ParametersPragma,
  WhitespacePragma,

  // === BLOCK ELEMENTS ===
  Paragraph,

  // Headings
  Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  HeadingMark,          // The ! characters

  // Lists
  BulletList,
  OrderedList,
  DefinitionList,
  ListItem,
  DefinitionTerm,       // ; item
  DefinitionDescription, // : item
  ListMark,             // The * # ; : > characters

  // Block quote (multi-line with <<<)
  BlockQuote,
  QuoteMark,

  // Tables
  Table,
  TableHeader,          // thead
  TableBody,            // tbody
  TableFooter,          // tfoot
  TableCaption,         // caption
  TableRow,
  TableCell,
  TableHeaderCell,      // th (cells marked with !)
  TableDelimiter,       // The | characters
  TableClass,           // |class|k row
  TableMarker,          // Row type marker (c, k, h, f)

  // Code blocks
  FencedCode,
  CodeMark,             // The ``` markers
  CodeInfo,             // Language identifier
  CodeText,             // Code content

  // Typed blocks
  TypedBlock,
  TypedBlockMark,       // The $$$ markers
  TypedBlockType,       // Type identifier

  // Other blocks
  HorizontalRule,
  CommentBlock,
  CommentMarker,        // <!-- or /%

  // HTML/Widget blocks
  HTMLBlock,
  HTMLEndTag,           // Closing </tag>
  Widget,
  WidgetEnd,            // Closing </$widget>
  WidgetName,           // The $name part
  TagName,              // HTML tag name
  TagMark,              // < and > in HTML/Widget tags
  TagAttributes,        // All attributes as a group
  Attribute,
  AttributeName,
  AttributeValue,
  AttributeString,      // "value" or 'value'
  AttributeNumber,
  AttributeIndirect,    // {{reference}}
  AttributeFiltered,    // {{{filter}}}
  AttributeMacro,       // <<macro>>
  AttributeSubstituted, // `substituted`
  SelfClosingMarker,    // The / in />

  // Transclusion blocks
  TransclusionBlock,
  FilteredTransclusionBlock,
  MacroCallBlock,

  // === INLINE ELEMENTS ===

  // Emphasis
  Bold,
  BoldMark,             // ''
  Italic,
  ItalicMark,           // //
  Underline,
  UnderlineMark,        // __
  Strikethrough,
  StrikethroughMark,    // ~~
  Superscript,
  SuperscriptMark,      // ^^
  Subscript,
  SubscriptMark,        // ,,
  Highlight,
  HighlightMark,        // @@

  // Code
  InlineCode,
  InlineCodeMark,       // `

  // Links
  WikiLink,
  WikiLinkMark,         // [[ and ]]
  LinkText,
  LinkSeparator,        // The | character
  LinkTarget,

  ExternalLink,
  ExtLinkMark,          // [ext[ and ]]

  ImageLink,
  ImageMark,            // [img and ]]
  ImageSource,
  ImageWidth,
  ImageHeight,
  ImageClass,
  ImageAlt,
  ImageTooltip,

  CamelCaseLink,        // CamelCase auto-link
  SystemLink,           // $:/... link
  URLLink,              // http://... auto-link

  // Transclusions
  Transclusion,
  TransclusionMark,     // {{ and }}
  TransclusionTarget,   // tiddler reference
  TransclusionField,    // !!field
  TransclusionIndex,    // ##index
  TransclusionTemplate, // ||template

  FilteredTransclusion,
  FilteredTransclusionMark, // {{{ and }}}
  FilterExpression,

  // Macro calls
  MacroCall,
  MacroCallMark,        // << and >>
  MacroName,
  MacroParam,
  MacroParamName,
  MacroParamValue,

  // Widgets (inline)
  InlineWidget,

  // HTML tags (inline)
  HTMLTag,
  OpenTag,
  CloseTag,

  // Special
  Escape,               // ~ before WikiWord
  Entity,               // &entity;
  HardBreak,            // """ or line break
  Dash,                 // -- or ---
  Variable,             // $(var)$ in substituted strings
  VariableMark,         // $( and )$
  VariableName,         // var in $(var)$
  FilterSubstitution,   // ${ filter }$ in substituted strings
  FilterSubstitutionMark, // ${ and }$
  Placeholder,          // $param$ in macro definitions
  PlaceholderMark,      // $ in $param$

  // Filter expression components
  FilterRun,            // A run in a filter (space-separated)
  FilterOperator,       // [operator[operand]]
  FilterOperatorName,   // operator name
  FilterOperand,        // operand in [operator[operand]]
  FilterVariable,       // <varname> in filters
  FilterTextRef,        // {textref} in filters
  FilterRegexp,         // /regexp/ in filters

  // Styled blocks (.class prefix)
  StyledBlock,
  StyledBlockMark,      // The . prefix
  StyledBlockClass,     // The class name

  // Conditionals (<%if%>, <%elseif%>, <%else%>, <%endif%>)
  ConditionalBlock,
  Conditional,          // Inline conditional (for progressive highlighting)
  ConditionalMark,      // <% and %>
  ConditionalKeyword,   // if, elseif, else, endif
  ConditionalBranch,    // Each branch (if/elseif/else content)

  // Text
  Text,

  // Marks (for processing instructions/delimiters that shouldn't render)
  ProcessingInstruction,
  Mark,
}

// Block-level types
export const BlockTypes = new Set([
  Type.Document,
  Type.Pragma,
  Type.MacroDefinition,
  Type.ProcedureDefinition,
  Type.FunctionDefinition,
  Type.WidgetDefinition,
  Type.RulesPragma,
  Type.ImportPragma,
  Type.ParametersPragma,
  Type.WhitespacePragma,
  Type.Paragraph,
  Type.Heading1, Type.Heading2, Type.Heading3, Type.Heading4, Type.Heading5, Type.Heading6,
  Type.BulletList,
  Type.OrderedList,
  Type.DefinitionList,
  Type.ListItem,
  Type.DefinitionTerm,
  Type.DefinitionDescription,
  Type.BlockQuote,
  Type.Table,
  Type.TableHeader,
  Type.TableBody,
  Type.TableFooter,
  Type.TableCaption,
  Type.TableRow,
  Type.FencedCode,
  Type.TypedBlock,
  Type.HorizontalRule,
  Type.CommentBlock,
  Type.HTMLBlock,
  Type.Widget,
  Type.TransclusionBlock,
  Type.FilteredTransclusionBlock,
  Type.MacroCallBlock,
])

// Composite block types (can contain other blocks)
export const CompositeBlockTypes = new Set([
  Type.Document,
  Type.MacroDefinition,
  Type.ProcedureDefinition,
  Type.FunctionDefinition,
  Type.WidgetDefinition,
  Type.BulletList,
  Type.OrderedList,
  Type.DefinitionList,
  Type.BlockQuote,
  Type.Table,
  Type.TableHeader,
  Type.TableBody,
  Type.TableFooter,
  Type.Widget,
  Type.HTMLBlock,
])
