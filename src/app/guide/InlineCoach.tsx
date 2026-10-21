import { COACH_COPY, type CoachCopy } from "./coach";
import { COACH_STEPS, useGuide, type CoachStep } from "./guideStore";

/**
 * A coach mark set into a dialog's own flow (the report is modal, so a floating mark
 * outside it would be inert). Points down at the section below it.
 */
export function InlineCoach({ step, copy = COACH_COPY[step], onNext }: { step: CoachStep; copy?: CoachCopy; /** Also does the report's own next (one button, not two). */ onNext?: () => void }) {
  const advance = useGuide((s) => s.advance);
  const skip = useGuide((s) => s.skip);
  return (
    <section className="coach-panel inline side-above" aria-label="Tutorial step" style={{ "--pointer": "40px" } as React.CSSProperties}>
      <p className="coach-eyebrow" aria-hidden="true">
        Tutorial · step {COACH_STEPS.indexOf(step) + 1} of {COACH_STEPS.length}
      </p>
      <div role="status" aria-live="polite">
        <h2 className="coach-title">{copy.title}</h2>
        <p className="coach-body">{copy.body}</p>
      </div>
      <div className="coach-actions">
        <button
          type="button"
          className="btn-command"
          onClick={() => {
            advance(step);
            onNext?.();
          }}
        >
          {copy.next}
        </button>
        <button type="button" className="coach-skip" onClick={skip}>
          Skip tutorial
        </button>
      </div>
    </section>
  );
}
