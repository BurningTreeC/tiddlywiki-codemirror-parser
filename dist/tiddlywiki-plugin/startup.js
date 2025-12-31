/*\
title: $:/plugins/prtw/codemirror-tiddlywiki/startup.js
type: application/javascript
module-type: startup

Initialization for TiddlyWiki CodeMirror 6 language plugin.
The actual plugin is loaded automatically via module-type: codemirror6-plugin

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "codemirror-tiddlywiki-init";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.synchronous = true;

exports.startup = function() {
    // Plugin is auto-discovered by engine.js via module-type: codemirror6-plugin
    // This startup just logs that the plugin is available
    if ($tw.browser) {
        console.log("TiddlyWiki syntax plugin available for CodeMirror 6");
    }
};

})();
