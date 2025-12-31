/*\
title: $:/plugins/prtw/codemirror-tiddlywiki/examples/css-plugin.js
type: application/javascript
module-type: codemirror6-plugin

Example: CSS syntax highlighting plugin for CodeMirror 6.
Demonstrates conditional loading for stylesheet content types.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var CSS_TYPES = [
    "text/css",
    "text/x-css"
];

exports.plugin = {
    name: "css-syntax",
    description: "CSS syntax highlighting",
    priority: 90,
    
    condition: function(context) {
        return CSS_TYPES.indexOf(context.tiddlerType) !== -1;
    },
    
    getExtensions: function(context) {
        var extensions = [];
        
        try {
            var langCss = require("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/lang-css.js");
            if (langCss && langCss.css) {
                extensions.push(langCss.css());
            }
        } catch (e) {
            // CSS language not available
        }
        
        return extensions;
    }
};

})();
