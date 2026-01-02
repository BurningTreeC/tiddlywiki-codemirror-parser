/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/modules/startup/zen-mode-handler.js
type: application/javascript
module-type: startup

Startup module to initialize Zen Mode manager

\*/

/*jslint node: true, browser: true */
/*global $tw: false */

"use strict";

exports.name = "cm6-zen-mode-handler";
exports.platforms = ["browser"];
exports.after = ["render"];
exports.synchronous = true;

exports.startup = function() {
    // Import and initialize zen mode manager
    var zenModeLib = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/modules/zen-mode.js");
    var zenMode = zenModeLib.getZenMode();
    
    // Store reference globally for widget/engine access
    $tw.cm6ZenMode = zenMode;
};
