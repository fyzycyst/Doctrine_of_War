import { FlaskConical, LockKeyhole } from "lucide-react";
import type { Doctrine } from "../../game/engine";
import { splitRule } from "../game/view";
import { isVariantId } from "../variants/variantStore";
import { Sigil } from "./glyphs";

/** A doctrine as a heraldic order-scroll: name, sigil, flavor and its numbered standing orders. */
export function DoctrineCardFace({ doctrine, compact = false }: { doctrine: Doctrine; compact?: boolean }) {
  return (
    <>
      <span className="card-head">
        <Sigil faction={doctrine.faction} size={compact ? 18 : 22} />
        <span className="card-name">{doctrine.name}</span>
      </span>
      {isVariantId(doctrine.id) && <ExperimentalBadge />}
      {!compact && <span className="card-flavor">{doctrine.flavor}</span>}
      <ol className="card-rules">
        {doctrine.rules.map((rule) => {
          const { when, then } = splitRule(rule.label);
          return (
            <li key={rule.id}>
              {when && <span className="rule-when">{when}</span>}
              <span className="rule-then">→ {then}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Every surface that shows a doctrine variant (T16) marks it: custom orders, untested by the author. */
export function ExperimentalBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`badge-experimental ${small ? "small" : ""}`} title="Your own cut of a doctrine: custom orders">
      <FlaskConical size={small ? 11 : 12} aria-hidden="true" /> Experimental
    </span>
  );
}

/** An enemy doctrine the player has not seen: the card stays sealed. */
export function SealedCard() {
  return (
    <div className="doctrine-card sealed" role="group" aria-label="Doctrine unknown">
      <LockKeyhole size={22} aria-hidden="true" />
      <span className="card-name">Doctrine unknown</span>
      <span className="card-flavor">Their standing orders stay sealed until your companies sight or engage them.</span>
    </div>
  );
}
