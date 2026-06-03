/**
 * TiddlyWiki Parser - Shared Utilities
 *
 * Common utilities and patterns used across inline, block, and pragma parsers.
 */
import { Type } from "./types";
// @ts-expect-error TS(6133): 'Ch' is declared but its value is never read.
import { elt } from "./core";
// ============================================================================
// Common Regex Patterns
// ============================================================================
/**
 * Common regex patterns used across parsers
 */
export const Patterns = {
    /** Whitespace or start of string - used for flanking rules */
    whitespaceOrStart: /\s|^$/,
    /** Valid attribute name characters - TiddlyWiki allows any char except /\s>"'`= */
    attributeName: /^[^\/\s>"'`=]+/,
    /** WikiLink pattern: [[target]] or [[target|text]] */
    wikiLink: /^\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/,
    /** Incomplete WikiLink */
    incompleteWikiLink: /^\[\[([^\]\n]*)$/,
    /** External link pattern: [ext[url]] or [ext[text|url]] */
    extLink: /^\[ext\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/,
    /** Image pattern: [img[source]] or [img[tooltip|source]] */
    imageLink: /^\[img(?:\[([^\]]*?)\])?\[([^\]]*?)\]\]/,
    /** URL pattern */
    url: /^(?:https?|mailto|ftp|file|data|tel|geo|javascript):\/\/[^\s<>\[\]{}|"^`\\]*|^(?:https?|mailto|ftp|file|data|tel|geo|javascript):[^\s<>\[\]{}|"^`\\]+/i,
    /** CamelCase word (for auto-linking) - includes unicode letter ranges */
    camelCase: /^[A-Z\u00c0-\u00d6\u00d8-\u00de\u0150\u0170][a-z\u00df-\u00f6\u00f8-\u00ff\u0151\u0171]+[A-Z\u00c0-\u00d6\u00d8-\u00de\u0150\u0170][A-Za-z0-9\u00c0-\u00d6\u00d8-\u00de\u00df-\u00f6\u00f8-\u00ff\u0150\u0170\u0151\u0171]*/,
    /** HTML/Widget tag name */
    tagName: /^(\$?[a-zA-Z][a-zA-Z0-9\-\.]*)/,
    /** Filter step pattern */
    filterStep: /^\[([^\[\]]*)\]/,
    /** $param$ placeholder pattern (for \define macros) */
    placeholder: /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/,
};
// ============================================================================
// Whitespace Utilities
// ============================================================================
/**
 * Check if a string is whitespace or empty (for flanking rules)
 */
export function isWhitespaceOrEmpty(text) {
    return Patterns.whitespaceOrStart.test(text);
}
/**
 * Skip whitespace in a string starting at position
 */
export function skipWhitespace(text, pos) {
    while (pos < text.length && /\s/.test(text[pos]))
        pos++;
    return pos;
}
/**
 * Skip past a braced block starting at `pos` in `text`.
 *
 * If text[pos..] starts with `{{{`, skips to the matching `}}}` (with depth
 * tracking for nested `{{{`/`}}}`), then returns the position after `}}}`.
 *
 * Otherwise, if text[pos..] starts with `{{`, skips to the matching `}}`
 * and returns the position after `}}`.
 *
 * Returns the original `pos` if not at a braced block.
 */
export function skipBracedBlock(text, pos) {
    if (pos >= text.length || text[pos] !== '{')
        return pos;
    // Check for {{{ (filtered transclusion)
    if (text.slice(pos, pos + 3) === '{{{') {
        let depth = 1;
        let i = pos + 3;
        while (i < text.length && depth > 0) {
            if (text.slice(i, i + 3) === '{{{') {
                depth++;
                i += 3;
            }
            else if (text.slice(i, i + 3) === '}}}') {
                depth--;
                if (depth === 0)
                    return i + 3;
                i += 3;
            }
            else {
                i++;
            }
        }
        return i; // unclosed — return end
    }
    // Check for {{ (transclusion)
    if (text.slice(pos, pos + 2) === '{{') {
        let i = pos + 2;
        while (i < text.length) {
            if (text.slice(i, i + 2) === '}}') {
                return i + 2;
            }
            i++;
        }
        return i; // unclosed — return end
    }
    return pos;
}
// ============================================================================
// Placeholder Detection Helpers
// ============================================================================
/**
 * Create a FilterTextRef element with marks for { and }, checking for patterns.
 *
 * @param content - The text reference (without braces)
 * @param refStart - Position of the opening {
 * @param refEnd - Position after the closing } (or at content end if no closing })
 *
 * For $param$ placeholders, creates Placeholder element.
 * Otherwise creates FilterTextRef with TransclusionMark children for { and }.
 */
export function createFilterTextRef(content, refStart, refEnd) {
    const contentStart = refStart + 1; // After {
    // Check if closing } exists: refEnd should be contentStart + content.length + 1
    const hasClosingBrace = refEnd === contentStart + content.length + 1;
    const contentEnd = hasClosingBrace ? refEnd - 1 : refEnd;
    // Check for $param$ placeholder pattern
    const placeholderMatch = Patterns.placeholder.exec(content);
    if (placeholderMatch) {
        const paramName = placeholderMatch[1];
        const children = [
            elt(Type.TransclusionMark, refStart, refStart + 1), // {
            elt(Type.PlaceholderMark, contentStart, contentStart + 1), // $
            elt(Type.VariableName, contentStart + 1, contentStart + 1 + paramName.length),
            elt(Type.PlaceholderMark, contentEnd - 1, contentEnd), // $
        ];
        if (hasClosingBrace) {
            children.push(elt(Type.TransclusionMark, contentEnd, refEnd)); // }
        }
        return elt(Type.Placeholder, refStart, refEnd, children);
    }
    // Regular text reference
    const children = [
        elt(Type.TransclusionMark, refStart, refStart + 1), // {
    ];
    // Add the text ref content - could be tiddler!!field or tiddler##index
    if (content.includes('!!')) {
        const fieldIdx = content.indexOf('!!');
        if (fieldIdx > 0) {
            children.push(elt(Type.TransclusionTarget, contentStart, contentStart + fieldIdx));
        }
        children.push(elt(Type.TransclusionField, contentStart + fieldIdx, contentEnd));
    }
    else if (content.includes('##')) {
        const indexIdx = content.indexOf('##');
        if (indexIdx > 0) {
            children.push(elt(Type.TransclusionTarget, contentStart, contentStart + indexIdx));
        }
        children.push(elt(Type.TransclusionIndex, contentStart + indexIdx, contentEnd));
    }
    else {
        children.push(elt(Type.TransclusionTarget, contentStart, contentEnd));
    }
    if (hasClosingBrace) {
        children.push(elt(Type.TransclusionMark, contentEnd, refEnd)); // }
    }
    return elt(Type.FilterTextRef, refStart, refEnd, children);
}
/**
 * Create a FilterVariable element with marks for < and >, checking for patterns.
 *
 * @param content - The variable name (without angle brackets)
 * @param varStart - Position of the opening <
 * @param varEnd - Position after the closing > (or at content end if no closing >)
 *
 * For __param__ substituted parameters, creates SubstitutedParam element.
 * For $param$ placeholders, creates Placeholder element.
 * Otherwise creates FilterVariable with MacroCallMark children for < and >.
 */
export function createFilterVariable(content, varStart, varEnd) {
    const contentStart = varStart + 1; // After <
    // Check if closing > exists: varEnd should be contentStart + content.length + 1
    const hasClosingAngle = varEnd === contentStart + content.length + 1;
    const contentEnd = hasClosingAngle ? varEnd - 1 : varEnd;
    // Check for __param__ substituted parameter pattern
    const substitutedMatch = /^__(.+)__$/.exec(content);
    if (substitutedMatch) {
        const paramName = substitutedMatch[1];
        const children = [
            elt(Type.MacroCallMark, varStart, varStart + 1), // <
            elt(Type.SubstitutedParamMark, contentStart, contentStart + 2), // __
            elt(Type.SubstitutedParamName, contentStart + 2, contentStart + 2 + paramName.length),
            elt(Type.SubstitutedParamMark, contentEnd - 2, contentEnd), // __
        ];
        if (hasClosingAngle) {
            children.push(elt(Type.MacroCallMark, contentEnd, varEnd)); // >
        }
        return elt(Type.SubstitutedParam, varStart, varEnd, children);
    }
    // Check for $param$ placeholder pattern
    const placeholderMatch = Patterns.placeholder.exec(content);
    if (placeholderMatch) {
        const paramName = placeholderMatch[1];
        const children = [
            elt(Type.MacroCallMark, varStart, varStart + 1), // <
            elt(Type.PlaceholderMark, contentStart, contentStart + 1), // $
            elt(Type.VariableName, contentStart + 1, contentStart + 1 + paramName.length),
            elt(Type.PlaceholderMark, contentEnd - 1, contentEnd), // $
        ];
        if (hasClosingAngle) {
            children.push(elt(Type.MacroCallMark, contentEnd, varEnd)); // >
        }
        return elt(Type.Placeholder, varStart, varEnd, children);
    }
    // Regular variable reference
    const children = [
        elt(Type.MacroCallMark, varStart, varStart + 1), // <
        elt(Type.VariableName, contentStart, contentEnd),
    ];
    if (hasClosingAngle) {
        children.push(elt(Type.MacroCallMark, contentEnd, varEnd)); // >
    }
    return elt(Type.FilterVariable, varStart, varEnd, children);
}
/**
 * Create a FilterMultiVariable element with marks for ( and ), checking for patterns.
 *
 * @param content - The variable name (without parentheses)
 * @param varStart - Position of the opening (
 * @param varEnd - Position after the closing ) (or at content end if no closing ))
 *
 * For __param__ substituted parameters, creates SubstitutedParam element.
 * For $param$ placeholders, creates Placeholder element.
 * Otherwise creates FilterMultiVariable with MacroCallMark children for ( and ).
 */
export function createFilterMultiVariable(content, varStart, varEnd) {
    const contentStart = varStart + 1; // After (
    const hasClosingParen = varEnd === contentStart + content.length + 1;
    const contentEnd = hasClosingParen ? varEnd - 1 : varEnd;
    // Check for __param__ substituted parameter pattern
    const substitutedMatch = /^__(.+)__$/.exec(content);
    if (substitutedMatch) {
        const paramName = substitutedMatch[1];
        const children = [
            elt(Type.MacroCallMark, varStart, varStart + 1), // (
            elt(Type.SubstitutedParamMark, contentStart, contentStart + 2), // __
            elt(Type.SubstitutedParamName, contentStart + 2, contentStart + 2 + paramName.length),
            elt(Type.SubstitutedParamMark, contentEnd - 2, contentEnd), // __
        ];
        if (hasClosingParen) {
            children.push(elt(Type.MacroCallMark, contentEnd, varEnd)); // )
        }
        return elt(Type.SubstitutedParam, varStart, varEnd, children);
    }
    // Check for $param$ placeholder pattern
    const placeholderMatch = Patterns.placeholder.exec(content);
    if (placeholderMatch) {
        const paramName = placeholderMatch[1];
        const children = [
            elt(Type.MacroCallMark, varStart, varStart + 1), // (
            elt(Type.PlaceholderMark, contentStart, contentStart + 1), // $
            elt(Type.VariableName, contentStart + 1, contentStart + 1 + paramName.length),
            elt(Type.PlaceholderMark, contentEnd - 1, contentEnd), // $
        ];
        if (hasClosingParen) {
            children.push(elt(Type.MacroCallMark, contentEnd, varEnd)); // )
        }
        return elt(Type.Placeholder, varStart, varEnd, children);
    }
    // Check for ||separator syntax
    const sepIndex = content.indexOf("||");
    if (sepIndex >= 0) {
        const varName = content.substring(0, sepIndex);
        const separator = content.substring(sepIndex + 2);
        const children = [
            elt(Type.MacroCallMark, varStart, varStart + 1), // (
            elt(Type.VariableName, contentStart, contentStart + varName.length),
            elt(Type.MVVSeparatorMark, contentStart + varName.length, contentStart + varName.length + 2), // ||
        ];
        if (separator.length > 0) {
            children.push(elt(Type.MVVSeparatorValue, contentStart + varName.length + 2, contentStart + varName.length + 2 + separator.length));
        }
        if (hasClosingParen) {
            children.push(elt(Type.MacroCallMark, contentEnd, varEnd)); // )
        }
        return elt(Type.FilterMultiVariable, varStart, varEnd, children);
    }
    // Regular multi-valued variable reference
    const children = [
        elt(Type.MacroCallMark, varStart, varStart + 1), // (
        elt(Type.VariableName, contentStart, contentEnd),
    ];
    if (hasClosingParen) {
        children.push(elt(Type.MacroCallMark, contentEnd, varEnd)); // )
    }
    return elt(Type.FilterMultiVariable, varStart, varEnd, children);
}
/**
 * Create an AttributeName element, checking for $param$ placeholder pattern.
 * Returns Placeholder element if it matches, otherwise AttributeName element.
 * Used by both inline and block attribute parsers.
 */
export function createAttributeNameElement(name, start, end) {
    const placeholderMatch = Patterns.placeholder.exec(name);
    if (placeholderMatch) {
        const paramName = placeholderMatch[1];
        return elt(Type.Placeholder, start, end, [
            elt(Type.PlaceholderMark, start, start + 1),
            elt(Type.VariableName, start + 1, start + 1 + paramName.length),
            elt(Type.PlaceholderMark, end - 1, end)
        ]);
    }
    return elt(Type.AttributeName, start, end);
}
/**
 * Create an ImageSource element, checking for $param$ placeholder pattern.
 * Returns Placeholder element if it matches, otherwise ImageSource element.
 */
export function createImageSourceElement(source, start, end) {
    const placeholderMatch = Patterns.placeholder.exec(source);
    if (placeholderMatch) {
        const paramName = placeholderMatch[1];
        return elt(Type.Placeholder, start, end, [
            elt(Type.PlaceholderMark, start, start + 1),
            elt(Type.VariableName, start + 1, start + 1 + paramName.length),
            elt(Type.PlaceholderMark, end - 1, end)
        ]);
    }
    return elt(Type.ImageSource, start, end);
}
/**
 * Create a URLLink element, checking for $param$ placeholder pattern.
 * Returns Placeholder element if it matches, otherwise URLLink element.
 */
export function createURLLinkElement(url, start, end) {
    const placeholderMatch = Patterns.placeholder.exec(url);
    if (placeholderMatch) {
        const paramName = placeholderMatch[1];
        return elt(Type.Placeholder, start, end, [
            elt(Type.PlaceholderMark, start, start + 1),
            elt(Type.VariableName, start + 1, start + 1 + paramName.length),
            elt(Type.PlaceholderMark, end - 1, end)
        ]);
    }
    return elt(Type.URLLink, start, end);
}
/**
 * Parse $param$ placeholders in filter operand content.
 * Returns empty array if no placeholders found.
 * Used by filter expression parsers in both inline and block contexts.
 */
export function parseFilterOperandPlaceholders(content, offset) {
    const elements = [];
    const placeholderRe = /\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/g;
    let match;
    while ((match = placeholderRe.exec(content)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        const paramName = match[1];
        // Add the placeholder node with proper children
        const placeholderChildren = [
            elt(Type.PlaceholderMark, offset + matchStart, offset + matchStart + 1), // $
            elt(Type.VariableName, offset + matchStart + 1, offset + matchStart + 1 + paramName.length),
            elt(Type.PlaceholderMark, offset + matchEnd - 1, offset + matchEnd) // $
        ];
        elements.push(elt(Type.Placeholder, offset + matchStart, offset + matchEnd, placeholderChildren));
    }
    return elements;
}
/**
 * Parse filter expression content into detailed elements.
 * Handles: [operator[operand]], [operator<variable>], [operator{textref}]
 * Also handles chained operators like [<var>operator{ref}]
 *
 * This is the detailed version used by both inline and block parsers.
 */
export function parseFilterExpressionDetailed(filterContent, offset) {
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
            let currentOperatorName = ''; // Track operator name for special handling (e.g., regexp)
            while (pos < len && filterContent[pos] !== ']') {
                if (filterContent[pos] === '!') {
                    pos++;
                }
                const operandCh = filterContent[pos];
                if (operandCh === '[') {
                    // Literal operand: [value] - may contain $param$ placeholders
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
                    const operandContent = filterContent.slice(operandStart, pos);
                    // Use FilterRegexp for regexp operator operands
                    const operandType = currentOperatorName === 'regexp' ? Type.FilterRegexp : Type.FilterOperand;
                    // Check for $param$ placeholders in operand content
                    if (operandContent.includes('$')) {
                        const placeholderChildren = parseFilterOperandPlaceholders(operandContent, offset + operandStart);
                        if (placeholderChildren.length > 0) {
                            stepChildren.push(elt(operandType, offset + operandStart, offset + pos, placeholderChildren));
                        }
                        else {
                            stepChildren.push(elt(operandType, offset + operandStart, offset + pos));
                        }
                    }
                    else {
                        stepChildren.push(elt(operandType, offset + operandStart, offset + pos));
                    }
                    if (pos < len && filterContent[pos] === ']')
                        pos++;
                    currentOperatorName = ''; // Reset after consuming operand
                }
                else if (operandCh === '<') {
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '>') {
                        // Skip braced blocks so {{{...}}} content doesn't break > scanning
                        const afterBraced = skipBracedBlock(filterContent, pos);
                        if (afterBraced > pos) {
                            pos = afterBraced;
                            continue;
                        }
                        pos++;
                    }
                    const varContent = filterContent.slice(operandStart, pos);
                    const hasClosingAngle = pos < len && filterContent[pos] === '>';
                    // Check if it's a substituted parameter: <__param__> (complete) or <__ (incomplete)
                    const substitutedMatch = /^__(.+)__$/.exec(varContent);
                    const incompleteSubstitutedMatch = !substitutedMatch && /^__(.*)$/.exec(varContent);
                    if (substitutedMatch) {
                        const paramName = substitutedMatch[1];
                        const varStart = offset + operandStart - 1; // Include <
                        const varEnd = offset + pos + 1; // Include >
                        const innerStart = offset + operandStart;
                        const nameChildren = [
                            elt(Type.SubstitutedParamMark, innerStart, innerStart + 2), // __
                            elt(Type.SubstitutedParamName, innerStart + 2, innerStart + 2 + paramName.length),
                            elt(Type.SubstitutedParamMark, innerStart + 2 + paramName.length, offset + pos), // __
                        ];
                        stepChildren.push(elt(Type.SubstitutedParam, varStart, varEnd, nameChildren));
                    }
                    else if (incompleteSubstitutedMatch) {
                        // Handle incomplete pattern like <__param or <__ (without closing __>)
                        const paramName = incompleteSubstitutedMatch[1];
                        const varStart = offset + operandStart - 1; // Include <
                        const varEnd = hasClosingAngle ? offset + pos + 1 : offset + pos; // Include > if present
                        const innerStart = offset + operandStart;
                        const nameChildren = [
                            elt(Type.SubstitutedParamMark, innerStart, innerStart + 2), // __
                        ];
                        if (paramName) {
                            nameChildren.push(elt(Type.SubstitutedParamName, innerStart + 2, innerStart + 2 + paramName.length));
                        }
                        stepChildren.push(elt(Type.SubstitutedParam, varStart, varEnd, nameChildren));
                    }
                    else {
                        // Check if this is a macro call with params (contains whitespace)
                        const spaceIdx = varContent.search(/\s/);
                        if (spaceIdx !== -1) {
                            // Macro call: <macroname params>
                            const macroStart = offset + operandStart - 1; // Include <
                            const macroEnd = hasClosingAngle ? offset + pos + 1 : offset + pos;
                            const macroChildren = [
                                elt(Type.MacroCallMark, macroStart, macroStart + 1), // <
                            ];
                            const macroName = varContent.slice(0, spaceIdx);
                            const nameStart = offset + operandStart;
                            const nameEnd = nameStart + macroName.length;
                            // Check if macro name is a placeholder
                            const placeholderMatch = Patterns.placeholder.exec(macroName);
                            if (placeholderMatch) {
                                const pName = placeholderMatch[1];
                                macroChildren.push(elt(Type.Placeholder, nameStart, nameEnd, [
                                    elt(Type.PlaceholderMark, nameStart, nameStart + 1),
                                    elt(Type.VariableName, nameStart + 1, nameStart + 1 + pName.length),
                                    elt(Type.PlaceholderMark, nameEnd - 1, nameEnd)
                                ]));
                            }
                            else {
                                macroChildren.push(elt(Type.MacroName, nameStart, nameEnd));
                            }
                            // Parse params
                            const paramsStr = varContent.slice(spaceIdx);
                            const paramsStart = offset + operandStart + spaceIdx;
                            const paramElements = parseMacroParams(paramsStr.trim(), paramsStart + (paramsStr.length - paramsStr.trimStart().length));
                            macroChildren.push(...paramElements);
                            if (hasClosingAngle) {
                                macroChildren.push(elt(Type.MacroCallMark, offset + pos, offset + pos + 1)); // >
                            }
                            stepChildren.push(elt(Type.MacroCall, macroStart, macroEnd, macroChildren));
                        }
                        else {
                            // Simple variable reference: <varname>
                            const varStart = offset + operandStart - 1; // Include <
                            const varEnd = hasClosingAngle ? offset + pos + 1 : offset + pos; // Include > if present
                            stepChildren.push(createFilterVariable(varContent, varStart, varEnd));
                        }
                    }
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '{') {
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== '}')
                        pos++;
                    const textRef = filterContent.slice(operandStart, pos);
                    const hasClosingBrace = pos < len && filterContent[pos] === '}';
                    const refStart = offset + operandStart - 1; // Include {
                    const refEnd = hasClosingBrace ? offset + pos + 1 : offset + pos; // Include } if present
                    stepChildren.push(createFilterTextRef(textRef, refStart, refEnd));
                    if (pos < len)
                        pos++;
                }
                else if (operandCh === '(') {
                    pos++;
                    const operandStart = pos;
                    while (pos < len && filterContent[pos] !== ')')
                        pos++;
                    const varContent = filterContent.slice(operandStart, pos);
                    const hasClosingParen = pos < len && filterContent[pos] === ')';
                    const varStart = offset + operandStart - 1; // Include (
                    const varEnd = hasClosingParen ? offset + pos + 1 : offset + pos; // Include ) if present
                    stepChildren.push(createFilterMultiVariable(varContent, varStart, varEnd));
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
                else if (operandCh === '$') {
                    // Check for $param$ placeholder in operator position
                    const placeholderMatch = filterContent.slice(pos).match(/^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/);
                    if (placeholderMatch) {
                        const paramName = placeholderMatch[1];
                        const matchEnd = pos + placeholderMatch[0].length;
                        const placeholderChildren = [
                            elt(Type.PlaceholderMark, offset + pos, offset + pos + 1), // $
                            elt(Type.VariableName, offset + pos + 1, offset + pos + 1 + paramName.length),
                            elt(Type.PlaceholderMark, offset + matchEnd - 1, offset + matchEnd) // $
                        ];
                        stepChildren.push(elt(Type.Placeholder, offset + pos, offset + matchEnd, placeholderChildren));
                        pos = matchEnd;
                    }
                    else {
                        pos++;
                    }
                }
                else if (operandCh === ',') {
                    // Comma separates multiple operands for functions: [func[a],[b]] or [func<v1>,<v2>]
                    // Just skip the comma and continue parsing next operand
                    pos++;
                }
                else if (/[^\s\[\]<>{},]/.test(operandCh)) {
                    // Filter operator/function name - TiddlyWiki allows any char except brackets, whitespace, and comma
                    const opStart = pos;
                    while (pos < len && /[^\s\[\]<>{},]/.test(filterContent[pos]))
                        pos++;
                    const opName = filterContent.slice(opStart, pos);
                    // Track the operator name (strip ! prefix and : suffix for matching)
                    currentOperatorName = opName.replace(/^!/, '').replace(/:.*$/, '');
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
        // Run prefix: + - ~ = => :name
        if (ch === '+' || ch === '-' || ch === '~' || ch === '=' || ch === ':') {
            pos++;
            // => shortcut for :let
            if (ch === '=' && pos < len && filterContent[pos] === '>')
                pos++;
            while (pos < len && /[a-zA-Z]/.test(filterContent[pos]))
                pos++;
            continue;
        }
        // Standalone $param$ placeholder (not inside a filter step)
        if (ch === '$') {
            const placeholderMatch = filterContent.slice(pos).match(/^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/);
            if (placeholderMatch) {
                const paramName = placeholderMatch[1];
                const matchEnd = pos + placeholderMatch[0].length;
                const placeholderChildren = [
                    elt(Type.PlaceholderMark, offset + pos, offset + pos + 1), // $
                    elt(Type.VariableName, offset + pos + 1, offset + pos + 1 + paramName.length),
                    elt(Type.PlaceholderMark, offset + matchEnd - 1, offset + matchEnd) // $
                ];
                elements.push(elt(Type.Placeholder, offset + pos, offset + matchEnd, placeholderChildren));
                pos = matchEnd;
                continue;
            }
        }
        pos++;
    }
    return elements;
}
/**
 * Detect a run of delimiter characters and determine match position.
 *
 * For runs of 3+ characters:
 * - Openers match at the START of the run (first N chars)
 * - Closers match at the END of the run (last N chars)
 *
 * This ensures '''text''' renders as bold with quotes inside: 'text'
 */
export function detectDelimiterRun(cx, pos, charCode, delimLength = 2) {
    // Find the full run of consecutive delimiter characters
    let runStart = pos;
    while (cx.char(runStart - 1) === charCode)
        runStart--;
    let runEnd = pos + delimLength;
    while (cx.char(runEnd) === charCode)
        runEnd++;
    const runLength = runEnd - runStart;
    // Check flanking based on what's before/after the FULL run
    const beforeRun = cx.slice(runStart - 1, runStart);
    const afterRun = cx.slice(runEnd, runEnd + 1);
    const sBeforeRun = isWhitespaceOrEmpty(beforeRun);
    // @ts-expect-error TS(6133): 'sAfterRun' is declared but its value is never rea... Remove this comment to see the full error message
    const sAfterRun = isWhitespaceOrEmpty(afterRun);
    // Determine match position: first N for opener, last N for closer
    // A closer can match if something non-space precedes the run
    let matchStart;
    if (!sBeforeRun && runLength > delimLength) {
        // Can be closer with extra chars: match last N
        matchStart = runEnd - delimLength;
    }
    else {
        // Opener or exactly N chars: match first N
        matchStart = runStart;
    }
    // Flanking for the actual delimiter position
    const before = cx.slice(matchStart - 1, matchStart);
    const after = cx.slice(matchStart + delimLength, matchStart + delimLength + 1);
    // @ts-expect-error TS(6133): 'sBefore' is declared but its value is never read.
    const sBefore = isWhitespaceOrEmpty(before);
    // @ts-expect-error TS(6133): 'sAfter' is declared but its value is never read.
    const sAfter = isWhitespaceOrEmpty(after);
    return {
        runStart,
        runEnd,
        runLength,
        matchStart,
        // TiddlyWiki uses simpler delimiter matching than CommonMark
        // Don't require strict flanking - allow delimiters regardless of surrounding whitespace
        canOpen: true,
        canClose: true,
    };
}
/**
 * Create a delimiter parser function for paired delimiters like '', //, __, etc.
 *
 * This is a factory function that creates inline parsers for delimiter-based
 * formatting (bold, italic, underline, strikethrough, superscript, subscript).
 */
export function createDelimiterParser(config) {
    const { charCode, delimType, delimLength = 2, rejectOddRuns = false } = config;
    return function parseDelimiter(cx, next, pos) {
        // Check if we're at the start of a potential delimiter
        if (next !== charCode)
            return -1;
        // Check we have enough consecutive characters
        for (let i = 1; i < delimLength; i++) {
            if (cx.char(pos + i) !== charCode)
                return -1;
        }
        // Detect the full run
        const run = detectDelimiterRun(cx, pos, charCode, delimLength);
        if (!run)
            return -1;
        // Reject odd-length runs if configured (e.g., ~~~ for strikethrough)
        if (rejectOddRuns && run.runLength % 2 === 1)
            return -1;
        // Only proceed if we're at the correct match position
        if (pos !== run.matchStart)
            return -1;
        return cx.addDelimiter(delimType, pos, pos + delimLength, run.canOpen, run.canClose);
    };
}
// ============================================================================
// Transclusion Target Parsing
// ============================================================================
/**
 * Parse a transclusion target like "tiddler!!field" or "tiddler##index"
 * Returns elements for the target, field indicator, and index indicator
 * Also handles $param$ and $(variable)$ substitutions in the tiddler part
 */
export function parseTransclusionTarget(target, offset) {
    const elements = [];
    // Helper to parse tiddler part with substitution patterns
    // Handles: $param$ (parameter) and $(variable)$ (variable substitution)
    const parseTiddlerPart = (tiddler, partOffset) => {
        // Pattern to match substitutions: $(varName)$ or $paramName$
        // $(varName)$ - variable substitution (with parentheses)
        // $paramName$ - parameter substitution (without parentheses, not starting with ()
        const substitutionRe = /\$(\(([a-zA-Z][a-zA-Z0-9\-_]*)\)\$|([a-zA-Z][a-zA-Z0-9\-_]*)\$)/g;
        let lastIndex = 0;
        let match;
        const children = [];
        let hasSubstitutions = false;
        while ((match = substitutionRe.exec(tiddler)) !== null) {
            hasSubstitutions = true;
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;
            // Add any text before this substitution as TransclusionTarget
            if (matchStart > lastIndex) {
                children.push(elt(Type.TransclusionTarget, partOffset + lastIndex, partOffset + matchStart));
            }
            if (match[2]) {
                // $(variable)$ - variable substitution
                const varName = match[2];
                children.push(elt(Type.Variable, partOffset + matchStart, partOffset + matchEnd, [
                    elt(Type.PlaceholderMark, partOffset + matchStart, partOffset + matchStart + 2), // $(
                    elt(Type.VariableName, partOffset + matchStart + 2, partOffset + matchStart + 2 + varName.length),
                    elt(Type.PlaceholderMark, partOffset + matchEnd - 2, partOffset + matchEnd) // )$
                ]));
            }
            else if (match[3]) {
                // $param$ - parameter substitution
                const paramName = match[3];
                children.push(elt(Type.Placeholder, partOffset + matchStart, partOffset + matchEnd, [
                    elt(Type.PlaceholderMark, partOffset + matchStart, partOffset + matchStart + 1), // $
                    elt(Type.VariableName, partOffset + matchStart + 1, partOffset + matchStart + 1 + paramName.length),
                    elt(Type.PlaceholderMark, partOffset + matchEnd - 1, partOffset + matchEnd) // $
                ]));
            }
            lastIndex = matchEnd;
        }
        // Add any remaining text after last substitution
        if (hasSubstitutions) {
            if (lastIndex < tiddler.length) {
                children.push(elt(Type.TransclusionTarget, partOffset + lastIndex, partOffset + tiddler.length));
            }
            // Wrap all children in a single TransclusionTarget if there are substitutions mixed with text
            elements.push(...children);
        }
        else {
            // No substitutions found, just add as TransclusionTarget
            elements.push(elt(Type.TransclusionTarget, partOffset, partOffset + tiddler.length));
        }
    };
    // Check for field reference (!!field)
    const fieldIdx = target.indexOf("!!");
    if (fieldIdx >= 0) {
        if (fieldIdx > 0) {
            parseTiddlerPart(target.slice(0, fieldIdx), offset);
        }
        // Add !! mark
        elements.push(elt(Type.TransclusionFieldMark, offset + fieldIdx, offset + fieldIdx + 2));
        // Add field name if present
        const fieldName = target.slice(fieldIdx + 2);
        if (fieldName.length > 0) {
            elements.push(elt(Type.TransclusionField, offset + fieldIdx + 2, offset + target.length));
        }
        return elements;
    }
    // Check for index reference (##index)
    const indexIdx = target.indexOf("##");
    if (indexIdx >= 0) {
        if (indexIdx > 0) {
            parseTiddlerPart(target.slice(0, indexIdx), offset);
        }
        // Add ## mark
        elements.push(elt(Type.TransclusionIndexMark, offset + indexIdx, offset + indexIdx + 2));
        // Add index name if present
        const indexName = target.slice(indexIdx + 2);
        if (indexName.length > 0) {
            elements.push(elt(Type.TransclusionIndex, offset + indexIdx + 2, offset + target.length));
        }
        return elements;
    }
    // Simple target - parse for substitutions
    if (target.length > 0) {
        parseTiddlerPart(target, offset);
    }
    return elements;
}
/**
 * Find the end of an HTML/Widget tag, handling nested quotes, macros, etc.
 *
 * This properly handles:
 * - Quoted strings (single and double quotes)
 * - Macro calls <<...>>
 * - Transclusions {{...}}
 * - Filtered transclusions {{{...}}}
 * - Substituted strings `...`
 */
export function findTagEnd(text, startPos = 0) {
    let pos = startPos;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    while (pos < text.length) {
        const ch = text[pos];
        // Handle quotes
        if (ch === "'" && !inDoubleQuote && !inBacktick) {
            inSingleQuote = !inSingleQuote;
            pos++;
            continue;
        }
        if (ch === '"' && !inSingleQuote && !inBacktick) {
            inDoubleQuote = !inDoubleQuote;
            pos++;
            continue;
        }
        if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
            inBacktick = !inBacktick;
            pos++;
            continue;
        }
        // Skip content inside quotes
        if (inSingleQuote || inDoubleQuote || inBacktick) {
            pos++;
            continue;
        }
        // Skip macro calls <<...>>
        if (ch === '<' && text[pos + 1] === '<') {
            let depth = 1;
            pos += 2;
            while (pos < text.length && depth > 0) {
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
            continue;
        }
        // Skip filtered transclusions {{{...}}}
        if (ch === '{' && text[pos + 1] === '{' && text[pos + 2] === '{') {
            pos += 3;
            while (pos < text.length - 2) {
                if (text[pos] === '}' && text[pos + 1] === '}' && text[pos + 2] === '}') {
                    pos += 3;
                    break;
                }
                pos++;
            }
            continue;
        }
        // Skip transclusions {{...}}
        if (ch === '{' && text[pos + 1] === '{') {
            pos += 2;
            while (pos < text.length - 1) {
                if (text[pos] === '}' && text[pos + 1] === '}') {
                    pos += 2;
                    break;
                }
                pos++;
            }
            continue;
        }
        // Check for self-closing />
        if (ch === '/' && text[pos + 1] === '>') {
            return { endPos: pos + 2, selfClosing: true };
        }
        // Check for closing >
        if (ch === '>') {
            return { endPos: pos + 1, selfClosing: false };
        }
        // Check for newline (tag must be on single line for inline)
        if (ch === '\n') {
            return null;
        }
        // Encountering < means the tag was never properly closed
        if (ch === '<') {
            return null;
        }
        pos++;
    }
    return null;
}
// ============================================================================
// Filter Expression Parsing
// ============================================================================
/**
 * Parse a filter expression and return elements for syntax highlighting.
 *
 * Handles:
 * - Filter steps: [operator[operand]]
 * - Variables: <variable>
 * - Text references: {textref}
 * - Regex: /pattern/flags
 * - Run prefixes: +, -, ~, :named
 */
export function parseFilterExpression(content, offset, options = {}) {
    const elements = [];
    let pos = 0;
    while (pos < content.length) {
        const ch = content[pos];
        // Skip whitespace
        if (/\s/.test(ch)) {
            pos++;
            continue;
        }
        // Run prefix: + - ~ = => or :name
        if (ch === '+' || ch === '-' || ch === '~' || ch === '=') {
            pos++;
            // => shortcut for :let
            if (ch === '=' && pos < content.length && content[pos] === '>')
                pos++;
            continue;
        }
        if (ch === ':') {
            // Named run prefix :name
            const nameMatch = content.slice(pos + 1).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
            if (nameMatch) {
                pos += 1 + nameMatch[0].length;
            }
            else {
                pos++;
            }
            continue;
        }
        // Filter step: [...]
        if (ch === '[') {
            const stepStart = pos;
            let depth = 1;
            pos++;
            while (pos < content.length && depth > 0) {
                const c = content[pos];
                if (c === '[')
                    depth++;
                else if (c === ']')
                    depth--;
                pos++;
            }
            if (depth === 0) {
                const stepContent = content.slice(stepStart + 1, pos - 1);
                const stepElements = parseFilterStep(stepContent, offset + stepStart + 1);
                elements.push(elt(Type.FilterRun, offset + stepStart, offset + pos, stepElements));
            }
            continue;
        }
        // Variable: <varname> or <__param__>
        if (ch === '<') {
            const varMatch = content.slice(pos).match(/^<([^<>]+)>/);
            if (varMatch) {
                const varContent = varMatch[1];
                const varStart = offset + pos;
                const varEnd = varStart + varMatch[0].length;
                // Use createFilterVariable which adds marks for < and >
                elements.push(createFilterVariable(varContent, varStart, varEnd));
                pos += varMatch[0].length;
                continue;
            }
        }
        // Multi-valued variable: (varname)
        if (ch === '(') {
            const mvvMatch = content.slice(pos).match(/^\(([^()]+)\)/);
            if (mvvMatch) {
                const varContent = mvvMatch[1];
                const varStart = offset + pos;
                const varEnd = varStart + mvvMatch[0].length;
                elements.push(createFilterMultiVariable(varContent, varStart, varEnd));
                pos += mvvMatch[0].length;
                continue;
            }
        }
        // Text reference: {textref}
        if (ch === '{') {
            const refMatch = content.slice(pos).match(/^\{([^{}]+)\}/);
            if (refMatch) {
                const innerContent = refMatch[1];
                const refStart = offset + pos; // at {
                const refEnd = offset + pos + refMatch[0].length; // after }
                elements.push(createFilterTextRef(innerContent, refStart, refEnd));
                pos += refMatch[0].length;
                continue;
            }
        }
        // Regex: /pattern/flags (if allowed)
        if (options.allowRegex && ch === '/') {
            const regexMatch = content.slice(pos).match(/^\/(?:[^\/\\]|\\.)*\/[gimsuy]*/);
            if (regexMatch) {
                elements.push(elt(Type.FilterRegexp, offset + pos, offset + pos + regexMatch[0].length));
                pos += regexMatch[0].length;
                continue;
            }
        }
        // Standalone $param$ placeholder (not inside a filter step)
        if (ch === '$') {
            const placeholderMatch = content.slice(pos).match(/^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/);
            if (placeholderMatch) {
                const paramName = placeholderMatch[1];
                const matchEnd = pos + placeholderMatch[0].length;
                const placeholderChildren = [
                    elt(Type.PlaceholderMark, offset + pos, offset + pos + 1), // $
                    elt(Type.VariableName, offset + pos + 1, offset + pos + 1 + paramName.length),
                    elt(Type.PlaceholderMark, offset + matchEnd - 1, offset + matchEnd) // $
                ];
                elements.push(elt(Type.Placeholder, offset + pos, offset + matchEnd, placeholderChildren));
                pos = matchEnd;
                continue;
            }
        }
        pos++;
    }
    return elements;
}
/**
 * Parse a single filter step like "operator[operand]" or "operator{textref}"
 */
function parseFilterStep(content, offset) {
    const elements = [];
    // Match operator name (with optional : suffix)
    // TiddlyWiki allows any char except brackets, whitespace, and colon (suffix separator)
    const opMatch = content.match(/^(!?)([^\s\[\]<>{}:]+)?(:?)/);
    if (!opMatch)
        return elements;
    let pos = 0;
    // @ts-expect-error TS(6133): 'negation' is declared but its value is never read... Remove this comment to see the full error message
    const [fullMatch, negation, opName, colonSuffix] = opMatch;
    if (fullMatch.length > 0) {
        elements.push(elt(Type.FilterOperator, offset, offset + fullMatch.length));
        pos = fullMatch.length;
    }
    // Parse operand(s)
    // For regexp operator, operand should be styled as regexp
    const isRegexpOp = opName === 'regexp';
    while (pos < content.length) {
        const ch = content[pos];
        // Operand in brackets: [value]
        if (ch === '[') {
            const closePos = findMatchingBracket(content, pos, '[', ']');
            if (closePos > pos) {
                const operandType = isRegexpOp ? Type.FilterRegexp : Type.FilterOperand;
                elements.push(elt(operandType, offset + pos, offset + closePos + 1));
                pos = closePos + 1;
                continue;
            }
        }
        // Operand in braces: {textref}
        if (ch === '{') {
            const closePos = findMatchingBracket(content, pos, '{', '}');
            if (closePos > pos) {
                const innerContent = content.slice(pos + 1, closePos);
                const refStart = offset + pos; // at {
                const refEnd = offset + closePos + 1; // after }
                elements.push(createFilterTextRef(innerContent, refStart, refEnd));
                pos = closePos + 1;
                continue;
            }
        }
        // Operand in angle brackets: <variable>, <__param__>, or <macro params>
        if (ch === '<') {
            const closePos = findMatchingBracket(content, pos, '<', '>', true);
            if (closePos > pos) {
                const varContent = content.slice(pos + 1, closePos);
                const varStart = offset + pos;
                const varEnd = offset + closePos + 1;
                const innerStart = varStart + 1; // After <
                const innerEnd = varEnd - 1; // Before >
                // Check if it's a substituted parameter: <__param__>
                const substitutedMatch = /^__(.+)__$/.exec(varContent);
                if (substitutedMatch) {
                    const paramName = substitutedMatch[1];
                    const children = [
                        elt(Type.SubstitutedParamMark, innerStart, innerStart + 2), // __
                        elt(Type.SubstitutedParamName, innerStart + 2, innerStart + 2 + paramName.length),
                        elt(Type.SubstitutedParamMark, innerStart + 2 + paramName.length, innerEnd), // __
                    ];
                    elements.push(elt(Type.SubstitutedParam, varStart, varEnd, children));
                }
                else {
                    // Check if this is a macro call with params (contains whitespace)
                    const spaceIdx = varContent.search(/\s/);
                    if (spaceIdx !== -1) {
                        // Macro call: <macroname params>
                        const macroChildren = [
                            elt(Type.MacroCallMark, varStart, varStart + 1), // <
                        ];
                        const macroName = varContent.slice(0, spaceIdx);
                        const nameStart = innerStart;
                        const nameEnd = nameStart + macroName.length;
                        // Check if macro name is a placeholder
                        const placeholderMatch = Patterns.placeholder.exec(macroName);
                        if (placeholderMatch) {
                            const paramName = placeholderMatch[1];
                            macroChildren.push(elt(Type.Placeholder, nameStart, nameEnd, [
                                elt(Type.PlaceholderMark, nameStart, nameStart + 1),
                                elt(Type.VariableName, nameStart + 1, nameStart + 1 + paramName.length),
                                elt(Type.PlaceholderMark, nameEnd - 1, nameEnd)
                            ]));
                        }
                        else {
                            macroChildren.push(elt(Type.MacroName, nameStart, nameEnd));
                        }
                        // Parse params
                        const paramsStr = varContent.slice(spaceIdx);
                        const paramsStart = innerStart + spaceIdx;
                        const paramElements = parseMacroParams(paramsStr.trim(), paramsStart + (paramsStr.length - paramsStr.trimStart().length));
                        macroChildren.push(...paramElements);
                        macroChildren.push(elt(Type.MacroCallMark, innerEnd, varEnd)); // >
                        elements.push(elt(Type.MacroCall, varStart, varEnd, macroChildren));
                    }
                    else {
                        // Simple variable reference: <varname>
                        // Pass varStart/varEnd which include < and >
                        elements.push(createFilterVariable(varContent, varStart, varEnd));
                    }
                }
                pos = closePos + 1;
                continue;
            }
        }
        // Multi-valued variable operand: (varname)
        if (ch === '(') {
            const closePos = findMatchingBracket(content, pos, '(', ')');
            if (closePos > pos) {
                const varContent = content.slice(pos + 1, closePos);
                const varStart = offset + pos;
                const varEnd = offset + closePos + 1;
                elements.push(createFilterMultiVariable(varContent, varStart, varEnd));
                pos = closePos + 1;
                continue;
            }
        }
        // Regex operand: /pattern/
        if (ch === '/') {
            const regexMatch = content.slice(pos).match(/^\/(?:[^\/\\]|\\.)*\/[gimsuy]*/);
            if (regexMatch) {
                elements.push(elt(Type.FilterRegexp, offset + pos, offset + pos + regexMatch[0].length));
                pos += regexMatch[0].length;
                continue;
            }
        }
        pos++;
    }
    return elements;
}
/**
 * Find the matching closing bracket
 */
function findMatchingBracket(text, pos, open, close, skipBraces) {
    let depth = 0;
    while (pos < text.length) {
        if (skipBraces) {
            const afterBraced = skipBracedBlock(text, pos);
            if (afterBraced > pos) {
                pos = afterBraced;
                continue;
            }
        }
        if (text[pos] === open)
            depth++;
        else if (text[pos] === close) {
            depth--;
            if (depth === 0)
                return pos;
        }
        pos++;
    }
    return -1;
}
// ============================================================================
// Macro Parameter Parsing
// ============================================================================
/**
 * Check if a string is a $param$ placeholder pattern and create appropriate element
 */
const placeholderParamRe = /^\$([a-zA-Z][a-zA-Z0-9\-_]*)\$$/;
function createMacroParamNameElement(name, start, end) {
    const match = placeholderParamRe.exec(name);
    if (match) {
        const paramName = match[1];
        return elt(Type.Placeholder, start, end, [
            elt(Type.PlaceholderMark, start, start + 1),
            elt(Type.VariableName, start + 1, start + 1 + paramName.length),
            elt(Type.PlaceholderMark, end - 1, end)
        ]);
    }
    return elt(Type.MacroParamName, start, end);
}
/**
 * Parse placeholders inside a macro param value string
 */
function parseMacroParamValuePlaceholders(content, offset) {
    const elements = [];
    const re = /\$([a-zA-Z][a-zA-Z0-9\-_]*)\$/g;
    let match;
    let lastEnd = 0;
    while ((match = re.exec(content)) !== null) {
        // Add text before placeholder if any
        if (match.index > lastEnd) {
            elements.push(elt(Type.Text, offset + lastEnd, offset + match.index));
        }
        // Add placeholder
        const paramName = match[1];
        const start = offset + match.index;
        const end = start + match[0].length;
        elements.push(elt(Type.Placeholder, start, end, [
            elt(Type.PlaceholderMark, start, start + 1),
            elt(Type.VariableName, start + 1, start + 1 + paramName.length),
            elt(Type.PlaceholderMark, end - 1, end)
        ]));
        lastEnd = match.index + match[0].length;
    }
    // Add remaining text if any
    if (lastEnd < content.length) {
        elements.push(elt(Type.Text, offset + lastEnd, offset + content.length));
    }
    return elements;
}
/**
 * Parse macro parameters and return elements.
 *
 * Handles:
 * - Named parameters: name:value or name:"quoted value"
 * - Positional parameters: value or "quoted value"
 * - Triple bracketed: [[[value]]]
 * - Double bracketed: [[value]]
 * - Single and double quoted strings
 *
 * Returns MacroParam elements wrapping MacroParamName (optional) and MacroParamValue
 */
export function parseMacroParams(paramsStr, offset) {
    const elements = [];
    let pos = 0;
    const len = Math.min(paramsStr.length, 5000); // Safety limit
    let iterations = 0;
    const maxIterations = 200; // Safety limit on number of parameters
    while (pos < len && iterations < maxIterations) {
        iterations++;
        // Skip whitespace
        while (pos < len && /\s/.test(paramsStr[pos]))
            pos++;
        if (pos >= len)
            break;
        const paramStart = pos;
        // Check if it's a named parameter (name:value) - allow $ for placeholder names like $param$
        let nameEnd = pos;
        while (nameEnd < len && /[a-zA-Z0-9\-_$]/.test(paramsStr[nameEnd]))
            nameEnd++;
        const separatorChar = nameEnd > pos ? paramsStr[nameEnd] : '';
        const isNamedParam = separatorChar === ':' || (separatorChar === '=' && (paramsStr.slice(nameEnd + 1, nameEnd + 4) === '{{{' || paramsStr.slice(nameEnd + 1, nameEnd + 3) === '{{'));
        if (isNamedParam) {
            // Named parameter (name:value or name={{...}} or name={{{...}}})
            const nameStart = pos;
            pos = nameEnd + 1; // skip the : or =
            // Parse value
            const valueStart = pos;
            let valueEnd = pos;
            if (separatorChar === '=' && paramsStr.slice(pos, pos + 3) === '{{{') {
                // Filtered transclusion: ={{{filter}}}
                const blockEnd = skipBracedBlock(paramsStr, pos);
                pos = blockEnd;
                valueEnd = pos;
                // Parse inner filter content
                const filterContent = paramsStr.slice(valueStart + 3, valueEnd - 3);
                const filterOffset = offset + valueStart + 3;
                const filterChildren = parseFilterExpressionDetailed(filterContent, filterOffset);
                const valueChildren = [
                    elt(Type.FilteredTransclusionMark, offset + valueStart, offset + valueStart + 3), // {{{
                    elt(Type.FilterExpression, filterOffset, filterOffset + filterContent.length, filterChildren),
                    elt(Type.FilteredTransclusionMark, offset + valueEnd - 3, offset + valueEnd), // }}}
                ];
                const valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd, valueChildren);
                const paramNameStr = paramsStr.slice(nameStart, nameEnd);
                const paramNameElement = createMacroParamNameElement(paramNameStr, offset + nameStart, offset + nameEnd);
                elements.push(elt(Type.MacroParam, offset + paramStart, offset + valueEnd, [paramNameElement, valueElement]));
            }
            else if (separatorChar === '=' && paramsStr.slice(pos, pos + 2) === '{{') {
                // Transclusion: ={{tiddler}}
                const blockEnd = skipBracedBlock(paramsStr, pos);
                pos = blockEnd;
                valueEnd = pos;
                // Parse transclusion target
                const targetContent = paramsStr.slice(valueStart + 2, valueEnd - 2);
                const targetOffset = offset + valueStart + 2;
                const targetChildren = parseTransclusionTarget(targetContent, targetOffset);
                const valueChildren = [
                    elt(Type.TransclusionMark, offset + valueStart, offset + valueStart + 2), // {{
                    ...targetChildren,
                    elt(Type.TransclusionMark, offset + valueEnd - 2, offset + valueEnd), // }}
                ];
                const valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd, valueChildren);
                const paramNameStr = paramsStr.slice(nameStart, nameEnd);
                const paramNameElement = createMacroParamNameElement(paramNameStr, offset + nameStart, offset + nameEnd);
                elements.push(elt(Type.MacroParam, offset + paramStart, offset + valueEnd, [paramNameElement, valueElement]));
            }
            else {
                // Standard colon-separated value (separatorChar === ':')
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
                    if (pos < len)
                        pos += 3; // Only skip if we found the closing
                    valueEnd = pos;
                }
                else if (paramsStr.slice(pos, pos + 2) === '[[') {
                    // Double bracket: [[value]]
                    pos += 2;
                    while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]')
                        pos++;
                    if (pos < len)
                        pos += 2; // Only skip if we found the closing
                    valueEnd = pos;
                }
                else {
                    // Unquoted value
                    while (pos < len && !/[\s>]/.test(paramsStr[pos]))
                        pos++;
                    valueEnd = pos;
                }
                // Check if the param name is a placeholder pattern like $param$
                const paramNameStr = paramsStr.slice(nameStart, nameEnd);
                const paramNameElement = createMacroParamNameElement(paramNameStr, offset + nameStart, offset + nameEnd);
                // Parse placeholders inside values (both quoted and unquoted)
                let valueElement;
                const valueStr = paramsStr.slice(valueStart, valueEnd);
                if ((valueStr.startsWith('"') || valueStr.startsWith("'")) && valueStr.length >= 2) {
                    const quote = valueStr[0];
                    const innerContent = valueStr.slice(1, valueStr.length - (valueStr.endsWith(quote) ? 1 : 0));
                    const innerStart = offset + valueStart + 1;
                    const placeholderElements = parseMacroParamValuePlaceholders(innerContent, innerStart);
                    if (placeholderElements.length > 0 && placeholderElements.some(el => el.type === Type.Placeholder)) {
                        // Has placeholders - create value with children
                        const valueChildren = [
                            elt(Type.Mark, offset + valueStart, offset + valueStart + 1), // opening quote
                            ...placeholderElements,
                            elt(Type.Mark, offset + valueEnd - 1, offset + valueEnd) // closing quote
                        ];
                        valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd, valueChildren);
                    }
                    else {
                        valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd);
                    }
                }
                else {
                    // Unquoted value - also parse for placeholders
                    const placeholderElements = parseMacroParamValuePlaceholders(valueStr, offset + valueStart);
                    if (placeholderElements.length > 0 && placeholderElements.some(el => el.type === Type.Placeholder)) {
                        valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd, placeholderElements);
                    }
                    else {
                        valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + valueEnd);
                    }
                }
                const paramChildren = [paramNameElement, valueElement];
                elements.push(elt(Type.MacroParam, offset + paramStart, offset + valueEnd, paramChildren));
            }
        }
        else {
            // Positional parameter (just a value)
            const valueStart = pos;
            let isQuoted = false;
            let quoteChar = '';
            if (paramsStr[pos] === '"' || paramsStr[pos] === "'") {
                isQuoted = true;
                quoteChar = paramsStr[pos];
                pos++;
                while (pos < len && paramsStr[pos] !== quoteChar) {
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
                if (pos < len)
                    pos += 3;
            }
            else if (paramsStr.slice(pos, pos + 2) === '[[') {
                pos += 2;
                while (pos < len && paramsStr.slice(pos, pos + 2) !== ']]')
                    pos++;
                if (pos < len)
                    pos += 2;
            }
            else {
                while (pos < len && !/[\s>]/.test(paramsStr[pos]))
                    pos++;
            }
            // Parse placeholders inside values (both quoted and unquoted)
            let valueElement;
            const valueStr = paramsStr.slice(valueStart, pos);
            if (isQuoted && valueStr.length >= 2) {
                const innerContent = valueStr.slice(1, valueStr.length - (valueStr.endsWith(quoteChar) ? 1 : 0));
                const innerStart = offset + valueStart + 1;
                const placeholderElements = parseMacroParamValuePlaceholders(innerContent, innerStart);
                if (placeholderElements.length > 0 && placeholderElements.some(el => el.type === Type.Placeholder)) {
                    // Has placeholders - create value with children
                    const valueChildren = [
                        elt(Type.Mark, offset + valueStart, offset + valueStart + 1), // opening quote
                        ...placeholderElements,
                        elt(Type.Mark, offset + pos - 1, offset + pos) // closing quote
                    ];
                    valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + pos, valueChildren);
                }
                else {
                    valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + pos);
                }
            }
            else {
                // Unquoted value - also parse for placeholders
                const placeholderElements = parseMacroParamValuePlaceholders(valueStr, offset + valueStart);
                if (placeholderElements.length > 0 && placeholderElements.some(el => el.type === Type.Placeholder)) {
                    valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + pos, placeholderElements);
                }
                else {
                    valueElement = elt(Type.MacroParamValue, offset + valueStart, offset + pos);
                }
            }
            const paramChildren = [valueElement];
            elements.push(elt(Type.MacroParam, offset + paramStart, offset + pos, paramChildren));
        }
    }
    return elements;
}
//# sourceMappingURL=utils.js.map