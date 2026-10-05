import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstBreach } from "../game/engine";

const calls: string[] = [];
vi.mock("../audio", () => ({
  DRUM_BASE: { command: 0.22, playback: 0.45 },
  setDrumIntensity: (base: number) => calls.push(`drums ${base}`),
  setMusic: (mood: string | null | undefined) => calls.push(`music ${mood}`),
  clearAmbience: () => calls.push("beds off"),
  unlockAudio: () => calls.push("unlock"),
}));

const { installAudioUnlock, startAudioCues } = await import("./audioCues");
const { useFlow } = await import("./flow/flowStore");
const { useGame } = await import("./game/gameStore");

let stop: () => void = () => {};
beforeEach(() => {
  calls.length = 0;
  useFlow.setState({ screen: "title" });
  act(() => useGame.getState().loadBattle(firstBreach, { fortune: "off", seed: 1 }, "briefing"));
  stop = startAudioCues();
});
afterEach(() => stop());

describe("music and drum cues", () => {
  it("pins the dusk score on the menus, with no battle beds or drums, and lets a battle lead", () => {
    expect(calls).toEqual(["music dusk", "beds off"]);
    act(() => useFlow.setState({ screen: "campaign" }));
    act(() => useFlow.setState({ screen: "battle" }));
    act(() => useFlow.setState({ screen: "ending" }));
    // Back from a battle: the beds (and the drums with them) are cleared, not just the mood pinned.
    expect(calls).toEqual(["music dusk", "beds off", "music dusk", "beds off", "music undefined", "music dusk", "beds off"]);
  });

  it("rests the drums in a command window and raises them while a phase plays", () => {
    calls.length = 0;
    act(() => useGame.getState().takeCommand()); // deploy
    act(() => useGame.getState().confirmDeployment()); // command
    act(() => useGame.getState().sealOrders()); // resolving
    act(() => useGame.getState().finishPlayback()); // report: no change
    act(() => useGame.getState().nextPhase()); // command again
    expect(calls).toEqual(["drums 0.22", "drums 0.22", "drums 0.45", "drums 0.22"]);
  });

  it("unlocks audio on the first gesture anywhere, with no battle mounted", () => {
    calls.length = 0;
    const off = installAudioUnlock();
    expect(calls).toEqual([]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    window.dispatchEvent(new MouseEvent("pointerdown"));
    expect(calls).toEqual(["unlock"]);
    off();
  });

  it("in the Mac app, unlocks at start-up without waiting for a gesture", () => {
    calls.length = 0;
    (window as unknown as { doctrineOfWar?: unknown }).doctrineOfWar = { platform: "darwin" };
    const off = installAudioUnlock();
    expect(calls).toEqual(["unlock"]);
    off();
    delete (window as unknown as { doctrineOfWar?: unknown }).doctrineOfWar;
  });
});
