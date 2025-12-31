/**
 * @codemirror/lang-tiddlywiki - Backwards Compatibility Re-exports
 * 
 * This file re-exports from language.ts for backwards compatibility.
 * New code should import directly from "./language" to avoid circular deps.
 * 
 * @deprecated Import from "./language" instead
 */

export {
  tiddlywikiLanguage,
  tiddlywikiBaseLanguage,
  mkLang,
  getCodeParser,
  headerIndent
} from "./language"
