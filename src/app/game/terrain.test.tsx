import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getHex, hexKey, terrainDefenseBonus } from "../../game/board";
import { createInitialState, firstBreach, holdForDawn, saltmarshColumn, sightRangeAt, visibleHexes, visibleState } from "../../game/engine";
import { terrainReadout } from "./terrain";

vi.mock("@react-three/drei", () => ({ Html: () => null }));
const { TerrainChipCard } = await import("../ui/TerrainChip");

const day = { weather: "clear" as const, timeOfDay: "day" as const };
const shields = firstBreach.squads.find((squad) => squad.id === "greyford_shields")!.hex;

describe("the terrain readout (engine rules, read against the company's hex)", () => {
  it("reads a ridge as better ground: higher defense and longer sight", () => {
    const ridge = terrainReadout(firstBreach, day, { q: 1, r: 0 }, shields)!;
    const fromDefense = terrainDefenseBonus(getHex(firstBreach.board, shields)!.terrain);
    expect(ridge).toMatchObject({ terrain: "ridge", name: "North Ridge (ridge)", passable: true, defense: 3, defenseDelta: 3 - fromDefense });
    expect(ridge.sight).toBe(sightRangeAt(firstBreach, "clear", { q: 1, r: 0 }, "day"));
    expect(ridge.sightDelta).toBe(1);
    expect(ridge.compare).toBe("stronger");
  });

  it("says a ford ends a move in the rain, and warns of it in clear weather", () => {
    const ford = { q: 0, r: 2 };
    expect(terrainReadout(firstBreach, day, ford, shields)).toMatchObject({ defense: -1, compare: "weaker", notes: ["Ends a move when it rains"] });
    expect(terrainReadout(firstBreach, { ...day, weather: "rain" }, ford, shields)!.notes).toEqual(["Ends a move in the rain"]);
  });

  it("marks ruins and reeds as hiding what lies beyond, marsh as slow and footless, walls as impassable", () => {
    expect(terrainReadout(firstBreach, day, { q: 3, r: 0 }, shields)!.notes).toEqual(["Hides what lies beyond"]);
    const salt = saltmarshColumn.squads.find((squad) => squad.faction === saltmarshColumn.playerFaction && !squad.noncombatant)!.hex;
    expect(terrainReadout(saltmarshColumn, day, { q: 0, r: 0 }, salt)!.notes).toEqual(["Ends a move", "No footing to brace"]);
    expect(terrainReadout(saltmarshColumn, day, { q: 0, r: 3 }, salt)!.notes).toEqual(["Hides what lies beyond"]);
    expect(terrainReadout(firstBreach, day, { q: 4, r: 2 }, shields)).toMatchObject({ passable: false, notes: ["Impassable"], compare: "same" });
  });

  it("is nothing off the board", () => {
    expect(terrainReadout(firstBreach, day, { q: 40, r: 40 }, shields)).toBeNull();
  });
});

describe("the terrain chip", () => {
  it("shows the ground, its numbers against the company's hex, and the verdict", () => {
    render(<TerrainChipCard readout={terrainReadout(firstBreach, day, { q: 1, r: 0 }, shields)!} company="Greyford Shields" />);
    const chip = screen.getByRole("note", { name: "Terrain for Greyford Shields: North Ridge (ridge)" });
    expect(chip).toHaveClass("stronger");
    expect(chip).toHaveTextContent(/Defense \+3/);
    expect(chip).toHaveTextContent(/Sight \d \(\+1\)/);
    expect(chip).toHaveTextContent("Better ground than now");
  });

  it("drops the numbers on ground no company can enter", () => {
    render(<TerrainChipCard readout={terrainReadout(firstBreach, day, { q: 4, r: 2 }, shields)!} company="Greyford Shields" />);
    expect(screen.getByRole("note")).toHaveTextContent("Greyford Gate (wall)Impassable");
  });
});

describe("the chip under fog (terrain is public; fog hides companies)", () => {
  it("reads a fogged hex's ground and nothing of the company hidden on it", () => {
    const state = createInitialState(holdForDawn, { fortune: "on", seed: holdForDawn.curatedSeed ?? 1 });
    const seen = new Set(visibleState(state, holdForDawn.playerFaction).squads.map((squad) => squad.id));
    const lit = new Set(visibleHexes(state, holdForDawn, holdForDawn.playerFaction).map(hexKey));
    const hidden = state.squads.find((squad) => squad.faction !== holdForDawn.playerFaction && squad.hex && !seen.has(squad.id) && !lit.has(hexKey(squad.hex)));
    expect(hidden).toBeDefined(); // predawn: the Host waits in the dark
    const from = holdForDawn.squads.find((squad) => squad.faction === holdForDawn.playerFaction)!.hex;
    const conditions = { weather: "clear" as const, timeOfDay: "predawn" as const };
    const readout = terrainReadout(holdForDawn, conditions, hidden!.hex!, from)!;
    // The map alone: the same with the hidden company gone from the field.
    const empty = { ...holdForDawn, squads: holdForDawn.squads.filter((squad) => squad.id !== hidden!.id) };
    expect(terrainReadout(empty, conditions, hidden!.hex!, from)).toEqual(readout);
    expect(Object.keys(readout).sort()).toEqual(["compare", "defense", "defenseDelta", "name", "notes", "passable", "sight", "sightDelta", "terrain"]);
    render(<TerrainChipCard readout={readout} company="Greyford Shields" />);
    const chip = screen.getByRole("note");
    expect(chip.textContent).not.toMatch(new RegExp(hidden!.name, "i"));
    expect(chip.textContent).not.toMatch(/enemy|host|occupied|held/i);
  });
});
