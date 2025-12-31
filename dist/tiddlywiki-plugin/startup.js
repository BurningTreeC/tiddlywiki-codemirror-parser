/*\
title: $:/plugins/prtw/codemirror-tiddlywiki/startup.js
type: application/javascript
module-type: startup

Registers TiddlyWiki language mode with CodeMirror 6

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Export name and startup
exports.name = "codemirror-tiddlywiki-mode";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.synchronous = true;

exports.startup = function() {
    // Check if CM6 core is available
    if (!$tw.utils.hasOwnProperty || typeof window === "undefined") {
        return;
    }

    // Register our language with CM6 engine
    var langTiddlyWiki;
    try {
        langTiddlyWiki = require("$:/plugins/prtw/codemirror-tiddlywiki/lib/lang-tiddlywiki.js");
    } catch (e) {
        console.warn("TiddlyWiki language mode: Could not load language module", e);
        return;
    }

    // Make available globally for the engine
    if (langTiddlyWiki && langTiddlyWiki.tiddlywiki) {
        $tw.utils.CodeMirror6 = $tw.utils.CodeMirror6 || {};
        $tw.utils.CodeMirror6.langTiddlyWiki = langTiddlyWiki;
        
        console.log("TiddlyWiki language mode registered with CodeMirror 6");
    }
};

})();
