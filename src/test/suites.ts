// The three test suites (docs/CAMPAIGN.md, "Test suites"). Simulation-heavy files run under
// `npm run test:balance` or `npm run test:campaign`, everything else under `npm test`; the
// routing is by file name:
// - `balance.<battle>.test.ts`: a battle's guardrail smoke (one per battle, guardrails.testkit.ts);
// - `*.sim.test.ts`: any other suite that plays many battles (role sweeps, ablations over ~5 s);
// - the heaviest campaign sweeps go to test:campaign instead, to keep test:balance near ~90 s
//   (its budget is ~120 s): the finale's (`cinderRoad6[.*].sim.test.ts` and
//   `balance.cinderRoad6.test.ts`: a 19-squad, 14-phase battle costs about four ordinary games)
//   and the harrying battle's role census (`cinderRoad5.roles.<call>.sim.test.ts`: 64 combinations x
//   40 seeds x 3 musters per call). Its ablation and guardrail smoke stay in test:balance.
// Long synchronous simulations starve vitest's worker RPC under machine load ("Timeout calling
// onTaskUpdate"), so they stay out of the fast suite.
export const CAMPAIGN_TEST_GLOBS = ["src/**/cinderRoad6.sim.test.ts", "src/**/cinderRoad6.*.sim.test.ts", "src/**/balance.cinderRoad6.test.ts", "src/**/cinderRoad5.roles.*.sim.test.ts"];
export const BALANCE_TEST_GLOBS = ["src/**/balance.*.test.ts", "src/**/*.sim.test.ts"];

/** Whether a test file (path relative to the repository root) belongs to `npm run test:campaign`. */
export function isCampaignTest(file: string): boolean {
  const name = file.split("/").pop() ?? file;
  return (
    file.startsWith("src/") &&
    (/^cinderRoad6\.([^/]+\.)?sim\.test\.tsx?$/.test(name) || name === "balance.cinderRoad6.test.ts" || /^cinderRoad5\.roles\.[^/]+\.sim\.test\.tsx?$/.test(name))
  );
}

/** Whether a test file (path relative to the repository root) belongs to `npm run test:balance`. */
export function isBalanceTest(file: string): boolean {
  const name = file.split("/").pop() ?? file;
  return file.startsWith("src/") && !isCampaignTest(file) && (/^balance\.[^/]+\.test\.tsx?$/.test(name) || /\.sim\.test\.tsx?$/.test(name));
}
