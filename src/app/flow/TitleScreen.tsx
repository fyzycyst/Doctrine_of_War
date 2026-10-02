import { useEffect, useRef, useState } from "react";
import { currentBattle } from "../../game/campaign";
import { TitleScene } from "../../render/showcase/TitleScene";
import { FrameProbe } from "../ui/FrameProbe";
import { Modal } from "../ui/Modal";
import { useFlow } from "./flowStore";

/** The title: the First Breach crane shot with the main menu laid over it. */
export function TitleScreen({ onSettings, onHowTo, onEditor }: { onSettings?: () => void; onHowTo?: () => void; onEditor?: () => void }) {
  const save = useFlow((s) => s.save);
  const checkSave = useFlow((s) => s.checkSave);
  const begin = useFlow((s) => s.beginCampaign);
  const continueCampaign = useFlow((s) => s.continueCampaign);
  const go = useFlow((s) => s.go);
  const [confirming, setConfirming] = useState(false);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void checkSave();
  }, [checkSave]);
  useEffect(() => first.current?.focus({ preventScroll: true }), [save]);

  const canContinue = save === "valid";
  const continueNote =
    save === "checking" ? "Looking for a saved campaign…" : save === "invalid" ? "The saved campaign could not be read" : save === "none" ? "No saved campaign yet" : null;

  return (
    <div className="screen title-screen">
      <TitleScene inCanvas={<FrameProbe />}>
        <nav className="title-menu" aria-label="Main menu">
          {canContinue && (
            <button ref={first} type="button" className="btn-command" onClick={() => void continueCampaign()}>
              Continue
              <ContinueNote />
            </button>
          )}
          <button
            ref={canContinue ? undefined : first}
            type="button"
            className={canContinue ? "btn-quiet" : "btn-command"}
            onClick={() => (canContinue ? setConfirming(true) : void begin())}
          >
            Begin the Campaign
          </button>
          {!canContinue && (
            <button type="button" className="btn-quiet" disabled aria-describedby="continue-note">
              Continue
            </button>
          )}
          <button type="button" className="btn-quiet" onClick={() => go("campaigns")}>
            Choose a campaign
          </button>
          {onHowTo && (
            <button type="button" className="btn-quiet" onClick={onHowTo}>
              How to play
            </button>
          )}
          {onEditor && (
            <button type="button" className="btn-quiet" onClick={onEditor}>
              Doctrine editor <span className="btn-note">Experimental</span>
            </button>
          )}
          {onSettings && (
            <button type="button" className="btn-quiet" onClick={onSettings}>
              Settings
            </button>
          )}
          {continueNote && (
            <p id="continue-note" className="title-note">
              {continueNote}
            </p>
          )}
        </nav>
      </TitleScene>
      {confirming && (
        <ConfirmNewCampaign
          onBegin={() => {
            setConfirming(false);
            void begin();
          }}
          onKeep={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/** Which battle Continue leads to. */
function ContinueNote() {
  const definition = useFlow((s) => s.definition);
  const saved = useFlow((s) => s.saved);
  if (!saved) return null;
  const battle = currentBattle(definition, saved);
  return <span className="btn-note">{battle ? battle.title : "The war is won"}</span>;
}

function ConfirmNewCampaign({ onBegin, onKeep }: { onBegin: () => void; onKeep: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <Modal className="modal" role="alertdialog" labelledBy="new-title" describedBy="new-body" initialFocus={keep} onCancel={onKeep}>
      <h2 id="new-title">Begin a new campaign?</h2>
      <p id="new-body">Your saved campaign, its companies and their Resolve will be replaced.</p>
      <div className="modal-actions">
        <button ref={keep} type="button" className="btn-command" onClick={onKeep}>
          Keep my campaign
        </button>
        <button type="button" className="btn-quiet" onClick={onBegin}>
          Begin anew
        </button>
      </div>
    </Modal>
  );
}
