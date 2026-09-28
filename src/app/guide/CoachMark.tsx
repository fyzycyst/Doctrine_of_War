import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { COACH_COPY } from "./coach";
import { COACH_STEPS, useGuide, type CoachStep } from "./guideStore";

export type Placement = "above" | "below" | "left" | "right";

interface Layout {
  ring: CSSProperties;
  panel: CSSProperties;
  side: Placement;
}

const GAP = 16;
const MARGIN = 12;

/** Where the panel goes around the target, falling back to the other side when there is no room. */
function place(target: DOMRect, panel: { width: number; height: number }, prefer: Placement): Layout {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fits: Record<Placement, boolean> = {
    above: target.top - GAP - panel.height > MARGIN,
    below: target.bottom + GAP + panel.height < vh - MARGIN,
    left: target.left - GAP - panel.width > MARGIN,
    right: target.right + GAP + panel.width < vw - MARGIN,
  };
  const opposite: Record<Placement, Placement> = { above: "below", below: "above", left: "right", right: "left" };
  const side = fits[prefer] ? prefer : fits[opposite[prefer]] ? opposite[prefer] : (["above", "below", "right", "left"] as Placement[]).find((p) => fits[p]) ?? prefer;
  const clampX = (x: number) => Math.max(MARGIN, Math.min(vw - panel.width - MARGIN, x));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(vh - panel.height - MARGIN, y));
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  const position =
    side === "above"
      ? { left: clampX(cx - panel.width / 2), top: target.top - GAP - panel.height }
      : side === "below"
        ? { left: clampX(cx - panel.width / 2), top: target.bottom + GAP }
        : side === "left"
          ? { left: target.left - GAP - panel.width, top: clampY(cy - panel.height / 2) }
          : { left: target.right + GAP, top: clampY(cy - panel.height / 2) };
  // The pennant points at the target's centre along the panel's facing edge.
  const pointer =
    side === "above" || side === "below"
      ? { "--pointer": `${Math.max(18, Math.min(panel.width - 18, cx - position.left))}px` }
      : { "--pointer": `${Math.max(18, Math.min(panel.height - 18, cy - position.top))}px` };
  return {
    side,
    ring: { left: target.left - 6, top: target.top - 6, width: target.width + 12, height: target.height + 12 },
    panel: { ...position, ...pointer } as CSSProperties,
  };
}

/**
 * A coach mark anchored to a real element: a gold ring around it and a heraldic panel
 * beside it. Re-measures every frame, since targets move (callouts follow the camera).
 * CoachLayer announces it (a persistent live region); Escape skips the whole guide.
 */
export function CoachMark({
  step,
  target,
  prefer = "above",
  focusNext = false,
  onNext,
}: {
  step: CoachStep;
  /** The element to point at, or a rectangle (e.g. the union of a few elements). */
  target: () => Element | DOMRect | null;
  prefer?: Placement;
  /** Move focus to the Next button (for marks the player must answer before going on). */
  focusNext?: boolean;
  onNext?: () => void;
}) {
  const copy = COACH_COPY[step];
  const skip = useGuide((s) => s.skip);
  const advance = useGuide((s) => s.advance);
  const panelRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;

  useLayoutEffect(() => {
    let frame = 0;
    let last = "";
    const measure = () => {
      const element = targetRef.current();
      const panel = panelRef.current;
      if (element && panel) {
        const rect = element instanceof DOMRect ? element : element.getBoundingClientRect();
        const key = `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)},${panel.offsetWidth},${panel.offsetHeight}`;
        if (key !== last) {
          last = key;
          setLayout(place(rect, { width: panel.offsetWidth, height: panel.offsetHeight }, prefer));
        }
      } else if (last !== "none") {
        last = "none";
        setLayout(null);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [prefer, step]);

  useEffect(() => {
    if (focusNext) nextRef.current?.focus({ preventScroll: true });
  }, [focusNext, step]);

  useEffect(() => {
    // Capture phase, so Escape skips the guide without also skipping playback.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        skip();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [skip]);

  const index = COACH_STEPS.indexOf(step);
  return (
    <div className="coach" data-step={step}>
      {layout && <div className="coach-ring" style={layout.ring} aria-hidden="true" />}
      <section
        ref={panelRef}
        className={`coach-panel side-${layout?.side ?? prefer} ${layout ? "" : "unplaced"}`}
        style={layout?.panel}
        aria-label="Guide"
      >
        <p className="coach-eyebrow" aria-hidden="true">
          Guide · {index + 1} of {COACH_STEPS.length}
        </p>
        <h2 className="coach-title">{copy.title}</h2>
        <p className="coach-body">{copy.body}</p>
        <div className="coach-actions">
          {copy.next && (
            <button ref={nextRef} type="button" className="btn-command" onClick={onNext ?? (() => advance(step))}>
              {copy.next}
            </button>
          )}
          <button type="button" className="coach-skip" onClick={skip}>
            Skip the guide <kbd>Esc</kbd>
          </button>
        </div>
      </section>
    </div>
  );
}
