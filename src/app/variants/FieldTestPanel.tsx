// "Test in the field" (T16): the editor's panel. It replays this battle from its start
// in a Web Worker, base doctrine against the variant on the same fortunes, for as many
// battles as it takes (within a budget), and says only what the evidence supports.
// Cancellable; progress shows as it runs.
import { FlaskConical, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ashAndBanner, currentBattle } from "../../game/campaign";
import { doctrineLibrary, scenarios, withVariants, type Doctrine, type EngineScenario } from "../../game/engine";
import { useFlow } from "../flow/flowStore";
import { applyDeployment } from "../game/deploy";
import { useGame } from "../game/gameStore";
import { rosterName } from "../game/view";
import {
  advanceRate,
  FIELD_TEST_MAX,
  FIELD_TEST_MIN,
  verdict,
  winRate,
  type ArmResult,
  type FieldTestInput,
  type FieldTestResult,
} from "./fieldTest";
import { FieldTestCancelled, startFieldTest, type FieldTestRun } from "./fieldTestClient";

type Plan = { ok: true; input: FieldTestInput; names: string[] } | { ok: false; reason: string };

/** The field test for this battle as it stands: who switches doctrine, and everyone else's current orders. */
function planFor(baseId: string, variant: Doctrine, squadId?: string): Plan {
  const { scenario, deployment, setup, view, orders, variants } = useGame.getState();
  const base = doctrineLibrary[baseId];
  const others = variants.filter((item) => item.variant.id !== variant.id);
  const played = withVariants(scenario, [...others, { variant: { id: variant.id, baseId }, doctrine: variant }], doctrineLibrary);
  if (!played.scenario.playerDoctrineIds.includes(variant.id)) {
    return { ok: false, reason: `${base.name} is not among this battle's doctrines, so its variant cannot be fielded here.` };
  }
  const companies = view.squads.filter((squad) => squad.faction === view.viewer && !squad.noncombatant);
  const current = Object.fromEntries(companies.map((squad) => [squad.id, orders[squad.id] ?? squad.doctrineId ?? baseId]));
  const switching = squadId
    ? companies.filter((squad) => squad.id === squadId)
    : companies.filter((squad) => current[squad.id] === baseId || current[squad.id] === variant.id);
  if (switching.length === 0) {
    return { ok: false, reason: `No company is on ${base.name} right now. Open the editor from a company's hand to test it there.` };
  }
  return {
    ok: true,
    names: switching.map(rosterName),
    input: {
      scenario: applyDeployment(played.scenario, deployment),
      doctrines: played.doctrines,
      orders: current,
      squadIds: switching.map((squad) => squad.id),
      baseId,
      variantId: variant.id,
      firstSeed: setup.seed,
    },
  };
}

/** The campaign's battles, in order, as the editor can field them outside a battle. */
const BATTLES = ashAndBanner.battles
  .filter((battle) => !battle.placeholder)
  .map((battle) => ({ battle, scenario: scenarios.find((item) => item.id === battle.scenarioId) }))
  .filter((item): item is { battle: (typeof ashAndBanner.battles)[number]; scenario: EngineScenario } => Boolean(item.scenario));

/** The companies that can be ordered in an authored battle. */
const companiesOf = (scenario: EngineScenario) => scenario.squads.filter((squad) => squad.faction === scenario.playerFaction && !squad.noncombatant);

/** The company to field by default: the first the battle's reference plan puts on this doctrine. */
function defaultCompany(scenario: EngineScenario, baseId: string): string {
  const intended = scenario.referencePlans?.intended ?? {};
  const companies = companiesOf(scenario);
  return (companies.find((squad) => (intended[squad.id] ?? squad.doctrineId) === baseId) ?? companies[0]).id;
}

/**
 * Outside a battle (the title screen, Settings): an authored battle from its start, as
 * authored, with the battle's reference plan for every other company and the chosen
 * company switching between the doctrine and the variant.
 */
function planOutside(scenario: EngineScenario, baseId: string, variant: Doctrine, squadId: string): Plan {
  const base = doctrineLibrary[baseId];
  const played = withVariants(scenario, [{ variant: { id: variant.id, baseId }, doctrine: variant }], doctrineLibrary);
  if (!played.scenario.playerDoctrineIds.includes(variant.id)) {
    return { ok: false, reason: `${base.name} is not among this battle's doctrines, so its variant cannot be fielded here.` };
  }
  const intended = scenario.referencePlans?.intended ?? {};
  const companies = companiesOf(scenario);
  const company = companies.find((squad) => squad.id === squadId) ?? companies[0];
  return {
    ok: true,
    names: [company.name],
    input: {
      scenario: played.scenario,
      doctrines: played.doctrines,
      orders: Object.fromEntries(companies.map((squad) => [squad.id, intended[squad.id] ?? squad.doctrineId])),
      squadIds: [company.id],
      baseId,
      variantId: variant.id,
      firstSeed: scenario.curatedSeed ?? 1,
    },
  };
}

const list = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

export function FieldTestPanel({ baseId, variant, squadId, edited }: { baseId: string; variant: Doctrine; squadId?: string; edited: boolean }) {
  // In a battle: this battle as it stands. Elsewhere: a battle picked here, from its start.
  const onBattleScreen = useFlow((s) => s.screen === "battle");
  const planning = useGame((s) => s.stage === "command" || s.stage === "deploy");
  const inBattle = onBattleScreen && planning;
  const flowCampaign = useFlow((s) => s.campaign);
  const battleTitle = useGame((s) => s.baseScenario.title);
  const battleScenario = useGame((s) => s.scenario);
  const allowed = BATTLES.filter((item) => item.scenario.playerDoctrineIds.includes(baseId));
  const campaignNext = flowCampaign ? currentBattle(ashAndBanner, flowCampaign)?.scenarioId : undefined;
  const [pickedBattle, setPickedBattle] = useState<string | null>(null);
  const [pickedCompany, setPickedCompany] = useState<string | null>(null);
  const outside =
    allowed.find((item) => item.scenario.id === pickedBattle) ??
    allowed.find((item) => item.scenario.id === campaignNext) ??
    allowed.find((item) => item.scenario.id === "first_breach") ??
    allowed[0];
  const outsideCompany =
    outside && companiesOf(outside.scenario).some((squad) => squad.id === pickedCompany) ? pickedCompany! : outside ? defaultCompany(outside.scenario, baseId) : "";
  const title = inBattle ? battleTitle : (outside?.battle.title ?? "");
  const scenario = inBattle ? battleScenario : (outside?.scenario ?? battleScenario);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<{ result: FieldTestResult; rules: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef<FieldTestRun | null>(null);
  const base = doctrineLibrary[baseId];
  const plan: Plan = inBattle
    ? planFor(baseId, variant, squadId)
    : outside
      ? planOutside(outside.scenario, baseId, variant, outsideCompany)
      : { ok: false, reason: `No battle in the campaign offers ${base.name}.` };
  const rules = JSON.stringify(variant.rules);

  // Closing the editor stops a test in flight.
  useEffect(() => () => run.current?.cancel(), []);

  /**
   * Runs the test. With `from`, runs longer: the same seed sequence continues from where
   * that result stopped, and the earlier result stays on screen until the new one lands.
   */
  const start = (from?: FieldTestResult) => {
    if (!plan.ok) return;
    if (!from) setOutcome(null);
    setError(null);
    setProgress({ done: from?.runs ?? 0, total: (from?.runs ?? 0) + FIELD_TEST_MAX });
    const current = startFieldTest({ ...plan.input, ...(from ? { from } : {}) }, (done, total) => setProgress({ done, total }));
    run.current = current;
    current.result.then(
      (result) => {
        if (run.current !== current) return;
        run.current = null;
        setProgress(null);
        setOutcome({ result, rules, name: variant.name });
      },
      (reason: unknown) => {
        if (run.current !== current) return;
        run.current = null;
        setProgress(null);
        if (!(reason instanceof FieldTestCancelled)) setError(`The field test could not run (${reason instanceof Error ? reason.message : "unknown error"}).`);
      },
    );
  };

  const cancel = () => {
    const current = run.current;
    run.current = null;
    current?.cancel();
    setProgress(null);
  };

  const said = outcome ? verdict(outcome.result, scenario) : null;

  return (
    <section className="field-test" aria-labelledby="field-test-title">
      <header className="field-test-head">
        <h3 id="field-test-title">
          <FlaskConical size={16} aria-hidden="true" /> Test in the field
        </h3>
        {progress ? (
          <div className="field-test-run">
            <progress value={progress.done} max={progress.total} aria-label="Field test progress" />
            <span className="mono" aria-live="polite">
              {progress.done} of up to {progress.total}
            </span>
            <button type="button" className="btn-quiet" onClick={cancel}>
              <X size={14} aria-hidden="true" /> Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn-quiet" disabled={!plan.ok || !edited} onClick={() => start()}>
            {outcome ? "Run again" : "Run the test"}
          </button>
        )}
      </header>
      {!inBattle && outside && (
        <div className="field-test-pick">
          <label>
            <span>Battle</span>
            <select
              value={outside.scenario.id}
              onChange={(event) => {
                setPickedBattle(event.target.value);
                setPickedCompany(null);
              }}
            >
              {BATTLES.map(({ battle, scenario: option }) => {
                const offered = option.playerDoctrineIds.includes(baseId);
                return (
                  <option key={option.id} value={option.id} disabled={!offered}>
                    {battle.title}
                    {offered ? "" : ` (no ${base.name})`}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span>Company</span>
            <select value={outsideCompany} onChange={(event) => setPickedCompany(event.target.value)}>
              {companiesOf(outside.scenario).map((squad) => (
                <option key={squad.id} value={squad.id}>
                  {squad.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p className="field-test-scope">
        {plan.ok && inBattle && (
          <>
            Replays <strong>{title}</strong> <strong>from the start of this battle</strong>, as deployed, with fortune on: {list(plan.names)} on{" "}
            {base.name}, then on your variant, over the same fortunes. It plays {FIELD_TEST_MIN} to {FIELD_TEST_MAX} battles (a few seconds) and stops
            early once the difference is plain. Every other company keeps its current orders all battle.
          </>
        )}
        {plan.ok && !inBattle && (
          <>
            Replays <strong>{title}</strong> <strong>from its start</strong>, as the battle is set out, with fortune on: {list(plan.names)} on{" "}
            {base.name}, then on your variant, over the same fortunes. Every other company follows the battle's reference plan. It plays{" "}
            {FIELD_TEST_MIN} to {FIELD_TEST_MAX} battles (a few seconds) and stops early once the difference is plain.
          </>
        )}
        {!plan.ok && plan.reason}
        {plan.ok && !edited && " Change an order or a threshold first."}
      </p>
      {error && (
        <p className="field-test-error" role="alert">
          {error}
        </p>
      )}
      {outcome && said && (
        <div className="field-test-result" role="status">
          <p className={`field-test-verdict ${said.tone}`}>{said.headline}</p>
          <p className="field-test-detail">{said.detail}</p>
          <ul className="field-test-bars" aria-label="Win rate">
            <WinBar name={base.name} arm={outcome.result.base} runs={outcome.result.runs} />
            <WinBar name={outcome.name} arm={outcome.result.variant} runs={outcome.result.runs} mine />
          </ul>
          <p className="field-test-note">
            {[said.pairs, outcome.result.stoppedBy === "clear" ? "Stopped early: the difference was plain." : null, "Advanced: won or held to a stalemate, so the campaign moves on."]
              .filter(Boolean)
              .join(" ")}
            {outcome.rules !== rules && <strong> These results are for your previous cut.</strong>}
          </p>
          {/* A big battle may run out of budget before the difference is settled: allow one more. */}
          {/* One extra budget per result: its final look is held to a stricter bar (fieldTest.ts). */}
          {!progress && !outcome.result.extended && outcome.rules === rules && (said.tone === "slightly-better" || said.tone === "slightly-worse") && (
            <p className="field-test-longer">
              <button type="button" className="btn-quiet" onClick={() => start(outcome.result)}>
                Run longer
              </button>
              <span>Up to {FIELD_TEST_MAX} more battles, continuing the same fortunes.</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** One side's win rate as a bar, its advance rate beside it. */
function WinBar({ name, arm, runs, mine = false }: { name: string; arm: ArmResult; runs: number; mine?: boolean }) {
  const won = winRate(arm, runs);
  return (
    <li className={mine ? "mine" : ""}>
      <span className="bar-name">{name}</span>
      <span className="bar-track" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${won}%` }} />
      </span>
      <span className="bar-value">
        {won}% won <span className="bar-sub">· {advanceRate(arm, runs)}% advanced</span>
      </span>
    </li>
  );
}
