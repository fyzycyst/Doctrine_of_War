// What the muster UI needs (T21): the plan, where a company may go, who is in contact, and
// any plan that no longer holds. Command window only. All of it comes from the engine's
// player-view checks (see src/app/game/muster.ts).
import { useEffect, useMemo } from "react";
import { hexDistance, sameHex, type HexCoord } from "../../game/board";
import type { VisibleSquad, VisibleState } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { isRelief, musterProblems, musterTargets, planFor, type MusterTargets } from "../game/muster";
import type { ZoneStyle } from "../../render/terrain/BoardHighlights";
import { useAppStore } from "../store";

const NONE: MusterTargets = { hexes: [], relieve: [] };

/** In contact: an enemy the player can see stands next to it (neighbours always see each other). */
export function inContact(view: VisibleState, squad: VisibleSquad): boolean {
  return Boolean(
    squad.hex &&
      view.squads.some((other) => other.faction !== squad.faction && other.status === "active" && !other.lastKnown && other.hex && hexDistance(other.hex, squad.hex!) === 1),
  );
}

export function useMuster() {
  const stage = useGame((s) => s.stage);
  const engine = useGame((s) => s.engine);
  const scenario = useGame((s) => s.scenario);
  const view = useGame((s) => s.view);
  const plan = useGame((s) => s.muster);
  const active = stage === "command";
  const problems = useMemo(() => (active ? musterProblems(engine, scenario, plan) : {}), [active, engine, scenario, plan]);
  const targetsFor = useMemo(() => {
    const cache = new Map<string, MusterTargets>();
    return (squadId: string | null) => {
      if (!active || !squadId) return NONE;
      const squad = view.squads.find((item) => item.id === squadId);
      if (!squad || squad.faction !== view.viewer || squad.status !== "active" || squad.noncombatant) return NONE;
      if (!cache.has(squadId)) cache.set(squadId, musterTargets(engine, scenario, plan, squadId));
      return cache.get(squadId)!;
    };
  }, [active, engine, scenario, plan, view]);
  return { active, plan, problems, targetsFor, view };
}

/** The hexes to glow for the selected company: where it may muster, and the companies it may relieve. */
export function musterZone(view: VisibleState, targets: MusterTargets): HexCoord[] {
  const tired = targets.relieve.map((id) => view.squads.find((squad) => squad.id === id)?.hex).filter((hex): hex is HexCoord => Boolean(hex));
  return [...targets.hexes, ...tired];
}

/**
 * Board clicks in the command window: with one of your companies selected, a click on one
 * of its muster hexes plans the move, and a click on a company it may relieve plans the
 * relief. The company stays selected. (Mirrors useBoardDeployment.)
 */
export function useBoardMuster() {
  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (!state.selectedHex || state.selectedHex === prev.selectedHex) return;
        const game = useGame.getState();
        const armed = prev.selectedSquadId;
        const mine = game.view.squads.find((squad) => squad.id === armed && squad.faction === game.view.viewer && squad.status === "active");
        if (game.stage !== "command" || !mine || mine.noncombatant) return;
        const hex = state.selectedHex;
        const targets = musterTargets(game.engine, game.scenario, game.muster, mine.id);
        const tired = game.view.squads.find((squad) => squad.hex && squad.status === "active" && sameHex(squad.hex, hex) && targets.relieve.includes(squad.id));
        const planned = tired
          ? game.planMuster({ squadId: mine.id, relieve: tired.id })
          : targets.hexes.some((target) => sameHex(target, hex))
            ? game.planMuster({ squadId: mine.id, to: hex })
            : false;
        // Picking moved the selection to the clicked hex (or the company on it); keep the mustering company selected.
        if (planned) queueMicrotask(() => useAppStore.getState().selectSquad(mine.id));
      }),
    [],
  );
}

/** How a company's plan reads, from its own side. */
export function describePlan(
  plan: ReturnType<typeof planFor>,
  squadId: string,
  nameOf: (id: string) => string,
  hexName: (hex: HexCoord) => string,
): string | null {
  if (!plan) return null;
  if (isRelief(plan)) return plan.squadId === squadId ? `Relieves ${nameOf(plan.relieve)}` : `Relieved by ${nameOf(plan.squadId)}`;
  return `Musters to ${hexName(plan.to)}`;
}

/**
 * What the board highlights and how: the deployment zone while deploying ("deploy"), the
 * selected company's muster targets in a command window ("march": chevrons from the
 * company, oriented by the renderer from the selection), else nothing.
 */
export function boardZone(stage: string, deployHexes: () => HexCoord[], musterHexes: HexCoord[]): { hexes?: HexCoord[]; style: ZoneStyle } {
  if (stage === "deploy") return { hexes: deployHexes(), style: "deploy" };
  if (stage === "command" && musterHexes.length) return { hexes: musterHexes, style: "march" };
  return { style: "deploy" };
}
