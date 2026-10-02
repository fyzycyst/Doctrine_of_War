import { Flag, Home, Swords } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { currentBattle, type CampaignCompany } from "../../game/campaign";
import { CampaignMap } from "../../render/showcase/CampaignMap";
import { resolveRank } from "../game/view";
import { ConditionBadge } from "../roll/CallTheBanners";
import { ExperimentalBadge } from "../ui/DoctrineCard";
import { FrameProbe } from "../ui/FrameProbe";
import { RoleGlyph, ROLE_NAME } from "../ui/glyphs";
import { battleTitle, isPlayable, ledger, mapBattles, OUTCOME_WORD, scenarioFor } from "./campaignView";
import { useFlow } from "./flowStore";
import { useShowSeed } from "../settingsStore";

const STATUS_WORD = {
  locked: "Not yet reached",
  current: "Next battle",
  won: "Won",
  stalemate: "Held to a stalemate",
  lost: "Lost; fight it again",
} as const;

/** The war as an archipelago, with the army ledger and the chronicle of results. */
export function CampaignScreen({ onSettings }: { onSettings?: () => void }) {
  const showSeed = useShowSeed();
  const definition = useFlow((s) => s.definition);
  const campaign = useFlow((s) => s.campaign);
  const notice = useFlow((s) => s.notice);
  const saveError = useFlow((s) => s.saveError);
  const openBattle = useFlow((s) => s.openBattle);
  const go = useFlow((s) => s.go);
  const primary = useRef<HTMLButtonElement>(null);

  const battles = useMemo(() => (campaign ? mapBattles(definition, campaign) : []), [definition, campaign]);
  const next = campaign ? currentBattle(definition, campaign) : null;
  const playable = Boolean(campaign && next && isPlayable(definition, campaign, next.id));
  useEffect(() => primary.current?.focus({ preventScroll: true }), [next?.id]);

  if (!campaign) {
    return null;
  }
  const { companies, mustering } = ledger(definition, campaign);
  const lostLast = campaign.history.at(-1)?.outcome === "defeat";

  return (
    <div className="screen campaign-screen">
      <CampaignMap battles={battles} onSelect={openBattle} inCanvas={<FrameProbe />}>
        <header className="campaign-head">
          <p className="bar-stage">The campaign</p>
          <h1>{definition.title}</h1>
        </header>

        <aside className={`panel ledger ${companies.length > 8 ? "dense" : ""}`} aria-labelledby="ledger-title">
          <h2 id="ledger-title">Army ledger</h2>
          {mustering && <p className="quiet">Mustering for {next?.title}</p>}
          <ul>
            {companies.map((company) => (
              <LedgerRow key={company.id} company={company} />
            ))}
          </ul>
        </aside>

        <aside className="panel war-chronicle" aria-labelledby="war-title">
          <h2 id="war-title">The war so far</h2>
          <nav aria-label="Battles">
            <ol className="battle-list">
              {battles.map((battle) => (
                <li key={battle.id} className={`island-${battle.status}`}>
                  <span className="battle-name">{battleTitle(definition, battle.id)}</span>
                  <span className="battle-status">
                    {scenarioFor(definition.battles.find((item) => item.id === battle.id)!) ? STATUS_WORD[battle.status] : "Coming soon"}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
          {campaign.history.length > 0 && (
            // Late in the war the full record would cover the islands: fold it away.
            <details className="results" open={campaign.history.length < 3}>
              <summary>
                Results <span className="mono">({campaign.history.length})</span>
              </summary>
              <ol className="history">
                {campaign.history.map((record, index) => (
                  <li key={index} className={`outcome-${record.outcome}`}>
                    <span className="history-title">
                      {battleTitle(definition, record.battleId)}
                      {record.attempt > 1 && <span className="attempt"> · attempt {record.attempt}</span>}
                      {record.customOrders && <ExperimentalBadge small />}
                    </span>
                    <span className="history-line">
                      <strong>{OUTCOME_WORD[record.outcome]}</strong> · {record.companiesBroken} of yours broken · {record.enemyBroken} of theirs
                      {showSeed && (
                        <>
                          {" "}
                          · seed <span className="mono">#{record.seed}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </aside>

        <div className="campaign-actions">
          {(notice || saveError) && (
            <p className="campaign-notice" role="status">
              {notice ?? saveError}
            </p>
          )}
          {next && playable ? (
            <button ref={primary} type="button" className="btn-command" onClick={() => openBattle(next.id)}>
              <Swords size={15} aria-hidden="true" /> {lostLast ? `Fight ${next.title} again` : `Take the field: ${next.title}`}
            </button>
          ) : (
            <button ref={primary} type="button" className="btn-command" onClick={() => go("ending")}>
              <Flag size={15} aria-hidden="true" /> {next ? "Read the chronicle so far" : "Read the epilogue"}
            </button>
          )}
          <div className="campaign-minor">
            <button type="button" className="btn-quiet" onClick={() => go("title")}>
              <Home size={14} aria-hidden="true" /> Title screen
            </button>
            {onSettings && (
              <button type="button" className="btn-quiet" onClick={onSettings}>
                Settings
              </button>
            )}
          </div>
        </div>
      </CampaignMap>
    </div>
  );
}

export function LedgerRow({ company }: { company: CampaignCompany }) {
  const broken = company.casualties.routed + company.casualties.destroyed;
  return (
    <li
      className="ledger-row"
      title={`${company.name} · ${resolveRank(company.resolve)} ${company.resolve > 0 ? "+" : ""}${company.resolve}${company.renown ? ` · “${company.renown.title}”` : ""} · ${company.battlesFought} ${company.battlesFought === 1 ? "battle" : "battles"}`}
    >
      <span className="ledger-glyph" title={ROLE_NAME[company.role]}>
        <RoleGlyph role={company.role} size={16} />
      </span>
      <span className="ledger-body">
        <span className="ledger-name">{company.name}</span>
        <span className="ledger-sub">
          <span className="rank">
            {resolveRank(company.resolve)} {company.resolve > 0 ? "+" : ""}
            {company.resolve}
          </span>
          {company.renown && <span className="renown"> “{company.renown.title}”</span>}
          {company.condition && company.condition !== "fresh" && (
            <>
              {" "}
              <ConditionBadge condition={company.condition} />
            </>
          )}
          <span className="ledger-stats">
            {" · "}
            {company.battlesFought} {company.battlesFought === 1 ? "battle" : "battles"}
            {broken > 0 && ` · broken ${broken}×`}
            {company.reformed > 0 && ` · reformed ${company.reformed}×`}
          </span>
        </span>
      </span>
    </li>
  );
}
