/*\
title: $:/plugins/custom/emoji-picker/emoji-picker.js
type: application/javascript
module-type: codemirror-6

CodeMirror 6 Emoji Picker - loads emoji data from gemoji JSON tiddler

\*/
(function() {
"use strict";

// Only run in browser
if (!$tw.browser) return;

const {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  keymap
} = require("$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-view.js");

const {
  StateField,
  StateEffect
} = require("$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-state.js");

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  dataTiddler: "$:/plugins/custom/emoji-picker/data",
  triggerChar: ":",
  minQueryLength: 2,
  maxResults: 50,
  debounceMs: 50
};

// ============================================================
// Emoji Data Management
// ============================================================

let EMOJI_DATA = null;

/**
 * Load emoji data from JSON tiddler
 */
function loadEmojiData() {
  if (EMOJI_DATA !== null) return EMOJI_DATA;
  
  try {
    const json = $tw.wiki.getTiddlerText(CONFIG.dataTiddler);
    if (json) {
      EMOJI_DATA = JSON.parse(json);
      console.log(`Emoji picker: Loaded ${EMOJI_DATA.length} emojis`);
    } else {
      console.warn("Emoji picker: No data tiddler found at", CONFIG.dataTiddler);
      EMOJI_DATA = [];
    }
  } catch (e) {
    console.error("Emoji picker: Error loading emoji data", e);
    EMOJI_DATA = [];
  }
  
  return EMOJI_DATA;
}

/**
 * Search emojis by query
 * Returns results sorted: exact matches first, then prefix matches, then contains
 */
function searchEmojis(query) {
  const data = loadEmojiData();
  if (!query || query.length < CONFIG.minQueryLength) return [];
  
  const q = query.toLowerCase();
  const exactMatches = [];
  const prefixMatches = [];
  const containsMatches = [];
  const seen = new Set();
  
  data.forEach((emoji, idx) => {
    if (seen.has(idx)) return;
    
    // Check aliases for exact match
    const hasExactAlias = emoji.aliases.some(a => a.toLowerCase() === q);
    if (hasExactAlias) {
      exactMatches.push(emoji);
      seen.add(idx);
      return;
    }
    
    // Check aliases for prefix match
    const hasPrefixAlias = emoji.aliases.some(a => a.toLowerCase().startsWith(q));
    if (hasPrefixAlias) {
      prefixMatches.push(emoji);
      seen.add(idx);
      return;
    }
    
    // Check tags for prefix match
    const hasPrefixTag = emoji.tags && emoji.tags.some(t => t.toLowerCase().startsWith(q));
    if (hasPrefixTag) {
      prefixMatches.push(emoji);
      seen.add(idx);
      return;
    }
    
    // Check aliases for contains match
    const hasContainsAlias = emoji.aliases.some(a => a.toLowerCase().includes(q));
    if (hasContainsAlias) {
      containsMatches.push(emoji);
      seen.add(idx);
      return;
    }
    
    // Check tags for contains match
    const hasContainsTag = emoji.tags && emoji.tags.some(t => t.toLowerCase().includes(q));
    if (hasContainsTag) {
      containsMatches.push(emoji);
      seen.add(idx);
      return;
    }
    
    // Check description for contains match
    if (emoji.description.toLowerCase().includes(q)) {
      containsMatches.push(emoji);
      seen.add(idx);
    }
  });
  
  return [...exactMatches, ...prefixMatches, ...containsMatches].slice(0, CONFIG.maxResults);
}

// ============================================================
// Picker State Management
// ============================================================

const showPickerEffect = StateEffect.define();
const hidePickerEffect = StateEffect.define();
const updateQueryEffect = StateEffect.define();
const selectIndexEffect = StateEffect.define();

const pickerState = StateField.define({
  create() {
    return {
      active: false,
      query: "",
      results: [],
      selectedIndex: 0,
      triggerPos: 0
    };
  },
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showPickerEffect)) {
        return {
          ...state,
          active: true,
          query: "",
          results: [],
          selectedIndex: 0,
          triggerPos: effect.value
        };
      }
      if (effect.is(hidePickerEffect)) {
        return {
          ...state,
          active: false,
          query: "",
          results: [],
          selectedIndex: 0
        };
      }
      if (effect.is(updateQueryEffect)) {
        const results = searchEmojis(effect.value);
        return {
          ...state,
          query: effect.value,
          results: results,
          selectedIndex: 0
        };
      }
      if (effect.is(selectIndexEffect)) {
        return {
          ...state,
          selectedIndex: effect.value
        };
      }
    }
    return state;
  }
});

// ============================================================
// Picker UI Widget
// ============================================================

class PickerWidget extends WidgetType {
  constructor(state) {
    super();
    this.state = state;
  }
  
  eq(other) {
    return (
      this.state.query === other.state.query &&
      this.state.selectedIndex === other.state.selectedIndex &&
      this.state.results.length === other.state.results.length
    );
  }
  
  toDOM(view) {
    const container = document.createElement("div");
    container.className = "cm-emoji-picker";
    
    if (this.state.results.length === 0) {
      if (this.state.query.length >= CONFIG.minQueryLength) {
        container.innerHTML = '<div class="cm-emoji-picker-empty">Keine Emojis gefunden</div>';
      } else {
        container.innerHTML = '<div class="cm-emoji-picker-hint">Mindestens 2 Zeichen eingeben...</div>';
      }
      return container;
    }
    
    const list = document.createElement("div");
    list.className = "cm-emoji-picker-list";
    
    this.state.results.forEach((emoji, idx) => {
      const item = document.createElement("div");
      item.className = "cm-emoji-picker-item" + 
        (idx === this.state.selectedIndex ? " selected" : "");
      
      const emojiSpan = document.createElement("span");
      emojiSpan.className = "cm-emoji-picker-emoji";
      emojiSpan.textContent = emoji.emoji;
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "cm-emoji-picker-name";
      nameSpan.textContent = ":" + emoji.aliases[0] + ":";
      
      const descSpan = document.createElement("span");
      descSpan.className = "cm-emoji-picker-desc";
      descSpan.textContent = emoji.description;
      
      item.appendChild(emojiSpan);
      item.appendChild(nameSpan);
      item.appendChild(descSpan);
      
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        insertEmoji(view, emoji, this.state.triggerPos);
      });
      
      item.addEventListener("mouseenter", () => {
        view.dispatch({
          effects: selectIndexEffect.of(idx)
        });
      });
      
      list.appendChild(item);
    });
    
    container.appendChild(list);
    
    // Scroll selected item into view
    requestAnimationFrame(() => {
      const selected = container.querySelector(".selected");
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    });
    
    return container;
  }
  
  ignoreEvent() {
    return false;
  }
}

// ============================================================
// Insert Emoji
// ============================================================

function insertEmoji(view, emoji, triggerPos) {
  const cursorPos = view.state.selection.main.head;
  
  view.dispatch({
    changes: {
      from: triggerPos,
      to: cursorPos,
      insert: emoji.emoji
    },
    effects: hidePickerEffect.of(null)
  });
  
  view.focus();
}

// ============================================================
// Picker View Plugin
// ============================================================

const pickerPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }
  
  update(update) {
    if (update.docChanged || update.selectionSet || 
        update.transactions.some(tr => tr.effects.some(e => 
          e.is(showPickerEffect) || e.is(hidePickerEffect) || 
          e.is(updateQueryEffect) || e.is(selectIndexEffect)
        ))) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  
  buildDecorations(view) {
    const state = view.state.field(pickerState);
    if (!state.active) return Decoration.none;
    
    const pos = view.state.selection.main.head;
    const widget = Decoration.widget({
      widget: new PickerWidget(state),
      side: 1
    });
    
    return Decoration.set([widget.range(pos)]);
  }
}, {
  decorations: v => v.decorations
});

// ============================================================
// Input Handler
// ============================================================

let debounceTimer = null;

function handleInput(view) {
  const state = view.state.field(pickerState);
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);
  
  // Find last colon
  const colonIdx = textBefore.lastIndexOf(":");
  
  if (colonIdx === -1) {
    if (state.active) {
      view.dispatch({ effects: hidePickerEffect.of(null) });
    }
    return;
  }
  
  const query = textBefore.slice(colonIdx + 1);
  
  // Check if query is valid (no spaces, not closed)
  if (query.includes(" ") || query.includes(":")) {
    if (state.active) {
      view.dispatch({ effects: hidePickerEffect.of(null) });
    }
    return;
  }
  
  const triggerPos = line.from + colonIdx;
  
  // Debounce search
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  debounceTimer = setTimeout(() => {
    if (!state.active) {
      view.dispatch({
        effects: [
          showPickerEffect.of(triggerPos),
          updateQueryEffect.of(query)
        ]
      });
    } else {
      view.dispatch({
        effects: updateQueryEffect.of(query)
      });
    }
  }, CONFIG.debounceMs);
}

const inputHandler = EditorView.updateListener.of(update => {
  if (update.docChanged || update.selectionSet) {
    handleInput(update.view);
  }
});

// ============================================================
// Keyboard Handler
// ============================================================

const pickerKeymap = keymap.of([
  {
    key: "ArrowDown",
    run(view) {
      const state = view.state.field(pickerState);
      if (!state.active || state.results.length === 0) return false;
      
      const newIdx = (state.selectedIndex + 1) % state.results.length;
      view.dispatch({ effects: selectIndexEffect.of(newIdx) });
      return true;
    }
  },
  {
    key: "ArrowUp",
    run(view) {
      const state = view.state.field(pickerState);
      if (!state.active || state.results.length === 0) return false;
      
      const newIdx = (state.selectedIndex - 1 + state.results.length) % state.results.length;
      view.dispatch({ effects: selectIndexEffect.of(newIdx) });
      return true;
    }
  },
  {
    key: "Enter",
    run(view) {
      const state = view.state.field(pickerState);
      if (!state.active || state.results.length === 0) return false;
      
      const emoji = state.results[state.selectedIndex];
      insertEmoji(view, emoji, state.triggerPos);
      return true;
    }
  },
  {
    key: "Tab",
    run(view) {
      const state = view.state.field(pickerState);
      if (!state.active || state.results.length === 0) return false;
      
      const emoji = state.results[state.selectedIndex];
      insertEmoji(view, emoji, state.triggerPos);
      return true;
    }
  },
  {
    key: "Escape",
    run(view) {
      const state = view.state.field(pickerState);
      if (!state.active) return false;
      
      view.dispatch({ effects: hidePickerEffect.of(null) });
      return true;
    }
  }
]);

// ============================================================
// Export Extensions
// ============================================================

exports.cm6EmojiPicker = [
  pickerState,
  pickerPlugin,
  inputHandler,
  pickerKeymap
];

// Preload emoji data
if ($tw.browser) {
  setTimeout(() => loadEmojiData(), 100);
}

})();
