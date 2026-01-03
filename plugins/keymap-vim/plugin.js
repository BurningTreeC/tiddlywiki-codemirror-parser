/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/keymap-vim/plugin.js
type: application/javascript
module-type: codemirror6-plugin

Vim keybindings for CodeMirror 6

\*/
(function() {
"use strict";

if (!$tw.browser) return;

var vimModule = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/keymap-vim/codemirror-vim.js");

var ESCAPE_CONSUMED_TIDDLER = "$:/temp/codemirror-6/vim-escape-consumed";

// Register hook to prevent tiddler cancel when vim consumed the Escape
$tw.hooks.addHook("th-cancelling-tiddler", function(event) {
  var consumed = $tw.wiki.getTiddlerText(ESCAPE_CONSUMED_TIDDLER, "no");
  if (consumed === "yes") {
    // Clear the flag
    $tw.wiki.deleteTiddler(ESCAPE_CONSUMED_TIDDLER);
    // Return a fake event with no tiddler info - this will cause the cancel to do nothing
    // (the navigator checks if draftTiddler exists before proceeding)
    return {event: {}, param: null, tiddlerTitle: null};
  }
  return event;
});

exports.plugin = {
  name: "keymap-vim",
  description: "Vim keybindings",
  priority: 50,
  keymapId: "vim",

  init: function(cm6Core) {
    this._core = cm6Core;
  },

  getExtensions: function(context) {
    // The engine calls this only when vim keymap is selected
    if (!vimModule || !vimModule.vim) {
      console.warn("CM6 Vim: vim module not loaded");
      return [];
    }

    var ViewPlugin = this._core.view.ViewPlugin;

    // ViewPlugin to intercept Escape before TiddlyWiki's keyboard widget
    var vimHelper = ViewPlugin.define(function(view) {

      // Capture phase handler - runs BEFORE TiddlyWiki processes the key
      var escapeCapture = function(event) {
        if (event.key !== "Escape") return;

        var cm = vimModule.getCM(view);
        if (cm && cm.state && cm.state.vim) {
          var mode = cm.state.vim.mode || "normal";
          if (mode !== "normal") {
            // Set flag so the th-cancelling-tiddler hook prevents tiddler cancellation
            $tw.wiki.setText(ESCAPE_CONSUMED_TIDDLER, "text", null, "yes");

            // Manually exit insert/visual mode since TiddlyWiki's keyboard widget
            // will intercept the event before vim can process it
            if (vimModule.Vim && vimModule.Vim.exitInsertMode) {
              vimModule.Vim.exitInsertMode(cm);
            } else if (cm.state.vim.insertMode) {
              // Fallback: directly modify vim state
              cm.state.vim.insertMode = false;
              cm.state.vim.mode = "normal";
            }
          }
        }
      };

      view.contentDOM.addEventListener("keydown", escapeCapture, true);

      return {
        destroy: function() {
          view.contentDOM.removeEventListener("keydown", escapeCapture, true);
        }
      };
    });

    return [vimModule.vim(), vimHelper];
  }
};

})();
