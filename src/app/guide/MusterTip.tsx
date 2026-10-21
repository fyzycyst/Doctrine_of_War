// The muster line (T21): once, in the first battle's second command window, the one
// thing the first phase could not show: companies can reposition between phases.
import { useRef } from "react";
import { useCaptureStore } from "../captureStore";
import { useGame } from "../game/gameStore";
import { FIRST_BATTLE } from "./coach";
import { tutorialOn, useGuide } from "./guideStore";

export const MUSTER_TIP = {
  title: "Muster & relief",
  body: "Between phases, free companies can muster 1 hex (cavalry 2), or a fresh company can relieve one that's worn out.",
  how: "Select a company: its muster hexes glow. Click one, or choose in the inspector.",
} as const;

export function MusterTip() {
  // Outside the tutorial only: the tutorial teaches muster and relief itself, step by step.
  const seen = useGuide((s) => s.musterTipSeen || tutorialOn(s));
  const see = useGuide((s) => s.seeMusterTip);
  const show = useGame((s) => s.baseScenario.id === FIRST_BATTLE && s.stage === "command" && s.log.length >= 1);
  const captureMode = useCaptureStore((s) => s.captureMode);
  const button = useRef<HTMLButtonElement>(null);
  if (seen || !show || captureMode) return null;
  return (
    <section className="coach-panel muster-tip" aria-label="Tip">
      <p className="coach-eyebrow" aria-hidden="true">
        New this phase
      </p>
      <div role="status" aria-live="polite">
        <h2 className="coach-title">{MUSTER_TIP.title}</h2>
        <p className="coach-body">{MUSTER_TIP.body}</p>
        <p className="coach-body muster-tip-how">{MUSTER_TIP.how}</p>
      </div>
      <div className="coach-actions">
        <button ref={button} type="button" className="btn-command" onClick={see}>
          Got it
        </button>
      </div>
    </section>
  );
}
