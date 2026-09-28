import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/gameStore";
import { getDoctrine } from "../game/view";
import { SealMark } from "./glyphs";

/** The wax-seal commit. If any company would fight on a doctrine you did not pick, it asks first. */
export function SealOrders() {
  const defaulted = useGame((s) => s.defaultedSquads);
  const seal = useGame((s) => s.sealOrders);
  const view = useGame((s) => s.view);
  const orders = useGame((s) => s.orders);
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  const chosen = Object.keys(orders).length;
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
        </p>
      </div>
      {confirming && (
        <ConfirmDefaults
          names={confirming.map((id) => {
            const squad = view.squads.find((item) => item.id === id);
            return `${squad?.name ?? id}: ${getDoctrine(squad?.doctrineId)?.name ?? "standing doctrine"}`;
          })}
          onSeal={() => {
            setConfirming(null);
            seal();
          }}
          onReview={() => {
            setConfirming(null);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}

function ConfirmDefaults({ names, onSeal, onReview }: { names: string[]; onSeal: () => void; onReview: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <div className="modal-scrim" onKeyDown={(event) => event.key === "Escape" && onReview()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
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
        </div>
        <div className="modal-actions">
          <button ref={first} type="button" className="btn-command" onClick={onSeal}>
            Seal anyway
          </button>
          <button type="button" className="btn-quiet" onClick={onReview}>
            Review orders
          </button>
        </div>
      </div>
    </div>
  );
}
