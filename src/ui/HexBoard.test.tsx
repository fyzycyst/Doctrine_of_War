import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialBattleState, firstBreachScenario } from "../game/scenario";
import type { DoctrineAssignments } from "../game/types";
import { HexBoard } from "./HexBoard";

const state = createInitialBattleState();
const assignments: DoctrineAssignments = {
  greyford_shields: "shield_the_line",
  dawnwatch_archers: "clean_counterstroke",
  mercy_standard: "rescue_standard",
  stoneford_riders: "fighting_withdrawal",
};

describe("HexBoard", () => {
  it("renders every board hex as part of a tessellated battlefield", () => {
    render(
      <HexBoard
        board={firstBreachScenario.board!}
        squads={state.squads}
        assignments={assignments}
        objectives={state.objectives}
        playerFaction="free_banners"
      />,
    );

    expect(screen.getByRole("img", { name: /tessellated hex battlefield/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("hex-tile")).toHaveLength(25);
    expect(screen.getByLabelText(/hex 2,2: gate road, road terrain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/objective greyford gate at hex 4,2/i)).toBeInTheDocument();
  });

  it("renders squad tokens on their hex coordinates", () => {
    render(
      <HexBoard
        board={firstBreachScenario.board!}
        squads={state.squads}
        assignments={assignments}
        objectives={state.objectives}
        playerFaction="free_banners"
      />,
    );

    const shields = screen.getByLabelText(/select greyford shields at hex 3,2/i);
    const engine = screen.getByLabelText(/gatebreak engine at hex 0,2/i);

    expect(shields).toHaveAttribute("data-q", "3");
    expect(shields).toHaveAttribute("data-r", "2");
    expect(engine).toHaveAttribute("data-q", "0");
    expect(engine).toHaveAttribute("data-r", "2");
  });

  it("uses compact visible token labels that fit the unit rectangles", () => {
    render(
      <HexBoard
        board={firstBreachScenario.board!}
        squads={state.squads}
        assignments={assignments}
        objectives={state.objectives}
        playerFaction="free_banners"
      />,
    );

    const tokenLabels = screen.getAllByTestId("squad-token-label").map((label) => label.textContent ?? "");

    expect(tokenLabels).toEqual(["Shield", "Archer", "Mercy", "Rider", "Cinder", "Engine", "Ember", "Reaver"]);
    expect(tokenLabels.every((label) => label.length <= 6)).toBe(true);
  });

  it("lets selected player squads request deployment to valid empty hexes", () => {
    const onSelectSquad = vi.fn();
    const onDeploySquad = vi.fn();

    render(
      <HexBoard
        board={firstBreachScenario.board!}
        squads={state.squads}
        assignments={assignments}
        objectives={state.objectives}
        playerFaction="free_banners"
        selectedSquadId="stoneford_riders"
        onSelectSquad={onSelectSquad}
        onDeploySquad={onDeploySquad}
      />,
    );

    fireEvent.click(screen.getByLabelText(/select stoneford riders at hex 3,3/i));
    fireEvent.click(screen.getByLabelText(/deploy stoneford riders to hex 2,3/i));

    expect(onSelectSquad).toHaveBeenCalledWith("stoneford_riders");
    expect(onDeploySquad).toHaveBeenCalledWith("stoneford_riders", { q: 2, r: 3 });
  });

  it("does not expose deployment actions for occupied, enemy, or objective hexes", () => {
    render(
      <HexBoard
        board={firstBreachScenario.board!}
        squads={state.squads}
        assignments={assignments}
        objectives={state.objectives}
        playerFaction="free_banners"
        selectedSquadId="stoneford_riders"
      />,
    );

    expect(screen.queryByLabelText(/deploy stoneford riders to hex 3,2/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/deploy stoneford riders to hex 1,2/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/deploy stoneford riders to hex 4,2/i)).not.toBeInTheDocument();

    const board = screen.getByRole("img", { name: /tessellated hex battlefield/i });
    expect(within(board).getByLabelText(/hex 4,2: greyford gate, wall terrain/i)).toBeInTheDocument();
  });
});
