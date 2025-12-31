/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/plugins/tw-link-preview.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki Link Preview Plugin - shows tiddler preview on hover over links.

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var HOVER_DELAY = 300; // ms before showing preview
var MAX_PREVIEW_LENGTH = 500;

// ============================================================================
// Preview Tooltip
// ============================================================================

var tooltipElement = null;
var hideTimeout = null;
var currentTarget = null;

function createTooltip() {
	if (tooltipElement) return tooltipElement;
	
	tooltipElement = document.createElement("div");
	tooltipElement.className = "cm6-tw-link-preview";
	tooltipElement.style.cssText = [
		"position: fixed",
		"z-index: 10000",
		"max-width: 400px",
		"max-height: 300px",
		"overflow: auto",
		"padding: 8px 12px",
		"background: var(--color-background, #fff)",
		"border: 1px solid var(--color-border, #ccc)",
		"border-radius: 4px",
		"box-shadow: 0 2px 8px rgba(0,0,0,0.15)",
		"font-size: 13px",
		"line-height: 1.4",
		"display: none"
	].join(";");
	
	document.body.appendChild(tooltipElement);
	
	// Hide on mouse leave
	tooltipElement.addEventListener("mouseleave", function() {
		hideTooltip();
	});
	
	// Keep visible on mouse enter
	tooltipElement.addEventListener("mouseenter", function() {
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
	});
	
	return tooltipElement;
}

function showTooltip(content, x, y) {
	var tooltip = createTooltip();
	tooltip.innerHTML = content;
	tooltip.style.display = "block";
	
	// Position tooltip
	var rect = tooltip.getBoundingClientRect();
	var viewWidth = window.innerWidth;
	var viewHeight = window.innerHeight;
	
	// Adjust horizontal position
	if (x + rect.width > viewWidth - 10) {
		x = viewWidth - rect.width - 10;
	}
	if (x < 10) x = 10;
	
	// Adjust vertical position
	if (y + rect.height > viewHeight - 10) {
		y = y - rect.height - 20; // Show above cursor
	}
	if (y < 10) y = 10;
	
	tooltip.style.left = x + "px";
	tooltip.style.top = y + "px";
}

function hideTooltip() {
	if (hideTimeout) {
		clearTimeout(hideTimeout);
	}
	hideTimeout = setTimeout(function() {
		if (tooltipElement) {
			tooltipElement.style.display = "none";
		}
		currentTarget = null;
		hideTimeout = null;
	}, 100);
}

function scheduleHide() {
	if (hideTimeout) {
		clearTimeout(hideTimeout);
	}
	hideTimeout = setTimeout(function() {
		hideTooltip();
	}, 200);
}

// ============================================================================
// Link Detection
// ============================================================================

/**
 * Extract link target from position in document
 */
function getLinkAtPos(state, pos) {
	var doc = state.doc;
	var line = doc.lineAt(pos);
	var lineText = line.text;
	var col = pos - line.from;
	
	// Check for wiki link: [[target]] or [[text|target]]
	var wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	var match;
	while ((match = wikiLinkRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			// Return target (second group if exists, otherwise first)
			return match[2] || match[1];
		}
	}
	
	// Check for transclusion: {{target}} or {{target!!field}}
	var transclusionRegex = /\{\{([^}!|]+)(?:!![^}]*)?\}\}/g;
	while ((match = transclusionRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			return match[1];
		}
	}
	
	// Check for image: [img[source]] or [img[tooltip|source]]
	var imgRegex = /\[img\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	while ((match = imgRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			return match[2] || match[1];
		}
	}
	
	// Check for CamelCase links (if enabled)
	var camelRegex = /[A-Z][a-z]+[A-Z][A-Za-z]*/g;
	while ((match = camelRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			// Only return if tiddler exists
			if ($tw.wiki.tiddlerExists(match[0])) {
				return match[0];
			}
		}
	}
	
	return null;
}

/**
 * Get tiddler preview HTML
 */
function getTiddlerPreview(title) {
	if (!$tw || !$tw.wiki) return null;
	
	var tiddler = $tw.wiki.getTiddler(title);
	if (!tiddler) {
		return '<div class="cm6-preview-missing">Tiddler not found: <em>' + 
			$tw.utils.htmlEncode(title) + '</em></div>';
	}
	
	var fields = tiddler.fields;
	var html = '<div class="cm6-preview-content">';
	
	// Title
	html += '<div class="cm6-preview-title"><strong>' + 
		$tw.utils.htmlEncode(fields.title) + '</strong></div>';
	
	// Tags
	if (fields.tags) {
		var tags = $tw.utils.parseStringArray(fields.tags);
		if (tags.length > 0) {
			html += '<div class="cm6-preview-tags">';
			tags.forEach(function(tag) {
				html += '<span class="cm6-preview-tag">' + $tw.utils.htmlEncode(tag) + '</span> ';
			});
			html += '</div>';
		}
	}
	
	// Type indicator
	if (fields.type && fields.type !== "text/vnd.tiddlywiki") {
		html += '<div class="cm6-preview-type">' + $tw.utils.htmlEncode(fields.type) + '</div>';
	}
	
	// Text preview
	var text = fields.text || "";
	if (text) {
		// For images, show the image
		if (fields.type && fields.type.startsWith("image/")) {
			var dataUri = "data:" + fields.type + ";base64," + text;
			html += '<div class="cm6-preview-image"><img src="' + dataUri + 
				'" style="max-width:100%;max-height:150px;"></div>';
		} else {
			// Truncate long text
			if (text.length > MAX_PREVIEW_LENGTH) {
				text = text.substring(0, MAX_PREVIEW_LENGTH) + "...";
			}
			// Basic HTML encoding
			text = $tw.utils.htmlEncode(text);
			// Convert newlines to <br>
			text = text.replace(/\n/g, "<br>");
			html += '<div class="cm6-preview-text">' + text + '</div>';
		}
	}
	
	// Modified date
	if (fields.modified) {
		var date = $tw.utils.formatDateString(fields.modified, "YYYY-0MM-0DD 0hh:0mm");
		html += '<div class="cm6-preview-meta">Modified: ' + date + '</div>';
	}
	
	html += '</div>';
	return html;
}

// ============================================================================
// Hover Handler
// ============================================================================

var hoverTimeout = null;

function handleMouseMove(event, view) {
	// Clear any pending hover
	if (hoverTimeout) {
		clearTimeout(hoverTimeout);
		hoverTimeout = null;
	}
	
	// Get position from coordinates
	var pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
	if (pos === null) {
		scheduleHide();
		return;
	}
	
	// Check if we're still on the same target
	var target = getLinkAtPos(view.state, pos);
	if (!target) {
		scheduleHide();
		return;
	}
	
	if (target === currentTarget) {
		// Cancel hide if still on same target
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
		return;
	}
	
	// Schedule showing new tooltip
	hoverTimeout = setTimeout(function() {
		currentTarget = target;
		var preview = getTiddlerPreview(target);
		if (preview) {
			showTooltip(preview, event.clientX + 10, event.clientY + 10);
		}
		hoverTimeout = null;
	}, HOVER_DELAY);
}

function handleMouseLeave(event, view) {
	if (hoverTimeout) {
		clearTimeout(hoverTimeout);
		hoverTimeout = null;
	}
	scheduleHide();
}

// ============================================================================
// Plugin Definition
// ============================================================================

exports.plugin = {
	name: "tw-link-preview",
	description: "Show tiddler preview on hover over links and transclusions",
	priority: 400,
	
	// Only load for TiddlyWiki content
	condition: function(context) {
		var type = context.tiddlerType;
		// Also check if preview is not disabled
		if (context.options.linkPreview === false) return false;
		return !type || type === "" || type === "text/vnd.tiddlywiki" || type === "text/x-tiddlywiki";
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var EditorView = core.view.EditorView;
		
		return [
			EditorView.domEventHandlers({
				mousemove: handleMouseMove,
				mouseleave: handleMouseLeave
			})
		];
	},
	
	extendAPI: function(engine, context) {
		return {
			/**
			 * Show preview for a specific tiddler at position
			 */
			showLinkPreview: function(title, x, y) {
				var preview = getTiddlerPreview(title);
				if (preview) {
					showTooltip(preview, x, y);
				}
			},
			
			/**
			 * Hide the link preview tooltip
			 */
			hideLinkPreview: function() {
				hideTooltip();
			},
			
			/**
			 * Get link target at current cursor position
			 */
			getLinkAtCursor: function() {
				if (this._destroyed) return null;
				var pos = this.view.state.selection.main.head;
				return getLinkAtPos(this.view.state, pos);
			}
		};
	},
	
	destroy: function(engine) {
		// Clean up tooltip
		if (tooltipElement && tooltipElement.parentNode) {
			tooltipElement.parentNode.removeChild(tooltipElement);
			tooltipElement = null;
		}
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
	}
};
