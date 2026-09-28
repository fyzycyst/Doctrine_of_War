import { describe, expect, it, vi } from "vitest";
import { hexNeighbors } from "../../game/board";
import { createInitialState, eventsFor, firstBreach, resolvePhase, visibleState, type VisibleState } from "../../game/engine";
import type { SquadAnimationApi } from "../../render/figures/squadAnimation";
import { PlaybackDirector, WAIT_SLICE_MS, type CalloutSpec, type DirectorHooks } from "./director";
import { buildTimeline, type Pace } from "./timeline";

const PLAYER = "free_banners" as const;

function mockAnimator() {
  const calls: string[] = [];
  const record = (name: string) => vi.fn((id: string) => {
    calls.push(`${name}:${id}`);
    return Promise.resolve();
  });
  const api = {
    march: record("march"),
    lunge: record("lunge"),
    fall: record("fall"),
    rout: record("rout"),
    rally: record("rally"),
    brace: record("brace"),
    reveal: record("reveal"),
    reset: vi.fn(),
    setTimeScale: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    shakeObjective: vi.fn((hex: { q: number; r: number }) => {
      calls.push(`shakeObjective:${hex.q},${hex.r}`);
      return Promise.resolve();
    }),
  } as unknown as SquadAnimationApi;
  return { api, calls };
}

/** The curated seed's phase with fortune on, as the player saw it, plus a headless director. */
function setup(pace: Pace = "readable", phases = 1) {
  let state = createInitialState(firstBreach, { fortune: "on", seed: firstBreach.curatedSeed });
  let result = resolvePhase(state, firstBreach.referencePlans!.intended, firstBreach);
  for (let i = 1; i < phases; i += 1) {
    state = result.state;
    result = resolvePhase(state, firstBreach.referencePlans!.intended, firstBreach);
  }
  const start = visibleState(state, PLAYER);
  const final = visibleState(result.state, PLAYER);
  const events = eventsFor(result.events, PLAYER);
  const timeline = buildTimeline(events, pace, { playerFaction: PLAYER, factionOf: (id) => final.squads.find((s) => s.id === id)?.faction });
  const { api, calls } = mockAnimator();
  let display: VisibleState = start;
  const callouts: CalloutSpec[] = [];
  const slept: number[] = [];
  const beats: number[] = [];
  const hooks: DirectorHooks = {
    board: firstBreach.board,
    playerFaction: PLAYER,
    maxFigures: 9,
    animator: () => api,
    pace: () => pace,
    display: () => display,
    setDisplay: (next) => {
      display = next;
    },
    known: (id) => final.squads.find((squad) => squad.id === id),
    setBeat: (beat) => beats.push(beat),
    callout: (spec) => callouts.push(spec),
    focus: () => undefined,
    shake: vi.fn(),
    sfx: vi.fn(),
    caption: () => undefined,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  };
  return { timeline, hooks, events, final, calls, callouts, slept, beats, display: () => display };
}

describe("PlaybackDirector", () => {
  it("plays every step and ends on the phase's final positions and losses", async () => {
    const run = setup();
    const director = new PlaybackDirector(run.timeline, run.hooks);
    await expect(director.run()).resolves.toBe("done");
    expect(run.beats).toEqual([1, 2, 3]);
    for (const squad of run.display().squads) {
      const final = run.final.squads.find((item) => item.id === squad.id);
      if (!final || squad.faction !== PLAYER) continue;
      expect({ id: squad.id, hex: squad.hex, strength: squad.strength, status: squad.status }).toEqual({
        id: final.id,
        hex: final.hex,
        strength: final.strength,
        status: final.status,
      });
    }
  });

  it("shows a rule callout for every rule fired by a squad on the board, in order", async () => {
    const run = setup();
    await new PlaybackDirector(run.timeline, run.hooks).run();
    const rules = run.callouts.filter((callout) => callout.kind === "rule");
    const fired = run.events.filter((event) => event.kind === "ruleFired");
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.length).toBeLessThanOrEqual(fired.length);
    expect(rules[0].text).toMatch(/→ [A-Z]/);
    // The surge and the waver on this seed get their own callouts.
    expect(run.callouts.some((callout) => callout.kind === "surge")).toBe(true);
    expect(run.callouts.some((callout) => callout.kind === "waver")).toBe(true);
  });

  it("drives the animator: lunges for clashes, braces for hold rules", async () => {
    const run = setup();
    await new PlaybackDirector(run.timeline, run.hooks).run();
    expect(run.calls.some((call) => call.startsWith("lunge:"))).toBe(true);
    expect(run.calls.some((call) => call.startsWith("brace:greyford_shields"))).toBe(true);
  });

  it("stops at once when skipped and reports it", async () => {
    const run = setup();
    let resolveSleep: () => void = () => undefined;
    run.hooks.sleep = () => new Promise((resolve) => (resolveSleep = resolve));
    const director = new PlaybackDirector(run.timeline, run.hooks);
    const finished = director.run();
    director.skip();
    resolveSleep();
    await expect(finished).resolves.toBe("skipped");
    expect(run.beats.length).toBeLessThanOrEqual(1);
  });

  it("reads the pace live: switching to Fast halves every wait", async () => {
    const sumOf = (list: number[]) => list.reduce((sum, ms) => sum + ms, 0);
    const readable = setup("readable");
    await new PlaybackDirector(readable.timeline, readable.hooks).run();

    const switched = setup("readable");
    switched.hooks.pace = () => "fast"; // toggled right after sealing
    await new PlaybackDirector(switched.timeline, switched.hooks).run();

    expect(sumOf(switched.slept)).toBeCloseTo(sumOf(readable.slept) / 2, 0);
  });
});

describe("PlaybackDirector: moves through the fog", () => {
  it("never animates across an unseen gap: it fades out, then reappears at the next seen hex", async () => {
    const run = setup();
    // Seen: (1,3) → (1,2), then (2,1) unseen and cut from the projection, then (3,1).
    const seen = [
      { q: 1, r: 3 },
      { q: 1, r: 2 },
      { q: 3, r: 1 },
    ];
    const events = [{ phase: 1, beat: 1, visibleTo: [PLAYER], kind: "move" as const, squadId: "ford_reavers", path: seen, from: seen[0], to: seen[2], reason: "advance" as const }];
    const timeline = buildTimeline(events, "readable", { playerFaction: PLAYER, factionOf: () => "ashen_host" });
    const marches: Array<{ hexes: { q: number; r: number }[] }> = [];
    const api = run.hooks.animator()!;
    (api.march as unknown as ReturnType<typeof vi.fn>).mockImplementation((_id: string, hexes: { q: number; r: number }[]) => {
      marches.push({ hexes });
      return Promise.resolve();
    });
    const shown: Array<{ hex: unknown; lastKnown: boolean }> = [];
    const setDisplay = run.hooks.setDisplay;
    run.hooks.setDisplay = (view) => {
      setDisplay(view);
      const reavers = view.squads.find((squad) => squad.id === "ford_reavers");
      if (reavers) shown.push({ hex: reavers.hex, lastKnown: reavers.lastKnown });
    };
    await new PlaybackDirector(timeline, run.hooks).run();

    // One march per seen stretch; no march step ever jumps more than one hex.
    expect(marches.map((march) => march.hexes)).toEqual([[seen[1]]]);
    // In between: a ghost at the last seen hex, then back in view at the next one.
    expect(shown).toContainEqual({ hex: seen[1], lastKnown: true });
    expect(shown).toContainEqual({ hex: seen[2], lastKnown: false });
    expect(run.display().squads.find((squad) => squad.id === "ford_reavers")).toMatchObject({ hex: seen[2], lastKnown: false });
  });
});

describe("PlaybackDirector: pace inside a step", () => {
  it("rescales the rest of the current step when the pace changes, and speeds animations with it", async () => {
    const run = setup();
    const surge = run.events.find((event) => event.kind === "fortune" && event.outcome === "surge")!;
    const timeline = buildTimeline([{ ...surge, beat: 0 }], "readable", { playerFaction: PLAYER, factionOf: () => PLAYER });
    const [step] = timeline.steps;
    expect(step.kind).toBe("fortune");

    let pace: Pace = "readable";
    run.hooks.pace = () => pace;
    const timeScales: number[] = [];
    vi.mocked(run.hooks.animator()!.setTimeScale).mockImplementation((k) => void timeScales.push(k));
    const slept: number[] = [];
    run.hooks.sleep = (ms) => {
      slept.push(ms);
      pace = "fast"; // the player switches to Fast during the first slice
      return Promise.resolve();
    };
    await new PlaybackDirector(timeline, run.hooks).run();

    expect(slept[0]).toBe(WAIT_SLICE_MS);
    expect(slept.slice(1).every((ms) => ms <= WAIT_SLICE_MS / 2)).toBe(true);
    expect(slept.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(WAIT_SLICE_MS + (step.duration - WAIT_SLICE_MS) / 2, 5);
    expect(timeScales).toEqual([2, 1]);
  });
});

describe("PlaybackDirector: a rout with nowhere to run", () => {
  it("breaks in place (every figure falls) instead of fleeing into a wall", async () => {
    const run = setup();
    const centre = { q: 3, r: 2 };
    run.hooks.board = {
      width: 5,
      height: 5,
      hexes: [{ coord: centre, terrain: "road" }, ...hexNeighbors(centre).map((coord) => ({ coord, terrain: "wall" as const }))],
    };
    const rout = { phase: 1, beat: 0, visibleTo: [PLAYER], kind: "rout" as const, squadId: "greyford_shields", hex: centre, cause: "cohesion" as const };
    const timeline = buildTimeline([rout], "readable", { playerFaction: PLAYER, factionOf: () => PLAYER });
    await new PlaybackDirector(timeline, run.hooks).run();
    expect(run.calls).toContain("fall:greyford_shields");
    expect(run.calls).not.toContain("rout:greyford_shields");
    expect(run.display().squads.find((squad) => squad.id === "greyford_shields")).toMatchObject({ status: "routed", hex: null });
  });
});

describe("PlaybackDirector: gate hits", () => {
  it("jolts the gate in 3D and keeps the flat board shake for when there is no animator", async () => {
    const run = setup();
    const hit = { phase: 1, beat: 0, visibleTo: [PLAYER], kind: "objectiveDamage" as const, objectiveId: "greyford_gate", attackerId: null, hex: { q: 4, r: 2 }, oldIntegrity: 100, newIntegrity: 63 };
    const timeline = buildTimeline([hit], "readable", { playerFaction: PLAYER, factionOf: () => PLAYER });
    await new PlaybackDirector(timeline, run.hooks).run();
    expect(run.calls).toContain("shakeObjective:4,2");
    expect(run.hooks.shake).not.toHaveBeenCalled();

    const headless = setup();
    headless.hooks.animator = () => null;
    await new PlaybackDirector(timeline, headless.hooks).run();
    expect(headless.hooks.shake).toHaveBeenCalledOnce();
  });
});
