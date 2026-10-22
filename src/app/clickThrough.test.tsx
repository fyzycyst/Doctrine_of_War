// Overlay click-through audit (T19 #1). The HUD lies over the 3D board with
// `pointer-events: none` so the board stays clickable around it, and turns events back on
// for its controls. A control that inherits `none` is not clickable at all: the click goes
// to the board beneath ("Edit a copy…" did). jsdom loads no CSS by itself, so the real
// stylesheet is injected and every interactive element is checked in each stage.
import { readFileSync } from "node:fs";
import { act, cleanup, render } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { firstBreach } from "../game/engine";
import { useFlow } from "./flow/flowStore";
import { memoryStore } from "./flow/testKit";
import { useGame, type Stage } from "./game/gameStore";
import { useGuide } from "./guide/guideStore";
import { Root } from "./Root";
import { useAppStore } from "./store";

vi.mock("../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./flow/testKit")).FakeTitleScene }));
vi.mock("../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./flow/testKit")).FakeCampaignMap }));
vi.mock("./ui/BattleBoard", () => ({ BattleBoard: () => null }));

const INTERACTIVE = 'button, a[href], input, select, textarea, [role="option"], [role="button"], [tabindex="0"]';

/** Interactive elements a pointer cannot reach: they or an ancestor compute to `pointer-events: none`. */
function unclickable(root: ParentNode = document.body): string[] {
  return [...root.querySelectorAll<HTMLElement>(INTERACTIVE)]
    .filter((element) => !element.closest('[aria-hidden="true"], .sr-only, [hidden]'))
    .filter((element) => getComputedStyle(element).pointerEvents === "none")
    .map((element) => (element.getAttribute("aria-label") ?? element.textContent ?? element.tagName).trim().slice(0, 40));
}

let style: HTMLStyleElement;
beforeAll(() => {
  style = document.createElement("style");
  style.textContent = readFileSync("src/styles.css", "utf8");
  document.head.append(style);
});
afterAll(() => style.remove());

beforeEach(() => {
  cleanup();
  useFlow.setState({ screen: "battle", campaign: null, store: memoryStore(), settingsOpen: false, editor: null });
  useGame.setState({ playbackSpeed: 1 });
});

function battleAt(stage: Stage) {
  act(() => useGame.getState().loadBattle(firstBreach, { fortune: "off", seed: 1 }, stage));
  act(() => useAppStore.getState().selectSquad("greyford_shields"));
  render(<Root />);
}

describe("no overlay control lets a click fall through to the board", () => {
  it("knows a control that inherits pointer-events: none (the check itself)", () => {
    const hud = document.createElement("div");
    hud.className = "hud";
    const hand = hud.appendChild(document.createElement("section"));
    hand.className = "hand";
    hand.appendChild(document.createElement("button")).textContent = "probe";
    document.body.append(hud);
    expect(unclickable()).toContain("probe");
    hud.remove();
  });

  it.each<Stage>(["briefing", "deploy", "command", "outcome"])("in the %s stage", (stage) => {
    battleAt(stage);
    expect(unclickable()).toEqual([]);
  });

  it("with the hand open: every card and Edit a copy…", () => {
    battleAt("command");
    expect(document.querySelector(".hand-edit")).not.toBeNull();
    expect(unclickable()).toEqual([]);
  });

  it("during playback and in the report", async () => {
    battleAt("command");
    act(() => useGame.getState().sealOrders());
    expect(unclickable()).toEqual([]);
    act(() => useGame.getState().finishPlayback());
    expect(unclickable()).toEqual([]);
  });

  it("in the doctrine editor and Settings", () => {
    battleAt("command");
    act(() => useFlow.setState({ editor: { baseId: "shield_the_line", squadId: "greyford_shields" } }));
    expect(unclickable()).toEqual([]);
    act(() => useFlow.setState({ editor: null, settingsOpen: true }));
    expect(unclickable()).toEqual([]);
  });

  it.each(["title", "campaign"] as const)("on the %s screen", async (screen) => {
    const store = memoryStore();
    useFlow.setState({ screen: "title", store });
    render(<Root />);
    if (screen === "campaign") await act(() => useFlow.getState().beginCampaign());
    expect(useFlow.getState().screen).toBe(screen);
    expect(unclickable()).toEqual([]);
  });
});

/**
 * HUD pieces that catch board clicks over empty space (T33): a wrapper in the HUD's grid
 * with pointer events on whose contents are all fixed or absolute fills its grid cell
 * with nothing visible, and swallows clicks meant for the board beneath (the tutorial's
 * did, so board musters and reliefs did nothing while it ran).
 */
function emptyCatchers(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".hud > *")]
    .filter((element) => {
      const style = getComputedStyle(element);
      // jsdom leaves an undeclared position empty: that is static, in the grid.
      if (style.pointerEvents === "none" || style.display === "contents" || !["", "static"].includes(style.position)) return false;
      const children = [...element.children];
      return children.length > 0 && children.every((child) => ["fixed", "absolute"].includes(getComputedStyle(child).position));
    })
    .map((element) => element.className || element.tagName);
}

describe("no empty HUD box catches the board's clicks", () => {
  it("knows a wrapper whose contents all float (the check itself)", () => {
    const hud = document.createElement("div");
    hud.className = "hud";
    const wrapper = hud.appendChild(document.createElement("div"));
    wrapper.className = "probe";
    wrapper.appendChild(document.createElement("div")).className = "coach-panel";
    document.body.append(hud);
    expect(emptyCatchers()).toEqual(["probe"]);
    hud.remove();
  });

  it("while the tutorial's step is on screen", () => {
    act(() => useGuide.setState({ introSeen: true, coach: "active", step: "select", off: false }));
    battleAt("command");
    expect(document.querySelector(".coach-panel")).not.toBeNull();
    expect(emptyCatchers()).toEqual([]);
  });
});
