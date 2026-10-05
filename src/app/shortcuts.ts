// Every keyboard shortcut, in one table (T26). The key handlers ask `pressed(id, event)`,
// and the Field Manual's Controls page is drawn from the same rows, so the two cannot
// drift apart.

export interface KeyCombo {
  /** KeyboardEvent.key (case-insensitive for letters). */
  key: string;
  /** ⌘ on a Mac, Ctrl elsewhere (either is accepted), with Shift. */
  commandShift?: boolean;
}

export interface Shortcut {
  id: string;
  combos: readonly KeyCombo[];
  /** Where it works, in the player's words. */
  where: string;
  /** What it does. */
  does: string;
}

export const SHORTCUTS = [
  { id: "help", combos: [{ key: "F1" }, { key: "?" }], where: "Anywhere (outside a text box)", does: "Open this Field Manual" },
  { id: "deselect", combos: [{ key: "Escape" }], where: "Battle: deploying and giving orders", does: "Close the top layer (a guide, a dialog, the hand), then deselect the company" },
  { id: "skipPhase", combos: [{ key: " " }, { key: "Escape" }], where: "Battle: while a phase plays", does: "Skip to the end of the phase" },
  { id: "rosterMove", combos: [{ key: "ArrowUp" }, { key: "ArrowDown" }], where: "Battle: the company list", does: "Move between companies" },
  { id: "rosterChoose", combos: [{ key: "Enter" }, { key: " " }], where: "Battle: the company list", does: "Select the company (when giving orders, open its hand of doctrines)" },
  { id: "handBrowse", combos: [{ key: "ArrowLeft" }, { key: "ArrowRight" }, { key: "Home" }, { key: "End" }], where: "Battle: the hand of doctrines", does: "Browse the doctrines" },
  { id: "handAssign", combos: [{ key: "Enter" }, { key: " " }], where: "Battle: the hand of doctrines", does: "Give the company that doctrine" },
  { id: "handLeave", combos: [{ key: "Escape" }], where: "Battle: the hand of doctrines", does: "Back to the company list" },
  { id: "listMove", combos: [{ key: "ArrowUp" }, { key: "ArrowDown" }], where: "Call the Banners: a post's company list", does: "Move between companies" },
  { id: "listClose", combos: [{ key: "Escape" }], where: "Call the Banners: a post's company list, or How the call works", does: "Close the list, or the help" },
  { id: "skipGuide", combos: [{ key: "Escape" }], where: "The first battle's guide", does: "Skip the guide" },
  { id: "capture", combos: [{ key: "h", commandShift: true }], where: "Anywhere", does: "Capture mode: hide the interface for a clean picture (again to bring it back)" },
] as const satisfies readonly Shortcut[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

const byId = new Map<string, Shortcut>(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]));

type KeyEventLike = Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey"> & { altKey?: boolean };

function matches(combo: KeyCombo, event: KeyEventLike): boolean {
  if (combo.commandShift) return event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === combo.key.toLowerCase();
  // A plain key: no ⌘ / Ctrl / Alt held ("?" itself needs Shift on most layouts, so Shift is free).
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1 ? event.key.toLowerCase() === combo.key.toLowerCase() : event.key === combo.key;
}

/** Whether `event` is one of shortcut `id`'s keys. */
export function pressed(id: ShortcutId, event: KeyEventLike): boolean {
  return byId.get(id)!.combos.some((combo) => matches(combo, event));
}

const KEY_NAMES: Record<string, string> = {
  Escape: "Esc",
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/** A key as the Controls page writes it: "Esc", "Space", "↑", "⌘/Ctrl ⇧ H". */
export function comboLabel(combo: KeyCombo): string {
  const name = KEY_NAMES[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  return combo.commandShift ? `⌘/Ctrl ⇧ ${name}` : name;
}

/** Typing in a text box (the editor's name field, a select) never triggers a shortcut. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
