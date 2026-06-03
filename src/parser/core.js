/**
 * TiddlyWiki Parser - Core Classes
 *
 * Following the Lezer Markdown architecture with adaptations for TiddlyWiki.
 */
import { Tree, NodeType, NodeProp } from "@lezer/common";
// Character codes for common characters
export var Ch;
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
export function space(ch) {
    return ch === Ch.Space || ch === Ch.Tab;
}
/**
 * Check if a character code represents a line ending
 */
export function lineEnd(ch) {
    return ch === Ch.Newline || ch === Ch.CarriageReturn;
}
/**
 * Punctuation characters for flanking rules
 */
export const Punctuation = /[!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~\xA1\u2010-\u2027]/;
/**
 * Element represents a node in the parse tree
 */
export class Element {
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
export function elt(type, from, to, children) {
    return new Element(type, from, to, children);
}
/**
 * Represents a line of text being parsed
 */
export class Line {
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
        /** Position of first non-whitespace character */
        this.skipPos = 0;
        /** Character code at first non-whitespace position, or -1 if all whitespace */
        this.skipNext = -1;
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
        // Find first non-whitespace position
        this.skipPos = this.skipSpace(0);
        this.skipNext = this.skipPos < text.length ? text.charCodeAt(this.skipPos) : -1;
    }
    /**
     * Get text starting from first non-whitespace character
     */
    get textAfterIndent() {
        return this.text.slice(this.skipPos);
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
export class CompositeBlock {
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
        if (child.prop(NodeProp.contextHash) !== this.hash)
            child = new Tree(child.type, child.children, child.positions, child.length, [[NodeProp.contextHash, this.hash]]);
        this.children.push(child);
        this.positions.push(pos);
    }
    toTree(nodeSet, end = this.end) {
        const last = this.children.length - 1;
        if (last >= 0)
            end = Math.max(end, this.positions[last] + this.children[last].length + this.from);
        return new Tree(nodeSet.types[this.type], this.children, this.positions, end - this.from).balance({
            makeTree: (children, positions, length) => new Tree(NodeType.none, children, positions, length, [[NodeProp.contextHash, this.hash]])
        });
    }
}
/**
 * Represents a leaf block (paragraph, heading, code block, etc.)
 */
export class LeafBlock {
    constructor(start, content) {
        this.start = start;
        this.content = content;
        /** Block markers within this leaf */
        this.marks = [];
        /** Parsers attempting to handle this leaf */
        this.parsers = [];
    }
}
/**
 * Inline delimiter for emphasis-style markers
 */
export class InlineDelimiter {
    constructor(type, from, to, side // 1 = open, 2 = close, 3 = both
    ) {
        this.type = type;
        this.from = from;
        this.to = to;
        this.side = side;
    }
}
//# sourceMappingURL=core.js.map