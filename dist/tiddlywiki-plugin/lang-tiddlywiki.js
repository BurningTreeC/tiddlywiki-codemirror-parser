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

var view = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-view.js');
var language = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-language.js');
var common = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-common.js');
var highlight = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-highlight.js');
var state = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-state.js');
var autocomplete = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-autocomplete.js');
var langHtml = require('$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-lang-html.js');

/**
 * @lezer/tiddlywiki - TiddlyWiki5 Parser für Lezer/CodeMirror 6
 *
 * Analog zum @lezer/markdown Parser, aber für TiddlyWiki5 Wikitext Syntax.
 * Unterstützt alle Block- und Inline-Level Konstrukte von TiddlyWiki5.
 */
// ============================================================================
// Composite Block Helper
// ============================================================================
class CompositeBlock {
    static create(type, value, from, parentHash, end) {
        let hash = (parentHash + (parentHash << 8) + type + (value << 4)) | 0;
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
        this.hashProp = [[common.NodeProp.contextHash, hash]];
    }
    addChild(child, pos) {
        if (child.prop(common.NodeProp.contextHash) != this.hash)
            child = new common.Tree(child.type, child.children, child.positions, child.length, this.hashProp);
        this.children.push(child);
        this.positions.push(pos);
    }
    toTree(nodeSet, end = this.end) {
        let last = this.children.length - 1;
        if (last >= 0)
            end = Math.max(end, this.positions[last] + this.children[last].length + this.from);
        return new common.Tree(nodeSet.types[this.type], this.children, this.positions, end - this.from).balance({
            makeTree: (children, positions, length) => new common.Tree(common.NodeType.none, children, positions, length, this.hashProp)
        });
    }
}
// ============================================================================
// Node Types Enumeration
// ============================================================================
var Type;
(function (Type) {
    Type[Type["Document"] = 1] = "Document";
    // Block-Level
    Type[Type["CodeBlock"] = 2] = "CodeBlock";
    Type[Type["FencedCode"] = 3] = "FencedCode";
    Type[Type["BlockQuote"] = 4] = "BlockQuote";
    Type[Type["HorizontalRule"] = 5] = "HorizontalRule";
    Type[Type["BulletList"] = 6] = "BulletList";
    Type[Type["NumberedList"] = 7] = "NumberedList";
    Type[Type["DefinitionList"] = 8] = "DefinitionList";
    Type[Type["ListItem"] = 9] = "ListItem";
    Type[Type["DefinitionTerm"] = 10] = "DefinitionTerm";
    Type[Type["DefinitionDescription"] = 11] = "DefinitionDescription";
    Type[Type["Heading1"] = 12] = "Heading1";
    Type[Type["Heading2"] = 13] = "Heading2";
    Type[Type["Heading3"] = 14] = "Heading3";
    Type[Type["Heading4"] = 15] = "Heading4";
    Type[Type["Heading5"] = 16] = "Heading5";
    Type[Type["Heading6"] = 17] = "Heading6";
    Type[Type["HTMLBlock"] = 18] = "HTMLBlock";
    Type[Type["Paragraph"] = 19] = "Paragraph";
    Type[Type["CommentBlock"] = 20] = "CommentBlock";
    Type[Type["Table"] = 21] = "Table";
    Type[Type["TableRow"] = 22] = "TableRow";
    Type[Type["TableCell"] = 23] = "TableCell";
    Type[Type["TableHeader"] = 24] = "TableHeader";
    Type[Type["TypedBlock"] = 25] = "TypedBlock";
    // Pragma Blocks
    Type[Type["PragmaBlock"] = 26] = "PragmaBlock";
    Type[Type["MacroDefinition"] = 27] = "MacroDefinition";
    Type[Type["ProcedureDefinition"] = 28] = "ProcedureDefinition";
    Type[Type["FunctionDefinition"] = 29] = "FunctionDefinition";
    Type[Type["WidgetDefinition"] = 30] = "WidgetDefinition";
    Type[Type["RulesPragma"] = 31] = "RulesPragma";
    Type[Type["ImportPragma"] = 32] = "ImportPragma";
    Type[Type["ParametersPragma"] = 33] = "ParametersPragma";
    Type[Type["WhitespacePragma"] = 34] = "WhitespacePragma";
    // Inline
    Type[Type["Escape"] = 35] = "Escape";
    Type[Type["Entity"] = 36] = "Entity";
    Type[Type["HardBreak"] = 37] = "HardBreak";
    Type[Type["Bold"] = 38] = "Bold";
    Type[Type["Italic"] = 39] = "Italic";
    Type[Type["Underline"] = 40] = "Underline";
    Type[Type["Strikethrough"] = 41] = "Strikethrough";
    Type[Type["Superscript"] = 42] = "Superscript";
    Type[Type["Subscript"] = 43] = "Subscript";
    Type[Type["InlineCode"] = 44] = "InlineCode";
    Type[Type["Highlight"] = 45] = "Highlight";
    Type[Type["WikiLink"] = 46] = "WikiLink";
    Type[Type["ExternalLink"] = 47] = "ExternalLink";
    Type[Type["ImageLink"] = 48] = "ImageLink";
    Type[Type["Transclusion"] = 49] = "Transclusion";
    Type[Type["FilteredTransclusion"] = 50] = "FilteredTransclusion";
    Type[Type["MacroCall"] = 51] = "MacroCall";
    Type[Type["Widget"] = 52] = "Widget";
    Type[Type["WidgetAttr"] = 53] = "WidgetAttr";
    Type[Type["Variable"] = 54] = "Variable";
    Type[Type["HTMLTag"] = 55] = "HTMLTag";
    Type[Type["Comment"] = 56] = "Comment";
    // Smaller tokens / Marks
    Type[Type["HeadingMark"] = 57] = "HeadingMark";
    Type[Type["QuoteMark"] = 58] = "QuoteMark";
    Type[Type["ListMark"] = 59] = "ListMark";
    Type[Type["LinkMark"] = 60] = "LinkMark";
    Type[Type["EmphasisMark"] = 61] = "EmphasisMark";
    Type[Type["CodeMark"] = 62] = "CodeMark";
    Type[Type["CodeText"] = 63] = "CodeText";
    Type[Type["CodeInfo"] = 64] = "CodeInfo";
    Type[Type["LinkTarget"] = 65] = "LinkTarget";
    Type[Type["LinkText"] = 66] = "LinkText";
    Type[Type["TransclusionTarget"] = 67] = "TransclusionTarget";
    Type[Type["MacroName"] = 68] = "MacroName";
    Type[Type["MacroParams"] = 69] = "MacroParams";
    Type[Type["WidgetName"] = 70] = "WidgetName";
    Type[Type["FilterExpression"] = 71] = "FilterExpression";
    Type[Type["PragmaMark"] = 72] = "PragmaMark";
    Type[Type["PragmaName"] = 73] = "PragmaName";
    Type[Type["PragmaParams"] = 74] = "PragmaParams";
    Type[Type["TableDelimiter"] = 75] = "TableDelimiter";
    Type[Type["TypedBlockMark"] = 76] = "TypedBlockMark";
    Type[Type["TypedBlockInfo"] = 77] = "TypedBlockInfo";
    Type[Type["URL"] = 78] = "URL";
})(Type || (Type = {}));
// ============================================================================
// Data Structures
// ============================================================================
class LeafBlock {
    constructor(start, content) {
        this.start = start;
        this.content = content;
        this.marks = [];
        this.parsers = [];
    }
}
class Line {
    constructor() {
        this.text = "";
        this.baseIndent = 0;
        this.basePos = 0;
        this.depth = 0;
        this.markers = [];
        this.pos = 0;
        this.indent = 0;
        this.next = -1;
    }
    forward() {
        if (this.basePos > this.pos)
            this.forwardInner();
    }
    forwardInner() {
        let newPos = this.skipSpace(this.basePos);
        this.indent = this.countIndent(newPos, this.pos, this.indent);
        this.pos = newPos;
        this.next = newPos == this.text.length ? -1 : this.text.charCodeAt(newPos);
    }
    skipSpace(from) { return skipSpace(this.text, from); }
    reset(text) {
        this.text = text;
        this.baseIndent = this.basePos = this.pos = this.indent = 0;
        this.forwardInner();
        this.depth = 1;
        while (this.markers.length)
            this.markers.pop();
    }
    moveBase(to) {
        this.basePos = to;
        this.baseIndent = this.countIndent(to, this.pos, this.indent);
    }
    moveBaseColumn(indent) {
        this.baseIndent = indent;
        this.basePos = this.findColumn(indent);
    }
    addMarker(elt) {
        this.markers.push(elt);
    }
    countIndent(to, from = 0, indent = 0) {
        for (let i = from; i < to; i++)
            indent += this.text.charCodeAt(i) == 9 ? 4 - indent % 4 : 1;
        return indent;
    }
    findColumn(goal) {
        let i = 0;
        for (let indent = 0; i < this.text.length && indent < goal; i++)
            indent += this.text.charCodeAt(i) == 9 ? 4 - indent % 4 : 1;
        return i;
    }
    scrub() {
        if (!this.baseIndent)
            return this.text;
        let result = "";
        for (let i = 0; i < this.basePos; i++)
            result += " ";
        return result + this.text.slice(this.basePos);
    }
}
// ============================================================================
// Utility Functions
// ============================================================================
function space(ch) { return ch == 32 || ch == 9 || ch == 10 || ch == 13; }
function skipSpace(line, i = 0) {
    while (i < line.length && space(line.charCodeAt(i)))
        i++;
    return i;
}
function skipSpaceBack(line, i, to) {
    while (i > to && space(line.charCodeAt(i - 1)))
        i--;
    return i;
}
// ============================================================================
// Block-Level Detection Functions
// ============================================================================
// TiddlyWiki Heading: ! !! !!! etc.
function isHeading$1(line) {
    if (line.next != 33 /* '!' */)
        return -1;
    let pos = line.pos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) == 33)
        pos++;
    let level = pos - line.pos;
    // Must have space or end of line after markers
    if (pos < line.text.length && !space(line.text.charCodeAt(pos)))
        return -1;
    return level > 6 ? -1 : level;
}
// TiddlyWiki Horizontal Rule: ---
function isHorizontalRule(line) {
    if (line.next != 45 /* '-' */)
        return false;
    let pos = line.pos;
    let count = 0;
    while (pos < line.text.length && line.text.charCodeAt(pos) == 45) {
        count++;
        pos++;
    }
    // Rest must be whitespace
    while (pos < line.text.length) {
        if (!space(line.text.charCodeAt(pos)))
            return false;
        pos++;
    }
    return count >= 3;
}
// TiddlyWiki Fenced Code: ```
function isFencedCode(line) {
    if (line.next != 96 /* '`' */)
        return -1;
    let pos = line.pos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) == 96)
        pos++;
    if (pos < line.pos + 3)
        return -1;
    return pos;
}
// TiddlyWiki Block Quote: <<<
function isBlockQuote(line) {
    if (line.next != 60 /* '<' */)
        return -1;
    let pos = line.pos;
    let count = 0;
    while (pos < line.text.length && line.text.charCodeAt(pos) == 60) {
        count++;
        pos++;
    }
    return count >= 3 ? pos : -1;
}
// TiddlyWiki Bullet List: * ** ***
function isBulletList(line) {
    if (line.next != 42 /* '*' */)
        return -1;
    let pos = line.pos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) == 42)
        pos++;
    // Must have space after markers
    if (pos < line.text.length && !space(line.text.charCodeAt(pos)))
        return -1;
    return pos - line.pos;
}
// TiddlyWiki Numbered List: # ## ###
function isNumberedList(line) {
    if (line.next != 35 /* '#' */)
        return -1;
    let pos = line.pos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) == 35)
        pos++;
    // Must have space after markers
    if (pos < line.text.length && !space(line.text.charCodeAt(pos)))
        return -1;
    return pos - line.pos;
}
// TiddlyWiki Definition List: ; term : definition
function isDefinitionTerm(line) {
    return line.next == 59; /* ';' */
}
function isDefinitionDescription(line) {
    return line.next == 58; /* ':' */
}
// TiddlyWiki Table: |cell|cell|
function isTable(line) {
    return line.next == 124; /* '|' */
}
// TiddlyWiki Typed Block: $$$.type
function isTypedBlock(line) {
    if (line.next != 36 /* '$' */)
        return null;
    let pos = line.pos;
    if (line.text.charCodeAt(pos + 1) != 36 || line.text.charCodeAt(pos + 2) != 36)
        return null;
    pos += 3;
    if (pos < line.text.length && line.text.charCodeAt(pos) == 46 /* '.' */) {
        let infoStart = pos + 1;
        while (pos < line.text.length && !space(line.text.charCodeAt(pos)))
            pos++;
        return { end: pos, info: line.text.slice(infoStart, pos) };
    }
    return { end: pos, info: "" };
}
// TiddlyWiki Pragma: \define, \procedure, \function, \widget, \rules, \import, \parameters, \whitespace
function isPragma(line) {
    if (line.next != 92 /* '\\' */)
        return null;
    let pos = line.pos + 1;
    let nameStart = pos;
    while (pos < line.text.length && /[a-zA-Z]/.test(line.text[pos]))
        pos++;
    let name = line.text.slice(nameStart, pos).toLowerCase();
    const pragmaTypes = ['define', 'procedure', 'function', 'widget', 'rules', 'import', 'parameters', 'whitespace'];
    if (pragmaTypes.includes(name)) {
        return { type: name, end: pos };
    }
    return null;
}
// HTML Block detection
function isHTMLBlock(line) {
    if (line.next != 60 /* '<' */)
        return false;
    let rest = line.text.slice(line.pos);
    // Check for HTML tags (not widgets which start with <$)
    return /^<(?![\$\/\$])[a-zA-Z][^>]*>/.test(rest) || /^<\/[a-zA-Z][^>]*>/.test(rest);
}
function addCodeText(marks, from, to) {
    let last = marks.length - 1;
    if (last >= 0 && marks[last].to == from && marks[last].type == Type.CodeText)
        marks[last].to = to;
    else
        marks.push(elt(Type.CodeText, from, to));
}
const DefaultBlockParsers = {
    Pragma(cx, line) {
        let pragma = isPragma(line);
        if (!pragma)
            return false;
        let from = cx.lineStart + line.pos;
        let marks = [elt(Type.PragmaMark, from, from + 1)]; // backslash
        let nameEnd = cx.lineStart + pragma.end;
        marks.push(elt(Type.PragmaName, from + 1, nameEnd));
        // Handle multi-line pragmas (\define, \procedure, \function, \widget)
        const multiLinePragmas = ['define', 'procedure', 'function', 'widget'];
        if (multiLinePragmas.includes(pragma.type)) {
            // Parse until \end
            let to = cx.lineStart + line.text.length;
            while (cx.nextLine()) {
                let trimmed = line.text.trim();
                if (trimmed === '\\end' || trimmed.startsWith('\\end ')) {
                    marks.push(elt(Type.PragmaMark, cx.lineStart + line.pos, cx.lineStart + line.text.length));
                    to = cx.lineStart + line.text.length;
                    cx.nextLine();
                    break;
                }
                to = cx.lineStart + line.text.length;
            }
            let nodeType = pragma.type === 'define' ? Type.MacroDefinition :
                pragma.type === 'procedure' ? Type.ProcedureDefinition :
                    pragma.type === 'function' ? Type.FunctionDefinition :
                        Type.WidgetDefinition;
            cx.addNode(cx.buffer.writeElements(marks, -from).finish(nodeType, to - from), from);
        }
        else {
            // Single-line pragmas
            let to = cx.lineStart + line.text.length;
            let nodeType = pragma.type === 'rules' ? Type.RulesPragma :
                pragma.type === 'import' ? Type.ImportPragma :
                    pragma.type === 'parameters' ? Type.ParametersPragma :
                        Type.WhitespacePragma;
            cx.addNode(cx.buffer.writeElements(marks, -from).finish(nodeType, to - from), from);
            cx.nextLine();
        }
        return true;
    },
    Heading(cx, line) {
        let level = isHeading$1(line);
        if (level < 0)
            return false;
        let from = cx.lineStart + line.pos;
        let headingType = Type.Heading1 - 1 + level;
        let buf = cx.buffer
            .write(Type.HeadingMark, 0, level)
            .writeElements(cx.parser.parseInline(line.text.slice(line.pos + level), from + level), -from);
        let node = buf.finish(headingType, line.text.length - line.pos);
        cx.nextLine();
        cx.addNode(node, from);
        return true;
    },
    HorizontalRule(cx, line) {
        if (!isHorizontalRule(line))
            return false;
        let from = cx.lineStart + line.pos;
        cx.nextLine();
        cx.addNode(Type.HorizontalRule, from);
        return true;
    },
    FencedCode(cx, line) {
        let fenceEnd = isFencedCode(line);
        if (fenceEnd < 0)
            return false;
        let from = cx.lineStart + line.pos;
        let len = fenceEnd - line.pos;
        let infoFrom = line.skipSpace(fenceEnd);
        let infoTo = skipSpaceBack(line.text, line.text.length, infoFrom);
        let marks = [elt(Type.CodeMark, from, from + len)];
        if (infoFrom < infoTo)
            marks.push(elt(Type.CodeInfo, cx.lineStart + infoFrom, cx.lineStart + infoTo));
        while (cx.nextLine() && line.depth >= cx.stack.length) {
            let i = line.pos;
            while (i < line.text.length && line.text.charCodeAt(i) == 96)
                i++;
            if (i - line.pos >= len && line.skipSpace(i) == line.text.length) {
                marks.push(elt(Type.CodeMark, cx.lineStart + line.pos, cx.lineStart + i));
                cx.nextLine();
                break;
            }
            else {
                let textStart = cx.lineStart + line.basePos;
                let textEnd = cx.lineStart + line.text.length;
                if (textStart < textEnd)
                    addCodeText(marks, textStart, textEnd);
            }
        }
        cx.addNode(cx.buffer.writeElements(marks, -from).finish(Type.FencedCode, cx.prevLineEnd() - from), from);
        return true;
    },
    BlockQuote(cx, line) {
        let end = isBlockQuote(line);
        if (end < 0)
            return false;
        let from = cx.lineStart + line.pos;
        let marks = [elt(Type.QuoteMark, from, cx.lineStart + end)];
        let content = [];
        // Parse content until closing <<<
        while (cx.nextLine()) {
            let closeEnd = isBlockQuote(line);
            if (closeEnd >= 0) {
                marks.push(elt(Type.QuoteMark, cx.lineStart + line.pos, cx.lineStart + closeEnd));
                cx.nextLine();
                break;
            }
            // Parse inline content
            let lineContent = cx.parser.parseInline(line.text.slice(line.pos), cx.lineStart + line.pos);
            content.push(...lineContent);
        }
        cx.addNode(cx.buffer.writeElements([...marks, ...content], -from)
            .finish(Type.BlockQuote, cx.prevLineEnd() - from), from);
        return true;
    },
    BulletList(cx, line) {
        let size = isBulletList(line);
        if (size < 0)
            return false;
        if (cx.block.type != Type.BulletList)
            cx.startContext(Type.BulletList, line.basePos, line.next);
        let newBase = line.pos + size + 1;
        cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
        cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + size);
        line.moveBaseColumn(newBase);
        return null;
    },
    NumberedList(cx, line) {
        let size = isNumberedList(line);
        if (size < 0)
            return false;
        if (cx.block.type != Type.NumberedList)
            cx.startContext(Type.NumberedList, line.basePos, line.next);
        let newBase = line.pos + size + 1;
        cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
        cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + size);
        line.moveBaseColumn(newBase);
        return null;
    },
    DefinitionList(cx, line) {
        if (!isDefinitionTerm(line) && !isDefinitionDescription(line))
            return false;
        if (cx.block.type != Type.DefinitionList)
            cx.startContext(Type.DefinitionList, line.basePos, 0);
        let isTerm = isDefinitionTerm(line);
        let nodeType = isTerm ? Type.DefinitionTerm : Type.DefinitionDescription;
        cx.startContext(nodeType, line.basePos, 1);
        cx.addNode(Type.ListMark, cx.lineStart + line.pos, cx.lineStart + line.pos + 1);
        line.moveBase(line.pos + 1);
        return null;
    },
    Table(cx, line) {
        if (!isTable(line))
            return false;
        let from = cx.lineStart + line.pos;
        let rows = [];
        let isHeader = true;
        do {
            let rowFrom = cx.lineStart + line.pos;
            let cells = [];
            let text = line.text;
            let pos = line.pos;
            while (pos < text.length) {
                if (text.charCodeAt(pos) == 124 /* '|' */) {
                    cells.push(elt(Type.TableDelimiter, cx.lineStart + pos, cx.lineStart + pos + 1));
                    pos++;
                    let cellStart = pos;
                    // Find cell content
                    while (pos < text.length && text.charCodeAt(pos) != 124)
                        pos++;
                    if (pos > cellStart) {
                        let cellContent = text.slice(cellStart, pos).trim();
                        if (cellContent) {
                            let cellType = isHeader ? Type.TableHeader : Type.TableCell;
                            let inline = cx.parser.parseInline(cellContent, cx.lineStart + cellStart);
                            cells.push(elt(cellType, cx.lineStart + cellStart, cx.lineStart + pos, inline));
                        }
                    }
                }
                else {
                    pos++;
                }
            }
            if (cells.length > 0) {
                rows.push(elt(Type.TableRow, rowFrom, cx.lineStart + line.text.length, cells));
            }
            // Check for header separator |---|---|
            if (isHeader && /^\|[-:|\s]+\|$/.test(text.slice(line.pos))) {
                isHeader = false;
            }
            else {
                isHeader = false;
            }
        } while (cx.nextLine() && isTable(line));
        cx.addNode(cx.buffer.writeElements(rows, -from).finish(Type.Table, cx.prevLineEnd() - from), from);
        return true;
    },
    TypedBlock(cx, line) {
        let typed = isTypedBlock(line);
        if (!typed)
            return false;
        let from = cx.lineStart + line.pos;
        let marks = [elt(Type.TypedBlockMark, from, cx.lineStart + typed.end)];
        if (typed.info) {
            marks.push(elt(Type.TypedBlockInfo, cx.lineStart + 3, cx.lineStart + typed.end));
        }
        // Parse until closing $$$
        while (cx.nextLine()) {
            if (line.text.trim() === '$$$') {
                marks.push(elt(Type.TypedBlockMark, cx.lineStart + line.pos, cx.lineStart + line.text.length));
                cx.nextLine();
                break;
            }
            let textStart = cx.lineStart + line.pos;
            let textEnd = cx.lineStart + line.text.length;
            if (textStart < textEnd)
                addCodeText(marks, textStart, textEnd);
        }
        cx.addNode(cx.buffer.writeElements(marks, -from).finish(Type.TypedBlock, cx.prevLineEnd() - from), from);
        return true;
    },
    HTMLBlock(cx, line) {
        if (!isHTMLBlock(line))
            return false;
        let from = cx.lineStart + line.pos;
        let depth = 1;
        line.text.slice(line.pos);
        // Simple HTML block handling - find matching close tag or empty line
        while (cx.nextLine() && depth > 0) {
            if (line.text.trim() === '')
                break;
            // Count opening and closing tags
            let matches = line.text.match(/<[a-zA-Z][^>]*>/g) || [];
            let closes = line.text.match(/<\/[a-zA-Z][^>]*>/g) || [];
            depth += matches.length - closes.length;
        }
        cx.addNode(Type.HTMLBlock, from, cx.prevLineEnd());
        return true;
    }
};
// Skip markup handlers for composite blocks
function skipForList(bl, cx, line) {
    if (line.pos == line.text.length ||
        (bl != cx.block && line.indent >= cx.stack[line.depth + 1].value + line.baseIndent))
        return true;
    if (line.indent >= line.baseIndent + 4)
        return false;
    let size = bl.type == Type.NumberedList ? isNumberedList(line) : isBulletList(line);
    return size > 0;
}
const DefaultSkipMarkup = {
    [Type.BlockQuote](bl, cx, line) {
        // Block quotes don't need continuation markers in TiddlyWiki
        return true;
    },
    [Type.ListItem](bl, _cx, line) {
        if (line.indent < line.baseIndent + bl.value && line.next > -1)
            return false;
        line.moveBaseColumn(line.baseIndent + bl.value);
        return true;
    },
    [Type.BulletList]: skipForList,
    [Type.NumberedList]: skipForList,
    [Type.DefinitionList](bl, cx, line) {
        return isDefinitionTerm(line) || isDefinitionDescription(line);
    },
    [Type.DefinitionTerm]() { return true; },
    [Type.DefinitionDescription]() { return true; },
    [Type.Document]() { return true; }
};
// Leaf block parsers
const DefaultLeafBlocks = {
    Pragma() { return null; },
    Heading() { return null; },
    HorizontalRule() { return null; },
    FencedCode() { return null; },
    BlockQuote() { return null; },
    BulletList() { return null; },
    NumberedList() { return null; },
    DefinitionList() { return null; },
    Table() { return null; },
    TypedBlock() { return null; },
    HTMLBlock() { return null; }
};
const DefaultEndLeaf = [
    (_, line) => isHeading$1(line) >= 0,
    (_, line) => isFencedCode(line) >= 0,
    (_, line) => isBlockQuote(line) >= 0,
    (_, line) => isBulletList(line) >= 0,
    (_, line) => isNumberedList(line) >= 0,
    (_, line) => isHorizontalRule(line),
    (_, line) => isTable(line),
    (_, line) => isTypedBlock(line) != null,
    (_, line) => isPragma(line) != null
];
// ============================================================================
// Inline Parsers
// ============================================================================
let Punctuation = /[!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~\xA1\u2010-\u2027]/;
try {
    Punctuation = new RegExp("[\\p{S}|\\p{P}]", "u");
}
catch (_) { }
class InlineDelimiter {
    constructor(type, from, to, side) {
        this.type = type;
        this.from = from;
        this.to = to;
        this.side = side;
    }
}
// Delimiter types for TiddlyWiki formatting
const BoldDelim = { resolve: "Bold", mark: "EmphasisMark" };
const ItalicDelim = { resolve: "Italic", mark: "EmphasisMark" };
const UnderlineDelim = { resolve: "Underline", mark: "EmphasisMark" };
const StrikethroughDelim = { resolve: "Strikethrough", mark: "EmphasisMark" };
const SuperscriptDelim = { resolve: "Superscript", mark: "EmphasisMark" };
const SubscriptDelim = { resolve: "Subscript", mark: "EmphasisMark" };
const DefaultInline = {
    // Escape: ~ before wikitext characters
    Escape(cx, next, start) {
        if (next != 126 /* '~' */)
            return -1;
        let escaped = cx.char(start + 1);
        if (escaped < 0)
            return -1;
        // TiddlyWiki escape prevents wikitext interpretation
        return cx.append(elt(Type.Escape, start, start + 2));
    },
    // HTML Entity: &entity;
    Entity(cx, next, start) {
        if (next != 38 /* '&' */)
            return -1;
        let m = /^(?:#\d+|#x[a-f\d]+|\w+);/i.exec(cx.slice(start + 1, start + 31));
        return m ? cx.append(elt(Type.Entity, start, start + 1 + m[0].length)) : -1;
    },
    // Inline Code: `code`
    InlineCode(cx, next, start) {
        if (next != 96 /* '`' */)
            return -1;
        let pos = start + 1;
        while (pos < cx.end && cx.char(pos) == 96)
            pos++;
        let size = pos - start;
        let curSize = 0;
        for (; pos < cx.end; pos++) {
            if (cx.char(pos) == 96) {
                curSize++;
                if (curSize == size && cx.char(pos + 1) != 96)
                    return cx.append(elt(Type.InlineCode, start, pos + 1, [
                        elt(Type.CodeMark, start, start + size),
                        elt(Type.CodeMark, pos + 1 - size, pos + 1)
                    ]));
            }
            else {
                curSize = 0;
            }
        }
        return -1;
    },
    // Bold: ''text''
    Bold(cx, next, start) {
        if (next != 39 /* '\'' */ || cx.char(start + 1) != 39)
            return -1;
        let after = cx.slice(start + 2, start + 3);
        let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start));
        let sAfter = /\s|^$/.test(after);
        return cx.append(new InlineDelimiter(BoldDelim, start, start + 2, (!sAfter ? 1 /* Mark.Open */ : 0 /* Mark.None */) | (!sBefore ? 2 /* Mark.Close */ : 0 /* Mark.None */)));
    },
    // Italic: //text//
    Italic(cx, next, start) {
        if (next != 47 /* '/' */ || cx.char(start + 1) != 47)
            return -1;
        let after = cx.slice(start + 2, start + 3);
        let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start));
        let sAfter = /\s|^$/.test(after);
        return cx.append(new InlineDelimiter(ItalicDelim, start, start + 2, (!sAfter ? 1 /* Mark.Open */ : 0 /* Mark.None */) | (!sBefore ? 2 /* Mark.Close */ : 0 /* Mark.None */)));
    },
    // Underline: __text__
    Underline(cx, next, start) {
        if (next != 95 /* '_' */ || cx.char(start + 1) != 95)
            return -1;
        let after = cx.slice(start + 2, start + 3);
        let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start));
        let sAfter = /\s|^$/.test(after);
        return cx.append(new InlineDelimiter(UnderlineDelim, start, start + 2, (!sAfter ? 1 /* Mark.Open */ : 0 /* Mark.None */) | (!sBefore ? 2 /* Mark.Close */ : 0 /* Mark.None */)));
    },
    // Strikethrough: ~~text~~
    Strikethrough(cx, next, start) {
        if (next != 126 /* '~' */ || cx.char(start + 1) != 126)
            return -1;
        // Check it's not an escape (single ~)
        if (cx.char(start + 2) == 126)
            return -1; // ~~~ is not strikethrough
        let after = cx.slice(start + 2, start + 3);
        let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start));
        let sAfter = /\s|^$/.test(after);
        return cx.append(new InlineDelimiter(StrikethroughDelim, start, start + 2, (!sAfter ? 1 /* Mark.Open */ : 0 /* Mark.None */) | (!sBefore ? 2 /* Mark.Close */ : 0 /* Mark.None */)));
    },
    // Superscript: ^^text^^
    Superscript(cx, next, start) {
        if (next != 94 /* '^' */ || cx.char(start + 1) != 94)
            return -1;
        let after = cx.slice(start + 2, start + 3);
        let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start));
        let sAfter = /\s|^$/.test(after);
        return cx.append(new InlineDelimiter(SuperscriptDelim, start, start + 2, (!sAfter ? 1 /* Mark.Open */ : 0 /* Mark.None */) | (!sBefore ? 2 /* Mark.Close */ : 0 /* Mark.None */)));
    },
    // Subscript: ,,text,,
    Subscript(cx, next, start) {
        if (next != 44 /* ',' */ || cx.char(start + 1) != 44)
            return -1;
        let after = cx.slice(start + 2, start + 3);
        let sBefore = start == cx.offset || /\s/.test(cx.slice(start - 1, start));
        let sAfter = /\s|^$/.test(after);
        return cx.append(new InlineDelimiter(SubscriptDelim, start, start + 2, (!sAfter ? 1 /* Mark.Open */ : 0 /* Mark.None */) | (!sBefore ? 2 /* Mark.Close */ : 0 /* Mark.None */)));
    },
    // WikiLink: [[link]] or [[text|link]]
    WikiLink(cx, next, start) {
        if (next != 91 /* '[' */ || cx.char(start + 1) != 91)
            return -1;
        let pos = start + 2;
        let hasText = false;
        let textEnd = pos;
        // Find closing ]]
        while (pos < cx.end) {
            let ch = cx.char(pos);
            if (ch == 124 /* '|' */ && !hasText) {
                hasText = true;
                textEnd = pos;
            }
            else if (ch == 93 /* ']' */ && cx.char(pos + 1) == 93) {
                let children = [elt(Type.LinkMark, start, start + 2)];
                if (hasText) {
                    children.push(elt(Type.LinkText, start + 2, textEnd));
                    children.push(elt(Type.LinkMark, textEnd, textEnd + 1));
                    children.push(elt(Type.LinkTarget, textEnd + 1, pos));
                }
                else {
                    children.push(elt(Type.LinkTarget, start + 2, pos));
                }
                children.push(elt(Type.LinkMark, pos, pos + 2));
                return cx.append(elt(Type.WikiLink, start, pos + 2, children));
            }
            pos++;
        }
        return -1;
    },
    // External Link: [ext[text|url]] or [img[tooltip|url]]
    ExternalLink(cx, next, start) {
        if (next != 91 /* '[' */)
            return -1;
        let pos = start + 1;
        let type = "";
        // Check for ext[ or img[
        if (cx.slice(pos, pos + 4) === "ext[") {
            type = "ext";
            pos += 4;
        }
        else if (cx.slice(pos, pos + 4) === "img[") {
            type = "img";
            pos += 4;
        }
        else {
            return -1;
        }
        let textStart = pos;
        let textEnd = pos;
        let hasText = false;
        // Find closing ]]
        while (pos < cx.end) {
            let ch = cx.char(pos);
            if (ch == 124 /* '|' */ && !hasText) {
                hasText = true;
                textEnd = pos;
            }
            else if (ch == 93 /* ']' */ && cx.char(pos + 1) == 93) {
                let children = [elt(Type.LinkMark, start, start + 1 + type.length + 1)];
                if (hasText) {
                    children.push(elt(Type.LinkText, textStart, textEnd));
                    children.push(elt(Type.LinkMark, textEnd, textEnd + 1));
                    children.push(elt(Type.URL, textEnd + 1, pos));
                }
                else {
                    children.push(elt(Type.URL, textStart, pos));
                }
                children.push(elt(Type.LinkMark, pos, pos + 2));
                let nodeType = type === "img" ? Type.ImageLink : Type.ExternalLink;
                return cx.append(elt(nodeType, start, pos + 2, children));
            }
            pos++;
        }
        return -1;
    },
    // Transclusion: {{tiddler}} or {{tiddler!!field}} or {{tiddler##index}}
    Transclusion(cx, next, start) {
        if (next != 123 /* '{' */ || cx.char(start + 1) != 123)
            return -1;
        // Check for filtered transclusion {{{ }}}
        if (cx.char(start + 2) == 123) {
            return -1; // Let FilteredTransclusion handle it
        }
        let pos = start + 2;
        // Find closing }}
        while (pos < cx.end) {
            if (cx.char(pos) == 125 /* '}' */ && cx.char(pos + 1) == 125) {
                let children = [
                    elt(Type.LinkMark, start, start + 2),
                    elt(Type.TransclusionTarget, start + 2, pos),
                    elt(Type.LinkMark, pos, pos + 2)
                ];
                return cx.append(elt(Type.Transclusion, start, pos + 2, children));
            }
            pos++;
        }
        return -1;
    },
    // Filtered Transclusion: {{{ filter }}}
    FilteredTransclusion(cx, next, start) {
        if (next != 123 /* '{' */ || cx.char(start + 1) != 123 || cx.char(start + 2) != 123)
            return -1;
        let pos = start + 3;
        // Find closing }}}
        while (pos < cx.end) {
            if (cx.char(pos) == 125 /* '}' */ && cx.char(pos + 1) == 125 && cx.char(pos + 2) == 125) {
                let children = [
                    elt(Type.LinkMark, start, start + 3),
                    elt(Type.FilterExpression, start + 3, pos),
                    elt(Type.LinkMark, pos, pos + 3)
                ];
                return cx.append(elt(Type.FilteredTransclusion, start, pos + 3, children));
            }
            pos++;
        }
        return -1;
    },
    // Macro Call: <<macroname params>>
    MacroCall(cx, next, start) {
        if (next != 60 /* '<' */ || cx.char(start + 1) != 60)
            return -1;
        let pos = start + 2;
        let nameStart = pos;
        // Skip whitespace
        while (pos < cx.end && space(cx.char(pos)))
            pos++;
        nameStart = pos;
        // Read macro name
        while (pos < cx.end && /[\w\-\$]/.test(cx.slice(pos, pos + 1)))
            pos++;
        let nameEnd = pos;
        if (nameEnd == nameStart)
            return -1; // No name
        // Find closing >>
        let depth = 1;
        while (pos < cx.end && depth > 0) {
            if (cx.char(pos) == 60 && cx.char(pos + 1) == 60)
                depth++;
            else if (cx.char(pos) == 62 && cx.char(pos + 1) == 62)
                depth--;
            if (depth > 0)
                pos++;
        }
        if (depth != 0)
            return -1;
        let children = [
            elt(Type.LinkMark, start, start + 2),
            elt(Type.MacroName, nameStart, nameEnd)
        ];
        if (nameEnd < pos) {
            children.push(elt(Type.MacroParams, nameEnd, pos));
        }
        children.push(elt(Type.LinkMark, pos, pos + 2));
        return cx.append(elt(Type.MacroCall, start, pos + 2, children));
    },
    // Widget: <$widget attr="value">...</$widget> or <$widget/>
    Widget(cx, next, start) {
        if (next != 60 /* '<' */ || cx.char(start + 1) != 36 /* '$' */)
            return -1;
        let pos = start + 2;
        let nameStart = pos;
        // Read widget name
        while (pos < cx.end && /[\w\-]/.test(cx.slice(pos, pos + 1)))
            pos++;
        let nameEnd = pos;
        if (nameEnd == nameStart)
            return -1; // No name
        // Parse attributes until > or />
        let attrs = [];
        while (pos < cx.end) {
            // Skip whitespace
            while (pos < cx.end && space(cx.char(pos)))
                pos++;
            if (cx.char(pos) == 47 /* '/' */ && cx.char(pos + 1) == 62 /* '>' */) {
                // Self-closing
                let children = [
                    elt(Type.LinkMark, start, start + 2),
                    elt(Type.WidgetName, nameStart, nameEnd),
                    ...attrs,
                    elt(Type.LinkMark, pos, pos + 2)
                ];
                return cx.append(elt(Type.Widget, start, pos + 2, children));
            }
            if (cx.char(pos) == 62 /* '>' */) {
                let depth = 1;
                pos++;
                while (pos < cx.end && depth > 0) {
                    if (cx.char(pos) == 60 /* '<' */) {
                        if (cx.char(pos + 1) == 36 /* '$' */) {
                            // Check if it's the same widget name
                            let checkPos = pos + 2;
                            while (checkPos < cx.end && /[\w\-]/.test(cx.slice(checkPos, checkPos + 1)))
                                checkPos++;
                            depth++;
                        }
                        else if (cx.char(pos + 1) == 47 /* '/' */ && cx.char(pos + 2) == 36 /* '$' */) {
                            // Closing tag
                            let closeNameStart = pos + 3;
                            let closeNameEnd = closeNameStart;
                            while (closeNameEnd < cx.end && /[\w\-]/.test(cx.slice(closeNameEnd, closeNameEnd + 1)))
                                closeNameEnd++;
                            let closeName = cx.slice(closeNameStart, closeNameEnd);
                            let openName = cx.slice(nameStart, nameEnd);
                            if (closeName === openName) {
                                depth--;
                                if (depth == 0) {
                                    // Find the >
                                    while (closeNameEnd < cx.end && cx.char(closeNameEnd) != 62)
                                        closeNameEnd++;
                                    let children = [
                                        elt(Type.LinkMark, start, start + 2),
                                        elt(Type.WidgetName, nameStart, nameEnd),
                                        ...attrs,
                                        elt(Type.LinkMark, pos, pos + 1),
                                        elt(Type.LinkMark, pos, closeNameEnd + 1)
                                    ];
                                    return cx.append(elt(Type.Widget, start, closeNameEnd + 1, children));
                                }
                            }
                        }
                    }
                    pos++;
                }
                return -1;
            }
            // Try to parse attribute
            let attrStart = pos;
            while (pos < cx.end && /[\w\-]/.test(cx.slice(pos, pos + 1)))
                pos++;
            if (pos > attrStart) {
                // Check for =
                while (pos < cx.end && space(cx.char(pos)))
                    pos++;
                if (cx.char(pos) == 61 /* '=' */) {
                    pos++;
                    while (pos < cx.end && space(cx.char(pos)))
                        pos++;
                    // Parse value
                    let quote = cx.char(pos);
                    if (quote == 34 /* '"' */ || quote == 39 /* '\'' */) {
                        pos++;
                        while (pos < cx.end && cx.char(pos) != quote)
                            pos++;
                        if (cx.char(pos) == quote)
                            pos++;
                    }
                    else if (quote == 123 /* '{' */ && cx.char(pos + 1) == 123) {
                        // Indirect attribute {{ref}}
                        pos += 2;
                        while (pos < cx.end && !(cx.char(pos) == 125 && cx.char(pos + 1) == 125))
                            pos++;
                        if (cx.char(pos) == 125)
                            pos += 2;
                    }
                    else if (quote == 60 /* '<' */ && cx.char(pos + 1) == 60) {
                        // Macro attribute <<macro>>
                        pos += 2;
                        let depth = 1;
                        while (pos < cx.end && depth > 0) {
                            if (cx.char(pos) == 60 && cx.char(pos + 1) == 60)
                                depth++;
                            else if (cx.char(pos) == 62 && cx.char(pos + 1) == 62)
                                depth--;
                            pos++;
                        }
                        pos++;
                    }
                    else {
                        // Unquoted value
                        while (pos < cx.end && !space(cx.char(pos)) && cx.char(pos) != 62 && cx.char(pos) != 47)
                            pos++;
                    }
                }
                attrs.push(elt(Type.WidgetAttr, attrStart, pos));
            }
            else {
                break;
            }
        }
        return -1;
    },
    // Variable: $(varname)$
    Variable(cx, next, start) {
        if (next != 36 /* '$' */ || cx.char(start + 1) != 40 /* '(' */)
            return -1;
        let pos = start + 2;
        // Find closing )$
        while (pos < cx.end) {
            if (cx.char(pos) == 41 /* ')' */ && cx.char(pos + 1) == 36 /* '$' */) {
                return cx.append(elt(Type.Variable, start, pos + 2));
            }
            pos++;
        }
        return -1;
    },
    // HTML Tag
    HTMLTag(cx, next, start) {
        if (next != 60 /* '<' */)
            return -1;
        // Don't match widgets
        if (cx.char(start + 1) == 36 /* '$' */)
            return -1;
        let after = cx.slice(start + 1, cx.end);
        let m = /^(?:\/\s*[a-zA-Z][\w-]*\s*>|[a-zA-Z][\w-]*(?:\s+[a-zA-Z:_][\w-.]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)/.exec(after);
        if (!m)
            return -1;
        return cx.append(elt(Type.HTMLTag, start, start + 1 + m[0].length));
    },
    // Hard Break
    HardBreak(cx, next, start) {
        if (next == 60 /* '<' */) {
            let after = cx.slice(start, start + 4).toLowerCase();
            if (after === "<br>" || after === "<br/") {
                let end = start + 4;
                if (cx.char(end) == 62)
                    end++;
                return cx.append(elt(Type.HardBreak, start, end));
            }
        }
        return -1;
    }
};
// ============================================================================
// Element and Buffer Classes
// ============================================================================
const none = [];
class Buffer {
    constructor(nodeSet) {
        this.nodeSet = nodeSet;
        this.content = [];
        this.nodes = [];
    }
    write(type, from, to, children = 0) {
        this.content.push(type, from, to, 4 + children * 4);
        return this;
    }
    writeElements(elts, offset = 0) {
        for (let e of elts)
            e.writeTo(this, offset);
        return this;
    }
    finish(type, length) {
        return common.Tree.build({
            buffer: this.content,
            nodeSet: this.nodeSet,
            reused: this.nodes,
            topID: type,
            length
        });
    }
}
class Element {
    constructor(type, from, to, children = none) {
        this.type = type;
        this.from = from;
        this.to = to;
        this.children = children;
    }
    writeTo(buf, offset) {
        let startOff = buf.content.length;
        buf.writeElements(this.children, offset);
        buf.content.push(this.type, this.from + offset, this.to + offset, buf.content.length + 4 - startOff);
    }
    toTree(nodeSet) {
        return new Buffer(nodeSet).writeElements(this.children, -this.from).finish(this.type, this.to - this.from);
    }
}
class TreeElement {
    constructor(tree, from) {
        this.tree = tree;
        this.from = from;
    }
    get to() { return this.from + this.tree.length; }
    get type() { return this.tree.type.id; }
    get children() { return none; }
    writeTo(buf, offset) {
        buf.nodes.push(this.tree);
        buf.content.push(buf.nodes.length - 1, this.from + offset, this.to + offset, -1);
    }
    toTree() { return this.tree; }
}
function elt(type, from, to, children) {
    return new Element(type, from, to, children);
}
// ============================================================================
// Inline Context
// ============================================================================
class InlineContext {
    constructor(parser, text, offset) {
        this.parser = parser;
        this.text = text;
        this.offset = offset;
        this.parts = [];
    }
    char(pos) { return pos >= this.end ? -1 : this.text.charCodeAt(pos - this.offset); }
    get end() { return this.offset + this.text.length; }
    slice(from, to) { return this.text.slice(from - this.offset, to - this.offset); }
    append(elt) {
        this.parts.push(elt);
        return elt.to;
    }
    addDelimiter(type, from, to, open, close) {
        return this.append(new InlineDelimiter(type, from, to, (open ? 1 /* Mark.Open */ : 0 /* Mark.None */) | (close ? 2 /* Mark.Close */ : 0 /* Mark.None */)));
    }
    addElement(elt) {
        return this.append(elt);
    }
    resolveMarkers(from) {
        for (let i = from; i < this.parts.length; i++) {
            let close = this.parts[i];
            if (!(close instanceof InlineDelimiter && close.type.resolve && (close.side & 2 /* Mark.Close */)))
                continue;
            close.to - close.from;
            let open, j = i - 1;
            for (; j >= from; j--) {
                let part = this.parts[j];
                if (part instanceof InlineDelimiter && (part.side & 1 /* Mark.Open */) && part.type == close.type) {
                    open = part;
                    break;
                }
            }
            if (!open)
                continue;
            let type = close.type.resolve, content = [];
            let start = open.from, end = close.to;
            if (open.type.mark)
                content.push(this.elt(open.type.mark, start, open.to));
            for (let k = j + 1; k < i; k++) {
                if (this.parts[k] instanceof Element)
                    content.push(this.parts[k]);
                this.parts[k] = null;
            }
            if (close.type.mark)
                content.push(this.elt(close.type.mark, close.from, end));
            let element = this.elt(type, start, end, content);
            this.parts[j] = null;
            this.parts[i] = element;
        }
        let result = [];
        for (let i = from; i < this.parts.length; i++) {
            let part = this.parts[i];
            if (part instanceof Element)
                result.push(part);
        }
        return result;
    }
    skipSpace(from) { return skipSpace(this.text, from - this.offset) + this.offset; }
    elt(type, from, to, children) {
        if (typeof type == "string")
            return elt(this.parser.getNodeType(type), from, to, children);
        return new TreeElement(type, from);
    }
}
// ============================================================================
// Block Context
// ============================================================================
class BlockContext {
    constructor(parser, input, fragments, ranges) {
        this.parser = parser;
        this.input = input;
        this.ranges = ranges;
        this.line = new Line();
        this.atEnd = false;
        this.reusePlaceholders = new Map;
        this.stoppedAt = null;
        this.rangeI = 0;
        this.to = ranges[ranges.length - 1].to;
        this.lineStart = this.absoluteLineStart = this.absoluteLineEnd = ranges[0].from;
        this.block = CompositeBlock.create(Type.Document, 0, this.lineStart, 0, 0);
        this.stack = [this.block];
        this.fragments = fragments.length ? new FragmentCursor(fragments, input) : null;
        this.readLine();
    }
    get parsedPos() {
        return this.absoluteLineStart;
    }
    advance() {
        if (this.stoppedAt != null && this.absoluteLineStart > this.stoppedAt)
            return this.finish();
        let { line } = this;
        for (;;) {
            for (let markI = 0;;) {
                let next = line.depth < this.stack.length ? this.stack[this.stack.length - 1] : null;
                while (markI < line.markers.length && (!next || line.markers[markI].from < next.end)) {
                    let mark = line.markers[markI++];
                    this.addNode(mark.type, mark.from, mark.to);
                }
                if (!next)
                    break;
                this.finishContext();
            }
            if (line.pos < line.text.length)
                break;
            if (!this.nextLine())
                return this.finish();
        }
        if (this.fragments && this.reuseFragment(line.basePos))
            return null;
        start: for (;;) {
            for (let type of this.parser.blockParsers)
                if (type) {
                    let result = type(this, line);
                    if (result != false) {
                        if (result == true)
                            return null;
                        line.forward();
                        continue start;
                    }
                }
            break;
        }
        let leaf = new LeafBlock(this.lineStart + line.pos, line.text.slice(line.pos));
        for (let parse of this.parser.leafBlockParsers)
            if (parse) {
                let parser = parse(this, leaf);
                if (parser)
                    leaf.parsers.push(parser);
            }
        lines: while (this.nextLine()) {
            if (line.pos == line.text.length)
                break;
            if (line.indent < line.baseIndent + 4) {
                for (let stop of this.parser.endLeafBlock)
                    if (stop(this, line, leaf))
                        break lines;
            }
            for (let parser of leaf.parsers)
                if (parser.nextLine(this, line, leaf))
                    return null;
            leaf.content += "\n" + line.scrub();
            for (let m of line.markers)
                leaf.marks.push(m);
        }
        this.finishLeaf(leaf);
        return null;
    }
    stopAt(pos) {
        if (this.stoppedAt != null && this.stoppedAt < pos)
            throw new RangeError("Can't move stoppedAt forward");
        this.stoppedAt = pos;
    }
    reuseFragment(start) {
        if (!this.fragments.moveTo(this.absoluteLineStart + start, this.absoluteLineStart) ||
            !this.fragments.matches(this.block.hash))
            return false;
        let taken = this.fragments.takeNodes(this);
        if (!taken)
            return false;
        this.absoluteLineStart += taken;
        this.lineStart = toRelative(this.absoluteLineStart, this.ranges);
        this.moveRangeI();
        if (this.absoluteLineStart < this.to) {
            this.lineStart++;
            this.absoluteLineStart++;
            this.readLine();
        }
        else {
            this.atEnd = true;
            this.readLine();
        }
        return true;
    }
    get depth() {
        return this.stack.length;
    }
    parentType(depth = this.depth - 1) {
        return this.parser.nodeSet.types[this.stack[depth].type];
    }
    nextLine() {
        this.lineStart += this.line.text.length;
        if (this.absoluteLineEnd >= this.to) {
            this.absoluteLineStart = this.absoluteLineEnd;
            this.atEnd = true;
            this.readLine();
            return false;
        }
        else {
            this.lineStart++;
            this.absoluteLineStart = this.absoluteLineEnd + 1;
            this.moveRangeI();
            this.readLine();
            return true;
        }
    }
    moveRangeI() {
        while (this.rangeI < this.ranges.length - 1 && this.absoluteLineStart >= this.ranges[this.rangeI].to) {
            this.rangeI++;
            this.absoluteLineStart = Math.max(this.absoluteLineStart, this.ranges[this.rangeI].from);
        }
    }
    scanLine(start) {
        let r = { text: "", end: start };
        if (start >= this.to) {
            r.text = "";
        }
        else {
            r.text = this.lineChunkAt(start);
            r.end += r.text.length;
            if (this.ranges.length > 1) {
                let textOffset = this.absoluteLineStart, rangeI = this.rangeI;
                while (this.ranges[rangeI].to < r.end) {
                    rangeI++;
                    let nextFrom = this.ranges[rangeI].from;
                    let after = this.lineChunkAt(nextFrom);
                    r.end = nextFrom + after.length;
                    r.text = r.text.slice(0, this.ranges[rangeI - 1].to - textOffset) + after;
                    textOffset = r.end - r.text.length;
                }
            }
        }
        return r;
    }
    readLine() {
        let { line } = this, { text, end } = this.scanLine(this.absoluteLineStart);
        this.absoluteLineEnd = end;
        line.reset(text);
        for (; line.depth < this.stack.length; line.depth++) {
            let cx = this.stack[line.depth], handler = this.parser.skipContextMarkup[cx.type];
            if (!handler)
                throw new Error("Unhandled block context " + Type[cx.type]);
            let marks = this.line.markers.length;
            if (!handler(cx, this, line)) {
                if (this.line.markers.length > marks)
                    cx.end = this.line.markers[this.line.markers.length - 1].to;
                line.forward();
                break;
            }
            line.forward();
        }
    }
    lineChunkAt(pos) {
        let next = this.input.chunk(pos), text;
        if (!this.input.lineChunks) {
            let eol = next.indexOf("\n");
            text = eol < 0 ? next : next.slice(0, eol);
        }
        else {
            text = next == "\n" ? "" : next;
        }
        return pos + text.length > this.to ? text.slice(0, this.to - pos) : text;
    }
    prevLineEnd() { return this.atEnd ? this.lineStart : this.lineStart - 1; }
    startContext(type, start, value = 0) {
        this.block = CompositeBlock.create(type, value, this.lineStart + start, this.block.hash, this.lineStart + this.line.text.length);
        this.stack.push(this.block);
    }
    startComposite(type, start, value = 0) {
        this.startContext(this.parser.getNodeType(type), start, value);
    }
    addNode(block, from, to) {
        if (typeof block == "number")
            block = new common.Tree(this.parser.nodeSet.types[block], none, none, (to ?? this.prevLineEnd()) - from);
        this.block.addChild(block, from - this.block.from);
    }
    addElement(elt) {
        this.block.addChild(elt.toTree(this.parser.nodeSet), elt.from - this.block.from);
    }
    addLeafElement(leaf, elt) {
        this.addNode(this.buffer
            .writeElements(injectMarks(elt.children, leaf.marks), -elt.from)
            .finish(elt.type, elt.to - elt.from), elt.from);
    }
    finishContext() {
        let cx = this.stack.pop();
        let top = this.stack[this.stack.length - 1];
        top.addChild(cx.toTree(this.parser.nodeSet), cx.from - top.from);
        this.block = top;
    }
    finish() {
        while (this.stack.length > 1)
            this.finishContext();
        return this.addGaps(this.block.toTree(this.parser.nodeSet, this.lineStart));
    }
    addGaps(tree) {
        return this.ranges.length > 1 ?
            injectGaps(this.ranges, 0, tree.topNode, this.ranges[0].from, this.reusePlaceholders) : tree;
    }
    finishLeaf(leaf) {
        for (let parser of leaf.parsers)
            if (parser.finish(this, leaf))
                return;
        let inline = injectMarks(this.parser.parseInline(leaf.content, leaf.start), leaf.marks);
        this.addNode(this.buffer
            .writeElements(inline, -leaf.start)
            .finish(Type.Paragraph, leaf.content.length), leaf.start);
    }
    elt(type, from, to, children) {
        if (typeof type == "string")
            return elt(this.parser.getNodeType(type), from, to, children);
        return new TreeElement(type, from);
    }
    get buffer() { return new Buffer(this.parser.nodeSet); }
}
// ============================================================================
// Helper Functions
// ============================================================================
function injectGaps(ranges, rangeI, tree, offset, dummies) {
    let rangeEnd = ranges[rangeI].to;
    let children = [], positions = [], start = tree.from + offset;
    function movePastNext(upto, inclusive) {
        while (inclusive ? upto >= rangeEnd : upto > rangeEnd) {
            let size = ranges[rangeI + 1].from - rangeEnd;
            offset += size;
            upto += size;
            rangeI++;
            rangeEnd = ranges[rangeI].to;
        }
    }
    for (let ch = tree.firstChild; ch; ch = ch.nextSibling) {
        movePastNext(ch.from + offset, true);
        let from = ch.from + offset, node, reuse = dummies.get(ch.tree);
        if (reuse) {
            node = reuse;
        }
        else if (ch.to + offset > rangeEnd) {
            node = injectGaps(ranges, rangeI, ch, offset, dummies);
            movePastNext(ch.to + offset, false);
        }
        else {
            node = ch.toTree();
        }
        children.push(node);
        positions.push(from - start);
    }
    movePastNext(tree.to + offset, false);
    return new common.Tree(tree.type, children, positions, tree.to + offset - start, tree.tree ? tree.tree.propValues : undefined);
}
function toRelative(abs, ranges) {
    let pos = abs;
    for (let i = 1; i < ranges.length; i++) {
        let gapFrom = ranges[i - 1].to, gapTo = ranges[i].from;
        if (gapFrom < abs)
            pos -= gapTo - gapFrom;
    }
    return pos;
}
function injectMarks(elements, marks) {
    if (!marks.length)
        return elements;
    if (!elements.length)
        return marks;
    let elts = elements.slice(), eI = 0;
    for (let mark of marks) {
        while (eI < elts.length && elts[eI].to < mark.to)
            eI++;
        if (eI < elts.length && elts[eI].from < mark.from) {
            let e = elts[eI];
            if (e instanceof Element)
                elts[eI] = new Element(e.type, e.from, e.to, injectMarks(e.children, [mark]));
        }
        else {
            elts.splice(eI++, 0, mark);
        }
    }
    return elts;
}
// ============================================================================
// Fragment Cursor for Incremental Parsing
// ============================================================================
const NotLast = [Type.CodeBlock, Type.ListItem, Type.BulletList, Type.NumberedList];
class FragmentCursor {
    constructor(fragments, input) {
        this.fragments = fragments;
        this.input = input;
        this.i = 0;
        this.fragment = null;
        this.fragmentEnd = -1;
        this.cursor = null;
        if (fragments.length)
            this.fragment = fragments[this.i++];
    }
    nextFragment() {
        this.fragment = this.i < this.fragments.length ? this.fragments[this.i++] : null;
        this.cursor = null;
        this.fragmentEnd = -1;
    }
    moveTo(pos, lineStart) {
        while (this.fragment && this.fragment.to <= pos)
            this.nextFragment();
        if (!this.fragment || this.fragment.from > (pos ? pos - 1 : 0))
            return false;
        if (this.fragmentEnd < 0) {
            let end = this.fragment.to;
            while (end > 0 && this.input.read(end - 1, end) != "\n")
                end--;
            this.fragmentEnd = end ? end - 1 : 0;
        }
        let c = this.cursor;
        if (!c) {
            c = this.cursor = this.fragment.tree.cursor();
            c.firstChild();
        }
        let rPos = pos + this.fragment.offset;
        while (c.to <= rPos)
            if (!c.parent())
                return false;
        for (;;) {
            if (c.from >= rPos)
                return this.fragment.from <= lineStart;
            if (!c.childAfter(rPos))
                return false;
        }
    }
    matches(hash) {
        let tree = this.cursor.tree;
        return tree && tree.prop(common.NodeProp.contextHash) == hash;
    }
    takeNodes(cx) {
        let cur = this.cursor, off = this.fragment.offset, fragEnd = this.fragmentEnd - (this.fragment.openEnd ? 1 : 0);
        let start = cx.absoluteLineStart, end = start, blockI = cx.block.children.length;
        let prevEnd = end, prevI = blockI;
        for (;;) {
            if (cur.to - off > fragEnd) {
                if (cur.type.isAnonymous && cur.firstChild())
                    continue;
                break;
            }
            let pos = toRelative(cur.from - off, cx.ranges);
            if (cur.to - off <= cx.ranges[cx.rangeI].to) {
                cx.addNode(cur.tree, pos);
            }
            else {
                let dummy = new common.Tree(cx.parser.nodeSet.types[Type.Paragraph], [], [], 0, cx.block.hashProp);
                cx.reusePlaceholders.set(dummy, cur.tree);
                cx.addNode(dummy, pos);
            }
            if (cur.type.is("Block")) {
                if (NotLast.indexOf(cur.type.id) < 0) {
                    end = cur.to - off;
                    blockI = cx.block.children.length;
                }
                else {
                    end = prevEnd;
                    blockI = prevI;
                    prevEnd = cur.to - off;
                    prevI = cx.block.children.length;
                }
            }
            if (!cur.nextSibling())
                break;
        }
        while (cx.block.children.length > blockI) {
            cx.block.children.pop();
            cx.block.positions.pop();
        }
        return end - start;
    }
}
// ============================================================================
// Main Parser Class
// ============================================================================
class TiddlyWikiParser extends common.Parser {
    constructor(nodeSet, blockParsers, leafBlockParsers, blockNames, endLeafBlock, skipContextMarkup, inlineParsers, inlineNames, wrappers) {
        super();
        this.nodeSet = nodeSet;
        this.blockParsers = blockParsers;
        this.leafBlockParsers = leafBlockParsers;
        this.blockNames = blockNames;
        this.endLeafBlock = endLeafBlock;
        this.skipContextMarkup = skipContextMarkup;
        this.inlineParsers = inlineParsers;
        this.inlineNames = inlineNames;
        this.wrappers = wrappers;
        this.nodeTypes = Object.create(null);
        for (let t of nodeSet.types)
            this.nodeTypes[t.name] = t.id;
    }
    createParse(input, fragments, ranges) {
        let parse = new BlockContext(this, input, fragments, ranges);
        for (let w of this.wrappers)
            parse = w(parse, input, fragments, ranges);
        return parse;
    }
    configure(spec) {
        let config = resolveConfig(spec);
        if (!config)
            return this;
        let { nodeSet, skipContextMarkup } = this;
        let blockParsers = this.blockParsers.slice(), leafBlockParsers = this.leafBlockParsers.slice(), blockNames = this.blockNames.slice(), inlineParsers = this.inlineParsers.slice(), inlineNames = this.inlineNames.slice(), endLeafBlock = this.endLeafBlock.slice(), wrappers = this.wrappers;
        if (nonEmpty(config.defineNodes)) {
            skipContextMarkup = Object.assign({}, skipContextMarkup);
            let nodeTypes = nodeSet.types.slice(), styles;
            for (let s of config.defineNodes) {
                let { name, block, composite, style } = typeof s == "string" ? { name: s } : s;
                if (nodeTypes.some(t => t.name == name))
                    continue;
                if (composite)
                    skipContextMarkup[nodeTypes.length] =
                        (bl, cx, line) => composite(cx, line, bl.value);
                let id = nodeTypes.length;
                let group = composite ? ["Block", "BlockContext"] : !block ? undefined
                    : id >= Type.Heading1 && id <= Type.Heading6 ? ["Block", "LeafBlock", "Heading"] : ["Block", "LeafBlock"];
                nodeTypes.push(common.NodeType.define({
                    id,
                    name,
                    props: group && [[common.NodeProp.group, group]]
                }));
                if (style) {
                    if (!styles)
                        styles = {};
                    if (Array.isArray(style) || style instanceof highlight.Tag)
                        styles[name] = style;
                    else
                        Object.assign(styles, style);
                }
            }
            nodeSet = new common.NodeSet(nodeTypes);
            if (styles)
                nodeSet = nodeSet.extend(highlight.styleTags(styles));
        }
        if (nonEmpty(config.props))
            nodeSet = nodeSet.extend(...config.props);
        if (nonEmpty(config.remove)) {
            for (let rm of config.remove) {
                let block = this.blockNames.indexOf(rm), inline = this.inlineNames.indexOf(rm);
                if (block > -1)
                    blockParsers[block] = leafBlockParsers[block] = undefined;
                if (inline > -1)
                    inlineParsers[inline] = undefined;
            }
        }
        if (nonEmpty(config.parseBlock)) {
            for (let spec of config.parseBlock) {
                let found = blockNames.indexOf(spec.name);
                if (found > -1) {
                    blockParsers[found] = spec.parse;
                    leafBlockParsers[found] = spec.leaf;
                }
                else {
                    let pos = spec.before ? findName(blockNames, spec.before)
                        : spec.after ? findName(blockNames, spec.after) + 1 : blockNames.length - 1;
                    blockParsers.splice(pos, 0, spec.parse);
                    leafBlockParsers.splice(pos, 0, spec.leaf);
                    blockNames.splice(pos, 0, spec.name);
                }
                if (spec.endLeaf)
                    endLeafBlock.push(spec.endLeaf);
            }
        }
        if (nonEmpty(config.parseInline)) {
            for (let spec of config.parseInline) {
                let found = inlineNames.indexOf(spec.name);
                if (found > -1) {
                    inlineParsers[found] = spec.parse;
                }
                else {
                    let pos = spec.before ? findName(inlineNames, spec.before)
                        : spec.after ? findName(inlineNames, spec.after) + 1 : inlineNames.length - 1;
                    inlineParsers.splice(pos, 0, spec.parse);
                    inlineNames.splice(pos, 0, spec.name);
                }
            }
        }
        if (config.wrap)
            wrappers = wrappers.concat(config.wrap);
        return new TiddlyWikiParser(nodeSet, blockParsers, leafBlockParsers, blockNames, endLeafBlock, skipContextMarkup, inlineParsers, inlineNames, wrappers);
    }
    getNodeType(name) {
        let found = this.nodeTypes[name];
        if (found == null)
            throw new RangeError(`Unknown node type '${name}'`);
        return found;
    }
    parseInline(text, offset) {
        let cx = new InlineContext(this, text, offset);
        outer: for (let pos = offset; pos < cx.end;) {
            let next = cx.char(pos);
            for (let token of this.inlineParsers)
                if (token) {
                    let result = token(cx, next, pos);
                    if (result >= 0) {
                        pos = result;
                        continue outer;
                    }
                }
            pos++;
        }
        return cx.resolveMarkers(0);
    }
}
// ============================================================================
// Helper Functions for Configuration
// ============================================================================
function nonEmpty(a) {
    return a != null && a.length > 0;
}
function resolveConfig(spec) {
    if (!Array.isArray(spec))
        return spec;
    if (spec.length == 0)
        return null;
    let conf = resolveConfig(spec[0]);
    if (spec.length == 1)
        return conf;
    let rest = resolveConfig(spec.slice(1));
    if (!rest || !conf)
        return conf || rest;
    let conc = (a, b) => (a || none).concat(b || none);
    let wrapA = conf.wrap, wrapB = rest.wrap;
    return {
        props: conc(conf.props, rest.props),
        defineNodes: conc(conf.defineNodes, rest.defineNodes),
        parseBlock: conc(conf.parseBlock, rest.parseBlock),
        parseInline: conc(conf.parseInline, rest.parseInline),
        remove: conc(conf.remove, rest.remove),
        wrap: !wrapA ? wrapB : !wrapA ? wrapA :
            (inner, input, fragments, ranges) => wrapA(wrapB(inner, input, fragments, ranges), input, fragments, ranges)
    };
}
function findName(names, name) {
    let found = names.indexOf(name);
    if (found < 0)
        throw new RangeError(`Position specified relative to unknown parser ${name}`);
    return found;
}
// ============================================================================
// Node Type Definitions
// ============================================================================
let nodeTypes = [common.NodeType.none];
for (let i = 1, name; name = Type[i]; i++) {
    nodeTypes[i] = common.NodeType.define({
        id: i,
        name,
        props: i >= Type.Escape ? [] : [[common.NodeProp.group, i in DefaultSkipMarkup ? ["Block", "BlockContext"] : ["Block", "LeafBlock"]]],
        top: name == "Document"
    });
}
// ============================================================================
// Syntax Highlighting
// ============================================================================
const tiddlywikiHighlighting = highlight.styleTags({
    "BlockQuote/...": highlight.tags.quote,
    HorizontalRule: highlight.tags.contentSeparator,
    "Heading1/...": highlight.tags.heading1,
    "Heading2/...": highlight.tags.heading2,
    "Heading3/...": highlight.tags.heading3,
    "Heading4/...": highlight.tags.heading4,
    "Heading5/...": highlight.tags.heading5,
    "Heading6/...": highlight.tags.heading6,
    "CommentBlock Comment": highlight.tags.comment,
    Escape: highlight.tags.escape,
    Entity: highlight.tags.character,
    "Bold/...": highlight.tags.strong,
    "Italic/...": highlight.tags.emphasis,
    "Underline/...": highlight.tags.special(highlight.tags.emphasis),
    "Strikethrough/...": highlight.tags.strikethrough,
    "Superscript/...": highlight.tags.special(highlight.tags.content),
    "Subscript/...": highlight.tags.special(highlight.tags.content),
    "Highlight/...": highlight.tags.special(highlight.tags.content),
    "WikiLink/... ExternalLink/... ImageLink/...": highlight.tags.link,
    "Transclusion/... FilteredTransclusion/...": highlight.tags.special(highlight.tags.link),
    "MacroCall/...": highlight.tags.macroName,
    "Widget/...": highlight.tags.tagName,
    Variable: highlight.tags.variableName,
    "BulletList/... NumberedList/... DefinitionList/...": highlight.tags.list,
    "InlineCode CodeText": highlight.tags.monospace,
    "FencedCode/... CodeBlock/... TypedBlock/...": highlight.tags.monospace,
    "URL LinkTarget": highlight.tags.url,
    "HeadingMark QuoteMark ListMark LinkMark EmphasisMark CodeMark PragmaMark TypedBlockMark TableDelimiter": highlight.tags.processingInstruction,
    "CodeInfo TypedBlockInfo PragmaName MacroName WidgetName": highlight.tags.labelName,
    "LinkText": highlight.tags.string,
    "FilterExpression": highlight.tags.special(highlight.tags.string),
    "MacroParams PragmaParams WidgetAttr": highlight.tags.attributeValue,
    Paragraph: highlight.tags.content,
    "Table/...": highlight.tags.content,
    "TableHeader/...": highlight.tags.heading,
    "MacroDefinition/... ProcedureDefinition/... FunctionDefinition/... WidgetDefinition/...": highlight.tags.definitionKeyword,
    "RulesPragma ImportPragma ParametersPragma WhitespacePragma": highlight.tags.keyword,
    HTMLBlock: highlight.tags.content,
    HTMLTag: highlight.tags.tagName
});
// ============================================================================
// Default Parser Export
// ============================================================================
const parser = new TiddlyWikiParser(new common.NodeSet(nodeTypes).extend(tiddlywikiHighlighting), Object.keys(DefaultBlockParsers).map(n => DefaultBlockParsers[n]), Object.keys(DefaultBlockParsers).map(n => DefaultLeafBlocks[n]), Object.keys(DefaultBlockParsers), DefaultEndLeaf, DefaultSkipMarkup, Object.keys(DefaultInline).map(n => DefaultInline[n]), Object.keys(DefaultInline), []);

/**
 * @lezer/tiddlywiki - Extensions
 *
 * Zusätzliche Parser-Erweiterungen für TiddlyWiki5 Syntax.
 */
/// Extension for inline and display math using $ and $$ delimiters
const MathExtension = {
    defineNodes: [
        { name: "Math", style: highlight.tags.special(highlight.tags.string) },
        { name: "DisplayMath", block: true, style: highlight.tags.special(highlight.tags.string) },
        { name: "MathMark", style: highlight.tags.processingInstruction }
    ],
    parseInline: [{
            name: "Math",
            parse(cx, next, pos) {
                if (next != 36 /* '$' */)
                    return -1;
                // Check for display math $$...$$
                if (cx.char(pos + 1) == 36) {
                    let end = pos + 2;
                    while (end < cx.end) {
                        if (cx.char(end) == 36 && cx.char(end + 1) == 36) {
                            return cx.addElement(cx.elt("DisplayMath", pos, end + 2, [
                                cx.elt("MathMark", pos, pos + 2),
                                cx.elt("MathMark", end, end + 2)
                            ]));
                        }
                        end++;
                    }
                    return -1;
                }
                // Inline math $...$
                let end = pos + 1;
                while (end < cx.end) {
                    if (cx.char(end) == 36 && cx.char(end - 1) != 92 /* not escaped */) {
                        return cx.addElement(cx.elt("Math", pos, end + 1, [
                            cx.elt("MathMark", pos, pos + 1),
                            cx.elt("MathMark", end, end + 1)
                        ]));
                    }
                    end++;
                }
                return -1;
            }
        }]
};
// ============================================================================
// Wikitext Comment Extension
// ============================================================================
/// Extension for HTML-style comments <!-- -->
const CommentExtension = {
    defineNodes: [
        { name: "Comment", style: highlight.tags.comment },
        { name: "CommentBlock", block: true, style: highlight.tags.comment }
    ],
    parseInline: [{
            name: "Comment",
            parse(cx, next, pos) {
                if (next != 60 /* '<' */)
                    return -1;
                if (cx.slice(pos, pos + 4) !== "<!--")
                    return -1;
                let end = pos + 4;
                while (end < cx.end) {
                    if (cx.slice(end, end + 3) === "-->") {
                        return cx.addElement(cx.elt("Comment", pos, end + 3));
                    }
                    end++;
                }
                return -1;
            }
        }],
    parseBlock: [{
            name: "CommentBlock",
            parse(cx, line) {
                if (!line.text.slice(line.pos).startsWith("<!--"))
                    return false;
                let from = cx.lineStart + line.pos;
                let content = line.text.slice(line.pos);
                // Check if comment ends on same line
                let endIdx = content.indexOf("-->", 4);
                if (endIdx >= 0) {
                    cx.addNode(cx.elt("CommentBlock", from, from + endIdx + 3).toTree(cx.parser.nodeSet), from);
                    cx.nextLine();
                    return true;
                }
                // Multi-line comment
                while (cx.nextLine()) {
                    let closeIdx = line.text.indexOf("-->");
                    if (closeIdx >= 0) {
                        cx.addNode(cx.elt("CommentBlock", from, cx.lineStart + closeIdx + 3).toTree(cx.parser.nodeSet), from);
                        cx.nextLine();
                        return true;
                    }
                }
                // Unclosed comment
                cx.addNode(cx.elt("CommentBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from);
                return true;
            }
        }]
};
// ============================================================================
// Raw/Verbatim Block Extension
// ============================================================================
/// Extension for raw content blocks using <nowiki>...</nowiki> or """"
const RawExtension = {
    defineNodes: [
        { name: "RawBlock", block: true, style: highlight.tags.monospace },
        { name: "RawInline", style: highlight.tags.monospace },
        { name: "RawMark", style: highlight.tags.processingInstruction }
    ],
    parseInline: [{
            name: "RawInline",
            parse(cx, next, pos) {
                // Check for "" (double quote literal)
                if (next == 34 /* '"' */ && cx.char(pos + 1) == 34) {
                    let end = pos + 2;
                    while (end < cx.end) {
                        if (cx.char(end) == 34 && cx.char(end + 1) == 34) {
                            return cx.addElement(cx.elt("RawInline", pos, end + 2, [
                                cx.elt("RawMark", pos, pos + 2),
                                cx.elt("RawMark", end, end + 2)
                            ]));
                        }
                        end++;
                    }
                }
                return -1;
            }
        }],
    parseBlock: [{
            name: "RawBlock",
            parse(cx, line) {
                // Multi-line raw block with """"
                if (!line.text.slice(line.pos).startsWith('"""'))
                    return false;
                let from = cx.lineStart + line.pos;
                while (cx.nextLine()) {
                    if (line.text.trim() === '"""') {
                        cx.nextLine();
                        break;
                    }
                }
                cx.addNode(cx.elt("RawBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from);
                return true;
            }
        }]
};
// ============================================================================
// Stylish Block Extension (CSS Classes)
// ============================================================================
/// Extension for styled blocks using @@.class or @@color:value;
const StyleExtension = {
    defineNodes: [
        { name: "StyledBlock", block: true, style: highlight.tags.content },
        { name: "StyledInline", style: highlight.tags.content },
        { name: "StyleMark", style: highlight.tags.processingInstruction },
        { name: "StyleSpec", style: highlight.tags.attributeValue }
    ],
    parseInline: [{
            name: "StyledInline",
            parse(cx, next, pos) {
                if (next != 64 /* '@' */ || cx.char(pos + 1) != 64)
                    return -1;
                let styleEnd = pos + 2;
                // Skip style spec (class or CSS)
                while (styleEnd < cx.end && cx.char(styleEnd) != 32 && cx.char(styleEnd) != 64)
                    styleEnd++;
                // Find closing @@
                let end = styleEnd;
                while (end < cx.end) {
                    if (cx.char(end) == 64 && cx.char(end + 1) == 64) {
                        return cx.addElement(cx.elt("StyledInline", pos, end + 2, [
                            cx.elt("StyleMark", pos, pos + 2),
                            cx.elt("StyleSpec", pos + 2, styleEnd),
                            cx.elt("StyleMark", end, end + 2)
                        ]));
                    }
                    end++;
                }
                return -1;
            }
        }],
    parseBlock: [{
            name: "StyledBlock",
            parse(cx, line) {
                if (!line.text.slice(line.pos).startsWith("@@"))
                    return false;
                let from = cx.lineStart + line.pos;
                // Check for single-line style
                let restOfLine = line.text.slice(line.pos + 2);
                if (restOfLine.includes("@@")) {
                    cx.nextLine();
                    return true;
                }
                // Multi-line styled block
                while (cx.nextLine()) {
                    if (line.text.trim() === "@@") {
                        cx.nextLine();
                        break;
                    }
                }
                cx.addNode(cx.elt("StyledBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from);
                return true;
            }
        }]
};
// ============================================================================
// Hard Linebreak Extension
// ============================================================================
/// Extension for forced linebreaks (newline characters)
const LineBreakExtension = {
    defineNodes: [
        { name: "LineBreak", style: highlight.tags.processingInstruction }
    ],
    parseInline: [{
            name: "LineBreak",
            parse(cx, next, pos) {
                // TiddlyWiki uses \n or double-space at end of line for hard breaks
                // In inline context, we check for explicit <br> or <br/>
                if (next == 60 /* '<' */) {
                    let tag = cx.slice(pos, Math.min(pos + 5, cx.end)).toLowerCase();
                    if (tag.startsWith("<br>") || tag.startsWith("<br/")) {
                        let end = pos + 4;
                        if (cx.char(end) == 62)
                            end++;
                        return cx.addElement(cx.elt("LineBreak", pos, end));
                    }
                }
                return -1;
            }
        }]
};
// ============================================================================
// Footnote Extension
// ============================================================================
/// Extension for footnotes using ^[text] syntax
const FootnoteExtension = {
    defineNodes: [
        { name: "Footnote", style: highlight.tags.special(highlight.tags.content) },
        { name: "FootnoteMark", style: highlight.tags.processingInstruction }
    ],
    parseInline: [{
            name: "Footnote",
            parse(cx, next, pos) {
                if (next != 94 /* '^' */ || cx.char(pos + 1) != 91 /* '[' */)
                    return -1;
                let depth = 1;
                let end = pos + 2;
                while (end < cx.end && depth > 0) {
                    let ch = cx.char(end);
                    if (ch == 91)
                        depth++;
                    else if (ch == 93)
                        depth--;
                    end++;
                }
                if (depth == 0) {
                    return cx.addElement(cx.elt("Footnote", pos, end, [
                        cx.elt("FootnoteMark", pos, pos + 2),
                        cx.elt("FootnoteMark", end - 1, end)
                    ]));
                }
                return -1;
            }
        }]
};
// ============================================================================
// Image with Attributes Extension
// ============================================================================
/// Extended image syntax [img width=200 [tooltip|url]]
const ExtendedImageExtension = {
    defineNodes: [
        { name: "ExtendedImage", style: highlight.tags.link },
        { name: "ImageAttr", style: highlight.tags.attributeValue }
    ],
    parseInline: [{
            name: "ExtendedImage",
            parse(cx, next, pos) {
                if (next != 91 /* '[' */)
                    return -1;
                if (cx.slice(pos + 1, pos + 5) !== "img ")
                    return -1;
                let end = pos + 5;
                let attrStart = end;
                // Find the inner [
                while (end < cx.end && cx.char(end) != 91)
                    end++;
                if (end >= cx.end)
                    return -1;
                let attrEnd = end;
                end++; // skip [
                // Find closing ]]
                while (end < cx.end) {
                    if (cx.char(end) == 93 && cx.char(end + 1) == 93) {
                        let children = [
                            cx.elt("LinkMark", pos, pos + 5)
                        ];
                        if (attrEnd > attrStart) {
                            children.push(cx.elt("ImageAttr", attrStart, attrEnd));
                        }
                        children.push(cx.elt("LinkMark", end, end + 2));
                        return cx.addElement(cx.elt("ExtendedImage", pos, end + 2, children));
                    }
                    end++;
                }
                return -1;
            },
            before: "ExternalLink"
        }]
};
// ============================================================================
// Conditional/Reveal Widgets shorthand
// ============================================================================
/// Extension for shorthand conditional syntax
const ConditionalExtension = {
    defineNodes: [
        { name: "ConditionalBlock", block: true, style: highlight.tags.keyword },
        { name: "ConditionMark", style: highlight.tags.processingInstruction }
    ],
    parseBlock: [{
            name: "ConditionalBlock",
            parse(cx, line) {
                // Check for <%if condition%> syntax
                if (!line.text.slice(line.pos).startsWith("<%"))
                    return false;
                let from = cx.lineStart + line.pos;
                let depth = 1;
                while (cx.nextLine() && depth > 0) {
                    let text = line.text;
                    if (text.includes("<%endif%>") || text.includes("<%/if%>"))
                        depth--;
                    else if (text.includes("<%if "))
                        depth++;
                }
                cx.addNode(cx.elt("ConditionalBlock", from, cx.prevLineEnd()).toTree(cx.parser.nodeSet), from);
                return true;
            }
        }]
};
// ============================================================================
// Bundle: All TiddlyWiki Extensions
// ============================================================================
/// Bundle containing all TiddlyWiki5 extensions
const TiddlyWikiExtensions = [
    MathExtension,
    CommentExtension,
    RawExtension,
    StyleExtension,
    LineBreakExtension,
    FootnoteExtension,
    ExtendedImageExtension,
    ConditionalExtension
];
// ============================================================================
// Individual Exports
// ============================================================================
/*export {
  MathExtension,
  CommentExtension,
  RawExtension,
  StyleExtension,
  LineBreakExtension,
  FootnoteExtension,
  ExtendedImageExtension,
  ConditionalExtension
}*/

/**
 * @codemirror/lang-tiddlywiki - Language Definition
 *
 * CodeMirror 6 Language Support für TiddlyWiki5 Wikitext.
 *
 * WICHTIG: Diese Datei darf KEINE commands importieren um zirkuläre
 * Abhängigkeiten zu vermeiden. Commands importieren von hier.
 */
// ============================================================================
// Language Facet Configuration
// ============================================================================
const data = language.defineLanguageFacet({
    commentTokens: { block: { open: "<!--", close: "-->" } },
});
const headingProp = new common.NodeProp();
// ============================================================================
// Base Parser Configuration
// ============================================================================
const tiddlywikiBase = parser.configure({
    props: [
        // Folding für verschiedene Block-Typen
        language.foldNodeProp.add(type => {
            if (!type.is("Block") || type.is("Document"))
                return undefined;
            let heading = isHeading(type);
            if (heading != null)
                return undefined; // Headings get special handling
            if (isList(type))
                return undefined;
            // Default folding für andere Blocks
            return (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to });
        }),
        headingProp.add(isHeading),
        language.indentNodeProp.add({
            Document: () => null
        }),
        language.languageDataProp.add({
            Document: data
        })
    ]
});
// ============================================================================
// Helper Functions
// ============================================================================
function isHeading(type) {
    let match = /^Heading(\d)$/.exec(type.name);
    return match ? +match[1] : undefined;
}
function isList(type) {
    return type.name == "BulletList" || type.name == "NumberedList" || type.name == "DefinitionList";
}
function findSectionEnd(headerNode, level) {
    let last = headerNode;
    for (;;) {
        let next = last.nextSibling;
        if (!next)
            break;
        let heading = next.type.prop(headingProp);
        if (heading != null && heading <= level)
            break;
        last = next;
    }
    return last.to;
}
// ============================================================================
// Heading Folding Service
// ============================================================================
const headerIndent = language.foldService.of((state, start, end) => {
    for (let node = language.syntaxTree(state).resolveInner(end, -1); node; node = node.parent) {
        if (node.from < start)
            break;
        let heading = node.type.prop(headingProp);
        if (heading == null)
            continue;
        let upto = findSectionEnd(node, heading);
        if (upto > end)
            return { from: end, to: upto };
    }
    return null;
});
// ============================================================================
// Language Creation
// ============================================================================
function mkLang(parser) {
    return new language.Language(data, parser, [], "tiddlywiki");
}
/// Language support für CommonMark-style TiddlyWiki (Basis-Syntax)
const tiddlywikiBaseLanguage = mkLang(tiddlywikiBase);
// Extended parser mit allen Erweiterungen
const extended = tiddlywikiBase.configure([
    ...TiddlyWikiExtensions,
    {
        props: [
            language.foldNodeProp.add({
                Table: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to }),
                FencedCode: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to }),
                BlockQuote: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to }),
                MacroDefinition: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to }),
                ProcedureDefinition: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to }),
                FunctionDefinition: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to }),
                WidgetDefinition: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to }),
                TypedBlock: (tree, state) => ({ from: state.doc.lineAt(tree.from).to, to: tree.to })
            })
        ]
    }
]);
/// Language support für TiddlyWiki5 mit allen Erweiterungen
const tiddlywikiLanguage = mkLang(extended);

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
        if (this.node.name == "NumberedList") {
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
        else if (node.name == "ListItem" && node.parent?.name == "NumberedList") {
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
        let context = getContext(tree.resolveInner(pos, -1), doc);
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
        else if (prev.name == "NumberedList" || prev.name == "BulletList" || prev.name == "DefinitionList") {
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
 * @codemirror/lang-tiddlywiki - Main Entry Point
 *
 * CodeMirror 6 Language Support für TiddlyWiki5 Wikitext.
 */
// ============================================================================
// Keymap
// ============================================================================
/// Standard-Keymap für TiddlyWiki mit häufig verwendeten Tastenkombinationen
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
// HTML Support ohne Tag-Matching (für eingebettetes HTML)
const htmlNoMatch = langHtml.html({ matchClosingTags: false });
// ============================================================================
// Main Language Support Function
// ============================================================================
/// TiddlyWiki Language Support mit Konfiguration
function tiddlywiki(config = {}) {
    let { codeLanguages, defaultCodeLanguage, addKeymap = true, base: { parser } = tiddlywikiBaseLanguage, completeHTMLTags = true, completeWidgets = true, completeMacros = true, htmlTagLanguage = htmlNoMatch } = config;
    if (!(parser instanceof TiddlyWikiParser)) {
        throw new RangeError("Base parser provided to `tiddlywiki` should be a TiddlyWiki parser");
    }
    let extensions = config.extensions ? [config.extensions] : [];
    let support = [htmlTagLanguage.support, headerIndent];
    if (defaultCodeLanguage instanceof language.LanguageSupport) {
        support.push(defaultCodeLanguage.support);
        defaultCodeLanguage.language;
    }
    // Keymap hinzufügen
    if (addKeymap) {
        support.push(state.Prec.high(view.keymap.of(tiddlywikiKeymap$1)));
    }
    let lang = mkLang(parser.configure(extensions));
    // Autocompletion
    if (completeHTMLTags) {
        support.push(lang.data.of({ autocomplete: htmlTagCompletion }));
    }
    if (completeWidgets) {
        support.push(lang.data.of({ autocomplete: widgetCompletion }));
    }
    if (completeMacros) {
        support.push(lang.data.of({ autocomplete: macroCompletion }));
    }
    return new language.LanguageSupport(lang, support);
}
// ============================================================================
// Autocompletion Functions
// ============================================================================
function htmlTagCompletion(context) {
    let { state, pos } = context;
    let m = /<[:\-\.\w\u00b7-\uffff]*$/.exec(state.sliceDoc(pos - 25, pos));
    if (!m)
        return null;
    let tree = language.syntaxTree(state).resolveInner(pos, -1);
    while (tree && !tree.type.isTop) {
        if (tree.name == "FencedCode" || tree.name == "CodeBlock" ||
            tree.name == "CommentBlock" || tree.name == "Widget") {
            return null;
        }
        tree = tree.parent;
    }
    return {
        from: pos - m[0].length,
        to: pos,
        options: htmlTagCompletions(),
        validFor: /^<[:\-\.\w\u00b7-\uffff]*$/
    };
}
let _tagCompletions = null;
function htmlTagCompletions() {
    if (_tagCompletions)
        return _tagCompletions;
    let result = langHtml.htmlCompletionSource(new autocomplete.CompletionContext(state.EditorState.create({ extensions: htmlNoMatch }), 0, true));
    return _tagCompletions = result ? result.options : [];
}
// TiddlyWiki Core Widgets
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
function widgetCompletion(context) {
    let { state, pos } = context;
    let m = /<\$[\w\-]*$/.exec(state.sliceDoc(pos - 30, pos));
    if (!m)
        return null;
    let tree = language.syntaxTree(state).resolveInner(pos, -1);
    while (tree && !tree.type.isTop) {
        if (tree.name == "FencedCode" || tree.name == "CodeBlock" || tree.name == "CommentBlock") {
            return null;
        }
        tree = tree.parent;
    }
    return {
        from: pos - m[0].length,
        to: pos,
        options: coreWidgets.map(w => ({
            label: "<" + w,
            type: "keyword",
            detail: "widget",
            apply: "<" + w + ">"
        })),
        validFor: /^<\$[\w\-]*$/
    };
}
// Common TiddlyWiki Macros
const commonMacros = [
    "now", "tag", "tabs", "timeline", "toc", "toc-hierarchical", "toc-selective-expandable",
    "list-links", "list-links-draggable", "list-tagged-draggable", "copy-to-clipboard",
    "colour-picker", "image-picker", "keyboard-shortcut", "dumpvariables", "qualify",
    "csvtiddlers", "jsontiddlers", "datauri", "makedatauri", "translink"
];
function macroCompletion(context) {
    let { state, pos } = context;
    let m = /<<[\w\-]*$/.exec(state.sliceDoc(pos - 30, pos));
    if (!m)
        return null;
    let tree = language.syntaxTree(state).resolveInner(pos, -1);
    while (tree && !tree.type.isTop) {
        if (tree.name == "FencedCode" || tree.name == "CodeBlock" || tree.name == "CommentBlock") {
            return null;
        }
        tree = tree.parent;
    }
    return {
        from: pos - m[0].length,
        to: pos,
        options: commonMacros.map(m => ({
            label: "<<" + m,
            type: "function",
            detail: "macro",
            apply: "<<" + m + ">>"
        })),
        validFor: /^<<[\w\-]*$/
    };
}
// ============================================================================
// Paste URL as Link Extension
// ============================================================================
const nonPlainText = /code|horizontalrule|html|link|comment|transclusion|macro|widget|escape|entity|image|mark|url/i;
/// Extension die URLs beim Einfügen automatisch als WikiLinks formatiert
view.EditorView.domEventHandlers({
    paste: (event, view) => {
        let { main } = view.state.selection;
        if (main.empty)
            return false;
        let link = event.clipboardData?.getData("text/plain");
        if (!link || !/^(https?:\/\/|mailto:|xmpp:|www\.)/.test(link))
            return false;
        if (/^www\./.test(link))
            link = "https://" + link;
        if (!tiddlywikiLanguage.isActiveAt(view.state, main.from, 1))
            return false;
        let tree = language.syntaxTree(view.state);
        let crossesNode = false;
        tree.iterate({
            from: main.from,
            to: main.to,
            enter: node => { if (node.from > main.from || nonPlainText.test(node.name))
                crossesNode = true; },
            leave: node => { if (node.to < main.to)
                crossesNode = true; }
        });
        if (crossesNode)
            return false;
        // TiddlyWiki external link format
        let text = view.state.doc.sliceString(main.from, main.to);
        view.dispatch({
            changes: [{ from: main.from, to: main.to, insert: `[ext[${text}|${link}]]` }],
            userEvent: "input.paste",
            scrollIntoView: true
        });
        return true;
    }
});

/**
 * TiddlyWiki5 CodeMirror 6 Plugin Entry Point
 *
 * This module exports the plugin interface expected by the CM6 engine.
 * It provides TiddlyWiki5 syntax highlighting and language support.
 *
 * module-type: codemirror6-plugin
 */
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
const tiddlywikiKeymap = view.keymap.of([
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
]);
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
 * Build language support with options from context
 */
function buildLanguageSupport(context) {
    const options = context.options || {};
    return tiddlywiki({
        addKeymap: false, // We add our own keymap separately
        completeHTMLTags: options.completeHTMLTags !== false,
        completeWidgets: options.completeWidgets !== false,
        completeMacros: options.completeMacros !== false
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
