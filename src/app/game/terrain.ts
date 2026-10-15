// The terrain readout (T19 playtest: "make clearer any terrain advantages"). With a
// company selected, the hex under the cursor is read against the company's own hex.
// Every number and note comes from the engine's own terrain rules.
import { getHex, isPassableTerrain, terrainDefenseBonus, type HexCoord, type TerrainType } from "../../game/board";
import { blocksSight, bracesOn, endsMove, sightRangeAt, type EngineScenario, type TimeOfDay, type Weather } from "../../game/engine";
import { hexName } from "./deploy";

export interface TerrainReadout {
  name: string;
  terrain: TerrainType;
  passable: boolean;
  /** Defense bonus here, and how it compares with the company's hex. */
  defense: number;
  defenseDelta: number;
  /** Sight from here in hexes (this weather and hour), and against the company's hex. */
  sight: number;
  sightDelta: number;
  notes: string[];
  /** Better or worse ground than where the company stands: defense first, then sight. */
  compare: "stronger" | "weaker" | "same";
}

export function terrainReadout(
  scenario: EngineScenario,
  conditions: { weather: Weather; timeOfDay: TimeOfDay },
  hex: HexCoord,
  from: HexCoord,
): TerrainReadout | null {
  const here = getHex(scenario.board, hex);
  const there = getHex(scenario.board, from);
  if (!here || !there) return null;
  const { weather, timeOfDay } = conditions;
  const passable = isPassableTerrain(here.terrain);
  const defense = terrainDefenseBonus(here.terrain);
  const sight = sightRangeAt(scenario, weather, hex, timeOfDay);
  const defenseDelta = defense - terrainDefenseBonus(there.terrain);
  const sightDelta = sight - sightRangeAt(scenario, weather, from, timeOfDay);

  const notes: string[] = [];
  if (!passable) notes.push("Impassable");
  if (endsMove(here.terrain, weather)) notes.push(here.terrain === "ford" ? "Ends a move in the rain" : "Ends a move");
  else if (here.terrain === "ford") notes.push("Ends a move when it rains");
  if (blocksSight(here.terrain)) notes.push("Hides what lies beyond");
  if (passable && !bracesOn(here.terrain)) notes.push("No footing to brace");

  const compare = !passable
    ? "same"
    : defenseDelta !== 0
      ? defenseDelta > 0
        ? "stronger"
        : "weaker"
      : sightDelta > 0
        ? "stronger"
        : sightDelta < 0
          ? "weaker"
          : "same";
  return { name: hexName(scenario, hex), terrain: here.terrain, passable, defense, defenseDelta, sight, sightDelta, notes, compare };
}
