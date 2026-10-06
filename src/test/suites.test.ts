// The test-suite routing (src/test/suites.ts): the vitest globs and the file-name rules agree,
// the known simulation suites are routed, and no test drops out of every suite.
import { describe, expect, it } from "vitest";
import { GUARDRAIL_SCENARIO_IDS } from "../game/engine/guardrails.testkit";
import { isBalanceTest, isFinaleTest } from "./suites";

const relative = (files: string[]) => files.map((file) => file.replace(/^\//, "")).sort();
const everyTest = relative(Object.keys(import.meta.glob("/src/**/*.test.{ts,tsx}")));
// The same patterns as BALANCE_TEST_GLOBS and FINALE_TEST_GLOBS (import.meta.glob needs literals).
const heavy = relative(Object.keys(import.meta.glob(["/src/**/balance.*.test.ts", "/src/**/*.sim.test.ts"])));
const finale = relative(Object.keys(import.meta.glob(["/src/**/cinderRoad6.sim.test.ts", "/src/**/cinderRoad6.*.sim.test.ts", "/src/**/balance.cinderRoad6.test.ts"])));
const balance = heavy.filter((file) => !finale.includes(file));

describe("test suites", () => {
  it("routes by file name: the globs and isBalanceTest / isFinaleTest pick the same files", () => {
    expect(everyTest.filter(isBalanceTest)).toEqual(balance);
    expect(everyTest.filter(isFinaleTest)).toEqual(finale);
  });

  it("every heavy file runs in exactly one of test:balance and test:finale; the rest run in npm test", () => {
    for (const file of heavy) expect(isBalanceTest(file) !== isFinaleTest(file), file).toBe(true);
    for (const file of everyTest.filter((item) => !heavy.includes(item))) expect(isBalanceTest(file) || isFinaleTest(file), file).toBe(false);
  });

  it("sends every battle's guardrail smoke and the simulation suites to a heavy suite, the finale's to test:finale", () => {
    expect(heavy.filter((file) => /\/balance\.[^/]+\.test\.ts$/.test(file))).toHaveLength(GUARDRAIL_SCENARIO_IDS.length);
    for (const file of [
      "src/game/campaign/cinderRoad2.roles.recommended.sim.test.ts",
      "src/game/campaign/cinderRoad2.roles.carried-greedy.sim.test.ts",
      "src/game/campaign/cinderRoad2.sim.test.ts",
      "src/game/engine/holdForDawn.sim.test.ts",
    ]) {
      expect(balance).toContain(file);
    }
    for (const file of ["src/game/engine/balance.cinderRoad6.test.ts", "src/game/campaign/cinderRoad6.roles.recommended.sim.test.ts", "src/game/campaign/cinderRoad6.sim.test.ts"]) {
      expect(finale).toContain(file);
    }
    // The engine's own balance unit tests (and the per-battle coverage check) stay fast.
    expect(isBalanceTest("src/game/engine/balance.test.ts") || isFinaleTest("src/game/engine/balance.test.ts")).toBe(false);
    expect(isFinaleTest("src/game/campaign/cinderRoad6.test.ts")).toBe(false);
  });
});
