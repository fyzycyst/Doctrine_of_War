import { Eye, History, Shield, Sparkles } from "lucide-react";
import { getHex, hexKey, sameHex, terrainDefenseBonus } from "../../game/board";
import { sightRangeAt, type VisibleSquad } from "../../game/engine";
import { deploymentHexes, hexName } from "../game/deploy";
import { useGame } from "../game/gameStore";
import { getDoctrine, resolveRank } from "../game/view";
import { useAppStore } from "../store";
import { DoctrineCardFace, SealedCard } from "./DoctrineCard";
import { ROLE_NAME, RoleGlyph } from "./glyphs";

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/** The squad inspector (right): exact numbers for your companies, last-known intel for the Host. */
export function Inspector() {
  const view = useGame((s) => s.view);
  const scenario = useGame((s) => s.scenario);
  const orders = useGame((s) => s.orders);
  const stage = useGame((s) => s.stage);
  const selectedId = useAppStore((s) => s.selectedSquadId);
  const squad = view.squads.find((item) => item.id === selectedId);

  if (!squad) {
    return (
      <aside className="inspector inspector-empty" aria-label="Squad inspector">
        <p>{stage === "deploy" ? "Choose a company to place it." : "Choose a company to read its orders."}</p>
      </aside>
    );
  }

  const own = squad.faction === view.viewer;
  const boardHex = squad.hex ? getHex(scenario.board, squad.hex) : undefined;
  const doctrine = getDoctrine(own ? (orders[squad.id] ?? squad.doctrineId) : squad.doctrineId);

  return (
    <aside className={`inspector ${own ? "own" : "enemy"}`} aria-label={`Inspector: ${squad.name}`}>
      <header className="insp-head">
        <span className="insp-glyph">
          <RoleGlyph role={squad.role} size={22} />
        </span>
        <div>
          <h2>{squad.name}</h2>
          <p className="insp-sub">
            {ROLE_NAME[squad.role]} · {own ? resolveRank(squad.resolve) : squad.lastKnown ? "last seen" : "in sight"}
            {squad.renown && <span className="renown"> · “{squad.renown.title}”</span>}
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
                {sightRangeAt(scenario, view.weather, squad.hex)}
                <span className="unit"> {sightRangeAt(scenario, view.weather, squad.hex) === 1 ? "hex" : "hexes"}</span>
              </dd>
            </div>
          </>
        )}
        <div className="wide">
          <dt>{squad.lastKnown ? "Last seen at" : "Position"}</dt>
          <dd>{squad.hex ? hexName(scenario, squad.hex) : "Off the field"}</dd>
        </div>
      </dl>

      {stage === "deploy" && own ? (
        <DeployChoices squad={squad} />
      ) : doctrine ? (
        <div className="insp-doctrine">
          <p className="insp-label">{own ? (orders[squad.id] ? "Orders for this phase" : "Standing doctrine") : "Their doctrine"}</p>
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
                {holder && !here && <span className="holder">{holder.name}</span>}
                {here && <span className="holder">here</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
