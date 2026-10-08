// T27 §2b: the left panel's "Objectives" section: one row per objective with its holder's
// sigil, an integrity bar with the numbers, and whose it is (yours to keep / theirs to
// break). It follows the board during playback, and says the same to a screen reader.
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { firstBreach } from "../../game/engine";
import { registry } from "../../game/packs";
import { useGame } from "../game/gameStore";
import { useGuide } from "../guide/guideStore";

vi.mock("./BattleBoard", () => ({ BattleBoard: () => null }));

const game = () => useGame.getState();
const section = () => screen.getByRole("region", { name: "Objectives" });
const rows = () => within(section()).getAllByRole("listitem");

beforeEach(() => {
  useGame.setState({ playbackSpeed: 1 });
  useGuide.setState({ introSeen: true, coach: "done" });
});

describe("the Objectives section", () => {
  it("shows a Host objective to break, with its integrity out of its starting value", () => {
    const scenario = registry.scenario("cinder_road_saltmarsh")!;
    act(() => game().loadBattle(scenario, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    expect(rows()).toHaveLength(1);
    const row = rows()[0];
    expect(row).toHaveTextContent("The Saltgate Barricade");
    expect(row).toHaveTextContent("Theirs to break");
    expect(row).toHaveTextContent("30 / 30");
    expect(row.querySelector(".sigil-host")).not.toBeNull();
    expect(within(row).getByRole("meter")).toHaveAccessibleName("The Saltgate Barricade integrity");
    expect(within(row).getByRole("meter")).toHaveAttribute("aria-valuetext", "30 of 30: the Host's, yours to break");
  });

  it("shows both kinds in one battle: the Host's to break and yours to keep", () => {
    const scenario = registry.scenario("cinder_road_wagon_park")!;
    act(() => game().loadBattle(scenario, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringMatching(/The Wagon Park.*Theirs to break.*44 \/ 44/),
      expect.stringMatching(/The Weir Sluice.*Yours to keep.*16 \/ 16/),
    ]);
    expect(rows()[1].querySelector(".sigil-banners")).not.toBeNull();
  });

  it("follows the board during playback, and says when one has fallen", () => {
    act(() => game().loadBattle(firstBreach, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    expect(rows()[0]).toHaveTextContent(/Greyford Gate.*Yours to keep.*100 \/ 100/);
    // Playback drives its own view of the board (display): the section reads that one.
    act(() => useGame.setState({ display: { ...game().view, objectives: game().view.objectives.map((item) => ({ ...item, integrity: 37 })) } }));
    expect(rows()[0]).toHaveTextContent("37 / 100");
    expect(within(rows()[0]).getByRole("meter")).toHaveAttribute("aria-valuenow", "37");
    act(() => useGame.setState({ display: { ...game().view, objectives: game().view.objectives.map((item) => ({ ...item, integrity: 0 })) } }));
    expect(rows()[0]).toHaveTextContent("Broken");
    expect(within(rows()[0]).getByRole("meter")).toHaveAttribute("aria-valuetext", "0 of 100: broken");
  });

  it("is absent when the battle has no objective", () => {
    act(() => game().loadBattle(registry.scenario("ember_ford")!, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    expect(screen.queryByRole("region", { name: "Objectives" })).not.toBeInTheDocument();
  });
});
