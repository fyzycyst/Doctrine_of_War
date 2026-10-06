// The two test suites (docs/CAMPAIGN.md, "Two test suites"). Simulation-heavy files run
// under `npm run test:balance`, everything else under `npm test`; the routing is by file name:
// - `balance.<battle>.test.ts`: a battle's guardrail smoke (one per battle, guardrails.testkit.ts);
// - `*.sim.test.ts`: any other suite that plays many battles (role sweeps, ablations over ~5 s).
// Long synchronous simulations starve vitest's worker RPC under machine load ("Timeout calling
// onTaskUpdate"), so they stay out of the fast suite.
export const BALANCE_TEST_GLOBS = ["src/**/balance.*.test.ts", "src/**/*.sim.test.ts"];

/** Whether a test file (path relative to the repository root) belongs to `npm run test:balance`. */
export function isBalanceTest(file: string): boolean {
  const name = file.split("/").pop() ?? file;
  return file.startsWith("src/") && (/^balance\.[^/]+\.test\.tsx?$/.test(name) || /\.sim\.test\.tsx?$/.test(name));
}
