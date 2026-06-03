/**
 * TiddlyWiki Keymap
 *
 * Defines the default keybindings for TiddlyWiki editing.
 */

import { KeyBinding } from "@codemirror/view"
import { indentMore, indentLess, insertTab } from "@codemirror/commands"
import { acceptCompletion, completionStatus } from "@codemirror/autocomplete"
import {
  insertNewlineContinueMarkupCommand,
  deleteMarkupBackward,
  deleteBracketPair,
  listMarkerDowngrade,
  indentList,
  outdentList
} from "../commands"

export type TabBehavior = "indent" | "insertTab" | "none"
export type ShiftTabBehavior = "indent" | "none"
export type EnterIndentBehavior = "smart" | "indent" | "none"

export interface KeymapConfig {
  /** Callback to get Tab behavior outside lists (called on each keypress) */
  getTabOutsideListBehavior?: () => TabBehavior
  /** Callback to get Shift-Tab behavior outside lists (called on each keypress) */
  getShiftTabOutsideListBehavior?: () => ShiftTabBehavior
  /** Callback to get Enter key indentation behavior (called on each keypress) */
  getEnterIndentBehavior?: () => EnterIndentBehavior
}

/**
 * Create a TiddlyWiki keymap with configurable Tab and Enter behavior
 *
 * @param config.getTabOutsideListBehavior - Callback returning Tab behavior outside lists
 * @param config.getShiftTabOutsideListBehavior - Callback returning Shift-Tab behavior outside lists
 * @param config.getEnterIndentBehavior - Callback returning Enter key indentation behavior
 */
export function createTiddlywikiKeymap(config: KeymapConfig = {}): readonly KeyBinding[] {
  const {
    getTabOutsideListBehavior,
    getShiftTabOutsideListBehavior,
    getEnterIndentBehavior
  } = config

  // Create Enter commands for each fallback behavior
  // Lists are ALWAYS continued - only the non-list behavior changes
  const smartEnter = insertNewlineContinueMarkupCommand({ fallbackBehavior: "smart" })
  const indentEnter = insertNewlineContinueMarkupCommand({ fallbackBehavior: "indent" })
  const noneEnter = insertNewlineContinueMarkupCommand({ fallbackBehavior: "none" })

  /**
   * Configurable Enter handler:
   * Lists are ALWAYS continued regardless of mode.
   * The mode only affects behavior outside lists:
   * - "smart": Full smart indentation (indent in widgets, tags, conditionals, etc.)
   * - "indent": Just match the previous line's indentation
   * - "none": Insert plain newline with no indentation
   */
  function configuredEnter(view: Parameters<NonNullable<KeyBinding["run"]>>[0]): boolean {
    const behavior = getEnterIndentBehavior ? getEnterIndentBehavior() : "smart"
    switch (behavior) {
      case "smart":
        return smartEnter(view)
      case "indent":
        return indentEnter(view)
      case "none":
        return noneEnter(view)
      default:
        return smartEnter(view)
    }
  }

  /**
   * Smart Tab handler:
   * 1. If completion popup is active, accept the completion
   * 2. If in a list, indent the list (add marker level)
   * 3. Otherwise, use configured fallback behavior (checked dynamically)
   */
  function smartTab(view: Parameters<NonNullable<KeyBinding["run"]>>[0]): boolean {
    // If completion popup is active, accept the completion
    if (completionStatus(view.state) === "active") {
      return acceptCompletion(view)
    }
    // Try to indent list (returns false if not in a list)
    if (indentList(view)) {
      return true
    }
    // Get behavior dynamically (default to "indent")
    const behavior = getTabOutsideListBehavior ? getTabOutsideListBehavior() : "indent"
    switch (behavior) {
      case "indent":
        return indentMore(view)
      case "insertTab":
        return insertTab(view)
      case "none":
      default:
        return false
    }
  }

  /**
   * Smart Shift-Tab handler:
   * 1. If in a list, outdent the list (remove marker level)
   * 2. Otherwise, use configured fallback behavior (checked dynamically)
   */
  function smartShiftTab(view: Parameters<NonNullable<KeyBinding["run"]>>[0]): boolean {
    // Try to outdent list (returns false if not in a list)
    if (outdentList(view)) {
      return true
    }
    // Get behavior dynamically (default to "indent")
    const behavior = getShiftTabOutsideListBehavior ? getShiftTabOutsideListBehavior() : "indent"
    switch (behavior) {
      case "indent":
        return indentLess(view)
      case "none":
      default:
        return false
    }
  }

  return [
    {key: "Enter", run: configuredEnter},
    {key: "Backspace", run: (view: any) => deleteBracketPair(view) || listMarkerDowngrade(view) || deleteMarkupBackward(view)},
    {key: "Tab", run: smartTab},
    {key: "Shift-Tab", run: smartShiftTab},
  ];
}

/**
 * Default keymap with standard behavior (indent outside lists)
 */
export const tiddlywikiKeymap: readonly KeyBinding[] = createTiddlywikiKeymap()
