import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { hexDistance, sameHex } from "../../game/board";
import { createInitialState, holdForDawn, resolvePhase } from "../../game/engine";
import { useGame } from "./gameStore";
import { useAppStore } from "../store";
import { boardZone, useBoardMuster } from "../ui/useMuster";
import { musterTargets } from "./muster";
import { selectPick } from "../../render/picking";

const game = () => useGame.getState();

beforeEach(() => {
  // Hold for Dawn after phase 1 (intended plan): the line is in contact, with fresh companies behind it.
  const start = createInitialState(holdForDawn, { fortune: "on", seed: holdForDawn.curatedSeed ?? 1 });
  const phaseTwo = resolvePhase(start, holdForDawn.referencePlans!.intended, holdForDawn).state;
  act(() => {
    game().loadBattle(holdForDawn, { fortune: "on", seed: holdForDawn.curatedSeed ?? 1 }, "command");
    game().replaceEngine(phaseTwo);
  });
});

const freeMover = () => {
  const id = game().view.squads.find((squad) => squad.faction === game().view.viewer && musterTargets(game().engine, game().scenario, [], squad.id).hexes.length > 0)!.id;
  return { id, to: musterTargets(game().engine, game().scenario, [], id).hexes[0] };
};

describe("muster in the game store", () => {
  it("plans, replaces, undoes and resets moves, and refuses one the engine would refuse", () => {
    const { id, to } = freeMover();
    expect(game().planMuster({ squadId: id, to })).toBe(true);
    expect(game().muster).toEqual([{ squadId: id, to }]);
    expect(game().planMuster({ squadId: id, to: { q: 99, r: 99 } })).toBe(false);
    expect(game().notice).toBe("That hex is off the field.");
    expect(game().muster).toEqual([{ squadId: id, to }]);
    game().undoMuster(id);
    expect(game().muster).toEqual([]);
    game().planMuster({ squadId: id, to });
    game().resetMuster();
    expect(game().muster).toEqual([]);
  });

  it("plans a relief of the line, and seals it with the orders: the engine plays it at beat 0", () => {
    expect(game().planMuster({ squadId: "greyford_shields", relieve: "gatewarden_spears" })).toBe(true);
    const fresh = game().view.squads.find((squad) => squad.id === "greyford_shields")!.hex!;
    const tired = game().view.squads.find((squad) => squad.id === "gatewarden_spears")!.hex!;
    act(() => game().sealOrders());
    expect(game().stage).toBe("resolving");
    expect(game().muster).toEqual([]);
    const relieved = game().log[0].events.find((event) => event.kind === "relieved");
    expect(relieved).toMatchObject({ squadId: "greyford_shields", relievedId: "gatewarden_spears", beat: 0 });
    // The swap happened before anything else in the phase.
    expect(game().log[0].events.findIndex((event) => event.kind === "relieved")).toBeLessThan(game().log[0].events.findIndex((event) => event.beat > 0));
    expect(hexDistance(fresh, tired)).toBe(1);
  });

  it("will not seal a plan that no longer holds, and says why", () => {
    // B moves into the hex A plans to leave; then A's move is undone, so B's no longer holds.
    const view = game().view;
    const own = view.squads.filter((squad) => squad.faction === view.viewer && squad.hex);
    let chain: { a: string; aTo: { q: number; r: number }; b: string; bTo: { q: number; r: number } } | null = null;
    for (const a of own) {
      for (const aTo of musterTargets(game().engine, game().scenario, [], a.id).hexes) {
        for (const b of own.filter((squad) => squad.id !== a.id)) {
          const targets = musterTargets(game().engine, game().scenario, [{ squadId: a.id, to: aTo }], b.id).hexes;
          if (targets.some((hex) => sameHex(hex, a.hex!))) chain ??= { a: a.id, aTo, b: b.id, bTo: a.hex! };
        }
      }
    }
    expect(chain).not.toBeNull();
    game().planMuster({ squadId: chain!.a, to: chain!.aTo });
    expect(game().planMuster({ squadId: chain!.b, to: chain!.bTo })).toBe(true);
    game().undoMuster(chain!.a);
    act(() => game().sealOrders());
    expect(game().stage).toBe("command");
    expect(game().notice).toMatch(/already holds that hex/);
  });

  it("suggests the engine's muster, or says there is nothing to suggest", () => {
    const count = game().suggestMuster();
    expect(game().muster).toHaveLength(count);
    if (count === 0) expect(game().notice).toMatch(/Nothing to suggest/);
  });
});

describe("muster by clicking the board", () => {
  it("plans a move on a muster hex and a relief on a worn company, keeping the company selected", async () => {
    renderHook(() => useBoardMuster());
    const app = useAppStore.getState();
    const { id, to } = freeMover();
    act(() => app.selectSquad(id));
    // The Diorama's picking: the hex, then the squad on it (none here).
    act(() => {
      useAppStore.getState().selectHex({ ...to });
      useAppStore.getState().selectSquad(null);
    });
    await act(() => Promise.resolve());
    expect(game().muster).toEqual([{ squadId: id, to }]);
    expect(useAppStore.getState().selectedSquadId).toBe(id);

    act(() => useAppStore.getState().selectSquad("greyford_shields"));
    const tired = game().view.squads.find((squad) => squad.id === "gatewarden_spears")!.hex!;
    act(() => {
      useAppStore.getState().selectHex({ ...tired });
      useAppStore.getState().selectSquad("gatewarden_spears");
    });
    await act(() => Promise.resolve());
    expect(game().muster).toContainEqual({ squadId: "greyford_shields", relieve: "gatewarden_spears" });
    expect(useAppStore.getState().selectedSquadId).toBe("greyford_shields");
  });

  it("plans a relief when the worn company's figure is clicked, as when its hex is (T33)", async () => {
    renderHook(() => useBoardMuster());
    act(() => useAppStore.getState().selectSquad("greyford_shields"));
    const tired = game().view.squads.find((squad) => squad.id === "gatewarden_spears")!.hex!;
    // The Diorama's figure pick: the clicked company, on its hex.
    act(() => selectPick(useAppStore.getState(), { ...tired }, "gatewarden_spears"));
    await act(() => Promise.resolve());
    expect(game().muster).toContainEqual({ squadId: "greyford_shields", relieve: "gatewarden_spears" });
    expect(useAppStore.getState().selectedSquadId).toBe("greyford_shields");
  });

  it("selects a company whose figure is clicked when no company is armed", async () => {
    renderHook(() => useBoardMuster());
    act(() => useAppStore.getState().clearSelection());
    const tired = game().view.squads.find((squad) => squad.id === "gatewarden_spears")!.hex!;
    act(() => selectPick(useAppStore.getState(), { ...tired }, "gatewarden_spears"));
    await act(() => Promise.resolve());
    expect(game().muster).toEqual([]);
    expect(useAppStore.getState().selectedSquadId).toBe("gatewarden_spears");
  });
});

describe("the board's zone style", () => {
  const hex = { q: 1, r: 1 };
  it("marches for muster targets in a command window, deploys in deployment, and shows nothing otherwise", () => {
    expect(boardZone("command", () => [], [hex])).toEqual({ hexes: [hex], style: "march" });
    expect(boardZone("deploy", () => [hex], [])).toEqual({ hexes: [hex], style: "deploy" });
    expect(boardZone("command", () => [hex], [])).toEqual({ style: "deploy" });
    expect(boardZone("resolving", () => [hex], [hex])).toEqual({ style: "deploy" });
  });
});
