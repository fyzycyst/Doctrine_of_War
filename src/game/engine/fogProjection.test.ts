// Property test for fog of war in playback: everything the Banners' projected event
// stream mentions (squad ids and hexes) must have been visible to the Banners at the
// moment the event happened. Checked against the true state via the onEmit hook.
// The player's prose report (title and lines) and every string in the projected
// events (labels, titles, reasons) must also never name an enemy squad, by name or
// id, that the projected stream did not legitimately mention in that phase.
import { describe, expect, it } from "vitest";
import type { HexCoord } from "../board";
import { eventsFor, factionSees } from "./fog";
import { decisionLeaks } from "./fogDecisions.testkit";
import { prototypeScenarios } from "./fixtures";
import { createInitialState, resolvePhase } from "./resolvePhase";
import { createRng } from "./rng";
import { registry } from "../packs/registry";
import type { EngineEvent, EngineScenario, EngineState, Orders } from "./types";

const VIEWER = "free_banners" as const;

function idsIn(event: EngineEvent): string[] {
  const ids: string[] = [];
  for (const [key, value] of Object.entries(event)) {
    if (/Id$/.test(key) && typeof value === "string" && key !== "doctrineId" && key !== "ruleId" && key !== "objectiveId") {
      ids.push(value);
    }
  }
  if (event.kind === "engagement") {
    ids.push(...Object.keys(event.strengthChanges), ...Object.keys(event.cohesionChanges));
  }
  return ids;
}

function hexesIn(value: unknown, found: HexCoord[] = []): HexCoord[] {
  if (value && typeof value === "object") {
    if ("q" in value && "r" in value && typeof value.q === "number" && typeof value.r === "number") {
      found.push(value as HexCoord);
    }
    for (const child of Object.values(value)) {
      hexesIn(child, found);
    }
  }
  return found;
}

function stringsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (value && typeof value === "object") for (const child of Object.values(value)) stringsIn(child, found);
  return found;
}

function checkBattle(scenario: EngineScenario, orders: Orders, seed: number): { checked: number; prose: number; leaks: string[]; introduced: number } {
  const leaks: string[] = [];
  let checked = 0;
  let prose = 0;
  let introduced = 0;
  // Per phase: enemy squads the projected stream mentioned while seen, and the projected events.
  let mentioned = new Set<string>();
  let projectedThisPhase: EngineEvent[] = [];
  const onEmit = (event: EngineEvent, state: EngineState) => {
    const [projected] = eventsFor([event], VIEWER);
    if (!projected) {
      return;
    }
    checked += 1;
    projectedThisPhase.push(projected);
    const ctx = { state, scenario };
    const seen = (hex: HexCoord) =>
      factionSees(ctx, VIEWER, hex) || state.objectives.some((objective) => objective.hex.q === hex.q && objective.hex.r === hex.r);
    for (const id of idsIn(projected)) {
      const squad = state.squads.find((item) => item.id === id);
      if (!squad || squad.faction === VIEWER) continue;
      // A mover counts as seen if it was seen anywhere along its (projected) path:
      // watched walking into the dark is still watched.
      if (projected.kind === "move" && projected.squadId === id && projected.path.some(seen)) {
        mentioned.add(id);
        continue;
      }
      const hex = squad.hex ?? ("hex" in event && "squadId" in event && event.squadId === id ? event.hex : null);
      if (!hex || !seen(hex)) {
        leaks.push(`${scenario.id}#${seed} phase ${event.phase} beat ${event.beat} ${event.kind}: unseen squad ${id}`);
      } else {
        mentioned.add(id);
      }
    }
    // Snapshots (sightings, and squads an event first brings into view) must be exact and in sight.
    const snapshots = [...(projected.kind === "sighted" ? [projected.snapshot] : []), ...(projected.introduces ?? [])];
    for (const shot of snapshots) {
      const squad = state.squads.find((item) => item.id === shot.id);
      if (!squad || !squad.hex || !seen(squad.hex)) {
        leaks.push(`${scenario.id}#${seed} ${event.kind}: snapshot of unseen squad ${shot.id}`);
        continue;
      }
      const truth = { hex: squad.hex, strength: squad.strength, cohesion: squad.cohesion, status: squad.status, doctrineId: squad.doctrineId };
      const shown = { hex: shot.hex, strength: shot.strength, cohesion: shot.cohesion, status: shot.status, doctrineId: shot.doctrineId };
      if (JSON.stringify(truth) !== JSON.stringify(shown)) {
        leaks.push(`${scenario.id}#${seed} ${event.kind}: snapshot of ${shot.id} differs from the true state`);
      }
      const allowed = ["id", "name", "faction", "role", "hex", "strength", "cohesion", "resolve", "doctrineId", "status", "braced", "surging", "renown", "noncombatant"];
      const extra = Object.keys(shot).filter((key) => !allowed.includes(key));
      if (extra.length > 0) {
        leaks.push(`${scenario.id}#${seed} ${event.kind}: snapshot exposes ${extra.join(", ")}`);
      }
      introduced += 1;
    }
    // A squad knows its own path; the property is about what the Banners learn of the enemy.
    const ownMove = projected.kind === "move" && state.squads.find((squad) => squad.id === projected.squadId)?.faction === VIEWER;
    for (const hex of ownMove ? [] : hexesIn(projected)) {
      if (!seen(hex)) {
        leaks.push(`${scenario.id}#${seed} phase ${event.phase} beat ${event.beat} ${event.kind}: unseen hex ${hex.q},${hex.r}`);
      }
    }
  };

  const enemies = scenario.squads.filter((squad) => squad.faction !== VIEWER);
  let state = createInitialState(scenario, { seed, fortune: "on" });
  while (state.status === "command") {
    mentioned = new Set();
    projectedThisPhase = [];
    const result = resolvePhase(state, orders, scenario, { onEmit });
    const texts = [
      ...[result.report.title, ...result.report.lines].map((text) => ["report", text] as const),
      ...projectedThisPhase.flatMap((event) => stringsIn(event).map((text) => [`${event.kind} event`, text] as const)),
    ];
    prose += texts.length;
    for (const squad of enemies) {
      if (mentioned.has(squad.id)) continue;
      const name = result.state.squads.find((item) => item.id === squad.id)?.name ?? squad.name;
      for (const [where, text] of texts) {
        if (text.includes(squad.name) || text.includes(name) || new RegExp(`\\b${squad.id}\\b`).test(text)) {
          leaks.push(`${scenario.id}#${seed} phase ${state.phase} ${where}: unseen squad ${squad.id} named in "${text}"`);
        }
      }
    }
    state = result.state;
  }
  return { checked, prose, leaks, introduced };
}

/** Reference plans, plus everyone on Clean Counterstroke and (where offered) everyone on Bring the Water. */
function propertyPlans(scenario: EngineScenario): Record<string, Orders> {
  const playerSquads = scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant);
  const all = (doctrineId: string) => Object.fromEntries(playerSquads.map((squad) => [squad.id, doctrineId]));
  return {
    intended: scenario.referencePlans!.intended,
    bad: scenario.referencePlans!.bad,
    counterstroke: all("clean_counterstroke"),
    ...(scenario.playerDoctrineIds.includes("bring_the_water") ? { advance: all("bring_the_water") } : {}),
  };
}

describe("fog projection property", () => {
  const pick = createRng(20260928);
  const seeds = Array.from({ length: 10 }, () => 1 + Math.floor(pick.next() * 100000));

  for (const scenario of [...registry.scenarios(), ...prototypeScenarios]) {
    const plans = propertyPlans(scenario);
    for (const [planName, orders] of Object.entries(plans)) {
      it(`${scenario.title} (${planName}): the Banners' projected stream only mentions what they could see`, () => {
        let checked = 0;
        let prose = 0;
        let introduced = 0;
        const leaks: string[] = [];
        for (const seed of seeds) {
          const result = checkBattle(scenario, orders, seed);
          checked += result.checked;
          prose += result.prose;
          introduced += result.introduced;
          leaks.push(...result.leaks);
        }
        expect(checked).toBeGreaterThan(100);
        expect(prose).toBeGreaterThan(100);
        // Snapshots are checked whenever they occur; `introduced` counts them for debugging.
        void introduced;
        expect(leaks).toEqual([]);
      });
    }
  }
});

// Decision side of fog (P4): what a Banner company decides must not depend on enemies its
// side cannot see (fogDecisions.testkit.ts). This is what makes an objective-anchored advance
// safe under fog.
describe("fog decision property (P4)", () => {
  const pick = createRng(20261002);
  const seeds = Array.from({ length: 6 }, () => 1 + Math.floor(pick.next() * 100000));

  for (const scenario of [...registry.scenarios(), ...prototypeScenarios]) {
    for (const [planName, orders] of Object.entries(propertyPlans(scenario))) {
      it(`${scenario.title} (${planName}): Banner decisions, routes and withdrawals never depend on unseen enemies`, () => {
        const { checked, leaks } = decisionLeaks(scenario, orders, seeds, () => pick.next());
        expect(checked).toBeGreaterThan(50);
        expect(leaks.slice(0, 5)).toEqual([]);
      }, 60_000);
    }
  }
});
