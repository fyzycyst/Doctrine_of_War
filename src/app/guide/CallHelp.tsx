// "How the call works" (T25 §2): Call the Banners, annotated. The screen dims and numbered
// coach marks (the guide's own ring, panel and placement: CoachMark.tsx) pin short notes
// onto the real controls. Esc, the (?) button again, or a click anywhere closes it.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { place, type Layout, type Placement } from "./CoachMark";

/** A note's place: beside its target (a coach-mark layout), or `inside` it (no pennant). */
export type HelpLayout = Layout & { inside?: boolean };

export interface CallHelpNote {
  title: string;
  body: string;
  /** The controls this note is about: a numbered ring around each. */
  targets: () => DOMRect[];
  /** Where the note goes beside the first target when it has no slot of its own. */
  prefer: Placement;
  /** A fixed slot for the note, given its size (null: no room, fall back to `prefer`). */
  slot?: (panel: { width: number; height: number }) => HelpLayout | null;
}

/** What each numbered mark says. Kept here so the copy can be read (and tested) on its own. */
export const CALL_HELP_COPY = [
  {
    title: "Posts",
    body: "Each place that needs a company, in the order their companies act in battle (numbered as on the map). Takes: the kind it needs. Flex: either of two kinds.",
  },
  { title: "Company selection", body: "Choose the company for each post here, or drag one from the Roll onto a post's row." },
  { title: "The Roll", body: "All your companies: Fresh, Worn or Reforming, and where each is called. Those left in reserve rest, and a Worn one recovers." },
  {
    title: "The enemy · Recommended force",
    body: "The Host is the enemy. Its strength is fixed before you choose: your picks do not change it. Recommended force fills every post with your readiest companies that fit.",
  },
] as const;

interface Placed {
  rings: (CSSProperties & { inner?: boolean })[];
  layout: HelpLayout | null;
}

export function CallHelp({ notes, onClose }: { notes: CallHelpNote[]; onClose: () => void }) {
  const panels = useRef<(HTMLElement | null)[]>([]);
  const close = useRef<HTMLButtonElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Re-measure every frame, like the coach marks (the Roll scrolls; the window resizes).
  useLayoutEffect(() => {
    let frame = 0;
    let last = "";
    const measure = () => {
      const next = notesRef.current.map((note, index): Placed => {
        const boxes = note.targets();
        const panel = panels.current[index];
        const size = panel ? { width: panel.offsetWidth, height: panel.offsetHeight } : null;
        const layout: HelpLayout | null = size ? (note.slot?.(size) ?? (boxes[0] ? place(boxes[0], size, note.prefer) : null)) : null;
        return {
          // A ring inside the note's first one (a detail of it) goes unnumbered.
          rings: boxes.map((rect, ringIndex) => ({
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            inner: ringIndex > 0 && boxes[0].left <= rect.left && boxes[0].top <= rect.top && boxes[0].right >= rect.right && boxes[0].bottom >= rect.bottom,
          })),
          layout,
        };
      });
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setPlaced(next);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => close.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    // Capture phase: Escape closes the help and nothing underneath (a list, the post) sees it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const holes = placed.flatMap((item) => item.rings);
  return (
    <div className="call-help" role="dialog" aria-modal="true" aria-labelledby="call-help-title" onClick={onClose}>
      <svg className="call-help-dim" aria-hidden="true">
        <defs>
          <mask id="call-help-mask">
            <rect width="100%" height="100%" fill="white" />
            {holes.map((ring, index) => (
              <rect key={index} x={Number(ring.left)} y={Number(ring.top)} width={Number(ring.width)} height={Number(ring.height)} rx={8} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#call-help-mask)" />
      </svg>
      <h2 id="call-help-title" className="call-help-title">
        How the call works
      </h2>
      {placed.map((item, index) =>
        item.rings.map(({ inner, ...ring }, ringIndex) => (
          <div key={`${index}-${ringIndex}`} className={`coach-ring call-help-ring ${inner ? "inner" : ""}`} style={ring} aria-hidden="true">
            {!inner && <span className="call-help-number">{index + 1}</span>}
          </div>
        )),
      )}
      <ol className="call-help-notes">
        {notes.map((note, index) => {
          const layout = placed[index]?.layout;
          return (
            <li
              key={note.title}
              ref={(element) => {
                panels.current[index] = element;
              }}
              className={`coach-panel call-help-panel side-${layout?.side ?? note.prefer} ${layout?.inside ? "inside" : ""} ${layout ? "" : "unplaced"}`}
              style={layout?.panel}
            >
              <h3 className="coach-title">
                <span className="call-help-number" aria-hidden="true">
                  {index + 1}
                </span>{" "}
                {note.title}
              </h3>
              <p className="coach-body">{note.body}</p>
            </li>
          );
        })}
      </ol>
      <button ref={close} type="button" className="btn-command call-help-close" onClick={onClose}>
        Got it <kbd>Esc</kbd>
      </button>
    </div>
  );
}
