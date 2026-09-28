// The field test's stopping rule, checked exactly: under the null (the cut makes no
// difference), what is the chance of a false "Clearly better/worse"? Every look at the
// data (each checkpoint, the final verdict, a Run longer's final verdict) spends some of
// that chance, so it is enumerated over the whole procedure, with the runner's own
// constants and checkpoint rule, for every seed count the time budget could stop at.
import { describe, expect, it } from "vitest";
import {
  CLEAR_P,
  CLEAR_P_EXTENDED,
  EARLY_STOP_P,
  FIELD_TEST_MAX,
  FIELD_TEST_MIN,
  isCheckpoint,
  LEAN_P,
  signTestP,
} from "./fieldTest";

interface Rule {
  interim: number;
  final: number;
  finalExtended: number;
}

const current: Rule = { interim: EARLY_STOP_P, final: CLEAR_P, finalExtended: CLEAR_P_EXTENDED };

/**
 * d = 1: every seed discordant, each one ahead or behind with probability 1/2 (the worst
 * case; see the d < 1 check below). The state after n seeds is the distribution of
 * `ahead` among paths that have not stopped. Returns the false-clear rate with the first
 * final look at each N1 in `firsts`, and the worst over every second final look (Run
 * longer, always taken when offered) at N1 + 1 … N1 + FIELD_TEST_MAX.
 */
function enumerateAllDiscordant(rule: Rule, firsts: number[]) {
  const pCache: number[][] = [];
  const p = (a: number, n: number) => ((pCache[n] ??= [])[a] ??= signTestP(a, n - a));
  const step = (dist: number[]) => {
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((mass, a) => {
      next[a] += mass / 2;
      next[a + 1] += mass / 2;
    });
    return next;
  };
  // Stage one, once: snapshot the surviving paths at each candidate first final look.
  const snapshots = new Map<number, { dist: number[]; clear: number }>();
  let dist = [1];
  let clear = 0;
  for (let n = 1; n <= Math.max(...firsts); n += 1) {
    dist = step(dist);
    if (firsts.includes(n)) snapshots.set(n, { dist: [...dist], clear });
    if (isCheckpoint(n)) {
      dist.forEach((mass, a) => {
        if (mass && p(a, n) < rule.interim) {
          clear += mass;
          dist[a] = 0;
        }
      });
    }
  }
  const single = new Map<number, number>();
  let withLonger = 0;
  for (const [n1, snapshot] of snapshots) {
    let stageClear = snapshot.clear;
    let lean = snapshot.dist.map(() => 0);
    snapshot.dist.forEach((mass, a) => {
      const q = p(a, n1);
      if (q < rule.final) stageClear += mass;
      else if (q < LEAN_P && 2 * a !== n1) lean[a] = mass; // "not certain": Run longer is offered
    });
    single.set(n1, stageClear);
    let extendedClear = stageClear;
    for (let n = n1 + 1; n <= n1 + FIELD_TEST_MAX; n += 1) {
      lean = step(lean);
      let ifFinalHere = extendedClear;
      lean.forEach((mass, a) => {
        if (mass && p(a, n) < rule.finalExtended) ifFinalHere += mass;
      });
      withLonger = Math.max(withLonger, ifFinalHere);
      if (isCheckpoint(n)) {
        lean.forEach((mass, a) => {
          if (mass && p(a, n) < rule.interim) {
            extendedClear += mass;
            lean[a] = 0;
          }
        });
      }
    }
  }
  return { single, worstSingle: Math.max(...single.values()), withLonger };
}

/** General discordance d < 1: the state is (discordant so far, ahead). Single run, final at n1. */
function enumerateSingle(rule: Rule, d: number, n1: number) {
  let dist = new Map<number, number>([[0, 1]]); // key k * 4096 + a
  let clear = 0;
  for (let n = 1; n <= n1; n += 1) {
    const next = new Map<number, number>();
    const add = (key: number, mass: number) => next.set(key, (next.get(key) ?? 0) + mass);
    for (const [key, mass] of dist) {
      add(key, mass * (1 - d));
      add(key + 4096 + 1, (mass * d) / 2);
      add(key + 4096, (mass * d) / 2);
    }
    dist = next;
    const threshold = n === n1 ? rule.final : isCheckpoint(n) ? rule.interim : 0;
    for (const [key, mass] of dist) {
      const k = Math.floor(key / 4096);
      const a = key % 4096;
      if (threshold && signTestP(a, k - a) < threshold) {
        clear += mass;
        dist.delete(key);
      }
    }
  }
  return clear;
}

const everyStop = Array.from({ length: FIELD_TEST_MAX - FIELD_TEST_MIN + 1 }, (_, i) => FIELD_TEST_MIN + i);

describe("the field test's false-clear rate, by exact enumeration under the null", () => {
  it("reproduces the independent review's figure for the old rule (6.2%)", () => {
    const old = enumerateAllDiscordant({ interim: 0.01, final: 0.05, finalExtended: 0.05 }, [FIELD_TEST_MAX]);
    expect(old.single.get(FIELD_TEST_MAX)).toBeCloseTo(0.0621362695, 9);
  });

  it("stays within 5% for a single run, whatever seed count the time budget stops at", () => {
    const { worstSingle } = enumerateAllDiscordant(current, everyStop);
    console.info(`false "Clearly", single run, worst over stops 60–300: ${(worstSingle * 100).toFixed(2)}%`);
    expect(worstSingle).toBeLessThanOrEqual(0.05);
  });

  it("stays within 5% with Run longer taken whenever offered, for every pair of stops", () => {
    const { withLonger } = enumerateAllDiscordant(current, everyStop);
    console.info(`false "Clearly", with Run longer, worst over both stops: ${(withLonger * 100).toFixed(2)}%`);
    expect(withLonger).toBeLessThanOrEqual(0.05);
  }, 20_000);

  it("is lower still when fewer seeds differ (all-discordant is the worst case)", () => {
    const worst = enumerateAllDiscordant(current, [255, 300]).worstSingle;
    for (const d of [0.5, 0.2]) {
      for (const n1 of [255, 300]) expect(enumerateSingle(current, d, n1)).toBeLessThan(worst);
    }
  }, 20_000);
});
