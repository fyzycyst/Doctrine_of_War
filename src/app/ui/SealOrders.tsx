import { useRef, useState } from "react";
import { useGame } from "../game/gameStore";
import { musterCount } from "../game/muster";
import { getDoctrine } from "../game/view";
import { SealMark } from "./glyphs";
import { Modal } from "./Modal";

/** The wax-seal commit. If any company would fight on a doctrine you did not pick, it asks first. */
export function SealOrders() {
  const defaulted = useGame((s) => s.defaultedSquads);
  const seal = useGame((s) => s.sealOrders);
  const view = useGame((s) => s.view);
  const orders = useGame((s) => s.orders);
  const muster = useGame((s) => s.muster);
  const notice = useGame((s) => s.notice);
  const stage = useGame((s) => s.stage);
  const suggestMuster = useGame((s) => s.suggestMuster);
  const resetMuster = useGame((s) => s.resetMuster);
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  const chosen = Object.keys(orders).length;
  // Musters (T21): companies that will move before the phase (a relief moves two).
  const mustering = musterCount(muster);
  const onSeal = () => {
    const left = defaulted();
    if (left.length > 0) {
      setConfirming(left);
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
        <ConfirmDefaults
          mustering={mustering}
          names={confirming.map((id) => {
            const squad = view.squads.find((item) => item.id === id);
            return `${squad?.name ?? id}: ${getDoctrine(squad?.doctrineId)?.name ?? "standing doctrine"}`;
          })}
          onSeal={() => {
            setConfirming(null);
            seal();
          }}
          onReview={() => setConfirming(null)}
        />
      )}
    </>
  );
}

function ConfirmDefaults({ names, mustering, onSeal, onReview }: { names: string[]; mustering: number; onSeal: () => void; onReview: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      className="modal"
      role="alertdialog"
      labelledBy="confirm-title"
      describedBy="confirm-body"
      initialFocus={first}
      onCancel={onReview}
    >
      <h2 id="confirm-title">Seal with standing doctrines?</h2>
      <div id="confirm-body">
        <p>
          {names.length === 1 ? "This company has" : "These companies have"} no new orders and will keep fighting as
          before:
        </p>
        <ul>
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        {mustering > 0 && (
          <p>
            {mustering === 1 ? "1 company will muster" : `${mustering} companies will muster`} before the phase begins.
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button ref={first} type="button" className="btn-command" onClick={onSeal}>
          Seal anyway
        </button>
        <button type="button" className="btn-quiet" onClick={onReview}>
          Review orders
        </button>
      </div>
    </Modal>
  );
}
