import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstBreach } from "../game/engine";

const calls: string[] = [];
vi.mock("../audio", () => ({
  DRUM_BASE: { command: 0.22, playback: 0.45 },
  setDrumIntensity: (base: number) => calls.push(`drums ${base}`),
  setMusic: (mood: string | null | undefined) => calls.push(`music ${mood}`),
}));

const { startAudioCues } = await import("./audioCues");
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
  it("pins the dusk score on the menus and lets a battle's time of day lead", () => {
    expect(calls).toEqual(["music dusk"]);
    act(() => useFlow.setState({ screen: "campaign" }));
    act(() => useFlow.setState({ screen: "battle" }));
    act(() => useFlow.setState({ screen: "ending" }));
    expect(calls).toEqual(["music dusk", "music dusk", "music undefined", "music dusk"]);
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
});
