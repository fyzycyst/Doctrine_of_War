// Canonical micro-battles for the doctrine identity matrix: each one isolates a
// single job (hold against a supported line, punish a lone crosser, a mixed front)
// so a test can assert which doctrine is best at it. Not used by the game itself.
import type { HexCoord } from "../board";
import { playBattle } from "./balance";
import { openBoard, scenario, squad } from "./testKit";
import type { EngineScenario, EngineState, FactionId, SquadSetup } from "./types";

const FB: FactionId = "free_banners";
const AH: FactionId = "ashen_host";

export interface IdentityResult {
  /** Mean strength + cohesion the Banners lost (a broken squad counts as all of it). */
  bannerLoss: number;
  /** Mean strength + cohesion the Host lost. */
  hostLoss: number;
  /** hostLoss - bannerLoss: who won the exchange. */
  net: number;
  /** Share of Banner squads still standing on their starting hex at the end. */
  held: number;
}

export interface MicroBattle {
  id: string;
  title: string;
  /** Banner squad ids, in the order a plan lists doctrines for them. */
  defenders: string[];
  build: (doctrineIds: string[]) => EngineScenario;
}

function loss(setups: SquadSetup[], final: EngineState): number {
  return setups.reduce((sum, setup) => {
    const squad = final.squads.find((item) => item.id === setup.id)!;
    const broken = squad.status === "routed" || squad.status === "destroyed";
    return sum + (broken ? setup.strength + setup.cohesion : setup.strength - squad.strength + setup.cohesion - squad.cohesion);
  }, 0);
}

function field(defenders: [string, HexCoord][], host: SquadSetup[], maxPhases = 3) {
  return (doctrineIds: string[]): EngineScenario =>
    scenario({
      id: "identity",
      board: openBoard(7, 5),
      maxPhases,
      initiativeSide: AH,
      winCondition: { kind: "destroySquads", squadIds: host.map((item) => item.id) },
      timeoutOutcome: "stalemate",
      // A gate behind the defenders gives the Host something to march on.
      objectives: [{ id: "gate", name: "Gate", description: "", hex: { q: 6, r: 2 }, integrity: 100, defender: FB }],
      squads: [
        ...defenders.map(([id, hex], index) => squad(id, FB, hex, { strength: 80, cohesion: 76, doctrineId: doctrineIds[index] })),
        ...host,
      ],
    });
}

const tide = (id: string, hex: HexCoord, overrides: Partial<SquadSetup> = {}) =>
  squad(id, AH, hex, { strength: 80, cohesion: 70, doctrineId: "iron_tide", ...overrides });

export const microBattles: MicroBattle[] = [
  {
    id: "supportedLine",
    title: "Static defense vs a supported line",
    defenders: ["a", "b"],
    build: field([["a", { q: 5, r: 1 }], ["b", { q: 5, r: 2 }]], [tide("h1", { q: 1, r: 1 }), tide("h2", { q: 1, r: 2 }), tide("h3", { q: 1, r: 3 })]),
  },
  {
    id: "loneCrosser",
    title: "A lone crosser",
    defenders: ["a"],
    build: field([["a", { q: 5, r: 2 }]], [tide("h1", { q: 1, r: 2 })]),
  },
  {
    id: "mixedFront",
    title: "A mixed front: a supported pair above, a lone raider below",
    defenders: ["top", "bottom"],
    build: field(
      [["top", { q: 5, r: 1 }], ["bottom", { q: 5, r: 4 }]],
      [tide("h1", { q: 1, r: 0 }), tide("h2", { q: 1, r: 1 }), squad("rider", AH, { q: 0, r: 4 }, { role: "cavalry", strength: 70, cohesion: 64, doctrineId: "iron_tide" })],
    ),
  },
];

/** Plays a micro-battle with the given doctrines over seeds 1..seeds, fortune on. */
export function runMicro(battle: MicroBattle, doctrineIds: string[], seeds = 30): IdentityResult {
  const scen = battle.build(doctrineIds);
  const banners = scen.squads.filter((item) => item.faction === FB);
  const host = scen.squads.filter((item) => item.faction === AH);
  let bannerLoss = 0;
  let hostLoss = 0;
  let held = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const final = playBattle(scen, {}, seed, "on");
    bannerLoss += loss(banners, final);
    hostLoss += loss(host, final);
    held += banners.filter((setup) => {
      const squad = final.squads.find((item) => item.id === setup.id)!;
      return squad.status === "active" && squad.hex?.q === setup.hex.q && squad.hex?.r === setup.hex.r;
    }).length / banners.length;
  }
  return { bannerLoss: bannerLoss / seeds, hostLoss: hostLoss / seeds, net: (hostLoss - bannerLoss) / seeds, held: held / seeds };
}
