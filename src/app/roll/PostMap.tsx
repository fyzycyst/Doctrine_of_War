// Where each post stands (M1 design notes): a small map of the battle's ground with the
// posts numbered in the order they act. Ground and objectives only: terrain is public, and
// nothing of the enemy is shown.
import { boardPixelBounds, hexPolygonPoints, hexToPixel, sameHex, type TerrainType } from "../../game/board";
import type { RollSlot } from "../../game/campaign";
import type { EngineScenario } from "../../game/engine";
import { postHex } from "./posts";

const SIZE = 10;
const GROUND: Record<TerrainType, string> = {
  field: "#5d6b3c",
  road: "#8a7550",
  ridge: "#7a6a4a",
  ford: "#4f6f86",
  river: "#2f4f6f",
  wall: "#5b5048",
  ruin: "#6b5a4c",
  marsh: "#4c5c48",
  reeds: "#5f6e43",
};

export function PostMap({ scenario, slots, names, active }: { scenario: EngineScenario; slots: RollSlot[]; names: Record<string, string>; active: string | null }) {
  const bounds = boardPixelBounds(scenario.board, SIZE);
  const pad = 4;
  const exits = scenario.winCondition.kind === "escapeEdge" ? scenario.winCondition.edgeHexes : [];
  return (
    <figure className="post-map" aria-label="Where the posts stand">
      <svg
        viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${bounds.maxX - bounds.minX + pad * 2} ${bounds.maxY - bounds.minY + pad * 2}`}
        role="img"
        aria-label={`The ground at ${scenario.title}, with ${slots.length} posts`}
      >
        {scenario.board.hexes.map((hex) => {
          const centre = hexToPixel(hex.coord, SIZE);
          const points = hexPolygonPoints(centre, SIZE - 0.6).map((point) => `${point.x},${point.y}`).join(" ");
          const objective = scenario.objectives.some((item) => sameHex(item.hex, hex.coord));
          const exit = exits.some((item) => sameHex(item, hex.coord));
          return <polygon key={`${hex.coord.q},${hex.coord.r}`} points={points} fill={GROUND[hex.terrain]} className={`${objective ? "objective" : ""} ${exit ? "exit" : ""}`} />;
        })}
        {slots.map((slot, index) => {
          const hex = postHex(scenario, slot.slotId);
          if (!hex) return null;
          const { x, y } = hexToPixel(hex, SIZE);
          const on = active === slot.slotId;
          return (
            <g key={slot.slotId} className={`post-marker ${on ? "on" : ""}`} data-post={slot.slotId}>
              <title>{names[slot.slotId]}</title>
              <circle cx={x} cy={y} r={on ? 7.5 : 6} />
              <text x={x} y={y + 3}>
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>Posts, numbered in the order they act{exits.length ? " · the way out is marked" : ""}</figcaption>
    </figure>
  );
}
