/**
 * TiddlyWiki Parser - Inline Parsers
 *
 * Inline-level parsing rules following the Lezer Markdown architecture.
 */
import { Type } from "./types";
// @ts-expect-error TS(6133): 'elt' is declared but its value is never read.
import { Ch } from "./core";
import { createDelimiterParser, parseTransclusionTarget, parseMacroParams as parseMacroParamsUtil, createAttributeNameElement, createImageSourceElement, createURLLinkElement, parseFilterExpressionDetailed, skipBracedBlock, } from "./utils";
// ============================================================================
// Escape Parser (~WikiWord prevents linking)
// ============================================================================
// Characters that can be escaped with backslash in TiddlyWiki wikitext
// These are wiki syntax characters that might need escaping
const escapableChars = new Set([
    // Formatting characters
    "'".charCodeAt(0), // Bold
    "/".charCodeAt(0), // Italic
    "_".charCodeAt(0), // Underscore
    "^".charCodeAt(0), // Superscript
    ",".charCodeAt(0), // Subscript
    "~".charCodeAt(0), // Strikethrough / CamelCase suppression
    "`".charCodeAt(0), // Code
    // Brackets and delimiters
    "[".charCodeAt(0),
    "]".charCodeAt(0),
    "{".charCodeAt(0),
    "}".charCodeAt(0),
    "<".charCodeAt(0),
    ">".charCodeAt(0),
    "(".charCodeAt(0),
    ")".charCodeAt(0),
    // List and block markers
    "*".charCodeAt(0),
    "#".charCodeAt(0),
    ";".charCodeAt(0),
    ":".charCodeAt(0),
    "!".charCodeAt(0),
    "|".charCodeAt(0),
    // Special characters
    "\\".charCodeAt(0),
    "@".charCodeAt(0),
    "$".charCodeAt(0),
    "%".charCodeAt(0),
    "&".charCodeAt(0),
    "-".charCodeAt(0),
    "=".charCodeAt(0),
    "+".charCodeAt(0),
]);
export const Escape = {
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
        // Backslash escape - only for special wiki syntax characters
        if (escapableChars.has(after)) {
            return cx.addElement(cx.elt(Type.Escape, pos, pos + 2));
        }
        return -1;
    }
};
// ============================================================================
// Entity Parser (&amp; etc)
// ============================================================================
const entityRe = /^&(?:#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/;
export const Entity = {
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
export const InlineCode = {
    name: "InlineCode",
    parse(cx, next, pos) {
        if (next !== Ch.Backtick)
            return -1;
        // Determine opening sequence length (` or ``)
        const openLen = (cx.char(pos + 1) === Ch.Backtick) ? 2 : 1;
        const openEnd = pos + openLen;
        // Find matching closing sequence
        let end = openEnd;
        while (end < cx.end) {
            if (cx.char(end) === Ch.Backtick) {
                // Check if this matches our opening sequence length
                const closeLen = (end + 1 < cx.end && cx.char(end + 1) === Ch.Backtick) ? 2 : 1;
                if (closeLen === openLen) {
                    const closeEnd = end + closeLen;
                    return cx.addElement(cx.elt(Type.InlineCode, pos, closeEnd, [
                        cx.elt(Type.InlineCodeMark, pos, openEnd),
                        cx.elt(Type.CodeText, openEnd, end),
                        cx.elt(Type.InlineCodeMark, end, closeEnd),
                    ]));
                }
                // Skip past non-matching backtick(s)
                end += closeLen;
                continue;
            }
            end++;
        }
        // No closing sequence found - parse as unclosed inline code to end of text
        const children = [
            cx.elt(Type.InlineCodeMark, pos, openEnd),
        ];
        if (cx.end > openEnd) {
            children.push(cx.elt(Type.CodeText, openEnd, cx.end));
        }
        return cx.addElement(cx.elt(Type.InlineCode, pos, cx.end, children));
    }
};
// ============================================================================
// Inline KaTeX/LaTeX Math Parser ($$ ... $$)
// ============================================================================
export const InlineKaTeX = {
    name: "InlineKaTeX",
    after: "InlineCode", // Position after InlineCode
    parse(cx, next, pos) {
        // Check for $$ (but not $$$)
        if (next !== Ch.Dollar)
            return -1;
        if (cx.char(pos + 1) !== Ch.Dollar)
            return -1;
        if (cx.char(pos + 2) === Ch.Dollar)
            return -1; // Don't match $$$ (typed block)
        // Don't match $$identifier - this is TiddlyWiki's indirect attribute syntax
        // e.g., $$names, $$values in widgets like $genesis
        const afterDollar = cx.char(pos + 2);
        if (afterDollar >= 0 && /[a-zA-Z_]/.test(String.fromCharCode(afterDollar))) {
            return -1;
        }
        const openEnd = pos + 2;
        // Find closing $$
        let end = openEnd;
        while (end < cx.end - 1) {
            if (cx.char(end) === Ch.Dollar && cx.char(end + 1) === Ch.Dollar) {
                // Found closing $$
                const closeEnd = end + 2;
                const children = [
                    cx.elt(Type.KaTeXMark, pos, openEnd),
                ];
                if (end > openEnd) {
                    children.push(cx.elt(Type.LaTeXContent, openEnd, end));
                }
                children.push(cx.elt(Type.KaTeXMark, end, closeEnd));
                return cx.addElement(cx.elt(Type.KaTeXBlock, pos, closeEnd, children));
            }
            end++;
        }
        // No closing found - don't consume (let other parsers try)
        return -1;
    }
};
// ============================================================================
// Delimiter-based Formatters (Bold, Italic, Underline, Strikethrough, etc.)
// ============================================================================
// These all use the createDelimiterParser factory from utils.ts
const BoldDelim = { resolve: "Bold", mark: "BoldMark" };
const ItalicDelim = { resolve: "Italic", mark: "ItalicMark" };
const UnderlineDelim = { resolve: "Underline", mark: "UnderlineMark" };
const StrikethroughDelim = { resolve: "Strikethrough", mark: "StrikethroughMark" };
const SuperscriptDelim = { resolve: "Superscript", mark: "SuperscriptMark" };
const SubscriptDelim = { resolve: "Subscript", mark: "SubscriptMark" };
export const Bold = {
    name: "Bold",
    parse: createDelimiterParser({ charCode: Ch.Apostrophe, delimType: BoldDelim })
};
export const Italic = {
    name: "Italic",
    parse: createDelimiterParser({ charCode: Ch.Slash, delimType: ItalicDelim })
};
export const Underline = {
    name: "Underline",
    parse: createDelimiterParser({ charCode: Ch.Underscore, delimType: UnderlineDelim })
};
export const Strikethrough = {
    name: "Strikethrough",
    parse: createDelimiterParser({ charCode: Ch.Tilde, delimType: StrikethroughDelim })
};
export const Superscript = {
    name: "Superscript",
    parse: createDelimiterParser({ charCode: Ch.Caret, delimType: SuperscriptDelim })
};
export const Subscript = {
    name: "Subscript",
    parse: createDelimiterParser({ charCode: Ch.Comma, delimType: SubscriptDelim })
};
// ============================================================================
// Highlight/Styled Parser (@@.className content@@ or @@color:red;.class content@@)
// Follows TiddlyWiki pattern: styles first (property:value;), then classes (.class)
// ============================================================================
// Regex matching CSS styles: one or more property:value; pairs
// Property cannot contain . \r \n \s :
// Value cannot contain \r \n ;
const cssStylesRe = /^((?:[^\.\r\n\s:]+:[^\r\n;]+;)+)/;
export const Highlight = {
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
        let contentStart = 0;
        // First: parse CSS styles (property:value;)+
        const stylesMatch = cssStylesRe.exec(content);
        if (stylesMatch) {
            const stylesEnd = stylesMatch[1].length;
            // Create HighlightStyles node for CSS overlay parsing
            children.push(cx.elt(Type.HighlightStyles, pos + 2, pos + 2 + stylesEnd));
            contentStart = stylesEnd;
        }
        // Second: parse .className(s) - can come after styles or at the start
        while (contentStart < content.length && content[contentStart] === '.') {
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
        // Skip leading space after classes/styles (required before content)
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
const placeholderLinkTargetRe = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/;
/**
 * Create LinkTarget element, checking for $param$ placeholder pattern
 */
function createLinkTargetElement(cx, target, start, end) {
    const match = placeholderLinkTargetRe.exec(target);
    if (match) {
        const paramName = match[1];
        return cx.elt(Type.Placeholder, start, end, [
            cx.elt(Type.PlaceholderMark, start, start + 1),
            cx.elt(Type.VariableName, start + 1, start + 1 + paramName.length),
            cx.elt(Type.PlaceholderMark, end - 1, end)
        ]);
    }
    return cx.elt(Type.LinkTarget, start, end);
}
export const WikiLink = {
    name: "WikiLink",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBracket || cx.char(pos + 1) !== Ch.LeftBracket)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = wikiLinkRe.exec(text);
        if (!match) {
            // Handle incomplete wiki link - [[ without ]]
            // Match content up to end of line or newline
            const incompleteMatch = /^\[\[([^\]\n]*)$/.exec(text);
            if (incompleteMatch) {
                const end = pos + incompleteMatch[0].length;
                const content = incompleteMatch[1];
                const children = [
                    cx.elt(Type.WikiLinkMark, pos, pos + 2),
                ];
                // Check for | separator
                const pipeIdx = content.indexOf('|');
                if (pipeIdx !== -1) {
                    children.push(cx.elt(Type.LinkText, pos + 2, pos + 2 + pipeIdx));
                    children.push(cx.elt(Type.LinkSeparator, pos + 2 + pipeIdx, pos + 3 + pipeIdx));
                    if (content.length > pipeIdx + 1) {
                        const targetStr = content.slice(pipeIdx + 1);
                        children.push(createLinkTargetElement(cx, targetStr, pos + 3 + pipeIdx, end));
                    }
                }
                else if (content) {
                    children.push(createLinkTargetElement(cx, content, pos + 2, end));
                }
                return cx.addElement(cx.elt(Type.WikiLink, pos, end, children));
            }
            return -1;
        }
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
            children.push(createLinkTargetElement(cx, secondPart, pos + 3 + firstPart.length, end - 2));
        }
        else {
            // [[target]]
            children.push(createLinkTargetElement(cx, firstPart, pos + 2, end - 2));
        }
        children.push(cx.elt(Type.WikiLinkMark, end - 2, end));
        return cx.addElement(cx.elt(Type.WikiLink, pos, end, children));
    }
};
// ============================================================================
// External Link Parser ([ext[text|url]] or [ext[url]])
// ============================================================================
const extLinkRe = /^\[ext\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/;
export const ExternalLink = {
    name: "ExternalLink",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBracket)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = extLinkRe.exec(text);
        if (!match) {
            // Handle incomplete external link - [ext[ without ]]
            const incompleteMatch = /^\[ext\[([^\]\n]*)$/.exec(text);
            if (incompleteMatch) {
                const end = pos + incompleteMatch[0].length;
                const content = incompleteMatch[1];
                const children = [
                    cx.elt(Type.ExtLinkMark, pos, pos + 5), // [ext[
                ];
                // Check for | separator
                const pipeIdx = content.indexOf('|');
                if (pipeIdx !== -1) {
                    children.push(cx.elt(Type.LinkText, pos + 5, pos + 5 + pipeIdx));
                    children.push(cx.elt(Type.LinkSeparator, pos + 5 + pipeIdx, pos + 6 + pipeIdx));
                    if (content.length > pipeIdx + 1) {
                        const urlStr = content.slice(pipeIdx + 1);
                        children.push(createURLLinkElement(urlStr, pos + 6 + pipeIdx, end));
                    }
                }
                else if (content) {
                    children.push(createURLLinkElement(content, pos + 5, end));
                }
                return cx.addElement(cx.elt(Type.ExternalLink, pos, end, children));
            }
            return -1;
        }
        const end = pos + match[0].length;
        const firstPart = match[1];
        const secondPart = match[2];
        const children = [
            cx.elt(Type.ExtLinkMark, pos, pos + 5), // [ext[
        ];
        if (secondPart !== undefined) {
            children.push(cx.elt(Type.LinkText, pos + 5, pos + 5 + firstPart.length));
            children.push(cx.elt(Type.LinkSeparator, pos + 5 + firstPart.length, pos + 6 + firstPart.length));
            children.push(createURLLinkElement(secondPart, pos + 6 + firstPart.length, end - 2));
        }
        else {
            children.push(createURLLinkElement(firstPart, pos + 5, end - 2));
        }
        children.push(cx.elt(Type.ExtLinkMark, end - 2, end));
        return cx.addElement(cx.elt(Type.ExternalLink, pos, end, children));
    }
};
// ============================================================================
// Image Link Parser ([img[src]] or [img width=x height=y [tooltip|src]])
// ============================================================================
const imgLinkRe = /^\[img(\s+[^\[]+)?\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/;
export const ImageLink = {
    name: "ImageLink",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBracket)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = imgLinkRe.exec(text);
        if (!match) {
            // Handle incomplete image link - [img[ without ]]
            const incompleteMatch = /^\[img(\s+[^\[\n]+)?\[([^\]\n]*)$/.exec(text);
            if (incompleteMatch) {
                const end = pos + incompleteMatch[0].length;
                const attrs = incompleteMatch[1];
                const content = incompleteMatch[2];
                const children = [
                    cx.elt(Type.ImageMark, pos, pos + 4), // [img
                ];
                let attrEnd = pos + 4;
                // Parse attributes if present
                if (attrs) {
                    const attrStart = pos + 4;
                    attrEnd = attrStart + attrs.length;
                    const attrElements = parseInlineAttributes(cx, attrs.trim(), attrStart + (attrs.length - attrs.trimStart().length));
                    children.push(...attrElements);
                }
                // Add the opening [ of the source bracket
                children.push(cx.elt(Type.ImageMark, attrEnd, attrEnd + 1)); // [
                // Parse content
                if (content) {
                    const innerStart = attrEnd + 1;
                    const pipeIdx = content.indexOf('|');
                    if (pipeIdx !== -1) {
                        children.push(cx.elt(Type.ImageTooltip, innerStart, innerStart + pipeIdx));
                        children.push(cx.elt(Type.LinkSeparator, innerStart + pipeIdx, innerStart + pipeIdx + 1));
                        if (content.length > pipeIdx + 1) {
                            const sourceStr = content.slice(pipeIdx + 1);
                            children.push(createImageSourceElement(sourceStr, innerStart + pipeIdx + 1, end));
                        }
                    }
                    else {
                        children.push(createImageSourceElement(content, innerStart, end));
                    }
                }
                return cx.addElement(cx.elt(Type.ImageLink, pos, end, children));
            }
            return -1;
        }
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
                children.push(createImageSourceElement(source, sourceStart, sourceEnd));
            }
        }
        else {
            // Just source, no tooltip
            const sourceEnd = innerStart + tooltipOrSource.length;
            if (tooltipOrSource) {
                children.push(createImageSourceElement(tooltipOrSource, innerStart, sourceEnd));
            }
        }
        children.push(cx.elt(Type.ImageMark, end - 2, end)); // ]]
        return cx.addElement(cx.elt(Type.ImageLink, pos, end, children));
    }
};
// ============================================================================
// Incomplete Filter Run Parser
// Matches [operator... patterns that aren't WikiLinks, ImageLinks, or ExternalLinks
// This creates a filter context for autocompletion in plain text
// ============================================================================
export const IncompleteFilterRun = {
    name: "IncompleteFilterRun",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBracket)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Skip if it's a WikiLink [[, ImageLink [img, or ExternalLink [ext
        // Those are handled by their dedicated parsers
        if (text.startsWith("[[") || text.startsWith("[img") || text.startsWith("[ext")) {
            return -1;
        }
        // Match filter patterns:
        // 1. [operator... - operator must start with word char (or ! for negation)
        // 2. [<variable>... - starts with variable reference
        // 3. [{field}... - starts with field reference
        // Pattern supports operator names with word chars, dashes, colons, exclamation marks, and dots (for functions)
        const filterPattern = /^\[(?:!?[\w][\w\-:!.]*(?:[\[{<]|$)|[<{])/;
        if (!filterPattern.test(text)) {
            return -1;
        }
        // Find the extent of this incomplete filter run
        // It continues until we hit ]] (complete), newline, or certain stop characters
        // We want to include: [op[val], [op[val]op2[val2], [func[a],[b]], [func<var1>,<var2>], etc.
        let end = pos + 1;
        let bracketDepth = 1;
        let inOperand = false;
        let operandChar = "";
        while (end < cx.end && bracketDepth > 0) {
            const ch = cx.char(end);
            if (ch === Ch.Newline) {
                break;
            }
            if (inOperand) {
                // Inside an operand [val], {val}, or <val>
                if ((operandChar === "[" && ch === Ch.RightBracket) ||
                    (operandChar === "{" && ch === Ch.RightBrace) ||
                    (operandChar === "<" && ch === Ch.GreaterThan)) {
                    inOperand = false;
                    operandChar = "";
                    end++;
                    continue;
                }
            }
            else {
                // Not inside an operand
                if (ch === Ch.LeftBracket) {
                    // Could be start of operand or nested filter
                    const nextCh = cx.char(end + 1);
                    if (nextCh === Ch.LeftBracket) {
                        // [[ - this might be a WikiLink starting, stop here
                        break;
                    }
                    inOperand = true;
                    operandChar = "[";
                }
                else if (ch === Ch.LeftBrace) {
                    inOperand = true;
                    operandChar = "{";
                }
                else if (ch === Ch.LessThan) {
                    inOperand = true;
                    operandChar = "<";
                }
                else if (ch === Ch.RightBracket) {
                    // Closing bracket - could be end of filter run
                    bracketDepth--;
                    if (bracketDepth === 0) {
                        end++; // Include this ]
                        // Check if there's another ] right after (complete filter run ]])
                        if (cx.char(end) === Ch.RightBracket) {
                            // Complete filter run - don't create IncompleteFilterRun
                            return -1;
                        }
                        break;
                    }
                }
                else if (ch === Ch.Comma) {
                    // Comma separates multiple operands for functions like [my.func[a],[b]] or [my.func<v1>,<v2>]
                    // Continue parsing - next should be an operand opener
                    end++;
                    continue;
                }
                else if (ch === Ch.Space || ch === Ch.Tab) {
                    // Space outside operand usually ends the filter context in plain text
                    // unless followed by another [ (new filter run)
                    const nextNonSpace = findNextNonSpace(cx, end);
                    if (nextNonSpace === -1 || cx.char(nextNonSpace) !== Ch.LeftBracket) {
                        break;
                    }
                }
            }
            end++;
        }
        // Must have consumed more than just [
        if (end <= pos + 1) {
            return -1;
        }
        // Parse the filter content to create child nodes for syntax highlighting
        const filterContent = cx.slice(pos, end);
        const filterChildren = parseFilterExpressionDetailed(filterContent, pos);
        return cx.addElement(cx.elt(Type.IncompleteFilterRun, pos, end, filterChildren));
    }
};
// Helper to find next non-space character
function findNextNonSpace(cx, pos) {
    while (pos < cx.end) {
        const ch = cx.char(pos);
        if (ch !== Ch.Space && ch !== Ch.Tab) {
            return pos;
        }
        pos++;
    }
    return -1;
}
// ============================================================================
// Transclusion Parser ({{ref}} or {{ref!!field}} etc)
// ============================================================================
const transclusionRe = /^\{\{([^{}|]*?)(?:\|\|([^{}|]+?))?(?:\|([^{}]+?))?\}\}/;
// parseTransclusionTarget is now imported from utils.ts
export const Transclusion = {
    name: "Transclusion",
    parse(cx, next, pos) {
        if (next !== Ch.LeftBrace || cx.char(pos + 1) !== Ch.LeftBrace)
            return -1;
        // Make sure it's not {{{
        if (cx.char(pos + 2) === Ch.LeftBrace)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = transclusionRe.exec(text);
        if (!match) {
            // Handle incomplete transclusion - {{ without }}
            // Don't match if there are formatting delimiters after {{ (they should close their own constructs)
            const incompleteMatch = /^\{\{([^{}\n~'^/_`<\[]*?)(?=~~|''|\/\/|^^|,,|``|<<|__|$)/.exec(text);
            if (incompleteMatch && incompleteMatch[0].length > 2) {
                const end = pos + incompleteMatch[0].length;
                const target = incompleteMatch[1];
                const children = [
                    cx.elt(Type.TransclusionMark, pos, pos + 2),
                ];
                if (target) {
                    // Parse target details (tiddler!!field or tiddler##index)
                    const targetChildren = parseTransclusionTarget(target, pos + 2);
                    children.push(...targetChildren);
                }
                return cx.addElement(cx.elt(Type.Transclusion, pos, end, children));
            }
            return -1;
        }
        const end = pos + match[0].length;
        const target = match[1];
        const template = match[2];
        const children = [
            cx.elt(Type.TransclusionMark, pos, pos + 2),
        ];
        // Parse target details (tiddler!!field or tiddler##index)
        const targetChildren = parseTransclusionTarget(target, pos + 2);
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
// Filtered Transclusion Parser ({{{filter}}})
// ============================================================================
export const FilteredTransclusion = {
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
        if (filterEnd === -1) {
            // Handle incomplete filtered transclusion - {{{ without }}}
            // Don't match if there are formatting delimiters after {{{ (they should close their own constructs)
            const incompleteMatch = /^\{\{\{([^\n~'^/_`<\[]*?)(?=~~|''|\/\/|^^|,,|``|<<|__|$)/.exec(text);
            if (incompleteMatch && incompleteMatch[0].length > 3) {
                const end = pos + incompleteMatch[0].length;
                const filter = incompleteMatch[1];
                // Parse filter expression details
                const filterChildren = parseFilterExpressionDetailed(filter, pos + 3);
                const children = [
                    cx.elt(Type.FilteredTransclusionMark, pos, pos + 3),
                ];
                if (filter) {
                    children.push(cx.elt(Type.FilterExpression, pos + 3, end, filterChildren));
                }
                return cx.addElement(cx.elt(Type.FilteredTransclusion, pos, end, children));
            }
            return -1;
        }
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
        const filterChildren = parseFilterExpressionDetailed(filter, pos + 3);
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
// Multi-Valued Variable Display Parser (((varname)) or (((filter))))
// ============================================================================
export const MVVDisplayInline = {
    name: "MVVDisplay",
    parse(cx, next, pos) {
        // Must start with ((
        if (next !== 40 /* ( */ || cx.char(pos + 1) !== 40 /* ( */)
            return -1;
        const text = cx.slice(pos, cx.end);
        if (cx.char(pos + 2) === 40 /* ( */) {
            // Filter mode: (((filter))) or (((filter||sep)))
            const filterMatch = /^\(\(\(([\s\S]+?)\)\)\)/.exec(text);
            if (!filterMatch)
                return -1;
            const end = pos + filterMatch[0].length;
            const inner = filterMatch[1];
            // Check for separator: split on last || before )))
            const sepIndex = inner.lastIndexOf("||");
            const children = [
                cx.elt(Type.MVVDisplayMark, pos, pos + 3), // (((
            ];
            if (sepIndex >= 0) {
                const filterContent = inner.substring(0, sepIndex);
                const separator = inner.substring(sepIndex + 2);
                const filterElements = parseFilterExpressionDetailed(filterContent, pos + 3);
                children.push(cx.elt(Type.FilterExpression, pos + 3, pos + 3 + filterContent.length, filterElements));
                const sepMarkStart = pos + 3 + filterContent.length;
                children.push(cx.elt(Type.MVVSeparatorMark, sepMarkStart, sepMarkStart + 2)); // ||
                if (separator.length > 0) {
                    children.push(cx.elt(Type.MVVSeparatorValue, sepMarkStart + 2, sepMarkStart + 2 + separator.length));
                }
            }
            else {
                const filterElements = parseFilterExpressionDetailed(inner, pos + 3);
                children.push(cx.elt(Type.FilterExpression, pos + 3, end - 3, filterElements));
            }
            children.push(cx.elt(Type.MVVDisplayMark, end - 3, end)); // )))
            return cx.addElement(cx.elt(Type.MVVDisplay, pos, end, children));
        }
        else {
            // Variable mode: ((varname)) or ((varname||sep))
            const varMatch = /^\(\(([^()|]+?)(?:\|\|([^)]*))?\)\)/.exec(text);
            if (!varMatch)
                return -1;
            const end = pos + varMatch[0].length;
            const varName = varMatch[1];
            const separator = varMatch[2];
            const children = [
                cx.elt(Type.MVVDisplayMark, pos, pos + 2), // ((
                cx.elt(Type.VariableName, pos + 2, pos + 2 + varName.length),
            ];
            if (separator !== undefined) {
                const sepMarkStart = pos + 2 + varName.length;
                children.push(cx.elt(Type.MVVSeparatorMark, sepMarkStart, sepMarkStart + 2)); // ||
                if (separator.length > 0) {
                    children.push(cx.elt(Type.MVVSeparatorValue, sepMarkStart + 2, sepMarkStart + 2 + separator.length));
                }
            }
            children.push(cx.elt(Type.MVVDisplayMark, end - 2, end)); // ))
            return cx.addElement(cx.elt(Type.MVVDisplay, pos, end, children));
        }
    }
};
// ============================================================================
// Macro Call Parser (<<macro params>>)
// ============================================================================
// parseMacroParams is imported from utils.ts as parseMacroParamsUtil
export const MacroCall = {
    name: "MacroCall",
    parse(cx, next, pos) {
        if (next !== Ch.LessThan || cx.char(pos + 1) !== Ch.LessThan)
            return -1;
        // Don't parse <<< as a macro (it's block quote syntax)
        if (cx.char(pos + 2) === Ch.LessThan)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Find closing >> handling nested macros
        const maxSearch = text.length - 1;
        let closePos = -1;
        let depth = 1;
        let lineEnd = -1; // Track end of first line for incomplete macros
        for (let i = 2; i < maxSearch; i++) {
            if (lineEnd === -1 && text[i] === '\n') {
                lineEnd = i;
            }
            // Skip braced blocks to avoid false >> matches inside {{{...}}} or {{...}}
            const afterBraced = skipBracedBlock(text, i);
            if (afterBraced > i) {
                i = afterBraced - 1; // -1 because for loop increments
                continue;
            }
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
        // Handle incomplete macro (no closing >>) - only on same line
        const isIncomplete = closePos === -1;
        if (isIncomplete) {
            // Only parse incomplete macros on the same line (for typing experience)
            if (lineEnd === -1) {
                // No newline found, use end of text
                closePos = text.length;
            }
            else {
                closePos = lineEnd;
            }
            // Must have at least a name (stop at whitespace, newline, or >)
            let nameEnd = 2;
            while (nameEnd < closePos && !/[\s\n>]/.test(text[nameEnd]))
                nameEnd++;
            if (nameEnd === 2)
                return -1; // No name found
        }
        const end = pos + closePos + (isIncomplete ? 0 : 2);
        // Sanity check: end must be greater than pos and within document bounds
        if (end <= pos || end > cx.end)
            return -1;
        // Parse macro name (stop at whitespace or >)
        let nameEnd = 2;
        while (nameEnd < closePos && !/[\s>]/.test(text[nameEnd]))
            nameEnd++;
        const name = text.slice(2, nameEnd);
        if (!name)
            return -1;
        const children = [
            cx.elt(Type.MacroCallMark, pos, pos + 2),
        ];
        // Check if name is a substituted parameter: __param__ (complete) or __param (incomplete)
        // Always create SubstitutedParam for proper syntax highlighting
        // (linter can validate if param is actually defined)
        const substitutedMatch = /^__(.+)__$/.exec(name);
        const incompleteSubstitutedMatch = !substitutedMatch && /^__(.*)$/.exec(name);
        if (substitutedMatch) {
            const paramName = substitutedMatch[1];
            const nameStart = pos + 2;
            const nameChildren = [
                cx.elt(Type.SubstitutedParamMark, nameStart, nameStart + 2), // __
                cx.elt(Type.SubstitutedParamName, nameStart + 2, nameStart + 2 + paramName.length),
                cx.elt(Type.SubstitutedParamMark, nameStart + 2 + paramName.length, nameStart + name.length), // __
            ];
            children.push(cx.elt(Type.SubstitutedParam, nameStart, nameStart + name.length, nameChildren));
        }
        else if (incompleteSubstitutedMatch) {
            // Handle incomplete pattern like __param or just __
            const paramName = incompleteSubstitutedMatch[1];
            const nameStart = pos + 2;
            const nameChildren = [
                cx.elt(Type.SubstitutedParamMark, nameStart, nameStart + 2), // __
            ];
            if (paramName) {
                nameChildren.push(cx.elt(Type.SubstitutedParamName, nameStart + 2, nameStart + 2 + paramName.length));
            }
            children.push(cx.elt(Type.SubstitutedParam, nameStart, nameStart + name.length, nameChildren));
        }
        else {
            // Check for $param$ placeholder pattern in macro name
            const placeholderMatch = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/.exec(name);
            if (placeholderMatch) {
                const paramName = placeholderMatch[1];
                const nameStart = pos + 2;
                const placeholderChildren = [
                    cx.elt(Type.PlaceholderMark, nameStart, nameStart + 1), // $
                    cx.elt(Type.VariableName, nameStart + 1, nameStart + 1 + paramName.length),
                    cx.elt(Type.PlaceholderMark, nameStart + name.length - 1, nameStart + name.length), // $
                ];
                children.push(cx.elt(Type.Placeholder, nameStart, nameStart + name.length, placeholderChildren));
            }
            else {
                children.push(cx.elt(Type.MacroName, pos + 2, pos + 2 + name.length));
            }
        }
        // Parse parameters - only if we have valid range
        if (nameEnd < closePos) {
            const paramsStr = text.slice(nameEnd, closePos);
            if (paramsStr.trim()) {
                const paramElements = parseMacroParamsUtil(paramsStr, pos + nameEnd);
                children.push(...paramElements);
            }
        }
        if (!isIncomplete) {
            children.push(cx.elt(Type.MacroCallMark, end - 2, end));
        }
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
        else {
            pos++;
        }
    }
    return null;
}
/**
 * Find the end of an incomplete tag (one without a closing >).
 * Unlike findTagEnd, this finds where to stop parsing attributes when no > is found.
 * It properly handles quoted strings and filter brackets, so < inside these won't stop the scan.
 * Returns the position after the widget name where attributes end.
 */
function findIncompleteTagEnd(text, afterName) {
    let pos = afterName;
    const len = text.length;
    let inQuote = null;
    let filterBrackets = 0; // Track {{{ }}} nesting
    let squareBrackets = 0; // Track [ ] nesting inside filters
    let macroBrackets = 0; // Track << >> nesting
    while (pos < len) {
        const ch = text[pos];
        const twoChar = text.slice(pos, pos + 2);
        const threeChar = text.slice(pos, pos + 3);
        // Handle quoted strings - < inside quotes shouldn't stop the scan
        if (inQuote) {
            if (ch === inQuote && text[pos - 1] !== '\\') {
                inQuote = null;
            }
            pos++;
            continue;
        }
        // Start of a quoted string
        if (ch === '"' || ch === "'") {
            // Check for triple quotes
            if (ch === '"' && threeChar === '"""') {
                pos += 3;
                while (pos < len && text.slice(pos, pos + 3) !== '"""') {
                    pos++;
                }
                if (pos < len)
                    pos += 3;
                continue;
            }
            inQuote = ch;
            pos++;
            continue;
        }
        // Track {{{ }}} filter brackets
        if (threeChar === '{{{') {
            filterBrackets++;
            pos += 3;
            continue;
        }
        if (threeChar === '}}}') {
            if (filterBrackets > 0)
                filterBrackets--;
            pos += 3;
            continue;
        }
        // Track << >> macro brackets
        if (twoChar === '<<') {
            macroBrackets++;
            pos += 2;
            continue;
        }
        if (twoChar === '>>') {
            if (macroBrackets > 0)
                macroBrackets--;
            pos += 2;
            continue;
        }
        // Track [ ] square brackets (only meaningful inside filters or as filter attributes)
        if (ch === '[' && (filterBrackets > 0 || macroBrackets > 0)) {
            squareBrackets++;
            pos++;
            continue;
        }
        if (ch === ']' && squareBrackets > 0) {
            squareBrackets--;
            pos++;
            continue;
        }
        // Stop at < only when NOT inside any bracket context
        if (ch === '<') {
            if (filterBrackets === 0 && squareBrackets === 0 && macroBrackets === 0) {
                return pos;
            }
            // Inside a filter/macro context, < is part of a variable reference like <tag>
            pos++;
            continue;
        }
        // Stop at newline only when not inside brackets
        if (ch === '\n') {
            if (filterBrackets === 0 && squareBrackets === 0 && macroBrackets === 0) {
                return pos;
            }
            pos++;
            continue;
        }
        // Stop at formatting delimiters only when not inside brackets
        if (filterBrackets === 0 && squareBrackets === 0 && macroBrackets === 0) {
            if (twoChar === '~~' || twoChar === "''" || twoChar === '//' ||
                twoChar === '^^' || twoChar === ',,' || twoChar === '``' ||
                twoChar === '__') {
                return pos;
            }
        }
        pos++;
    }
    return pos;
}
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
function parsePlaceholdersInString(cx, content, offset) {
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
            elements.push(cx.elt(Type.AttributeValue, offset + lastEnd, offset + matchStart));
        }
        // Add the placeholder node with proper children
        const placeholderChildren = [
            cx.elt(Type.PlaceholderMark, offset + matchStart, offset + matchStart + 1), // $
            cx.elt(Type.VariableName, offset + matchStart + 1, offset + matchStart + 1 + paramName.length),
            cx.elt(Type.PlaceholderMark, offset + matchEnd - 1, offset + matchEnd) // $
        ];
        elements.push(cx.elt(Type.Placeholder, offset + matchStart, offset + matchEnd, placeholderChildren));
        lastEnd = matchEnd;
    }
    // Add any remaining text after last placeholder
    if (elements.length > 0 && lastEnd < content.length) {
        elements.push(cx.elt(Type.AttributeValue, offset + lastEnd, offset + content.length));
    }
    return elements;
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
        // Parse attribute name - TiddlyWiki allows any char except /\s>"'`=
        const nameStart = pos;
        while (pos < len && /[^\/\s>"'`=]/.test(attrString[pos]))
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
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd)
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
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd)
            ];
            elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + pos, attrChildren));
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
                cx.elt(Type.Mark, offset + openMarkStart, offset + stringStart), // Opening """
            ];
            if (stringContent.trim()) {
                // Parse the content as a full document (with pragmas)
                const wikitextElements = cx.parser.parseContent(stringContent, offset + stringStart);
                valueChildren.push(...wikitextElements);
                valueChildren.push(cx.elt(Type.Mark, offset + closeMarkStart, offset + valueEnd)); // Closing """
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    cx.elt(Type.AttributeWikitext, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            }
            else {
                // Empty content - treat as plain string
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    cx.elt(Type.AttributeString, offset + valueStart, offset + valueEnd)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
            }
            continue;
        }
        else if (ch === '"' || ch === "'") {
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
            if (attrName === 'filter' || attrName === '$filter' ||
                attrName === '$names' || attrName === '$values') {
                const filterContent = attrString.slice(stringStart, stringEnd);
                const filterChildren = parseFilterExpressionDetailed(filterContent, offset + stringStart);
                const valueChildren = [
                    cx.elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                    cx.elt(Type.FilterExpression, offset + stringStart, offset + stringEnd, filterChildren),
                    cx.elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    cx.elt(Type.AttributeFiltered, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                continue;
            }
            // Check if this is a wikitext attribute - parse content as full wikitext (including pragmas)
            if (WIKITEXT_ATTR_NAMES.has(attrName)) {
                const stringContent = attrString.slice(stringStart, stringEnd);
                if (stringContent.trim()) {
                    // Use parseContent for full document parsing (including pragmas like \procedure, \define, etc.)
                    const wikitextElements = cx.parser.parseContent(stringContent, offset + stringStart);
                    const valueChildren = [
                        cx.elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                        ...wikitextElements,
                        cx.elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                    ];
                    const attrChildren = [
                        createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                        cx.elt(Type.AttributeWikitext, offset + valueStart, offset + valueEnd, valueChildren)
                    ];
                    elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                    continue;
                }
            }
            // Check for $param$ placeholders in regular string attributes
            // This is for \define macro bodies where $param$ can appear anywhere
            const stringContent = attrString.slice(stringStart, stringEnd);
            if (stringContent.includes('$')) {
                const placeholderChildren = parsePlaceholdersInString(cx, stringContent, offset + stringStart);
                if (placeholderChildren.length > 0) {
                    const valueChildren = [
                        cx.elt(Type.Mark, offset + valueStart, offset + stringStart), // Opening quote
                        ...placeholderChildren,
                        cx.elt(Type.Mark, offset + stringEnd, offset + valueEnd) // Closing quote
                    ];
                    const attrChildren = [
                        createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                        cx.elt(Type.AttributeString, offset + valueStart, offset + valueEnd, valueChildren)
                    ];
                    elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
                    continue;
                }
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
                const filterChildren = parseFilterExpressionDetailed(filterContent, offset + filterStart);
                // Create child elements for filtered transclusion
                const valueChildren = [
                    cx.elt(Type.FilteredTransclusionMark, offset + openMarkStart, offset + openMarkStart + 3),
                    cx.elt(Type.FilterExpression, offset + filterStart, offset + filterEnd, filterChildren),
                    cx.elt(Type.FilteredTransclusionMark, offset + filterEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
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
                const targetChildren = parseTransclusionTarget(targetContent, offset + targetStart);
                // Create child elements for transclusion
                const valueChildren = [
                    cx.elt(Type.TransclusionMark, offset + openMarkStart, offset + openMarkStart + 2),
                    ...targetChildren,
                    cx.elt(Type.TransclusionMark, offset + targetEnd, offset + valueEnd)
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
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
            // Parse macro name - TiddlyWiki allows any char except whitespace, >, ", ', =
            while (pos < len && /[^\s>"'=]/.test(attrString[pos]))
                pos++;
            const macroNameEnd = pos;
            // Skip to end of macro
            let depth = 1;
            while (pos < len && depth > 0) {
                // Skip braced blocks to avoid false >> matches inside {{{...}}} or {{...}}
                const afterBraced = skipBracedBlock(attrString, pos);
                if (afterBraced > pos) {
                    pos = afterBraced;
                    continue;
                }
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
                cx.elt(Type.MacroCallMark, offset + openMarkStart, offset + openMarkStart + 2),
            ];
            // Check if name is a substituted parameter: __param__
            const substitutedMatch = /^__(.+)__$/.exec(macroName);
            if (substitutedMatch) {
                const paramName = substitutedMatch[1];
                const nameStart2 = offset + macroContentStart;
                const nameChildren = [
                    cx.elt(Type.SubstitutedParamMark, nameStart2, nameStart2 + 2), // __
                    cx.elt(Type.SubstitutedParamName, nameStart2 + 2, nameStart2 + 2 + paramName.length),
                    cx.elt(Type.SubstitutedParamMark, nameStart2 + 2 + paramName.length, nameStart2 + macroName.length), // __
                ];
                valueChildren.push(cx.elt(Type.SubstitutedParam, nameStart2, nameStart2 + macroName.length, nameChildren));
            }
            else {
                valueChildren.push(cx.elt(Type.MacroName, offset + macroContentStart, offset + macroNameEnd));
            }
            valueChildren.push(cx.elt(Type.MacroCallMark, offset + closeMarkStart, offset + valueEnd));
            const attrChildren = [
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                cx.elt(valueType, offset + valueStart, offset + valueEnd, valueChildren)
            ];
            elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
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
                    cx.elt(Type.MVVDisplayMark, offset + valueStart, offset + openMarkEnd), // ((
                    cx.elt(Type.VariableName, offset + openMarkEnd, offset + openMarkEnd + varName.length),
                ];
                if (separator !== undefined) {
                    const sepMarkStart = openMarkEnd + varName.length;
                    valueChildren.push(cx.elt(Type.MVVSeparatorMark, offset + sepMarkStart, offset + sepMarkStart + 2)); // ||
                    if (separator.length > 0) {
                        valueChildren.push(cx.elt(Type.MVVSeparatorValue, offset + sepMarkStart + 2, offset + sepMarkStart + 2 + separator.length));
                    }
                }
                valueChildren.push(cx.elt(Type.MVVDisplayMark, offset + valueEnd - 2, offset + valueEnd)); // ))
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    cx.elt(Type.AttributeMVV, offset + valueStart, offset + valueEnd, valueChildren)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
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
                        const filterChildren = parseFilterExpressionDetailed(filterContent, filterExprStart + (filterMatch[1].length - filterMatch[1].trimStart().length));
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
                createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
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
            // Check for $param$ placeholder pattern in unquoted value
            const placeholderValueMatch = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/.exec(valueText);
            if (placeholderValueMatch) {
                const paramName = placeholderValueMatch[1];
                const placeholderChildren = [
                    cx.elt(Type.PlaceholderMark, offset + valueStart, offset + valueStart + 1),
                    cx.elt(Type.VariableName, offset + valueStart + 1, offset + valueStart + 1 + paramName.length),
                    cx.elt(Type.PlaceholderMark, offset + valueEnd - 1, offset + valueEnd)
                ];
                const attrChildren = [
                    createAttributeNameElement(attrString.slice(nameStart, nameEnd), offset + nameStart, offset + nameEnd),
                    cx.elt(Type.Placeholder, offset + valueStart, offset + valueEnd, placeholderChildren)
                ];
                elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
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
            cx.elt(valueType, offset + valueStart, offset + valueEnd)
        ];
        elements.push(cx.elt(Type.Attribute, offset + nameStart, offset + valueEnd, attrChildren));
    }
    return elements;
}
// ============================================================================
// Widget Parser (<$widget>content</$widget> or <$widget/>)
// ============================================================================
const widgetStartRe = /^<(\$[a-zA-Z0-9\-\$\.]*)/;
// Match placeholder tag pattern: <$name$> where $name$ is a \define placeholder
const placeholderTagRe = /^<\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/;
export const Widget = {
    name: "Widget",
    parse(cx, next, pos) {
        if (next !== Ch.LessThan)
            return -1;
        if (cx.char(pos + 1) !== Ch.Dollar)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Check for placeholder tag pattern first: <$param$>
        const placeholderMatch = placeholderTagRe.exec(text);
        if (placeholderMatch) {
            const paramName = placeholderMatch[1];
            const placeholderEnd = placeholderMatch[0].length; // The closing $ is already in the match
            // Find the tag end (> or attributes then >)
            const afterPlaceholder = text.slice(placeholderEnd);
            const tagEndMatch = afterPlaceholder.match(/^(\s*[^>]*)?>/);
            if (tagEndMatch) {
                const attrString = tagEndMatch[1] || "";
                const tagEnd = pos + placeholderEnd + tagEndMatch[0].length;
                const isSelfClosing = tagEndMatch[0].endsWith("/>");
                // Create placeholder children
                const placeholderStart = pos + 1; // After <
                const placeholderNodeEnd = pos + placeholderEnd; // End of $param$
                const placeholderChildren = [
                    cx.elt(Type.PlaceholderMark, placeholderStart, placeholderStart + 1), // $
                    cx.elt(Type.VariableName, placeholderStart + 1, placeholderStart + 1 + paramName.length),
                    cx.elt(Type.PlaceholderMark, placeholderNodeEnd - 1, placeholderNodeEnd) // $
                ];
                const children = [
                    cx.elt(Type.TagMark, pos, pos + 1), // <
                    cx.elt(Type.Placeholder, placeholderStart, placeholderNodeEnd, placeholderChildren),
                ];
                // Parse attributes if any
                if (attrString.trim()) {
                    const attrElements = parseInlineAttributes(cx, attrString.trim(), pos + placeholderEnd);
                    children.push(...attrElements);
                }
                if (isSelfClosing) {
                    children.push(cx.elt(Type.SelfClosingMarker, tagEnd - 2, tagEnd - 1));
                    children.push(cx.elt(Type.TagMark, tagEnd - 1, tagEnd)); // >
                }
                else {
                    children.push(cx.elt(Type.TagMark, tagEnd - 1, tagEnd)); // >
                    // Look for closing tag </$param$>
                    const closeTagPattern = `</$${paramName}$>`;
                    const restOfText = text.slice(tagEnd - pos);
                    const closeTagIndex = restOfText.indexOf(closeTagPattern);
                    if (closeTagIndex !== -1) {
                        // Parse content between opening and closing tags
                        const contentStart = tagEnd;
                        const contentEnd = tagEnd + closeTagIndex;
                        const contentText = cx.slice(contentStart, contentEnd);
                        if (contentText.length > 0) {
                            const contentElements = cx.parser.parseInline(contentText, contentStart);
                            children.push(...contentElements);
                        }
                        // Add closing tag elements
                        const closeTagStart = contentEnd;
                        const closeTagEnd = closeTagStart + closeTagPattern.length;
                        const closePlaceholderStart = closeTagStart + 2; // After </
                        const closePlaceholderEnd = closeTagEnd - 1; // Before >
                        const closePlaceholderChildren = [
                            cx.elt(Type.PlaceholderMark, closePlaceholderStart, closePlaceholderStart + 1), // $
                            cx.elt(Type.VariableName, closePlaceholderStart + 1, closePlaceholderStart + 1 + paramName.length),
                            cx.elt(Type.PlaceholderMark, closePlaceholderEnd - 1, closePlaceholderEnd) // $
                        ];
                        const closeTagChildren = [
                            cx.elt(Type.TagMark, closeTagStart, closeTagStart + 2), // </
                            cx.elt(Type.Placeholder, closePlaceholderStart, closePlaceholderEnd, closePlaceholderChildren),
                            cx.elt(Type.TagMark, closeTagEnd - 1, closeTagEnd) // >
                        ];
                        children.push(cx.elt(Type.WidgetEnd, closeTagStart, closeTagEnd, closeTagChildren));
                        return cx.addElement(cx.elt(Type.InlineWidget, pos, closeTagEnd, children));
                    }
                }
                return cx.addElement(cx.elt(Type.InlineWidget, pos, tagEnd, children));
            }
            // No > found on same line - create incomplete placeholder tag
            // This handles multi-line placeholder tags like <$element-tag$\n  attr="value"\n>
            const placeholderStart = pos + 1; // After <
            const placeholderNodeEnd = pos + placeholderEnd; // End of $param$
            const placeholderChildren = [
                cx.elt(Type.PlaceholderMark, placeholderStart, placeholderStart + 1), // $
                cx.elt(Type.VariableName, placeholderStart + 1, placeholderStart + 1 + paramName.length),
                cx.elt(Type.PlaceholderMark, placeholderNodeEnd - 1, placeholderNodeEnd) // $
            ];
            const children = [
                cx.elt(Type.TagMark, pos, pos + 1), // <
                cx.elt(Type.Placeholder, placeholderStart, placeholderNodeEnd, placeholderChildren),
            ];
            return cx.addElement(cx.elt(Type.InlineWidget, pos, placeholderNodeEnd, children));
        }
        const startMatch = widgetStartRe.exec(text);
        if (!startMatch)
            return -1;
        const name = startMatch[1];
        const afterName = startMatch[0].length;
        // Handle <$ with no widget name (just the prefix) - emit incomplete widget
        // TiddlyWiki treats this as "Undefined widget ''"
        // But if followed by > or />, include those in the widget tag
        if (name === "$") {
            const nextChar = text[afterName];
            if (nextChar === '>') {
                // <$> - complete but undefined widget
                const children = [
                    cx.elt(Type.TagMark, pos, pos + 1), // <
                    cx.elt(Type.WidgetName, pos + 1, pos + 2), // $
                    cx.elt(Type.TagMark, pos + 2, pos + 3), // >
                ];
                return cx.addElement(cx.elt(Type.InlineWidget, pos, pos + 3, children));
            }
            else if (nextChar === '/' && text[afterName + 1] === '>') {
                // <$/> - self-closing but undefined widget
                const children = [
                    cx.elt(Type.TagMark, pos, pos + 1), // <
                    cx.elt(Type.WidgetName, pos + 1, pos + 2), // $
                    cx.elt(Type.SelfClosingMarker, pos + 2, pos + 3), // /
                    cx.elt(Type.TagMark, pos + 3, pos + 4), // >
                ];
                return cx.addElement(cx.elt(Type.InlineWidget, pos, pos + 4, children));
            }
            else {
                // <$ followed by space or other - not a valid widget
                // Emit InvalidWidget node so the linter can flag it
                return cx.addElement(cx.elt(Type.InvalidWidget, pos, pos + 2)); // <$
            }
        }
        // Find the proper end of the tag (handling > inside attribute values)
        const tagResult = findTagEnd(text.slice(afterName));
        // Handle incomplete tag (no closing >)
        if (!tagResult) {
            // Find where the incomplete tag ends, properly handling quoted strings
            const incompleteEnd = findIncompleteTagEnd(text, afterName);
            const end = pos + incompleteEnd;
            const attrString = text.slice(afterName, incompleteEnd);
            const children = [
                cx.elt(Type.TagMark, pos, pos + 1), // <
                cx.elt(Type.WidgetName, pos + 1, pos + 1 + name.length),
            ];
            if (attrString.trim()) {
                const attrElements = parseInlineAttributes(cx, attrString, pos + afterName);
                children.push(...attrElements);
            }
            return cx.addElement(cx.elt(Type.IncompleteWidget, pos, end, children));
        }
        const openTagEnd = pos + afterName + tagResult.end;
        const attrString = text.slice(afterName, afterName + tagResult.end - (tagResult.selfClose ? 2 : 1));
        const children = [
            cx.elt(Type.TagMark, pos, pos + 1), // <
            cx.elt(Type.WidgetName, pos + 1, pos + 1 + name.length),
        ];
        // Parse attributes
        if (attrString.trim()) {
            const attrElements = parseInlineAttributes(cx, attrString, pos + afterName);
            children.push(...attrElements);
        }
        if (tagResult.selfClose) {
            children.push(cx.elt(Type.SelfClosingMarker, openTagEnd - 2, openTagEnd - 1));
            children.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)); // >
            return cx.addElement(cx.elt(Type.InlineWidget, pos, openTagEnd, children));
        }
        children.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)); // >
        // Look for closing tag </$name> with proper depth counting for nested same-name widgets
        // Also track other widgets to detect "trapped" closing tags
        const closeTagPattern = `</${name}>`;
        const restOfText = text.slice(afterName + tagResult.end);
        // Helper function to find real tags in text, excluding filter variable references
        // Same logic as in block-parsers.ts
        const findRealTags = (text) => {
            const tags = [];
            let i = 0;
            let filterDepth = 0;
            let filterRunDepth = 0;
            let transcludeDepth = 0;
            let macroDepth = 0;
            let conditionalDepth = 0;
            while (i < text.length) {
                const ch = text[i];
                const ch2 = text.slice(i, i + 2);
                const ch3 = text.slice(i, i + 3);
                // Track <%if%>...<%endif%> conditionals
                if (ch2 === '<%') {
                    const conditionalMatch = text.slice(i).match(/^<%\s*(if|endif)\b/);
                    if (conditionalMatch) {
                        if (conditionalMatch[1] === 'if')
                            conditionalDepth++;
                        else if (conditionalMatch[1] === 'endif' && conditionalDepth > 0)
                            conditionalDepth--;
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
                // Skip quoted strings
                if (ch === '"' || ch === "'") {
                    const quote = ch;
                    i++;
                    while (i < text.length && text[i] !== quote) {
                        if (text[i] === '\\')
                            i++;
                        i++;
                    }
                    i++;
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
                    // Check for opening tag
                    const openMatch = text.slice(i).match(/^<([a-zA-Z\$][a-zA-Z0-9\-\$\.]*)(?=[\s>\/])/);
                    if (openMatch) {
                        const tagNameLower = openMatch[1].toLowerCase();
                        const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
                        let isSelfClosing = voidElements.includes(tagNameLower);
                        if (!isSelfClosing) {
                            let scanPos = i + openMatch[0].length;
                            let inMacro = 0, inTransclude = 0, inFilterRun = 0;
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
                                    scanPos++;
                                    continue;
                                }
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
        // Find all real tags in the content after opening tag
        const allTags = findRealTags(restOfText);
        // Process tags to find matching close with proper depth tracking
        let closeTagIndex = -1;
        let depth = 1;
        let otherWidgetDepth = 0;
        for (const tag of allTags) {
            if (tag.name === name) {
                if (tag.isClose) {
                    // Only match if not trapped inside other widgets
                    if (depth === 1 && otherWidgetDepth === 0) {
                        depth--;
                        closeTagIndex = tag.pos;
                        break;
                    }
                    else if (depth > 1) {
                        depth--;
                    }
                    // If depth === 1 but otherWidgetDepth > 0, skip this trapped close
                }
                else if (!tag.isSelfClosing) {
                    depth++;
                }
            }
            else {
                // Other widget/tag
                if (tag.isClose) {
                    if (otherWidgetDepth > 0)
                        otherWidgetDepth--;
                }
                else if (!tag.isSelfClosing) {
                    otherWidgetDepth++;
                }
            }
        }
        if (closeTagIndex === -1) {
            // No closing tag found - just return the opening tag
            return cx.addElement(cx.elt(Type.InlineWidget, pos, openTagEnd, children));
        }
        // Parse content between opening and closing tags
        const contentStart = openTagEnd;
        const contentEnd = openTagEnd + closeTagIndex;
        const contentText = cx.slice(contentStart, contentEnd);
        if (contentText.length > 0) {
            const contentElements = cx.parser.parseInline(contentText, contentStart);
            children.push(...contentElements);
        }
        // Add closing tag elements
        const closeTagStart = contentEnd;
        const closeTagEnd = closeTagStart + closeTagPattern.length;
        const closeTagChildren = [
            cx.elt(Type.TagMark, closeTagStart, closeTagStart + 2), // </
            cx.elt(Type.WidgetName, closeTagStart + 2, closeTagEnd - 1),
            cx.elt(Type.TagMark, closeTagEnd - 1, closeTagEnd) // >
        ];
        children.push(cx.elt(Type.WidgetEnd, closeTagStart, closeTagEnd, closeTagChildren));
        return cx.addElement(cx.elt(Type.InlineWidget, pos, closeTagEnd, children));
    }
};
// ============================================================================
// Standalone Widget Closing Tag Parser (</$widget> or incomplete </$...)
// Also handles placeholder closing tags: </$param$>
// ============================================================================
const widgetCloseRe = /^<\/(\$[a-zA-Z0-9\-\$\.]*)(>)?/;
const placeholderCloseTagRe = /^<\/\$([a-zA-Z][a-zA-Z0-9\-_]*)\$>/;
export const WidgetCloseTag = {
    name: "WidgetCloseTag",
    // Must run after Widget parser to not interfere with normal widget parsing
    after: "Widget",
    parse(cx, next, pos) {
        if (next !== Ch.LessThan)
            return -1;
        if (cx.char(pos + 1) !== Ch.Slash)
            return -1;
        if (cx.char(pos + 2) !== Ch.Dollar)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Check for placeholder closing tag first: </$param$>
        const placeholderMatch = placeholderCloseTagRe.exec(text);
        if (placeholderMatch) {
            const paramName = placeholderMatch[1];
            const end = pos + placeholderMatch[0].length;
            const placeholderStart = pos + 2; // after </
            const placeholderEnd = end - 1; // before >
            const children = [
                cx.elt(Type.TagMark, pos, pos + 2), // </
                cx.elt(Type.Placeholder, placeholderStart, placeholderEnd, [
                    cx.elt(Type.PlaceholderMark, placeholderStart, placeholderStart + 1), // $
                    cx.elt(Type.VariableName, placeholderStart + 1, placeholderStart + 1 + paramName.length),
                    cx.elt(Type.PlaceholderMark, placeholderEnd - 1, placeholderEnd) // $
                ]),
                cx.elt(Type.TagMark, end - 1, end) // >
            ];
            return cx.addElement(cx.elt(Type.WidgetEnd, pos, end, children));
        }
        const match = widgetCloseRe.exec(text);
        if (!match) {
            // Just "</$ " with nothing after - still parse it as incomplete
            if (text.startsWith("</$")) {
                const children = [
                    cx.elt(Type.TagMark, pos, pos + 2), // </
                ];
                // Check if there's a partial name
                const partialMatch = /^<\/(\$[a-zA-Z0-9\-\$\.]+)/.exec(text);
                if (partialMatch && partialMatch[1].length > 1) {
                    children.push(cx.elt(Type.WidgetName, pos + 2, pos + 2 + partialMatch[1].length));
                    return cx.addElement(cx.elt(Type.WidgetEnd, pos, pos + 2 + partialMatch[1].length, children));
                }
                // Just "</$" - minimal incomplete closing tag
                return cx.addElement(cx.elt(Type.WidgetEnd, pos, pos + 3, children));
            }
            return -1;
        }
        const name = match[1];
        const hasClosingBracket = !!match[2];
        const end = pos + match[0].length;
        // Handle </$ with no widget name (just the prefix)
        if (name === "$") {
            // </$> is valid (closes undefined widget), but </$ followed by space is not
            if (!hasClosingBracket) {
                return -1;
            }
            const children = [
                cx.elt(Type.TagMark, pos, pos + 2), // </
                cx.elt(Type.WidgetName, pos + 2, pos + 3), // $
                cx.elt(Type.TagMark, end - 1, end), // >
            ];
            return cx.addElement(cx.elt(Type.WidgetEnd, pos, end, children));
        }
        const children = [
            cx.elt(Type.TagMark, pos, pos + 2), // </
            cx.elt(Type.WidgetName, pos + 2, pos + 2 + name.length),
        ];
        if (hasClosingBracket) {
            children.push(cx.elt(Type.TagMark, end - 1, end)); // >
        }
        return cx.addElement(cx.elt(Type.WidgetEnd, pos, end, children));
    }
};
// ============================================================================
// HTML Tag Parser (<tag>content</tag> or <tag/>)
// ============================================================================
const htmlTagStartRe = /^<([a-zA-Z][a-zA-Z0-9\-]*)/;
export const HTMLTag = {
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
        // Handle incomplete tag (no closing >)
        if (!tagResult) {
            // Find where the incomplete tag ends, properly handling quoted strings
            const incompleteEnd = findIncompleteTagEnd(text, afterName);
            const end = pos + incompleteEnd;
            const attrString = text.slice(afterName, incompleteEnd);
            const children = [
                cx.elt(Type.TagMark, pos, pos + 1), // <
                cx.elt(Type.TagName, pos + 1, pos + 1 + name.length),
            ];
            if (attrString.trim()) {
                const attrElements = parseInlineAttributes(cx, attrString, pos + afterName);
                children.push(...attrElements);
            }
            return cx.addElement(cx.elt(Type.IncompleteHTMLTag, pos, end, children));
        }
        const openTagEnd = pos + afterName + tagResult.end;
        const attrString = text.slice(afterName, afterName + tagResult.end - (tagResult.selfClose ? 2 : 1));
        const openTagChildren = [
            cx.elt(Type.TagMark, pos, pos + 1), // <
            cx.elt(Type.TagName, pos + 1, pos + 1 + name.length),
        ];
        // Parse attributes
        if (attrString.trim()) {
            const attrElements = parseInlineAttributes(cx, attrString, pos + afterName);
            openTagChildren.push(...attrElements);
        }
        if (tagResult.selfClose) {
            openTagChildren.push(cx.elt(Type.SelfClosingMarker, openTagEnd - 2, openTagEnd - 1));
            openTagChildren.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)); // >
            return cx.addElement(cx.elt(Type.HTMLTag, pos, openTagEnd, openTagChildren));
        }
        openTagChildren.push(cx.elt(Type.TagMark, openTagEnd - 1, openTagEnd)); // >
        // Look for closing tag </name>
        const closeTagPattern = `</${name}>`;
        const restOfText = text.slice(afterName + tagResult.end);
        const closeTagIndex = restOfText.indexOf(closeTagPattern);
        if (closeTagIndex === -1) {
            // No closing tag found - just return the opening tag
            return cx.addElement(cx.elt(Type.HTMLTag, pos, openTagEnd, openTagChildren));
        }
        // Parse content between opening and closing tags
        const contentStart = openTagEnd;
        const contentEnd = openTagEnd + closeTagIndex;
        const contentText = cx.slice(contentStart, contentEnd);
        if (contentText.length > 0) {
            const contentElements = cx.parser.parseInline(contentText, contentStart);
            openTagChildren.push(...contentElements);
        }
        // Add closing tag elements
        const closeTagStart = contentEnd;
        const closeTagEnd = closeTagStart + closeTagPattern.length;
        const closeTagChildren = [
            cx.elt(Type.TagMark, closeTagStart, closeTagStart + 2), // </
            cx.elt(Type.TagName, closeTagStart + 2, closeTagEnd - 1),
            cx.elt(Type.TagMark, closeTagEnd - 1, closeTagEnd) // >
        ];
        openTagChildren.push(cx.elt(Type.HTMLEndTag, closeTagStart, closeTagEnd, closeTagChildren));
        return cx.addElement(cx.elt(Type.HTMLTag, pos, closeTagEnd, openTagChildren));
    }
};
// ============================================================================
// Standalone HTML Closing Tag Parser (</tag> or incomplete </...)
// ============================================================================
const htmlCloseRe = /^<\/([a-zA-Z][a-zA-Z0-9\-]*)(>)?/;
export const HTMLCloseTag = {
    name: "HTMLCloseTag",
    // Must run after HTMLTag parser to not interfere with normal tag parsing
    after: "HTMLTag",
    parse(cx, next, pos) {
        if (next !== Ch.LessThan)
            return -1;
        if (cx.char(pos + 1) !== Ch.Slash)
            return -1;
        // Skip if it's a widget closing tag
        if (cx.char(pos + 2) === Ch.Dollar)
            return -1;
        const text = cx.slice(pos, cx.end);
        const match = htmlCloseRe.exec(text);
        if (!match) {
            // Just "</" with nothing valid after - check if there's at least "</"
            if (text.startsWith("</")) {
                const children = [
                    cx.elt(Type.TagMark, pos, pos + 2), // </
                ];
                // Just "</" - minimal incomplete closing tag
                return cx.addElement(cx.elt(Type.HTMLEndTag, pos, pos + 2, children));
            }
            return -1;
        }
        const name = match[1];
        const hasClosingBracket = !!match[2];
        const end = pos + match[0].length;
        const children = [
            cx.elt(Type.TagMark, pos, pos + 2), // </
            cx.elt(Type.TagName, pos + 2, pos + 2 + name.length),
        ];
        if (hasClosingBracket) {
            children.push(cx.elt(Type.TagMark, end - 1, end)); // >
        }
        return cx.addElement(cx.elt(Type.HTMLEndTag, pos, end, children));
    }
};
// ============================================================================
// Inline Comment Parser (<!-- ... -->)
// ============================================================================
export const InlineComment = {
    name: "InlineComment",
    parse(cx, next, pos) {
        // Must start with <!--
        if (next !== Ch.LessThan)
            return -1;
        if (cx.char(pos + 1) !== 33)
            return -1; // '!'
        if (cx.char(pos + 2) !== Ch.Dash)
            return -1;
        if (cx.char(pos + 3) !== Ch.Dash)
            return -1;
        // Find closing -->
        let searchPos = pos + 4;
        while (searchPos < cx.end - 2) {
            if (cx.char(searchPos) === Ch.Dash &&
                cx.char(searchPos + 1) === Ch.Dash &&
                cx.char(searchPos + 2) === 62) { // '>'
                const end = searchPos + 3;
                return cx.addElement(cx.elt(Type.CommentBlock, pos, end, [
                    cx.elt(Type.CommentMarker, pos, pos + 4), // <!--
                    cx.elt(Type.CommentMarker, end - 3, end) // -->
                ]));
            }
            searchPos++;
        }
        // No closing --> found, don't match (let other parsers handle it)
        return -1;
    }
};
// ============================================================================
// Dash Parser (-- or ---)
// ============================================================================
export const Dash = {
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
export const VariableSubstitution = {
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
export const PlaceholderParam = {
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
// TiddlyWiki CamelCase pattern: UpperLetter+ LowerLetter+ UpperLetter AnyLetter*
// where AnyLetter includes A-Za-z0-9 and extended Latin characters
const camelCaseRe = /^[A-Z\u00c0-\u00d6\u00d8-\u00de\u0150\u0170]+[a-z\u00df-\u00f6\u00f8-\u00ff\u0151\u0171]+[A-Z\u00c0-\u00d6\u00d8-\u00de\u0150\u0170][A-Za-z0-9\u00c0-\u00d6\u00d8-\u00de\u00df-\u00f6\u00f8-\u00ff\u0150\u0170\u0151\u0171]*/;
// Check if character is a block prefix letter (prevents CamelCase link)
// Matches TiddlyWiki's blockPrefixLetters: A-Za-z0-9-_ and extended Latin
function isBlockPrefixLetter(ch) {
    if (ch >= 65 && ch <= 90)
        return true; // A-Z
    if (ch >= 97 && ch <= 122)
        return true; // a-z
    if (ch >= 48 && ch <= 57)
        return true; // 0-9
    if (ch === 45 || ch === 95)
        return true; // - _
    // Extended Latin characters
    if (ch >= 0x00c0 && ch <= 0x00d6)
        return true;
    if (ch >= 0x00d8 && ch <= 0x00de)
        return true;
    if (ch >= 0x00df && ch <= 0x00f6)
        return true;
    if (ch >= 0x00f8 && ch <= 0x00ff)
        return true;
    if (ch === 0x0150 || ch === 0x0170)
        return true;
    if (ch === 0x0151 || ch === 0x0171)
        return true;
    return false;
}
export const CamelCaseLink = {
    name: "CamelCaseLink",
    parse(cx, next, pos) {
        // Must start with uppercase (A-Z or extended Latin uppercase)
        const isUpperCase = (next >= 65 && next <= 90) ||
            (next >= 0x00c0 && next <= 0x00d6) ||
            (next >= 0x00d8 && next <= 0x00de) ||
            next === 0x0150 || next === 0x0170;
        if (!isUpperCase)
            return -1;
        // Must be at word boundary (previous char must not be a block prefix letter)
        if (pos > cx.offset) {
            const prev = cx.char(pos - 1);
            // Check if previous char is a block prefix letter
            if (isBlockPrefixLetter(prev))
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
// Match TiddlyWiki's syslink: $:/ followed by anyLetter (A-Za-z0-9 + extended Latin) plus /._-
const sysLinkRe = /^\$:\/[A-Za-z0-9\u00c0-\u00d6\u00d8-\u00de\u00df-\u00f6\u00f8-\u00ff\u0150\u0170\u0151\u0171\/._-]+/;
export const SystemLink = {
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
// URLs with :// (http, https, ftp, file)
const urlWithSlashesRe = /^(?:https?|ftp|file):\/\/[^\s\[\]{}|<>]*/i;
// URLs without :// (mailto, tel, geo, data, javascript)
const urlWithoutSlashesRe = /^(?:mailto|tel|geo|data|javascript):[^\s\[\]{}|<>]+/i;
// Trailing punctuation to strip from URLs
const trailingPunctRe = /[.,;:!?)\]]+$/;
export const URLAutoLink = {
    name: "URLAutoLink",
    parse(cx, next, pos) {
        // Check first character matches a supported protocol
        // h=104 (http/https), f=102 (ftp/file), m=109 (mailto), t=116 (tel), g=103 (geo), d=100 (data), j=106 (javascript)
        if (next !== 104 && next !== 102 && next !== 109 && next !== 116 && next !== 103 && next !== 100 && next !== 106)
            return -1;
        const text = cx.slice(pos, cx.end);
        // Try matching URL with :// first
        let match = urlWithSlashesRe.exec(text);
        let minLength = 8; // Must have more than just "https://"
        if (!match) {
            // Try matching URL without :// (mailto:, tel:, etc.)
            match = urlWithoutSlashesRe.exec(text);
            minLength = 7; // Must have more than just "mailto:"
        }
        if (!match)
            return -1;
        // Strip trailing punctuation
        let linkText = match[0];
        linkText = linkText.replace(trailingPunctRe, "");
        if (linkText.length <= minLength)
            return -1;
        return cx.addElement(cx.elt(Type.URLLink, pos, pos + linkText.length));
    }
};
// ============================================================================
// Conditional Syntax Parser (<%if, <%else, <%elseif, <%endif, %>)
// Progressive highlighting - highlights as you type
// ============================================================================
export const ConditionalSyntax = {
    name: "ConditionalSyntax",
    parse(cx, next, pos) {
        // Match <% at current position
        if (next !== Ch.LessThan)
            return -1;
        if (cx.char(pos + 1) !== Ch.Percent)
            return -1;
        const text = cx.slice(pos, cx.end);
        const children = [];
        // Always add the <% mark
        children.push(cx.elt(Type.ConditionalMark, pos, pos + 2));
        // Try to match a keyword after <%
        // Check for <%if, <%elseif, <%else, <%endif (with optional whitespace)
        const keywordMatch = /^<%\s*(if|elseif|else|endif)\b/.exec(text);
        if (keywordMatch) {
            const keyword = keywordMatch[1];
            const keywordStart = pos + text.indexOf(keyword, 2);
            const keywordEnd = keywordStart + keyword.length;
            children.push(cx.elt(Type.ConditionalKeyword, keywordStart, keywordEnd));
            // For <%if and <%elseif, try to parse filter expression
            if (keyword === 'if' || keyword === 'elseif') {
                // Look for filter after keyword
                const afterKeyword = text.slice(keywordEnd - pos);
                const filterMatch = /^\s+(.+?)(?:\s*%>|$)/.exec(afterKeyword);
                if (filterMatch) {
                    const filterContent = filterMatch[1];
                    const filterStart = keywordEnd + afterKeyword.indexOf(filterContent);
                    const filterEnd = filterStart + filterContent.length;
                    // Parse filter expression for nested highlighting
                    const filterChildren = parseFilterExpressionDetailed(filterContent, filterStart);
                    children.push(cx.elt(Type.FilterExpression, filterStart, filterEnd, filterChildren));
                }
            }
            // Look for closing %>
            const closeIdx = text.indexOf('%>');
            if (closeIdx !== -1) {
                children.push(cx.elt(Type.ConditionalMark, pos + closeIdx, pos + closeIdx + 2));
                return cx.addElement(cx.elt(Type.Conditional, pos, pos + closeIdx + 2, children));
            }
            else {
                // Incomplete - highlight what we have so far
                return cx.addElement(cx.elt(Type.Conditional, pos, keywordEnd, children));
            }
        }
        // Just <% with no recognized keyword yet - still highlight it
        // Check if there's a closing %>
        const closeIdx = text.indexOf('%>');
        if (closeIdx !== -1 && closeIdx > 2) {
            // There's content between <% and %> - might be unrecognized keyword
            children.push(cx.elt(Type.ConditionalMark, pos + closeIdx, pos + closeIdx + 2));
            return cx.addElement(cx.elt(Type.Conditional, pos, pos + closeIdx + 2, children));
        }
        // Just <% alone - highlight it
        return cx.addElement(cx.elt(Type.ConditionalMark, pos, pos + 2));
    }
};
// ============================================================================
// Export all default inline parsers
// ============================================================================
export const DefaultInlineParsers = [
    InlineCode,
    ConditionalSyntax, // Must come early to catch <%
    Escape,
    Entity,
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
    IncompleteFilterRun, // Must come after WikiLink/ExternalLink/ImageLink - catches [operator... in plain text
    FilteredTransclusion, // Must come before Transclusion
    Transclusion,
    MVVDisplayInline, // ((varname)) / (((filter))) - must come after Transclusion
    MacroCall,
    Widget,
    WidgetCloseTag, // Standalone/incomplete closing widget tags
    InlineComment, // Must come before HTMLTag to catch <!-- before < is matched
    HTMLTag,
    HTMLCloseTag, // Standalone/incomplete closing HTML tags
    Dash,
    VariableSubstitution, // $(var)$ - must come before SystemLink and PlaceholderParam
    SystemLink,
    PlaceholderParam, // $param$ - must come after VariableSubstitution
    CamelCaseLink,
    URLAutoLink,
];
//# sourceMappingURL=inline-parsers.js.map