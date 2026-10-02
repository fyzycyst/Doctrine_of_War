import { useEffect, useRef } from "react";
import { playSting } from "../../audio";
import { scenarios } from "../../game/engine";
import { currentBattle } from "../../game/campaign";
import type { VisibleSquad } from "../../game/engine";
import { useFlow } from "../flow/flowStore";
import { ConditionBadge } from "../roll/CallTheBanners";
import { useGame } from "../game/gameStore";
import { resolveRank } from "../game/view";
import { Modal, rosterFocus } from "./Modal";
import { ObjectiveStatus } from "./PhaseReport";
import { useShowSeed } from "../settingsStore";

const OUTCOME: Record<string, { word: string; line: string }> = {
  victory: { word: "Victory", line: "The banners still stand." },
  defeat: { word: "Defeat", line: "The line is broken." },
  stalemate: { word: "Stalemate", line: "Neither side can claim the field." },
};

export function Outcome() {
  const showSeed = useShowSeed();
  const view = useGame((s) => s.view);
  const log = useGame((s) => s.log);
  const scenario = useGame((s) => s.scenario);
  const retry = useGame((s) => s.retry);
  const loadBattle = useGame((s) => s.loadBattle);
  const first = useRef<HTMLButtonElement>(null);
  const gameCampaign = useGame((s) => s.campaign);
  const campaign = useFlow((s) => s.campaign);
  const definition = useFlow((s) => s.definition);
  const record = useFlow((s) => s.lastRecord);
  const saveError = useFlow((s) => s.saveError);
  const retryBattle = useFlow((s) => s.retryBattle);
  const leaveBattle = useFlow((s) => s.leaveBattle);
  const inCampaign = Boolean(gameCampaign && campaign);
  const campaignOver = Boolean(campaign && !currentBattle(definition, campaign));

  const status = String(view.status);
  const won = status !== "defeat";
  // The outcome's stinger, once as the screen appears. A stalemate stays silent: the score carries it.
  const stung = useRef(false);
  useEffect(() => {
    if (stung.current) return;
    stung.current = true;
    if (status === "victory" || status === "defeat") playSting(status);
    // Once per outcome screen, whatever re-renders follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const copy = OUTCOME[status] ?? { word: status, line: "" };
  const outcomeEvent = log
    .flatMap((entry) => entry.events)
    .find((event) => event.kind === "outcome");
  const reason = outcomeEvent?.kind === "outcome" ? outcomeEvent.reason : copy.line;
  const mine = view.squads.filter((squad) => squad.faction === view.viewer);
  const tally = companyTally(mine);

  // Standalone battles (dev picker): Continue opens the next scenario's briefing.
  const index = scenarios.findIndex((item) => item.id === scenario.id);
  const next = scenarios[index + 1];
  const onContinue = () => {
    const target = next ?? scenarios[0];
    loadBattle(target, { seed: target.curatedSeed ?? 1, fortune: "on" });
  };

  return (
    <Modal className={`outcome outcome-${status}`} labelledBy="outcome-title" initialFocus={first} returnFocus={rosterFocus}>
      <p className="report-eyebrow">{scenario.title}</p>
      <h2 id="outcome-title">{copy.word}</h2>
      <p className="outcome-reason">{reason}</p>
      <p className="outcome-tally">{tally}</p>
      <ObjectiveStatus />
      {inCampaign && record && <ResolveChanges />}
      <p className="report-meta">
        Fortune {view.fortune}
        {showSeed && (
          <>
            {" "}
            · seed <span className="mono">#{view.seed}</span>
          </>
        )}
        {inCampaign && (saveError ? <span className="save-error"> · {saveError}</span> : " · campaign saved")}
      </p>
      {inCampaign ? (
        <div className="outcome-actions">
          {won ? (
            <button ref={first} type="button" className="btn-command" onClick={leaveBattle}>
              {campaignOver ? "Read the epilogue" : "Return to the campaign map"}
            </button>
          ) : (
            <>
              <button ref={first} type="button" className="btn-command" onClick={() => retryBattle("same")}>
                Fight it again
              </button>
              <button type="button" className="btn-quiet" onClick={() => retryBattle("new")}>
                Again, new fortune
              </button>
              <button type="button" className="btn-quiet" onClick={leaveBattle}>
                Return to the campaign map
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="outcome-actions">
          {/* After a defeat the next move is a retry; otherwise it is moving on. */}
          <button ref={won ? undefined : first} type="button" className={won ? "btn-quiet" : "btn-command"} onClick={() => retry("same")}>
            Retry, same fortune
          </button>
          <button type="button" className="btn-quiet" onClick={() => retry("new")}>
            Retry, new fortune
          </button>
          <button ref={won ? first : undefined} type="button" className={won ? "btn-command" : "btn-quiet"} onClick={onContinue}>
            {next ? `Continue to ${next.title}` : "Continue"}
          </button>
        </div>
      )}
    </Modal>
  );
}

/** How each company's Resolve moved in this battle, from the campaign record. */
function ResolveChanges() {
  const record = useFlow((s) => s.lastRecord);
  const campaign = useFlow((s) => s.campaign);
  // Roll campaigns: conditions before the battle (the state it was fought from) and after.
  const before = useGame((s) => s.campaign?.state);
  if (!record || !campaign) return null;
  const conditionOf = (state: typeof campaign | undefined, id: string) => state?.companies.find((item) => item.id === id)?.condition ?? "fresh";
  const roll = Boolean(record.assignment);
  const rested = roll
    ? campaign.companies.filter((company) => !record.companies.some((result) => result.companyId === company.id) && conditionOf(before, company.id) !== "fresh" && company.condition === "fresh")
    : [];
  return (
    <>
    <ul className="resolve-changes" aria-label="Resolve after the battle">
      {record.companies.map((result) => {
        const company = campaign.companies.find((item) => item.id === result.companyId);
        const delta = result.resolveAfter - result.resolveBefore;
        const was = conditionOf(before, result.companyId);
        const now = company?.condition;
        if (result.levy) {
          return (
            <li key={result.squadId}>
              <span className="rc-name">Levy</span>
              <span className="rc-rank">no ready company: raised for this battle, then disbanded</span>
            </li>
          );
        }
        return (
          <li key={result.companyId}>
            <span className="rc-name">
              {company?.name ?? result.companyId}
              {roll && now && now !== was && (
                <span className="rc-condition">
                  {" "}
                  <ConditionBadge condition={now} />
                </span>
              )}
            </span>
            <span className="rc-rank">
              {resolveRank(result.resolveBefore)}
              {delta !== 0 && <> → {resolveRank(result.resolveAfter)}</>}
            </span>
            <span className={`chip-stat ${delta > 0 ? "gain" : delta < 0 ? "loss" : "neutral"}`}>
              {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "±0"} Resolve
            </span>
            {result.renownEarned && <span className="renown">earned “{result.renownEarned}”</span>}
          </li>
        );
      })}
    </ul>
    {rested.length > 0 && (
      <p className="rc-rested">
        Rested in reserve, fresh again: {rested.map((company) => company.name).join(", ")}.
      </p>
    )}
    </>
  );
}

/**
 * How the companies ended, in words. Escaped companies are a success, not a loss, and
 * a noncombatant charge (the Column) is reported on its own, not counted as a company.
 */
export function companyTally(squads: VisibleSquad[]): string {
  const companies = squads.filter((squad) => !squad.noncombatant);
  const count = (status: VisibleSquad["status"]) => companies.filter((squad) => squad.status === status).length;
  const standing = count("active");
  const escaped = count("escaped");
  const lost = companies.length - standing - escaped;
  const parts = escaped > 0
    ? [`${escaped} ${escaped === 1 ? "company" : "companies"} escaped`, standing > 0 ? `${standing} still on the field` : "", lost > 0 ? `${lost} lost` : ""]
    : [`${standing} of ${companies.length} companies still standing`];
  const ward = squads.find((squad) => squad.noncombatant);
  if (ward) {
    parts.unshift(ward.status === "escaped" ? "The Column is safe" : ward.status === "active" ? "The Column is still on the field" : "The Column was lost");
  }
  return parts.filter(Boolean).join(" · ");
}
