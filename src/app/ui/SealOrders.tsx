import { useRef, useState } from "react";
import { useGame } from "../game/gameStore";
import { musterCount } from "../game/muster";
import { tutorialOn, useGuide } from "../guide/guideStore";
import { SealMark } from "./glyphs";
import { Modal } from "./Modal";

/**
 * The wax-seal commit. It asks first only when nothing changed this command window (no new
 * orders, no musters): a likely slip. Companies left alone keep their standing doctrines,
 * which is normal, so any change seals at once (T33). Never in the tutorial, which teaches it.
 */
export function SealOrders() {
  const defaulted = useGame((s) => s.defaultedSquads);
  const seal = useGame((s) => s.sealOrders);
  const orders = useGame((s) => s.orders);
  const muster = useGame((s) => s.muster);
  const notice = useGame((s) => s.notice);
  const stage = useGame((s) => s.stage);
  const suggestMuster = useGame((s) => s.suggestMuster);
  const resetMuster = useGame((s) => s.resetMuster);
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const chosen = Object.keys(orders).length;
  // Musters (T21): companies that will move before the phase (a relief moves two).
  const mustering = musterCount(muster);
  const onSeal = () => {
    const unchanged = chosen === 0 && mustering === 0 && defaulted().length > 0;
    if (unchanged && !tutorialOn(useGuide.getState())) {
      setConfirming(true);
    } else {
      seal();
    }
  };

  return (
    <>
      <div className="seal-dock">
        <button ref={button} type="button" className="wax-seal" onClick={onSeal}>
          <span className="wax-disc" aria-hidden="true">
            <SealMark />
          </span>
          <span className="wax-label">Seal Orders</span>
        </button>
        <p className="seal-note" aria-live="polite">
          {chosen === 0 ? "No new orders yet" : `${chosen} new order${chosen === 1 ? "" : "s"}`}
          {mustering > 0 && ` · ${mustering} to muster`}
        </p>
        {stage === "command" && (
          <div className="muster-tools">
            <button
              type="button"
              className="btn-quiet"
              title="Plan the musters a careful captain would: relieve worn companies, close idle ones on the fight. You can change any of them."
              onClick={suggestMuster}
            >
              Suggest musters
            </button>
            <button type="button" className="btn-quiet" disabled={mustering === 0} onClick={resetMuster}>
              Reset musters
            </button>
          </div>
        )}
        {stage === "command" && notice && (
          <p className="seal-notice" role="status">
            {notice}
          </p>
        )}
      </div>
      {confirming && (
        <ConfirmUnchanged
          onSeal={() => {
            setConfirming(false);
            seal();
          }}
          onReview={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function ConfirmUnchanged({ onSeal, onReview }: { onSeal: () => void; onReview: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  return (
    <Modal className="modal" role="dialog" labelledBy="confirm-title" describedBy="confirm-body" initialFocus={first} onCancel={onReview}>
      <h2 id="confirm-title">Seal without changes?</h2>
      <p id="confirm-body">No new orders or musters this phase: every company keeps its standing doctrine.</p>
      <div className="modal-actions">
        <button ref={first} type="button" className="btn-command" onClick={onSeal}>
          Seal
        </button>
        <button type="button" className="btn-quiet" onClick={onReview}>
          Review orders
        </button>
      </div>
    </Modal>
  );
}
