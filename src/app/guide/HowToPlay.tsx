import { useRef } from "react";
import { doctrineLibrary } from "../../game/engine";
import { resolveRank } from "../game/view";
import { DoctrineCardFace, SealedCard } from "../ui/DoctrineCard";
import { Modal } from "../ui/Modal";

const LOOP = ["Choose a company", "Give it a doctrine", "Seal your orders", "Watch them fire", "Read the chronicle"];

/** How to play (T15): the whole game on one screen, drawn with the game's own pieces. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  return (
    <Modal className="howto" labelledBy="howto-title" initialFocus={close} onCancel={onClose}>
      <header className="howto-head">
        <p className="scroll-eyebrow">Field manual</p>
        <h2 id="howto-title">How to play</h2>
      </header>

      <div className="howto-grid">
        <section className="howto-panel loop" aria-labelledby="h-loop">
          <h3 id="h-loop">The doctrine loop</h3>
          <ol className="howto-loop">
            {LOOP.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>You never move a soldier. Each phase you set every company's standing orders, seal them, and the battle plays out.</p>
        </section>

        <section className="howto-panel" aria-labelledby="h-doctrine">
          <h3 id="h-doctrine">A doctrine</h3>
          <div className="doctrine-card flat howto-card">
            <DoctrineCardFace doctrine={doctrineLibrary.clean_counterstroke} compact />
          </div>
          <p>Read top to bottom: each beat, a company follows the first rule that fits.</p>
        </section>

        <section className="howto-panel" aria-labelledby="h-beats">
          <h3 id="h-beats">Three beats a phase</h3>
          <div className="howto-beats" aria-hidden="true">
            <span className="beat-label">Beat 2/3</span>
            <span className="pips">
              <span className="pip done" />
              <span className="pip now" />
              <span className="pip" />
            </span>
          </div>
          <ol className="howto-order" aria-label="Order of play in each beat">
            {[1, 2, 3].map((beat) => (
              <li key={beat}>
                <span className="order-beat">Beat {beat}</span>
                <span className="order-host">The Host</span>
                <span className="order-arrow" aria-hidden="true">
                  →
                </span>
                <span className="order-you">Your companies</span>
              </li>
            ))}
          </ol>
          <p>In each beat the Host acts first, then your companies. Readable takes about 24 seconds a phase, Fast half that, and Skip jumps to the end.</p>
        </section>

        <section className="howto-panel" aria-labelledby="h-resolve">
          <h3 id="h-resolve">Resolve and renown</h3>
          <ul className="howto-ranks">
            {[-3, -2, -1, 0, 1, 2, 3].map((resolve) => (
              <li key={resolve} className={resolve === 3 ? "top" : ""}>
                {resolveRank(resolve)} <span className="mono">{resolve > 0 ? `+${resolve}` : resolve}</span>
              </li>
            ))}
          </ul>
          <p>Companies grow steadier with every battle they survive. At +3 they earn a name, and greener enemies who face them may falter.</p>
        </section>

        <section className="howto-panel" aria-labelledby="h-fortune">
          <h3 id="h-fortune">Fortune</h3>
          <div className="howto-callouts" aria-hidden="true">
            <div className="callout callout-surge">
              <span className="callout-title">Heroic stand!</span>
            </div>
            <div className="callout callout-waver">
              <span className="callout-title">Wavering…</span>
            </div>
          </div>
          <p>Chance is real but always shown: a company under stress may surge or waver. Every report names its seed, and Doctrine only in Settings turns fortune off.</p>
        </section>

        <section className="howto-panel" aria-labelledby="h-fog">
          <h3 id="h-fog">Fog of war</h3>
          <div className="howto-sealed">
            <SealedCard />
          </div>
          <p>You see what your companies can see. Enemies out of sight stay where they were last seen, their orders sealed.</p>
        </section>
      </div>

      <footer className="howto-foot">
        <button ref={close} type="button" className="btn-command" onClick={onClose}>
          Back
        </button>
      </footer>
    </Modal>
  );
}
