/**
 * TiddlyWiki Parser - Block Parsers
 *
 * Block-level parsing rules following the Lezer Markdown architecture.
 */
import { Type } from "./types";
import { elt, Ch } from "./core";
import { parseTransclusionTarget, parseMacroParams, createAttributeNameElement, parseFilterExpressionDetailed, skipBracedBlock } from "./utils";
// ============================================================================
// Heading Parser (! to !!!!!!)
// ============================================================================
function isHeading(line) {
    // Use skipNext to allow leading whitespace
    if (line.skipNext !== Ch.Exclamation)
        return -1;
    let level = 1;
    let pos = line.skipPos + 1;
    while (pos < line.text.length && line.text.charCodeAt(pos) === Ch.Exclamation && level < 6) {
        level++;
        pos++;
    }
    return level;
}
export const Heading = {
    name: "Heading",
    parse(cx, line) {
        const level = isHeading(line);
        if (level < 0)
            return false;
        const start = cx.lineStart;
        const markStart = start + line.skipPos; // Account for leading whitespace
        const markEnd = markStart + level;
        const textStart = markEnd;
        // Parse inline content after the !
        const contentText = line.text.slice(line.skipPos + level);
        const inlineElements = cx.parser.parseInline(contentText, textStart);
        // Determine heading type based on level
        const headingType = [Type.Heading1, Type.Heading2, Type.Heading3, Type.Heading4, Type.Heading5, Type.Heading6][level - 1];
        const children = [
            elt(Type.HeadingMark, markStart, markEnd),
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
export const HorizontalRule = {
    name: "HorizontalRule",
    parse(cx, line) {
        // Use textAfterIndent to allow leading whitespace
        if (!hrRe.test(line.textAfterIndent))
            return false;
        cx.addElement(elt(Type.HorizontalRule, cx.lineStart, cx.lineStart + line.text.length));
        return true;
    }
};
// ============================================================================
// Fenced Code Block (```)
// ============================================================================
const codeStartRe = /^```(\S*)/;
const codeEndRe = /^```\s*$/;
export const FencedCode = {
    name: "FencedCode",
    parse(cx, line) {
        // Use textAfterIndent to allow leading whitespace
        const match = codeStartRe.exec(line.textAfterIndent);
        if (!match)
            return false;
        const start = cx.lineStart;
        const markStart = start + line.skipPos; // Account for leading whitespace
        const lang = match[1];
        const children = [
            elt(Type.CodeMark, markStart, markStart + 3)
        ];
        if (lang) {
            children.push(elt(Type.CodeInfo, markStart + 3, markStart + 3 + lang.length));
        }
        // Find closing ```
        let codeContent = "";
        let codeStart = cx.lineStart + line.text.length + 1;
        let foundEnd = false;
        while (cx.nextLine()) {
            // Closing ``` can also have leading whitespace
            if (codeEndRe.test(cx.line.textAfterIndent)) {
                children.push(elt(Type.CodeText, codeStart, cx.prevLineEnd()));
                const closeMarkStart = cx.lineStart + cx.line.skipPos;
                children.push(elt(Type.CodeMark, closeMarkStart, closeMarkStart + 3));
                foundEnd = true;
                break;
            }
            if (codeContent)
                codeContent += "\n";
            codeContent += cx.line.text;
        }
        if (!foundEnd) {
            // Unclosed code block - include all remaining content as code
            const codeEnd = cx.prevLineEnd();
            if (codeEnd > codeStart) {
                children.push(elt(Type.CodeText, codeStart, codeEnd));
            }
        }
        const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.prevLineEnd();
        cx.addElement(elt(Type.FencedCode, start, end, children));
        return true;
    }
};
// ============================================================================
// Typed Block ($$$)
// ============================================================================
const typedStartRe = /^\$\$\$([\w\/\-\.\+]*)$/;
const typedEndRe = /^\$\$\$\s*$/;
export const TypedBlock = {
    name: "TypedBlock",
    parse(cx, line) {
        // Use textAfterIndent to allow leading whitespace
        const match = typedStartRe.exec(line.textAfterIndent);
        if (!match)
            return false;
        const start = cx.lineStart;
        const markStart = start + line.skipPos; // Account for leading whitespace
        const typeName = match[1];
        const children = [
            elt(Type.TypedBlockMark, markStart, markStart + 3)
        ];
        if (typeName) {
            children.push(elt(Type.TypedBlockType, markStart + 3, markStart + 3 + typeName.length));
        }
        // Use PlainText for text/plain, CodeText for everything else
        const contentType = typeName === "text/plain" ? Type.PlainText : Type.CodeText;
        // Find closing $$$
        let contentStart = cx.lineStart + line.text.length + 1;
        let foundEnd = false;
        while (cx.nextLine()) {
            // Closing $$$ can also have leading whitespace
            if (typedEndRe.test(cx.line.textAfterIndent)) {
                children.push(elt(contentType, contentStart, cx.prevLineEnd()));
                const closeMarkStart = cx.lineStart + cx.line.skipPos;
                children.push(elt(Type.TypedBlockMark, closeMarkStart, closeMarkStart + 3));
                foundEnd = true;
                break;
            }
        }
        if (!foundEnd) {
            // Unclosed typed block - include all remaining content
            const contentEnd = cx.prevLineEnd();
            if (contentEnd > contentStart) {
                children.push(elt(contentType, contentStart, contentEnd));
            }
        }
        const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.prevLineEnd();
        cx.addElement(elt(Type.TypedBlock, start, end, children));
        return true;
    }
};
// ============================================================================
// Hard Line Breaks Block (""" ... """)
// ============================================================================
const hardLineBreaksRe = /^"""\s*$/;
export const HardLineBreaks = {
    name: "HardLineBreaks",
    parse(cx, line) {
        // Use textAfterIndent to allow leading whitespace
        if (!hardLineBreaksRe.test(line.textAfterIndent))
            return false;
        const start = cx.lineStart;
        const markStart = start + line.skipPos; // Account for leading whitespace
        const children = [
            elt(Type.HardLineBreaksMark, markStart, markStart + 3)
        ];
        // Find closing """
        let contentStart = cx.lineStart + line.text.length + 1;
        let foundEnd = false;
        while (cx.nextLine()) {
            // Closing """ can also have leading whitespace
            if (hardLineBreaksRe.test(cx.line.textAfterIndent)) {
                // Parse content between opening and closing """ as inline content
                if (cx.lineStart - 1 > contentStart) {
                    const contentText = cx.input.read(contentStart, cx.lineStart - 1);
                    const inlineElements = cx.parser.parseInline(contentText, contentStart);
                    children.push(...inlineElements);
                }
                const closeMarkStart = cx.lineStart + cx.line.skipPos;
                children.push(elt(Type.HardLineBreaksMark, closeMarkStart, closeMarkStart + 3));
                foundEnd = true;
                break;
            }
        }
        if (!foundEnd) {
            // Parse content even if unclosed
            if (cx.lineStart > contentStart) {
                const contentText = cx.input.read(contentStart, cx.lineStart);
                const inlineElements = cx.parser.parseInline(contentText, contentStart);
                children.push(...inlineElements);
            }
        }
        const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.lineStart;
        cx.addElement(elt(Type.HardLineBreaks, start, end, children));
        return true;
    }
};
// ============================================================================
// KaTeX/LaTeX Math Block ($$ ... $$)
// ============================================================================
// Match $$ at line start (not $$$)
const katexStartRe = /^\$\$(?!\$)/;
const katexEndRe = /\$\$\s*$/;
export const KaTeXBlock = {
    name: "KaTeXBlock",
    after: "TypedBlock", // Must come after TypedBlock to not match $$$
    parse(cx, line) {
        if (!katexStartRe.test(line.text))
            return false;
        const start = cx.lineStart;
        const children = [
            elt(Type.KaTeXMark, start, start + 2)
        ];
        // Check if content on same line after opening $$
        const openingContent = line.text.slice(2);
        // Check if closing $$ is on the same line (inline display math)
        const sameLineEnd = openingContent.match(/^(.*)\$\$\s*$/);
        if (sameLineEnd) {
            // Single-line display math: $$ content $$
            const content = sameLineEnd[1];
            if (content.length > 0) {
                children.push(elt(Type.LaTeXContent, start + 2, start + 2 + content.length));
            }
            children.push(elt(Type.KaTeXMark, start + 2 + content.length, start + 2 + content.length + 2));
            cx.addElement(elt(Type.KaTeXBlock, start, start + line.text.length, children));
            return true;
        }
        // Multi-line: find closing $$
        let contentStart = start + 2;
        // If there's content after opening $$, it's part of the LaTeX
        if (openingContent.trim()) {
            contentStart = start + 2;
        }
        else {
            contentStart = cx.lineStart + line.text.length + 1;
        }
        let foundEnd = false;
        while (cx.nextLine()) {
            const endMatch = katexEndRe.exec(cx.line.text);
            if (endMatch) {
                // Check if the $$ is at the start or there's content before it
                const dollarPos = cx.line.text.lastIndexOf("$$");
                const contentEnd = cx.lineStart + dollarPos;
                if (contentEnd > contentStart) {
                    children.push(elt(Type.LaTeXContent, contentStart, contentEnd));
                }
                children.push(elt(Type.KaTeXMark, cx.lineStart + dollarPos, cx.lineStart + dollarPos + 2));
                foundEnd = true;
                break;
            }
        }
        if (!foundEnd) {
            // Unclosed block - include all remaining content as LaTeX
            const contentEnd = cx.prevLineEnd();
            if (contentEnd > contentStart) {
                children.push(elt(Type.LaTeXContent, contentStart, contentEnd));
            }
        }
        const end = foundEnd ? cx.lineStart + cx.line.text.length : cx.prevLineEnd();
        cx.addElement(elt(Type.KaTeXBlock, start, end, children));
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
// Helper to find first non-whitespace position in text
function findSkipPos(text) {
    let pos = 0;
    while (pos < text.length && (text.charCodeAt(pos) === Ch.Space || text.charCodeAt(pos) === Ch.Tab)) {
        pos++;
    }
    return pos;
}
export const List = {
    name: "List",
    parse(cx, line) {
        // Use textAfterIndent to allow leading whitespace
        const match = listMarkerRe.exec(line.textAfterIndent);
        if (!match)
            return false;
        const markers = match[1];
        const firstMarker = markers[0];
        const listInfo = listTypeMap[firstMarker];
        if (!listInfo)
            return false;
        // Check if this is actually a widget/tag closing bracket followed by another tag
        // Pattern like "><$widget" or "></div>" should NOT be parsed as a block quote
        // The > is the closing bracket of a multi-line opening tag
        if (firstMarker === '>' && /<[$a-zA-Z\/]/.test(line.textAfterIndent.slice(markers.length))) {
            return false;
        }
        const start = cx.lineStart;
        const items = [];
        // Parse list items
        while (true) {
            // Use textAfterIndent to allow leading whitespace
            const itemMatch = listMarkerRe.exec(cx.line.textAfterIndent);
            if (!itemMatch || !isCompatibleMarker(firstMarker, itemMatch[1][0]))
                break;
            const itemMarkers = itemMatch[1];
            const itemStart = cx.lineStart;
            const markerStart = itemStart + cx.line.skipPos; // Account for leading whitespace
            const markerEnd = markerStart + itemMarkers.length;
            // Parse inline content
            const contentText = cx.line.text.slice(cx.line.skipPos + itemMarkers.length);
            const inlineElements = cx.parser.parseInline(contentText, markerEnd);
            const itemChildren = [
                elt(Type.ListMark, markerStart, markerEnd),
                ...inlineElements
            ];
            const itemType = listTypeMap[itemMarkers[itemMarkers.length - 1]]?.item || Type.ListItem;
            items.push(elt(itemType, itemStart, itemStart + cx.line.text.length, itemChildren));
            // Peek at next line before advancing - don't consume non-list lines
            const nextText = cx.peekLine();
            if (nextText === null)
                break;
            // Check if next line (after leading whitespace) has compatible list marker
            const nextSkipPos = findSkipPos(nextText);
            const nextTextAfterIndent = nextText.slice(nextSkipPos);
            const nextMatch = listMarkerRe.exec(nextTextAfterIndent);
            if (!nextMatch || !isCompatibleMarker(firstMarker, nextMatch[1][0]))
                break;
            // Next line continues the list, so advance to it
            cx.nextLine();
        }
        // cx.line is at the last list item (not advanced past it)
        cx.addElement(elt(listInfo.list, start, cx.lineStart + cx.line.text.length, items));
        return true;
    }
};
// ============================================================================
// Multi-line Block Quote (<<<...<<<)
// ============================================================================
// Opening: <<< (optionally with class)
const blockQuoteOpenRe = /^<<<(.*)$/;
// Closing: <<< (optionally with citation)
const blockQuoteCloseRe = /^<<<(.*)$/;
export const MultiLineBlockQuote = {
    name: "MultiLineBlockQuote",
    parse(cx, line) {
        // Use textAfterIndent to allow leading whitespace
        const openMatch = blockQuoteOpenRe.exec(line.textAfterIndent);
        if (!openMatch)
            return false;
        // Check it's actually <<< at start (not <<<<)
        if (!line.textAfterIndent.startsWith("<<<") || line.textAfterIndent.startsWith("<<<<"))
            return false;
        const start = cx.lineStart;
        const openingMarkStart = start + line.skipPos; // Account for leading whitespace
        const openingMarkEnd = openingMarkStart + 3; // Length of "<<<"
        const classText = openMatch[1].trim();
        const children = [
            elt(Type.QuoteMark, openingMarkStart, openingMarkEnd)
        ];
        // Parse class/style info after opening <<<
        if (classText) {
            const rawClassText = openMatch[1];
            const leadingSpaces = rawClassText.length - rawClassText.trimStart().length;
            const classStart = openingMarkEnd + leadingSpaces;
            children.push(elt(Type.BlockQuoteClass, classStart, classStart + classText.length));
        }
        // Find the closing <<<
        const contentStart = start + line.text.length + 1; // After opening line + newline
        let contentEnd = contentStart;
        let closingMarkStart = -1;
        let closingEnd = -1;
        let citation = "";
        let closingLineText = "";
        while (cx.nextLine()) {
            // Closing <<< can also have leading whitespace
            const lineTextAfterIndent = cx.line.textAfterIndent;
            // Check for closing <<<
            if (lineTextAfterIndent.startsWith("<<<") && !lineTextAfterIndent.startsWith("<<<<")) {
                closingMarkStart = cx.lineStart + cx.line.skipPos;
                closingEnd = cx.lineStart + cx.line.text.length;
                contentEnd = cx.lineStart - 1; // Before closing line (exclude newline)
                closingLineText = lineTextAfterIndent;
                citation = lineTextAfterIndent.slice(3).trim();
                break;
            }
        }
        // Parse content between opening and closing <<< recursively
        if (contentEnd > contentStart) {
            const contentElements = cx.parseContentRange(contentStart, contentEnd, false);
            children.push(...contentElements);
        }
        // Add closing mark
        if (closingMarkStart >= 0) {
            children.push(elt(Type.QuoteMark, closingMarkStart, closingMarkStart + 3));
            // If there's a citation, parse it as inline content
            if (citation) {
                const rawCitation = closingLineText.slice(3);
                const leadingSpaces = rawCitation.length - rawCitation.trimStart().length;
                const citationStart = closingMarkStart + 3 + leadingSpaces;
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
export const Table = {
    name: "Table",
    parse(cx, line) {
        // Tables must start at column 0 - no leading whitespace allowed
        if (!tableRowRe.test(line.text))
            return false;
        const start = cx.lineStart;
        const rows = [];
        while (true) {
            const match = tableRowRe.exec(cx.line.text);
            if (!match)
                break;
            const rowStart = cx.lineStart;
            const marker = match[1]; // c, k, h, f, or undefined
            const rowType = marker ? tableRowTypeMap[marker] : Type.TableRow;
            const cells = parseTableRow(cx.line.text, rowStart, cx, marker);
            rows.push(elt(rowType, rowStart, rowStart + cx.line.text.length, cells));
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
                const rawCellText = text.slice(cellStart, pos);
                const leadingSpaces = rawCellText.length - rawCellText.trimStart().length;
                const cellText = rawCellText.trim();
                const isHeader = cellText.startsWith("!");
                const cellType = isHeader ? Type.TableHeaderCell : Type.TableCell;
                // Parse inline content - account for leading whitespace from trim
                const contentStart = cellStart + leadingSpaces + (isHeader ? 1 : 0);
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
const htmlCommentEndRe = /-->/;
export const CommentBlock = {
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
// parseTransclusionTarget is now imported from utils.ts
export const TransclusionBlock = {
    name: "TransclusionBlock",
    parse(cx, line) {
        const match = transclusionBlockRe.exec(line.text);
        if (!match)
            return false;
        const start = cx.lineStart;
        const target = match[1];
        const template = match[2];
        const params = match[3];
        const children = [
            elt(Type.TransclusionMark, start, start + 2),
        ];
        // Parse target details (tiddler!!field or tiddler##index)
        const targetChildren = parseTransclusionTarget(target, start + 2);
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
export const FilteredTransclusionBlock = {
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
        const filterChildren = parseFilterExpressionDetailed(filter, start + 3);
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
// parseMacroParams is imported from utils.ts
/** Find ">>" in text starting from `from`, skipping over {{...}} and {{{...}}} blocks. */
function findCloseAngleAngle(text, from) {
    for (let i = from; i < text.length - 1; i++) {
        const afterBraced = skipBracedBlock(text, i);
        if (afterBraced > i) {
            i = afterBraced - 1;
            continue;
        }
        if (text[i] === '>' && text[i + 1] === '>')
            return i;
    }
    return -1;
}
export const MacroCallBlock = {
    name: "MacroCallBlock",
    parse(cx, line) {
        if (!line.text.startsWith("<<"))
            return false;
        const start = cx.lineStart;
        // Parse macro name (stop at whitespace or >)
        let nameEnd = 2;
        while (nameEnd < line.text.length && !/[\s>]/.test(line.text[nameEnd]))
            nameEnd++;
        const name = line.text.slice(2, nameEnd);
        if (!name)
            return false;
        // Find closing >> - could be on same line or subsequent lines
        let closeIdx = findCloseAngleAngle(line.text, 2);
        let allContent = line.text;
        let endPos = cx.lineStart + line.text.length;
        // Check if there's a single > (but not >>) - this means incomplete single-line macro
        // Don't go into multi-line mode if there's any > on the line
        const singleAngleIdx = closeIdx === -1 ? line.text.indexOf(">", nameEnd) : -1;
        const hasIncompleteClose = singleAngleIdx !== -1;
        // Helper to build macro children with name element
        const buildNameElement = (children) => {
            // Check if name is a substituted parameter: __param__ (complete) or __param (incomplete)
            const substitutedMatch = /^__(.+)__$/.exec(name);
            const incompleteSubstitutedMatch = !substitutedMatch && /^__(.*)$/.exec(name);
            if (substitutedMatch) {
                const paramName = substitutedMatch[1];
                const nameStart = start + 2;
                const nameChildren = [
                    elt(Type.SubstitutedParamMark, nameStart, nameStart + 2), // __
                    elt(Type.SubstitutedParamName, nameStart + 2, nameStart + 2 + paramName.length),
                    elt(Type.SubstitutedParamMark, nameStart + 2 + paramName.length, nameStart + name.length), // __
                ];
                children.push(elt(Type.SubstitutedParam, nameStart, nameStart + name.length, nameChildren));
            }
            else if (incompleteSubstitutedMatch) {
                // Handle incomplete pattern like __param or just __
                const paramName = incompleteSubstitutedMatch[1];
                const nameStart = start + 2;
                const nameChildren = [
                    elt(Type.SubstitutedParamMark, nameStart, nameStart + 2), // __
                ];
                if (paramName) {
                    nameChildren.push(elt(Type.SubstitutedParamName, nameStart + 2, nameStart + 2 + paramName.length));
                }
                children.push(elt(Type.SubstitutedParam, nameStart, nameStart + name.length, nameChildren));
            }
            else {
                // Check for $param$ placeholder pattern in macro name
                const placeholderMatch = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/.exec(name);
                if (placeholderMatch) {
                    const paramName = placeholderMatch[1];
                    const nameStart = start + 2;
                    const placeholderChildren = [
                        elt(Type.PlaceholderMark, nameStart, nameStart + 1), // $
                        elt(Type.VariableName, nameStart + 1, nameStart + 1 + paramName.length),
                        elt(Type.PlaceholderMark, nameStart + name.length - 1, nameStart + name.length), // $
                    ];
                    children.push(elt(Type.Placeholder, nameStart, nameStart + name.length, placeholderChildren));
                }
                else {
                    children.push(elt(Type.MacroName, start + 2, start + 2 + name.length));
                }
            }
        };
        // Track trailing content after >> for later parsing
        let trailingContent = "";
        let trailingContentStart = 0;
        // Handle incomplete single-line macro (has > but not >>)
        if (hasIncompleteClose) {
            const children = [
                elt(Type.MacroCallMark, start, start + 2),
            ];
            buildNameElement(children);
            // Parse parameters up to the single >
            const paramsStr = line.text.slice(nameEnd, singleAngleIdx);
            if (paramsStr.trim()) {
                const paramElements = parseMacroParams(paramsStr, start + nameEnd);
                children.push(...paramElements);
            }
            cx.addElement(elt(Type.MacroCallBlock, start, endPos, children));
            return true;
        }
        if (closeIdx === -1) {
            // Multi-line macro: accumulate lines until we find >>
            while (cx.nextLine()) {
                const currentLine = cx.line.text;
                allContent += "\n" + currentLine;
                // Check for >> anywhere in this line (skip braced blocks)
                const closeMatch = findCloseAngleAngle(currentLine, 0);
                if (closeMatch !== -1) {
                    // Found >> - macro ends here
                    closeIdx = allContent.length - (currentLine.length - closeMatch);
                    const macroEndPos = cx.lineStart + closeMatch + 2;
                    endPos = cx.lineStart + currentLine.length;
                    // Check for trailing content after >>
                    const afterClose = currentLine.slice(closeMatch + 2);
                    if (afterClose.trim()) {
                        trailingContent = afterClose;
                        trailingContentStart = macroEndPos;
                    }
                    break;
                }
                endPos = cx.lineStart + currentLine.length;
            }
            // If still no closing >>, this is an incomplete multi-line macro
            if (closeIdx === -1) {
                const children = [
                    elt(Type.MacroCallMark, start, start + 2),
                ];
                buildNameElement(children);
                const paramsStr = allContent.slice(nameEnd);
                if (paramsStr.trim()) {
                    const paramElements = parseMacroParams(paramsStr, start + nameEnd);
                    children.push(...paramElements);
                }
                cx.addElement(elt(Type.MacroCallBlock, start, endPos, children));
                return true;
            }
        }
        else {
            // Single-line macro: check rest of line is empty
            if (line.text.slice(closeIdx + 2).trim())
                return false;
        }
        const children = [
            elt(Type.MacroCallMark, start, start + 2),
        ];
        buildNameElement(children);
        // Parse parameters - everything between name and >>
        const paramsStr = allContent.slice(nameEnd, closeIdx);
        if (paramsStr.trim()) {
            const paramElements = parseMacroParams(paramsStr, start + nameEnd);
            children.push(...paramElements);
        }
        // Calculate position of closing >>
        const closeMarkPos = start + closeIdx;
        children.push(elt(Type.MacroCallMark, closeMarkPos, closeMarkPos + 2));
        // Macro element ends at >> (not end of line if there's trailing content)
        const macroEndPos = trailingContent ? trailingContentStart : endPos;
        cx.addElement(elt(Type.MacroCallBlock, start, macroEndPos, children));
        // If there's trailing content after >>, parse it as a paragraph
        if (trailingContent.trim()) {
            const inlineElements = cx.parser.parseInline(trailingContent, trailingContentStart);
            const paragraphElt = elt(Type.Paragraph, trailingContentStart, trailingContentStart + trailingContent.length, inlineElements);
            cx.addElement(paragraphElt);
        }
        return true;
    }
};
// ============================================================================
// HTML Block and Widget Block
// ============================================================================
// Attribute names that should have their content parsed as wikitext
const WIKITEXT_ATTR_NAMES = new Set([
    'emptymessage',
    'template',
    'caption',
    'tooltip',
    'placeholder',
    'default',
    'alt',
    'description',
    'message',
    'content',
]);
/**
 * Parse $param$ placeholders in a string, returning child elements for highlighting.
 * Returns empty array if no placeholders found.
 * This handles the legacy \define macro placeholder syntax.
 */
function parsePlaceholdersInString(content, offset) {
    const elements = [];
    const placeholderRe = /\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/g;
    let match;
    let lastEnd = 0;
    while ((match = placeholderRe.exec(content)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        const paramName = match[1];
        // Add any text before this placeholder
        if (matchStart > lastEnd) {
            elements.push(elt(Type.AttributeValue, offset + lastEnd, offset + matchStart));
        }
        // Add the placeholder node with proper children
        const placeholderChildren = [
            elt(Type.PlaceholderMark, offset + matchStart, offset + matchStart + 1), // $
            elt(Type.VariableName, offset + matchStart + 1, offset + matchStart + 1 + paramName.length),
            elt(Type.PlaceholderMark, offset + matchEnd - 1, offset + matchEnd) // $
        ];
        elements.push(elt(Type.Placeholder, offset + matchStart, offset + matchEnd, placeholderChildren));
        lastEnd = matchEnd;
    }
    // Add any remaining text after last placeholder
    if (elements.length > 0 && lastEnd < content.length) {
        elements.push(elt(Type.AttributeValue, offset + lastEnd, offset + content.length));
    }
    return elements;
}
/**
 * Parse widget/HTML tag attributes
 * Supports:
 * - name="value" or name='value' (quoted string)
 * - name="""value""" (triple-quoted string with wikitext)
 * - name=value (unquoted, no spaces)
 * - name=@param (parameter reference)
 * - name={{reference}} (indirect/transclusion)
 * - name={{{filter}}} (filtered)
 * - name=<<macro>> (macro call)
 * - name=`substituted` or name=```substituted``` (substituted string)
 * - name (boolean, no value)
 *
 * @param attrString - The attribute string to parse
 * @param offset - The offset in the document
 * @param isWidget - Whether this is a widget (vs HTML tag)
 * @param parseInline - Optional function to parse inline wikitext content
 * @param parseContent - Optional function to parse full wikitext (including pragmas) for triple-quoted values
 */
function parseAttributes(attrString, offset, 
isWidget, parseInline, parseContent) {
    const elements = [];
    let pos = 0;
    const len = attrString.length;
    while (pos < len) {
        // Skip whitespace
        while (pos < len && /\s/.test(attrString[pos]))
            pos++;
        if (pos >= len)
            break;
        // Parse attribute name - TiddlyWiki allows any char except /\s>"'`=
        const nameStart = pos;
        while (pos < len && /[^\/\s>"'`=]/.test(attrString[pos]))
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
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd)
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
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd)
            ];
            elements.push(elt(Type.Attribute, offset + nameStart, offset + pos, attrChildren));
            continue;
        }
        const valueStart = pos;
        let valueEnd = pos;
        let valueType = Type.AttributeValue;
        const ch = attrString[pos];
        if (ch === '"' && attrString.slice(pos, pos + 3) === '"""') {
            // Triple-quoted string: """value""" - parse as full wikitext (including pragmas)
            const openMarkStart = pos;
            pos += 3; // skip opening """
            const stringStart = pos;
            while (pos < len && attrString.slice(pos, pos + 3) !== '"""') {
                pos++;
            }
            const stringEnd = pos;
            const closeMarkStart = pos;
            if (attrString.slice(pos, pos + 3) === '"""')
                pos += 3; // skip closing """
            valueEnd = pos;
            // Parse the content as full wikitext (including pragmas like \procedure, \define, etc.)
            const stringContent = attrString.slice(stringStart, stringEnd);
            let valueChildren = [
                elt(Type.Mark, offset + openMarkStart, offset + stringStart), // Opening """
            ];
            if (stringContent.trim() && (parseContent || parseInline)) {
                // Prefer parseContent for full document parsing (includes pragmas)
                // Fall back to parseInline for inline-only parsing
                const wikitextElements = parseContent
                    ? parseContent(stringContent, offset + stringStart)
                    : parseInline(stringContent, offset + stringStart);
                valueChildren.push(...wikitextElements);
                valueChildren.push(elt(Type.Mark, offset + closeMarkStart, offset + valueEnd)); // Closing """
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    elt(Type.AttributeWikitext, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            }
            else {
                // No parser available - treat as plain string
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    elt(Type.AttributeString, offset + valueStart, offset + valueEnd)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            }
            continue;
        }
        else if (ch === '"' || ch === "'") {
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
            if (attrName === 'filter' || attrName === '$filter' ||
                attrName === '$names' || attrName === '$values') {
                const filterContent = attrString.slice(stringStart, stringEnd);
                const filterChildren = parseFilterExpressionDetailed(filterContent, offset + stringStart);
                const valueChildren = [
                    elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                    elt(Type.FilterExpression, offset + stringStart, offset + stringEnd, filterChildren),
                    elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    elt(Type.AttributeFiltered, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
            // Check if this is a wikitext attribute - parse content as full wikitext (including pragmas)
            if ((parseContent || parseInline) && WIKITEXT_ATTR_NAMES.has(attrName)) {
                const stringContent = attrString.slice(stringStart, stringEnd);
                if (stringContent.trim()) {
                    // Prefer parseContent for full document parsing (includes pragmas)
                    const wikitextElements = parseContent
                        ? parseContent(stringContent, offset + stringStart)
                        : parseInline(stringContent, offset + stringStart);
                    const valueChildren = [
                        elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                        ...wikitextElements,
                        elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                    ];
                    const attrChildren = [
                        createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                        elt(Type.AttributeWikitext, offset + valueStart, offset + valueEnd, valueChildren)
                    ];
                    elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                    continue;
                }
            }
            // Check for $param$ placeholders in regular string attributes
            // This is for \define macro bodies where $param$ can appear anywhere
            const stringContent = attrString.slice(stringStart, stringEnd);
            if (stringContent.includes('$')) {
                const placeholderChildren = parsePlaceholdersInString(stringContent, offset + stringStart);
                if (placeholderChildren.length > 0) {
                    const valueChildren = [
                        elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                        ...placeholderChildren,
                        elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                    ];
                    const attrChildren = [
                        createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                        elt(Type.AttributeString, offset + valueStart, offset + valueEnd, valueChildren)
                    ];
                    elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                    continue;
                }
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
                const filterChildren = parseFilterExpressionDetailed(filterContent, offset + filterStart);
                // Create child elements for filtered transclusion
                const valueChildren = [
                    elt(Type.FilteredTransclusionMark, offset + openMarkStart, offset + openMarkStart + 3),
                    elt(Type.FilterExpression, offset + filterStart, offset + filterEnd, filterChildren),
                    elt(Type.FilteredTransclusionMark, offset + filterEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
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
                const targetChildren = parseTransclusionTarget(targetContent, offset + targetStart);
                // Create child elements for transclusion
                const valueChildren = [
                    elt(Type.TransclusionMark, offset + openMarkStart, offset + openMarkStart + 2),
                    ...targetChildren,
                    elt(Type.TransclusionMark, offset + targetEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
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
            // Parse macro name - TiddlyWiki allows any char except whitespace, >, ", ', =
            while (pos < len && /[^\s>"'=]/.test(attrString[pos]))
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
            const macroName = attrString.slice(macroContentStart, macroNameEnd);
            const valueChildren = [
                elt(Type.MacroCallMark, offset + openMarkStart, offset + openMarkStart + 2),
            ];
            // Check if name is a substituted parameter: __param__
            const attrSubstitutedMatch = /^__(.+)__$/.exec(macroName);
            if (attrSubstitutedMatch) {
                const paramName = attrSubstitutedMatch[1];
                const nameStart = offset + macroContentStart;
                const nameChildren = [
                    elt(Type.SubstitutedParamMark, nameStart, nameStart + 2),
                    elt(Type.SubstitutedParamName, nameStart + 2, nameStart + 2 + paramName.length),
                    elt(Type.SubstitutedParamMark, nameStart + 2 + paramName.length, offset + macroNameEnd),
                ];
                valueChildren.push(elt(Type.SubstitutedParam, nameStart, offset + macroNameEnd, nameChildren));
            }
            else {
                valueChildren.push(elt(Type.MacroName, offset + macroContentStart, offset + macroNameEnd));
            }
            valueChildren.push(elt(Type.MacroCallMark, offset + closeMarkStart, offset + valueEnd));
            const attrChildren = [
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
            ];
            elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            continue;
        }
        else if (ch === '(' && attrString[pos + 1] === '(') {
            // Multi-valued variable: ((varname)) or ((varname||sep))
            const mvvMatch = /^\(\(([^()|]+?)(?:\|\|([^)]*))?\)\)/.exec(attrString.slice(pos));
            if (mvvMatch) {
                const varName = mvvMatch[1];
                const separator = mvvMatch[2];
                const openMarkEnd = pos + 2;
                pos += mvvMatch[0].length;
                valueEnd = pos;
                const valueChildren = [
                    elt(Type.MVVDisplayMark, offset + valueStart, offset + openMarkEnd), // ((
                    elt(Type.VariableName, offset + openMarkEnd, offset + openMarkEnd + varName.length),
                ];
                if (separator !== undefined) {
                    const sepMarkStart = openMarkEnd + varName.length;
                    valueChildren.push(elt(Type.MVVSeparatorMark, offset + sepMarkStart, offset + sepMarkStart + 2)); // ||
                    if (separator.length > 0) {
                        valueChildren.push(elt(Type.MVVSeparatorValue, offset + sepMarkStart + 2, offset + sepMarkStart + 2 + separator.length));
                    }
                }
                valueChildren.push(elt(Type.MVVDisplayMark, offset + valueEnd - 2, offset + valueEnd)); // ))
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    elt(Type.AttributeMVV, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
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
                        const filterChildren = parseFilterExpressionDetailed(filterContent, filterExprStart + (filterMatch[1].length - filterMatch[1].trimStart().length));
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
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
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
            // Check for $param$ placeholder pattern in unquoted value
            const placeholderValueMatch = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/.exec(valueText);
            if (placeholderValueMatch) {
                const paramName = placeholderValueMatch[1];
                const placeholderChildren = [
                    elt(Type.PlaceholderMark, offset + valueStart, offset + valueStart + 1),
                    elt(Type.VariableName, offset + valueStart + 1, offset + valueStart + 1 + paramName.length),
                    elt(Type.PlaceholderMark, offset + valueEnd - 1, offset + valueEnd)
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    elt(Type.Placeholder, offset + valueStart, offset + valueEnd, placeholderChildren)
                ];
                elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
            if (/^-?\d+(\.\d+)?$/.test(valueText)) {
                valueType = Type.AttributeNumber;
            }
            else if (/^@[a-zA-Z][a-zA-Z0-9\-_]*$/.test(valueText)) {
                // Parameter reference: @varname (used in $parameters widget)
                valueType = Type.AttributeParamRef;
            }
            else {
                valueType = Type.AttributeString;
            }
        }
        const attrChildren = [
            createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
            elt(valueType, offset + valueStart, offset + valueEnd)
        ];
        elements.push(elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
    }
    return elements;
}
// Opening tag start: <tagname or <$widget or <$ns.widget (may not have closing >)
const openTagStartRe = /^(\s*)<([a-zA-Z][a-zA-Z0-9\-\.]*|\$[a-zA-Z0-9\-\$\.]*)/;
// Closing tag: </tagname> or </$widget> or </$ns.widget>
const closeTagRe = /^(\s*)<\/([a-zA-Z][a-zA-Z0-9\-\.]*|\$[a-zA-Z0-9\-\$\.]*)>/;
// Placeholder tag pattern: <$name$> where $name$ is a \define placeholder
const placeholderTagBlockRe = /^(\s*)<\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/;
// Placeholder closing tag pattern: </$name$>
const placeholderCloseTagBlockRe = /^(\s*)<\/\$([a-zA-Z][a-zA-Z0-9\-_]*)\$>/;
// Self-closing check
const selfClosingRe = /\/>\s*$/;
export const HTMLBlock = {
    name: "HTMLBlock",
    parse(cx, line) {
        const text = line.text;
        // Check for placeholder tag pattern first: <$param$> (for \define blocks)
        const placeholderOpenMatch = placeholderTagBlockRe.exec(text);
        if (placeholderOpenMatch) {
            const indent = placeholderOpenMatch[1].length;
            const paramName = placeholderOpenMatch[2];
            const start = cx.lineStart;
            const tagStart = start + indent;
            // Build children for the placeholder tag
            const children = [];
            children.push(elt(Type.TagMark, tagStart, tagStart + 1)); // <
            // Create placeholder element for $param$
            const placeholderStart = tagStart + 1;
            const placeholderEnd = placeholderStart + paramName.length + 2; // $param$
            const placeholderChildren = [
                elt(Type.PlaceholderMark, placeholderStart, placeholderStart + 1), // $
                elt(Type.VariableName, placeholderStart + 1, placeholderStart + 1 + paramName.length),
                elt(Type.PlaceholderMark, placeholderEnd - 1, placeholderEnd) // $
            ];
            children.push(elt(Type.Placeholder, placeholderStart, placeholderEnd, placeholderChildren));
            // Look for closing > on this line or subsequent lines
            let afterPlaceholder = text.slice(indent + 1 + paramName.length + 2); // After <$param$
            let attrsStart = placeholderEnd;
            let accumulatedAttrs = afterPlaceholder;
            let tagEndLine = cx.lineStart + text.length;
            // Find closing > (handling quoted strings, etc.)
            const findTagEndInText = (searchText) => {
                let pos = 0;
                while (pos < searchText.length) {
                    const ch = searchText[pos];
                    if (ch === '>')
                        return { pos: pos + 1, selfClose: false };
                    if (ch === '/' && searchText[pos + 1] === '>')
                        return { pos: pos + 2, selfClose: true };
                    if (ch === '"' && searchText.slice(pos, pos + 3) === '"""') {
                        pos += 3;
                        while (pos < searchText.length && searchText.slice(pos, pos + 3) !== '"""')
                            pos++;
                        pos += 3;
                    }
                    else if (ch === '"' || ch === "'") {
                        const quote = ch;
                        pos++;
                        while (pos < searchText.length && searchText[pos] !== quote) {
                            if (searchText[pos] === '\\')
                                pos++;
                            pos++;
                        }
                        pos++;
                    }
                    else if (ch === '<' && searchText[pos + 1] === '<') {
                        pos += 2;
                        let depth = 1;
                        while (pos < searchText.length && depth > 0) {
                            if (searchText[pos] === '<' && searchText[pos + 1] === '<') {
                                depth++;
                                pos += 2;
                            }
                            else if (searchText[pos] === '>' && searchText[pos + 1] === '>') {
                                depth--;
                                pos += 2;
                            }
                            else
                                pos++;
                        }
                    }
                    else if (ch === '{' && searchText.slice(pos, pos + 3) === '{{{') {
                        pos += 3;
                        while (pos < searchText.length && searchText.slice(pos, pos + 3) !== '}}}')
                            pos++;
                        pos += 3;
                    }
                    else if (ch === '{' && searchText[pos + 1] === '{') {
                        pos += 2;
                        while (pos < searchText.length && searchText.slice(pos, pos + 2) !== '}}')
                            pos++;
                        pos += 2;
                    }
                    else if (ch === '<') {
                        // Encountering < means the tag was never properly closed
                        return null;
                    }
                    else {
                        pos++;
                    }
                }
                return null;
            };
            let tagEndResult = findTagEndInText(afterPlaceholder);
            // If not found, scan subsequent lines
            const savedPos = cx.savePosition();
            while (!tagEndResult) {
                if (!cx.nextLine())
                    break;
                accumulatedAttrs += '\n' + cx.line.text;
                tagEndLine = cx.lineStart + cx.line.text.length;
                tagEndResult = findTagEndInText(accumulatedAttrs);
            }
            if (!tagEndResult) {
                // No closing > found - restore and parse as simple paragraph
                cx.restorePosition(savedPos);
                const inlineElements = cx.parser.parseInline(text, start);
                cx.addElement(cx.elt(Type.Paragraph, start, start + text.length, inlineElements));
                return true;
            }
            // Parse attributes
            const attrContent = accumulatedAttrs.slice(0, tagEndResult.pos - (tagEndResult.selfClose ? 2 : 1));
            if (attrContent.trim()) {
                const attrElements = parseAttributes(attrContent, attrsStart, true, cx.parser.parseInline.bind(cx.parser), cx.parser.parseContent.bind(cx.parser));
                children.push(...attrElements);
            }
            const openingTagEnd = attrsStart + tagEndResult.pos;
            if (tagEndResult.selfClose) {
                children.push(elt(Type.SelfClosingMarker, openingTagEnd - 2, openingTagEnd - 1));
                children.push(elt(Type.TagMark, openingTagEnd - 1, openingTagEnd));
                cx.addElement(elt(Type.Widget, tagStart, openingTagEnd, children));
                return true;
            }
            children.push(elt(Type.TagMark, openingTagEnd - 1, openingTagEnd));
            // Look for closing tag </$param$>
            const closeTagPattern = `</$${paramName}$>`;
            const closeRe = new RegExp(`<\\/\\$${paramName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\$>`);
            // Check same line first
            const restOfLine = cx.input.read(openingTagEnd, tagEndLine);
            const sameLineClose = closeRe.exec(restOfLine);
            if (sameLineClose) {
                // Closing tag on same line
                const contentStart = openingTagEnd;
                const contentEnd = openingTagEnd + sameLineClose.index;
                if (contentEnd > contentStart) {
                    const contentText = cx.input.read(contentStart, contentEnd);
                    const inlineElements = cx.parser.parseInline(contentText, contentStart);
                    children.push(...inlineElements);
                }
                // Add closing tag
                const closingTagStart = contentEnd;
                const closingTagEnd = closingTagStart + closeTagPattern.length;
                const closePlaceholderStart = closingTagStart + 2;
                const closePlaceholderEnd = closingTagEnd - 1;
                const closeChildren = [
                    elt(Type.TagMark, closingTagStart, closingTagStart + 2),
                    elt(Type.Placeholder, closePlaceholderStart, closePlaceholderEnd, [
                        elt(Type.PlaceholderMark, closePlaceholderStart, closePlaceholderStart + 1),
                        elt(Type.VariableName, closePlaceholderStart + 1, closePlaceholderStart + 1 + paramName.length),
                        elt(Type.PlaceholderMark, closePlaceholderEnd - 1, closePlaceholderEnd)
                    ]),
                    elt(Type.TagMark, closingTagEnd - 1, closingTagEnd)
                ];
                children.push(elt(Type.WidgetEnd, closingTagStart, closingTagEnd, closeChildren));
                cx.addElement(elt(Type.Widget, tagStart, tagEndLine, children));
                return true;
            }
            // Look for closing tag on subsequent lines
            const savedPosForClose = cx.savePosition();
            let blockEnd = tagEndLine;
            let foundClose = false;
            while (cx.nextLine()) {
                const lineText = cx.line.text;
                const closeMatch = closeRe.exec(lineText);
                if (closeMatch) {
                    // Found closing tag
                    const contentEnd = cx.lineStart + closeMatch.index;
                    if (contentEnd > openingTagEnd) {
                        // Use parseWidgetContent to respect inline vs block mode
                        const contentElements = cx.parseWidgetContent(openingTagEnd, contentEnd);
                        children.push(...contentElements);
                    }
                    // Add closing tag
                    const closingTagStart = cx.lineStart + closeMatch.index;
                    const closingTagEnd = closingTagStart + closeTagPattern.length;
                    const closePlaceholderStart = closingTagStart + 2;
                    const closePlaceholderEnd = closingTagEnd - 1;
                    const closeChildren = [
                        elt(Type.TagMark, closingTagStart, closingTagStart + 2),
                        elt(Type.Placeholder, closePlaceholderStart, closePlaceholderEnd, [
                            elt(Type.PlaceholderMark, closePlaceholderStart, closePlaceholderStart + 1),
                            elt(Type.VariableName, closePlaceholderStart + 1, closePlaceholderStart + 1 + paramName.length),
                            elt(Type.PlaceholderMark, closePlaceholderEnd - 1, closePlaceholderEnd)
                        ]),
                        elt(Type.TagMark, closingTagEnd - 1, closingTagEnd)
                    ];
                    children.push(elt(Type.WidgetEnd, closingTagStart, closingTagEnd, closeChildren));
                    blockEnd = closingTagEnd;
                    foundClose = true;
                    break;
                }
            }
            if (!foundClose) {
                cx.restorePosition(savedPosForClose);
                blockEnd = tagEndLine;
            }
            cx.addElement(elt(Type.Widget, tagStart, blockEnd, children));
            return true;
        }
        // Check for placeholder closing tag: </$param$>
        const placeholderCloseMatch = placeholderCloseTagBlockRe.exec(text);
        if (placeholderCloseMatch) {
            // This is a placeholder closing tag - let inline parsing handle it
            const start = cx.lineStart;
            const end = start + text.length;
            const inlineElements = cx.parser.parseInline(text, start);
            cx.addElement(cx.elt(Type.Paragraph, start, end, inlineElements));
            return true;
        }
        // Try closing tag first (orphaned closing tag)
        const closeMatch = closeTagRe.exec(text);
        if (closeMatch) {
            const indent = closeMatch[1].length;
            const tagName = closeMatch[2];
            const isWidget = tagName.startsWith("$");
            const start = cx.lineStart;
            const children = [];
            const openBracketPos = start + indent;
            children.push(elt(Type.TagMark, openBracketPos, openBracketPos + 2)); // </
            const tagStart = start + indent + 2; // After "</"
            children.push(elt(isWidget ? Type.WidgetName : Type.TagName, tagStart, tagStart + tagName.length));
            // End the closing tag element at the actual tag end, not end of line
            const closeTagEnd = start + closeMatch[0].length;
            children.push(elt(Type.TagMark, closeTagEnd - 1, closeTagEnd)); // >
            // Start the node at the actual tag position (openBracketPos), not line start
            // This ensures the linter can properly match the closing tag text
            cx.addElement(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, openBracketPos, closeTagEnd, children));
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
        // Handle <$ with no widget name (just the prefix) - emit incomplete widget
        // TiddlyWiki treats this as "Undefined widget ''"
        // But if followed by > or />, include those in the widget tag
        if (tagName === "$") {
            const openBracketPos = start + indent;
            const tagStart = start + indent + 1;
            const afterName = openStartMatch[0].length;
            const nextChar = text[afterName];
            if (nextChar === '>') {
                // <$> - complete but undefined widget
                const children = [
                    elt(Type.TagMark, openBracketPos, openBracketPos + 1), // <
                    elt(Type.WidgetName, tagStart, tagStart + 1), // $
                    elt(Type.TagMark, start + afterName, start + afterName + 1), // >
                ];
                cx.nextLine();
                cx.addElement(elt(Type.Widget, start, start + afterName + 1, children));
                return true;
            }
            else if (nextChar === '/' && text[afterName + 1] === '>') {
                // <$/> - self-closing but undefined widget
                const children = [
                    elt(Type.TagMark, openBracketPos, openBracketPos + 1), // <
                    elt(Type.WidgetName, tagStart, tagStart + 1), // $
                    elt(Type.SelfClosingMarker, start + afterName, start + afterName + 1), // /
                    elt(Type.TagMark, start + afterName + 1, start + afterName + 2), // >
                ];
                cx.nextLine();
                cx.addElement(elt(Type.Widget, start, start + afterName + 2, children));
                return true;
            }
            else {
                // <$ followed by space or other - not a valid widget, treat as plain text
                return false;
            }
        }
        const children = [];
        const openBracketPos = start + indent;
        children.push(elt(Type.TagMark, openBracketPos, openBracketPos + 1)); // Opening <
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
                if (ch === '"' && text[pos + 1] === '"' && text[pos + 2] === '"') {
                    // Skip triple-quoted string """..."""
                    pos += 3;
                    while (pos < len && !(text[pos] === '"' && text[pos + 1] === '"' && text[pos + 2] === '"')) {
                        pos++;
                    }
                    pos += 3; // skip closing """
                }
                else if (ch === '"' || ch === "'") {
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
                else if (ch === '<') {
                    // Handle bare < that might be a new tag or weird attribute content
                    const nextCh = text[pos + 1];
                    // </ definitely starts a closing tag - we're incomplete
                    if (nextCh === '/') {
                        return null;
                    }
                    // Check if this looks like a real tag: <tagname or <$widget
                    if (nextCh && /[a-zA-Z$]/.test(nextCh)) {
                        // Scan ahead to see what follows <word
                        let scanPos = pos + 2;
                        while (scanPos < len && /[a-zA-Z0-9\-_$.]/.test(text[scanPos])) {
                            scanPos++;
                        }
                        const afterWord = text[scanPos];
                        if (afterWord === '>') {
                            // <word> - NOT a real tag, just weird attribute content
                            // TiddlyWiki treats this as a boolean attribute with < in the name
                            // Skip past this and continue looking for our tag's >
                            pos = scanPos + 1;
                        }
                        else if (afterWord === '/' && text[scanPos + 1] === '>') {
                            // <word/> - self-closing tag, our tag is incomplete
                            return null;
                        }
                        else if (afterWord && (/\s/.test(afterWord) || afterWord === '=')) {
                            // <word ... or <word= - has attributes, definitely a new tag
                            return null;
                        }
                        else {
                            // <word followed by other chars - skip the word part
                            pos = scanPos;
                        }
                    }
                    else {
                        // < followed by non-tag-start character - just skip it
                        pos++;
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
        // If not found on current line, keep reading lines until end of document
        // Save position so we can restore if we don't find the tag end
        const savedPos = cx.savePosition();
        while (!tagEndResult) {
            if (!cx.nextLine())
                break;
            accumulatedText += '\n' + cx.line.text;
            tagEndResult = findOpeningTagEnd(accumulatedText);
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
                const attrElements = parseAttributes(attrContent, attrsStart, isWidget, cx.parser.parseInline.bind(cx.parser), cx.parser.parseContent.bind(cx.parser));
                children.push(...attrElements);
            }
            // Add closing marks for the opening tag
            if (selfClose) {
                children.push(elt(Type.SelfClosingMarker, openingTagEnd - 2, openingTagEnd - 1)); // /
                children.push(elt(Type.TagMark, openingTagEnd - 1, openingTagEnd)); // >
            }
            else {
                children.push(elt(Type.TagMark, openingTagEnd - 1, openingTagEnd)); // >
            }
        }
        else {
            // No > found, treat as incomplete - only include the first line
            // Don't consume more lines looking for a closing tag
            selfClose = false;
            // Find where the incomplete tag ends - at the first unquoted/unbracketed < that starts another tag
            // This is needed because parseAttributes doesn't know to stop at <
            // Track quotes and filter/macro brackets so < inside them doesn't stop the scan
            let truncateAt = afterTagName.length;
            let scanPos = 0;
            let filterBrackets = 0; // Track {{{ }}}
            let squareBrackets = 0; // Track [ ] inside filters
            let macroBrackets = 0; // Track << >>
            while (scanPos < afterTagName.length) {
                const ch = afterTagName[scanPos];
                const twoChar = afterTagName.slice(scanPos, scanPos + 2);
                const threeChar = afterTagName.slice(scanPos, scanPos + 3);
                if (ch === '"' || ch === "'") {
                    // Skip quoted string
                    const quote = ch;
                    // Check for triple quotes
                    if (ch === '"' && threeChar === '"""') {
                        scanPos += 3;
                        while (scanPos < afterTagName.length && afterTagName.slice(scanPos, scanPos + 3) !== '"""') {
                            scanPos++;
                        }
                        if (scanPos < afterTagName.length)
                            scanPos += 3;
                        continue;
                    }
                    scanPos++;
                    while (scanPos < afterTagName.length && afterTagName[scanPos] !== quote) {
                        if (afterTagName[scanPos] === '\\')
                            scanPos++;
                        scanPos++;
                    }
                    scanPos++;
                }
                else if (threeChar === '{{{') {
                    filterBrackets++;
                    scanPos += 3;
                }
                else if (threeChar === '}}}') {
                    if (filterBrackets > 0)
                        filterBrackets--;
                    scanPos += 3;
                }
                else if (twoChar === '<<') {
                    macroBrackets++;
                    scanPos += 2;
                }
                else if (twoChar === '>>') {
                    if (macroBrackets > 0)
                        macroBrackets--;
                    scanPos += 2;
                }
                else if (ch === '[' && (filterBrackets > 0 || macroBrackets > 0)) {
                    squareBrackets++;
                    scanPos++;
                }
                else if (ch === ']' && squareBrackets > 0) {
                    squareBrackets--;
                    scanPos++;
                }
                else if (ch === '<') {
                    // Only stop at < when NOT inside any bracket context
                    if (filterBrackets === 0 && squareBrackets === 0 && macroBrackets === 0) {
                        // Check if this starts a tag
                        const nextCh = afterTagName[scanPos + 1];
                        if (nextCh && /[a-zA-Z$\/]/.test(nextCh)) {
                            truncateAt = scanPos;
                            break;
                        }
                    }
                    scanPos++;
                }
                else {
                    scanPos++;
                }
            }
            const truncatedAttrs = afterTagName.slice(0, truncateAt);
            openingTagEnd = start + indent + 1 + tagName.length + truncateAt;
            const currentLineEnd = cx.lineStart + text.length;
            // Still parse whatever attributes we have before the stray <
            if (truncatedAttrs.trim()) {
                const attrElements = parseAttributes(truncatedAttrs, attrsStart, isWidget, cx.parser.parseInline.bind(cx.parser), cx.parser.parseContent.bind(cx.parser));
                children.push(...attrElements);
            }
            // For incomplete opening tags, output what we have with incomplete type
            cx.addElement(elt(isWidget ? Type.IncompleteWidget : Type.IncompleteHTMLBlock, start, openingTagEnd, children));
            // Check if there's remaining content on this line after the incomplete block
            if (openingTagEnd < currentLineEnd) {
                const remainingContent = cx.input.read(openingTagEnd, currentLineEnd).trim();
                if (remainingContent) {
                    // Parse the remaining content as sibling elements
                    const siblingElements = cx.parseContentRange(openingTagEnd, currentLineEnd, false);
                    for (const sibling of siblingElements) {
                        cx.addElement(sibling);
                    }
                    // Skip past the content we just parsed
                    cx.skipToPosition(currentLineEnd);
                }
            }
            return true;
        }
        // Determine if this is a multi-line block with content
        if (!selfClose) {
            const openRe = new RegExp(`<${tagName.replace(/\$/g, '\\$')}(?:\\s|>|/>)`);
            const closeRe = new RegExp(`</${tagName.replace(/\$/g, '\\$')}>`);
            // For multi-line: match closing tag at start of line with optional indent
            const closeReWithIndent = new RegExp(`^(\\s*)</${tagName.replace(/\$/g, '\\$')}>`);
            let blockEnd = openingTagLineEnd;
            let foundClose = false;
            // First, check if closing tag is on the same line after the opening tag
            const restOfLine = cx.input.read(openingTagEnd, openingTagLineEnd);
            // Find the CORRECT closing tag using depth counting (handles nested same-name tags)
            let matchingCloseIndex = -1;
            let matchingCloseLength = 0;
            let depth = 1;
            let searchPos = 0;
            const openTagPattern = `<${tagName}`;
            const closeTagPattern = `</${tagName}>`;
            while (searchPos < restOfLine.length && depth > 0) {
                const nextOpen = restOfLine.indexOf(openTagPattern, searchPos);
                const nextClose = restOfLine.indexOf(closeTagPattern, searchPos);
                if (nextClose === -1) {
                    // No more closing tags found
                    break;
                }
                if (nextOpen !== -1 && nextOpen < nextClose) {
                    // Found an opening tag before the next close
                    // Check if it's followed by whitespace, > or /> (valid tag start)
                    const afterOpen = restOfLine[nextOpen + openTagPattern.length];
                    if (afterOpen === ' ' || afterOpen === '>' || afterOpen === '\t' || afterOpen === '\n' ||
                        afterOpen === '/' || afterOpen === undefined) {
                        // Check if this is a self-closing tag (pattern from TiddlyWiki core html.js)
                        const tagEndSearch = restOfLine.slice(nextOpen);
                        const selfCloseMatch = tagEndSearch.match(/^<[a-zA-Z\$][a-zA-Z0-9\-\$\.]*[^>]*\/>/);
                        if (!selfCloseMatch) {
                            depth++;
                        }
                    }
                    searchPos = nextOpen + 1;
                }
                else {
                    // Found a closing tag
                    depth--;
                    if (depth === 0) {
                        matchingCloseIndex = nextClose;
                        matchingCloseLength = closeTagPattern.length;
                        break;
                    }
                    searchPos = nextClose + 1;
                }
            }
            if (matchingCloseIndex !== -1) {
                // Found matching close on same line
                const contentStart = openingTagEnd;
                const contentEnd = openingTagEnd + matchingCloseIndex;
                // Parse inline content between opening and closing tags
                if (contentEnd > contentStart) {
                    const contentText = cx.input.read(contentStart, contentEnd);
                    const inlineElements = cx.parser.parseInline(contentText, contentStart);
                    children.push(...inlineElements);
                }
                // Add closing tag element with marks - wrapped in WidgetEnd/HTMLEndTag
                const closingTagOpenBracket = openingTagEnd + matchingCloseIndex;
                const closeTagEnd = openingTagEnd + matchingCloseIndex + matchingCloseLength;
                const closeTagChildren = [];
                closeTagChildren.push(elt(Type.TagMark, closingTagOpenBracket, closingTagOpenBracket + 2)); // </
                const closeTagStart = openingTagEnd + matchingCloseIndex + 2; // After </
                closeTagChildren.push(elt(isWidget ? Type.WidgetName : Type.TagName, closeTagStart, closeTagStart + tagName.length));
                closeTagChildren.push(elt(Type.TagMark, closeTagEnd - 1, closeTagEnd)); // >
                // Wrap in WidgetEnd/HTMLEndTag for proper tree structure (needed for folding)
                children.push(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, closingTagOpenBracket, closeTagEnd, closeTagChildren));
                // Parse any content AFTER the closing tag on the same line
                const afterCloseTag = restOfLine.slice(matchingCloseIndex + matchingCloseLength);
                if (afterCloseTag.trim()) {
                    // Check if the content starts with a tag that may span multiple lines
                    // If so, parse it as sibling block content rather than inline
                    if (/^<[$a-zA-Z]/.test(afterCloseTag.trim())) {
                        // Add the current element first
                        cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, closeTagEnd, children));
                        // Parse the remaining content as sibling block elements
                        const remainingStart = closeTagEnd;
                        const remainingEnd = cx.rangeEnd;
                        if (remainingEnd > remainingStart) {
                            const siblingElements = cx.parseContentRange(remainingStart, remainingEnd, false);
                            for (const sibling of siblingElements) {
                                cx.addElement(sibling);
                            }
                            // Skip past the content we just parsed to avoid double-parsing
                            cx.skipToPosition(remainingEnd);
                        }
                        return true;
                    }
                    // Regular inline content - parse as before
                    const afterCloseStart = closeTagEnd;
                    const inlineElements = cx.parser.parseInline(afterCloseTag, afterCloseStart);
                    children.push(...inlineElements);
                }
                blockEnd = openingTagLineEnd;
                foundClose = true;
            }
            if (!foundClose) {
                // Multi-line content: find the closing tag on subsequent lines
                // But first, there may be inline content on the same line as the opening tag
                const sameLineContent = cx.input.read(openingTagEnd, openingTagLineEnd);
                const blockContentStart = openingTagLineEnd + 1;
                let contentEnd = blockContentStart;
                let nestLevel = 1;
                let otherWidgetLevel = 0; // Track OTHER widgets (different name) to detect "trapped" closing tags
                // Helper function to find real tags in text, excluding filter variable references
                // Returns array of { pos, name, isClose, isSelfClosing }
                const findRealTags = (text) => {
                    const tags = [];
                    let i = 0;
                    let filterDepth = 0; // [...]
                    let filterRunDepth = 0; // {{{...}}}
                    let transcludeDepth = 0; // {{...}}
                    let macroDepth = 0; // <<...>>
                    let conditionalDepth = 0; // <%if%>...<%endif%>
                    while (i < text.length) {
                        const ch = text[i];
                        const ch2 = text.slice(i, i + 2);
                        const ch3 = text.slice(i, i + 3);
                        // Track <%if%>...<%endif%> conditionals
                        // <%if opens, <%endif%> closes (<%else%> and <%elseif%> continue same level)
                        if (ch2 === '<%') {
                            const conditionalMatch = text.slice(i).match(/^<%\s*(if|endif)\b/);
                            if (conditionalMatch) {
                                if (conditionalMatch[1] === 'if') {
                                    conditionalDepth++;
                                }
                                else if (conditionalMatch[1] === 'endif' && conditionalDepth > 0) {
                                    conditionalDepth--;
                                }
                                // Skip past the <% to avoid re-matching
                                i += 2;
                                continue;
                            }
                        }
                        // Track filter/transclusion/macro contexts
                        if (ch3 === '{{{') {
                            filterRunDepth++;
                            i += 3;
                            continue;
                        }
                        if (ch3 === '}}}' && filterRunDepth > 0) {
                            filterRunDepth--;
                            i += 3;
                            continue;
                        }
                        if (ch2 === '{{' && ch3 !== '{{{') {
                            transcludeDepth++;
                            i += 2;
                            continue;
                        }
                        if (ch2 === '}}' && ch3 !== '}}}' && transcludeDepth > 0) {
                            transcludeDepth--;
                            i += 2;
                            continue;
                        }
                        if (ch2 === '<<') {
                            macroDepth++;
                            i += 2;
                            continue;
                        }
                        if (ch2 === '>>' && macroDepth > 0) {
                            macroDepth--;
                            i += 2;
                            continue;
                        }
                        if (ch === '[') {
                            filterDepth++;
                            i++;
                            continue;
                        }
                        if (ch === ']' && filterDepth > 0) {
                            filterDepth--;
                            i++;
                            continue;
                        }
                        // Skip quoted strings (but only track them, don't skip tags inside)
                        if (ch === '"' || ch === "'") {
                            const quote = ch;
                            i++;
                            while (i < text.length && text[i] !== quote) {
                                if (text[i] === '\\')
                                    i++;
                                i++;
                            }
                            i++; // skip closing quote
                            continue;
                        }
                        // Only look for tags when NOT inside filter/transclusion/macro contexts
                        if (filterDepth === 0 && filterRunDepth === 0 && transcludeDepth === 0 && macroDepth === 0 && conditionalDepth === 0) {
                            // Check for closing tag </name>
                            const closeMatch = text.slice(i).match(/^<\/([a-zA-Z\$][a-zA-Z0-9\-\$\.]*)>/);
                            if (closeMatch) {
                                tags.push({ pos: i, name: closeMatch[1], isClose: true, isSelfClosing: false });
                                i += closeMatch[0].length;
                                continue;
                            }
                            // Check for opening tag <name or <name> or <name />
                            const openMatch = text.slice(i).match(/^<([a-zA-Z\$][a-zA-Z0-9\-\$\.]*)(?=[\s>\/])/);
                            if (openMatch) {
                                const tagNameLower = openMatch[1].toLowerCase();
                                // HTML void elements are always self-closing (don't need />)
                                const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
                                let isSelfClosing = voidElements.includes(tagNameLower);
                                // If not a void element, check if explicitly self-closing by scanning to find actual tag end
                                // Must handle <<...>>, {{...}}, quoted strings inside attributes
                                if (!isSelfClosing) {
                                    let scanPos = i + openMatch[0].length;
                                    let inMacro = 0;
                                    let inTransclude = 0;
                                    let inFilterRun = 0;
                                    while (scanPos < text.length) {
                                        const sch = text[scanPos];
                                        const sch2 = text.slice(scanPos, scanPos + 2);
                                        const sch3 = text.slice(scanPos, scanPos + 3);
                                        if (sch3 === '{{{') {
                                            inFilterRun++;
                                            scanPos += 3;
                                            continue;
                                        }
                                        if (sch3 === '}}}' && inFilterRun > 0) {
                                            inFilterRun--;
                                            scanPos += 3;
                                            continue;
                                        }
                                        if (sch2 === '{{' && sch3 !== '{{{') {
                                            inTransclude++;
                                            scanPos += 2;
                                            continue;
                                        }
                                        if (sch2 === '}}' && sch3 !== '}}}' && inTransclude > 0) {
                                            inTransclude--;
                                            scanPos += 2;
                                            continue;
                                        }
                                        if (sch2 === '<<') {
                                            inMacro++;
                                            scanPos += 2;
                                            continue;
                                        }
                                        if (sch2 === '>>' && inMacro > 0) {
                                            inMacro--;
                                            scanPos += 2;
                                            continue;
                                        }
                                        if (sch === '"' || sch === "'") {
                                            const q = sch;
                                            scanPos++;
                                            while (scanPos < text.length && text[scanPos] !== q) {
                                                if (text[scanPos] === '\\')
                                                    scanPos++;
                                                scanPos++;
                                            }
                                            scanPos++; // skip closing quote
                                            continue;
                                        }
                                        // Only check for tag end when not inside nested constructs
                                        if (inMacro === 0 && inTransclude === 0 && inFilterRun === 0) {
                                            if (sch2 === '/>') {
                                                isSelfClosing = true;
                                                break;
                                            }
                                            if (sch === '>') {
                                                isSelfClosing = false;
                                                break;
                                            }
                                        }
                                        scanPos++;
                                    }
                                }
                                tags.push({ pos: i, name: openMatch[1], isClose: false, isSelfClosing });
                                i += openMatch[0].length;
                                continue;
                            }
                        }
                        i++;
                    }
                    return tags;
                };
                // Count nested tags in the same-line content BEFORE entering the search loop
                const sameLineTags = findRealTags(sameLineContent);
                for (const tag of sameLineTags) {
                    if (tag.name === tagName) {
                        if (tag.isClose) {
                            // Only decrement for nested same-name tags, not when trapped
                            if (nestLevel > 1) {
                                nestLevel--;
                            }
                            // If nestLevel === 1 && otherWidgetLevel > 0, the close is trapped - skip
                        }
                        else if (!tag.isSelfClosing) {
                            nestLevel++;
                        }
                    }
                    else {
                        // Other widget/tag
                        if (tag.isClose) {
                            if (otherWidgetLevel > 0)
                                otherWidgetLevel--;
                        }
                        else if (!tag.isSelfClosing) {
                            otherWidgetLevel++;
                        }
                    }
                }
                // Save position in case we don't find a closing tag
                const savedPosForClose = cx.savePosition();
                while (cx.nextLine()) {
                    const lineText = cx.line.text;
                    // Find all real tags on this line (excluding filter variable references)
                    const lineTags = findRealTags(lineText);
                    // Process tags in order
                    let lastCloseIndex = -1;
                    let closeTagLength = 0;
                    for (const tag of lineTags) {
                        if (tag.name === tagName) {
                            if (tag.isClose) {
                                // Only accept this as our closing tag if:
                                // 1. nestLevel would become 0 (this closes the outer tag)
                                // 2. No other widgets are open (closing tag not "trapped")
                                if (nestLevel === 1 && otherWidgetLevel === 0) {
                                    nestLevel--;
                                    lastCloseIndex = tag.pos;
                                    closeTagLength = tagName.length + 3; // </name>
                                    break; // Found our match
                                }
                                else if (nestLevel > 1) {
                                    // Nested same-name tag closing - always decrement
                                    nestLevel--;
                                }
                                // If nestLevel === 1 but otherWidgetLevel > 0, the closing tag is
                                // "trapped" inside another widget - treat it as orphan, don't decrement
                            }
                            else if (!tag.isSelfClosing) {
                                nestLevel++;
                            }
                        }
                        else {
                            // Other widget/tag
                            if (tag.isClose) {
                                if (otherWidgetLevel > 0)
                                    otherWidgetLevel--;
                            }
                            else if (!tag.isSelfClosing) {
                                otherWidgetLevel++;
                            }
                        }
                    }
                    if (lastCloseIndex !== -1 && nestLevel === 0 && otherWidgetLevel === 0) {
                        // Found our closing tag
                        const closingTagOpenBracket = cx.lineStart + lastCloseIndex;
                        const closeTagLen = closeTagLength;
                        const closingTagEndPos = closingTagOpenBracket + closeTagLen;
                        // Content ends before the closing tag
                        contentEnd = closingTagOpenBracket - 1;
                        // Check if same-line content contains widget/HTML tags
                        // If it contains any tags, include it with block content for proper recursive parsing
                        // This handles cases like ><$set ...><$button where tags span multiple lines
                        const sameLineTrimmed = sameLineContent.trim();
                        const containsTags = sameLineTrimmed && /<[$a-zA-Z]/.test(sameLineTrimmed);
                        // Determine block vs inline mode based on blank line after opening tag
                        // - No blank line → inline mode (all content parsed as inline)
                        // - Blank line → block mode (content parsed as blocks)
                        const isBlockMode = cx.startsWithBlankLine(openingTagEnd, contentEnd + 1);
                        if (sameLineContent.trim() && !containsTags) {
                            // Parse as inline content only if no tags present
                            const inlineElements = cx.parser.parseInline(sameLineContent, openingTagEnd);
                            children.push(...inlineElements);
                        }
                        // Parse content between opening line and closing tag
                        // If same-line content had tags, include it in block content
                        const actualBlockStart = containsTags ? openingTagEnd : blockContentStart;
                        if (contentEnd >= actualBlockStart) {
                            if (isBlockMode) {
                                // Block mode - parse as blocks
                                const contentElements = cx.parseContentRange(actualBlockStart, contentEnd + 1, false);
                                children.push(...contentElements);
                            }
                            else {
                                // Inline mode - parse as inline only (no block elements recognized)
                                const contentElements = cx.parseInlineRange(actualBlockStart, contentEnd + 1);
                                children.push(...contentElements);
                            }
                        }
                        // Add closing tag element with marks - wrapped in WidgetEnd/HTMLEndTag
                        const closeTagChildren = [];
                        closeTagChildren.push(elt(Type.TagMark, closingTagOpenBracket, closingTagOpenBracket + 2)); // </
                        const closeTagNameStart = closingTagOpenBracket + 2;
                        closeTagChildren.push(elt(isWidget ? Type.WidgetName : Type.TagName, closeTagNameStart, closeTagNameStart + tagName.length));
                        closeTagChildren.push(elt(Type.TagMark, closingTagEndPos - 1, closingTagEndPos)); // >
                        // Wrap in WidgetEnd/HTMLEndTag for proper tree structure (needed for folding)
                        children.push(elt(isWidget ? Type.WidgetEnd : Type.HTMLEndTag, closingTagOpenBracket, closingTagEndPos, closeTagChildren));
                        // Content after the closing tag on the same line should NOT be added as children
                        // Set blockEnd to the end of the closing tag, not end of line
                        blockEnd = closingTagEndPos;
                        // Check if there's remaining content on this line that starts a new block element
                        // This handles cases like </$list><$list where two tags are on the same line
                        const afterCloseTag = lineText.slice(lastCloseIndex + closeTagLen);
                        if (afterCloseTag.trim() && /^<[$a-zA-Z]/.test(afterCloseTag.trim())) {
                            // There's another tag starting on this line - parse it as sibling content
                            // First add the current element
                            cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, blockEnd, children));
                            // Parse the remaining content as new block elements and add as siblings
                            // Use rangeEnd to capture multi-line tags that start here
                            const remainingStart = closingTagEndPos;
                            const remainingEnd = cx.rangeEnd;
                            if (remainingEnd > remainingStart) {
                                const siblingElements = cx.parseContentRange(remainingStart, remainingEnd, false);
                                for (const sibling of siblingElements) {
                                    cx.addElement(sibling);
                                }
                                // Skip past the content we just parsed to avoid double-parsing
                                cx.skipToPosition(remainingEnd);
                            }
                            return true;
                        }
                        foundClose = true;
                        break;
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
        // Check if there's content after /> on the same line that should be parsed as siblings
        const afterSelfClose = cx.input.read(openingTagEnd, openingTagLineEnd);
        if (afterSelfClose.trim()) {
            // There's content after the self-closing tag on the same line
            cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, openingTagEnd, children));
            // Parse the remaining content as sibling elements
            const remainingStart = openingTagEnd;
            const remainingEnd = cx.rangeEnd;
            if (remainingEnd > remainingStart) {
                const siblingElements = cx.parseContentRange(remainingStart, remainingEnd, false);
                for (const sibling of siblingElements) {
                    cx.addElement(sibling);
                }
                // Skip past the content we just parsed
                cx.skipToPosition(remainingEnd);
            }
            return true;
        }
        cx.addElement(elt(isWidget ? Type.Widget : Type.HTMLBlock, start, openingTagEnd, children));
        return true;
    }
};
// ============================================================================
// Export all default block parsers
// ============================================================================
// ============================================================================
// Multi-line Styled Block (@@styles;.className ... @@)
// Handles: @@, @@.class, @@color:red;, @@color:red;.class
// ============================================================================
// Regex matching CSS styles: one or more property:value; pairs
const blockCssStylesRe = /^((?:[^\.\r\n\s:]+:[^\r\n;]+;)+)/;
export const StyledBlock = {
    name: "StyledBlock",
    parse(cx, line) {
        // Must start with @@ but not be inline (which would have @@ ... @@ on same line)
        if (!line.text.startsWith("@@"))
            return false;
        // If closing @@ is on same line, let inline parser handle it
        if (line.text.indexOf("@@", 2) !== -1)
            return false;
        const start = cx.lineStart;
        const children = [
            elt(Type.HighlightMark, start, start + 2), // Opening @@
        ];
        const afterAt = line.text.slice(2);
        // Find where classes start (first . that could be a class)
        // A . is a class marker if:
        // - It's followed by a letter/underscore (complete class start)
        // - It's at the end of the line (user typing class name)
        // - It's followed by whitespace or another . (user typing)
        let classStartIdx = -1;
        for (let i = 0; i < afterAt.length; i++) {
            if (afterAt[i] === '.') {
                const nextChar = afterAt[i + 1];
                // It's a class marker if followed by class char, whitespace, another dot, or end of string
                if (!nextChar || /[a-zA-Z_\s\.]/.test(nextChar)) {
                    classStartIdx = i;
                    break;
                }
            }
        }
        // CSS styles region: from after @@ to first class marker (or end of line content)
        // This includes both complete styles (property:value;) and incomplete ones being typed
        let cssEnd = classStartIdx !== -1 ? classStartIdx : afterAt.trimEnd().length;
        if (cssEnd > 0) {
            children.push(elt(Type.HighlightStyles, start + 2, start + 2 + cssEnd));
        }
        // Parse class names after CSS styles
        let pos = classStartIdx !== -1 ? 2 + classStartIdx : line.text.length;
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
        let foundClose = false;
        while (closingLine < cx.input.length) {
            // Read until end of line
            let lineEnd = closingLine;
            while (lineEnd < cx.input.length && cx.input.read(lineEnd, lineEnd + 1) !== '\n') {
                lineEnd++;
            }
            const lineText = cx.input.read(closingLine, lineEnd);
            if (lineText.trim() === '@@') {
                foundClose = true;
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
const conditionalIfRe = /^\s*<%\s*if\s+(.+?)\s*%>/;
const conditionalElseifRe = /^\s*<%\s*elseif\s+(.+?)\s*%>/;
const conditionalElseRe = /^\s*<%\s*else\s*%>/;
const conditionalEndifRe = /^\s*<%\s*endif\s*%>/;
export const ConditionalBlock = {
    name: "ConditionalBlock",
    parse(cx, line) {
        const ifMatch = conditionalIfRe.exec(line.text);
        if (!ifMatch)
            return false;
        const start = cx.lineStart;
        const filter = ifMatch[1];
        const children = [];
        // Parse opening <%if [filter] %> or <% if [filter] %>
        const openMarkStart = start + line.text.indexOf('<%');
        const ifKeywordStart = start + line.text.indexOf('if');
        children.push(elt(Type.ConditionalMark, openMarkStart, openMarkStart + 2)); // <%
        children.push(elt(Type.ConditionalKeyword, ifKeywordStart, ifKeywordStart + 2)); // if
        // Parse the filter expression
        const filterStart = start + line.text.indexOf(filter);
        const filterChildren = parseFilterExpressionDetailed(filter, filterStart);
        children.push(elt(Type.FilterExpression, filterStart, filterStart + filter.length, filterChildren));
        // Find the closing %> of the if tag
        const closeMarkPos = start + line.text.indexOf('%>');
        children.push(elt(Type.ConditionalMark, closeMarkPos, closeMarkPos + 2)); // %>
        const openingLineEnd = start + line.text.length;
        // Track branches and find <%endif%>
        // Content can start right after %> on the same line
        let branchStart = closeMarkPos + 2;
        let currentPos = branchStart;
        let depth = 1;
        let endPos = -1;
        let endifLineStart = -1;
        // First check the rest of the opening line for inline closing tags
        const restOfLine = line.text.slice(closeMarkPos + 2 - start);
        const inlineEndifMatch = /<%\s*endif\s*%>/.exec(restOfLine);
        if (inlineEndifMatch) {
            // Found <%endif%> on the same line
            const contentBeforeEndif = restOfLine.slice(0, inlineEndifMatch.index);
            if (contentBeforeEndif.trim()) {
                // Parse inline content as branch
                const contentStart = closeMarkPos + 2;
                const contentEnd = closeMarkPos + 2 + inlineEndifMatch.index;
                const branchContent = cx.parser.parseInline(contentBeforeEndif, contentStart);
                children.push(elt(Type.ConditionalBranch, contentStart, contentEnd, branchContent));
            }
            // Parse <% endif %> on same line
            const endifStart = closeMarkPos + 2 + inlineEndifMatch.index;
            const endifKeywordPos = restOfLine.indexOf('endif', inlineEndifMatch.index);
            const endifKeywordStart = closeMarkPos + 2 + endifKeywordPos;
            const endifClosePos = restOfLine.indexOf('%>', inlineEndifMatch.index);
            const endifClose = closeMarkPos + 2 + endifClosePos;
            children.push(elt(Type.ConditionalMark, endifStart, endifStart + 2));
            children.push(elt(Type.ConditionalKeyword, endifKeywordStart, endifKeywordStart + 5));
            children.push(elt(Type.ConditionalMark, endifClose, endifClose + 2));
            endPos = endifClose + 2;
            cx.addElement(elt(Type.ConditionalBlock, start, endPos, children));
            return true;
        }
        // Move to next line for scanning
        currentPos = openingLineEnd + 1;
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
                    // Parse <% endif %> (with optional whitespace)
                    const endifStart = currentPos + lineText.indexOf('<%');
                    const endifKeywordStart = currentPos + lineText.indexOf('endif');
                    const endifClose = currentPos + lineText.indexOf('%>');
                    children.push(elt(Type.ConditionalMark, endifStart, endifStart + 2));
                    children.push(elt(Type.ConditionalKeyword, endifKeywordStart, endifKeywordStart + 5)); // endif
                    children.push(elt(Type.ConditionalMark, endifClose, endifClose + 2));
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
                // Parse <%elseif [filter] %> or <% elseif [filter] %>
                const elseifMatch = conditionalElseifRe.exec(lineText);
                if (elseifMatch) {
                    const elseifStart = currentPos + lineText.indexOf('<%');
                    const elseifKeywordStart = currentPos + lineText.indexOf('elseif');
                    children.push(elt(Type.ConditionalMark, elseifStart, elseifStart + 2));
                    children.push(elt(Type.ConditionalKeyword, elseifKeywordStart, elseifKeywordStart + 6)); // elseif
                    const elseifFilter = elseifMatch[1];
                    const elseifFilterStart = currentPos + lineText.indexOf(elseifFilter);
                    const elseifFilterChildren = parseFilterExpressionDetailed(elseifFilter, elseifFilterStart);
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
                // Parse <% else %> (with optional whitespace)
                const elseStart = currentPos + lineText.indexOf('<%');
                const elseKeywordStart = currentPos + lineText.indexOf('else');
                const elseClose = currentPos + lineText.indexOf('%>');
                children.push(elt(Type.ConditionalMark, elseStart, elseStart + 2));
                children.push(elt(Type.ConditionalKeyword, elseKeywordStart, elseKeywordStart + 4)); // else
                children.push(elt(Type.ConditionalMark, elseClose, elseClose + 2));
                branchStart = lineEnd + 1;
            }
            currentPos = lineEnd + 1;
        }
        if (endPos === -1) {
            // No closing <%endif%> found - extend block to end of document for indentation support
            // Always create a branch for content after the last opening tag (<%if%>, <%else%>, <%elseif%>)
            // This ensures proper indentation even when the branch is empty
            if (branchStart <= cx.input.length) {
                const branchContent = cx.parseContentRange(branchStart, cx.input.length);
                // Create branch even if empty for indentation purposes
                children.push(elt(Type.ConditionalBranch, branchStart, cx.input.length, branchContent));
            }
            cx.addElement(elt(Type.ConditionalBlock, start, cx.input.length, children));
            // Move to end of document
            while (!cx.atEnd) {
                cx.nextLine();
            }
            return true;
        }
        cx.addElement(elt(Type.ConditionalBlock, start, endPos, children));
        // Advance to the <%endif%> line (parseBlock will call nextLine() to move past it)
        while (cx.lineStart < endifLineStart) {
            cx.nextLine();
        }
        return true;
    }
};
export const DefaultBlockParsers = [
    FencedCode,
    TypedBlock,
    ConditionalBlock, // <%if%> ... <%endif%>
    StyledBlock, // Multi-line @@...@@
    Heading,
    HorizontalRule,
    HardLineBreaks, // """ ... """
    MultiLineBlockQuote,
    List,
    Table,
    CommentBlock,
    TransclusionBlock,
    FilteredTransclusionBlock,
    MacroCallBlock,
    HTMLBlock,
];
// KaTeX block parser - only include when KaTeX plugin is installed
// Use: [...DefaultBlockParsers.slice(0, 2), KaTeXBlock, ...DefaultBlockParsers.slice(2)]
// (Must come after TypedBlock but before other parsers)
//# sourceMappingURL=block-parsers.js.map