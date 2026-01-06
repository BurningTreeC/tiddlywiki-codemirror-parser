/**
 * @codemirror/lang-tiddlywiki - Backwards Compatibility Re-exports
 *
 * This file re-exports from parser for backwards compatibility.
 *
 * @deprecated Import from "./parser" instead
 */

export {
  tiddlywikiLanguage,
  mkLang,
  getCodeParser,
  headerIndent
} from "./parser"

// Backwards compatibility alias
import { tiddlywikiLanguage } from "./parser"
export const tiddlywikiBaseLanguage = tiddlywikiLanguage
