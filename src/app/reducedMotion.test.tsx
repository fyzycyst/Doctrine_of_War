// Reduced motion reaches CSS (T19b): the in-game setting, else the OS, stops every CSS
// animation and transition. The real stylesheet is injected (jsdom loads none) and every
// element's computed animation and transition is checked.
import { readFileSync } from "node:fs";
import { act, cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { firstBreach } from "../game/engine";
import { useFlow } from "./flow/flowStore";
import { memoryStore } from "./flow/testKit";
import { useGame } from "./game/gameStore";
import { Root } from "./Root";
import { useSettings } from "./settingsStore";
import type { MotionPreference } from "./store";
import { useAppStore } from "./store";

vi.mock("../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./flow/testKit")).FakeTitleScene }));
vi.mock("../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./flow/testKit")).FakeCampaignMap }));
vi.mock("./ui/BattleBoard", () => ({ BattleBoard: () => null }));

const moving = (value: string) => value !== "" && value !== "none";
/** Elements still animating or transitioning, as the stylesheet computes them. */
function inMotion(): string[] {
  return [...document.body.querySelectorAll<HTMLElement>("*")]
    .filter((element) => {
      const style = getComputedStyle(element);
      return moving(style.animation) || moving(style.transition);
    })
    .map((element) => element.className.toString() || element.tagName);
}

function osPrefersReduced(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches, addEventListener: () => {}, removeEventListener: () => {} })));
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
  osPrefersReduced(false);
  useFlow.setState({ screen: "battle", campaign: null, store: memoryStore(), settingsOpen: false, editor: null });
  act(() => useGame.getState().loadBattle(firstBreach, { fortune: "off", seed: 1 }, "command"));
  act(() => useAppStore.getState().selectSquad("greyford_shields"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => useSettings.getState().set({ motion: "system" }));
});

function battleWith(motion: MotionPreference) {
  act(() => useSettings.getState().set({ motion }));
  render(<Root />);
  // The outcome and the report animate in too: show the report over the battle.
  act(() => useGame.getState().sealOrders());
  act(() => useGame.getState().finishPlayback());
}

describe("reduced motion in CSS", () => {
  it("with motion on, the battle UI does animate (so the check below means something)", () => {
    battleWith("full");
    expect(document.documentElement).toHaveClass("motion-full");
    expect(document.documentElement).not.toHaveClass("reduce-motion");
    expect(inMotion().length).toBeGreaterThan(0);
  });

  it("Settings → Motion → Reduced stops every CSS animation and transition", () => {
    battleWith("reduce");
    expect(document.documentElement).toHaveClass("reduce-motion");
    expect(inMotion()).toEqual([]);
  });

  it("Like my system follows the OS: reduced there means reduced here", () => {
    osPrefersReduced(true);
    battleWith("system");
    expect(document.documentElement).toHaveClass("reduce-motion");
    expect(inMotion()).toEqual([]);
  });

  it("switches live when the setting changes", () => {
    battleWith("full");
    expect(inMotion().length).toBeGreaterThan(0);
    act(() => useSettings.getState().set({ motion: "reduce" }));
    expect(document.documentElement).toHaveClass("reduce-motion");
    expect(inMotion()).toEqual([]);
  });

  it("keeps only the weather ticker's fade (a fade is not motion); full motion scrolls it", () => {
    act(() => useSettings.getState().set({ motion: "reduce" }));
    render(<Root />);
    act(() => useGame.getState().sealOrders());
    act(() => void useGame.getState().pushCallout({ kind: "weather", hex: null, faction: null, title: "The weather turns", text: "Rain", repeat: false, linger: 2200 }));
    const ticker = document.querySelector<HTMLElement>(".ticker-text")!;
    expect(getComputedStyle(ticker).animation).toMatch(/ticker-fade/);
    expect(inMotion().filter((name) => !name.includes("ticker-text"))).toEqual([]);
    act(() => useSettings.getState().set({ motion: "full" }));
    expect(getComputedStyle(document.querySelector<HTMLElement>(".ticker-text")!).animation).toMatch(/ticker-scroll/);
  });
});
