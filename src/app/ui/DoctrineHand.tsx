import { forwardRef, useImperativeHandle, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useAppStore } from "../store";
import { useGame } from "../game/gameStore";
import { getDoctrine } from "../game/view";
import { DoctrineCardFace } from "./DoctrineCard";
import { SealMark } from "./glyphs";

export interface HandHandle {
  focus: () => void;
}

/**
 * The doctrine hand (bottom): the doctrines this battle allows, fanned like cards.
 * Click or Enter assigns one to the selected company. Arrow keys move along the hand.
 */
export const DoctrineHand = forwardRef<HandHandle>(function DoctrineHand(_, ref) {
  const scenario = useGame((s) => s.scenario);
  const view = useGame((s) => s.view);
  const orders = useGame((s) => s.orders);
  const assign = useGame((s) => s.assignDoctrine);
  const selectedId = useAppStore((s) => s.selectedSquadId);
  const listRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const squad = view.squads.find((item) => item.id === selectedId);
  const doctrines = scenario.playerDoctrineIds.map(getDoctrine).filter((item) => item !== undefined);
  const current = squad ? (orders[squad.id] ?? squad.doctrineId) : null;
  const currentIndex = Math.max(0, doctrines.findIndex((doctrine) => doctrine.id === current));
  const active = focusIndex ?? currentIndex;

  const focusCard = (index: number) => {
    setFocusIndex(index);
    listRef.current?.querySelectorAll<HTMLElement>("[role=option]")[index]?.focus({ preventScroll: true });
  };

  useImperativeHandle(ref, () => ({ focus: () => focusCard(currentIndex) }));

  if (!squad || squad.faction !== view.viewer || squad.status !== "active") {
    return null;
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const count = doctrines.length;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusCard((active + (event.key === "ArrowRight" ? 1 : -1) + count) % count);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusCard(event.key === "Home" ? 0 : count - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      assign(squad.id, doctrines[active].id);
    } else if (event.key === "Escape") {
      document.querySelector<HTMLElement>(`[data-squad="${squad.id}"]`)?.focus();
    }
  };

  const mid = (doctrines.length - 1) / 2;

  return (
    <section className="hand" aria-label={`Doctrines for ${squad.name}`}>
      <p className="hand-caption">
        Standing orders for <strong>{squad.name}</strong>
        <span className="hand-hint" aria-hidden="true">
          ← → to browse · Enter to assign
        </span>
      </p>
      <div
        ref={listRef}
        className="hand-cards"
        role="listbox"
        aria-label={`Doctrine for ${squad.name}`}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        {doctrines.map((doctrine, index) => {
          const chosen = doctrine.id === current;
          const offset = index - mid;
          return (
            <div
              key={doctrine.id}
              role="option"
              aria-selected={chosen}
              tabIndex={index === active ? 0 : -1}
              className={`doctrine-card in-hand ${chosen ? "chosen" : ""} ${index === active ? "active" : ""}`}
              style={{ "--rot": `${offset * 3}deg`, "--drop": `${Math.abs(offset) * 7}px` } as CSSProperties}
              onClick={() => {
                setFocusIndex(index);
                assign(squad.id, doctrine.id);
              }}
              onFocus={() => setFocusIndex(index)}
            >
              <DoctrineCardFace doctrine={doctrine} />
              {chosen && (
                <span className="wax" title={orders[squad.id] ? "Assigned this phase" : "Standing doctrine"}>
                  <SealMark size={30} />
                  <span className="sr-only">{orders[squad.id] ? "Assigned" : "Standing doctrine"}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});
