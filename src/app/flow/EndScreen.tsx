import { useEffect, useRef } from "react";
import { ashAndBanner, currentBattle } from "../../game/campaign";
import { TitleScene } from "../../render/showcase/TitleScene";
import { FrameProbe } from "../ui/FrameProbe";
import { battleTitle, OUTCOME_WORD } from "./campaignView";
import { LedgerRow } from "./CampaignScreen";
import { useCaptureStore } from "../captureStore";
import { useFlow } from "./flowStore";

/**
 * The campaign's end: the epilogue and the final ledger once Hold for Dawn is won,
 * or, while later battles are still being built, the chronicle so far.
 */
export function EndScreen() {
  const definition = useFlow((s) => s.definition);
  const campaign = useFlow((s) => s.campaign);
  const go = useFlow((s) => s.go);
  const begin = useFlow((s) => s.beginCampaign);
  const primary = useRef<HTMLButtonElement>(null);
  const captureMode = useCaptureStore((s) => s.captureMode);
  useEffect(() => primary.current?.focus({ preventScroll: true }), [captureMode]);

  if (!campaign) return null;
  const next = currentBattle(definition, campaign);
  const complete = !next;
  // The epilogue and "Begin a new campaign" are the intro's own; other campaigns (M1) close
  // on their own name and send the player back to Choose a campaign, never into the intro.
  const intro = definition.id === ashAndBanner.id;
  const fought = campaign.history.length;
  const renowned = campaign.companies.filter((company) => company.renown);

  return (
    <div className="screen end-screen">
      <TitleScene
        title={complete ? (intro ? "THE DAWN HOLDS" : "THE FIELD IS WON") : "THE WAR GOES ON"}
        subtitle={definition.title}
        inCanvas={<FrameProbe />}
      />
      {!captureMode && (
      <section className="panel epilogue" aria-labelledby="epilogue-title">
        <h2 id="epilogue-title">{complete ? "Epilogue" : "The chronicle so far"}</h2>
        <p className="epilogue-text">
          {complete && intro
            ? "Dawn came grey over the last wall. The Ashen Host broke against standing orders it could never read, and every banner that held was one you sealed."
            : complete
              ? `${definition.title} is won: ${fought} ${fought === 1 ? "battle" : "battles"} fought, and every company called to it is remembered below.`
              : `${next.title} waits beyond the fog; that road is still being made. Your companies rest, carry their Resolve forward, and sharpen their orders for what comes next.`}
        </p>
        {renowned.length > 0 && (
          <p className="epilogue-renown">
            Remembered by name: {renowned.map((company) => `${company.name}, “${company.renown!.title}”`).join("; ")}.
          </p>
        )}
        <div className="epilogue-columns">
          <div>
            <h3>Final ledger</h3>
            <ul className="end-ledger">
              {campaign.companies.map((company) => (
                <LedgerRow key={company.id} company={company} />
              ))}
            </ul>
          </div>
          <div>
            <h3>Battles</h3>
            <ol className="history">
              {campaign.history.map((record, index) => (
                <li key={index} className={`outcome-${record.outcome}`}>
                  <span className="history-title">{battleTitle(definition, record.battleId)}</span>
                  <span className="history-line">
                    <strong>{OUTCOME_WORD[record.outcome]}</strong>
                    {record.attempt > 1 && ` · attempt ${record.attempt}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="modal-actions">
          {complete ? (
            <button ref={primary} type="button" className="btn-command" onClick={() => go("title")}>
              Title screen
            </button>
          ) : (
            <button ref={primary} type="button" className="btn-command" onClick={() => go("campaign")}>
              Return to the campaign map
            </button>
          )}
          {complete && intro ? (
            <button type="button" className="btn-quiet" onClick={() => void begin()}>
              Begin a new campaign
            </button>
          ) : complete ? (
            <button type="button" className="btn-quiet" onClick={() => go("campaigns")}>
              Choose a campaign
            </button>
          ) : (
            <button type="button" className="btn-quiet" onClick={() => go("title")}>
              Title screen
            </button>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
