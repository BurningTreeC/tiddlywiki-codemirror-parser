import { Extension, Compartment } from "@codemirror/state";
import { keymap, type Command, type EditorView } from "@codemirror/view";
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
 * Run a CodeMirror Command against an EditorView
 */
function runCommand(cmd: Command, view: EditorView): boolean {
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

  init(cm6Core: any) {
    _core = cm6Core;
  },

  condition(context: CM6PluginContext): boolean {
    const type = context.tiddlerType;
    return TW_TYPES.includes(type || "");
  },

  registerCompartments(): Record<string, Compartment> {
    if (!_core) return {};
    const Compartment = _core.state.Compartment;
    return {
      tiddlywikiLanguage: new Compartment()
    };
  },

  getExtensions(context: CM6PluginContext): Extension[] {
    const extensions: Extension[] = [];
    const engine = context.engine;
    const compartments = engine?._compartments;

    if (compartments?.tiddlywikiLanguage) {
      extensions.push(compartments.tiddlywikiLanguage.of(tiddlywikiLanguage));
    } else {
      extensions.push(tiddlywikiLanguage);
    }

    extensions.push(headerIndent);

    if (!context.readOnly) {
      extensions.push(tiddlywikiKeymap);
    }

    return extensions;
  },

  /**
   * IMPORTANT: don't type this as Record<string, Function>
   * because it poisons `this` and gives you the TS2345 mess.
   */
  extendAPI(engine: any, context: CM6PluginContext): Record<string, any> {
    return {
      toggleBold(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleBold, this.view as EditorView);
      },
      toggleItalic(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleItalic, this.view as EditorView);
      },
      toggleUnderline(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleUnderline, this.view as EditorView);
      },
      toggleStrikethrough(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleStrikethrough, this.view as EditorView);
      },
      toggleSuperscript(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleSuperscript, this.view as EditorView);
      },
      toggleSubscript(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleSubscript, this.view as EditorView);
      },
      toggleInlineCode(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleInlineCode, this.view as EditorView);
      },

      insertWikiLink(this: any) {
        if (this._destroyed) return false;
        return runCommand(insertWikiLink, this.view as EditorView);
      },
      insertTransclusion(this: any) {
        if (this._destroyed) return false;
        return runCommand(insertTransclusion, this.view as EditorView);
      },

      setHeading(this: any, level: number) {
        if (this._destroyed) return false;
        const commands: Array<Command | null> = [
          null,
          setHeading1,
          setHeading2,
          setHeading3,
          setHeading4,
          setHeading5,
          setHeading6
        ];
        const cmd = commands[level];
        return cmd ? runCommand(cmd, this.view as EditorView) : false;
      },

      removeHeading(this: any) {
        if (this._destroyed) return false;
        return runCommand(removeHeading, this.view as EditorView);
      },

      toggleBulletList(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleBulletList, this.view as EditorView);
      },
      toggleNumberedList(this: any) {
        if (this._destroyed) return false;
        return runCommand(toggleNumberedList, this.view as EditorView);
      },

      insertCodeBlock(this: any) {
        if (this._destroyed) return false;
        return runCommand(insertCodeBlock, this.view as EditorView);
      },

      setTiddlyWikiLanguage(this: any, enabled: boolean) {
        if (this._destroyed) return;
        const compartments = this._compartments;
        if (compartments?.tiddlywikiLanguage) {
          this.reconfigure("tiddlywikiLanguage", enabled ? tiddlywikiLanguage : []);
        }
      }
    };
  },

  registerEvents(engine: any, context: CM6PluginContext): Record<string, any> {
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
