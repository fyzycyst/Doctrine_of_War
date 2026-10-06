// The three test suites (docs/CAMPAIGN.md, "Test suites"). Simulation-heavy files run under
// `npm run test:balance`, the finale's under `npm run test:finale`, everything else under
// `npm test`; the routing is by file name:
// - `balance.<battle>.test.ts`: a battle's guardrail smoke (one per battle, guardrails.testkit.ts);
// - `*.sim.test.ts`: any other suite that plays many battles (role sweeps, ablations over ~5 s);
// - the finale's (`cinderRoad6[.*].sim.test.ts` and `balance.cinderRoad6.test.ts`) go to
//   test:finale instead: a 19-squad, 9-phase battle costs about four ordinary games, and
//   would push test:balance past its ~120 s budget.
// Long synchronous simulations starve vitest's worker RPC under machine load ("Timeout calling
// onTaskUpdate"), so they stay out of the fast suite.
export const FINALE_TEST_GLOBS = ["src/**/cinderRoad6.sim.test.ts", "src/**/cinderRoad6.*.sim.test.ts", "src/**/balance.cinderRoad6.test.ts"];
export const BALANCE_TEST_GLOBS = ["src/**/balance.*.test.ts", "src/**/*.sim.test.ts"];

/** Whether a test file (path relative to the repository root) belongs to `npm run test:finale`. */
export function isFinaleTest(file: string): boolean {
  const name = file.split("/").pop() ?? file;
  return file.startsWith("src/") && (/^cinderRoad6\.([^/]+\.)?sim\.test\.tsx?$/.test(name) || name === "balance.cinderRoad6.test.ts");
}

/** Whether a test file (path relative to the repository root) belongs to `npm run test:balance`. */
export function isBalanceTest(file: string): boolean {
  const name = file.split("/").pop() ?? file;
  return file.startsWith("src/") && !isFinaleTest(file) && (/^balance\.[^/]+\.test\.tsx?$/.test(name) || /\.sim\.test\.tsx?$/.test(name));
}
