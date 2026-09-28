import { useRef, type KeyboardEvent } from "react";
import type { VisibleSquad } from "../../game/engine";
import { useAppStore } from "../store";
import { useGame, useShownView } from "../game/gameStore";
import { getDoctrine, resolveRank } from "../game/view";
import { RoleGlyph, ROLE_NAME } from "./glyphs";

const STATUS_WORD: Record<VisibleSquad["status"], string> = {
  active: "",
  routed: "Routed",
  destroyed: "Destroyed",
  escaped: "Escaped",
};

function Meter({ label, value, tone }: { label: string; value: number; tone: "strength" | "cohesion" }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className={`meter meter-${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <span style={{ width: `${clamped}%` }} />
    </span>
  );
}

/** The company roster (left): banner tabs for your companies, then the enemies you know of. */
export function Roster({ onOpenHand }: { onOpenHand: () => void }) {
  // During playback the roster follows the board, not the phase's end state.
  const view = useShownView();
  const orders = useGame((s) => s.orders);
  const stage = useGame((s) => s.stage);
  const selectedId = useAppStore((s) => s.selectedSquadId);
  const selectSquad = useAppStore((s) => s.selectSquad);
  const listRef = useRef<HTMLDivElement>(null);

  const mine = view.squads.filter((squad) => squad.faction === view.viewer);
  const enemies = view.squads.filter((squad) => squad.faction !== view.viewer && squad.status === "active");
  const ids = [...mine, ...enemies].map((squad) => squad.id);
  const focusId = selectedId && ids.includes(selectedId) ? selectedId : ids[0];

  const move = (delta: number) => {
    const index = Math.max(0, ids.indexOf(focusId ?? ""));
    const next = ids[(index + delta + ids.length) % ids.length];
    selectSquad(next);
    listRef.current?.querySelector<HTMLElement>(`[data-squad="${next}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (focusId) {
        selectSquad(focusId);
        if (stage === "command" && mine.some((squad) => squad.id === focusId && squad.status === "active")) {
          onOpenHand();
        }
      }
    } else if (event.key === "Escape") {
      selectSquad(null);
    }
  };

  const tab = (squad: VisibleSquad) => {
    const selected = squad.id === selectedId;
    const own = squad.faction === view.viewer;
    const doctrine = getDoctrine(own ? (orders[squad.id] ?? squad.doctrineId) : squad.doctrineId);
    const out = squad.status !== "active";
    return (
      <div
        key={squad.id}
        data-squad={squad.id}
        role="option"
        aria-selected={selected}
        tabIndex={squad.id === focusId ? 0 : -1}
        className={`banner-tab ${own ? "own" : "enemy"} ${selected ? "selected" : ""} ${out ? "out" : ""}`}
        onClick={() => selectSquad(squad.id)}
      >
        <span className="banner-glyph" title={ROLE_NAME[squad.role]}>
          <RoleGlyph role={squad.role} />
        </span>
        <span className="banner-body">
          <span className="banner-name">{squad.name}</span>
          <span className="banner-sub">
            {out ? (
              STATUS_WORD[squad.status]
            ) : own ? (
              <>
                <span className="rank">{resolveRank(squad.resolve)}</span>
                {squad.renown && <span className="renown">“{squad.renown.title}”</span>}
                {doctrine && <span className={`banner-order ${orders[squad.id] ? "chosen" : ""}`}>{doctrine.name}</span>}
              </>
            ) : squad.lastKnown ? (
              "Last seen"
            ) : null}
          </span>
          {own && !out && (
            <span className="banner-meters">
              <Meter label={`${squad.name} strength`} value={squad.strength} tone="strength" />
              <Meter label={`${squad.name} cohesion`} value={squad.cohesion} tone="cohesion" />
            </span>
          )}
        </span>
      </div>
    );
  };

  return (
    <nav className="roster" aria-label="Companies">
      <div ref={listRef} role="listbox" aria-label="Company roster" onKeyDown={onKeyDown}>
        <div role="group" aria-label="Your companies" className="roster-group">
          {mine.map(tab)}
        </div>
        {enemies.length > 0 && (
          <div role="group" aria-label="Enemy companies" className="roster-group roster-enemies">
            <p className="roster-heading" aria-hidden="true">
              The Host
            </p>
            {enemies.map(tab)}
          </div>
        )}
      </div>
    </nav>
  );
}
