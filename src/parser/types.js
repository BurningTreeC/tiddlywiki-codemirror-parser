/**
 * TiddlyWiki Parser - Node Types
 *
 * Following the Lezer Markdown architecture, this enum defines all node types
 * used in the TiddlyWiki parse tree.
 */
export var Type;
(function (Type) {
    // Document root
    Type[Type["Document"] = 1] = "Document";
    // === PRAGMAS (must appear at document start) ===
    Type[Type["Pragma"] = 2] = "Pragma";
    Type[Type["PragmaMark"] = 3] = "PragmaMark";
    Type[Type["PragmaKeyword"] = 4] = "PragmaKeyword";
    Type[Type["PragmaName"] = 5] = "PragmaName";
    Type[Type["PragmaParams"] = 6] = "PragmaParams";
    Type[Type["PragmaBody"] = 7] = "PragmaBody";
    Type[Type["PragmaEnd"] = 8] = "PragmaEnd";
    Type[Type["MacroDefinition"] = 9] = "MacroDefinition";
    Type[Type["ProcedureDefinition"] = 10] = "ProcedureDefinition";
    Type[Type["FunctionDefinition"] = 11] = "FunctionDefinition";
    Type[Type["WidgetDefinition"] = 12] = "WidgetDefinition";
    Type[Type["RulesPragma"] = 13] = "RulesPragma";
    Type[Type["ImportPragma"] = 14] = "ImportPragma";
    Type[Type["ParametersPragma"] = 15] = "ParametersPragma";
    Type[Type["WhitespacePragma"] = 16] = "WhitespacePragma";
    // === BLOCK ELEMENTS ===
    Type[Type["Paragraph"] = 17] = "Paragraph";
    // Headings
    Type[Type["Heading1"] = 18] = "Heading1";
    Type[Type["Heading2"] = 19] = "Heading2";
    Type[Type["Heading3"] = 20] = "Heading3";
    Type[Type["Heading4"] = 21] = "Heading4";
    Type[Type["Heading5"] = 22] = "Heading5";
    Type[Type["Heading6"] = 23] = "Heading6";
    Type[Type["HeadingMark"] = 24] = "HeadingMark";
    // Lists
    Type[Type["BulletList"] = 25] = "BulletList";
    Type[Type["OrderedList"] = 26] = "OrderedList";
    Type[Type["DefinitionList"] = 27] = "DefinitionList";
    Type[Type["ListItem"] = 28] = "ListItem";
    Type[Type["DefinitionTerm"] = 29] = "DefinitionTerm";
    Type[Type["DefinitionDescription"] = 30] = "DefinitionDescription";
    Type[Type["ListMark"] = 31] = "ListMark";
    // Block quote (multi-line with <<<)
    Type[Type["BlockQuote"] = 32] = "BlockQuote";
    Type[Type["QuoteMark"] = 33] = "QuoteMark";
    Type[Type["BlockQuoteClass"] = 34] = "BlockQuoteClass";
    // Tables
    Type[Type["Table"] = 35] = "Table";
    Type[Type["TableHeader"] = 36] = "TableHeader";
    Type[Type["TableBody"] = 37] = "TableBody";
    Type[Type["TableFooter"] = 38] = "TableFooter";
    Type[Type["TableCaption"] = 39] = "TableCaption";
    Type[Type["TableRow"] = 40] = "TableRow";
    Type[Type["TableCell"] = 41] = "TableCell";
    Type[Type["TableHeaderCell"] = 42] = "TableHeaderCell";
    Type[Type["TableDelimiter"] = 43] = "TableDelimiter";
    Type[Type["TableClass"] = 44] = "TableClass";
    Type[Type["TableMarker"] = 45] = "TableMarker";
    // Code blocks
    Type[Type["FencedCode"] = 46] = "FencedCode";
    Type[Type["CodeMark"] = 47] = "CodeMark";
    Type[Type["CodeInfo"] = 48] = "CodeInfo";
    Type[Type["CodeText"] = 49] = "CodeText";
    Type[Type["PlainText"] = 50] = "PlainText";
    // Typed blocks
    Type[Type["TypedBlock"] = 51] = "TypedBlock";
    Type[Type["TypedBlockMark"] = 52] = "TypedBlockMark";
    Type[Type["TypedBlockType"] = 53] = "TypedBlockType";
    // Hard line breaks block (""" ... """)
    Type[Type["HardLineBreaks"] = 54] = "HardLineBreaks";
    Type[Type["HardLineBreaksMark"] = 55] = "HardLineBreaksMark";
    // KaTeX/LaTeX math blocks ($$ ... $$)
    Type[Type["KaTeXBlock"] = 56] = "KaTeXBlock";
    Type[Type["KaTeXMark"] = 57] = "KaTeXMark";
    Type[Type["LaTeXContent"] = 58] = "LaTeXContent";
    // Other blocks
    Type[Type["HorizontalRule"] = 59] = "HorizontalRule";
    Type[Type["CommentBlock"] = 60] = "CommentBlock";
    Type[Type["CommentMarker"] = 61] = "CommentMarker";
    // HTML/Widget blocks
    Type[Type["HTMLBlock"] = 62] = "HTMLBlock";
    Type[Type["HTMLEndTag"] = 63] = "HTMLEndTag";
    Type[Type["Widget"] = 64] = "Widget";
    Type[Type["WidgetEnd"] = 65] = "WidgetEnd";
    Type[Type["WidgetName"] = 66] = "WidgetName";
    Type[Type["TagName"] = 67] = "TagName";
    Type[Type["TagMark"] = 68] = "TagMark";
    Type[Type["TagAttributes"] = 69] = "TagAttributes";
    Type[Type["Attribute"] = 70] = "Attribute";
    Type[Type["AttributeName"] = 71] = "AttributeName";
    Type[Type["AttributeValue"] = 72] = "AttributeValue";
    Type[Type["AttributeString"] = 73] = "AttributeString";
    Type[Type["AttributeNumber"] = 74] = "AttributeNumber";
    Type[Type["AttributeIndirect"] = 75] = "AttributeIndirect";
    Type[Type["AttributeFiltered"] = 76] = "AttributeFiltered";
    Type[Type["AttributeMacro"] = 77] = "AttributeMacro";
    Type[Type["AttributeSubstituted"] = 78] = "AttributeSubstituted";
    Type[Type["AttributeParamRef"] = 79] = "AttributeParamRef";
    Type[Type["AttributeWikitext"] = 80] = "AttributeWikitext";
    Type[Type["SelfClosingMarker"] = 81] = "SelfClosingMarker";
    // Transclusion blocks
    Type[Type["TransclusionBlock"] = 82] = "TransclusionBlock";
    Type[Type["FilteredTransclusionBlock"] = 83] = "FilteredTransclusionBlock";
    Type[Type["MacroCallBlock"] = 84] = "MacroCallBlock";
    // === INLINE ELEMENTS ===
    // Emphasis
    Type[Type["Bold"] = 85] = "Bold";
    Type[Type["BoldMark"] = 86] = "BoldMark";
    Type[Type["Italic"] = 87] = "Italic";
    Type[Type["ItalicMark"] = 88] = "ItalicMark";
    Type[Type["Underline"] = 89] = "Underline";
    Type[Type["UnderlineMark"] = 90] = "UnderlineMark";
    Type[Type["Strikethrough"] = 91] = "Strikethrough";
    Type[Type["StrikethroughMark"] = 92] = "StrikethroughMark";
    Type[Type["Superscript"] = 93] = "Superscript";
    Type[Type["SuperscriptMark"] = 94] = "SuperscriptMark";
    Type[Type["Subscript"] = 95] = "Subscript";
    Type[Type["SubscriptMark"] = 96] = "SubscriptMark";
    Type[Type["Highlight"] = 97] = "Highlight";
    Type[Type["HighlightMark"] = 98] = "HighlightMark";
    Type[Type["HighlightStyles"] = 99] = "HighlightStyles";
    // Code
    Type[Type["InlineCode"] = 100] = "InlineCode";
    Type[Type["InlineCodeMark"] = 101] = "InlineCodeMark";
    // Links
    Type[Type["WikiLink"] = 102] = "WikiLink";
    Type[Type["WikiLinkMark"] = 103] = "WikiLinkMark";
    Type[Type["LinkText"] = 104] = "LinkText";
    Type[Type["LinkSeparator"] = 105] = "LinkSeparator";
    Type[Type["LinkTarget"] = 106] = "LinkTarget";
    Type[Type["ExternalLink"] = 107] = "ExternalLink";
    Type[Type["ExtLinkMark"] = 108] = "ExtLinkMark";
    Type[Type["ImageLink"] = 109] = "ImageLink";
    Type[Type["ImageMark"] = 110] = "ImageMark";
    Type[Type["ImageSource"] = 111] = "ImageSource";
    Type[Type["ImageWidth"] = 112] = "ImageWidth";
    Type[Type["ImageHeight"] = 113] = "ImageHeight";
    Type[Type["ImageClass"] = 114] = "ImageClass";
    Type[Type["ImageAlt"] = 115] = "ImageAlt";
    Type[Type["ImageTooltip"] = 116] = "ImageTooltip";
    Type[Type["CamelCaseLink"] = 117] = "CamelCaseLink";
    Type[Type["SystemLink"] = 118] = "SystemLink";
    Type[Type["URLLink"] = 119] = "URLLink";
    // Transclusions
    Type[Type["Transclusion"] = 120] = "Transclusion";
    Type[Type["TransclusionMark"] = 121] = "TransclusionMark";
    Type[Type["TransclusionTarget"] = 122] = "TransclusionTarget";
    Type[Type["TransclusionFieldMark"] = 123] = "TransclusionFieldMark";
    Type[Type["TransclusionField"] = 124] = "TransclusionField";
    Type[Type["TransclusionIndexMark"] = 125] = "TransclusionIndexMark";
    Type[Type["TransclusionIndex"] = 126] = "TransclusionIndex";
    Type[Type["TransclusionTemplate"] = 127] = "TransclusionTemplate";
    Type[Type["FilteredTransclusion"] = 128] = "FilteredTransclusion";
    Type[Type["FilteredTransclusionMark"] = 129] = "FilteredTransclusionMark";
    Type[Type["FilterExpression"] = 130] = "FilterExpression";
    // Macro calls
    Type[Type["MacroCall"] = 131] = "MacroCall";
    Type[Type["MacroCallMark"] = 132] = "MacroCallMark";
    Type[Type["MacroName"] = 133] = "MacroName";
    Type[Type["MacroParam"] = 134] = "MacroParam";
    Type[Type["MacroParamName"] = 135] = "MacroParamName";
    Type[Type["MacroParamValue"] = 136] = "MacroParamValue";
    // Widgets (inline)
    Type[Type["InlineWidget"] = 137] = "InlineWidget";
    // HTML tags (inline)
    Type[Type["HTMLTag"] = 138] = "HTMLTag";
    Type[Type["OpenTag"] = 139] = "OpenTag";
    Type[Type["CloseTag"] = 140] = "CloseTag";
    // Special
    Type[Type["Escape"] = 141] = "Escape";
    Type[Type["Entity"] = 142] = "Entity";
    Type[Type["HardBreak"] = 143] = "HardBreak";
    Type[Type["Dash"] = 144] = "Dash";
    Type[Type["InvalidWidget"] = 145] = "InvalidWidget";
    Type[Type["IncompleteWidget"] = 146] = "IncompleteWidget";
    Type[Type["IncompleteHTMLTag"] = 147] = "IncompleteHTMLTag";
    Type[Type["IncompleteHTMLBlock"] = 148] = "IncompleteHTMLBlock";
    Type[Type["Variable"] = 149] = "Variable";
    Type[Type["VariableMark"] = 150] = "VariableMark";
    Type[Type["VariableName"] = 151] = "VariableName";
    Type[Type["FilterSubstitution"] = 152] = "FilterSubstitution";
    Type[Type["FilterSubstitutionMark"] = 153] = "FilterSubstitutionMark";
    Type[Type["Placeholder"] = 154] = "Placeholder";
    Type[Type["PlaceholderMark"] = 155] = "PlaceholderMark";
    Type[Type["SubstitutedParam"] = 156] = "SubstitutedParam";
    Type[Type["SubstitutedParamMark"] = 157] = "SubstitutedParamMark";
    Type[Type["SubstitutedParamName"] = 158] = "SubstitutedParamName";
    // Filter expression components
    Type[Type["FilterRun"] = 159] = "FilterRun";
    Type[Type["FilterOperator"] = 160] = "FilterOperator";
    Type[Type["FilterOperatorName"] = 161] = "FilterOperatorName";
    Type[Type["FilterOperand"] = 162] = "FilterOperand";
    Type[Type["FilterVariable"] = 163] = "FilterVariable";
    Type[Type["FilterMultiVariable"] = 164] = "FilterMultiVariable";
    Type[Type["FilterTextRef"] = 165] = "FilterTextRef";
    Type[Type["FilterRegexp"] = 166] = "FilterRegexp";
    Type[Type["IncompleteFilterRun"] = 167] = "IncompleteFilterRun";
    // Multi-valued variable display
    Type[Type["MVVDisplay"] = 168] = "MVVDisplay";
    Type[Type["MVVDisplayMark"] = 169] = "MVVDisplayMark";
    Type[Type["MVVSeparatorMark"] = 170] = "MVVSeparatorMark";
    Type[Type["MVVSeparatorValue"] = 171] = "MVVSeparatorValue";
    // Multi-valued variable attribute
    Type[Type["AttributeMVV"] = 172] = "AttributeMVV";
    // Styled blocks (.class prefix)
    Type[Type["StyledBlock"] = 173] = "StyledBlock";
    Type[Type["StyledBlockMark"] = 174] = "StyledBlockMark";
    Type[Type["StyledBlockClass"] = 175] = "StyledBlockClass";
    // Conditionals (<%if%>, <%elseif%>, <%else%>, <%endif%>)
    Type[Type["ConditionalBlock"] = 176] = "ConditionalBlock";
    Type[Type["Conditional"] = 177] = "Conditional";
    Type[Type["ConditionalMark"] = 178] = "ConditionalMark";
    Type[Type["ConditionalKeyword"] = 179] = "ConditionalKeyword";
    Type[Type["ConditionalBranch"] = 180] = "ConditionalBranch";
    // Text
    Type[Type["Text"] = 181] = "Text";
    // Marks (for processing instructions/delimiters that shouldn't render)
    Type[Type["ProcessingInstruction"] = 182] = "ProcessingInstruction";
    Type[Type["Mark"] = 183] = "Mark";
})(Type || (Type = {}));
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
    Type.HardLineBreaks,
    Type.HorizontalRule,
    Type.CommentBlock,
    Type.HTMLBlock,
    Type.IncompleteHTMLBlock,
    Type.Widget,
    Type.IncompleteWidget,
    Type.TransclusionBlock,
    Type.FilteredTransclusionBlock,
    Type.MacroCallBlock,
]);
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
]);
//# sourceMappingURL=types.js.map