/**
 * TiddlyWiki5 CodeMirror 6 Plugin Entry Point
 *
 * module-type: codemirror6-plugin
 *
 * Production-ready notes:
 * - Commands are `StateCommand`s (CM6 style) and are executed via `{state, dispatch}`.
 * - No `EditorView` typing/usage is required for running commands.
 * - `this` is typed as `any` because the CM6 engine object is provided by TiddlyWiki.
 */

import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { tiddlywikiLanguage, tiddlywikiBaseLanguage, headerIndent } from "./codemirror-tiddlywiki";
import {
  insertNewlineContinueMarkup,
  deleteMarkupBackward,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  toggleSuperscript,
  toggleSubscript,
  toggleInlineCode,
  insertWikiLink,
  insertTransclusion,
  setHeading1,
  setHeading2,
  setHeading3,
  setHeading4,
  setHeading5,
  setHeading6,
  removeHeading,
  toggleBulletList,
  toggleNumberedList,
  insertCodeBlock
} from "./commands";

// Re-export for external use
export { tiddlywikiLanguage, tiddlywikiBaseLanguage };
export * from "./commands";

/**
 * Execute a StateCommand against an engine view
 */
function runStateCommand(cmd: (arg: { state: any; dispatch: any }) => boolean, view: any): boolean {
  return cmd({ state: view.state, dispatch: view.dispatch });
}

export interface CM6PluginContext {
  tiddlerTitle?: string;
  tiddlerType?: string;
  tiddlerFields?: Record<string, any>;
  readOnly?: boolean;
  cm6Core?: any;
  engine?: any;
  options?: Record<string, any>;
}

let _core: any = null;

const TW_TYPES = ["", "text/vnd.tiddlywiki", "text/x-tiddlywiki"];

const tiddlywikiKeymap = keymap.of([
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
  { key: "Mod-Shift-c", run: insertCodeBlock }
]);

export const plugin = {
  name: "tiddlywiki-syntax",
  description: "TiddlyWiki5 Wikitext syntax highlighting and editing support",
  priority: 100,

  /**
   * Initialize with CM6 core reference
   */
  init(cm6Core: any) {
    _core = cm6Core;
  },

  /**
   * Only activate for TiddlyWiki content types
   */
  condition(context: CM6PluginContext): boolean {
    return TW_TYPES.includes(context.tiddlerType || "");
  },

  /**
   * Register language compartment
   */
  registerCompartments(): Record<string, Compartment> {
    if (!_core) return {};
    const CoreCompartment = _core.state.Compartment;
    return { tiddlywikiLanguage: new CoreCompartment() };
  },

  /**
   * Get CodeMirror extensions
   */
  getExtensions(context: CM6PluginContext): Extension[] {
    const extensions: Extension[] = [];
    const engine = context.engine as any;
    const compartments = engine?._compartments as any;

    // Language support via compartment if available
    if (compartments?.tiddlywikiLanguage) {
      extensions.push(compartments.tiddlywikiLanguage.of(tiddlywikiLanguage));
    } else {
      extensions.push(tiddlywikiLanguage);
    }

    // Header folding support
    extensions.push(headerIndent);

    // Keymap (unless read-only)
    if (!context.readOnly) extensions.push(tiddlywikiKeymap);

    return extensions;
  },

  /**
   * Extend engine API with TiddlyWiki-specific methods
   */
  extendAPI(_engine: any, _context: CM6PluginContext): Record<string, any> {
    return {
      // ==== Formatting Commands ====

      toggleBold(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleBold, this.view);
      },

      toggleItalic(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleItalic, this.view);
      },

      toggleUnderline(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleUnderline, this.view);
      },

      toggleStrikethrough(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleStrikethrough, this.view);
      },

      toggleSuperscript(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleSuperscript, this.view);
      },

      toggleSubscript(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleSubscript, this.view);
      },

      toggleInlineCode(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleInlineCode, this.view);
      },

      // ==== Link/Transclusion Commands ====

      insertWikiLink(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(insertWikiLink, this.view);
      },

      insertTransclusion(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(insertTransclusion, this.view);
      },

      // ==== Heading Commands ====

      setHeading(this: any, level: number) {
        if (this._destroyed) return false;

        const cmds = [null, setHeading1, setHeading2, setHeading3, setHeading4, setHeading5, setHeading6] as const;
        const cmd = cmds[level as keyof typeof cmds];

        return cmd ? runStateCommand(cmd, this.view) : false;
      },

      removeHeading(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(removeHeading, this.view);
      },

      // ==== List Commands ====

      toggleBulletList(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleBulletList, this.view);
      },

      toggleNumberedList(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(toggleNumberedList, this.view);
      },

      // ==== Block Commands ====

      insertCodeBlock(this: any) {
        if (this._destroyed) return false;
        return runStateCommand(insertCodeBlock, this.view);
      },

      // ==== Language Configuration ====

      setTiddlyWikiLanguage(this: any, enabled: boolean) {
        if (this._destroyed) return;
        const compartments = this._compartments;
        if (compartments?.tiddlywikiLanguage) {
          this.reconfigure("tiddlywikiLanguage", enabled ? tiddlywikiLanguage : []);
        }
      }
    };
  },

  /**
   * Register event handlers
   */
  registerEvents(_engine: any, _context: CM6PluginContext): Record<string, any> {
    return {
      textOperation(this: any, operation: any) {
        if (!operation) return;

        switch (operation.type) {
          case "toggle-bold":
            this.toggleBold?.();
            break;
          case "toggle-italic":
            this.toggleItalic?.();
            break;
          case "toggle-underline":
            this.toggleUnderline?.();
            break;
          case "insert-link":
            this.insertWikiLink?.();
            break;
          case "insert-transclusion":
            this.insertTransclusion?.();
            break;
        }
      }
    };
  }
};

export default plugin;
