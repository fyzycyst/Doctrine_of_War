// "Test in the field" (T16): replays the current battle from its start, as deployed,
// many times over, once with a doctrine and once with the player's variant of it, and
// compares the two honestly. Pure: the Web Worker runs it (fieldTest.worker.ts), and so
// do the tests.
//
// The design is paired: both sides fight each seed (the same fortunes), so most seeds
// end the same way and only the seeds where the outcomes differ carry information. The
// verdict is an exact two-sided sign test on those discordant seeds (McNemar's exact
// test), with outcomes ranked victory > stalemate > defeat. The run length adapts: it
// stops early once the difference is unmistakable, else runs to the seed or time budget.
import {
  createInitialState,
  resolvePhase,
  type Doctrine,
  type DoctrineLibrary,
  type EngineScenario,
  type Orders,
} from "../../game/engine";

/** Budgets: at least MIN seeds, at most MAX seeds or BUDGET_MS of wall time, checked every BATCH seeds. */
export const FIELD_TEST_MIN = 60;
export const FIELD_TEST_MAX = 300;
export const FIELD_TEST_BATCH = 20;
export const FIELD_TEST_BUDGET_MS = 3000;
/**
 * Stopping early is peeking at the data, so the bar for it is stricter than for the
 * final verdict: 0.01 at a checkpoint, against 0.05 for "clearly" once the budget is spent.
 */
export const EARLY_STOP_P = 0.01;
export const CLEAR_P = 0.05;
/** Below this, a lean is worth mentioning, as "not certain". */
export const LEAN_P = 0.25;

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
  /** Seed i is firstSeed + i: the first shares this battle's own fortune. */
  firstSeed: number;
  minRuns?: number;
  maxRuns?: number;
  budgetMs?: number;
}

export type Outcome = "victory" | "stalemate" | "defeat";

export interface ArmResult {
  victories: number;
  stalemates: number;
  defeats: number;
}

export interface FieldTestResult {
  runs: number;
  base: ArmResult;
  variant: ArmResult;
  /** Seeds where the variant's outcome ranked above the base's (e.g. won where it lost). */
  ahead: number;
  /** Seeds where it ranked below. */
  behind: number;
  /** Why the run ended: an unmistakable difference, the seed budget, or the time budget. */
  stoppedBy: "clear" | "runs" | "time";
}

const MAX_BATTLE_PHASES = 40;
const RANK: Record<Outcome, number> = { victory: 2, stalemate: 1, defeat: 0 };

function fight(input: FieldTestInput, doctrineId: string, seed: number): Outcome {
  const orders = { ...input.orders, ...Object.fromEntries(input.squadIds.map((id) => [id, doctrineId])) };
  let state = createInitialState(input.scenario, { seed, fortune: "on" });
  for (let guard = 0; state.status === "command" && guard < MAX_BATTLE_PHASES; guard += 1) {
    state = resolvePhase(state, orders, input.scenario, { doctrines: input.doctrines }).state;
  }
  return state.status === "command" ? "stalemate" : state.status;
}

const tally = (arm: ArmResult, outcome: Outcome) => {
  if (outcome === "victory") arm.victories += 1;
  else if (outcome === "stalemate") arm.stalemates += 1;
  else arm.defeats += 1;
};

/**
 * Exact two-sided sign test: the chance of a split at least this lopsided among `ahead +
 * behind` discordant seeds if the variant made no difference (each discordant seed a fair
 * coin). 1 when there are none.
 */
export function signTestP(ahead: number, behind: number): number {
  const n = ahead + behind;
  if (n === 0) return 1;
  const k = Math.min(ahead, behind);
  // Sum the binomial(n, 1/2) tail up to k, term by term (n ≤ a few hundred: doubles suffice).
  let term = Math.pow(0.5, n);
  let tail = term;
  for (let i = 1; i <= k; i += 1) {
    term = (term * (n - i + 1)) / i;
    tail += term;
  }
  return Math.min(1, 2 * tail);
}

/**
 * Plays paired battles (base, then variant, on each seed) until the difference is clear
 * at a checkpoint or a budget runs out. `onProgress(done, max)` after every seed; `now`
 * is injectable so tests can drive the time budget.
 */
export function runFieldTest(
  input: FieldTestInput,
  onProgress?: (done: number, max: number) => void,
  now: () => number = () => performance.now(),
  play: (input: FieldTestInput, doctrineId: string, seed: number) => Outcome = fight,
): FieldTestResult {
  const minRuns = input.minRuns ?? FIELD_TEST_MIN;
  const maxRuns = input.maxRuns ?? FIELD_TEST_MAX;
  const budgetMs = input.budgetMs ?? FIELD_TEST_BUDGET_MS;
  const started = now();
  const result: FieldTestResult = {
    runs: 0,
    base: { victories: 0, stalemates: 0, defeats: 0 },
    variant: { victories: 0, stalemates: 0, defeats: 0 },
    ahead: 0,
    behind: 0,
    stoppedBy: "runs",
  };
  while (result.runs < maxRuns) {
    const seed = input.firstSeed + result.runs;
    const base = play(input, input.baseId, seed);
    const variant = play(input, input.variantId, seed);
    tally(result.base, base);
    tally(result.variant, variant);
    if (RANK[variant] > RANK[base]) result.ahead += 1;
    if (RANK[variant] < RANK[base]) result.behind += 1;
    result.runs += 1;
    onProgress?.(result.runs, maxRuns);
    const checkpoint = result.runs >= minRuns && result.runs % FIELD_TEST_BATCH === 0;
    if (checkpoint && signTestP(result.ahead, result.behind) < EARLY_STOP_P) {
      result.stoppedBy = "clear";
      break;
    }
    // The time budget never cuts below the minimum: 60 seeds is the floor for any verdict.
    if (result.runs >= minRuns && now() - started >= budgetMs) {
      result.stoppedBy = "time";
      break;
    }
  }
  return result;
}

export const winRate = (arm: ArmResult, runs: number) => (runs ? Math.round((arm.victories / runs) * 100) : 0);
/** Advancing: the campaign moves on after a victory or a stalemate (a defeat is fought again). */
export const advanceRate = (arm: ArmResult, runs: number) => (runs ? Math.round(((arm.victories + arm.stalemates) / runs) * 100) : 0);

export type VerdictTone = "better" | "worse" | "slightly-better" | "slightly-worse" | "even";

export interface Verdict {
  /** "Clearly better", "Slightly worse, not certain", "No real difference". */
  headline: string;
  /** The facts behind it: "Holds Greyford Gate in 62% of 240 battles; the original, 50%." */
  detail: string;
  /** The discordant seeds in words. */
  pairs: string;
  tone: VerdictTone;
  p: number;
}

/** What winning this battle means, as a verb phrase. */
function goalPhrase(scenario: EngineScenario): string {
  const win = scenario.winCondition;
  if (win.kind === "holdObjective") {
    const objective = scenario.objectives.find((item) => item.id === win.objectiveId);
    if (objective) return `Holds ${objective.name.replace(/^The /, "the ")}`;
  }
  if (win.kind === "escapeEdge") return win.mustEscape?.length ? "Gets the Column out" : "Gets them out";
  return "Wins";
}

const battles = (n: number) => `${n} ${n === 1 ? "battle" : "battles"}`;

/** The verdict a player can trust: only as strong as the paired evidence. */
export function verdict(result: FieldTestResult, scenario: EngineScenario): Verdict {
  const p = signTestP(result.ahead, result.behind);
  const better = result.ahead > result.behind;
  const clear = result.stoppedBy === "clear" || p < CLEAR_P;
  let headline: string;
  let tone: VerdictTone;
  if (result.ahead === result.behind || p >= LEAN_P) {
    headline = "No real difference";
    tone = "even";
  } else if (clear) {
    headline = better ? "Clearly better" : "Clearly worse";
    tone = better ? "better" : "worse";
  } else {
    headline = better ? "Slightly better, not certain" : "Slightly worse, not certain";
    tone = better ? "slightly-better" : "slightly-worse";
  }
  const detail = `${goalPhrase(scenario)} in ${winRate(result.variant, result.runs)}% of ${battles(result.runs)}; the original, ${winRate(result.base, result.runs)}%.`;
  const differ = result.ahead + result.behind;
  const pairs =
    differ === 0
      ? `Same fortunes, same result in every one of the ${battles(result.runs)}.`
      : `Same fortunes, different results in ${battles(differ)}: your cut came out ahead in ${result.ahead}, the original in ${result.behind}.`;
  return { headline, detail, pairs, tone, p };
}
