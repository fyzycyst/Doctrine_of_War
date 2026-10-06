// The two-suite routing (src/test/suites.ts): the vitest globs and the file-name rule agree,
// and the known simulation suites are routed to `npm run test:balance`.
import { describe, expect, it } from "vitest";
import { GUARDRAIL_SCENARIO_IDS } from "../game/engine/guardrails.testkit";
import { isBalanceTest } from "./suites";

const relative = (files: string[]) => files.map((file) => file.replace(/^\//, "")).sort();
const everyTest = relative(Object.keys(import.meta.glob("/src/**/*.test.{ts,tsx}")));
// The same patterns as BALANCE_TEST_GLOBS (import.meta.glob needs literals).
const routed = relative(Object.keys(import.meta.glob(["/src/**/balance.*.test.ts", "/src/**/*.sim.test.ts"])));

describe("test suites", () => {
  it("routes by file name: the balance globs and isBalanceTest pick the same files", () => {
    expect(everyTest.filter(isBalanceTest)).toEqual(routed);
  });

  it("sends every battle's guardrail smoke and the simulation suites to test:balance, and nothing else", () => {
    expect(routed.filter((file) => /\/balance\.[^/]+\.test\.ts$/.test(file))).toHaveLength(GUARDRAIL_SCENARIO_IDS.length);
    for (const file of [
      "src/game/campaign/cinderRoad2.guard.sim.test.ts",
      "src/game/campaign/cinderRoad2.march.sim.test.ts",
      "src/game/campaign/cinderRoad2.rush.sim.test.ts",
      "src/game/campaign/cinderRoad2.sim.test.ts",
      "src/game/engine/holdForDawn.sim.test.ts",
    ]) {
      expect(routed).toContain(file);
    }
    // The engine's own balance unit tests (and the per-battle coverage check) stay fast.
    expect(isBalanceTest("src/game/engine/balance.test.ts")).toBe(false);
    expect(isBalanceTest("src/game/campaign/cinderRoad2.test.ts")).toBe(false);
  });
});
