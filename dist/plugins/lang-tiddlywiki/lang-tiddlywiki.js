/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-tiddlywiki/lang-tiddlywiki.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki5 language support for CodeMirror 6
Built with Rollup - DO NOT EDIT DIRECTLY

@license MIT
\*/
/*jslint node: true, browser: true */
/*global $tw: false */

"use strict";


'use strict';

var state = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-state.js');
var view = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-view.js');
var common = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-common.js');
var highlight = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-highlight.js');
var language = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-language.js');
var autocomplete = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-autocomplete.js');
var langHtml = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-lang-html.js');

/**
 * TiddlyWiki Parser - Node Types
 *
 * Following the Lezer Markdown architecture, this enum defines all node types
 * used in the TiddlyWiki parse tree.
 */
var Type;
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
    // Tables
    Type[Type["Table"] = 34] = "Table";
    Type[Type["TableHeader"] = 35] = "TableHeader";
    Type[Type["TableBody"] = 36] = "TableBody";
    Type[Type["TableFooter"] = 37] = "TableFooter";
    Type[Type["TableCaption"] = 38] = "TableCaption";
    Type[Type["TableRow"] = 39] = "TableRow";
    Type[Type["TableCell"] = 40] = "TableCell";
    Type[Type["TableHeaderCell"] = 41] = "TableHeaderCell";
    Type[Type["TableDelimiter"] = 42] = "TableDelimiter";
    Type[Type["TableClass"] = 43] = "TableClass";
    Type[Type["TableMarker"] = 44] = "TableMarker";
    // Code blocks
    Type[Type["FencedCode"] = 45] = "FencedCode";
    Type[Type["CodeMark"] = 46] = "CodeMark";
    Type[Type["CodeInfo"] = 47] = "CodeInfo";
    Type[Type["CodeText"] = 48] = "CodeText";
    // Typed blocks
    Type[Type["TypedBlock"] = 49] = "TypedBlock";
    Type[Type["TypedBlockMark"] = 50] = "TypedBlockMark";
    Type[Type["TypedBlockType"] = 51] = "TypedBlockType";
    // Other blocks
    Type[Type["HorizontalRule"] = 52] = "HorizontalRule";
    Type[Type["CommentBlock"] = 53] = "CommentBlock";
    Type[Type["CommentMarker"] = 54] = "CommentMarker";
    // HTML/Widget blocks
    Type[Type["HTMLBlock"] = 55] = "HTMLBlock";
    Type[Type["HTMLEndTag"] = 56] = "HTMLEndTag";
    Type[Type["Widget"] = 57] = "Widget";
    Type[Type["WidgetEnd"] = 58] = "WidgetEnd";
    Type[Type["WidgetName"] = 59] = "WidgetName";
    Type[Type["TagName"] = 60] = "TagName";
    Type[Type["TagAttributes"] = 61] = "TagAttributes";
    Type[Type["Attribute"] = 62] = "Attribute";
    Type[Type["AttributeName"] = 63] = "AttributeName";
    Type[Type["AttributeValue"] = 64] = "AttributeValue";
    Type[Type["AttributeString"] = 65] = "AttributeString";
    Type[Type["AttributeNumber"] = 66] = "AttributeNumber";
    Type[Type["AttributeIndirect"] = 67] = "AttributeIndirect";
    Type[Type["AttributeFiltered"] = 68] = "AttributeFiltered";
    Type[Type["AttributeMacro"] = 69] = "AttributeMacro";
    Type[Type["AttributeSubstituted"] = 70] = "AttributeSubstituted";
    Type[Type["SelfClosingMarker"] = 71] = "SelfClosingMarker";
    // Transclusion blocks
    Type[Type["TransclusionBlock"] = 72] = "TransclusionBlock";
    Type[Type["FilteredTransclusionBlock"] = 73] = "FilteredTransclusionBlock";
    Type[Type["MacroCallBlock"] = 74] = "MacroCallBlock";
    // === INLINE ELEMENTS ===
    // Emphasis
    Type[Type["Bold"] = 75] = "Bold";
    Type[Type["BoldMark"] = 76] = "BoldMark";
    Type[Type["Italic"] = 77] = "Italic";
    Type[Type["ItalicMark"] = 78] = "ItalicMark";
    Type[Type["Underline"] = 79] = "Underline";
    Type[Type["UnderlineMark"] = 80] = "UnderlineMark";
    Type[Type["Strikethrough"] = 81] = "Strikethrough";
    Type[Type["StrikethroughMark"] = 82] = "StrikethroughMark";
    Type[Type["Superscript"] = 83] = "Superscript";
    Type[Type["SuperscriptMark"] = 84] = "SuperscriptMark";
    Type[Type["Subscript"] = 85] = "Subscript";
    Type[Type["SubscriptMark"] = 86] = "SubscriptMark";
    Type[Type["Highlight"] = 87] = "Highlight";
    Type[Type["HighlightMark"] = 88] = "HighlightMark";
    // Code
    Type[Type["InlineCode"] = 89] = "InlineCode";
    Type[Type["InlineCodeMark"] = 90] = "InlineCodeMark";
    // Links
    Type[Type["WikiLink"] = 91] = "WikiLink";
    Type[Type["WikiLinkMark"] = 92] = "WikiLinkMark";
    Type[Type["LinkText"] = 93] = "LinkText";
    Type[Type["LinkSeparator"] = 94] = "LinkSeparator";
    Type[Type["LinkTarget"] = 95] = "LinkTarget";
    Type[Type["ExternalLink"] = 96] = "ExternalLink";
    Type[Type["ExtLinkMark"] = 97] = "ExtLinkMark";
    Type[Type["ImageLink"] = 98] = "ImageLink";
    Type[Type["ImageMark"] = 99] = "ImageMark";
    Type[Type["ImageSource"] = 100] = "ImageSource";
    Type[Type["ImageWidth"] = 101] = "ImageWidth";
    Type[Type["ImageHeight"] = 102] = "ImageHeight";
    Type[Type["ImageClass"] = 103] = "ImageClass";
    Type[Type["ImageAlt"] = 104] = "ImageAlt";
    Type[Type["ImageTooltip"] = 105] = "ImageTooltip";
    Type[Type["CamelCaseLink"] = 106] = "CamelCaseLink";
    Type[Type["SystemLink"] = 107] = "SystemLink";
    Type[Type["URLLink"] = 108] = "URLLink";
    // Transclusions
    Type[Type["Transclusion"] = 109] = "Transclusion";
    Type[Type["TransclusionMark"] = 110] = "TransclusionMark";
    Type[Type["TransclusionTarget"] = 111] = "TransclusionTarget";
    Type[Type["TransclusionField"] = 112] = "TransclusionField";
    Type[Type["TransclusionIndex"] = 113] = "TransclusionIndex";
    Type[Type["TransclusionTemplate"] = 114] = "TransclusionTemplate";
    Type[Type["FilteredTransclusion"] = 115] = "FilteredTransclusion";
    Type[Type["FilteredTransclusionMark"] = 116] = "FilteredTransclusionMark";
    Type[Type["FilterExpression"] = 117] = "FilterExpression";
    // Macro calls
    Type[Type["MacroCall"] = 118] = "MacroCall";
    Type[Type["MacroCallMark"] = 119] = "MacroCallMark";
    Type[Type["MacroName"] = 120] = "MacroName";
    Type[Type["MacroParam"] = 121] = "MacroParam";
    Type[Type["MacroParamName"] = 122] = "MacroParamName";
    Type[Type["MacroParamValue"] = 123] = "MacroParamValue";
    // Widgets (inline)
    Type[Type["InlineWidget"] = 124] = "InlineWidget";
    // HTML tags (inline)
    Type[Type["HTMLTag"] = 125] = "HTMLTag";
    Type[Type["OpenTag"] = 126] = "OpenTag";
    Type[Type["CloseTag"] = 127] = "CloseTag";
    // Special
    Type[Type["Escape"] = 128] = "Escape";
    Type[Type["Entity"] = 129] = "Entity";
    Type[Type["HardBreak"] = 130] = "HardBreak";
    Type[Type["Dash"] = 131] = "Dash";
    Type[Type["Variable"] = 132] = "Variable";
    Type[Type["VariableMark"] = 133] = "VariableMark";
    Type[Type["VariableName"] = 134] = "VariableName";
    Type[Type["FilterSubstitution"] = 135] = "FilterSubstitution";
    Type[Type["FilterSubstitutionMark"] = 136] = "FilterSubstitutionMark";
    Type[Type["Placeholder"] = 137] = "Placeholder";
    Type[Type["PlaceholderMark"] = 138] = "PlaceholderMark";
    // Filter expression components
    Type[Type["FilterRun"] = 139] = "FilterRun";
    Type[Type["FilterOperator"] = 140] = "FilterOperator";
    Type[Type["FilterOperatorName"] = 141] = "FilterOperatorName";
    Type[Type["FilterOperand"] = 142] = "FilterOperand";
    Type[Type["FilterVariable"] = 143] = "FilterVariable";
    Type[Type["FilterTextRef"] = 144] = "FilterTextRef";
    Type[Type["FilterRegexp"] = 145] = "FilterRegexp";
    // Styled blocks (.class prefix)
    Type[Type["StyledBlock"] = 146] = "StyledBlock";
    Type[Type["StyledBlockMark"] = 147] = "StyledBlockMark";
    Type[Type["StyledBlockClass"] = 148] = "StyledBlockClass";
    // Conditionals (<%if%>, <%elseif%>, <%else%>, <%endif%>)
    Type[Type["ConditionalBlock"] = 149] = "ConditionalBlock";
    Type[Type["ConditionalMark"] = 150] = "ConditionalMark";
    Type[Type["ConditionalKeyword"] = 151] = "ConditionalKeyword";
    Type[Type["ConditionalBranch"] = 152] = "ConditionalBranch";
    // Text
    Type[Type["Text"] = 153] = "Text";
    // Marks (for processing instructions/delimiters that shouldn't render)
    Type[Type["ProcessingInstruction"] = 154] = "ProcessingInstruction";
    Type[Type["Mark"] = 155] = "Mark";
})(Type || (Type = {}));
// Block-level types
new Set([
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
]);
// Composite block types (can contain other blocks)
new Set([
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

/**
 * TiddlyWiki Parser - Core Classes
 *
 * Following the Lezer Markdown architecture with adaptations for TiddlyWiki.
 */
// Character codes for common characters
var Ch;
(function (Ch) {
    Ch[Ch["Space"] = 32] = "Space";
    Ch[Ch["Tab"] = 9] = "Tab";
    Ch[Ch["Newline"] = 10] = "Newline";
    Ch[Ch["CarriageReturn"] = 13] = "CarriageReturn";
    Ch[Ch["Backslash"] = 92] = "Backslash";
    Ch[Ch["Exclamation"] = 33] = "Exclamation";
    Ch[Ch["Hash"] = 35] = "Hash";
    Ch[Ch["Dollar"] = 36] = "Dollar";
    Ch[Ch["Percent"] = 37] = "Percent";
    Ch[Ch["Ampersand"] = 38] = "Ampersand";
    Ch[Ch["Apostrophe"] = 39] = "Apostrophe";
    Ch[Ch["LeftParen"] = 40] = "LeftParen";
    Ch[Ch["RightParen"] = 41] = "RightParen";
    Ch[Ch["Asterisk"] = 42] = "Asterisk";
    Ch[Ch["Plus"] = 43] = "Plus";
    Ch[Ch["Comma"] = 44] = "Comma";
    Ch[Ch["Dash"] = 45] = "Dash";
    Ch[Ch["Dot"] = 46] = "Dot";
    Ch[Ch["Slash"] = 47] = "Slash";
    Ch[Ch["Colon"] = 58] = "Colon";
    Ch[Ch["Semicolon"] = 59] = "Semicolon";
    Ch[Ch["LessThan"] = 60] = "LessThan";
    Ch[Ch["Equals"] = 61] = "Equals";
    Ch[Ch["GreaterThan"] = 62] = "GreaterThan";
    Ch[Ch["Question"] = 63] = "Question";
    Ch[Ch["At"] = 64] = "At";
    Ch[Ch["LeftBracket"] = 91] = "LeftBracket";
    Ch[Ch["RightBracket"] = 93] = "RightBracket";
    Ch[Ch["Caret"] = 94] = "Caret";
    Ch[Ch["Underscore"] = 95] = "Underscore";
    Ch[Ch["Backtick"] = 96] = "Backtick";
    Ch[Ch["LeftBrace"] = 123] = "LeftBrace";
    Ch[Ch["Pipe"] = 124] = "Pipe";
    Ch[Ch["RightBrace"] = 125] = "RightBrace";
    Ch[Ch["Tilde"] = 126] = "Tilde";
})(Ch || (Ch = {}));
/**
 * Check if a character code represents whitespace (space or tab)
 */
function space(ch) {
    return ch === Ch.Space || ch === Ch.Tab;
}
/**
 * Element represents a node in the parse tree
 */
class Element {
    constructor(type, from, to, children = []) {
        this.type = type;
        this.from = from;
        this.to = to;
        this.children = children;
    }
}
/**
 * Create an Element more concisely
 */
function elt(type, from, to, children) {
    return new Element(type, from, to, children);
}
/**
 * Represents a line of text being parsed
 */
class Line {
    constructor() {
        /** The full text of the line */
        this.text = "";
        /** Base indent level (for nested blocks) */
        this.baseIndent = 0;
        /** Base position within line (after block markers) */
        this.basePos = 0;
        /** Nesting depth for composite blocks */
        this.depth = 0;
        /** Block markers found on this line */
        this.markers = [];
        /** Current parsing position within line */
        this.pos = 0;
        /** Indentation at current position */
        this.indent = 0;
        /** Character code at current position, or -1 at end */
        this.next = -1;
    }
    /**
     * Move forward past whitespace, updating pos, indent, and next
     */
    skipSpace(from) {
        let pos = from;
        while (pos < this.text.length) {
            const ch = this.text.charCodeAt(pos);
            if (!space(ch))
                break;
            pos++;
        }
        return pos;
    }
    /**
     * Move the base position forward
     */
    moveBase(pos) {
        this.basePos = pos;
        this.baseIndent = this.countIndent(pos, this.text.length);
    }
    /**
     * Move the base position forward past the given number of characters
     */
    moveBaseColumn(columns) {
        this.moveBase(this.findColumn(columns));
    }
    /**
     * Add a block marker for this line
     */
    addMarker(elt) {
        this.markers.push(elt);
    }
    /**
     * Count the indentation at a position
     */
    countIndent(to, from = 0, indent = 0) {
        for (let i = from; i < to; i++) {
            const ch = this.text.charCodeAt(i);
            if (ch === Ch.Space)
                indent++;
            else if (ch === Ch.Tab)
                indent += 4 - (indent % 4);
            else
                break;
        }
        return indent;
    }
    /**
     * Find the position that corresponds to a given column
     */
    findColumn(goal) {
        let i = 0, col = 0;
        while (i < this.text.length && col < goal) {
            const ch = this.text.charCodeAt(i);
            if (ch === Ch.Tab)
                col += 4 - (col % 4);
            else
                col++;
            i++;
        }
        return i;
    }
    /**
     * Reset line state for a new line
     */
    reset(text) {
        this.text = text;
        this.baseIndent = this.basePos = this.pos = this.indent = 0;
        this.depth = 0;
        this.markers = [];
        this.next = text.length ? text.charCodeAt(0) : -1;
    }
    /**
     * Scrub text, replacing leading block markers with spaces
     */
    scrub() {
        if (!this.basePos)
            return this.text;
        let result = "";
        for (const m of this.markers)
            result += this.text.slice(result.length, m.from) + " ".repeat(m.to - m.from);
        return result + this.text.slice(result.length);
    }
}
/**
 * Represents a composite block (one that can contain other blocks)
 */
class CompositeBlock {
    /** Hash for incremental parsing */
    static create(type, value, from, parentHash, end) {
        const hash = (parentHash + (parentHash << 8) + type + (value << 4)) | 0;
        return new CompositeBlock(type, value, from, hash, end, [], []);
    }
    constructor(type, value, from, hash, end, children, positions) {
        this.type = type;
        this.value = value;
        this.from = from;
        this.hash = hash;
        this.end = end;
        this.children = children;
        this.positions = positions;
    }
    addChild(child, pos) {
        if (child.prop(common.NodeProp.contextHash) !== this.hash)
            child = new common.Tree(child.type, child.children, child.positions, child.length, [[common.NodeProp.contextHash, this.hash]]);
        this.children.push(child);
        this.positions.push(pos);
    }
    toTree(nodeSet, end = this.end) {
        const last = this.children.length - 1;
        if (last >= 0)
            end = Math.max(end, this.positions[last] + this.children[last].length + this.from);
        return new common.Tree(nodeSet.types[this.type], this.children, this.positions, end - this.from).balance({
            makeTree: (children, positions, length) => new common.Tree(common.NodeType.none, children, positions, length, [[common.NodeProp.contextHash, this.hash]])
        });
    }
}
/**
 * Inline delimiter for emphasis-style markers
 */
class InlineDelimiter {
    constructor(type, from, to, side // 1 = open, 2 = close, 3 = both
    ) {
        this.type = type;
        this.from = from;
        this.to = to;
        this.side = side;
    }
}

/**
 * TiddlyWiki Parser - Block Context
 *
 * Handles block-level parsing following the Lezer Markdown architecture.
 */
// Buffer for building parse tree
class Buffer {
    constructor() {
        this.content = [];
        this.nodes = [];
    }
    write(type, from, to, children = 0) {
        this.content.push(type, from, to, 4 + children * 4);
    }
    writeElements(elts, offset = 0) {
        for (const elt of elts)
            this.writeElement(elt, offset);
    }
    writeElement(elt, offset = 0) {
        const startOff = this.content.length;
        this.writeElements(elt.children, offset);
        this.content.push(elt.type, elt.from + offset, elt.to + offset, (this.content.length + 4 - startOff));
    }
    finish(type, length) {
        return common.Tree.build({
            buffer: this.content,
            nodeSet: this.nodeSet, // Will be set by context
            topID: type,
            length
        });
    }
}
/**
 * BlockContext manages block-level parsing state
 */
class BlockContext {
    /**
     * Save the current parsing position for potential restore
     */
    savePosition() {
        return {
            lineStart: this.lineStart,
            lineEnd: this.lineEnd,
            lineText: this._line.text,
            atEnd: this.atEnd
        };
    }
    /**
     * Restore a previously saved parsing position
     */
    restorePosition(saved) {
        this.lineStart = saved.lineStart;
        this.lineEnd = saved.lineEnd;
        this._line.reset(saved.lineText);
        this.atEnd = saved.atEnd;
    }
    constructor(parser, input, fragments, ranges) {
        this.parser = parser;
        this.input = input;
        this.ranges = ranges;
        this.buf = new Buffer();
        this.stack = [];
        this.atEnd = false;
        this.dontInject = new Set();
        // Fragment parsing (for incremental updates)
        this.fragments = null;
        this.fragmentIndex = 0;
        this.fragmentEnd = -1;
        this.lineStart = 0;
        this.lineEnd = 0;
        this.stoppedAt = null;
        this.to = ranges[ranges.length - 1].to;
        this.fragments = fragments.length ? fragments : null;
        this.buf.nodeSet = parser.nodeSet;
        // Initialize the document composite block
        const rootBlock = CompositeBlock.create(Type.Document, 0, ranges[0].from, 0, 0);
        this.stack.push(rootBlock);
        this._line = new Line();
        this.lineStart = ranges[0].from;
        this.lineEnd = this.lineStart;
        this.moveToNextLine();
    }
    get line() { return this._line; }
    get parsers() {
        return this.parser.blockParsers;
    }
    get pragmaParsers() {
        return this.parser.pragmaParsers;
    }
    /**
     * The current block context
     */
    get block() {
        return this.stack[this.stack.length - 1];
    }
    /**
     * Get the end position of the previous line
     */
    prevLineEnd() {
        return this.lineStart > 0 ? this.lineStart - 1 : 0;
    }
    /**
     * Move to the next line
     */
    nextLine() {
        this.lineStart = this.lineEnd;
        if (this.lineStart >= this.to) {
            this.atEnd = true;
            return false;
        }
        this.lineEnd = this.findLineEnd();
        this._line.reset(this.readLineText());
        return true;
    }
    /**
     * Peek at the next line without consuming it (without trailing newline)
     */
    peekLine() {
        const start = this.lineEnd;
        if (start >= this.to)
            return null;
        let end = this.findLineEnd(start);
        // Strip trailing newline
        if (end > start) {
            const lastChar = this.input.read(end - 1, end).charCodeAt(0);
            if (lastChar === Ch.Newline) {
                end--;
                if (end > start && this.input.read(end - 1, end).charCodeAt(0) === Ch.CarriageReturn) {
                    end--;
                }
            }
        }
        return this.input.read(start, end);
    }
    /**
     * Find the end of the line starting at pos (position after the newline)
     * lineEnd points to after the newline, but line.text excludes the newline
     */
    findLineEnd(pos = this.lineEnd) {
        let end = pos;
        while (end < this.to) {
            const ch = this.input.read(end, end + 1).charCodeAt(0);
            if (ch === Ch.Newline) {
                return end + 1; // Return position after newline
            }
            if (ch === Ch.CarriageReturn) {
                end++;
                if (end < this.to && this.input.read(end, end + 1).charCodeAt(0) === Ch.Newline)
                    end++;
                return end;
            }
            end++;
        }
        return end;
    }
    /**
     * Read line text without the trailing newline
     */
    readLineText() {
        let end = this.lineEnd;
        // Strip trailing newline
        if (end > this.lineStart) {
            const lastChar = this.input.read(end - 1, end).charCodeAt(0);
            if (lastChar === Ch.Newline) {
                end--;
                if (end > this.lineStart && this.input.read(end - 1, end).charCodeAt(0) === Ch.CarriageReturn) {
                    end--;
                }
            }
        }
        return this.input.read(this.lineStart, end);
    }
    /**
     * Move to the next line for parsing
     */
    moveToNextLine() {
        if (!this.nextLine()) {
            this._line.reset("");
        }
    }
    /**
     * Start a new composite block context
     */
    startContext(type, start, value = 0) {
        const block = CompositeBlock.create(type, value, start, this.block.hash, start);
        this.stack.push(block);
        this.addNode(type, start);
    }
    /**
     * Start a composite block without immediately adding it
     */
    startComposite(type, start, value = 0) {
        const block = CompositeBlock.create(type, value, start, this.block.hash, start);
        this.stack.push(block);
    }
    /**
     * Add an element to the buffer
     */
    addElement(elt) {
        this.buf.writeElement(elt, -this.block.from);
    }
    /**
     * Add a node to the current composite block
     */
    addNode(block, from, to) {
        if (typeof block === "number") {
            this.buf.write(block, from - this.block.from, (to ?? from) - this.block.from, 0);
        }
        else {
            this.block.addChild(block, from - this.block.from);
        }
    }
    /**
     * Add an element for a leaf block
     */
    addLeafElement(leaf, elt) {
        this.addElement(this.elt(elt.type, elt.from, elt.to, [
            ...leaf.marks.map(m => this.elt(m.type, m.from, m.to)),
            ...elt.children
        ]));
    }
    /**
     * Finish the current composite block context
     */
    finishContext() {
        const cx = this.stack.pop();
        const tree = cx.toTree(this.parser.nodeSet);
        if (!this.dontInject.has(tree)) {
            this.block.addChild(tree, cx.from - this.block.from);
        }
    }
    /**
     * Create an element
     */
    elt(type, from, to, children) {
        return new Element(type, from, to, children);
    }
    /**
     * Main parsing loop - called to advance parsing
     */
    advance() {
        if (this.stoppedAt !== null && this.lineStart > this.stoppedAt) {
            return this.finishDocument();
        }
        // Parse pragmas at start of document
        if (this.lineStart === this.ranges[0].from) {
            this.parsePragmas();
        }
        // Parse blocks until we run out of input
        while (!this.atEnd) {
            this.parseBlock();
        }
        return this.finishDocument();
    }
    /**
     * Parse pragmas at document start
     */
    parsePragmas() {
        while (!this.atEnd) {
            // Skip whitespace lines
            const lineText = this._line.text;
            const trimmed = lineText.trim();
            if (trimmed === "") {
                this.nextLine();
                continue;
            }
            // Check if this line starts with a pragma
            if (lineText.charCodeAt(this._line.skipSpace(0)) !== Ch.Backslash) {
                break;
            }
            // Try each pragma parser
            let matched = false;
            for (const parser of this.pragmaParsers) {
                const result = parser.parse(this, this._line);
                if (result !== null) {
                    for (const elt of result) {
                        this.addElement(elt);
                    }
                    matched = true;
                    break;
                }
            }
            if (!matched)
                break;
        }
    }
    /**
     * Parse a single block
     */
    parseBlock() {
        // Skip empty lines
        const lineText = this._line.text;
        if (lineText.trim() === "") {
            this.nextLine();
            return;
        }
        // Try each block parser
        for (const parser of this.parsers) {
            const result = parser.parse(this, this._line);
            if (result !== false) {
                if (result === true) {
                    // Leaf block consumed, move to next line
                    this.nextLine();
                }
                // null means composite block started, continue on same line
                return;
            }
        }
        // Default: parse as paragraph
        this.parseParagraph();
    }
    /**
     * Parse a paragraph (default fallback)
     */
    parseParagraph() {
        const start = this.lineStart;
        const content = [this._line.text];
        // Consume lines until we hit a blank line or block element
        while (this.nextLine()) {
            const text = this._line.text;
            if (text.trim() === "")
                break;
            // Check if this line starts a new block
            let startsBlock = false;
            for (const parser of this.parsers) {
                // Simple check - if any parser matches at position 0, it's a new block
                const firstChar = text.charCodeAt(0);
                if (this.isBlockStarter(text, firstChar)) {
                    startsBlock = true;
                    break;
                }
            }
            if (startsBlock)
                break;
            content.push(text);
        }
        // Parse inline content
        const fullContent = content.join("\n");
        const inlineElements = this.parser.parseInline(fullContent, start);
        // Create paragraph element
        const paragraphElt = this.elt(Type.Paragraph, start, start + fullContent.length, inlineElements);
        this.addElement(paragraphElt);
    }
    /**
     * Quick check if a line starts a block element
     */
    isBlockStarter(text, firstChar) {
        if (firstChar === Ch.Exclamation)
            return true; // Heading
        if (firstChar === Ch.Asterisk || firstChar === Ch.Hash ||
            firstChar === Ch.Semicolon || firstChar === Ch.Colon ||
            firstChar === Ch.GreaterThan)
            return true; // List
        if (firstChar === Ch.Pipe)
            return true; // Table
        if (firstChar === Ch.Backtick && text.startsWith("```"))
            return true; // Code
        if (firstChar === Ch.Dollar && text.startsWith("$$$"))
            return true; // Typed block
        if (firstChar === Ch.Dash && /^-{3,}$/.test(text.trim()))
            return true; // HR
        if (firstChar === Ch.LessThan)
            return true; // HTML/Widget
        if (firstChar === Ch.LeftBrace && text.startsWith("{{"))
            return true; // Transclusion
        if (firstChar === Ch.Backslash)
            return true; // Pragma
        return false;
    }
    /**
     * Finish parsing and return the document tree
     */
    finishDocument() {
        // Close any remaining open contexts
        while (this.stack.length > 1) {
            this.finishContext();
        }
        // Build tree from buffer content
        const docBlock = this.stack[0];
        const bufferContent = this.buf.content;
        if (bufferContent.length > 0) {
            // Use Tree.build to properly interpret the buffer
            const tree = common.Tree.build({
                buffer: bufferContent,
                nodeSet: this.parser.nodeSet,
                topID: Type.Document,
                length: this.to - docBlock.from
            });
            return tree;
        }
        return docBlock.toTree(this.parser.nodeSet, this.to);
    }
    // PartialParse interface
    get parsedPos() {
        return this.lineStart;
    }
    stopAt(pos) {
        this.stoppedAt = pos;
    }
    /**
     * Parse a range of content as blocks and return Elements.
     * Used for recursive parsing of pragma bodies and widget content.
     *
     * This creates a fresh parse of the content range and extracts elements
     * from the resulting tree, avoiding buffer corruption issues.
     *
     * @param from Start position in the document
     * @param to End position in the document
     * @param parsePragmasFirst Whether to parse pragmas at the start of the range
     * @returns Array of parsed elements
     */
    parseContentRange(from, to, parsePragmasFirst = true) {
        if (from >= to)
            return [];
        // Parse the content range as a fresh document
        const content = this.input.read(from, to);
        const tree = this.parser.parse(content);
        // Extract elements from the tree, adjusting positions
        return this.extractElements(tree, from);
    }
    /**
     * Extract Elements from a parsed Tree, adjusting positions by offset
     */
    extractElements(tree, offset) {
        const elements = [];
        const cursor = tree.cursor();
        // Skip the Document node, get its children
        if (cursor.firstChild()) {
            do {
                const element = this.nodeToElement(cursor, offset);
                if (element) {
                    elements.push(element);
                }
            } while (cursor.nextSibling());
        }
        return elements;
    }
    /**
     * Convert a tree node (at cursor position) to an Element
     */
    nodeToElement(cursor, offset) {
        const type = cursor.type.id;
        const from = cursor.from + offset;
        const to = cursor.to + offset;
        const children = [];
        // Recursively convert children
        if (cursor.firstChild()) {
            do {
                const child = this.nodeToElement(cursor, offset);
                if (child) {
                    children.push(child);
                }
            } while (cursor.nextSibling());
            cursor.parent();
        }
        return new Element(type, from, to, children);
    }
}

/**
 * TiddlyWiki Parser - Inline Context
 *
 * Handles inline-level parsing following the Lezer Markdown architecture.
 */
// Flags for delimiter sides
const Open = 1, Close = 2;
/**
 * InlineContext manages inline-level parsing state
 */
class InlineContext {
    constructor(parser, text, offset) {
        this.parser = parser;
        this.text = text;
        this.offset = offset;
        /** Collected parts (elements and delimiters) */
        this.parts = [];
    }
    /**
     * End position of the text
     */
    get end() {
        return this.offset + this.text.length;
    }
    /**
     * Get character code at absolute position
     */
    char(pos) {
        const rel = pos - this.offset;
        if (rel < 0 || rel >= this.text.length)
            return -1;
        return this.text.charCodeAt(rel);
    }
    /**
     * Get a slice of text (absolute positions)
     */
    slice(from, to) {
        const relFrom = Math.max(0, from - this.offset);
        const relTo = Math.min(this.text.length, to - this.offset);
        return this.text.slice(relFrom, relTo);
    }
    /**
     * Check if there's an open link (affects autolink parsing)
     */
    get hasOpenLink() {
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const part = this.parts[i];
            if (part instanceof InlineDelimiter && part.type.isLink)
                return true;
        }
        return false;
    }
    /**
     * Skip whitespace starting at position
     */
    skipSpace(from) {
        let pos = from - this.offset;
        while (pos < this.text.length && space(this.text.charCodeAt(pos)))
            pos++;
        return pos + this.offset;
    }
    /**
     * Add an element directly
     */
    addElement(elt) {
        this.parts.push(elt);
        return elt.to;
    }
    /**
     * Add a delimiter for later resolution
     */
    addDelimiter(type, from, to, open, close) {
        const side = (open ? Open : 0) | (close ? Close : 0);
        this.parts.push(new InlineDelimiter(type, from, to, side));
        return to;
    }
    /**
     * Append an element or delimiter
     */
    append(elt) {
        this.parts.push(elt);
        return elt.to;
    }
    /**
     * Create an element
     */
    elt(type, from, to, children) {
        return new Element(type, from, to, children);
    }
    /**
     * Find an opening delimiter of the given type
     */
    findOpeningDelimiter(type) {
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const part = this.parts[i];
            if (part instanceof InlineDelimiter && part.type === type && (part.side & Open)) {
                return i;
            }
        }
        return null;
    }
    /**
     * Take content from parts starting at an index
     */
    takeContent(startIndex) {
        const content = [];
        for (let i = startIndex; i < this.parts.length; i++) {
            const part = this.parts[i];
            if (part instanceof Element)
                content.push(part);
            else if (part instanceof InlineDelimiter) {
                // Convert delimiter to plain text element
                content.push(this.elt(Type.Text, part.from, part.to));
            }
            // null parts are skipped
        }
        // Remove taken items
        this.parts.length = startIndex;
        return content;
    }
    /**
     * Resolve all collected delimiters into elements
     */
    resolveDelimiters() {
        // Go through all delimiters and try to match them
        for (let i = 0; i < this.parts.length; i++) {
            const part = this.parts[i];
            if (!(part instanceof InlineDelimiter) || !(part.side & Close))
                continue;
            const type = part.type;
            if (!type.resolve)
                continue;
            // Look for matching opener
            let opener = null;
            for (let j = i - 1; j >= 0; j--) {
                const p = this.parts[j];
                if (p instanceof InlineDelimiter && p.type === type && (p.side & Open)) {
                    opener = j;
                    break;
                }
            }
            if (opener === null)
                continue;
            // Collect content between opener and closer
            const openDelim = this.parts[opener];
            const content = [];
            // Add opening mark
            if (type.mark) {
                content.push(this.elt(this.getMarkType(type.mark), openDelim.from, openDelim.to));
            }
            // Add content between
            for (let j = opener + 1; j < i; j++) {
                const p = this.parts[j];
                if (p instanceof Element)
                    content.push(p);
                else if (p instanceof InlineDelimiter) {
                    // Convert unmatched delimiter to text
                    content.push(this.elt(Type.Text, p.from, p.to));
                }
                this.parts[j] = null;
            }
            // Add closing mark
            if (type.mark) {
                content.push(this.elt(this.getMarkType(type.mark), part.from, part.to));
            }
            // Create the resolved element
            const resolvedType = this.getResolveType(type.resolve);
            const element = this.elt(resolvedType, openDelim.from, part.to, content);
            // Replace opener with element, remove closer
            this.parts[opener] = element;
            this.parts[i] = null;
        }
        // Collect remaining elements
        const result = [];
        for (const part of this.parts) {
            if (part instanceof Element)
                result.push(part);
            else if (part instanceof InlineDelimiter) {
                // Unmatched delimiter becomes text
                result.push(this.elt(Type.Text, part.from, part.to));
            }
        }
        return result;
    }
    /**
     * Get the Type for a resolve name
     */
    getResolveType(name) {
        const typeMap = {
            "Bold": Type.Bold,
            "Italic": Type.Italic,
            "Underline": Type.Underline,
            "Strikethrough": Type.Strikethrough,
            "Superscript": Type.Superscript,
            "Subscript": Type.Subscript,
            "Highlight": Type.Highlight,
            "InlineCode": Type.InlineCode,
        };
        return typeMap[name] || Type.Text;
    }
    /**
     * Get the Type for a mark name
     */
    getMarkType(name) {
        const typeMap = {
            "BoldMark": Type.BoldMark,
            "ItalicMark": Type.ItalicMark,
            "UnderlineMark": Type.UnderlineMark,
            "StrikethroughMark": Type.StrikethroughMark,
            "SuperscriptMark": Type.SuperscriptMark,
            "SubscriptMark": Type.SubscriptMark,
            "HighlightMark": Type.HighlightMark,
            "InlineCodeMark": Type.InlineCodeMark,
        };
        return typeMap[name] || Type.Mark;
    }
    /**
     * Parse the text and return elements
     */
    parse() {
        const parsers = this.parser.inlineParsers;
        let pos = this.offset;
        while (pos < this.end) {
            const next = this.char(pos);
            let matched = false;
            // Try each inline parser
            for (const parser of parsers) {
                const result = parser.parse(this, next, pos);
                if (result >= 0) {
                    pos = result;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // No parser matched, advance one character
                pos++;
            }
        }
        // Resolve delimiters and collect elements
        return this.resolveDelimiters();
    }
}
/**
 * Parse inline content
 */
function parseInline(parser, text, offset) {
    const cx = new InlineContext(parser, text, offset);
    return cx.parse();
}

/**
 * TiddlyWiki Parser - Pragma Parsers
 *
 * Pragmas are special directives at the start of tiddlers:
 * - \define name(params) body
 * - \procedure name(params) body
 * - \function name(params) body
 * - \widget $name(params) body
 * - \rules only/except rulenames
 * - \import filter
 * - \parameters (params)
 * - \whitespace trim/notrim
 */
/**
 * Match pattern for \define pragma
 * Single line: \define name(params) body
 * Multiline: \define name(params)\n body \n\end
 */
const defineRe = /^\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*(.*)$/;
const defineMultilineRe = /^\\define\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*$/;
/**
 * Match pattern for \procedure/\function/\widget pragma
 * Single line: \function name(params) body
 * Multiline: \function name(params)\n body \n\end
 */
const fnprocRe = /^\\(function|procedure|widget)\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)\s*(.*)$/;
const fnprocMultilineRe = /^\\(function|procedure|widget)\s+([^(\s]+)\s*\(\s*([^)]*)\s*\)$/;
/**
 * Match pattern for \rules pragma
 */
const rulesRe = /^\\rules\s+(only|except)\s+(.*)$/;
/**
 * Match pattern for \import pragma
 */
const importRe = /^\\import\s+(.*)$/;
/**
 * Match pattern for \parameters pragma
 */
const parametersRe = /^\\parameters\s*\(\s*([^)]*)\s*\)$/;
/**
 * Match pattern for \whitespace pragma
 */
const whitespaceRe = /^\\whitespace\s+(trim|notrim)$/;
/**
 * Find the \end marker for a multi-line pragma, properly handling nested definitions.
 *
 * TiddlyWiki rules:
 * - \end (bare) closes the most recently opened definition
 * - \end name closes specifically that named definition
 * - Nested \procedure/\function/\widget/\define blocks must be tracked
 *
 * Returns positions for the body content and end marker, not the content itself.
 * The body should be parsed recursively by the caller.
 */
function findEnd(cx, name) {
    // Match any multi-line definition start (nothing after closing paren)
    const openRe = /^\\(define|procedure|function|widget)\s+([^(\s]+)\s*\([^)]*\)\s*$/;
    // Match any \end (bare or named)
    const endRe = /^\s*\\end(?:\s+(\S+))?\s*$/;
    const bodyStart = cx.lineStart + cx.line.text.length + 1; // After the declaration line + newline
    const nestedNames = []; // Stack of nested definition names
    while (cx.nextLine()) {
        const text = cx.line.text;
        // Check for nested multi-line definition opening
        const openMatch = openRe.exec(text);
        if (openMatch) {
            nestedNames.push(openMatch[2]);
            continue;
        }
        // Check for \end
        const endMatch = endRe.exec(text);
        if (endMatch) {
            const endName = endMatch[1]; // undefined for bare \end
            if (nestedNames.length === 0) {
                // No nesting - this \end is for us
                // Accept bare \end or \end ourname
                if (!endName || endName === name) {
                    return {
                        bodyStart,
                        bodyEnd: cx.lineStart - 1, // Before the \end line (exclude newline)
                        endStart: cx.lineStart,
                        endEnd: cx.lineStart + text.length
                    };
                }
                // Named \end for different name at top level - error in source, continue
            }
            else {
                // We have nesting
                if (!endName) {
                    // Bare \end closes innermost nested definition
                    nestedNames.pop();
                }
                else if (endName === nestedNames[nestedNames.length - 1]) {
                    // Named \end matches innermost nested definition
                    nestedNames.pop();
                }
                else if (endName === name) {
                    // Named \end for our name while nested - closes our definition
                    return {
                        bodyStart,
                        bodyEnd: cx.lineStart - 1,
                        endStart: cx.lineStart,
                        endEnd: cx.lineStart + text.length
                    };
                }
                // Named \end that doesn't match - continue
            }
        }
    }
    // No \end found
    return null;
}
/**
 * Parse a filter expression into elements
 * Used for \function body parsing
 */
function parseFilterBody(filterContent, offset) {
    const elements = [];
    let pos = 0;
    const len = filterContent.length;
    while (pos < len) {
        const ch = filterContent[pos];
        // Skip whitespace
        if (/\s/.test(ch)) {
            pos++;
            continue;
        }
        // Filter step: [operators...]
        if (ch === '[') {
            const stepStart = pos;
            pos++; // skip [
            // Parse operators within this step
            const stepChildren = [];
            while (pos < len && filterContent[pos] !== ']') {
                // Check for negation
                if (filterContent[pos] === '!') {
                    pos++;
                }
                const operandCh = filterContent[pos];
                if (operandCh === '[') {
                    // Literal operand: [value]
                    pos++;
                    const operandStart = pos;
                    let depth = 1;
                    while (pos < len && depth > 0) {
                        if (filterContent[pos] === '[')
                            depth++;
                        else if (filterContent[pos] === ']')
                            depth--;
                        if (depth > 0)
                            pos++;
                    }
                    stepChildren.push(elt(Type.FilterOperand, offset + operandStart, offset + pos));
                    if (pos < len && filterContent[pos] === ']')
                        pos++;
                }
                else if (operandCh === '<') {
                    // Variable: <varname>
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '>')
                        pos++;
                    stepChildren.push(elt(Type.FilterVariable, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '{') {
                    // Text reference: {textref}
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '}')
                        pos++;
                    stepChildren.push(elt(Type.FilterTextRef, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '/') {
                    // Regexp: /regexp/flags
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '/') {
                        if (filterContent[pos] === '\\')
                            pos++;
                        pos++;
                    }
                    stepChildren.push(elt(Type.FilterRegexp, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                    while (pos < len && /[gimsuy]/.test(filterContent[pos]))
                        pos++;
                }
                else if (/[a-zA-Z]/.test(operandCh)) {
                    // Operator name
                    const opStart = pos;
                    while (pos < len && /[a-zA-Z0-9\-_:!]/.test(filterContent[pos]))
                        pos++;
                    stepChildren.push(elt(Type.FilterOperatorName, offset + opStart, offset + pos));
                }
                else {
                    pos++;
                }
            }
            // Skip closing ]
            if (pos < len && filterContent[pos] === ']')
                pos++;
            elements.push(elt(Type.FilterOperator, offset + stepStart, offset + pos, stepChildren));
        }
        else if (ch === '+' || ch === '-' || ch === '~' || ch === '=') {
            // Run prefix
            pos++;
        }
        else if (ch === ':') {
            // Named run prefix
            pos++;
            while (pos < len && /[a-zA-Z0-9\-_]/.test(filterContent[pos]))
                pos++;
        }
        else {
            pos++;
        }
    }
    return elements;
}
/**
 * Parse parameter definitions: name:default, name2:"default2"
 */
function parseParams(paramStr, basePos) {
    const params = [];
    if (!paramStr.trim())
        return params;
    const paramRe = /\s*([A-Za-z0-9\-_]+)(?:\s*:\s*(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)'|\[\[([^\]]*)\]\]|([^,\s)]+)))?/g;
    let match;
    while ((match = paramRe.exec(paramStr)) !== null) {
        const paramStart = basePos + match.index;
        const paramEnd = paramStart + match[0].length;
        params.push(elt(Type.PragmaParams, paramStart, paramEnd));
    }
    return params;
}
/**
 * \define macro pragma
 */
const MacroDefPragma = {
    name: "macrodef",
    parse(cx, line) {
        const text = line.text;
        // Check for multiline vs single line
        const multiMatch = defineMultilineRe.exec(text);
        if (multiMatch) {
            const pragmaStart = cx.lineStart;
            const name = multiMatch[1];
            const paramStr = multiMatch[2];
            // Save position in case we need to fall back to single-line
            const savedPos = cx.savePosition();
            // Find body and \end
            const endInfo = findEnd(cx, name);
            if (endInfo) {
                // Create elements for pragma mark, keyword, name, params
                const children = [
                    elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                    elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "define"
                    elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
                ];
                // Parse parameters
                if (paramStr) {
                    const paramStart = pragmaStart + text.indexOf("(") + 1;
                    children.push(...parseParams(paramStr, paramStart));
                }
                // Parse body content recursively
                if (endInfo.bodyEnd > endInfo.bodyStart) {
                    const bodyElements = cx.parseContentRange(endInfo.bodyStart, endInfo.bodyEnd, true);
                    children.push(...bodyElements);
                }
                children.push(elt(Type.PragmaEnd, endInfo.endStart, endInfo.endEnd));
                cx.nextLine();
                return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)];
            }
            // No \end found - restore position and treat as single-line (no body)
            cx.restorePosition(savedPos);
        }
        // Single line define
        const singleMatch = defineRe.exec(text);
        if (singleMatch) {
            const pragmaStart = cx.lineStart;
            const name = singleMatch[1];
            const paramStr = singleMatch[2];
            const body = singleMatch[3];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7),
                elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
            ];
            if (paramStr) {
                const paramStart = pragmaStart + text.indexOf("(") + 1;
                children.push(...parseParams(paramStr, paramStart));
            }
            // Single-line body - parse as inline wikitext
            if (body) {
                // Find where body actually starts in text (after the regex matched \s*)
                const bodyStart = pragmaStart + text.length - body.length;
                const inlineElements = cx.parser.parseInline(body, bodyStart);
                children.push(...inlineElements);
            }
            cx.nextLine();
            return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)];
        }
        return null;
    }
};
/**
 * \function/\procedure/\widget pragma
 */
const FnProcDefPragma = {
    name: "fnprocdef",
    parse(cx, line) {
        const text = line.text;
        // Check for multiline
        const multiMatch = fnprocMultilineRe.exec(text);
        if (multiMatch) {
            const pragmaStart = cx.lineStart;
            const keyword = multiMatch[1];
            const name = multiMatch[2];
            const paramStr = multiMatch[3];
            let nodeType;
            switch (keyword) {
                case "function":
                    nodeType = Type.FunctionDefinition;
                    break;
                case "procedure":
                    nodeType = Type.ProcedureDefinition;
                    break;
                case "widget":
                    nodeType = Type.WidgetDefinition;
                    break;
                default: return null;
            }
            // Save position in case we need to fall back to single-line
            const savedPos = cx.savePosition();
            const endInfo = findEnd(cx, name);
            if (endInfo) {
                const children = [
                    elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                    elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
                    elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
                ];
                if (paramStr) {
                    const paramStart = pragmaStart + text.indexOf("(") + 1;
                    children.push(...parseParams(paramStr, paramStart));
                }
                // Parse body content recursively
                if (endInfo.bodyEnd > endInfo.bodyStart) {
                    const bodyElements = cx.parseContentRange(endInfo.bodyStart, endInfo.bodyEnd, true);
                    children.push(...bodyElements);
                }
                children.push(elt(Type.PragmaEnd, endInfo.endStart, endInfo.endEnd));
                cx.nextLine();
                return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)];
            }
            // No \end found - restore position and treat as single-line (no body)
            cx.restorePosition(savedPos);
        }
        // Single line function/procedure/widget
        const singleMatch = fnprocRe.exec(text);
        if (singleMatch) {
            const pragmaStart = cx.lineStart;
            const keyword = singleMatch[1];
            const name = singleMatch[2];
            const paramStr = singleMatch[3];
            const body = singleMatch[4];
            let nodeType;
            switch (keyword) {
                case "function":
                    nodeType = Type.FunctionDefinition;
                    break;
                case "procedure":
                    nodeType = Type.ProcedureDefinition;
                    break;
                case "widget":
                    nodeType = Type.WidgetDefinition;
                    break;
                default: return null;
            }
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
                elt(Type.PragmaName, pragmaStart + text.indexOf(name), pragmaStart + text.indexOf(name) + name.length),
            ];
            if (paramStr) {
                const paramStart = pragmaStart + text.indexOf("(") + 1;
                children.push(...parseParams(paramStr, paramStart));
            }
            // Single-line body parsing
            if (body) {
                // Find where body actually starts in text (after the regex matched \s*)
                const bodyStart = pragmaStart + text.length - body.length;
                if (keyword === "function") {
                    // Function body is a filter expression
                    const filterElements = parseFilterBody(body, bodyStart);
                    children.push(elt(Type.FilterExpression, bodyStart, pragmaStart + text.length, filterElements));
                }
                else {
                    // Procedure/widget body is inline wikitext
                    const inlineElements = cx.parser.parseInline(body, bodyStart);
                    children.push(...inlineElements);
                }
            }
            cx.nextLine();
            return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)];
        }
        return null;
    }
};
/**
 * \rules pragma
 */
const RulesPragma = {
    name: "rules",
    parse(cx, line) {
        const match = rulesRe.exec(line.text);
        if (!match)
            return null;
        const pragmaStart = cx.lineStart;
        match[1];
        match[2];
        const children = [
            elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
            elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 6), // "rules"
        ];
        cx.nextLine();
        return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)];
    }
};
/**
 * \import pragma
 */
const ImportPragma = {
    name: "import",
    parse(cx, line) {
        const match = importRe.exec(line.text);
        if (!match)
            return null;
        const pragmaStart = cx.lineStart;
        const filter = match[1];
        const children = [
            elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
            elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "import"
            elt(Type.FilterExpression, pragmaStart + 8, pragmaStart + 8 + filter.length),
        ];
        cx.nextLine();
        return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)];
    }
};
/**
 * \parameters pragma
 */
const ParametersPragma = {
    name: "parameters",
    parse(cx, line) {
        const match = parametersRe.exec(line.text);
        if (!match)
            return null;
        const pragmaStart = cx.lineStart;
        const paramStr = match[1];
        const children = [
            elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
            elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "parameters"
        ];
        if (paramStr) {
            const paramStart = pragmaStart + line.text.indexOf("(") + 1;
            children.push(...parseParams(paramStr, paramStart));
        }
        cx.nextLine();
        return [elt(Type.ParametersPragma, pragmaStart, cx.prevLineEnd(), children)];
    }
};
/**
 * \whitespace pragma
 */
const WhitespacePragma = {
    name: "whitespace",
    parse(cx, line) {
        const match = whitespaceRe.exec(line.text);
        if (!match)
            return null;
        const pragmaStart = cx.lineStart;
        const children = [
            elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
            elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "whitespace"
        ];
        cx.nextLine();
        return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)];
    }
};
/**
 * Partial/incomplete pragma patterns for highlighting while typing
 * These match pragmas that are being typed but aren't complete yet
 */
// Partial \define - matches incomplete define statements (including partial keyword)
const definePartialRe = /^\\define(?:\s+([^(\s]+))?(?:\s*\(([^)]*)?)?$/;
const defineKeywordPartialRe = /^\\(d|de|def|defi|defin)$/;
// Partial \function/\procedure/\widget (including partial keywords)
const fnprocPartialRe = /^\\(function|procedure|widget)(?:\s+([^(\s]+))?(?:\s*\(([^)]*)?)?$/;
const functionKeywordPartialRe = /^\\(f|fu|fun|func|funct|functi|functio)$/;
const procedureKeywordPartialRe = /^\\(p|pr|pro|proc|proce|proced|procedu|procedur)$/;
const widgetKeywordPartialRe = /^\\(wi|wid|widg|widge)$/;
// Partial \rules - just the keyword or with only/except (including partial keyword)
const rulesPartialRe = /^\\rules(?:\s+(only|except)?)?(?:\s+(.*))?$/;
const rulesKeywordPartialRe = /^\\(r|ru|rul|rule)$/;
// Partial \import - just the keyword (including partial keyword)
const importPartialRe = /^\\import(?:\s*(.*))?$/;
const importKeywordPartialRe = /^\\(i|im|imp|impo|impor)$/;
// Partial \parameters - incomplete (including partial keyword)
const parametersPartialRe = /^\\parameters(?:\s*\(([^)]*)?)?$/;
const parametersKeywordPartialRe = /^\\(pa|par|para|param|parame|paramet|paramete|parameter)$/;
// Partial \whitespace - just the keyword (including partial keyword)
const whitespacePartialRe = /^\\whitespace(?:\s+(.*))?$/;
const whitespaceKeywordPartialRe = /^\\(wh|whi|whit|white|whites|whitesp|whitespa|whitespac)$/;
// Partial \end
const endKeywordPartialRe = /^\\(e|en|end)(?:\s+.*)?$/;
/**
 * Partial pragma parser - catches incomplete pragmas while typing
 * This must be LAST in the parser list
 */
const PartialPragma = {
    name: "partial",
    parse(cx, line) {
        const text = line.text;
        const pragmaStart = cx.lineStart;
        // Try partial \define
        let match = definePartialRe.exec(text);
        if (match) {
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "define"
            ];
            const name = match[1];
            if (name) {
                const nameStart = pragmaStart + text.indexOf(name);
                children.push(elt(Type.PragmaName, nameStart, nameStart + name.length));
            }
            const paramStr = match[2];
            if (paramStr !== undefined) {
                const paramStart = pragmaStart + text.indexOf("(") + 1;
                if (paramStr) {
                    children.push(...parseParams(paramStr, paramStart));
                }
            }
            cx.nextLine();
            return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)];
        }
        // Try partial \function/\procedure/\widget
        match = fnprocPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            let nodeType;
            switch (keyword) {
                case "function":
                    nodeType = Type.FunctionDefinition;
                    break;
                case "procedure":
                    nodeType = Type.ProcedureDefinition;
                    break;
                case "widget":
                    nodeType = Type.WidgetDefinition;
                    break;
                default: return null;
            }
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            const name = match[2];
            if (name) {
                const nameStart = pragmaStart + text.indexOf(name);
                children.push(elt(Type.PragmaName, nameStart, nameStart + name.length));
            }
            const paramStr = match[3];
            if (paramStr !== undefined) {
                const paramStart = pragmaStart + text.indexOf("(") + 1;
                if (paramStr) {
                    children.push(...parseParams(paramStr, paramStart));
                }
            }
            cx.nextLine();
            return [elt(nodeType, pragmaStart, cx.prevLineEnd(), children)];
        }
        // Try partial \rules
        match = rulesPartialRe.exec(text);
        if (match) {
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 6), // "rules"
            ];
            cx.nextLine();
            return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // Try partial \import
        match = importPartialRe.exec(text);
        if (match) {
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 7), // "import"
            ];
            const filter = match[1];
            if (filter && filter.trim()) {
                children.push(elt(Type.FilterExpression, pragmaStart + 8, pragmaStart + 8 + filter.length));
            }
            cx.nextLine();
            return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // Try partial \parameters
        match = parametersPartialRe.exec(text);
        if (match) {
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "parameters"
            ];
            const paramStr = match[1];
            if (paramStr !== undefined) {
                const paramStart = pragmaStart + text.indexOf("(") + 1;
                if (paramStr) {
                    children.push(...parseParams(paramStr, paramStart));
                }
            }
            cx.nextLine();
            return [elt(Type.ParametersPragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // Try partial \whitespace
        match = whitespacePartialRe.exec(text);
        if (match) {
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 11), // "whitespace"
            ];
            cx.nextLine();
            return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // Try partial keywords (typing in progress)
        // \d, \de, \def, \defi, \defin -> partial define
        match = defineKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.MacroDefinition, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \f, \fu, \fun, etc. -> partial function
        match = functionKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.FunctionDefinition, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \p, \pr, \pro, etc. -> partial procedure
        match = procedureKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.ProcedureDefinition, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \wi, \wid, etc. -> partial widget
        match = widgetKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.WidgetDefinition, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \r, \ru, \rul, \rule -> partial rules
        match = rulesKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.RulesPragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \i, \im, \imp, etc. -> partial import
        match = importKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.ImportPragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \pa, \par, etc. -> partial parameters
        match = parametersKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.ParametersPragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \wh, \whi, etc. -> partial whitespace
        match = whitespaceKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.WhitespacePragma, pragmaStart, cx.prevLineEnd(), children)];
        }
        // \e, \en, \end -> partial end marker
        match = endKeywordPartialRe.exec(text);
        if (match) {
            const keyword = match[1];
            const children = [
                elt(Type.PragmaMark, pragmaStart, pragmaStart + 1),
                elt(Type.PragmaKeyword, pragmaStart + 1, pragmaStart + 1 + keyword.length),
            ];
            cx.nextLine();
            return [elt(Type.PragmaEnd, pragmaStart, cx.prevLineEnd(), children)];
        }
        return null;
    }
};
/**
 * All pragma parsers
 */
const DefaultPragmaParsers = [
    MacroDefPragma,
    FnProcDefPragma,
    RulesPragma,
    ImportPragma,
    ParametersPragma,
    WhitespacePragma,
    PartialPragma, // Must be last - catches incomplete pragmas
];

/**
 * TiddlyWiki Parser - Block Parsers
 *
 * Block-level parsing rules following the Lezer Markdown architecture.
 */
// ============================================================================
// Heading Parser (! to !!!!!!)
// ============================================================================
function isHeading$1(line) {
    if (line.next !== Ch.Exclamation)
        return -1;
    let level = 1;
    let pos = 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) === Ch.Exclamation && level < 6) {
        level++;
        pos++;
    }
    return level;
}
const Heading = {
    name: "Heading",
    parse(cx, line) {
        const level = isHeading$1(line);
        if (level < 0)
            return false;
        const start = cx.lineStart;
        const markEnd = start + level;
        const textStart = markEnd;
        // Parse inline content after the !
        const contentText = line.text.slice(level);
        const inlineElements = cx.parser.parseInline(contentText, textStart);
        // Determine heading type based on level
        const headingType = [Type.Heading1, Type.Heading2, Type.Heading3, Type.Heading4, Type.Heading5, Type.Heading6][level - 1];
        const children = [
            elt(Type.HeadingMark, start, markEnd),
            ...inlineElements
        ];
        cx.addElement(elt(headingType, start, start + line.text.length, children));
        return true;
    }
};
// ============================================================================
// Horizontal Rule Parser (---)
// ============================================================================
const hrRe = /^-{3,}\s*$/;
const HorizontalRule = {
    name: "HorizontalRule",
    parse(cx, line) {
        if (!hrRe.test(line.text))
            return false;
        cx.addElement(elt(Type.HorizontalRule, cx.lineStart, cx.lineStart + line.text.length));
        return true;
    }
};
// ============================================================================
// Fenced Code Block (```)
// ============================================================================
const codeStartRe = /^```(\w*)$/;
const codeEndRe = /^```$/;
const FencedCode = {
    name: "FencedCode",
    parse(cx, line) {
        const match = codeStartRe.exec(line.text);
        if (!match)
            return false;
        const start = cx.lineStart;
        const lang = match[1];
        const children = [
            elt(Type.CodeMark, start, start + 3)
        ];
        if (lang) {
            children.push(elt(Type.CodeInfo, start + 3, start + 3 + lang.length));
        }
        // Find closing ```
        let codeContent = "";
        let codeStart = cx.lineStart + line.text.length + 1;
        let foundEnd = false;
        while (cx.nextLine()) {
            if (codeEndRe.test(cx.line.text)) {
                children.push(elt(Type.CodeText, codeStart, cx.lineStart - 1));
                children.push(elt(Type.CodeMark, cx.lineStart, cx.lineStart + 3));
                foundEnd = true;
                break;
            }
            if (codeContent)
                codeContent += "\n";
            codeContent += cx.line.text;
        }
        if (!foundEnd && codeContent) {
            children.push(elt(Type.CodeText, codeStart, cx.lineStart - 1));
        }
        const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.lineStart;
        cx.addElement(elt(Type.FencedCode, start, end, children));
        return true;
    }
};
// ============================================================================
// Typed Block ($$$)
// ============================================================================
const typedStartRe = /^\$\$\$([\w\/\-\.\+]*)$/;
const typedEndRe = /^\$\$\$\s*$/;
const TypedBlock = {
    name: "TypedBlock",
    parse(cx, line) {
        const match = typedStartRe.exec(line.text);
        if (!match)
            return false;
        const start = cx.lineStart;
        const typeName = match[1];
        const children = [
            elt(Type.TypedBlockMark, start, start + 3)
        ];
        if (typeName) {
            children.push(elt(Type.TypedBlockType, start + 3, start + 3 + typeName.length));
        }
        // Find closing $$$
        let contentStart = cx.lineStart + line.text.length + 1;
        let foundEnd = false;
        while (cx.nextLine()) {
            if (typedEndRe.test(cx.line.text)) {
                children.push(elt(Type.CodeText, contentStart, cx.lineStart - 1));
                children.push(elt(Type.TypedBlockMark, cx.lineStart, cx.lineStart + 3));
                foundEnd = true;
                break;
            }
        }
        if (!foundEnd) {
            children.push(elt(Type.CodeText, contentStart, cx.lineStart - 1));
        }
        const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.lineStart;
        cx.addElement(elt(Type.TypedBlock, start, end, children));
        return true;
    }
};
// ============================================================================
// List Parser (* # ; : >)
// ============================================================================
const listMarkerRe = /^([*#;:>]+)/;
const listTypeMap = {
    "*": { list: Type.BulletList, item: Type.ListItem },
    "#": { list: Type.OrderedList, item: Type.ListItem },
    ";": { list: Type.DefinitionList, item: Type.DefinitionTerm },
    ":": { list: Type.DefinitionList, item: Type.DefinitionDescription },
    ">": { list: Type.BlockQuote, item: Type.ListItem },
};
/**
 * Check if a marker character is compatible with continuing a list
 * Definition lists allow both ; and : as compatible markers
 */
function isCompatibleMarker(firstMarker, currentMarker) {
    if (firstMarker === currentMarker)
        return true;
    // Definition lists: ; (term) and : (description) are compatible
    if ((firstMarker === ";" || firstMarker === ":") &&
        (currentMarker === ";" || currentMarker === ":")) {
        return true;
    }
    return false;
}
const List = {
    name: "List",
    parse(cx, line) {
        const match = listMarkerRe.exec(line.text);
        if (!match)
            return false;
        const markers = match[1];
        const firstMarker = markers[0];
        const listInfo = listTypeMap[firstMarker];
        if (!listInfo)
            return false;
        const start = cx.lineStart;
        const items = [];
        // Parse list items
        let currentLine = line;
        while (true) {
            const itemMatch = listMarkerRe.exec(currentLine.text);
            if (!itemMatch || !isCompatibleMarker(firstMarker, itemMatch[1][0]))
                break;
            const itemMarkers = itemMatch[1];
            const itemStart = cx.lineStart;
            const markerEnd = itemStart + itemMarkers.length;
            // Parse inline content
            const contentText = currentLine.text.slice(itemMarkers.length);
            const inlineElements = cx.parser.parseInline(contentText, markerEnd);
            const itemChildren = [
                elt(Type.ListMark, itemStart, markerEnd),
                ...inlineElements
            ];
            const itemType = listTypeMap[itemMarkers[itemMarkers.length - 1]]?.item || Type.ListItem;
            items.push(elt(itemType, itemStart, itemStart + currentLine.text.length, itemChildren));
            if (!cx.nextLine())
                break;
            currentLine = cx.line;
        }
        cx.addElement(elt(listInfo.list, start, cx.prevLineEnd(), items));
        return true;
    }
};
// ============================================================================
// Multi-line Block Quote (<<<...<<<)
// ============================================================================
// Opening: <<< (optionally with class)
const blockQuoteOpenRe = /^<<<(.*)$/;
const MultiLineBlockQuote = {
    name: "MultiLineBlockQuote",
    parse(cx, line) {
        const openMatch = blockQuoteOpenRe.exec(line.text);
        if (!openMatch)
            return false;
        // Check it's actually <<< at start (not <<<<)
        if (!line.text.startsWith("<<<") || line.text.startsWith("<<<<"))
            return false;
        const start = cx.lineStart;
        const openingMarkEnd = start + 3; // Length of "<<<""
        openMatch[1].trim();
        const children = [
            elt(Type.QuoteMark, start, openingMarkEnd)
        ];
        // If there's class/style info after opening <<<, we could parse it
        // For now, just note the position
        // Find the closing <<<
        const contentStart = start + line.text.length + 1; // After opening line + newline
        let contentEnd = contentStart;
        let closingStart = -1;
        let closingEnd = -1;
        let citation = "";
        while (cx.nextLine()) {
            const lineText = cx.line.text;
            // Check for closing <<<
            if (lineText.startsWith("<<<") && !lineText.startsWith("<<<<")) {
                closingStart = cx.lineStart;
                closingEnd = cx.lineStart + lineText.length;
                contentEnd = closingStart - 1; // Before closing line (exclude newline)
                citation = lineText.slice(3).trim();
                break;
            }
        }
        // Parse content between opening and closing <<< recursively
        if (contentEnd > contentStart) {
            const contentElements = cx.parseContentRange(contentStart, contentEnd, false);
            children.push(...contentElements);
        }
        // Add closing mark
        if (closingStart >= 0) {
            children.push(elt(Type.QuoteMark, closingStart, closingStart + 3));
            // If there's a citation, parse it as inline content
            if (citation) {
                const citationStart = closingStart + 3;
                const citationElements = cx.parser.parseInline(citation, citationStart);
                children.push(...citationElements);
            }
        }
        const blockEnd = closingEnd >= 0 ? closingEnd : cx.prevLineEnd();
        cx.addElement(elt(Type.BlockQuote, start, blockEnd, children));
        return true;
    }
};
// ============================================================================
// Table Parser (|...|)
// ============================================================================
const tableRowRe = /^\|.*\|([fhck])?\s*$/;
// Map row suffix markers to row types
const tableRowTypeMap = {
    "c": Type.TableCaption,
    "k": Type.TableClass,
    "h": Type.TableHeader,
    "f": Type.TableFooter,
};
const Table = {
    name: "Table",
    parse(cx, line) {
        if (!tableRowRe.test(line.text))
            return false;
        const start = cx.lineStart;
        const rows = [];
        while (true) {
            const rowText = cx.line.text;
            const match = tableRowRe.exec(rowText);
            if (!match)
                break;
            const rowStart = cx.lineStart;
            const marker = match[1]; // c, k, h, f, or undefined
            const rowType = marker ? tableRowTypeMap[marker] : Type.TableRow;
            const cells = parseTableRow(rowText, rowStart, cx, marker);
            rows.push(elt(rowType, rowStart, rowStart + rowText.length, cells));
            if (!cx.nextLine())
                break;
        }
        cx.addElement(elt(Type.Table, start, cx.prevLineEnd(), rows));
        return true;
    }
};
function parseTableRow(text, offset, cx, marker) {
    const cells = [];
    let pos = 0;
    let cellStart = -1;
    // If there's a marker, we need to stop before it
    const endPos = marker ? text.length - 1 : text.length;
    while (pos < endPos) {
        const ch = text.charCodeAt(pos);
        if (ch === Ch.Pipe) {
            if (cellStart >= 0) {
                // End of cell content
                const cellText = text.slice(cellStart, pos).trim();
                const isHeader = cellText.startsWith("!");
                const cellType = isHeader ? Type.TableHeaderCell : Type.TableCell;
                // Parse inline content
                const contentStart = isHeader ? cellStart + 1 : cellStart;
                const contentText = isHeader ? cellText.slice(1) : cellText;
                const inlineElements = cx.parser.parseInline(contentText, offset + contentStart);
                cells.push(elt(cellType, offset + cellStart, offset + pos, inlineElements));
            }
            cells.push(elt(Type.TableDelimiter, offset + pos, offset + pos + 1));
            cellStart = -1;
            pos++;
        }
        else {
            if (cellStart < 0)
                cellStart = pos;
            pos++;
        }
    }
    // Add the row marker if present
    if (marker) {
        cells.push(elt(Type.TableMarker, offset + text.length - 1, offset + text.length));
    }
    return cells;
}
// ============================================================================
// Comment Block (<!-- -->)
// ============================================================================
const htmlCommentStartRe = /^<!--/;
const CommentBlock = {
    name: "CommentBlock",
    parse(cx, line) {
        const text = line.text.trim();
        // HTML-style comment
        if (htmlCommentStartRe.test(text)) {
            const start = cx.lineStart;
            // Check for --> on this line
            const endMatch = text.match(/-->/);
            if (endMatch) {
                const commentEndPos = start + line.text.indexOf('-->') + 3;
                cx.addElement(elt(Type.CommentBlock, start, commentEndPos, [
                    elt(Type.CommentMarker, start, start + 4),
                    elt(Type.CommentMarker, commentEndPos - 3, commentEndPos),
                ]));
                // Parse any inline content after the comment on the same line
                const afterComment = line.text.slice(line.text.indexOf('-->') + 3);
                if (afterComment.trim()) {
                    const inlineElements = cx.parser.parseInline(afterComment, commentEndPos);
                    const paragraphElt = cx.elt(Type.Paragraph, commentEndPos, commentEndPos + afterComment.length, inlineElements);
                    cx.addElement(paragraphElt);
                }
                return true;
            }
            // Multi-line comment
            while (cx.nextLine()) {
                const lineText = cx.line.text;
                const endIdx = lineText.indexOf('-->');
                if (endIdx !== -1) {
                    const commentEndPos = cx.lineStart + endIdx + 3;
                    cx.addElement(elt(Type.CommentBlock, start, commentEndPos));
                    // Parse any inline content after the comment
                    const afterComment = lineText.slice(endIdx + 3);
                    if (afterComment.trim()) {
                        const inlineElements = cx.parser.parseInline(afterComment, commentEndPos);
                        const paragraphElt = cx.elt(Type.Paragraph, commentEndPos, commentEndPos + afterComment.length, inlineElements);
                        cx.addElement(paragraphElt);
                    }
                    return true;
                }
            }
            // Unclosed comment
            cx.addElement(elt(Type.CommentBlock, start, cx.lineStart));
            return true;
        }
        return false;
    }
};
// ============================================================================
// Block Transclusion ({{...}})
// ============================================================================
const transclusionBlockRe = /^\{\{([^{}|]*)(?:\|\|([^{}|]+))?(?:\|([^{}]+))?\}\}\s*$/;
/**
 * Parse transclusion target details: tiddler!!field or tiddler##index
 */
function parseTransclusionTargetBlock(target, offset) {
    const children = [];
    const fieldIdx = target.indexOf("!!");
    const indexIdx = target.indexOf("##");
    if (fieldIdx !== -1 && (indexIdx === -1 || fieldIdx < indexIdx)) {
        const tiddlerPart = target.slice(0, fieldIdx);
        if (tiddlerPart) {
            children.push(elt(Type.TransclusionTarget, offset, offset + tiddlerPart.length));
        }
        children.push(elt(Type.TransclusionField, offset + fieldIdx, offset + target.length));
    }
    else if (indexIdx !== -1) {
        const tiddlerPart = target.slice(0, indexIdx);
        if (tiddlerPart) {
            children.push(elt(Type.TransclusionTarget, offset, offset + tiddlerPart.length));
        }
        children.push(elt(Type.TransclusionIndex, offset + indexIdx, offset + target.length));
    }
    else {
        children.push(elt(Type.TransclusionTarget, offset, offset + target.length));
    }
    return children;
}
const TransclusionBlock = {
    name: "TransclusionBlock",
    parse(cx, line) {
        const match = transclusionBlockRe.exec(line.text);
        if (!match)
            return false;
        const start = cx.lineStart;
        const target = match[1];
        const template = match[2];
        match[3];
        const children = [
            elt(Type.TransclusionMark, start, start + 2),
        ];
        // Parse target details (tiddler!!field or tiddler##index)
        const targetChildren = parseTransclusionTargetBlock(target, start + 2);
        children.push(...targetChildren);
        let pos = start + 2 + target.length;
        if (template) {
            children.push(elt(Type.TransclusionTemplate, pos + 2, pos + 2 + template.length));
            pos += 2 + template.length;
        }
        children.push(elt(Type.TransclusionMark, start + line.text.length - 2, start + line.text.length));
        cx.addElement(elt(Type.TransclusionBlock, start, start + line.text.length, children));
        return true;
    }
};
// ============================================================================
// Filtered Transclusion Block ({{{...}}})
// ============================================================================
/**
 * Parse filter expression content into detailed elements
 * Handles chained operators like [<var>operator{ref}]
 */
function parseFilterExpressionBlock(filterContent, offset) {
    const elements = [];
    let pos = 0;
    const len = filterContent.length;
    while (pos < len) {
        const ch = filterContent[pos];
        if (/\s/.test(ch)) {
            pos++;
            continue;
        }
        // Filter step: [operators...]
        if (ch === '[') {
            const stepStart = pos;
            pos++; // skip [
            const stepChildren = [];
            while (pos < len && filterContent[pos] !== ']') {
                if (filterContent[pos] === '!') {
                    pos++;
                }
                const operandCh = filterContent[pos];
                if (operandCh === '[') {
                    pos++;
                    const operandStart = pos;
                    let depth = 1;
                    while (pos < len && depth > 0) {
                        if (filterContent[pos] === '[')
                            depth++;
                        else if (filterContent[pos] === ']')
                            depth--;
                        if (depth > 0)
                            pos++;
                    }
                    stepChildren.push(elt(Type.FilterOperand, offset + operandStart, offset + pos));
                    if (pos < len && filterContent[pos] === ']')
                        pos++;
                }
                else if (operandCh === '<') {
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '>')
                        pos++;
                    stepChildren.push(elt(Type.FilterVariable, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '{') {
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '}')
                        pos++;
                    stepChildren.push(elt(Type.FilterTextRef, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '/') {
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '/') {
                        if (filterContent[pos] === '\\')
                            pos++;
                        pos++;
                    }
                    stepChildren.push(elt(Type.FilterRegexp, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                    while (pos < len && /[gimsuy]/.test(filterContent[pos]))
                        pos++;
                }
                else if (/[a-zA-Z]/.test(operandCh)) {
                    const opStart = pos;
                    while (pos < len && /[a-zA-Z0-9\-_:!]/.test(filterContent[pos]))
                        pos++;
                    stepChildren.push(elt(Type.FilterOperatorName, offset + opStart, offset + pos));
                }
                else {
                    pos++;
                }
            }
            if (pos < len && filterContent[pos] === ']')
                pos++;
            const stepEnd = pos;
            elements.push(elt(Type.FilterOperator, offset + stepStart, offset + stepEnd, stepChildren));
            continue;
        }
        // Standalone title: [[Title]]
        if (ch === '[' && filterContent[pos + 1] === '[') {
            const start = pos;
            pos += 2;
            while (pos < len && !(filterContent[pos] === ']' && filterContent[pos + 1] === ']'))
                pos++;
            pos += 2;
            elements.push(elt(Type.FilterOperand, offset + start, offset + pos));
            continue;
        }
        // Run prefix
        if (ch === '+' || ch === '-' || ch === '~' || ch === ':') {
            pos++;
            while (pos < len && /[a-zA-Z]/.test(filterContent[pos]))
                pos++;
            continue;
        }
        pos++;
    }
    return elements;
}
const FilteredTransclusionBlock = {
    name: "FilteredTransclusionBlock",
    parse(cx, line) {
        if (!line.text.startsWith("{{{"))
            return false;
        // Find closing }}}
        const closeIdx = line.text.indexOf("}}}", 3);
        if (closeIdx === -1)
            return false;
        // Check that rest of line is empty or has template
        const afterClose = line.text.slice(closeIdx + 3).trim();
        let template = "";
        if (afterClose) {
            if (!afterClose.startsWith("||"))
                return false;
            template = afterClose.slice(2);
        }
        const start = cx.lineStart;
        const filter = line.text.slice(3, closeIdx);
        // Parse filter expression details
        const filterChildren = parseFilterExpressionBlock(filter, start + 3);
        const children = [
            elt(Type.FilteredTransclusionMark, start, start + 3),
            elt(Type.FilterExpression, start + 3, start + 3 + filter.length, filterChildren),
            elt(Type.FilteredTransclusionMark, start + 3 + filter.length, start + 6 + filter.length),
        ];
        if (template) {
            children.push(elt(Type.TransclusionTemplate, start + closeIdx + 5, start + closeIdx + 5 + template.length));
        }
        cx.addElement(elt(Type.FilteredTransclusionBlock, start, start + line.text.length, children));
        return true;
    }
};
// ============================================================================
// Macro Call Block (<<...>>)
// ============================================================================
/**
 * Parse macro parameters into individual MacroParam elements
 */
function parseMacroParamsBlock(paramsStr, offset) {
    const elements = [];
    let pos = 0;
    const len = paramsStr.length;
    while (pos < len) {
        while (pos < len && /\s/.test(paramsStr[pos]))
            pos++;
        if (pos >= len)
            break;
        const paramStart = pos;
        // Check if it's a named parameter (name:value)
        let nameEnd = pos;
        while (nameEnd < len && /[a-zA-Z0-9\-_]/.test(paramsStr[nameEnd]))
            nameEnd++;
        if (nameEnd > pos && paramsStr[nameEnd] === ':') {
            const nameStart = pos;
            pos = nameEnd + 1;
            const valueStart = pos;
            if (paramsStr[pos] === '"' || paramsStr[pos] === "'") {
                const quote = paramsStr[pos];
                pos++;
                while (pos < len && paramsStr[pos] !== quote) {
                    if (paramsStr[pos] === '\\')
                        pos++;
                    pos++;
                }
                if (pos < len)
                    pos++;
            }
            else if (paramsStr.slice(pos, pos + 3) === '[[[') {
                pos += 3;
                while (pos < len && paramsStr.slice(pos, pos + 3) !== ']]]')
                    pos++;
                pos += 3;
            }
            else if (paramsStr.slice(pos, pos + 2) === '[[') {
                pos += 2;
                while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]')
                    pos++;
                pos += 2;
            }
            else {
                while (pos < len && !/[\s>]/.test(paramsStr[pos]))
                    pos++;
            }
            const paramChildren = [
                elt(Type.MacroParamName, offset + nameStart, offset + nameEnd),
                elt(Type.MacroParamValue, offset + valueStart, offset + pos)
            ];
            elements.push(elt(Type.MacroParam, offset + paramStart, offset + pos, paramChildren));
        }
        else {
            const valueStart = pos;
            if (paramsStr[pos] === '"' || paramsStr[pos] === "'") {
                const quote = paramsStr[pos];
                pos++;
                while (pos < len && paramsStr[pos] !== quote) {
                    if (paramsStr[pos] === '\\')
                        pos++;
                    pos++;
                }
                if (pos < len)
                    pos++;
            }
            else if (paramsStr.slice(pos, pos + 3) === '[[[') {
                pos += 3;
                while (pos < len && paramsStr.slice(pos, pos + 3) !== ']]]')
                    pos++;
                pos += 3;
            }
            else if (paramsStr.slice(pos, pos + 2) === '[[') {
                pos += 2;
                while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]')
                    pos++;
                pos += 2;
            }
            else {
                while (pos < len && !/[\s>]/.test(paramsStr[pos]))
                    pos++;
            }
            const paramChildren = [
                elt(Type.MacroParamValue, offset + valueStart, offset + pos)
            ];
            elements.push(elt(Type.MacroParam, offset + paramStart, offset + pos, paramChildren));
        }
    }
    return elements;
}
const MacroCallBlock = {
    name: "MacroCallBlock",
    parse(cx, line) {
        if (!line.text.startsWith("<<"))
            return false;
        // Find closing >>
        const closeIdx = line.text.indexOf(">>", 2);
        if (closeIdx === -1)
            return false;
        // Check rest of line is empty
        if (line.text.slice(closeIdx + 2).trim())
            return false;
        const start = cx.lineStart;
        // Parse macro name
        let nameEnd = 2;
        while (nameEnd < closeIdx && !/\s/.test(line.text[nameEnd]))
            nameEnd++;
        const name = line.text.slice(2, nameEnd);
        if (!name)
            return false;
        const children = [
            elt(Type.MacroCallMark, start, start + 2),
            elt(Type.MacroName, start + 2, start + 2 + name.length),
        ];
        // Parse parameters
        const paramsStr = line.text.slice(nameEnd, closeIdx);
        if (paramsStr.trim()) {
            const paramElements = parseMacroParamsBlock(paramsStr, start + nameEnd);
            children.push(...paramElements);
        }
        children.push(elt(Type.MacroCallMark, start + closeIdx, start + closeIdx + 2));
        cx.addElement(elt(Type.MacroCallBlock, start, start + line.text.length, children));
        return true;
    }
};
// ============================================================================
// HTML Block and Widget Block
// ============================================================================
/**
 * Parse widget/HTML tag attributes
 * Supports:
 * - name="value" or name='value' (quoted string)
 * - name=value (unquoted, no spaces)
 * - name={{reference}} (indirect/transclusion)
 * - name={{{filter}}} (filtered)
 * - name=<<macro>> (macro call)
 * - name=`substituted` or name=```substituted``` (substituted string)
 * - name (boolean, no value)
 */
function parseAttributes(attrString, offset, isWidget) {
    const elements = [];
    let pos = 0;
    const len = attrString.length;
    while (pos < len) {
        // Skip whitespace
        while (pos < len && /\s/.test(attrString[pos]))
            pos++;
        if (pos >= len)
            break;
        // Parse attribute name (allows letters, numbers, hyphens, underscores, colons, dots, $)
        const nameStart = pos;
        while (pos < len && /[a-zA-Z0-9\-_:.$]/.test(attrString[pos]))
            pos++;
        if (pos === nameStart) {
            // Not a valid attribute name, skip character
            pos++;
            continue;
        }
        const nameEnd = pos;
        // Check for = sign
        while (pos < len && /\s/.test(attrString[pos]))
            pos++;
        if (pos >= len || attrString[pos] !== '=') {
            // Boolean attribute (no value)
            const attrChildren = [
                elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
            ];
            elements.push(elt(Type.Attribute, offset + nameStart, offset + nameEnd, attrChildren));
            continue;
        }
        // Skip the =
        pos++;
        // Skip whitespace after =
        while (pos < len && /\s/.test(attrString[pos]))
            pos++;
        if (pos >= len) {
            // Attribute with = but no value
            const attrChildren = [
                elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
            ];
            elements.push(elt(Type.Attribute, offset + nameStart, offset + pos, attrChildren));
            continue;
        }
        const valueStart = pos;
        let valueEnd = pos;
        let valueType = Type.AttributeValue;
        const ch = attrString[pos];
        if (ch === '"' || ch === "'") {
            // Quoted string: "value" or 'value'
            const quote = ch;
            pos++; // skip opening quote
            const stringStart = pos;
            while (pos < len && attrString[pos] !== quote) {
                if (attrString[pos] === '\\' && pos + 1 < len)
                    pos++; // skip escaped char
                pos++;
            }
            const stringEnd = pos;
            if (pos < len)
                pos++; // skip closing quote
            valueEnd = pos;
            valueType = Type.AttributeString;
            // Check if this is a filter attribute - parse content as filter expression
            const attrName = attrString.slice(nameStart, nameEnd).toLowerCase();
            if (attrName === 'filter' || attrName === '$filter') {
                const filterContent = attrString.slice(stringStart, stringEnd);
                const filterChildren = parseFilterExpressionBlock(filterContent, offset + stringStart);
                const valueChildren = [
                    elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                    elt(Type.FilterExpression, offset + stringStart, offset + stringEnd, filterChildren),
                    elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                ];
                const attrChildren = [
                    elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                    elt(Type.AttributeFiltered, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
        }
        else if (ch === '{') {
            // Could be {{indirect}} or {{{filtered}}}
            if (attrString.slice(pos, pos + 3) === '{{{') {
                // Filtered: {{{filter}}}
                const openMarkStart = pos;
                pos += 3;
                const filterStart = pos;
                while (pos < len && attrString.slice(pos, pos + 3) !== '}}}')
                    pos++;
                const filterEnd = pos;
                if (attrString.slice(pos, pos + 3) === '}}}')
                    pos += 3;
                valueEnd = pos;
                valueType = Type.AttributeFiltered;
                // Parse filter expression children for proper highlighting
                const filterContent = attrString.slice(filterStart, filterEnd);
                const filterChildren = parseFilterExpressionBlock(filterContent, offset + filterStart);
                // Create child elements for filtered transclusion
                const valueChildren = [
                    elt(Type.FilteredTransclusionMark, offset + openMarkStart, offset + openMarkStart + 3),
                    elt(Type.FilterExpression, offset + filterStart, offset + filterEnd, filterChildren),
                    elt(Type.FilteredTransclusionMark, offset + filterEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                    elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
            else if (attrString.slice(pos, pos + 2) === '{{') {
                // Indirect: {{reference}}
                const openMarkStart = pos;
                pos += 2;
                const targetStart = pos;
                while (pos < len && attrString.slice(pos, pos + 2) !== '}}')
                    pos++;
                const targetEnd = pos;
                if (attrString.slice(pos, pos + 2) === '}}')
                    pos += 2;
                valueEnd = pos;
                valueType = Type.AttributeIndirect;
                // Parse transclusion target details (tiddler!!field or tiddler##index)
                const targetContent = attrString.slice(targetStart, targetEnd);
                const targetChildren = parseTransclusionTargetBlock(targetContent, offset + targetStart);
                // Create child elements for transclusion
                const valueChildren = [
                    elt(Type.TransclusionMark, offset + openMarkStart, offset + openMarkStart + 2),
                    ...targetChildren,
                    elt(Type.TransclusionMark, offset + targetEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                    elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
            else {
                // Just a { character, treat as unquoted value
                while (pos < len && !/[\s>]/.test(attrString[pos]))
                    pos++;
                valueEnd = pos;
            }
        }
        else if (ch === '<' && attrString[pos + 1] === '<') {
            // Macro: <<macroname params>>
            const openMarkStart = pos;
            pos += 2;
            const macroContentStart = pos;
            // Parse macro name
            while (pos < len && /[a-zA-Z0-9\-_.$]/.test(attrString[pos]))
                pos++;
            const macroNameEnd = pos;
            // Skip to end of macro
            let depth = 1;
            while (pos < len && depth > 0) {
                if (attrString.slice(pos, pos + 2) === '<<') {
                    depth++;
                    pos += 2;
                }
                else if (attrString.slice(pos, pos + 2) === '>>') {
                    depth--;
                    if (depth === 0)
                        break;
                    pos += 2;
                }
                else {
                    pos++;
                }
            }
            const closeMarkStart = pos;
            if (attrString.slice(pos, pos + 2) === '>>')
                pos += 2;
            valueEnd = pos;
            valueType = Type.AttributeMacro;
            // Create child elements for macro
            const valueChildren = [
                elt(Type.MacroCallMark, offset + openMarkStart, offset + openMarkStart + 2),
                elt(Type.MacroName, offset + macroContentStart, offset + macroNameEnd),
                elt(Type.MacroCallMark, offset + closeMarkStart, offset + valueEnd)
            ];
            const attrChildren = [
                elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
            ];
            elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            continue;
        }
        else if (ch === '`') {
            // Substituted string: `value` or ```value```
            let openMarkEnd;
            let closeMarkStart;
            if (attrString.slice(pos, pos + 3) === '```') {
                openMarkEnd = pos + 3;
                pos += 3;
                while (pos < len && attrString.slice(pos, pos + 3) !== '```')
                    pos++;
                closeMarkStart = pos;
                if (attrString.slice(pos, pos + 3) === '```')
                    pos += 3;
            }
            else {
                openMarkEnd = pos + 1;
                pos++; // skip opening `
                while (pos < len && attrString[pos] !== '`')
                    pos++;
                closeMarkStart = pos;
                if (pos < len)
                    pos++; // skip closing `
            }
            valueEnd = pos;
            valueType = Type.AttributeSubstituted;
            // Parse $(variable)$ and ${ filter }$ patterns inside the substituted string
            const valueChildren = [
                elt(Type.Mark, offset + valueStart, offset + openMarkEnd) // Opening `
            ];
            const content = attrString.slice(openMarkEnd, closeMarkStart);
            let contentPos = 0;
            const contentOffset = offset + openMarkEnd;
            while (contentPos < content.length) {
                // Check for ${ filter }$ pattern first (filter expressions are substituted before variables)
                // Note: can't use simple regex since filter may contain } characters
                if (content.slice(contentPos, contentPos + 2) === '${') {
                    // Find the closing }$
                    const searchStart = contentPos + 2;
                    let filterEndPos = -1;
                    for (let i = searchStart; i < content.length - 1; i++) {
                        if (content[i] === '}' && content[i + 1] === '$') {
                            filterEndPos = i;
                            break;
                        }
                    }
                    if (filterEndPos !== -1) {
                        const filterMatch = [
                            content.slice(contentPos, filterEndPos + 2),
                            content.slice(contentPos + 2, filterEndPos)
                        ];
                        const filterStart = contentOffset + contentPos;
                        const filterEnd = filterStart + filterMatch[0].length;
                        const filterExprStart = filterStart + 2;
                        const filterExprEnd = filterEnd - 2;
                        // Parse the filter expression inside
                        const filterContent = filterMatch[1].trim();
                        const filterChildren = parseFilterExpressionBlock(filterContent, filterExprStart + (filterMatch[1].length - filterMatch[1].trimStart().length));
                        valueChildren.push(elt(Type.FilterSubstitution, filterStart, filterEnd, [
                            elt(Type.FilterSubstitutionMark, filterStart, filterStart + 2),
                            elt(Type.FilterExpression, filterExprStart, filterExprEnd, filterChildren),
                            elt(Type.FilterSubstitutionMark, filterEnd - 2, filterEnd)
                        ]));
                        contentPos += filterMatch[0].length;
                        continue;
                    }
                }
                // Check for $(variable)$ pattern
                const varMatch = content.slice(contentPos).match(/^\$\(([^)]+)\)\$/);
                if (varMatch) {
                    const varStart = contentOffset + contentPos;
                    const varEnd = varStart + varMatch[0].length;
                    const varNameStart = varStart + 2;
                    const varNameEnd = varNameStart + varMatch[1].length;
                    valueChildren.push(elt(Type.Variable, varStart, varEnd, [
                        elt(Type.VariableMark, varStart, varStart + 2),
                        elt(Type.VariableName, varNameStart, varNameEnd),
                        elt(Type.VariableMark, varNameEnd, varEnd)
                    ]));
                    contentPos += varMatch[0].length;
                }
                else {
                    contentPos++;
                }
            }
            valueChildren.push(elt(Type.Mark, offset + closeMarkStart, offset + valueEnd)); // Closing `
            const attrChildren = [
                elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
            ];
            elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            continue;
        }
        else {
            // Unquoted value - read until whitespace or >
            while (pos < len && !/[\s>\/]/.test(attrString[pos]))
                pos++;
            valueEnd = pos;
            // Check if it looks like a number
            const valueText = attrString.slice(valueStart, valueEnd);
            if (/^-?\d+(\.\d+)?$/.test(valueText)) {
                valueType = Type.AttributeNumber;
            }
            else {
                valueType = Type.AttributeString;
            }
        }
        const attrChildren = [
            elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
            elt(valueType, offset + valueStart, offset + valueEnd)
        ];
        elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
    }
    return elements;
}
// Opening tag start: <tagname or <$widget (may not have closing >)
const openTagStartRe = /^(\s*)<([a-zA-Z$][a-zA-Z0-9\-]*)/;
// Closing tag: </tagname> or </$widget>
const closeTagRe = /^(\s*)<\/([a-zA-Z$][a-zA-Z0-9\-]*)>/;
// Self-closing check
const selfClosingRe = /\/>\s*$/;
const HTMLBlock = {
    name: "HTMLBlock",
    parse(cx, line) {
        const text = line.text;
        // Try closing tag first (orphaned closing tag)
        const closeMatch = closeTagRe.exec(text);
        if (closeMatch) {
            const indent = closeMatch[1].length;
            const tagName = closeMatch[2];
            const isWidget = tagName.startsWith("$");
            const start = cx.lineStart;
            const children = [];
            const tagStart = start + indent + 2; // After "</"
            children.push(elt(isWidget ? Type.WidgetName : Type.TagName, tagStart, tagStart + tagName.length));
            // End the closing tag element at the actual tag end, not end of line
            const closeTagEnd = start + closeMatch[0].length;
            cx.addElement(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, start, closeTagEnd, children));
            // Parse any inline content after the closing tag on the same line
            const afterTag = text.slice(closeMatch[0].length);
            if (afterTag.trim()) {
                const inlineElements = cx.parser.parseInline(afterTag, closeTagEnd);
                const paragraphElt = cx.elt(Type.Paragraph, closeTagEnd, closeTagEnd + afterTag.length, inlineElements);
                cx.addElement(paragraphElt);
            }
            return true;
        }
        // Check for opening tag start
        const openStartMatch = openTagStartRe.exec(text);
        if (!openStartMatch)
            return false;
        const indent = openStartMatch[1].length;
        const tagName = openStartMatch[2];
        const isWidget = tagName.startsWith("$");
        const start = cx.lineStart;
        const children = [];
        const tagStart = start + indent + 1; // After "<"
        children.push(elt(isWidget ? Type.WidgetName : Type.TagName, tagStart, tagStart + tagName.length));
        let openingTagEnd;
        let selfClose;
        let attrsStart = tagStart + tagName.length;
        let openingTagLineEnd; // Position after the line containing >
        /**
         * Find the first > or /> that closes the opening tag, properly handling
         * > inside quoted strings, macros, transclusions, etc.
         */
        const findOpeningTagEnd = (text) => {
            let pos = 0;
            const len = text.length;
            while (pos < len) {
                const ch = text[pos];
                if (ch === '>') {
                    return { pos: pos + 1, selfClose: false };
                }
                if (ch === '/' && text[pos + 1] === '>') {
                    return { pos: pos + 2, selfClose: true };
                }
                if (ch === '"' || ch === "'") {
                    // Skip quoted string
                    const quote = ch;
                    pos++;
                    while (pos < len && text[pos] !== quote) {
                        if (text[pos] === '\\')
                            pos++;
                        pos++;
                    }
                    pos++;
                }
                else if (ch === '<' && text[pos + 1] === '<') {
                    // Skip macro <<...>>
                    pos += 2;
                    let depth = 1;
                    while (pos < len && depth > 0) {
                        if (text[pos] === '<' && text[pos + 1] === '<') {
                            depth++;
                            pos += 2;
                        }
                        else if (text[pos] === '>' && text[pos + 1] === '>') {
                            depth--;
                            pos += 2;
                        }
                        else {
                            pos++;
                        }
                    }
                }
                else if (ch === '{' && text[pos + 1] === '{' && text[pos + 2] === '{') {
                    // Skip filtered {{{...}}}
                    pos += 3;
                    while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}' && text[pos + 2] === '}'))
                        pos++;
                    pos += 3;
                }
                else if (ch === '{' && text[pos + 1] === '{') {
                    // Skip indirect {{...}}
                    pos += 2;
                    while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}'))
                        pos++;
                    pos += 2;
                }
                else if (ch === '`') {
                    // Skip substituted string
                    if (text.slice(pos, pos + 3) === '```') {
                        pos += 3;
                        while (pos < len && text.slice(pos, pos + 3) !== '```')
                            pos++;
                        pos += 3;
                    }
                    else {
                        pos++;
                        while (pos < len && text[pos] !== '`')
                            pos++;
                        pos++;
                    }
                }
                else {
                    pos++;
                }
            }
            return null;
        };
        // Find the opening tag's closing > starting from after the tag name
        const afterTagName = text.slice(indent + 1 + tagName.length);
        let tagEndResult = findOpeningTagEnd(afterTagName);
        let accumulatedText = afterTagName;
        // If not found on current line, keep reading lines (but limit to avoid runaway parsing)
        // Save position so we can restore if we don't find the tag end
        const savedPos = cx.savePosition();
        let linesSearched = 0;
        const maxLinesForTagEnd = 20;
        while (!tagEndResult && linesSearched < maxLinesForTagEnd) {
            if (!cx.nextLine())
                break;
            accumulatedText += '\n' + cx.line.text;
            tagEndResult = findOpeningTagEnd(accumulatedText);
            linesSearched++;
        }
        // If we didn't find the tag end, restore position to just after the first line
        if (!tagEndResult) {
            cx.restorePosition(savedPos);
        }
        if (tagEndResult) {
            selfClose = tagEndResult.selfClose;
            openingTagEnd = start + indent + 1 + tagName.length + tagEndResult.pos;
            openingTagLineEnd = cx.lineStart + cx.line.text.length;
            // Extract attribute content (between tag name and closing >)
            let attrContent = accumulatedText.slice(0, tagEndResult.pos - 1);
            if (selfClose && attrContent.endsWith('/')) {
                attrContent = attrContent.slice(0, -1);
            }
            if (attrContent.trim()) {
                const attrElements = parseAttributes(attrContent, attrsStart);
                children.push(...attrElements);
            }
        }
        else {
            // No > found, treat as incomplete - only include the first line
            // Don't consume more lines looking for a closing tag
            selfClose = false;
            openingTagEnd = start + text.length;
            openingTagLineEnd = openingTagEnd;
            // Still parse whatever attributes we have on this line
            if (afterTagName.trim()) {
                const attrElements = parseAttributes(afterTagName, attrsStart);
                children.push(...attrElements);
            }
            // For incomplete opening tags, just output what we have and return
            cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, openingTagEnd, children));
            return true;
        }
        // Determine if this is a multi-line block with content
        if (!selfClose) {
            const openRe = new RegExp(`<${tagName.replace(/\$/g, '\\$')}(?:\\s|>|/>)`);
            const closeRe = new RegExp(`</${tagName.replace(/\$/g, '\\$')}>`);
            let blockEnd = openingTagLineEnd;
            let foundClose = false;
            // First, check if closing tag is on the same line after the opening tag
            const restOfLine = cx.input.read(openingTagEnd, openingTagLineEnd);
            const sameLineClose = closeRe.exec(restOfLine);
            if (sameLineClose) {
                // Closing tag on same line - check for nested tags in between
                const beforeClose = restOfLine.slice(0, sameLineClose.index);
                const openMatches = beforeClose.match(openRe) || [];
                const closeMatches = beforeClose.match(new RegExp(closeRe.source, 'g')) || [];
                // Simple case: no nested same-name tags between open and close
                if (openMatches.length === closeMatches.length) {
                    const contentStart = openingTagEnd;
                    const contentEnd = openingTagEnd + sameLineClose.index;
                    // Parse inline content between opening and closing tags
                    if (contentEnd > contentStart) {
                        const contentText = cx.input.read(contentStart, contentEnd);
                        const inlineElements = cx.parser.parseInline(contentText, contentStart);
                        children.push(...inlineElements);
                    }
                    // Add closing tag element
                    const closeTagStart = openingTagEnd + sameLineClose.index + 2; // After </
                    children.push(elt(isWidget ? Type.WidgetName : Type.TagName, closeTagStart, closeTagStart + tagName.length));
                    const closeTagEnd = openingTagEnd + sameLineClose.index + sameLineClose[0].length;
                    // Parse any inline content AFTER the closing tag on the same line
                    const afterCloseTag = restOfLine.slice(sameLineClose.index + sameLineClose[0].length);
                    if (afterCloseTag.trim()) {
                        const afterCloseStart = closeTagEnd;
                        const inlineElements = cx.parser.parseInline(afterCloseTag, afterCloseStart);
                        children.push(...inlineElements);
                    }
                    blockEnd = openingTagLineEnd;
                    foundClose = true;
                }
            }
            if (!foundClose) {
                // Multi-line content: find the closing tag on subsequent lines
                // But first, there may be inline content on the same line as the opening tag
                const sameLineContent = cx.input.read(openingTagEnd, openingTagLineEnd);
                const blockContentStart = openingTagLineEnd + 1;
                let contentEnd = blockContentStart;
                let nestLevel = 1;
                // Save position in case we don't find a closing tag
                const savedPosForClose = cx.savePosition();
                while (cx.nextLine()) {
                    const lineText = cx.line.text;
                    // Check for nested opening tags of the same name (complete tags only)
                    const nestedOpen = openRe.exec(lineText);
                    if (nestedOpen && !selfClosingRe.test(lineText)) {
                        nestLevel++;
                    }
                    // Check for closing tag
                    const closeMatch = closeRe.exec(lineText);
                    if (closeMatch) {
                        nestLevel--;
                        if (nestLevel === 0) {
                            // Found our closing tag
                            contentEnd = cx.lineStart - 1; // Before closing tag line (exclude newline)
                            // First, parse any inline content on the same line as the opening tag
                            if (sameLineContent.trim()) {
                                const inlineElements = cx.parser.parseInline(sameLineContent, openingTagEnd);
                                children.push(...inlineElements);
                            }
                            // Then parse block content between opening line and closing tag
                            if (contentEnd > blockContentStart) {
                                const contentElements = cx.parseContentRange(blockContentStart, contentEnd, false);
                                children.push(...contentElements);
                            }
                            // Add closing tag element
                            const closeIndent = (closeMatch[1] || '').length;
                            const closeTagStart = cx.lineStart + closeIndent + 2;
                            children.push(elt(isWidget ? Type.WidgetName : Type.TagName, closeTagStart, closeTagStart + tagName.length));
                            // Parse any inline content AFTER the closing tag on the same line
                            const closeTagFullEnd = closeIndent + closeMatch[0].length;
                            const afterCloseTag = lineText.slice(closeTagFullEnd);
                            if (afterCloseTag.trim()) {
                                const afterCloseStart = cx.lineStart + closeTagFullEnd;
                                const inlineElements = cx.parser.parseInline(afterCloseTag, afterCloseStart);
                                children.push(...inlineElements);
                            }
                            blockEnd = cx.lineStart + lineText.length;
                            foundClose = true;
                            break;
                        }
                    }
                }
                // If no closing tag found, restore position and only output the opening tag
                // Let the content be parsed separately
                if (!foundClose) {
                    cx.restorePosition(savedPosForClose);
                    blockEnd = openingTagLineEnd;
                }
            }
            cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, blockEnd, children));
            return true;
        }
        // Self-closing tag
        cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, openingTagEnd, children));
        return true;
    }
};
// ============================================================================
// Export all default block parsers
// ============================================================================
// ============================================================================
// Multi-line Styled Block (@@.className ... @@)
// ============================================================================
const styledBlockOpenRe = /^@@(\.[a-zA-Z_][a-zA-Z0-9_\-]*)*\s*$/;
const StyledBlock = {
    name: "StyledBlock",
    parse(cx, line) {
        // Match opening line: @@ or @@.className
        const match = styledBlockOpenRe.exec(line.text);
        if (!match)
            return false;
        const start = cx.lineStart;
        const children = [
            elt(Type.HighlightMark, start, start + 2), // Opening @@
        ];
        // Parse class names after @@
        let pos = 2;
        while (pos < line.text.length) {
            if (line.text[pos] === '.') {
                const markStart = pos;
                pos++;
                const classStart = pos;
                while (pos < line.text.length && /[a-zA-Z0-9_\-]/.test(line.text[pos]))
                    pos++;
                if (pos > classStart) {
                    children.push(elt(Type.StyledBlockMark, start + markStart, start + markStart + 1));
                    children.push(elt(Type.StyledBlockClass, start + classStart, start + pos));
                }
            }
            else {
                pos++;
            }
        }
        const openingLineEnd = start + line.text.length;
        // Find closing @@ on its own line
        let closingLine = cx.lineStart + line.text.length + 1;
        let contentEnd = closingLine;
        while (closingLine < cx.input.length) {
            // Read until end of line
            let lineEnd = closingLine;
            while (lineEnd < cx.input.length && cx.input.read(lineEnd, lineEnd + 1) !== '\n') {
                lineEnd++;
            }
            const lineText = cx.input.read(closingLine, lineEnd);
            if (lineText.trim() === '@@') {
                contentEnd = closingLine;
                // Parse content between opening and closing
                if (contentEnd > openingLineEnd + 1) {
                    const contentElements = cx.parseContentRange(openingLineEnd + 1, contentEnd);
                    children.push(...contentElements);
                }
                // Add closing mark
                const closeStart = closingLine + lineText.indexOf('@@');
                children.push(elt(Type.HighlightMark, closeStart, closeStart + 2));
                cx.addElement(elt(Type.Highlight, start, lineEnd, children));
                // Advance to the closing @@ line (parseBlock will call nextLine() to move past it)
                while (cx.lineStart < closingLine) {
                    cx.nextLine();
                }
                return true;
            }
            closingLine = lineEnd + 1;
        }
        // No closing found - don't match
        return false;
    }
};
// ============================================================================
// Conditional Block (<%if%> <%elseif%> <%else%> <%endif%>)
// ============================================================================
const conditionalIfRe = /^<%if\s+(.+?)\s*%>\s*$/;
const conditionalElseifRe = /^<%elseif\s+(.+?)\s*%>\s*$/;
const conditionalElseRe = /^<%else\s*%>\s*$/;
const conditionalEndifRe = /^<%endif\s*%>\s*$/;
const ConditionalBlock = {
    name: "ConditionalBlock",
    parse(cx, line) {
        const ifMatch = conditionalIfRe.exec(line.text);
        if (!ifMatch)
            return false;
        const start = cx.lineStart;
        const filter = ifMatch[1];
        const children = [];
        // Parse opening <%if [filter] %>
        line.text.indexOf('if');
        children.push(elt(Type.ConditionalMark, start, start + 2)); // <%
        children.push(elt(Type.ConditionalKeyword, start + 2, start + 4)); // if
        // Parse the filter expression
        const filterStart = start + line.text.indexOf(filter);
        const filterChildren = parseFilterExpressionBlock(filter, filterStart);
        children.push(elt(Type.FilterExpression, filterStart, filterStart + filter.length, filterChildren));
        children.push(elt(Type.ConditionalMark, start + line.text.length - 2, start + line.text.length)); // %>
        const openingLineEnd = start + line.text.length;
        // Track branches and find <%endif%>
        let currentPos = openingLineEnd + 1;
        let branchStart = currentPos;
        let depth = 1;
        let endPos = -1;
        let endifLineStart = -1;
        while (currentPos < cx.input.length && depth > 0) {
            // Read until end of line
            let lineEnd = currentPos;
            while (lineEnd < cx.input.length && cx.input.read(lineEnd, lineEnd + 1) !== '\n') {
                lineEnd++;
            }
            const lineText = cx.input.read(currentPos, lineEnd);
            // Check for nested <%if%>
            if (conditionalIfRe.test(lineText)) {
                depth++;
            }
            else if (conditionalEndifRe.test(lineText)) {
                depth--;
                if (depth === 0) {
                    // Parse content before <%endif%>
                    if (currentPos > branchStart) {
                        const branchContent = cx.parseContentRange(branchStart, currentPos);
                        if (branchContent.length > 0) {
                            children.push(elt(Type.ConditionalBranch, branchStart, currentPos, branchContent));
                        }
                    }
                    // Parse <%endif%>
                    const endifStart = currentPos + lineText.indexOf('<%');
                    children.push(elt(Type.ConditionalMark, endifStart, endifStart + 2));
                    children.push(elt(Type.ConditionalKeyword, endifStart + 2, endifStart + 7)); // endif
                    children.push(elt(Type.ConditionalMark, endifStart + lineText.indexOf('%>'), endifStart + lineText.indexOf('%>') + 2));
                    endifLineStart = currentPos;
                    endPos = lineEnd;
                    break;
                }
            }
            else if (depth === 1 && conditionalElseifRe.test(lineText)) {
                // Parse content before <%elseif%>
                if (currentPos > branchStart) {
                    const branchContent = cx.parseContentRange(branchStart, currentPos);
                    if (branchContent.length > 0) {
                        children.push(elt(Type.ConditionalBranch, branchStart, currentPos, branchContent));
                    }
                }
                // Parse <%elseif [filter] %>
                const elseifMatch = conditionalElseifRe.exec(lineText);
                if (elseifMatch) {
                    const elseifStart = currentPos + lineText.indexOf('<%');
                    children.push(elt(Type.ConditionalMark, elseifStart, elseifStart + 2));
                    children.push(elt(Type.ConditionalKeyword, elseifStart + 2, elseifStart + 8)); // elseif
                    const elseifFilter = elseifMatch[1];
                    const elseifFilterStart = currentPos + lineText.indexOf(elseifFilter);
                    const elseifFilterChildren = parseFilterExpressionBlock(elseifFilter, elseifFilterStart);
                    children.push(elt(Type.FilterExpression, elseifFilterStart, elseifFilterStart + elseifFilter.length, elseifFilterChildren));
                    children.push(elt(Type.ConditionalMark, currentPos + lineText.indexOf('%>'), currentPos + lineText.indexOf('%>') + 2));
                }
                branchStart = lineEnd + 1;
            }
            else if (depth === 1 && conditionalElseRe.test(lineText)) {
                // Parse content before <%else%>
                if (currentPos > branchStart) {
                    const branchContent = cx.parseContentRange(branchStart, currentPos);
                    if (branchContent.length > 0) {
                        children.push(elt(Type.ConditionalBranch, branchStart, currentPos, branchContent));
                    }
                }
                // Parse <%else%>
                const elseStart = currentPos + lineText.indexOf('<%');
                children.push(elt(Type.ConditionalMark, elseStart, elseStart + 2));
                children.push(elt(Type.ConditionalKeyword, elseStart + 2, elseStart + 6)); // else
                children.push(elt(Type.ConditionalMark, currentPos + lineText.indexOf('%>'), currentPos + lineText.indexOf('%>') + 2));
                branchStart = lineEnd + 1;
            }
            currentPos = lineEnd + 1;
        }
        if (endPos === -1) {
            // No closing <%endif%> found
            return false;
        }
        cx.addElement(elt(Type.ConditionalBlock, start, endPos, children));
        // Advance to the <%endif%> line (parseBlock will call nextLine() to move past it)
        while (cx.lineStart < endifLineStart) {
            cx.nextLine();
        }
        return true;
    }
};
const DefaultBlockParsers = [
    ConditionalBlock, // <%if%> ... <%endif%>
    StyledBlock, // Multi-line @@...@@
    Heading,
    HorizontalRule,
    FencedCode,
    TypedBlock,
    MultiLineBlockQuote,
    List,
    Table,
    CommentBlock,
    TransclusionBlock,
    FilteredTransclusionBlock,
    MacroCallBlock,
    HTMLBlock,
];

/**
 * TiddlyWiki Parser - Inline Parsers
 *
 * Inline-level parsing rules following the Lezer Markdown architecture.
 */
// ============================================================================
// Escape Parser (~WikiWord prevents linking)
// ============================================================================
const Escape = {
    name: "Escape",
    parse(cx, next, pos) {
        if (next !== Ch.Tilde && next !== Ch.Backslash)
            return -1;
        const after = cx.char(pos + 1);
        if (after < 0)
            return -1;
        // ~ before CamelCase word prevents linking
        if (next === Ch.Tilde) {
            // Check if followed by uppercase letter
            if (after >= 65 && after <= 90) { // A-Z
                return cx.addElement(cx.elt(Type.Escape, pos, pos + 1));
            }
            return -1;
        }
        // Backslash escape
        return cx.addElement(cx.elt(Type.Escape, pos, pos + 2));
    }
};
// ============================================================================
// Entity Parser (&amp; etc)
// ============================================================================
const entityRe = /^&(?:#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/;
const Entity = {
    name: "Entity",
    parse(cx, next, pos) {
        if (next !== Ch.Ampersand)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = entityRe.exec(text);
        if (!match)
            return -1;
        return cx.addElement(cx.elt(Type.Entity, pos, pos + match[0].length));
    }
};
// ============================================================================
// Inline Code Parser (`code`)
// ============================================================================
const InlineCode = {
    name: "InlineCode",
    parse(cx, next, pos) {
        if (next !== Ch.Backtick)
            return -1;
        // Find closing backtick
        let end = pos + 1;
        while (end < cx.end) {
            if (cx.char(end) === Ch.Backtick) {
                return cx.addElement(cx.elt(Type.InlineCode, pos, end + 1, [
                    cx.elt(Type.InlineCodeMark, pos, pos + 1),
                    cx.elt(Type.CodeText, pos + 1, end),
                    cx.elt(Type.InlineCodeMark, end, end + 1),
                ]));
            }
            end++;
        }
        return -1;
    }
};
// ============================================================================
// Bold Parser ('')
// ============================================================================
const BoldDelim = { resolve: "Bold", mark: "BoldMark" };
const Bold = {
    name: "Bold",
    parse(cx, next, pos) {
        if (next !== Ch.Apostrophe || cx.char(pos + 1) !== Ch.Apostrophe)
            return -1;
        // Use simple flanking rules like TiddlyWiki (not Markdown's complex rules)
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        return cx.addDelimiter(BoldDelim, pos, pos + 2, !sAfter, !sBefore);
    }
};
// ============================================================================
// Italic Parser (//)
// ============================================================================
const ItalicDelim = { resolve: "Italic", mark: "ItalicMark" };
const Italic = {
    name: "Italic",
    parse(cx, next, pos) {
        if (next !== Ch.Slash || cx.char(pos + 1) !== Ch.Slash)
            return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        return cx.addDelimiter(ItalicDelim, pos, pos + 2, !sAfter, !sBefore);
    }
};
// ============================================================================
// Underline Parser (__)
// ============================================================================
const UnderlineDelim = { resolve: "Underline", mark: "UnderlineMark" };
const Underline = {
    name: "Underline",
    parse(cx, next, pos) {
        if (next !== Ch.Underscore || cx.char(pos + 1) !== Ch.Underscore)
            return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        return cx.addDelimiter(UnderlineDelim, pos, pos + 2, !sAfter, !sBefore);
    }
};
// ============================================================================
// Strikethrough Parser (~~)
// ============================================================================
const StrikethroughDelim = { resolve: "Strikethrough", mark: "StrikethroughMark" };
const Strikethrough = {
    name: "Strikethrough",
    parse(cx, next, pos) {
        if (next !== Ch.Tilde || cx.char(pos + 1) !== Ch.Tilde)
            return -1;
        // Make sure it's not ~~~ (odd number of tildes, which is a code fence marker)
        // But allow ~~~~ (even number, which is empty strikethrough)
        if (cx.char(pos + 2) === Ch.Tilde && cx.char(pos + 3) !== Ch.Tilde)
            return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        return cx.addDelimiter(StrikethroughDelim, pos, pos + 2, !sAfter, !sBefore);
    }
};
// ============================================================================
// Superscript Parser (^^)
// ============================================================================
const SuperscriptDelim = { resolve: "Superscript", mark: "SuperscriptMark" };
const Superscript = {
    name: "Superscript",
    parse(cx, next, pos) {
        if (next !== Ch.Caret || cx.char(pos + 1) !== Ch.Caret)
            return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        return cx.addDelimiter(SuperscriptDelim, pos, pos + 2, !sAfter, !sBefore);
    }
};
// ============================================================================
// Subscript Parser (,,)
// ============================================================================
const SubscriptDelim = { resolve: "Subscript", mark: "SubscriptMark" };
const Subscript = {
    name: "Subscript",
    parse(cx, next, pos) {
        if (next !== Ch.Comma || cx.char(pos + 1) !== Ch.Comma)
            return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        return cx.addDelimiter(SubscriptDelim, pos, pos + 2, !sAfter, !sBefore);
    }
};
// ============================================================================
// Highlight/Styled Parser (@@.className content@@ or @@color:red;content@@)
// ============================================================================
const Highlight = {
    name: "Highlight",
    parse(cx, next, pos) {
        if (next !== Ch.At || cx.char(pos + 1) !== Ch.At)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Find closing @@
        let closePos = -1;
        for (let i = 2; i < text.length - 1; i++) {
            if (text[i] === '@' && text[i + 1] === '@') {
                closePos = i;
                break;
            }
        }
        if (closePos === -1)
            return -1;
        const end = pos + closePos + 2;
        const content = text.slice(2, closePos);
        const children = [
            cx.elt(Type.HighlightMark, pos, pos + 2), // Opening @@
        ];
        // Check for .className or CSS styles at the start
        let contentStart = 0;
        let hasClasses = false;
        // Parse .className(s)
        while (contentStart < content.length && content[contentStart] === '.') {
            hasClasses = true;
            const classStart = contentStart;
            contentStart++; // skip .
            const classNameStart = contentStart;
            while (contentStart < content.length && /[a-zA-Z0-9_\-]/.test(content[contentStart])) {
                contentStart++;
            }
            if (contentStart > classNameStart) {
                children.push(cx.elt(Type.StyledBlockMark, pos + 2 + classStart, pos + 2 + classStart + 1));
                children.push(cx.elt(Type.StyledBlockClass, pos + 2 + classNameStart, pos + 2 + contentStart));
            }
        }
        // Check for CSS styles (property:value;)
        if (!hasClasses && content.includes(':') && content.includes(';')) {
            const styleEnd = content.indexOf(';') + 1;
            // The style part is implicitly included in Highlight
            contentStart = styleEnd;
        }
        // Skip leading space after classes/styles
        if (contentStart < content.length && /\s/.test(content[contentStart])) {
            contentStart++;
        }
        // The rest is content - parse it as inline
        if (contentStart < closePos) {
            const innerContent = content.slice(contentStart);
            const innerElements = cx.parser.parseInline(innerContent, pos + 2 + contentStart);
            children.push(...innerElements);
        }
        children.push(cx.elt(Type.HighlightMark, end - 2, end)); // Closing @@
        return cx.addElement(cx.elt(Type.Highlight, pos, end, children));
    }
};
// ============================================================================
// WikiLink Parser ([[text|target]] or [[target]])
// ============================================================================
const wikiLinkRe = /^\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/;
const WikiLink = {
    name: "WikiLink",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBracket || cx.char(pos + 1) !== Ch.LeftBracket)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = wikiLinkRe.exec(text);
        if (!match)
            return -1;
        const end = pos + match[0].length;
        const firstPart = match[1];
        const secondPart = match[2];
        const children = [
            cx.elt(Type.WikiLinkMark, pos, pos + 2),
        ];
        if (secondPart !== undefined) {
            // [[text|target]]
            children.push(cx.elt(Type.LinkText, pos + 2, pos + 2 + firstPart.length));
            children.push(cx.elt(Type.LinkSeparator, pos + 2 + firstPart.length, pos + 3 + firstPart.length));
            children.push(cx.elt(Type.LinkTarget, pos + 3 + firstPart.length, end - 2));
        }
        else {
            // [[target]]
            children.push(cx.elt(Type.LinkTarget, pos + 2, end - 2));
        }
        children.push(cx.elt(Type.WikiLinkMark, end - 2, end));
        return cx.addElement(cx.elt(Type.WikiLink, pos, end, children));
    }
};
// ============================================================================
// External Link Parser ([ext[text|url]] or [ext[url]])
// ============================================================================
const extLinkRe = /^\[ext\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/;
const ExternalLink = {
    name: "ExternalLink",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBracket)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = extLinkRe.exec(text);
        if (!match)
            return -1;
        const end = pos + match[0].length;
        const firstPart = match[1];
        const secondPart = match[2];
        const children = [
            cx.elt(Type.ExtLinkMark, pos, pos + 5), // [ext[
        ];
        if (secondPart !== undefined) {
            children.push(cx.elt(Type.LinkText, pos + 5, pos + 5 + firstPart.length));
            children.push(cx.elt(Type.LinkSeparator, pos + 5 + firstPart.length, pos + 6 + firstPart.length));
            children.push(cx.elt(Type.URLLink, pos + 6 + firstPart.length, end - 2));
        }
        else {
            children.push(cx.elt(Type.URLLink, pos + 5, end - 2));
        }
        children.push(cx.elt(Type.ExtLinkMark, end - 2, end));
        return cx.addElement(cx.elt(Type.ExternalLink, pos, end, children));
    }
};
// ============================================================================
// Image Link Parser ([img[src]] or [img width=x height=y [tooltip|src]])
// ============================================================================
const imgLinkRe = /^\[img(\s+[^\[]+)?\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/;
const ImageLink = {
    name: "ImageLink",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBracket)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = imgLinkRe.exec(text);
        if (!match)
            return -1;
        const end = pos + match[0].length;
        const attrs = match[1]; // attributes like " width=100 class=thumb"
        const tooltipOrSource = match[2]; // tooltip if | present, otherwise source
        const source = match[3]; // source after |
        const children = [
            cx.elt(Type.ImageMark, pos, pos + 4), // [img
        ];
        let attrEnd = pos + 4;
        // Parse attributes if present
        if (attrs) {
            const attrStart = pos + 4;
            attrEnd = attrStart + attrs.length;
            // Parse individual attributes
            const attrElements = parseInlineAttributes(cx, attrs.trim(), attrStart + (attrs.length - attrs.trimStart().length));
            children.push(...attrElements);
        }
        // Add the opening [ of the source bracket
        const sourceBracketStart = attrEnd;
        children.push(cx.elt(Type.ImageMark, sourceBracketStart, sourceBracketStart + 1)); // [
        // Parse tooltip and source
        const innerStart = sourceBracketStart + 1;
        if (source !== undefined) {
            // Has tooltip|source format
            const tooltipEnd = innerStart + tooltipOrSource.length;
            if (tooltipOrSource) {
                children.push(cx.elt(Type.ImageTooltip, innerStart, tooltipEnd));
            }
            children.push(cx.elt(Type.LinkSeparator, tooltipEnd, tooltipEnd + 1)); // |
            const sourceStart = tooltipEnd + 1;
            const sourceEnd = sourceStart + source.length;
            if (source) {
                children.push(cx.elt(Type.ImageSource, sourceStart, sourceEnd));
            }
        }
        else {
            // Just source, no tooltip
            const sourceEnd = innerStart + tooltipOrSource.length;
            if (tooltipOrSource) {
                children.push(cx.elt(Type.ImageSource, innerStart, sourceEnd));
            }
        }
        children.push(cx.elt(Type.ImageMark, end - 2, end)); // ]]
        return cx.addElement(cx.elt(Type.ImageLink, pos, end, children));
    }
};
// ============================================================================
// Transclusion Parser ({{ref}} or {{ref!!field}} etc)
// ============================================================================
const transclusionRe = /^\{\{([^{}|]*?)(?:\|\|([^{}|]+?))?(?:\|([^{}]+?))?\}\}/;
/**
 * Parse transclusion target details: tiddler!!field or tiddler##index
 */
function parseTransclusionTarget(cx, target, offset) {
    const children = [];
    // Check for !!field
    const fieldIdx = target.indexOf("!!");
    // Check for ##index
    const indexIdx = target.indexOf("##");
    if (fieldIdx !== -1 && (indexIdx === -1 || fieldIdx < indexIdx)) {
        // Has field reference
        const tiddlerPart = target.slice(0, fieldIdx);
        target.slice(fieldIdx + 2);
        if (tiddlerPart) {
            children.push(cx.elt(Type.TransclusionTarget, offset, offset + tiddlerPart.length));
        }
        children.push(cx.elt(Type.TransclusionField, offset + fieldIdx, offset + target.length));
    }
    else if (indexIdx !== -1) {
        // Has index reference
        const tiddlerPart = target.slice(0, indexIdx);
        target.slice(indexIdx + 2);
        if (tiddlerPart) {
            children.push(cx.elt(Type.TransclusionTarget, offset, offset + tiddlerPart.length));
        }
        children.push(cx.elt(Type.TransclusionIndex, offset + indexIdx, offset + target.length));
    }
    else {
        // Just a tiddler reference
        children.push(cx.elt(Type.TransclusionTarget, offset, offset + target.length));
    }
    return children;
}
const Transclusion = {
    name: "Transclusion",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBrace || cx.char(pos + 1) !== Ch.LeftBrace)
            return -1;
        // Make sure it's not {{{
        if (cx.char(pos + 2) === Ch.LeftBrace)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = transclusionRe.exec(text);
        if (!match)
            return -1;
        const end = pos + match[0].length;
        const target = match[1];
        const template = match[2];
        const children = [
            cx.elt(Type.TransclusionMark, pos, pos + 2),
        ];
        // Parse target details (tiddler!!field or tiddler##index)
        const targetChildren = parseTransclusionTarget(cx, target, pos + 2);
        children.push(...targetChildren);
        if (template) {
            const templateStart = pos + 2 + target.length + 2;
            children.push(cx.elt(Type.TransclusionTemplate, templateStart, templateStart + template.length));
        }
        children.push(cx.elt(Type.TransclusionMark, end - 2, end));
        return cx.addElement(cx.elt(Type.Transclusion, pos, end, children));
    }
};
// ============================================================================
// Filter Expression Parser Helper
// ============================================================================
/**
 * Parse filter expression content into detailed elements
 * Handles: [operator[operand]], [operator<variable>], [operator{textref}]
 * Also handles chained operators like [<var>operator{ref}]
 */
function parseFilterExpression(cx, filterContent, offset) {
    const elements = [];
    let pos = 0;
    const len = filterContent.length;
    while (pos < len) {
        const ch = filterContent[pos];
        // Skip whitespace
        if (/\s/.test(ch)) {
            pos++;
            continue;
        }
        // Filter step: [operators...]
        if (ch === '[') {
            const stepStart = pos;
            pos++; // skip [
            // Parse operators within this step (can be chained)
            const stepChildren = [];
            while (pos < len && filterContent[pos] !== ']') {
                // Check for negation
                if (filterContent[pos] === '!') {
                    pos++;
                }
                // Check for operand-only (title selection): [literal], <variable>, {textref}
                const operandCh = filterContent[pos];
                if (operandCh === '[') {
                    // Literal operand: [value]
                    pos++;
                    const operandStart = pos;
                    let depth = 1;
                    while (pos < len && depth > 0) {
                        if (filterContent[pos] === '[')
                            depth++;
                        else if (filterContent[pos] === ']')
                            depth--;
                        if (depth > 0)
                            pos++;
                    }
                    stepChildren.push(cx.elt(Type.FilterOperand, offset + operandStart, offset + pos));
                    if (pos < len && filterContent[pos] === ']')
                        pos++;
                }
                else if (operandCh === '<') {
                    // Variable: <varname>
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '>')
                        pos++;
                    stepChildren.push(cx.elt(Type.FilterVariable, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '{') {
                    // Text reference: {textref}
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '}')
                        pos++;
                    stepChildren.push(cx.elt(Type.FilterTextRef, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '/') {
                    // Regexp: /regexp/flags
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '/') {
                        if (filterContent[pos] === '\\')
                            pos++;
                        pos++;
                    }
                    stepChildren.push(cx.elt(Type.FilterRegexp, offset + operandStart, offset + pos));
                    if (pos < len)
                        pos++;
                    while (pos < len && /[gimsuy]/.test(filterContent[pos]))
                        pos++;
                }
                else if (/[a-zA-Z]/.test(operandCh)) {
                    // Operator name (and optional :suffix)
                    const opStart = pos;
                    while (pos < len && /[a-zA-Z0-9\-_:!]/.test(filterContent[pos]))
                        pos++;
                    stepChildren.push(cx.elt(Type.FilterOperatorName, offset + opStart, offset + pos));
                }
                else {
                    // Unknown character, skip
                    pos++;
                }
            }
            // Skip closing ]
            if (pos < len && filterContent[pos] === ']')
                pos++;
            const stepEnd = pos;
            elements.push(cx.elt(Type.FilterOperator, offset + stepStart, offset + stepEnd, stepChildren));
            continue;
        }
        // Standalone title: [[Title]]
        if (ch === '[' && filterContent[pos + 1] === '[') {
            const start = pos;
            pos += 2;
            while (pos < len && !(filterContent[pos] === ']' && filterContent[pos + 1] === ']'))
                pos++;
            pos += 2;
            elements.push(cx.elt(Type.FilterOperand, offset + start, offset + pos));
            continue;
        }
        // Run prefix: + - ~ :prefix
        if (ch === '+' || ch === '-' || ch === '~' || ch === ':') {
            pos++;
            while (pos < len && /[a-zA-Z]/.test(filterContent[pos]))
                pos++;
            continue;
        }
        pos++;
    }
    return elements;
}
// ============================================================================
// Filtered Transclusion Parser ({{{filter}}})
// ============================================================================
const FilteredTransclusion = {
    name: "FilteredTransclusion",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBrace || cx.char(pos + 1) !== Ch.LeftBrace || cx.char(pos + 2) !== Ch.LeftBrace)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Find closing }}} - need to handle nested braces properly
        let filterEnd = -1;
        for (let i = 3; i < text.length - 2; i++) {
            if (text[i] === '}' && text[i + 1] === '}' && text[i + 2] === '}') {
                filterEnd = i;
                break;
            }
        }
        if (filterEnd === -1)
            return -1;
        const filter = text.slice(3, filterEnd);
        let end = pos + filterEnd + 3;
        // Check for template
        let template = "";
        if (text.slice(filterEnd + 3, filterEnd + 5) === "||") {
            const templateStart = filterEnd + 5;
            let templateEnd = templateStart;
            while (templateEnd < text.length && !/[\s}]/.test(text[templateEnd]))
                templateEnd++;
            template = text.slice(templateStart, templateEnd);
            end = pos + templateEnd;
        }
        // Parse filter expression details
        const filterChildren = parseFilterExpression(cx, filter, pos + 3);
        const children = [
            cx.elt(Type.FilteredTransclusionMark, pos, pos + 3),
            cx.elt(Type.FilterExpression, pos + 3, pos + 3 + filter.length, filterChildren),
            cx.elt(Type.FilteredTransclusionMark, pos + 3 + filter.length, pos + filterEnd + 3),
        ];
        if (template) {
            children.push(cx.elt(Type.TransclusionTemplate, pos + filterEnd + 5, end));
        }
        return cx.addElement(cx.elt(Type.FilteredTransclusion, pos, end, children));
    }
};
// ============================================================================
// Macro Call Parser (<<macro params>>)
// ============================================================================
/**
 * Parse macro parameters into individual MacroParam elements
 * Handles: name:"value", name:value, "value", value
 */
function parseMacroParams(cx, paramsStr, offset) {
    const elements = [];
    let pos = 0;
    const len = paramsStr.length;
    while (pos < len) {
        // Skip whitespace
        while (pos < len && /\s/.test(paramsStr[pos]))
            pos++;
        if (pos >= len)
            break;
        const paramStart = pos;
        // Check if it's a named parameter (name:value)
        let nameEnd = pos;
        while (nameEnd < len && /[a-zA-Z0-9\-_]/.test(paramsStr[nameEnd]))
            nameEnd++;
        if (nameEnd > pos && paramsStr[nameEnd] === ':') {
            // Named parameter
            const nameStart = pos;
            pos = nameEnd + 1; // skip the :
            // Parse value
            const valueStart = pos;
            let valueEnd = pos;
            if (paramsStr[pos] === '"' || paramsStr[pos] === "'") {
                // Quoted value
                const quote = paramsStr[pos];
                pos++;
                while (pos < len && paramsStr[pos] !== quote) {
                    if (paramsStr[pos] === '\\')
                        pos++;
                    pos++;
                }
                if (pos < len)
                    pos++;
                valueEnd = pos;
            }
            else if (paramsStr.slice(pos, pos + 3) === '[[[') {
                // Triple bracket: [[[value]]]
                pos += 3;
                while (pos < len && paramsStr.slice(pos, pos + 3) !== ']]]')
                    pos++;
                pos += 3;
                valueEnd = pos;
            }
            else if (paramsStr.slice(pos, pos + 2) === '[[') {
                // Double bracket: [[value]]
                pos += 2;
                while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]')
                    pos++;
                pos += 2;
                valueEnd = pos;
            }
            else {
                // Unquoted value
                while (pos < len && !/[\s>]/.test(paramsStr[pos]))
                    pos++;
                valueEnd = pos;
            }
            const paramChildren = [
                cx.elt(Type.MacroParamName, offset + nameStart, offset + nameEnd),
                cx.elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd)
            ];
            elements.push(cx.elt(Type.MacroParam, offset + paramStart, offset + valueEnd, paramChildren));
        }
        else {
            // Positional parameter (just a value)
            const valueStart = pos;
            if (paramsStr[pos] === '"' || paramsStr[pos] === "'") {
                const quote = paramsStr[pos];
                pos++;
                while (pos < len && paramsStr[pos] !== quote) {
                    if (paramsStr[pos] === '\\')
                        pos++;
                    pos++;
                }
                if (pos < len)
                    pos++;
            }
            else if (paramsStr.slice(pos, pos + 3) === '[[[') {
                pos += 3;
                while (pos < len && paramsStr.slice(pos, pos + 3) !== ']]]')
                    pos++;
                pos += 3;
            }
            else if (paramsStr.slice(pos, pos + 2) === '[[') {
                pos += 2;
                while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]')
                    pos++;
                pos += 2;
            }
            else {
                while (pos < len && !/[\s>]/.test(paramsStr[pos]))
                    pos++;
            }
            const paramChildren = [
                cx.elt(Type.MacroParamValue, offset + valueStart, offset + pos)
            ];
            elements.push(cx.elt(Type.MacroParam, offset + paramStart, offset + pos, paramChildren));
        }
    }
    return elements;
}
const MacroCall = {
    name: "MacroCall",
    parse(cx, next, pos) {
        if (next !== Ch.LessThan || cx.char(pos + 1) !== Ch.LessThan)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Find closing >> handling nested macros
        let closePos = -1;
        let depth = 1;
        for (let i = 2; i < text.length - 1; i++) {
            if (text[i] === '<' && text[i + 1] === '<') {
                depth++;
                i++;
            }
            else if (text[i] === '>' && text[i + 1] === '>') {
                depth--;
                if (depth === 0) {
                    closePos = i;
                    break;
                }
                i++;
            }
        }
        if (closePos === -1)
            return -1;
        const end = pos + closePos + 2;
        // Parse macro name
        let nameEnd = 2;
        while (nameEnd < closePos && !/\s/.test(text[nameEnd]))
            nameEnd++;
        const name = text.slice(2, nameEnd);
        if (!name)
            return -1;
        const children = [
            cx.elt(Type.MacroCallMark, pos, pos + 2),
            cx.elt(Type.MacroName, pos + 2, pos + 2 + name.length),
        ];
        // Parse parameters
        const paramsStr = text.slice(nameEnd, closePos);
        if (paramsStr.trim()) {
            const paramElements = parseMacroParams(cx, paramsStr, pos + nameEnd);
            children.push(...paramElements);
        }
        children.push(cx.elt(Type.MacroCallMark, end - 2, end));
        return cx.addElement(cx.elt(Type.MacroCall, pos, end, children));
    }
};
// ============================================================================
// Inline Attribute Parsing Helper
// ============================================================================
/**
 * Find the end of an inline tag, properly handling > inside attribute values
 * Returns the position after the closing > or -1 if not found
 */
function findTagEnd(text) {
    let pos = 0;
    const len = text.length;
    while (pos < len) {
        const ch = text[pos];
        if (ch === '>') {
            return { end: pos + 1, selfClose: false };
        }
        if (ch === '/' && text[pos + 1] === '>') {
            return { end: pos + 2, selfClose: true };
        }
        if (ch === '"' || ch === "'") {
            // Skip quoted string
            const quote = ch;
            pos++;
            while (pos < len && text[pos] !== quote) {
                if (text[pos] === '\\')
                    pos++; // skip escaped char
                pos++;
            }
            pos++; // skip closing quote
        }
        else if (ch === '<' && text[pos + 1] === '<') {
            // Skip macro <<...>>
            pos += 2;
            let depth = 1;
            while (pos < len && depth > 0) {
                if (text[pos] === '<' && text[pos + 1] === '<') {
                    depth++;
                    pos += 2;
                }
                else if (text[pos] === '>' && text[pos + 1] === '>') {
                    depth--;
                    pos += 2;
                }
                else {
                    pos++;
                }
            }
        }
        else if (ch === '{' && text[pos + 1] === '{' && text[pos + 2] === '{') {
            // Skip filtered {{{...}}}
            pos += 3;
            while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}' && text[pos + 2] === '}'))
                pos++;
            pos += 3;
        }
        else if (ch === '{' && text[pos + 1] === '{') {
            // Skip indirect {{...}}
            pos += 2;
            while (pos < len && !(text[pos] === '}' && text[pos + 1] === '}'))
                pos++;
            pos += 2;
        }
        else if (ch === '`') {
            // Skip substituted string
            if (text.slice(pos, pos + 3) === '```') {
                pos += 3;
                while (pos < len && text.slice(pos, pos + 3) !== '```')
                    pos++;
                pos += 3;
            }
            else {
                pos++;
                while (pos < len && text[pos] !== '`')
                    pos++;
                pos++;
            }
        }
        else {
            pos++;
        }
    }
    return null;
}
/**
 * Parse inline widget/HTML tag attributes
 */
function parseInlineAttributes(cx, attrString, offset) {
    const elements = [];
    let pos = 0;
    const len = attrString.length;
    while (pos < len) {
        // Skip whitespace
        while (pos < len && /\s/.test(attrString[pos]))
            pos++;
        if (pos >= len)
            break;
        // Parse attribute name
        const nameStart = pos;
        while (pos < len && /[a-zA-Z0-9\-_:.$]/.test(attrString[pos]))
            pos++;
        if (pos === nameStart) {
            pos++;
            continue;
        }
        const nameEnd = pos;
        // Check for = sign
        while (pos < len && /\s/.test(attrString[pos]))
            pos++;
        if (pos >= len || attrString[pos] !== '=') {
            // Boolean attribute
            const attrChildren = [
                cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
            ];
            elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + nameEnd, attrChildren));
            continue;
        }
        // Skip the =
        pos++;
        // Skip whitespace after =
        while (pos < len && /\s/.test(attrString[pos]))
            pos++;
        if (pos >= len) {
            const attrChildren = [
                cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd)
            ];
            elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + pos, attrChildren));
            continue;
        }
        const valueStart = pos;
        let valueEnd = pos;
        let valueType = Type.AttributeValue;
        const ch = attrString[pos];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            const stringStart = pos + 1;
            pos++;
            while (pos < len && attrString[pos] !== quote) {
                if (attrString[pos] === '\\' && pos + 1 < len)
                    pos++;
                pos++;
            }
            const stringEnd = pos;
            if (pos < len)
                pos++;
            valueEnd = pos;
            valueType = Type.AttributeString;
            // Check if this is a filter attribute - parse content as filter expression
            const attrName = attrString.slice(nameStart, nameEnd).toLowerCase();
            if (attrName === 'filter' || attrName === '$filter') {
                const filterContent = attrString.slice(stringStart, stringEnd);
                const filterChildren = parseFilterExpression(cx, filterContent, offset + stringStart);
                const valueChildren = [
                    cx.elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                    cx.elt(Type.FilterExpression, offset + stringStart, offset + stringEnd, filterChildren),
                    cx.elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                ];
                const attrChildren = [
                    cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                    cx.elt(Type.AttributeFiltered, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
        }
        else if (ch === '{') {
            if (attrString.slice(pos, pos + 3) === '{{{') {
                // Filtered: {{{filter}}}
                const openMarkStart = pos;
                pos += 3;
                const filterStart = pos;
                while (pos < len && attrString.slice(pos, pos + 3) !== '}}}')
                    pos++;
                const filterEnd = pos;
                if (attrString.slice(pos, pos + 3) === '}}}')
                    pos += 3;
                valueEnd = pos;
                valueType = Type.AttributeFiltered;
                // Parse filter expression children for proper highlighting
                const filterContent = attrString.slice(filterStart, filterEnd);
                const filterChildren = parseFilterExpression(cx, filterContent, offset + filterStart);
                // Create child elements for filtered transclusion
                const valueChildren = [
                    cx.elt(Type.FilteredTransclusionMark, offset + openMarkStart, offset + openMarkStart + 3),
                    cx.elt(Type.FilterExpression, offset + filterStart, offset + filterEnd, filterChildren),
                    cx.elt(Type.FilteredTransclusionMark, offset + filterEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                    cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
            else if (attrString.slice(pos, pos + 2) === '{{') {
                // Indirect: {{reference}}
                const openMarkStart = pos;
                pos += 2;
                const targetStart = pos;
                while (pos < len && attrString.slice(pos, pos + 2) !== '}}')
                    pos++;
                const targetEnd = pos;
                if (attrString.slice(pos, pos + 2) === '}}')
                    pos += 2;
                valueEnd = pos;
                valueType = Type.AttributeIndirect;
                // Parse transclusion target details (tiddler!!field or tiddler##index)
                const targetContent = attrString.slice(targetStart, targetEnd);
                const targetChildren = parseTransclusionTarget(cx, targetContent, offset + targetStart);
                // Create child elements for transclusion
                const valueChildren = [
                    cx.elt(Type.TransclusionMark, offset + openMarkStart, offset + openMarkStart + 2),
                    ...targetChildren,
                    cx.elt(Type.TransclusionMark, offset + targetEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                    cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
            else {
                while (pos < len && !/[\s>]/.test(attrString[pos]))
                    pos++;
                valueEnd = pos;
            }
        }
        else if (ch === '<' && attrString[pos + 1] === '<') {
            // Macro: <<macroname params>>
            const openMarkStart = pos;
            pos += 2;
            const macroContentStart = pos;
            // Parse macro name
            while (pos < len && /[a-zA-Z0-9\-_.$]/.test(attrString[pos]))
                pos++;
            const macroNameEnd = pos;
            // Skip to end of macro
            let depth = 1;
            while (pos < len && depth > 0) {
                if (attrString.slice(pos, pos + 2) === '<<') {
                    depth++;
                    pos += 2;
                }
                else if (attrString.slice(pos, pos + 2) === '>>') {
                    depth--;
                    if (depth === 0)
                        break;
                    pos += 2;
                }
                else {
                    pos++;
                }
            }
            const closeMarkStart = pos;
            if (attrString.slice(pos, pos + 2) === '>>')
                pos += 2;
            valueEnd = pos;
            valueType = Type.AttributeMacro;
            // Create child elements for macro
            const valueChildren = [
                cx.elt(Type.MacroCallMark, offset + openMarkStart, offset + openMarkStart + 2),
                cx.elt(Type.MacroName, offset + macroContentStart, offset + macroNameEnd),
                cx.elt(Type.MacroCallMark, offset + closeMarkStart, offset + valueEnd)
            ];
            const attrChildren = [
                cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
            ];
            elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            continue;
        }
        else if (ch === '`') {
            // Substituted string: `value` or ```value```
            let openMarkEnd;
            let closeMarkStart;
            if (attrString.slice(pos, pos + 3) === '```') {
                openMarkEnd = pos + 3;
                pos += 3;
                while (pos < len && attrString.slice(pos, pos + 3) !== '```')
                    pos++;
                closeMarkStart = pos;
                if (attrString.slice(pos, pos + 3) === '```')
                    pos += 3;
            }
            else {
                openMarkEnd = pos + 1;
                pos++;
                while (pos < len && attrString[pos] !== '`')
                    pos++;
                closeMarkStart = pos;
                if (pos < len)
                    pos++;
            }
            valueEnd = pos;
            valueType = Type.AttributeSubstituted;
            // Parse $(variable)$ and ${ filter }$ patterns inside the substituted string
            const valueChildren = [
                cx.elt(Type.Mark, offset + valueStart, offset + openMarkEnd) // Opening `
            ];
            const content = attrString.slice(openMarkEnd, closeMarkStart);
            let contentPos = 0;
            const contentOffset = offset + openMarkEnd;
            while (contentPos < content.length) {
                // Check for ${ filter }$ pattern first (filter expressions are substituted before variables)
                // Note: can't use simple regex since filter may contain } characters
                if (content.slice(contentPos, contentPos + 2) === '${') {
                    // Find the closing }$
                    const searchStart = contentPos + 2;
                    let filterEndPos = -1;
                    for (let i = searchStart; i < content.length - 1; i++) {
                        if (content[i] === '}' && content[i + 1] === '$') {
                            filterEndPos = i;
                            break;
                        }
                    }
                    if (filterEndPos !== -1) {
                        const filterMatch = [
                            content.slice(contentPos, filterEndPos + 2),
                            content.slice(contentPos + 2, filterEndPos)
                        ];
                        const filterStart = contentOffset + contentPos;
                        const filterEnd = filterStart + filterMatch[0].length;
                        const filterExprStart = filterStart + 2;
                        const filterExprEnd = filterEnd - 2;
                        // Parse the filter expression inside
                        const filterContent = filterMatch[1].trim();
                        const filterChildren = parseFilterExpression(cx, filterContent, filterExprStart + (filterMatch[1].length - filterMatch[1].trimStart().length));
                        valueChildren.push(cx.elt(Type.FilterSubstitution, filterStart, filterEnd, [
                            cx.elt(Type.FilterSubstitutionMark, filterStart, filterStart + 2),
                            cx.elt(Type.FilterExpression, filterExprStart, filterExprEnd, filterChildren),
                            cx.elt(Type.FilterSubstitutionMark, filterEnd - 2, filterEnd)
                        ]));
                        contentPos += filterMatch[0].length;
                        continue;
                    }
                }
                // Check for $(variable)$ pattern
                const varMatch = content.slice(contentPos).match(/^\$\(([^)]+)\)\$/);
                if (varMatch) {
                    const varStart = contentOffset + contentPos;
                    const varEnd = varStart + varMatch[0].length;
                    const varNameStart = varStart + 2;
                    const varNameEnd = varNameStart + varMatch[1].length;
                    valueChildren.push(cx.elt(Type.Variable, varStart, varEnd, [
                        cx.elt(Type.VariableMark, varStart, varStart + 2),
                        cx.elt(Type.VariableName, varNameStart, varNameEnd),
                        cx.elt(Type.VariableMark, varNameEnd, varEnd)
                    ]));
                    contentPos += varMatch[0].length;
                }
                else {
                    contentPos++;
                }
            }
            valueChildren.push(cx.elt(Type.Mark, offset + closeMarkStart, offset + valueEnd)); // Closing `
            const attrChildren = [
                cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
                cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
            ];
            elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            continue;
        }
        else {
            while (pos < len && !/[\s>\/]/.test(attrString[pos]))
                pos++;
            valueEnd = pos;
            const valueText = attrString.slice(valueStart, valueEnd);
            if (/^-?\d+(\.\d+)?$/.test(valueText)) {
                valueType = Type.AttributeNumber;
            }
            else {
                valueType = Type.AttributeString;
            }
        }
        const attrChildren = [
            cx.elt(Type.AttributeName, offset + nameStart, offset + nameEnd),
            cx.elt(valueType, offset + valueStart, offset + valueEnd)
        ];
        elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
    }
    return elements;
}
// ============================================================================
// Widget Parser (<$widget/>)
// ============================================================================
const widgetStartRe = /^<(\$[a-zA-Z0-9\-\.]+)/;
const Widget = {
    name: "Widget",
    parse(cx, next, pos) {
        if (next !== Ch.LessThan)
            return -1;
        if (cx.char(pos + 1) !== Ch.Dollar)
            return -1;
        const text = cx.slice(pos, cx.end);
        const startMatch = widgetStartRe.exec(text);
        if (!startMatch)
            return -1;
        const name = startMatch[1];
        const afterName = startMatch[0].length;
        // Find the proper end of the tag (handling > inside attribute values)
        const tagResult = findTagEnd(text.slice(afterName));
        if (!tagResult)
            return -1;
        const end = pos + afterName + tagResult.end;
        const attrString = text.slice(afterName, afterName + tagResult.end - (tagResult.selfClose ? 2 : 1));
        const children = [
            cx.elt(Type.WidgetName, pos + 1, pos + 1 + name.length),
        ];
        // Parse attributes
        if (attrString.trim()) {
            const attrElements = parseInlineAttributes(cx, attrString, pos + afterName);
            children.push(...attrElements);
        }
        if (tagResult.selfClose) {
            children.push(cx.elt(Type.SelfClosingMarker, end - 2, end - 1));
        }
        return cx.addElement(cx.elt(Type.InlineWidget, pos, end, children));
    }
};
// ============================================================================
// HTML Tag Parser (<tag/>)
// ============================================================================
const htmlTagStartRe = /^<([a-zA-Z][a-zA-Z0-9\-]*)/;
const HTMLTag = {
    name: "HTMLTag",
    parse(cx, next, pos) {
        if (next !== Ch.LessThan)
            return -1;
        // Skip if it's a widget
        if (cx.char(pos + 1) === Ch.Dollar)
            return -1;
        const text = cx.slice(pos, cx.end);
        const startMatch = htmlTagStartRe.exec(text);
        if (!startMatch)
            return -1;
        const name = startMatch[1];
        const afterName = startMatch[0].length;
        // Find the proper end of the tag (handling > inside attribute values)
        const tagResult = findTagEnd(text.slice(afterName));
        if (!tagResult)
            return -1;
        const end = pos + afterName + tagResult.end;
        const attrString = text.slice(afterName, afterName + tagResult.end - (tagResult.selfClose ? 2 : 1));
        const children = [
            cx.elt(Type.TagName, pos + 1, pos + 1 + name.length),
        ];
        // Parse attributes
        if (attrString.trim()) {
            const attrElements = parseInlineAttributes(cx, attrString, pos + afterName);
            children.push(...attrElements);
        }
        if (tagResult.selfClose) {
            children.push(cx.elt(Type.SelfClosingMarker, end - 2, end - 1));
        }
        return cx.addElement(cx.elt(Type.HTMLTag, pos, end, children));
    }
};
// ============================================================================
// Dash Parser (-- or ---)
// ============================================================================
const Dash = {
    name: "Dash",
    parse(cx, next, pos) {
        if (next !== Ch.Dash)
            return -1;
        let count = 1;
        while (cx.char(pos + count) === Ch.Dash)
            count++;
        if (count === 2) {
            return cx.addElement(cx.elt(Type.Dash, pos, pos + 2));
        }
        else if (count >= 3) {
            return cx.addElement(cx.elt(Type.Dash, pos, pos + 3));
        }
        return -1;
    }
};
// ============================================================================
// Variable Substitution Parser $(variable)$
// ============================================================================
const variableRe = /^\$\(([^)]+)\)\$/;
const VariableSubstitution = {
    name: "VariableSubstitution",
    parse(cx, next, pos) {
        if (next !== Ch.Dollar)
            return -1;
        if (cx.char(pos + 1) !== 40)
            return -1; // '('
        const text = cx.slice(pos, cx.end);
        const match = variableRe.exec(text);
        if (!match)
            return -1;
        const end = pos + match[0].length;
        const varName = match[1];
        const varNameStart = pos + 2; // After $(
        const varNameEnd = varNameStart + varName.length;
        const children = [
            cx.elt(Type.VariableMark, pos, pos + 2), // $(
            cx.elt(Type.VariableName, varNameStart, varNameEnd),
            cx.elt(Type.VariableMark, varNameEnd, end) // )$
        ];
        return cx.addElement(cx.elt(Type.Variable, pos, end, children));
    }
};
// ============================================================================
// Placeholder Parser $param$ (in macro definitions)
// ============================================================================
const placeholderRe = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/;
const PlaceholderParam = {
    name: "PlaceholderParam",
    parse(cx, next, pos) {
        if (next !== Ch.Dollar)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = placeholderRe.exec(text);
        if (!match)
            return -1;
        const end = pos + match[0].length;
        const paramName = match[1];
        const paramNameStart = pos + 1; // After $
        const paramNameEnd = paramNameStart + paramName.length;
        const children = [
            cx.elt(Type.PlaceholderMark, pos, pos + 1), // $
            cx.elt(Type.VariableName, paramNameStart, paramNameEnd),
            cx.elt(Type.PlaceholderMark, paramNameEnd, end) // $
        ];
        return cx.addElement(cx.elt(Type.Placeholder, pos, end, children));
    }
};
// ============================================================================
// CamelCase Link Parser
// ============================================================================
const camelCaseRe = /^[A-Z][a-z]+[A-Z][A-Za-z]*/;
const CamelCaseLink = {
    name: "CamelCaseLink",
    parse(cx, next, pos) {
        // Must start with uppercase
        if (next < 65 || next > 90)
            return -1;
        // Must be at word boundary (previous char must not be a letter)
        if (pos > cx.offset) {
            const prev = cx.char(pos - 1);
            // Check if previous char is a letter (a-z or A-Z)
            if ((prev >= 65 && prev <= 90) || (prev >= 97 && prev <= 122))
                return -1;
            // Check it's not escaped with ~
            if (prev === Ch.Tilde)
                return -1;
        }
        const text = cx.slice(pos, cx.end);
        const match = camelCaseRe.exec(text);
        if (!match)
            return -1;
        return cx.addElement(cx.elt(Type.CamelCaseLink, pos, pos + match[0].length));
    }
};
// ============================================================================
// System Link Parser ($:/...)
// ============================================================================
const sysLinkRe = /^\$:\/[^\s\[\]{}|]*/;
const SystemLink = {
    name: "SystemLink",
    parse(cx, next, pos) {
        if (next !== Ch.Dollar)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = sysLinkRe.exec(text);
        if (!match)
            return -1;
        return cx.addElement(cx.elt(Type.SystemLink, pos, pos + match[0].length));
    }
};
// ============================================================================
// URL Auto-Link Parser (http://...)
// ============================================================================
const urlRe = /^https?:\/\/[^\s\[\]{}|<>]*/;
const URLAutoLink = {
    name: "URLAutoLink",
    parse(cx, next, pos) {
        if (next !== 104)
            return -1; // 'h'
        const text = cx.slice(pos, cx.end);
        const match = urlRe.exec(text);
        if (!match)
            return -1;
        return cx.addElement(cx.elt(Type.URLLink, pos, pos + match[0].length));
    }
};
// ============================================================================
// Export all default inline parsers
// ============================================================================
const DefaultInlineParsers = [
    Escape,
    Entity,
    InlineCode,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Superscript,
    Subscript,
    Highlight,
    WikiLink,
    ExternalLink,
    ImageLink,
    FilteredTransclusion, // Must come before Transclusion
    Transclusion,
    MacroCall,
    Widget,
    HTMLTag,
    Dash,
    VariableSubstitution, // $(var)$ - must come before SystemLink and PlaceholderParam
    SystemLink,
    PlaceholderParam, // $param$ - must come after VariableSubstitution
    CamelCaseLink,
    URLAutoLink,
];

/**
 * TiddlyWiki Parser - Main Parser Class
 *
 * The main parser that combines all the components following the Lezer architecture.
 */
/**
 * TiddlyWiki-specific syntax highlighting tags
 */
({
    twTransclusion: highlight.Tag.define(),
    twMacro: highlight.Tag.define(),
    twWidget: highlight.Tag.define(),
    twFilter: highlight.Tag.define(),
    twPragma: highlight.Tag.define(),
    twVariable: highlight.Tag.define(),
});
/**
 * Default style tags for TiddlyWiki syntax
 */
const defaultStyleTags = highlight.styleTags({
    // Headings
    "Heading1/...": highlight.tags.heading1,
    "Heading2/...": highlight.tags.heading2,
    "Heading3/...": highlight.tags.heading3,
    "Heading4/...": highlight.tags.heading4,
    "Heading5/...": highlight.tags.heading5,
    "Heading6/...": highlight.tags.heading6,
    HeadingMark: highlight.tags.processingInstruction,
    // Emphasis
    "Bold/...": highlight.tags.strong,
    "Italic/...": highlight.tags.emphasis,
    "Underline/...": highlight.tags.special(highlight.tags.emphasis),
    "Strikethrough/...": highlight.tags.strikethrough,
    "Superscript/...": highlight.tags.special(highlight.tags.content),
    "Subscript/...": highlight.tags.special(highlight.tags.content),
    "Highlight/...": highlight.tags.special(highlight.tags.content),
    "BoldMark ItalicMark UnderlineMark StrikethroughMark SuperscriptMark SubscriptMark HighlightMark": highlight.tags.processingInstruction,
    // Code
    "InlineCode FencedCode TypedBlock CodeText": highlight.tags.monospace,
    "CodeMark TypedBlockMark InlineCodeMark": highlight.tags.processingInstruction,
    CodeInfo: highlight.tags.labelName,
    TypedBlockType: highlight.tags.labelName,
    // Links
    "WikiLink ExternalLink CamelCaseLink": highlight.tags.link,
    "WikiLinkMark ExtLinkMark": highlight.tags.processingInstruction,
    LinkText: highlight.tags.string,
    LinkTarget: highlight.tags.url,
    LinkSeparator: highlight.tags.processingInstruction,
    // Images
    ImageLink: highlight.tags.link,
    ImageMark: highlight.tags.processingInstruction,
    ImageSource: highlight.tags.url,
    ImageTooltip: highlight.tags.string,
    // URLs
    "URLLink SystemLink": highlight.tags.url,
    // Transclusions
    "Transclusion TransclusionBlock": highlight.tags.special(highlight.tags.link),
    "TransclusionMark": highlight.tags.processingInstruction,
    TransclusionTarget: highlight.tags.special(highlight.tags.string),
    TransclusionTemplate: highlight.tags.special(highlight.tags.string),
    TransclusionField: highlight.tags.propertyName,
    TransclusionIndex: highlight.tags.propertyName,
    // Filtered transclusions
    "FilteredTransclusion FilteredTransclusionBlock": highlight.tags.special(highlight.tags.link),
    "FilteredTransclusionMark": highlight.tags.processingInstruction,
    FilterExpression: highlight.tags.special(highlight.tags.string),
    // Macros
    "MacroCall MacroCallBlock": highlight.tags.macroName,
    MacroCallMark: highlight.tags.processingInstruction,
    MacroName: highlight.tags.macroName,
    MacroParam: highlight.tags.attributeValue,
    MacroParamName: highlight.tags.attributeName,
    MacroParamValue: highlight.tags.attributeValue,
    // Widgets and HTML
    "Widget InlineWidget HTMLBlock HTMLTag": highlight.tags.tagName,
    WidgetName: highlight.tags.tagName,
    TagName: highlight.tags.tagName,
    Attribute: highlight.tags.attributeName,
    AttributeName: highlight.tags.attributeName,
    "AttributeValue AttributeString": highlight.tags.attributeValue,
    AttributeNumber: highlight.tags.number,
    AttributeIndirect: highlight.tags.special(highlight.tags.link), // Same as Transclusion
    AttributeFiltered: highlight.tags.special(highlight.tags.link), // Same as FilteredTransclusion
    AttributeMacro: highlight.tags.macroName, // Same as MacroCall
    AttributeSubstituted: highlight.tags.special(highlight.tags.string), // Substituted strings
    SelfClosingMarker: highlight.tags.processingInstruction,
    // Lists
    "BulletList OrderedList DefinitionList": highlight.tags.list,
    "ListItem DefinitionTerm DefinitionDescription": highlight.tags.list,
    ListMark: highlight.tags.processingInstruction,
    // Block quotes
    BlockQuote: highlight.tags.quote,
    QuoteMark: highlight.tags.processingInstruction,
    // Tables
    "Table TableRow": highlight.tags.content,
    "TableHeader TableHeaderCell": highlight.tags.heading,
    TableCell: highlight.tags.content,
    TableDelimiter: highlight.tags.processingInstruction,
    // Horizontal rule
    HorizontalRule: highlight.tags.contentSeparator,
    // Comments
    "CommentBlock CommentMarker": highlight.tags.comment,
    // Pragmas
    "MacroDefinition ProcedureDefinition FunctionDefinition WidgetDefinition": highlight.tags.definitionKeyword,
    "RulesPragma ImportPragma ParametersPragma WhitespacePragma": highlight.tags.definitionKeyword,
    PragmaMark: highlight.tags.processingInstruction,
    PragmaKeyword: highlight.tags.keyword,
    PragmaName: highlight.tags.definition(highlight.tags.macroName),
    PragmaParams: highlight.tags.definition(highlight.tags.variableName),
    PragmaBody: highlight.tags.content,
    PragmaEnd: highlight.tags.keyword,
    // Special
    Escape: highlight.tags.escape,
    Entity: highlight.tags.character,
    Dash: highlight.tags.punctuation,
    Variable: highlight.tags.special(highlight.tags.variableName),
    VariableMark: highlight.tags.processingInstruction,
    VariableName: highlight.tags.variableName,
    FilterSubstitution: highlight.tags.special(highlight.tags.string),
    FilterSubstitutionMark: highlight.tags.processingInstruction,
    Placeholder: highlight.tags.special(highlight.tags.variableName),
    PlaceholderMark: highlight.tags.processingInstruction,
    HardBreak: highlight.tags.processingInstruction,
    // Filter expression components
    FilterRun: highlight.tags.content,
    FilterOperator: highlight.tags.operator,
    FilterOperatorName: highlight.tags.operatorKeyword,
    FilterOperand: highlight.tags.string,
    FilterVariable: highlight.tags.variableName,
    FilterTextRef: highlight.tags.special(highlight.tags.string),
    FilterRegexp: highlight.tags.regexp,
    // Styled blocks
    StyledBlock: highlight.tags.content,
    StyledBlockMark: highlight.tags.processingInstruction,
    StyledBlockClass: highlight.tags.className,
    // Conditionals
    ConditionalBlock: highlight.tags.content,
    ConditionalMark: highlight.tags.processingInstruction,
    ConditionalKeyword: highlight.tags.controlKeyword,
    ConditionalBranch: highlight.tags.content,
    // Generic
    Paragraph: highlight.tags.content,
    Text: highlight.tags.content,
    Mark: highlight.tags.processingInstruction,
    ProcessingInstruction: highlight.tags.processingInstruction,
});
/**
 * Create the default node set for TiddlyWiki
 */
function createNodeSet() {
    const nodeTypes = [];
    // Create node types for each Type enum value
    const typeNames = Object.keys(Type).filter(k => isNaN(Number(k)));
    for (const name of typeNames) {
        const id = Type[name];
        if (typeof id !== "number")
            continue;
        // Ensure the array is large enough
        while (nodeTypes.length <= id) {
            nodeTypes.push(common.NodeType.none);
        }
        nodeTypes[id] = common.NodeType.define({
            id,
            name,
            props: [],
        });
    }
    return new common.NodeSet(nodeTypes).extend(defaultStyleTags);
}
/**
 * The main TiddlyWiki parser class
 */
class TiddlyWikiParser extends common.Parser {
    constructor(nodeSet, pragmaParsers, blockParsers, inlineParsers) {
        super();
        this.nodeSet = nodeSet || createNodeSet();
        this.pragmaParsers = pragmaParsers || DefaultPragmaParsers;
        this.blockParsers = blockParsers || DefaultBlockParsers;
        this.inlineParsers = inlineParsers || DefaultInlineParsers;
    }
    /**
     * Create a partial parse for incremental parsing
     */
    createParse(input, fragments, ranges) {
        return new BlockContext(this, input, fragments, ranges);
    }
    /**
     * Configure the parser with additional rules or modifications
     */
    configure(config) {
        let nodeSet = this.nodeSet;
        let pragmaParsers = [...this.pragmaParsers];
        let blockParsers = [...this.blockParsers];
        let inlineParsers = [...this.inlineParsers];
        // Remove specified parsers
        if (config.remove) {
            const toRemove = new Set(config.remove);
            pragmaParsers = pragmaParsers.filter(p => !toRemove.has(p.name));
            blockParsers = blockParsers.filter(p => !toRemove.has(p.name));
            inlineParsers = inlineParsers.filter(p => !toRemove.has(p.name));
        }
        // Add new parsers
        if (config.parsePragma) {
            for (const parser of config.parsePragma) {
                pragmaParsers = insertParser(pragmaParsers, parser);
            }
        }
        if (config.parseBlock) {
            for (const parser of config.parseBlock) {
                blockParsers = insertParser(blockParsers, parser);
            }
        }
        if (config.parseInline) {
            for (const parser of config.parseInline) {
                inlineParsers = insertParser(inlineParsers, parser);
            }
        }
        // Add new node types if needed
        if (config.defineNodes) {
            const types = [...nodeSet.types];
            for (const spec of config.defineNodes) {
                const name = typeof spec === "string" ? spec : spec.name;
                const id = types.length;
                types.push(common.NodeType.define({ id, name, props: [] }));
            }
            nodeSet = new common.NodeSet(types);
        }
        // Apply props (always, not just when defineNodes is set)
        if (config.props) {
            for (const source of config.props) {
                nodeSet = nodeSet.extend(source);
            }
        }
        return new TiddlyWikiParser(nodeSet, pragmaParsers, blockParsers, inlineParsers);
    }
    /**
     * Parse inline content
     */
    parseInline(text, offset) {
        return parseInline(this, text, offset);
    }
}
/**
 * Insert a parser in the correct position based on before/after
 */
function insertParser(parsers, parser) {
    const result = [...parsers];
    if (parser.before) {
        const index = result.findIndex(p => p.name === parser.before);
        if (index >= 0) {
            result.splice(index, 0, parser);
            return result;
        }
    }
    if (parser.after) {
        const index = result.findIndex(p => p.name === parser.after);
        if (index >= 0) {
            result.splice(index + 1, 0, parser);
            return result;
        }
    }
    result.push(parser);
    return result;
}
/**
 * The default TiddlyWiki parser instance
 */
const parser = new TiddlyWikiParser();

/**
 * TiddlyWiki Language Support - Core Language Definition
 *
 * Creates the TiddlyWiki Language for CodeMirror 6, similar to how
 * lang-markdown creates the Markdown language.
 */
/**
 * Language facet with TiddlyWiki-specific data
 */
const data = language.defineLanguageFacet({
    commentTokens: {
        block: { open: "<!--", close: "-->" },
    }
});
/**
 * Node prop for heading levels
 */
const headingProp = new common.NodeProp();
/**
 * Check if a node type is a heading and return its level
 */
function isHeading(type) {
    const match = /^Heading(\d)$/.exec(type.name);
    return match ? +match[1] : undefined;
}
/**
 * Check if a node type is a list
 */
function isList(type) {
    return type.name === "BulletList" || type.name === "OrderedList" || type.name === "DefinitionList";
}
/**
 * Check if a node type is a block element
 */
function isBlock(type) {
    // Check common block types
    return /^(Paragraph|Heading\d|BulletList|OrderedList|DefinitionList|BlockQuote|Table|FencedCode|TypedBlock|Widget|HTMLBlock|TransclusionBlock|FilteredTransclusionBlock|MacroCallBlock|CommentBlock|HorizontalRule)$/.test(type.name);
}
/**
 * Configure the base parser with CodeMirror-specific props
 * NOTE: languageDataProp is NOT configured here because it must use
 * the same instance at runtime as the one used for lookups.
 * It's configured in mkLang() instead.
 */
const configured = parser.configure({
    props: [
        // Folding support
        language.foldNodeProp.add(type => {
            // Don't fold document, headings (they use section folding), or lists
            if (!isBlock(type) || type.name === "Document" || isHeading(type) != null || isList(type)) {
                return undefined;
            }
            // Fold from end of first line to end of block
            return (tree, state) => ({
                from: state.doc.lineAt(tree.from).to,
                to: tree.to
            });
        }),
        // Add heading level prop
        headingProp.add(isHeading),
        // Indentation
        language.indentNodeProp.add({
            Document: () => null
        })
        // NOTE: languageDataProp is added at runtime in mkLang()
    ]
});
/**
 * Find the end of a section (for heading folding)
 */
function findSectionEnd(headerNode, level) {
    let last = headerNode;
    for (;;) {
        const next = last.nextSibling;
        if (!next)
            break;
        const heading = isHeading(next.type);
        if (heading != null && heading <= level)
            break;
        last = next;
    }
    return last.to;
}
/**
 * Fold service for heading sections
 * Allows folding from a heading to the next heading of same or higher level
 */
const headerIndent = language.foldService.of((state, start, end) => {
    for (let node = language.syntaxTree(state).resolveInner(end, -1); node; node = node.parent) {
        if (node.from < start)
            break;
        const heading = node.type.prop(headingProp);
        if (heading == null)
            continue;
        const upto = findSectionEnd(node, heading);
        if (upto > end)
            return { from: end, to: upto };
    }
    return null;
});
/**
 * Create a Language from a TiddlyWiki parser
 * Configures languageDataProp at runtime to ensure the same instance
 * is used for both configuration and lookups.
 */
function mkLang(parser) {
    // Configure languageDataProp at runtime
    const configuredParser = parser.configure({
        props: [
            language.languageDataProp.add({
                Document: data
            })
        ]
    });
    return new language.Language(data, configuredParser, [], "tiddlywiki");
}
/**
 * The base TiddlyWiki language (without extensions)
 */
const tiddlywikiLanguage = mkLang(configured);

/**
 * @codemirror/lang-tiddlywiki - Commands
 *
 * TiddlyWiki-spezifische Editor-Befehle für CodeMirror 6.
 */
// ============================================================================
// Context Class für List/Quote Continuation
// ============================================================================
class Context {
    constructor(node, from, to, spaceBefore, spaceAfter, type, item) {
        this.node = node;
        this.from = from;
        this.to = to;
        this.spaceBefore = spaceBefore;
        this.spaceAfter = spaceAfter;
        this.type = type;
        this.item = item;
    }
    blank(maxWidth, trailing = true) {
        let result = this.spaceBefore;
        if (this.node.name == "BlockQuote")
            result += ">";
        if (maxWidth != null) {
            while (result.length < maxWidth)
                result += " ";
            return result;
        }
        else {
            for (let i = this.to - this.from - result.length - this.spaceAfter.length; i > 0; i--)
                result += " ";
            return result + (trailing ? this.spaceAfter : "");
        }
    }
    marker(doc, add) {
        let marker = "";
        if (this.node.name == "OrderedList") {
            // Find current number and increment
            let text = doc.sliceString(this.item.from, this.item.from + 10);
            let match = /^(#+)/.exec(text);
            if (match)
                marker = match[1];
        }
        else if (this.node.name == "BulletList") {
            let text = doc.sliceString(this.item.from, this.item.from + 10);
            let match = /^(\*+)/.exec(text);
            if (match)
                marker = match[1];
        }
        else if (this.node.name == "DefinitionList") {
            marker = this.type;
        }
        else if (this.node.name == "BlockQuote" && this.type == ">") {
            // Single-line > quote style
            marker = ">";
        }
        return this.spaceBefore + marker + this.spaceAfter;
    }
}
// ============================================================================
// Context Detection
// ============================================================================
function getContext(node, doc) {
    let nodes = [];
    let context = [];
    for (let cur = node; cur; cur = cur.parent) {
        if (cur.name == "FencedCode" || cur.name == "CodeBlock")
            return context;
        if (cur.name == "ListItem" || cur.name == "BlockQuote" ||
            cur.name == "DefinitionTerm" || cur.name == "DefinitionDescription") {
            nodes.push(cur);
        }
    }
    for (let i = nodes.length - 1; i >= 0; i--) {
        let node = nodes[i];
        let line = doc.lineAt(node.from);
        let startPos = node.from - line.from;
        let match;
        if (node.name == "BlockQuote") {
            match = /^(\s*)(<<<)(\s*)/.exec(line.text.slice(startPos));
            if (match) {
                context.push(new Context(node, startPos, startPos + match[0].length, match[1], match[3], "<<<", null));
            }
        }
        else if (node.name == "ListItem" && node.parent?.name == "OrderedList") {
            match = /^(\s*)(#+)(\s+)/.exec(line.text.slice(startPos));
            if (match) {
                context.push(new Context(node.parent, startPos, startPos + match[0].length, match[1], match[3], match[2], node));
            }
        }
        else if (node.name == "ListItem" && node.parent?.name == "BulletList") {
            match = /^(\s*)(\*+)(\s+)/.exec(line.text.slice(startPos));
            if (match) {
                context.push(new Context(node.parent, startPos, startPos + match[0].length, match[1], match[3], match[2], node));
            }
        }
        else if (node.name == "ListItem" && node.parent?.name == "BlockQuote") {
            // Single-line > quote style
            match = /^(\s*)(>)(\s*)/.exec(line.text.slice(startPos));
            if (match) {
                context.push(new Context(node.parent, startPos, startPos + match[0].length, match[1], match[3], ">", node));
            }
        }
        else if (node.name == "DefinitionTerm") {
            match = /^(\s*)(;)(\s*)/.exec(line.text.slice(startPos));
            if (match) {
                context.push(new Context(node.parent, startPos, startPos + match[0].length, match[1], match[3], ";", node));
            }
        }
        else if (node.name == "DefinitionDescription") {
            match = /^(\s*)(:)(\s*)/.exec(line.text.slice(startPos));
            if (match) {
                context.push(new Context(node.parent, startPos, startPos + match[0].length, match[1], match[3], ":", node));
            }
        }
    }
    return context;
}
// ============================================================================
// Normalize Indentation
// ============================================================================
function normalizeIndent(content, state$1) {
    let blank = /^[ \t]*/.exec(content)[0].length;
    if (!blank || state$1.facet(language.indentUnit) != "\t")
        return content;
    let col = state.countColumn(content, 4, blank);
    let space = "";
    for (let i = col; i > 0;) {
        if (i >= 4) {
            space += "\t";
            i -= 4;
        }
        else {
            space += " ";
            i--;
        }
    }
    return space + content.slice(blank);
}
// ============================================================================
// Insert Newline Continue Markup Command
// ============================================================================
/// Konfigurierbare Version des Continue-Markup Befehls
const insertNewlineContinueMarkupCommand = (config = {}) => ({ state: state$1, dispatch }) => {
    let tree = language.syntaxTree(state$1);
    let { doc } = state$1;
    let dont = null;
    let changes = state$1.changeByRange(range => {
        if (!range.empty || !tiddlywikiLanguage.isActiveAt(state$1, range.from, -1) &&
            !tiddlywikiLanguage.isActiveAt(state$1, range.from, 1)) {
            return dont = { range };
        }
        let pos = range.from;
        let line = doc.lineAt(pos);
        // Try to resolve node at cursor position; if at end of document/line with no
        // trailing newline, resolveInner may return Document - try pos-1 in that case
        let node = tree.resolveInner(pos, -1);
        if (node.name === "Document" && pos > 0) {
            node = tree.resolveInner(pos - 1, -1);
        }
        let context = getContext(node, doc);
        while (context.length && context[context.length - 1].from > pos - line.from) {
            context.pop();
        }
        if (!context.length)
            return dont = { range };
        let inner = context[context.length - 1];
        if (inner.to - inner.spaceAfter.length > pos - line.from)
            return dont = { range };
        let emptyLine = pos >= (inner.to - inner.spaceAfter.length) && !/\S/.test(line.text.slice(inner.to));
        // Leere Zeile in Liste - Markup entfernen
        if (inner.item && emptyLine) {
            let first = inner.node.firstChild;
            let second = inner.node.getChild("ListItem", "ListItem");
            if (first.to >= pos || second && second.to < pos ||
                line.from > 0 && !/[^\s>]/.test(doc.lineAt(line.from - 1).text) ||
                config.nonTightLists === false) {
                let next = context.length > 1 ? context[context.length - 2] : null;
                let delTo, insert = "";
                if (next && next.item) {
                    delTo = line.from + next.from;
                    insert = next.marker(doc, 1);
                }
                else {
                    delTo = line.from + (next ? next.to : 0);
                }
                let changes = [{ from: delTo, to: pos, insert }];
                return { range: state.EditorSelection.cursor(delTo + insert.length), changes };
            }
        }
        let changes = [];
        let continued = inner.item && inner.item.from < line.from;
        let insert = "";
        if (!continued || /^[\s\*#;:>]*/.exec(line.text)[0].length >= inner.to) {
            for (let i = 0, e = context.length - 1; i <= e; i++) {
                insert += i == e && !continued ? context[i].marker(doc, 1)
                    : context[i].blank(i < e ? state.countColumn(line.text, 4, context[i + 1].from) - insert.length : null);
            }
        }
        let from = pos;
        while (from > line.from && /\s/.test(line.text.charAt(from - line.from - 1)))
            from--;
        insert = normalizeIndent(insert, state$1);
        changes.push({ from, to: pos, insert: state$1.lineBreak + insert });
        return { range: state.EditorSelection.cursor(from + insert.length + 1), changes };
    });
    if (dont)
        return false;
    dispatch(state$1.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
};
/// Standard Continue-Markup Befehl für TiddlyWiki
const insertNewlineContinueMarkup = insertNewlineContinueMarkupCommand();
// ============================================================================
// Delete Markup Backward Command
// ============================================================================
function isMark(node) {
    return node.name == "QuoteMark" || node.name == "ListMark" || node.name == "HeadingMark";
}
function contextNodeForDelete(tree, pos) {
    let node = tree.resolveInner(pos, -1);
    let scan = pos;
    if (isMark(node)) {
        scan = node.from;
        node = node.parent;
    }
    for (let prev; prev = node.childBefore(scan);) {
        if (isMark(prev)) {
            scan = prev.from;
        }
        else if (prev.name == "OrderedList" || prev.name == "BulletList" || prev.name == "DefinitionList") {
            node = prev.lastChild;
            scan = node.to;
        }
        else {
            break;
        }
    }
    return node;
}
/// Befehl zum Löschen von Markup rückwärts
const deleteMarkupBackward = ({ state: state$1, dispatch }) => {
    let tree = language.syntaxTree(state$1);
    let dont = null;
    let changes = state$1.changeByRange(range => {
        let pos = range.from;
        let { doc } = state$1;
        if (range.empty && tiddlywikiLanguage.isActiveAt(state$1, range.from)) {
            let line = doc.lineAt(pos);
            let context = getContext(contextNodeForDelete(tree, pos), doc);
            if (context.length) {
                let inner = context[context.length - 1];
                let spaceEnd = inner.to - inner.spaceAfter.length + (inner.spaceAfter ? 1 : 0);
                // Lösche überschüssige Leerzeichen nach Markup
                if (pos - line.from > spaceEnd && !/\S/.test(line.text.slice(spaceEnd, pos - line.from))) {
                    return {
                        range: state.EditorSelection.cursor(line.from + spaceEnd),
                        changes: { from: line.from + spaceEnd, to: pos }
                    };
                }
                if (pos - line.from == spaceEnd &&
                    (!inner.item || line.from <= inner.item.from || !/\S/.test(line.text.slice(0, inner.to)))) {
                    let start = line.from + inner.from;
                    // Ersetze List-Marker durch Leerzeichen
                    if (inner.item && inner.node.from < inner.item.from && /\S/.test(line.text.slice(inner.from, inner.to))) {
                        let insert = inner.blank(state.countColumn(line.text, 4, inner.to) - state.countColumn(line.text, 4, inner.from));
                        if (start == line.from)
                            insert = normalizeIndent(insert, state$1);
                        return {
                            range: state.EditorSelection.cursor(start + insert.length),
                            changes: { from: start, to: line.from + inner.to, insert }
                        };
                    }
                    // Lösche eine Ebene der Einrückung
                    if (start < pos) {
                        return { range: state.EditorSelection.cursor(start), changes: { from: start, to: pos } };
                    }
                }
            }
        }
        return dont = { range };
    });
    if (dont)
        return false;
    dispatch(state$1.update(changes, { scrollIntoView: true, userEvent: "delete" }));
    return true;
};
// ============================================================================
// Toggle Formatting Commands
// ============================================================================
function toggleInlineFormat(state, dispatch, marker) {
    let changes = [];
    for (let range of state.selection.ranges) {
        if (range.empty) {
            // Bei leerer Selektion: Marker einfügen und Cursor dazwischen
            changes.push({ from: range.from, insert: marker + marker });
        }
        else {
            let text = state.doc.sliceString(range.from, range.to);
            // Prüfen ob bereits formatiert
            if (text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2) {
                // Format entfernen
                changes.push({ from: range.from, to: range.to, insert: text.slice(marker.length, -marker.length) });
            }
            else {
                // Format hinzufügen
                changes.push({ from: range.from, insert: marker });
                changes.push({ from: range.to, insert: marker });
            }
        }
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
}
/// Toggle Bold formatierung ('' '')
const toggleBold = ({ state, dispatch }) => {
    return toggleInlineFormat(state, dispatch, "''");
};
/// Toggle Italic formatierung (// //)
const toggleItalic = ({ state, dispatch }) => {
    return toggleInlineFormat(state, dispatch, "//");
};
/// Toggle Underline formatierung (__ __)
const toggleUnderline = ({ state, dispatch }) => {
    return toggleInlineFormat(state, dispatch, "__");
};
/// Toggle Strikethrough formatierung (~~ ~~)
const toggleStrikethrough = ({ state, dispatch }) => {
    return toggleInlineFormat(state, dispatch, "~~");
};
/// Toggle Superscript formatierung (^^ ^^)
const toggleSuperscript = ({ state, dispatch }) => {
    return toggleInlineFormat(state, dispatch, "^^");
};
/// Toggle Subscript formatierung (,, ,,)
const toggleSubscript = ({ state, dispatch }) => {
    return toggleInlineFormat(state, dispatch, ",,");
};
/// Toggle Inline Code formatierung (` `)
const toggleInlineCode = ({ state, dispatch }) => {
    return toggleInlineFormat(state, dispatch, "`");
};
// ============================================================================
// Insert Link Command
// ============================================================================
/// Fügt einen WikiLink ein
const insertWikiLink = ({ state, dispatch }) => {
    let changes = [];
    let selection = state.selection;
    for (let range of selection.ranges) {
        if (range.empty) {
            changes.push({ from: range.from, insert: "[[]]" });
        }
        else {
            let text = state.doc.sliceString(range.from, range.to);
            changes.push({ from: range.from, to: range.to, insert: `[[${text}]]` });
        }
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
};
/// Fügt eine Transclusion ein
const insertTransclusion = ({ state, dispatch }) => {
    let changes = [];
    for (let range of state.selection.ranges) {
        if (range.empty) {
            changes.push({ from: range.from, insert: "{{}}" });
        }
        else {
            let text = state.doc.sliceString(range.from, range.to);
            changes.push({ from: range.from, to: range.to, insert: `{{${text}}}` });
        }
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
};
/// Fügt einen Macro-Aufruf ein
const insertMacroCall = ({ state, dispatch }) => {
    let changes = [];
    for (let range of state.selection.ranges) {
        if (range.empty) {
            changes.push({ from: range.from, insert: "<<>>" });
        }
        else {
            let text = state.doc.sliceString(range.from, range.to);
            changes.push({ from: range.from, to: range.to, insert: `<<${text}>>` });
        }
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
};
// ============================================================================
// Heading Commands
// ============================================================================
function setHeadingLevel(state, dispatch, level) {
    let changes = [];
    let { doc } = state;
    for (let range of state.selection.ranges) {
        let line = doc.lineAt(range.from);
        let text = line.text;
        // Entferne existierende Heading-Marker
        let match = /^(!+)\s*/.exec(text);
        let contentStart = match ? match[0].length : 0;
        text.slice(contentStart);
        // Neuen Heading-Level setzen (0 = kein Heading)
        let newPrefix = level > 0 ? "!".repeat(level) + " " : "";
        changes.push({ from: line.from, to: line.from + contentStart, insert: newPrefix });
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
}
/// Setzt Heading Level 1
const setHeading1 = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 1);
/// Setzt Heading Level 2
const setHeading2 = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 2);
/// Setzt Heading Level 3
const setHeading3 = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 3);
/// Setzt Heading Level 4
const setHeading4 = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 4);
/// Setzt Heading Level 5
const setHeading5 = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 5);
/// Setzt Heading Level 6
const setHeading6 = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 6);
/// Entfernt Heading
const removeHeading = ({ state, dispatch }) => setHeadingLevel(state, dispatch, 0);
// ============================================================================
// List Commands
// ============================================================================
function toggleListMarker(state, dispatch, marker) {
    let changes = [];
    let { doc } = state;
    for (let range of state.selection.ranges) {
        let line = doc.lineAt(range.from);
        let text = line.text;
        // Prüfe ob Zeile bereits mit diesem Marker beginnt
        let markerMatch = new RegExp(`^(${marker.replace(/[*#]/g, "\\$&")}+)\\s*`).exec(text);
        if (markerMatch) {
            // Marker entfernen
            changes.push({ from: line.from, to: line.from + markerMatch[0].length, insert: "" });
        }
        else {
            // Anderen Marker entfernen falls vorhanden
            let otherMatch = /^([*#;:]+)\s*/.exec(text);
            if (otherMatch) {
                changes.push({ from: line.from, to: line.from + otherMatch[0].length, insert: marker + " " });
            }
            else {
                // Marker hinzufügen
                changes.push({ from: line.from, insert: marker + " " });
            }
        }
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
}
/// Toggle Bullet List (* )
const toggleBulletList = ({ state, dispatch }) => {
    return toggleListMarker(state, dispatch, "*");
};
/// Toggle Numbered List (# )
const toggleNumberedList = ({ state, dispatch }) => {
    return toggleListMarker(state, dispatch, "#");
};
// ============================================================================
// Code Block Command
// ============================================================================
/// Fügt einen Code-Block ein oder wickelt Selektion in Code-Block
const insertCodeBlock = ({ state, dispatch }) => {
    let changes = [];
    for (let range of state.selection.ranges) {
        if (range.empty) {
            let line = state.doc.lineAt(range.from);
            // Füge Code-Block mit leerer Zeile ein
            let insert = "```\n\n```";
            changes.push({ from: line.from, insert: insert + "\n" });
        }
        else {
            let text = state.doc.sliceString(range.from, range.to);
            changes.push({ from: range.from, to: range.to, insert: "```\n" + text + "\n```" });
        }
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input" }));
    return true;
};
/// Fügt eine horizontale Linie ein
const insertHorizontalRule = ({ state, dispatch }) => {
    let line = state.doc.lineAt(state.selection.main.from);
    dispatch(state.update({
        changes: { from: line.to, insert: "\n---\n" },
        scrollIntoView: true,
        userEvent: "input"
    }));
    return true;
};

/**
 * TiddlyWiki Language Support - Main Entry Point
 *
 * Provides the tiddlywiki() function that creates a complete LanguageSupport
 * for CodeMirror 6, similar to markdown() in @codemirror/lang-markdown.
 */
/**
 * TiddlyWiki-specific highlight style mapping semantic tags to CSS classes
 */
const tiddlywikiHighlightStyle = language.HighlightStyle.define([
    // Headings
    { tag: highlight.tags.heading1, class: "cm-tw-heading1" },
    { tag: highlight.tags.heading2, class: "cm-tw-heading2" },
    { tag: highlight.tags.heading3, class: "cm-tw-heading3" },
    { tag: highlight.tags.heading4, class: "cm-tw-heading4" },
    { tag: highlight.tags.heading5, class: "cm-tw-heading5" },
    { tag: highlight.tags.heading6, class: "cm-tw-heading6" },
    { tag: highlight.tags.heading, class: "cm-tw-tableheader" },
    // Text formatting
    { tag: highlight.tags.strong, class: "cm-tw-bold" },
    { tag: highlight.tags.emphasis, class: "cm-tw-italic" },
    { tag: highlight.tags.strikethrough, class: "cm-tw-strikethrough" },
    // Links
    { tag: highlight.tags.link, class: "cm-tw-wikilink" },
    { tag: highlight.tags.url, class: "cm-tw-url" },
    { tag: highlight.tags.string, class: "cm-tw-linktext" },
    // Transclusions and macros
    { tag: highlight.tags.special(highlight.tags.link), class: "cm-tw-transclusion" },
    { tag: highlight.tags.macroName, class: "cm-tw-macrocall" },
    { tag: highlight.tags.variableName, class: "cm-tw-variable" },
    // Widgets
    { tag: highlight.tags.tagName, class: "cm-tw-widget" },
    // Code
    { tag: highlight.tags.monospace, class: "cm-tw-code" },
    { tag: highlight.tags.labelName, class: "cm-tw-codeinfo" },
    // Pragmas and definitions
    { tag: highlight.tags.definitionKeyword, class: "cm-tw-pragma" },
    { tag: highlight.tags.keyword, class: "cm-tw-pragma-keyword" },
    // Lists
    { tag: highlight.tags.list, class: "cm-tw-list" },
    // Block elements
    { tag: highlight.tags.quote, class: "cm-tw-blockquote" },
    { tag: highlight.tags.contentSeparator, class: "cm-tw-hr" },
    // Special characters
    { tag: highlight.tags.comment, class: "cm-tw-comment" },
    { tag: highlight.tags.escape, class: "cm-tw-escape" },
    { tag: highlight.tags.character, class: "cm-tw-entity" },
    // Processing marks
    { tag: highlight.tags.processingInstruction, class: "cm-tw-mark" },
    // Filters
    { tag: highlight.tags.special(highlight.tags.string), class: "cm-tw-filter" },
    // Attributes
    { tag: highlight.tags.attributeValue, class: "cm-tw-attribute-value" },
    { tag: highlight.tags.attributeName, class: "cm-tw-attribute" },
    // Special emphasis (underline)
    { tag: highlight.tags.special(highlight.tags.emphasis), class: "cm-tw-underline" },
    // Special content (superscript, subscript, highlight)
    { tag: highlight.tags.special(highlight.tags.content), class: "cm-tw-superscript" },
]);
/**
 * Keymap with TiddlyWiki-specific bindings
 */
const tiddlywikiKeymap$1 = [
    { key: "Enter", run: insertNewlineContinueMarkup },
    { key: "Backspace", run: deleteMarkupBackward },
    { key: "Mod-b", run: toggleBold },
    { key: "Mod-i", run: toggleItalic },
    { key: "Mod-u", run: toggleUnderline },
    { key: "Mod-`", run: toggleInlineCode },
    { key: "Mod-k", run: insertWikiLink },
    { key: "Mod-Shift-k", run: insertTransclusion },
    { key: "Mod-1", run: setHeading1 },
    { key: "Mod-2", run: setHeading2 },
    { key: "Mod-3", run: setHeading3 },
    { key: "Mod-4", run: setHeading4 },
    { key: "Mod-5", run: setHeading5 },
    { key: "Mod-6", run: setHeading6 },
    { key: "Mod-0", run: removeHeading },
    { key: "Mod-Shift-8", run: toggleBulletList },
    { key: "Mod-Shift-7", run: toggleNumberedList },
    { key: "Mod-Shift-c", run: insertCodeBlock },
];
/**
 * HTML language support without tag matching (for embedded HTML)
 */
const htmlNoMatch = langHtml.html({ matchClosingTags: false });
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
function tiddlywiki(config = {}) {
    const { codeLanguages, defaultCodeLanguage, addKeymap = true, base: { parser } = tiddlywikiLanguage, completeHTMLTags = true, completeWidgets = true, completeMacros = true, completeTiddlers = true, completeFilterOperators = true, completeFilterRunPrefixes = true, getTiddlerTitles, getMacroNames, getWidgetNames, getFilterOperators, htmlTagLanguage = htmlNoMatch, } = config;
    // Validate parser
    if (!(parser instanceof TiddlyWikiParser)) {
        throw new RangeError("Base parser provided to `tiddlywiki` should be a TiddlyWiki parser");
    }
    // Build extensions for the parser
    const parserExtensions = config.extensions ? [config.extensions] : [];
    // Build support extensions
    const support = [
        htmlTagLanguage.support,
        headerIndent,
        language.syntaxHighlighting(tiddlywikiHighlightStyle),
        // Enable autocompletion with activate on typing
        // Completion sources are registered via lang.data.of() and found via languageDataAt()
        autocomplete.autocompletion({
            activateOnTyping: true,
        }),
        view.keymap.of(autocomplete.completionKeymap),
    ];
    if (defaultCodeLanguage instanceof language.LanguageSupport) {
        support.push(defaultCodeLanguage.support);
        defaultCodeLanguage.language;
    }
    // Add keymap if requested
    if (addKeymap && tiddlywikiKeymap$1.length > 0) {
        support.push(state.Prec.high(view.keymap.of(tiddlywikiKeymap$1)));
    }
    // Configure the parser with extensions
    let configuredParser = parser;
    if (parserExtensions.length > 0) {
        for (const ext of parserExtensions) {
            configuredParser = configuredParser.configure(ext);
        }
    }
    // Create the language
    const lang = mkLang(configuredParser);
    // Add completions via language data
    if (completeWidgets) {
        support.push(lang.data.of({
            autocomplete: widgetCompletion(getWidgetNames)
        }));
    }
    if (completeMacros) {
        support.push(lang.data.of({
            autocomplete: macroCompletion(getMacroNames)
        }));
    }
    if (completeTiddlers) {
        support.push(lang.data.of({
            autocomplete: tiddlerCompletion(getTiddlerTitles)
        }));
    }
    if (completeHTMLTags) {
        support.push(lang.data.of({
            autocomplete: htmlTagCompletion
        }));
    }
    if (completeFilterOperators) {
        support.push(lang.data.of({
            autocomplete: filterOperatorCompletion(getFilterOperators)
        }));
    }
    if (completeFilterRunPrefixes) {
        support.push(lang.data.of({
            autocomplete: filterRunPrefixCompletion
        }));
    }
    return new language.LanguageSupport(lang, support);
}
// TiddlyWiki Core Widgets (with $ prefix as stored)
const coreWidgets = [
    "$action-confirm", "$action-createtiddler", "$action-deletefield", "$action-deletetiddler",
    "$action-listops", "$action-log", "$action-navigate", "$action-popup", "$action-sendmessage",
    "$action-setfield", "$action-setmultiplefields", "$browse", "$button", "$checkbox",
    "$codeblock", "$count", "$draggable", "$droppable", "$dropzone", "$edit", "$edit-bitmap",
    "$edit-text", "$element", "$encrypt", "$eventcatcher", "$fieldmangler", "$fill",
    "$genesis", "$image", "$importvariables", "$keyboard", "$let", "$link", "$linkcatcher",
    "$list", "$log", "$macrocall", "$messagecatcher", "$navigator", "$password", "$qualify",
    "$radio", "$range", "$raw", "$reveal", "$scrollable", "$select", "$set", "$setvariable",
    "$slot", "$text", "$tiddler", "$transclude", "$type", "$vars", "$view", "$wikify"
];
/**
 * Widget completion source (<$widget)
 */
function widgetCompletion(getWidgetNames) {
    return (context) => {
        const { state, pos } = context;
        const m = /<\$[\w\-]*$/.exec(state.sliceDoc(pos - 30, pos));
        if (!m)
            return null;
        // Don't complete inside code blocks or comments
        const tree = language.syntaxTree(state).resolveInner(pos, -1);
        let node = tree;
        while (node && !node.type.isTop) {
            if (node.name === "FencedCode" || node.name === "CodeBlock" ||
                node.name === "TypedBlock" || node.name === "CommentBlock") {
                return null;
            }
            node = node.parent;
        }
        // Use provided widget names, fall back to core widgets if empty
        const customWidgets = getWidgetNames ? getWidgetNames() : [];
        const widgets = customWidgets.length > 0 ? customWidgets : coreWidgets;
        const options = widgets.map(w => ({
            label: "<" + w,
            type: "keyword",
            detail: "widget",
            apply: "<" + w + ">"
        }));
        return {
            from: pos - m[0].length,
            to: pos,
            options,
            validFor: /^<\$[\w\-]*$/
        };
    };
}
// Common TiddlyWiki Macros
const commonMacros = [
    "now", "tag", "tabs", "timeline", "toc", "toc-hierarchical", "toc-selective-expandable",
    "list-links", "list-links-draggable", "list-tagged-draggable", "copy-to-clipboard",
    "colour-picker", "image-picker", "keyboard-shortcut", "dumpvariables", "qualify",
    "csvtiddlers", "jsontiddlers", "datauri", "makedatauri", "translink"
];
// TiddlyWiki Filter Operators
const coreFilterOperators = [
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
];
// Filter Run Prefixes (including named prefixes)
const filterRunPrefixes = [
    // Symbol prefixes
    { label: "+", detail: "intersection - filter the input (same as :and)" },
    { label: "-", detail: "subtraction - remove from results (same as :except)" },
    { label: "~", detail: "else - use if previous was empty (same as :else)" },
    { label: "=", detail: "literal - add title literally (same as :all)" },
    // Named equivalents of symbols
    { label: ":and", detail: "intersection - same as +" },
    { label: ":except", detail: "subtraction - same as -" },
    { label: ":else", detail: "else - same as ~" },
    { label: ":all", detail: "literal - same as =" },
    // Other named prefixes
    { label: ":filter", detail: "filter each title through subfilter" },
    { label: ":map", detail: "transform each title via subfilter" },
    { label: ":reduce", detail: "reduce to single value" },
    { label: ":intersection", detail: "keep titles common to all runs" },
    { label: ":cascade", detail: "cascade through filters" },
    { label: ":some", detail: "pass to any matching run" },
    { label: ":sort", detail: "sort by subfilter result" },
    { label: ":flat", detail: "flatten list output" },
];
/**
 * Macro completion source (<<macro or [<variable> or [operator<variable> in filters)
 */
function macroCompletion(getMacroNames) {
    return (context) => {
        const { state, pos } = context;
        const textBefore = state.sliceDoc(pos - 50, pos);
        // Match <<macro for regular macro calls
        const macroMatch = /<<[\w\-]*$/.exec(textBefore);
        // Match [<variable or [operator<variable or ]operator<variable for variable references in filters
        const filterVarMatch = /[\[\]][\w\-:!]*<[\w\-]*$/.exec(textBefore);
        const m = macroMatch || filterVarMatch;
        if (!m)
            return null;
        // Don't complete inside code blocks or comments
        const tree = language.syntaxTree(state).resolveInner(pos, -1);
        let node = tree;
        while (node && !node.type.isTop) {
            if (node.name === "FencedCode" || node.name === "CodeBlock" ||
                node.name === "TypedBlock" || node.name === "CommentBlock") {
                return null;
            }
            node = node.parent;
        }
        // Use provided macro names, fall back to common macros if empty
        const customMacros = getMacroNames ? getMacroNames() : [];
        const macros = customMacros.length > 0 ? customMacros : commonMacros;
        if (filterVarMatch) {
            // Variable reference in filter: [<variable>] or [operator<variable>] or ]operator<variable>]
            const prefix = m[0].slice(0, m[0].lastIndexOf('<') + 1);
            const options = macros.map(name => ({
                label: prefix + name,
                type: "function",
                detail: "variable",
                apply: prefix + name + ">]"
            }));
            return {
                from: pos - filterVarMatch[0].length,
                to: pos,
                options,
                validFor: /^[\[\]][\w\-:!]*<[\w\-]*$/
            };
        }
        // Regular macro call
        const options = macros.map(m => ({
            label: "<<" + m,
            type: "function",
            detail: "macro",
            apply: "<<" + m + ">>"
        }));
        return {
            from: pos - m[0].length,
            to: pos,
            options,
            validFor: /^<<[\w\-]*$/
        };
    };
}
/**
 * Tiddler title completion source ([[link, {{transclusion, [img[source, or filter operands)
 * Also handles filter operand contexts like [tag[, [has[, [{, [operator{, etc.
 */
function tiddlerCompletion(getTiddlerTitles) {
    return (context) => {
        const { state, pos } = context;
        const textBefore = state.sliceDoc(pos - 100, pos);
        // Match [[ for links (also works inside filters for literal titles)
        const linkMatch = /\[\[[^\]|]*$/.exec(textBefore);
        // Match {{ for transclusions
        const transcludeMatch = /\{\{[^{}|]*$/.exec(textBefore);
        // Match [img[ or [img ...attrs[ for images (source is inside the last [)
        const imageMatch = /\[img(?:\s+[^\[]*)?\[[^\]|]*$/.exec(textBefore);
        // Match [operator[ or ]operator[ for filter operand (tiddler title) - e.g., [tag[, [has[, ]tag[
        const filterOperandMatch = /[\[\]][\w\-:!]*\[[^\]]*$/.exec(textBefore);
        // Match [{ or [operator{ or ]operator{ for text references inside filters
        const filterTextRefMatch = /[\[\]][\w\-:!]*\{[^}]*$/.exec(textBefore);
        const match = linkMatch || transcludeMatch || imageMatch || filterOperandMatch || filterTextRefMatch;
        if (!match)
            return null;
        // Don't complete inside code blocks or comments
        const tree = language.syntaxTree(state).resolveInner(pos, -1);
        let node = tree;
        while (node && !node.type.isTop) {
            if (node.name === "FencedCode" || node.name === "CodeBlock" ||
                node.name === "TypedBlock" || node.name === "CommentBlock") {
                return null;
            }
            node = node.parent;
        }
        const titles = getTiddlerTitles ? getTiddlerTitles() : [];
        if (titles.length === 0)
            return null;
        // Determine prefix and suffix based on match type
        let prefix;
        let suffix;
        let validFor;
        let detail;
        if (filterTextRefMatch) {
            // Text reference inside filter: [operator{tiddler}] or [{tiddler}] or ]operator{tiddler}]
            prefix = match[0].slice(0, match[0].lastIndexOf('{') + 1);
            suffix = "}]";
            validFor = /^[\[\]][\w\-:!]*\{[^}]*$/;
            detail = "text reference";
        }
        else if (filterOperandMatch) {
            // Filter operand: [operator[value]] or [[value]] or ]operator[value]]
            prefix = match[0].slice(0, match[0].lastIndexOf('[') + 1);
            suffix = "]]";
            validFor = /^[\[\]][\w\-:!]*\[[^\]]*$/;
            detail = "filter operand";
        }
        else if (linkMatch) {
            prefix = "[[";
            suffix = "]]";
            validFor = /^\[\[[^\]|]*$/;
            detail = "tiddler";
        }
        else if (transcludeMatch) {
            prefix = "{{";
            suffix = "}}";
            validFor = /^\{\{[^{}|]*$/;
            detail = "tiddler";
        }
        else {
            // Image match - we need to find where the [ starts for the source
            const bracketPos = match[0].lastIndexOf('[');
            prefix = match[0].slice(0, bracketPos + 1);
            suffix = "]]";
            validFor = /^\[img(?:\s+[^\[]*)?\[[^\]|]*$/;
            detail = "image";
        }
        const options = titles.map(title => ({
            label: prefix + title,
            type: "variable",
            detail,
            apply: prefix + title + suffix
        }));
        return {
            from: pos - match[0].length,
            to: pos,
            options,
            validFor
        };
    };
}
// Cached HTML tag completions
let _tagCompletions = null;
function htmlTagCompletions() {
    if (_tagCompletions)
        return _tagCompletions;
    const result = langHtml.htmlCompletionSource(new autocomplete.CompletionContext(state.EditorState.create({ extensions: htmlNoMatch }), 0, true));
    return _tagCompletions = result ? result.options : [];
}
/**
 * HTML tag completion source
 */
function htmlTagCompletion(context) {
    const { state, pos } = context;
    const m = /<[:\-\.\w\u00b7-\uffff]*$/.exec(state.sliceDoc(pos - 25, pos));
    if (!m)
        return null;
    // Don't complete if it looks like a widget
    if (m[0].startsWith("<$"))
        return null;
    // Check we're not in a code block, widget, or other non-completable context
    const tree = language.syntaxTree(state).resolveInner(pos, -1);
    let node = tree;
    while (node && !node.type.isTop) {
        if (node.name === "FencedCode" || node.name === "CodeBlock" ||
            node.name === "TypedBlock" || node.name === "CommentBlock" ||
            node.name === "Widget") {
            return null;
        }
        node = node.parent;
    }
    return {
        from: pos - m[0].length,
        to: pos,
        options: htmlTagCompletions(),
        validFor: /^<[:\-\.\w\u00b7-\uffff]*$/
    };
}
/**
 * Filter operator completion source (inside [...])
 * Triggers when typing inside filter brackets, e.g., [tag or [has[
 */
function filterOperatorCompletion(getFilterOperators) {
    return (context) => {
        const { state, pos } = context;
        // Look for filter operator context: after [ and optional ! or other prefix
        // Match patterns like: [tag, [!has, [tag[value]tag, etc.
        const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos);
        // Don't complete operators inside filter operand contexts:
        // - [[ or [operator[ or ]operator[ for literal tiddler titles (complete tiddlers instead)
        // - [{ or [operator{ or ]operator{ for text references (complete tiddlers instead)
        // - [< or [operator< or ]operator< for variable references (complete macros instead)
        // These patterns match at start of step, after operator name, or after previous step's ]
        if (/[\[\]][\w\-:!]*\[[^\]]*$/.test(textBefore) ||
            /[\[\]][\w\-:!]*\{[^}]*$/.test(textBefore) ||
            /[\[\]][\w\-:!]*<[^>]*$/.test(textBefore)) {
            return null;
        }
        // Check if we're inside a filter expression (inside brackets [])
        // and after a position where an operator would go
        const filterOperatorMatch = /\[(!?)(\w*)$/.exec(textBefore);
        if (!filterOperatorMatch) {
            // Also match after a closing bracket of a previous operator: [tag[value]op
            const chainedMatch = /\][:\w]*(\w+)$/.exec(textBefore);
            if (!chainedMatch)
                return null;
            // For chained operators, use the partial match
            const partial = chainedMatch[1];
            return createFilterOperatorResult(context, partial, partial.length, getFilterOperators);
        }
        // Check we're in a filter context (inside FilterExpression, FilteredTransclusion, etc.)
        const tree = language.syntaxTree(state).resolveInner(pos, -1);
        let node = tree;
        let inFilter = false;
        while (node && !node.type.isTop) {
            if (node.name === "FencedCode" || node.name === "CodeBlock" ||
                node.name === "TypedBlock" || node.name === "CommentBlock") {
                return null;
            }
            if (node.name === "FilterExpression" || node.name === "FilteredTransclusion" ||
                node.name === "FilteredTransclusionBlock" || node.name === "AttributeFiltered" ||
                node.name === "ConditionalBlock") {
                inFilter = true;
            }
            node = node.parent;
        }
        // Also check text patterns for filter context
        const hasFilterContext = inFilter ||
            /\{\{\{[^}]*$/.test(textBefore) || // {{{ filtered transclusion
            /<%(?:if|elseif)\s+[^%]*$/.test(textBefore) || // <%if filter%>
            /filter\s*=\s*["'][^"']*$/.test(textBefore); // filter="..."
        if (!hasFilterContext)
            return null;
        const prefix = filterOperatorMatch[1]; // ! or empty
        const partial = filterOperatorMatch[2]; // partial operator name
        return createFilterOperatorResult(context, partial, partial.length + prefix.length + 1, getFilterOperators);
    };
}
function createFilterOperatorResult(context, partial, matchLength, getFilterOperators) {
    const { pos } = context;
    // Use provided operators, fall back to core operators if empty
    const customOperators = getFilterOperators ? getFilterOperators() : [];
    const operators = customOperators.length > 0 ? customOperators : coreFilterOperators;
    const options = operators.map(op => ({
        label: op,
        type: "function",
        detail: "filter operator",
        apply: op + "["
    }));
    return {
        from: pos - partial.length,
        to: pos,
        options,
        validFor: /^\w*$/
    };
}
/**
 * Filter run prefix completion source
 * Triggers at the start of filter runs (after space or at start of filter)
 */
function filterRunPrefixCompletion(context) {
    const { state, pos } = context;
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos);
    // Match at start of a filter run: after {{{ or after space/newline in filter
    // Patterns: {{{ :, {{{ +, or after ] followed by space then prefix
    const runPrefixMatch = /(?:\{\{\{|[\]\s])\s*([:+\-~=][\w]*)$/.exec(textBefore);
    if (!runPrefixMatch)
        return null;
    // Check we're in a filter context
    const tree = language.syntaxTree(state).resolveInner(pos, -1);
    let node = tree;
    let inFilter = false;
    while (node && !node.type.isTop) {
        if (node.name === "FencedCode" || node.name === "CodeBlock" ||
            node.name === "TypedBlock" || node.name === "CommentBlock") {
            return null;
        }
        if (node.name === "FilterExpression" || node.name === "FilteredTransclusion" ||
            node.name === "FilteredTransclusionBlock" || node.name === "AttributeFiltered" ||
            node.name === "ConditionalBlock") {
            inFilter = true;
        }
        node = node.parent;
    }
    // Also check text patterns for filter context
    const hasFilterContext = inFilter ||
        /\{\{\{[^}]*$/.test(textBefore) || // {{{ filtered transclusion
        /<%(?:if|elseif)\s+[^%]*$/.test(textBefore) || // <%if filter%>
        /filter\s*=\s*["'][^"']*$/.test(textBefore); // filter="..."
    if (!hasFilterContext)
        return null;
    const partial = runPrefixMatch[1];
    const options = filterRunPrefixes.map(p => ({
        label: p.label,
        type: "keyword",
        detail: p.detail,
        apply: p.label + (p.label.startsWith(":") ? "[" : "")
    }));
    return {
        from: pos - partial.length,
        to: pos,
        options,
        validFor: /^[:+\-~=][\w]*$/
    };
}

/**
 * TiddlyWiki5 CodeMirror 6 Plugin Entry Point
 *
 * This module exports the plugin interface expected by the CM6 engine.
 * It provides TiddlyWiki5 syntax highlighting and language support.
 *
 * module-type: codemirror6-plugin
 */
// Backwards compatibility alias
const tiddlywikiBaseLanguage = tiddlywikiLanguage;
// Alias for backwards compatibility with existing engines
const TiddlyWikiLanguage = tiddlywikiLanguage;
// ============================================================================
// Module State
// ============================================================================
let _core = null;
// ============================================================================
// Constants
// ============================================================================
/**
 * TiddlyWiki content types that activate this plugin
 */
const TW_TYPES = [
    "", // Empty = default wikitext
    "text/vnd.tiddlywiki",
    "text/x-tiddlywiki"
];
/**
 * Compartment name for this plugin
 */
const COMPARTMENT_NAME = "tiddlywikiLanguage";
// ============================================================================
// Keymap
// ============================================================================
/**
 * Standard TiddlyWiki keymap
 */
const tiddlywikiKeymap = state.Prec.high(view.keymap.of([
    { key: "Enter", run: insertNewlineContinueMarkup },
    { key: "Backspace", run: deleteMarkupBackward },
    { key: "Mod-b", run: toggleBold },
    { key: "Mod-i", run: toggleItalic },
    { key: "Mod-u", run: toggleUnderline },
    { key: "Mod-`", run: toggleInlineCode },
    { key: "Mod-k", run: insertWikiLink },
    { key: "Mod-Shift-k", run: insertTransclusion },
    { key: "Mod-1", run: setHeading1 },
    { key: "Mod-2", run: setHeading2 },
    { key: "Mod-3", run: setHeading3 },
    { key: "Mod-4", run: setHeading4 },
    { key: "Mod-5", run: setHeading5 },
    { key: "Mod-6", run: setHeading6 },
    { key: "Mod-0", run: removeHeading },
    { key: "Mod-Shift-8", run: toggleBulletList },
    { key: "Mod-Shift-7", run: toggleNumberedList },
    { key: "Mod-Shift-c", run: insertCodeBlock },
]));
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Create command target from EditorView
 */
function getCommandTarget(view) {
    return {
        state: view.state,
        dispatch: view.dispatch.bind(view)
    };
}
/**
 * Get tiddler titles for autocompletion
 */
function getTiddlerTitles() {
    if (typeof $tw === "undefined" || !$tw.wiki)
        return [];
    try {
        // Get non-system tiddlers for link completion
        return $tw.wiki.filterTiddlers("[!is[system]sort[title]]") || [];
    }
    catch (e) {
        return [];
    }
}
/**
 * Get macro names for autocompletion
 */
function getMacroNames() {
    if (typeof $tw === "undefined")
        return [];
    try {
        const names = [];
        // Get built-in macros
        if ($tw.macros) {
            names.push(...Object.keys($tw.macros));
        }
        // Get macro tiddlers
        if ($tw.wiki) {
            const macroTiddlers = $tw.wiki.filterTiddlers("[all[tiddlers+shadows]tag[$:/tags/Macro]]") || [];
            for (const title of macroTiddlers) {
                // Extract macro name from tiddler (usually in the title or defined with \define)
                const tiddler = $tw.wiki.getTiddler(title);
                if (tiddler) {
                    const text = tiddler.fields.text || "";
                    const defineMatch = text.match(/\\define\s+([^\s(]+)/);
                    if (defineMatch) {
                        names.push(defineMatch[1]);
                    }
                }
            }
        }
        return [...new Set(names)]; // deduplicate
    }
    catch (e) {
        return [];
    }
}
/**
 * Get widget names for autocompletion
 */
function getWidgetNames() {
    if (typeof $tw === "undefined")
        return [];
    try {
        const names = [];
        // Get widget names from $tw.widgets (they don't have $ prefix in the registry)
        if ($tw.widgets) {
            for (const name of Object.keys($tw.widgets)) {
                names.push("$" + name);
            }
        }
        return names;
    }
    catch (e) {
        return [];
    }
}
/**
 * Get filter operator names for autocompletion
 */
function getFilterOperators() {
    if (typeof $tw === "undefined" || !$tw.wiki)
        return [];
    try {
        // Filter operators are registered in $tw.wiki.filterOperators
        if ($tw.wiki.filterOperators) {
            return Object.keys($tw.wiki.filterOperators).sort();
        }
        return [];
    }
    catch (e) {
        return [];
    }
}
/**
 * Build language support with options from context
 */
function buildLanguageSupport(context) {
    const options = context.options || {};
    return tiddlywiki({
        addKeymap: false, // We add our own keymap separately
        completeHTMLTags: options.completeHTMLTags !== false,
        completeWidgets: options.completeWidgets !== false,
        completeMacros: options.completeMacros !== false,
        completeTiddlers: options.completeTiddlers !== false,
        completeFilterOperators: options.completeFilterOperators !== false,
        completeFilterRunPrefixes: options.completeFilterRunPrefixes !== false,
        getTiddlerTitles,
        getMacroNames,
        getWidgetNames,
        getFilterOperators
    });
}
// ============================================================================
// Plugin Definition
// ============================================================================
/**
 * The plugin definition - implements the engine's plugin interface
 */
const plugin = {
    name: "tiddlywiki-syntax",
    description: "TiddlyWiki5 Wikitext syntax highlighting and editing support",
    priority: 100,
    /**
     * Initialize with CM6 core reference
     * Called once when plugin is discovered
     */
    init(cm6Core) {
        _core = cm6Core;
    },
    /**
     * Condition for activation
     * Only activate for TiddlyWiki content types
     */
    condition(context) {
        const type = context.tiddlerType;
        return TW_TYPES.includes(type || "");
    },
    /**
     * Register compartments
     * ALWAYS called, even if condition is false (for later reconfiguration)
     */
    registerCompartments() {
        if (!_core)
            return {};
        const Compartment = _core.state.Compartment;
        return {
            [COMPARTMENT_NAME]: new Compartment()
        };
    },
    /**
     * Get CodeMirror extensions
     * Called when condition is true (initial setup)
     * Must wrap content in compartment.of() ourselves
     */
    getExtensions(context) {
        const extensions = [];
        const engine = context.engine;
        const compartments = engine?._compartments;
        // Language support via compartment
        const langSupport = buildLanguageSupport(context);
        if (compartments?.[COMPARTMENT_NAME]) {
            // Wrap in compartment for later reconfiguration
            extensions.push(compartments[COMPARTMENT_NAME].of(langSupport));
        }
        else {
            // No compartment available, add directly
            extensions.push(langSupport);
        }
        // Header folding support
        extensions.push(headerIndent);
        // Keymap (unless read-only)
        if (!context.readOnly) {
            extensions.push(tiddlywikiKeymap);
        }
        return extensions;
    },
    /**
     * Get compartment content for dynamic reconfiguration
     * Called by engine.setType() when switching content types
     * Returns RAW content (without compartment.of wrapper)
     */
    getCompartmentContent(context) {
        const langSupport = buildLanguageSupport(context);
        // Return array of extensions (engine wraps in compartment.reconfigure)
        return [langSupport, headerIndent];
    },
    /**
     * Extend engine API with TiddlyWiki-specific methods
     * Methods are bound to engine instance by the engine
     */
    extendAPI(engine, _context) {
        return {
            // ================================================================
            // Formatting Commands
            // ================================================================
            toggleBold() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleBold(getCommandTarget(engine.view));
            },
            toggleItalic() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleItalic(getCommandTarget(engine.view));
            },
            toggleUnderline() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleUnderline(getCommandTarget(engine.view));
            },
            toggleStrikethrough() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleStrikethrough(getCommandTarget(engine.view));
            },
            toggleSuperscript() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleSuperscript(getCommandTarget(engine.view));
            },
            toggleSubscript() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleSubscript(getCommandTarget(engine.view));
            },
            toggleInlineCode() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleInlineCode(getCommandTarget(engine.view));
            },
            // ================================================================
            // Link/Transclusion Commands
            // ================================================================
            insertWikiLink() {
                if (engine._destroyed || !engine.view)
                    return false;
                return insertWikiLink(getCommandTarget(engine.view));
            },
            insertTransclusion() {
                if (engine._destroyed || !engine.view)
                    return false;
                return insertTransclusion(getCommandTarget(engine.view));
            },
            // ================================================================
            // Heading Commands
            // ================================================================
            setHeading(level) {
                if (engine._destroyed || !engine.view)
                    return false;
                const commands = [null, setHeading1, setHeading2, setHeading3, setHeading4, setHeading5, setHeading6];
                const cmd = commands[level];
                if (!cmd)
                    return false;
                return cmd(getCommandTarget(engine.view));
            },
            removeHeading() {
                if (engine._destroyed || !engine.view)
                    return false;
                return removeHeading(getCommandTarget(engine.view));
            },
            // ================================================================
            // List Commands
            // ================================================================
            toggleBulletList() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleBulletList(getCommandTarget(engine.view));
            },
            toggleNumberedList() {
                if (engine._destroyed || !engine.view)
                    return false;
                return toggleNumberedList(getCommandTarget(engine.view));
            },
            // ================================================================
            // Block Commands
            // ================================================================
            insertCodeBlock() {
                if (engine._destroyed || !engine.view)
                    return false;
                return insertCodeBlock(getCommandTarget(engine.view));
            }
        };
    },
    /**
     * Register event handlers
     * Handlers are bound to engine instance by the engine
     */
    registerEvents(engine, _context) {
        return {
            /**
             * Handle TiddlyWiki-specific text operations
             * Called when engine._triggerEvent("textOperation", operation) is invoked
             */
            textOperation(operation) {
                if (!operation || engine._destroyed)
                    return;
                switch (operation.type) {
                    case "toggle-bold":
                        engine.toggleBold?.();
                        break;
                    case "toggle-italic":
                        engine.toggleItalic?.();
                        break;
                    case "toggle-underline":
                        engine.toggleUnderline?.();
                        break;
                    case "toggle-strikethrough":
                        engine.toggleStrikethrough?.();
                        break;
                    case "toggle-superscript":
                        engine.toggleSuperscript?.();
                        break;
                    case "toggle-subscript":
                        engine.toggleSubscript?.();
                        break;
                    case "toggle-code":
                        engine.toggleInlineCode?.();
                        break;
                    case "insert-link":
                        engine.insertWikiLink?.();
                        break;
                    case "insert-transclusion":
                        engine.insertTransclusion?.();
                        break;
                    case "set-heading":
                        if (typeof operation.level === "number") {
                            engine.setHeading?.(operation.level);
                        }
                        break;
                    case "remove-heading":
                        engine.removeHeading?.();
                        break;
                    case "toggle-bullet-list":
                        engine.toggleBulletList?.();
                        break;
                    case "toggle-numbered-list":
                        engine.toggleNumberedList?.();
                        break;
                    case "insert-code-block":
                        engine.insertCodeBlock?.();
                        break;
                }
            }
        };
    },
    /**
     * Cleanup when engine is destroyed
     */
    destroy(_engine) {
        // Nothing to clean up for this plugin
    }
};

exports.TiddlyWikiLanguage = TiddlyWikiLanguage;
exports.default = plugin;
exports.deleteMarkupBackward = deleteMarkupBackward;
exports.insertCodeBlock = insertCodeBlock;
exports.insertHorizontalRule = insertHorizontalRule;
exports.insertMacroCall = insertMacroCall;
exports.insertNewlineContinueMarkup = insertNewlineContinueMarkup;
exports.insertNewlineContinueMarkupCommand = insertNewlineContinueMarkupCommand;
exports.insertTransclusion = insertTransclusion;
exports.insertWikiLink = insertWikiLink;
exports.plugin = plugin;
exports.removeHeading = removeHeading;
exports.setHeading1 = setHeading1;
exports.setHeading2 = setHeading2;
exports.setHeading3 = setHeading3;
exports.setHeading4 = setHeading4;
exports.setHeading5 = setHeading5;
exports.setHeading6 = setHeading6;
exports.tiddlywiki = tiddlywiki;
exports.tiddlywikiBaseLanguage = tiddlywikiBaseLanguage;
exports.tiddlywikiLanguage = tiddlywikiLanguage;
exports.toggleBold = toggleBold;
exports.toggleBulletList = toggleBulletList;
exports.toggleInlineCode = toggleInlineCode;
exports.toggleItalic = toggleItalic;
exports.toggleNumberedList = toggleNumberedList;
exports.toggleStrikethrough = toggleStrikethrough;
exports.toggleSubscript = toggleSubscript;
exports.toggleSuperscript = toggleSuperscript;
exports.toggleUnderline = toggleUnderline;
