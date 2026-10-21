import { useRef } from "react";
import { doctrineLibrary } from "../../game/engine";
import { DoctrineCardFace } from "../ui/DoctrineCard";
import { Sigil } from "../ui/glyphs";
import { Modal } from "../ui/Modal";
import { useGuide } from "./guideStore";

/**
 * "What is a doctrine?" (T15): one illustrated card before the first briefing. The
 * picture is a real doctrine card, with the banner that pops over a company when one
 * of its rules fires.
 */
export function DoctrineIntro() {
  const seeIntro = useGuide((s) => s.seeIntro);
  const skip = useGuide((s) => s.skip);
  const next = useRef<HTMLButtonElement>(null);
  const shield = doctrineLibrary.shield_the_line;
  const firing = shield.rules[1];

  return (
    <div className="intro-scrim">
      <Modal className="intro" labelledBy="intro-title" describedBy="intro-body" initialFocus={next} onCancel={seeIntro}>
        <div className="intro-art" aria-hidden="true">
          <div className="callout callout-rule mine intro-banner">
            <span className="callout-head">
              <Sigil faction="free_banners" size={14} />
              <span className="callout-title">Greyford Shields</span>
            </span>
            <span className="callout-line">
              <span className="rule-when">If enemy adjacent </span>
              <span className="rule-then">→ Brace shields</span>
            </span>
          </div>
          <div className="doctrine-card intro-card" data-firing={firing.id}>
            <DoctrineCardFace doctrine={shield} />
          </div>
        </div>
        <div className="intro-copy">
          <p className="scroll-eyebrow">Before your first battle</p>
          <h2 id="intro-title">Standing orders</h2>
          <p id="intro-body">You don't command soldiers. You give each company standing orders, then watch them act.</p>
          <p className="intro-tutorial">This battle is your tutorial: it shows you each step as you play, through its first two phases.</p>
          <div className="intro-actions">
            <button ref={next} type="button" className="btn-command" onClick={seeIntro}>
              Show me as I play
            </button>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                seeIntro();
                skip();
              }}
            >
              I know how to play
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
