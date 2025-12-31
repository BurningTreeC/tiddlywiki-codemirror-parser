/**
 * @codemirror/lang-tiddlywiki - Backwards Compatibility Re-exports
 *
 * This file re-exports from tiddlywiki-parser for backwards compatibility.
 *
 * @deprecated Import from "./tiddlywiki-parser" instead
 */

export {
  tiddlywikiLanguage,
  mkLang,
  getCodeParser,
  headerIndent
} from "./tiddlywiki-parser"

// Backwards compatibility alias
import { tiddlywikiLanguage } from "./tiddlywiki-parser"
export const tiddlywikiBaseLanguage = tiddlywikiLanguage
