// T27 §3: a company breaks when its cohesion reaches 0, whatever its strength. So cohesion
// is shown as plainly as strength, for your companies and for Host companies in sight (never
// for one only last seen): two labelled meters, and "breaks at 0" in words.
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { emberFord } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { useGuide } from "../guide/guideStore";
import { useAppStore } from "../store";

vi.mock("./BattleBoard", () => ({ BattleBoard: () => null }));

const game = () => useGame.getState();
const tab = (squadId: string) => document.querySelector<HTMLElement>(`[data-squad="${squadId}"]`)!;

beforeEach(() => {
  useGame.setState({ playbackSpeed: 1 });
  useGuide.setState({ introSeen: true, coach: "done" });
  act(() => useAppStore.getState().clearSelection());
});

/** Ember Ford in command, with one Host company in sight and one only last seen. */
function battle() {
  act(() => game().loadBattle(emberFord, { fortune: "off", seed: 1 }, "command"));
  const view = game().view;
  const host = emberFord.squads.filter((squad) => squad.faction !== emberFord.playerFaction);
  const [seen, remembered] = host;
  act(() =>
    useGame.setState({
      view: {
        ...view,
        squads: [
          ...view.squads.filter((squad) => squad.faction === view.viewer),
          { id: seen.id, name: seen.name, faction: seen.faction, role: seen.role, hex: seen.hex, strength: 43, cohesion: 6, resolve: 0, doctrineId: seen.doctrineId, status: "active", braced: false, surging: false, lastKnown: false, lastSeen: null },
          { id: remembered.id, name: remembered.name, faction: remembered.faction, role: remembered.role, hex: remembered.hex, strength: 60, cohesion: 50, resolve: 0, doctrineId: null, status: "active", braced: false, surging: false, lastKnown: true, lastSeen: { phase: 1, beat: 2 } },
        ],
      },
    }),
  );
  render(<App />);
  return { seen, remembered };
}

describe("cohesion as plain as strength", () => {
  it("your companies' tabs carry two labelled meters with their numbers", () => {
    battle();
    const own = tab("tollbridge_pikes");
    const meters = within(own).getAllByRole("meter");
    expect(meters.map((meter) => meter.getAttribute("aria-label"))).toEqual(["Tollbridge Pikes strength", "Tollbridge Pikes cohesion"]);
    expect(own).toHaveTextContent(/Strength\s*84/);
    expect(own).toHaveTextContent(/Cohesion\s*74/);
    expect(meters[1]).toHaveAttribute("aria-valuetext", "74 of 100: it breaks at 0");
  });

  it("a Host company in sight shows the same, and a low one is marked as near breaking", () => {
    const { seen } = battle();
    const enemy = tab(seen.id);
    expect(within(enemy).getAllByRole("meter")).toHaveLength(2);
    expect(enemy).toHaveTextContent(/Strength\s*43/);
    expect(enemy).toHaveTextContent(/Cohesion\s*6/);
    expect(enemy.querySelector(".meter-row.cohesion")).toHaveClass("low");
    expect(enemy.querySelector(".meter-row.cohesion")).toHaveAttribute("title", expect.stringMatching(/breaks when cohesion reaches 0/));
  });

  it("a Host company only last seen shows no meters (its numbers are old)", () => {
    const { remembered } = battle();
    expect(within(tab(remembered.id)).queryAllByRole("meter")).toHaveLength(0);
  });

  it("the inspector says what cohesion means", () => {
    const { seen } = battle();
    act(() => useAppStore.getState().selectSquad(seen.id));
    const stats = document.querySelector(".insp-stats") as HTMLElement;
    expect(within(stats).getByText("Cohesion").closest("div")).toHaveTextContent(/6\s*breaks at 0/);
  });
});
