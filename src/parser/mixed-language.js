/**
 * TiddlyWiki Mixed Language Parsing
 *
 * Provides support for nested language parsing in code blocks and typed blocks.
 */
import { parseMixed } from "@lezer/common";
import { getCodeParser } from "./language";
/**
 * Map MIME types to language names for typed blocks
 */
export function mimeToLanguage(mimeType) {
    const mimeMap = {
        "text/javascript": "javascript",
        "application/javascript": "javascript",
        "text/typescript": "typescript",
        "application/typescript": "typescript",
        "text/css": "css",
        "text/html": "html",
        "application/json": "json",
        "text/x-markdown": "markdown",
        "text/x-tiddlywiki": "",
        "text/vnd.tiddlywiki": "",
        "text/plain": "",
    };
    // Try direct lookup, then strip common prefixes
    return mimeMap[mimeType] ??
        mimeType.replace(/^text\/x-/, "").replace(/^application\//, "").replace(/^text\//, "");
}
/**
 * Find language name from file extension using registered languages
 * Returns the language name (lowercased) or empty string if not found
 */
export function extensionToLanguage(ext, codeLanguages) {
    if (!ext.startsWith("."))
        return "";
    // Remove leading dot and lowercase
    const extNoDot = ext.slice(1).toLowerCase();
    if (codeLanguages && Array.isArray(codeLanguages)) {
        for (const lang of codeLanguages) {
            // Check if this language's extensions include the file extension
            if (lang.extensions && lang.extensions.some((e) => e.toLowerCase() === extNoDot)) {
                // Return the language name lowercased (matches how getCodeParser works)
                return lang.name.toLowerCase();
            }
        }
    }
    return "";
}
/**
 * Create a mixed language parsing wrapper for nested languages in code blocks
 */
export function createMixedLanguageWrapper(codeLanguages, defaultCodeLanguage, tiddlywikiParser, getWidgetAttributes) {
    const getParser = getCodeParser(codeLanguages, defaultCodeLanguage, tiddlywikiParser);
    return parseMixed((node, input) => {
        // CODE BLOCKS: Full replacement parsing for CodeText
        if (node.name === "CodeText") {
            const parent = node.node.parent;
            // Fenced code block: ```language
            if (parent?.name === "FencedCode") {
                const codeInfo = parent.getChild("CodeInfo");
                const lang = codeInfo ? input.read(codeInfo.from, codeInfo.to) : "";
                const parser = getParser(lang);
                if (parser) {
                    // bracketed: true enables languageDataAt() to find the nested language's completions
                    return { parser, bracketed: true };
                }
            }
            // Typed block: $$$type
            if (parent?.name === "TypedBlock") {
                const typeNode = parent.getChild("TypedBlockType");
                const typeName = typeNode ? input.read(typeNode.from, typeNode.to) : "";
                // Handle text/vnd.tiddlywiki - parse content as TiddlyWiki wikitext
                if (typeName === "text/vnd.tiddlywiki" || typeName === "text/x-tiddlywiki") {
                    if (tiddlywikiParser) {
                        return { parser: tiddlywikiParser, bracketed: true };
                    }
                }
                // Handle text/plain - no syntax highlighting (return null to keep CodeText)
                if (typeName === "text/plain") {
                    return null;
                }
                // For file extensions (.js, .css, etc.), look up language from registered languages
                if (typeName.startsWith(".")) {
                    const langName = extensionToLanguage(typeName, Array.isArray(codeLanguages) ? codeLanguages : undefined);
                    if (langName) {
                        const parser = getParser(langName);
                        if (parser) {
                            return { parser, bracketed: true };
                        }
                    }
                }
                // For MIME types, try to find a matching language parser
                const langName = mimeToLanguage(typeName);
                if (langName) {
                    const parser = getParser(langName);
                    if (parser) {
                        // bracketed: true enables languageDataAt() to find the nested language's completions
                        return { parser, bracketed: true };
                    }
                }
            }
        }
        // CSS IN <style> TAGS: Parse content as CSS (like ```css code blocks)
        // JAVASCRIPT IN <script> TAGS: Parse content as JavaScript
        if (node.name === "HTMLBlock") {
            // Check if this is a <style> or <script> tag
            const tagNameNode = node.node.getChild("TagName");
            if (tagNameNode) {
                const tagName = input.read(tagNameNode.from, tagNameNode.to).toLowerCase();
                if (tagName === "style" || tagName === "script") {
                    const parserName = tagName === "style" ? "css" : "javascript";
                    const contentParser = getParser(parserName);
                    if (contentParser) {
                        // Find the content range: after opening tag's > and before closing tag
                        let contentStart = -1;
                        let contentEnd = -1;
                        const cursor = node.node.cursor();
                        cursor.firstChild();
                        do {
                            if (cursor.name === "TagMark" && contentStart === -1) {
                                const markText = input.read(cursor.from, cursor.to);
                                if (markText === ">") {
                                    contentStart = cursor.to;
                                }
                            }
                            if (cursor.name === "HTMLEndTag") {
                                contentEnd = cursor.from;
                                break;
                            }
                        } while (cursor.nextSibling());
                        if (contentStart > 0 && contentEnd > contentStart) {
                            return {
                                parser: contentParser,
                                overlay: [{ from: contentStart, to: contentEnd }]
                            };
                        }
                    }
                }
            }
        }
        // NOTE: We intentionally do NOT apply HTML overlay parsing to HTMLBlock/HTMLTag.
        // The TiddlyWiki parser already creates proper nodes (TagName, TagMark, AttributeName, etc.)
        // with correct styling via styleTags. HTML overlay parsing was broken because:
        // 1. getHtmlTagOverlayRanges provided discontinuous fragments to the HTML parser
        // 2. The HTML parser couldn't make sense of fragments like just "div" or "class=''"
        // 3. This resulted in no useful nodes, breaking TiddlyWiki's styling
        // HTML completions work via custom completion sources (htmlTagCompletion,
        // htmlAttributeCompletion) that analyze text context, not the parse tree.
        // KATEX/LATEX: Parse LaTeXContent nodes with LaTeX language
        if (node.name === "LaTeXContent") {
            const latexParser = getParser("latex");
            if (latexParser) {
                // bracketed: true enables languageDataAt() to find the nested language's completions
                return { parser: latexParser, bracketed: true };
            }
        }
        // CSS IN STYLED SPANS: Parse HighlightStyles as CSS (@@color:red;...@@)
        // Uses { top: "Styles" } to parse inline CSS declarations without braces,
        // similar to how HTML handles style="" attributes
        if (node.name === "HighlightStyles") {
            const cssParser = getParser("css");
            if (cssParser && cssParser.configure) {
                // Configure CSS parser to start from "Styles" rule (declarations only, no braces needed)
                const inlineStyleParser = cssParser.configure({ top: "Styles" });
                // bracketed: true enables languageDataAt() to find the nested language's completions
                return { parser: inlineStyleParser, bracketed: true };
            }
        }
        // CSS IN STYLE ATTRIBUTES: Parse style="..." as CSS declarations
        // Works for both HTML tags (<div style="...">) and widgets that support style
        if (node.name === "AttributeString") {
            const attrParent = node.node.parent;
            if (attrParent?.name === "Attribute") {
                const attrNameNode = attrParent.getChild("AttributeName");
                if (attrNameNode) {
                    const attrName = input.read(attrNameNode.from, attrNameNode.to);
                    if (attrName === "style") {
                        // Check if we're in a widget - if so, verify it supports style attribute
                        const elementParent = attrParent.parent;
                        if (elementParent && (elementParent.name === "Widget" || elementParent.name === "InlineWidget")) {
                            // This is a widget - check if it supports style
                            if (getWidgetAttributes) {
                                const widgetNameNode = elementParent.getChild("WidgetName");
                                if (widgetNameNode) {
                                    const widgetName = input.read(widgetNameNode.from, widgetNameNode.to);
                                    const attrs = getWidgetAttributes(widgetName);
                                    // If we can get attributes and style is not in the list, skip CSS parsing
                                    if (attrs && !attrs.includes("style")) {
                                        return null;
                                    }
                                }
                            }
                        }
                        // HTML tags always support style (global attribute)
                        const cssParser = getParser("css");
                        if (cssParser && cssParser.configure) {
                            // Configure CSS parser for inline declarations (no braces needed)
                            const inlineStyleParser = cssParser.configure({ top: "Styles" });
                            // AttributeString includes quotes, so parse only the content
                            const from = node.from + 1; // Skip opening quote
                            const to = node.to - 1; // Skip closing quote
                            if (to > from) {
                                return {
                                    parser: inlineStyleParser,
                                    overlay: [{ from, to }],
                                    bracketed: true
                                };
                            }
                        }
                    }
                }
            }
        }
        // LATEX WIDGET: Parse text attribute of $latex widget as LaTeX
        if (node.name === "AttributeString") {
            // Check if this is a text attribute on a $latex widget
            // Tree structure: Widget > Attribute > AttributeString
            const attrParent = node.node.parent;
            if (attrParent?.name === "Attribute") {
                // Get the attribute name
                const attrNameNode = attrParent.getChild("AttributeName");
                if (attrNameNode) {
                    const attrName = input.read(attrNameNode.from, attrNameNode.to);
                    if (attrName === "text") {
                        // Check if the widget is $latex or $katex
                        const widgetParent = attrParent.parent;
                        if (widgetParent && (widgetParent.name === "Widget" || widgetParent.name === "InlineWidget")) {
                            const widgetNameNode = widgetParent.getChild("WidgetName");
                            if (widgetNameNode) {
                                const widgetName = input.read(widgetNameNode.from, widgetNameNode.to);
                                if (widgetName === "$latex" || widgetName === "$katex") {
                                    const latexParser = getParser("latex");
                                    if (latexParser) {
                                        // AttributeString includes quotes, so use overlay to parse only the content
                                        // e.g., for text="\frac{a}{b}", parse only \frac{a}{b} (skip the quotes)
                                        const from = node.from + 1; // Skip opening quote
                                        const to = node.to - 1; // Skip closing quote
                                        if (to > from) {
                                            return {
                                                parser: latexParser,
                                                overlay: [{ from, to }],
                                                bracketed: true
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    });
}
//# sourceMappingURL=mixed-language.js.map