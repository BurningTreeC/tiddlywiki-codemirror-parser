/**
 * Wrapper for @codemirror/lang-css that exposes internal properties and values
 * for use in style.* attribute completion in TiddlyWiki
 */

// Re-export everything from the original package
export { css, cssLanguage, cssCompletionSource, defineCSSCompletionSource } from "@codemirror/lang-css";

// Cache for CSS properties extracted from browser
let _cssProperties = null;

/**
 * Get CSS property names from the browser (same approach as @codemirror/lang-css uses internally)
 * Returns array of kebab-case property names like ["background-color", "font-size", ...]
 */
export function getCSSProperties() {
  if (_cssProperties) return _cssProperties;

  if (typeof document !== "object" || !document.body) {
    return [];
  }

  const { style } = document.body;
  const names = [];
  const seen = new Set();

  for (let prop in style) {
    if (prop !== "cssText" && prop !== "cssFloat") {
      if (typeof style[prop] === "string") {
        // Convert camelCase to kebab-case
        if (/[A-Z]/.test(prop)) {
          prop = prop.replace(/[A-Z]/g, ch => "-" + ch.toLowerCase());
        }
        if (!seen.has(prop)) {
          names.push(prop);
          seen.add(prop);
        }
      }
    }
  }

  _cssProperties = names.sort();
  return _cssProperties;
}

// Global CSS values valid for all properties
const globalValues = ["inherit", "initial", "revert", "revert-layer", "unset"];

// Color names
const colorNames = [
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue",
  "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia",
  "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "grey", "green", "greenyellow",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush",
  "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow",
  "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen",
  "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime",
  "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid",
  "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
  "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy",
  "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod", "palegreen",
  "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue",
  "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown",
  "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey",
  "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "turquoise", "violet",
  "wheat", "white", "whitesmoke", "yellow", "yellowgreen", "transparent", "currentcolor"
];

// Value categories for different property types
const colorValues = [...colorNames, "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklch", "oklab", "color"];
const lengthUnits = ["0"];  // Just suggest 0, user types numbers with units
const displayValues = ["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "flow-root", "contents", "table", "table-row", "table-cell", "table-caption", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "list-item", "run-in"];
const positionValues = ["static", "relative", "absolute", "fixed", "sticky"];
const overflowValues = ["visible", "hidden", "clip", "scroll", "auto"];
const visibilityValues = ["visible", "hidden", "collapse"];
const floatValues = ["left", "right", "none", "inline-start", "inline-end"];
const clearValues = ["none", "left", "right", "both", "inline-start", "inline-end"];
const textAlignValues = ["left", "right", "center", "justify", "start", "end", "match-parent"];
const verticalAlignValues = ["baseline", "sub", "super", "text-top", "text-bottom", "middle", "top", "bottom"];
const fontStyleValues = ["normal", "italic", "oblique"];
const fontWeightValues = ["normal", "bold", "bolder", "lighter", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const textDecorationLineValues = ["none", "underline", "overline", "line-through", "blink"];
const textDecorationStyleValues = ["solid", "double", "dotted", "dashed", "wavy"];
const textTransformValues = ["none", "capitalize", "uppercase", "lowercase", "full-width", "full-size-kana"];
const whiteSpaceValues = ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"];
const wordBreakValues = ["normal", "break-all", "keep-all", "break-word"];
const overflowWrapValues = ["normal", "break-word", "anywhere"];
const borderStyleValues = ["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"];
const backgroundRepeatValues = ["repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"];
const backgroundSizeValues = ["auto", "cover", "contain"];
const backgroundAttachmentValues = ["scroll", "fixed", "local"];
const backgroundPositionValues = ["left", "center", "right", "top", "bottom"];
const backgroundClipValues = ["border-box", "padding-box", "content-box", "text"];
const backgroundOriginValues = ["border-box", "padding-box", "content-box"];
const boxSizingValues = ["content-box", "border-box"];
const cursorValues = ["auto", "default", "none", "context-menu", "help", "pointer", "progress", "wait", "cell", "crosshair", "text", "vertical-text", "alias", "copy", "move", "no-drop", "not-allowed", "grab", "grabbing", "e-resize", "n-resize", "ne-resize", "nw-resize", "s-resize", "se-resize", "sw-resize", "w-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "col-resize", "row-resize", "all-scroll", "zoom-in", "zoom-out"];
const flexDirectionValues = ["row", "row-reverse", "column", "column-reverse"];
const flexWrapValues = ["nowrap", "wrap", "wrap-reverse"];
const justifyContentValues = ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "start", "end", "left", "right", "normal", "stretch"];
const alignItemsValues = ["stretch", "flex-start", "flex-end", "center", "baseline", "start", "end", "self-start", "self-end", "normal"];
const alignContentValues = ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "stretch", "start", "end", "normal", "baseline"];
const alignSelfValues = ["auto", "flex-start", "flex-end", "center", "baseline", "stretch", "start", "end", "self-start", "self-end", "normal"];
const gridAutoFlowValues = ["row", "column", "dense", "row dense", "column dense"];
const listStyleTypeValues = ["disc", "circle", "square", "decimal", "decimal-leading-zero", "lower-roman", "upper-roman", "lower-greek", "lower-latin", "upper-latin", "armenian", "georgian", "lower-alpha", "upper-alpha", "none"];
const listStylePositionValues = ["inside", "outside"];
const objectFitValues = ["fill", "contain", "cover", "none", "scale-down"];
const objectPositionValues = ["top", "bottom", "left", "right", "center"];
const pointerEventsValues = ["auto", "none", "visiblePainted", "visibleFill", "visibleStroke", "visible", "painted", "fill", "stroke", "all"];
const resizeValues = ["none", "both", "horizontal", "vertical", "block", "inline"];
const userSelectValues = ["auto", "none", "text", "all", "contain"];
const transformStyleValues = ["flat", "preserve-3d"];
const backfaceVisibilityValues = ["visible", "hidden"];
const transitionTimingValues = ["ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end"];
const animationDirectionValues = ["normal", "reverse", "alternate", "alternate-reverse"];
const animationFillModeValues = ["none", "forwards", "backwards", "both"];
const animationPlayStateValues = ["running", "paused"];
const fontFamilyValues = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"];

// Map of CSS properties to their valid values
const propertyValues = {
  // Colors
  "color": colorValues,
  "background-color": colorValues,
  "border-color": colorValues,
  "border-top-color": colorValues,
  "border-right-color": colorValues,
  "border-bottom-color": colorValues,
  "border-left-color": colorValues,
  "outline-color": colorValues,
  "text-decoration-color": colorValues,
  "caret-color": [...colorValues, "auto"],
  "accent-color": [...colorValues, "auto"],
  "fill": colorValues,
  "stroke": colorValues,

  // Display & Visibility
  "display": displayValues,
  "visibility": visibilityValues,
  "opacity": [],  // numeric

  // Positioning
  "position": positionValues,
  "float": floatValues,
  "clear": clearValues,
  "z-index": ["auto"],

  // Box Model
  "box-sizing": boxSizingValues,
  "overflow": overflowValues,
  "overflow-x": overflowValues,
  "overflow-y": overflowValues,

  // Flexbox
  "flex-direction": flexDirectionValues,
  "flex-wrap": flexWrapValues,
  "flex-flow": [...flexDirectionValues, ...flexWrapValues],
  "justify-content": justifyContentValues,
  "align-items": alignItemsValues,
  "align-content": alignContentValues,
  "align-self": alignSelfValues,
  "flex-grow": [],
  "flex-shrink": [],
  "flex-basis": ["auto", "content", ...lengthUnits],
  "order": [],
  "gap": lengthUnits,
  "row-gap": lengthUnits,
  "column-gap": lengthUnits,

  // Grid
  "grid-auto-flow": gridAutoFlowValues,
  "justify-items": alignItemsValues,
  "place-content": [...justifyContentValues, ...alignContentValues],
  "place-items": [...alignItemsValues],
  "place-self": [...alignSelfValues],

  // Text
  "text-align": textAlignValues,
  "text-align-last": [...textAlignValues, "auto"],
  "vertical-align": verticalAlignValues,
  "text-decoration": [...textDecorationLineValues, ...textDecorationStyleValues, ...colorValues],
  "text-decoration-line": textDecorationLineValues,
  "text-decoration-style": textDecorationStyleValues,
  "text-transform": textTransformValues,
  "text-overflow": ["clip", "ellipsis"],
  "white-space": whiteSpaceValues,
  "word-break": wordBreakValues,
  "word-wrap": overflowWrapValues,
  "overflow-wrap": overflowWrapValues,
  "line-break": ["auto", "loose", "normal", "strict", "anywhere"],
  "hyphens": ["none", "manual", "auto"],

  // Font
  "font-family": fontFamilyValues,
  "font-style": fontStyleValues,
  "font-weight": fontWeightValues,
  "font-size": ["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large", "smaller", "larger"],
  "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded"],
  "font-variant": ["normal", "small-caps"],
  "font-variant-caps": ["normal", "small-caps", "all-small-caps", "petite-caps", "all-petite-caps", "unicase", "titling-caps"],

  // Border
  "border-style": borderStyleValues,
  "border-top-style": borderStyleValues,
  "border-right-style": borderStyleValues,
  "border-bottom-style": borderStyleValues,
  "border-left-style": borderStyleValues,
  "outline-style": [...borderStyleValues, "auto"],
  "border-collapse": ["collapse", "separate"],

  // Background
  "background-repeat": backgroundRepeatValues,
  "background-size": backgroundSizeValues,
  "background-attachment": backgroundAttachmentValues,
  "background-position": backgroundPositionValues,
  "background-position-x": ["left", "center", "right"],
  "background-position-y": ["top", "center", "bottom"],
  "background-clip": backgroundClipValues,
  "background-origin": backgroundOriginValues,
  "background-blend-mode": ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"],

  // List
  "list-style-type": listStyleTypeValues,
  "list-style-position": listStylePositionValues,

  // Cursor & Interaction
  "cursor": cursorValues,
  "pointer-events": pointerEventsValues,
  "user-select": userSelectValues,
  "resize": resizeValues,
  "touch-action": ["auto", "none", "pan-x", "pan-left", "pan-right", "pan-y", "pan-up", "pan-down", "pinch-zoom", "manipulation"],

  // Object
  "object-fit": objectFitValues,
  "object-position": objectPositionValues,

  // Transform
  "transform-style": transformStyleValues,
  "backface-visibility": backfaceVisibilityValues,
  "transform-origin": ["left", "center", "right", "top", "bottom"],
  "perspective-origin": ["left", "center", "right", "top", "bottom"],

  // Transition & Animation
  "transition-timing-function": transitionTimingValues,
  "animation-timing-function": transitionTimingValues,
  "animation-direction": animationDirectionValues,
  "animation-fill-mode": animationFillModeValues,
  "animation-play-state": animationPlayStateValues,
  "animation-iteration-count": ["infinite"],

  // Misc
  "direction": ["ltr", "rtl"],
  "unicode-bidi": ["normal", "embed", "isolate", "bidi-override", "isolate-override", "plaintext"],
  "writing-mode": ["horizontal-tb", "vertical-rl", "vertical-lr", "sideways-rl", "sideways-lr"],
  "text-orientation": ["mixed", "upright", "sideways"],
  "appearance": ["none", "auto", "button", "textfield", "menulist-button"],
  "content": ["normal", "none", "open-quote", "close-quote", "no-open-quote", "no-close-quote"],
  "quotes": ["none", "auto"],
  "table-layout": ["auto", "fixed"],
  "empty-cells": ["show", "hide"],
  "caption-side": ["top", "bottom"],
  "scroll-behavior": ["auto", "smooth"],
  "overscroll-behavior": ["auto", "contain", "none"],
  "overscroll-behavior-x": ["auto", "contain", "none"],
  "overscroll-behavior-y": ["auto", "contain", "none"],
  "will-change": ["auto", "scroll-position", "contents"],
  "contain": ["none", "strict", "content", "size", "layout", "style", "paint"],
  "isolation": ["auto", "isolate"],
  "mix-blend-mode": ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"],
  "filter": ["none"],
  "backdrop-filter": ["none"],
  "clip-path": ["none"],
  "mask": ["none"],
};

// All CSS values (flat list for fallback)
const allCssValues = [
  ...new Set([
    ...globalValues,
    ...colorValues,
    ...displayValues,
    ...positionValues,
    ...overflowValues,
    ...visibilityValues,
    ...floatValues,
    ...clearValues,
    ...textAlignValues,
    ...verticalAlignValues,
    ...fontStyleValues,
    ...fontWeightValues,
    ...textDecorationLineValues,
    ...textDecorationStyleValues,
    ...textTransformValues,
    ...whiteSpaceValues,
    ...wordBreakValues,
    ...overflowWrapValues,
    ...borderStyleValues,
    ...backgroundRepeatValues,
    ...backgroundSizeValues,
    ...backgroundAttachmentValues,
    ...backgroundPositionValues,
    ...backgroundClipValues,
    ...backgroundOriginValues,
    ...boxSizingValues,
    ...cursorValues,
    ...flexDirectionValues,
    ...flexWrapValues,
    ...justifyContentValues,
    ...alignItemsValues,
    ...alignContentValues,
    ...alignSelfValues,
    ...gridAutoFlowValues,
    ...listStyleTypeValues,
    ...listStylePositionValues,
    ...objectFitValues,
    ...objectPositionValues,
    ...pointerEventsValues,
    ...resizeValues,
    ...userSelectValues,
    ...transformStyleValues,
    ...backfaceVisibilityValues,
    ...transitionTimingValues,
    ...animationDirectionValues,
    ...animationFillModeValues,
    ...animationPlayStateValues,
    ...fontFamilyValues,
    "auto", "none", "normal"
  ])
].sort();

/**
 * Get CSS value keywords for a specific property
 * @param {string} propertyName - CSS property name (kebab-case)
 * @returns {string[]} Array of valid values for the property
 */
export function getCSSValuesForProperty(propertyName) {
  const values = propertyValues[propertyName];
  if (values) {
    return [...globalValues, ...values];
  }
  // Fallback: return all values for unknown properties
  return allCssValues;
}

/**
 * Get all CSS value keywords (flat list)
 * @returns {string[]} Array of all CSS value keywords
 * @deprecated Use getCSSValuesForProperty for property-specific values
 */
export function getCSSValues() {
  return allCssValues;
}
