/*\
title: $:/plugins/prtw/codemirror-tiddlywiki/examples/javascript-plugin.js
type: application/javascript
module-type: codemirror6-plugin

Example: JavaScript/JSON syntax highlighting plugin for CodeMirror 6.
This demonstrates how to create plugins for other content types.

Note: This requires @codemirror/lang-javascript to be bundled separately.
This file is an EXAMPLE and not included in the main build.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Content types this plugin handles
var JS_TYPES = [
    "application/javascript",
    "text/javascript", 
    "application/x-javascript"
];

var JSON_TYPES = [
    "application/json",
    "text/json"
];

var ALL_TYPES = JS_TYPES.concat(JSON_TYPES);

/**
 * Check if this plugin should load for the given context
 */
function condition(context) {
    var type = context.tiddlerType;
    if (!type) return false;
    return ALL_TYPES.indexOf(type) !== -1;
}

/**
 * Get CodeMirror extensions for JavaScript/JSON
 */
function getExtensions(context) {
    var extensions = [];
    
    // Try to load the JavaScript language support
    // This would need to be bundled separately
    try {
        var langJs = require("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/lang-javascript.js");
        
        if (langJs && langJs.javascript) {
            var type = context.tiddlerType;
            var isJson = JSON_TYPES.indexOf(type) !== -1;
            
            // Use javascript() or json() based on type
            if (isJson && langJs.json) {
                extensions.push(langJs.json());
            } else {
                extensions.push(langJs.javascript());
            }
        }
    } catch (e) {
        console.warn("JavaScript language support not available:", e.message);
    }
    
    return extensions;
}

/**
 * Plugin definition
 */
exports.plugin = {
    name: "javascript-syntax",
    description: "JavaScript and JSON syntax highlighting",
    priority: 90,
    condition: condition,
    getExtensions: getExtensions
};

})();
