import { Eye, History, Shield, Sparkles } from "lucide-react";
import { getHex, hexKey, sameHex, terrainDefenseBonus } from "../../game/board";
import { sightRangeAt, timeOfDayAt, type VisibleSquad } from "../../game/engine";
import { deploymentHexes, hexName } from "../game/deploy";
import { useGame } from "../game/gameStore";
import { getDoctrine, resolveRank, rosterName } from "../game/view";
import { useAppStore } from "../store";
import { DoctrineCardFace, SealedCard } from "./DoctrineCard";
import { ColumnGlyph, ROLE_NAME, RoleGlyph } from "./glyphs";
import { planFor } from "../game/muster";
import { describePlan, inContact, useMuster } from "./useMuster";

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/** The squad inspector (right): exact numbers for your companies, last-known intel for the Host. */
export function Inspector() {
  const view = useGame((s) => s.view);
  const scenario = useGame((s) => s.scenario);
  const orders = useGame((s) => s.orders);
  const stage = useGame((s) => s.stage);
  const selectedId = useAppStore((s) => s.selectedSquadId);
  const hoveredId = useAppStore((s) => s.hoveredSquadId);
  // Hovering a squad on the board previews it; the clicked selection stays pinned underneath.
  const previewing = hoveredId !== null && hoveredId !== selectedId && view.squads.some((item) => item.id === hoveredId);
  const squad = view.squads.find((item) => item.id === (previewing ? hoveredId : selectedId));

  if (!squad) {
    return (
      <aside className="inspector inspector-empty" aria-label="Squad inspector">
        <p>{stage === "deploy" ? "Choose a company to place it." : "Choose a company to read its orders."}</p>
      </aside>
    );
  }

  const own = squad.faction === view.viewer;
  const ward = Boolean(squad.noncombatant);
  // Sight in the hour this phase will resolve in (the engine's state.timeOfDay lags a phase).
  const sight = squad.hex ? sightRangeAt(scenario, view.weather, squad.hex, timeOfDayAt(scenario, Math.min(view.phase, view.maxPhases))) : 0;
  const boardHex = squad.hex ? getHex(scenario.board, squad.hex) : undefined;
  const doctrine = getDoctrine(own ? (orders[squad.id] ?? squad.doctrineId) : squad.doctrineId);

  return (
    <aside
      className={`inspector ${own ? "own" : "enemy"} ${previewing ? "previewing" : ""}`}
      aria-label={`Inspector: ${rosterName(squad)}`}
    >
      <header className="insp-head">
        <span className={`insp-glyph ${ward ? "ward" : ""}`}>{ward ? <ColumnGlyph size={22} /> : <RoleGlyph role={squad.role} size={22} />}</span>
        <div>
          <h2>{rosterName(squad)}</h2>
          <p className="insp-sub">
            {ward ? "Refugees in your care · they must escape" : <>{ROLE_NAME[squad.role]} · </>}
            {ward
              ? null
              : own
              ? resolveRank(squad.resolve)
              : squad.lastKnown
                ? squad.lastSeen
                  ? `last seen phase ${squad.lastSeen.phase}${squad.lastSeen.beat ? `, beat ${squad.lastSeen.beat}` : ""}`
                  : "last seen"
                : "in sight"}
            {!ward && squad.renown && <span className="renown"> · “{squad.renown.title}”</span>}
          </p>
        </div>
      </header>

      <div className="insp-flags">
        {squad.lastKnown && (
          <span className="flag">
            <History size={13} aria-hidden="true" /> Numbers as last seen
          </span>
        )}
        {!own && !squad.lastKnown && (
          <span className="flag">
            <Eye size={13} aria-hidden="true" /> Sighted now
          </span>
        )}
        {squad.braced && (
          <span className="flag">
            <Shield size={13} aria-hidden="true" /> Braced
          </span>
        )}
        {squad.surging && (
          <span className="flag gold">
            <Sparkles size={13} aria-hidden="true" /> Surging
          </span>
        )}
      </div>

      <dl className="insp-stats">
        <div>
          <dt>Strength</dt>
          <dd>{squad.strength}</dd>
        </div>
        <div>
          <dt>Cohesion</dt>
          <dd>{squad.cohesion}</dd>
        </div>
        {own && (
          <div>
            <dt>Resolve</dt>
            <dd>{signed(squad.resolve)}</dd>
          </div>
        )}
        {own && squad.hex && boardHex && (
          <>
            <div className="span2">
              <dt>Terrain</dt>
              <dd>
                {boardHex.terrain} {signed(terrainDefenseBonus(boardHex.terrain))}
                <span className="unit"> defense</span>
              </dd>
            </div>
            <div>
              <dt>Sight</dt>
              <dd>
                {sight}
                <span className="unit"> {sight === 1 ? "hex" : "hexes"}</span>
              </dd>
            </div>
          </>
        )}
        <div className="wide">
          <dt>{squad.lastKnown ? "Last seen at" : "Position"}</dt>
          <dd>{squad.hex ? hexName(scenario, squad.hex) : "Off the field"}</dd>
        </div>
      </dl>

      {stage === "command" && own && !ward && !previewing && squad.status === "active" && <MusterChoices squad={squad} />}

      {stage === "deploy" && own && !previewing ? (
        <DeployChoices squad={squad} />
      ) : doctrine ? (
        <div className="insp-doctrine">
          <p className="insp-label">
            {ward ? "Its own orders · cannot be changed" : own ? (orders[squad.id] ? "Orders for this phase" : "Standing doctrine") : "Their doctrine"}
          </p>
          <div className="doctrine-card flat">
            <DoctrineCardFace doctrine={doctrine} compact />
          </div>
        </div>
      ) : (
        !own && <SealedCard />
      )}
    </aside>
  );
}

/** Keyboard- and screen-reader-friendly deployment: every hex in the zone as a button. */
function DeployChoices({ squad }: { squad: VisibleSquad }) {
  const scenario = useGame((s) => s.scenario);
  const view = useGame((s) => s.view);
  const placeSquad = useGame((s) => s.placeSquad);
  const hexes = deploymentHexes(scenario);

  return (
    <div className="deploy-choices" role="group" aria-label={`Deploy ${squad.name}`}>
      <p className="insp-label">Deploy to</p>
      <ul>
        {hexes.map((hex) => {
          const here = squad.hex !== null && sameHex(squad.hex, hex);
          const holder = view.squads.find((item) => item.hex && item.status === "active" && sameHex(item.hex, hex));
          return (
            <li key={hexKey(hex)}>
              <button
                type="button"
                aria-pressed={here}
                className={holder && !here ? "held" : ""}
                onClick={() => placeSquad(squad.id, hex)}
              >
                <span>{hexName(scenario, hex)}</span>
                {holder && !here && <span className="holder">{rosterName(holder)}</span>}
                {here && <span className="holder">here</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Muster (T21), the keyboard path: where this company may muster, the engaged companies it
 * may relieve, or its planned move with Undo. The board offers the same by clicking.
 */
function MusterChoices({ squad }: { squad: VisibleSquad }) {
  const scenario = useGame((s) => s.scenario);
  const planMuster = useGame((s) => s.planMuster);
  const undoMuster = useGame((s) => s.undoMuster);
  const notice = useGame((s) => s.notice);
  const muster = useMuster();
  const nameOf = (id: string) => {
    const other = muster.view.squads.find((item) => item.id === id);
    return other ? rosterName(other) : id;
  };
  const planned = planFor(muster.plan, squad.id);
  const problem = planned ? muster.problems[planned.squadId] : undefined;
  const engaged = inContact(muster.view, squad);
  const targets = muster.targetsFor(squad.id);
  const relievers = engaged
    ? muster.view.squads.filter((other) => other.faction === muster.view.viewer && other.id !== squad.id && muster.targetsFor(other.id).relieve.includes(squad.id))
    : [];

  return (
    <div className="insp-muster" role="group" aria-label={`Muster ${rosterName(squad)}`}>
      <p className="insp-label">Muster</p>
      {planned ? (
        <div className="muster-planned">
          <span>{describePlan(planned, squad.id, nameOf, (hex) => hexName(scenario, hex))}</span>
          <button type="button" className="btn-quiet" onClick={() => undoMuster(squad.id)}>
            Undo muster
          </button>
          {problem && (
            <p className="muster-problem" role="alert">
              {problem}
            </p>
          )}
        </div>
      ) : engaged ? (
        <p className="muster-note">
          In contact: it cannot pull back.{" "}
          {relievers.length
            ? `${relievers.map(rosterName).join(", ")} can relieve it: select ${relievers.length === 1 ? "it" : "one"} and choose Relieve.`
            : "No fresh company stands beside it to relieve it."}
        </p>
      ) : targets.hexes.length === 0 && targets.relieve.length === 0 ? (
        <p className="muster-note">Nowhere to muster from here.</p>
      ) : (
        <ul className="muster-choices">
          {targets.relieve.map((tired) => (
            <li key={tired}>
              <button type="button" className="relieve" onClick={() => planMuster({ squadId: squad.id, relieve: tired })}>
                Relieve {nameOf(tired)}
              </button>
            </li>
          ))}
          {targets.hexes.map((hex) => (
            <li key={hexKey(hex)}>
              <button type="button" onClick={() => planMuster({ squadId: squad.id, to: hex })}>
                {hexName(scenario, hex)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && !planned && (
        <p className="muster-problem" role="alert">
          {notice}
        </p>
      )}
    </div>
  );
}
