import { useRef, type KeyboardEvent } from "react";
import type { VisibleSquad } from "../../game/engine";
import { useAppStore } from "../store";
import { useGame, useShownView } from "../game/gameStore";
import { getDoctrine, resolveRank, rosterName } from "../game/view";
import { ColumnGlyph, RoleGlyph, ROLE_NAME, Sigil } from "./glyphs";
import { isRelief, planFor } from "../game/muster";
import { inContact, useMuster } from "./useMuster";
import { pressed } from "../shortcuts";

/** More companies than this and the roster turns compact. */
const DENSE_FROM = 7;

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
  // Muster (T21): planned moves, and who may relieve the selected company if it is in contact.
  const muster = useMuster();
  const selectedSquad = view.squads.find((squad) => squad.id === selectedId);
  const relieving = muster.active && selectedSquad && selectedSquad.faction === view.viewer && inContact(muster.view, selectedSquad) ? selectedSquad.id : null;

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
    if (pressed("rosterMove", event)) {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (pressed("rosterChoose", event)) {
      event.preventDefault();
      if (focusId) {
        selectSquad(focusId);
        if (stage === "command" && mine.some((squad) => squad.id === focusId && squad.status === "active")) {
          onOpenHand();
        }
      }
    } else if (pressed("deselect", event)) {
      selectSquad(null);
    }
  };

  const tab = (squad: VisibleSquad) => {
    const selected = squad.id === selectedId;
    const own = squad.faction === view.viewer;
    const doctrine = getDoctrine(own ? (orders[squad.id] ?? squad.doctrineId) : squad.doctrineId);
    const out = squad.status !== "active";
    // The Column is a charge, not a company: it cannot be ordered, only brought out.
    const ward = Boolean(squad.noncombatant);
    const planned = muster.active && own ? planFor(muster.plan, squad.id) : undefined;
    const problem = planned ? muster.problems[planned.squadId] : undefined;
    const canRelieve = Boolean(relieving && own && squad.id !== relieving && muster.targetsFor(squad.id).relieve.includes(relieving));
    return (
      <div
        key={squad.id}
        data-squad={squad.id}
        role="option"
        aria-selected={selected}
        tabIndex={squad.id === focusId ? 0 : -1}
        className={`banner-tab ${own ? "own" : "enemy"} ${ward ? "ward" : ""} ${selected ? "selected" : ""} ${out && !(ward && squad.status === "escaped") ? "out" : ""}`}
        onClick={() => selectSquad(squad.id)}
      >
        <span className="banner-glyph" title={ward ? "Refugees" : ROLE_NAME[squad.role]}>
          {ward ? <ColumnGlyph /> : <RoleGlyph role={squad.role} />}
        </span>
        <span className="banner-body">
          <span className="banner-name">{rosterName(squad)}</span>
          <span className="banner-sub">
            {ward ? (
              squad.status === "escaped" ? (
                <span className="must-escape safe">Safe beyond the marsh</span>
              ) : out ? (
                STATUS_WORD[squad.status]
              ) : (
                <span className="must-escape">Must escape</span>
              )
            ) : out ? (
              STATUS_WORD[squad.status]
            ) : own ? (
              <>
                {(planned || canRelieve) && (
                  <span className={`banner-muster ${problem ? "problem" : ""} ${canRelieve ? "can-relieve" : ""}`} title={problem ?? undefined}>
                    {canRelieve ? "Can relieve" : problem ? "Can't muster" : isRelief(planned!) ? (planned!.squadId === squad.id ? "Relief" : "Relieved") : "Muster"}
                  </span>
                )}
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
    // Big musters (Hold for Dawn fields eleven companies) get compact tabs so all fit.
    <nav className={`roster ${mine.length > DENSE_FROM ? "dense" : ""}`} aria-label="Companies">
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
      <Objectives view={view} />
    </nav>
  );
}

/**
 * What the battle is fought over (T27): each objective with its holder's sigil, its integrity
 * out of its starting value, and whose it is. Reads the shown view, so it drains during
 * playback as the company bars do. Objectives are public: no fog applies.
 */
function Objectives({ view }: { view: ReturnType<typeof useShownView> }) {
  const scenario = useGame((s) => s.scenario);
  if (view.objectives.length === 0) return null;
  return (
    <section className="roster-objectives" aria-label="Objectives">
      <p className="roster-heading" aria-hidden="true">
        Objectives
      </p>
      <ul>
        {view.objectives.map((objective) => {
          const start = scenario.objectives.find((item) => item.id === objective.id)?.integrity ?? objective.integrity;
          const now = Math.max(0, Math.round(objective.integrity));
          const ours = objective.defender === view.viewer;
          const broken = now <= 0;
          const whose = broken ? "Broken" : ours ? "Yours to keep" : "Theirs to break";
          const said = broken ? "broken" : ours ? "yours to keep" : "the Host's, yours to break";
          return (
            <li key={objective.id} className={`objective-row ${ours ? "ours" : "theirs"} ${broken ? "broken" : ""}`}>
              <Sigil faction={objective.defender} size={18} />
              <span className="objective-body">
                <span className="objective-name">{objective.name}</span>
                <span className="objective-sub">
                  <span className="objective-whose">{whose}</span>
                  <span className="objective-count mono" aria-hidden="true">
                    {now} / {start}
                  </span>
                </span>
                <span
                  className="meter meter-integrity"
                  role="meter"
                  aria-label={`${objective.name} integrity`}
                  aria-valuemin={0}
                  aria-valuemax={start}
                  aria-valuenow={now}
                  aria-valuetext={`${now} of ${start}: ${said}`}
                >
                  <span style={{ width: `${start > 0 ? Math.min(100, (now / start) * 100) : 0}%` }} />
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
