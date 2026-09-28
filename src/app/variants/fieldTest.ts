// "Test in the field" (T16): replays the current battle from its start, as deployed,
// many times over, once with a doctrine and once with the player's variant of it, and
// compares how often each wins. Pure: the Web Worker runs it (fieldTest.worker.ts),
// and so do the tests. Both sides see the same fortunes (seeds), so the difference is
// the orders, not the dice.
import {
  createInitialState,
  resolvePhase,
  type Doctrine,
  type DoctrineLibrary,
  type EngineScenario,
  type Orders,
} from "../../game/engine";

export const FIELD_TEST_RUNS = 60;
/** Differences smaller than this (percentage points) are called even: 60 runs are noisy. */
export const FIELD_TEST_EVEN = 5;

export interface FieldTestInput {
  /** The battle as fought: campaign applied, deployment applied, variants in its allowlist. */
  scenario: EngineScenario;
  /** The doctrine library with every variant the battle may play, the tested one included. */
  doctrines: DoctrineLibrary;
  /** Every player company's current order (its standing doctrine where none was given). */
  orders: Orders;
  /** The companies that switch between the base doctrine and the variant. */
  squadIds: string[];
  baseId: string;
  variantId: string;
  runs: number;
  /** Run i uses firstSeed + i: the first run shares this battle's own fortune. */
  firstSeed: number;
}

export interface ArmResult {
  victories: number;
  stalemates: number;
  defeats: number;
}

export interface FieldTestResult {
  runs: number;
  base: ArmResult;
  variant: ArmResult;
}

const MAX_BATTLE_PHASES = 40;

function fight(input: FieldTestInput, doctrineId: string, seed: number): "victory" | "stalemate" | "defeat" {
  const orders = { ...input.orders, ...Object.fromEntries(input.squadIds.map((id) => [id, doctrineId])) };
  let state = createInitialState(input.scenario, { seed, fortune: "on" });
  for (let guard = 0; state.status === "command" && guard < MAX_BATTLE_PHASES; guard += 1) {
    state = resolvePhase(state, orders, input.scenario, { doctrines: input.doctrines }).state;
  }
  return state.status === "command" ? "stalemate" : state.status;
}

const tally = (arm: ArmResult, outcome: "victory" | "stalemate" | "defeat") => {
  if (outcome === "victory") arm.victories += 1;
  else if (outcome === "stalemate") arm.stalemates += 1;
  else arm.defeats += 1;
};

export function runFieldTest(input: FieldTestInput, onProgress?: (done: number, total: number) => void): FieldTestResult {
  const result: FieldTestResult = {
    runs: input.runs,
    base: { victories: 0, stalemates: 0, defeats: 0 },
    variant: { victories: 0, stalemates: 0, defeats: 0 },
  };
  for (let i = 0; i < input.runs; i += 1) {
    const seed = input.firstSeed + i;
    tally(result.base, fight(input, input.baseId, seed));
    tally(result.variant, fight(input, input.variantId, seed));
    onProgress?.(i + 1, input.runs);
  }
  return result;
}

export const winRate = (arm: ArmResult, runs: number) => Math.round((arm.victories / runs) * 100);
/** Advancing: the campaign moves on after a victory or a stalemate (a defeat is fought again). */
export const advanceRate = (arm: ArmResult, runs: number) => Math.round(((arm.victories + arm.stalemates) / runs) * 100);

/** One short line for the player: what the variant does to this battle's win rate. */
export function verdict(result: FieldTestResult, scenario: EngineScenario, base: Doctrine): { line: string; tone: "better" | "worse" | "even" } {
  const diff = winRate(result.variant, result.runs) - winRate(result.base, result.runs);
  if (Math.abs(diff) < FIELD_TEST_EVEN) {
    const advance = advanceRate(result.variant, result.runs) - advanceRate(result.base, result.runs);
    if (Math.abs(advance) >= FIELD_TEST_EVEN) {
      return advance > 0
        ? { line: `Wins about as often, but loses less (+${advance}% advance)`, tone: "better" }
        : { line: `Wins about as often, but loses more (${advance}% advance)`, tone: "worse" };
    }
    return { line: `About the same as ${base.name}`, tone: "even" };
  }
  const better = diff > 0;
  const signed = `${better ? "+" : "−"}${Math.abs(diff)}%`;
  const win = scenario.winCondition;
  const objective = "objectiveId" in win ? scenario.objectives.find((item) => item.id === win.objectiveId) : undefined;
  let phrase: string;
  if (win.kind === "holdObjective" && objective) {
    phrase = `Holds ${objective.name.replace(/^The /, "the ")} ${better ? "more" : "less"} often`;
  } else if (win.kind === "escapeEdge") {
    phrase = `Gets ${win.mustEscape?.length ? "the Column" : "them"} out ${better ? "more" : "less"} often`;
  } else if (win.kind === "destroySquads" || win.kind === "holdThenBreak") {
    phrase = `Breaks them ${better ? "more" : "less"} often`;
  } else {
    phrase = `Wins ${better ? "more" : "less"} often`;
  }
  return { line: `${phrase} (${signed})`, tone: better ? "better" : "worse" };
}
