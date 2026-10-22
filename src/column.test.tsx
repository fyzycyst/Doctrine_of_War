import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useGame } from "./app/game/gameStore";
import { useAppStore } from "./app/store";
import { saltmarshColumn } from "./game/engine";

vi.mock("./app/ui/BattleBoard", () => ({ BattleBoard: () => null }));

const game = () => useGame.getState();

beforeEach(() => {
  useAppStore.getState().clearSelection();
  act(() => game().loadBattle(saltmarshColumn, { fortune: "off", seed: 1 }, "command"));
});

describe("the Saltmarsh Column", () => {
  it("appears as The Column that must escape, and cannot be ordered", async () => {
    const user = userEvent.setup();
    render(<App />);
    const tab = screen.getByRole("option", { name: /The Column/ });
    expect(tab).toHaveTextContent("Must escape");
    expect(tab).not.toHaveTextContent("Saltmarsh");

    await user.click(tab);
    expect(screen.queryByRole("listbox", { name: /Doctrine for/ })).not.toBeInTheDocument();
    const inspector = screen.getByRole("complementary", { name: "Inspector: The Column" });
    expect(within(inspector).getByText("Refugees in your care · they must escape")).toBeInTheDocument();
    expect(within(inspector).getByText("Its own orders · cannot be changed")).toBeInTheDocument();
    expect(game().assignDoctrine("saltmarsh_column", "shield_the_line")).toBe(false);
  });

  it("shows the escape goal and leaves the Column out of the standing-orders question", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("status", { name: "Goal: Get the Column and 3 more out, 0/4" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Seal Orders" }));
    const confirm = screen.getByRole("dialog", { name: "Seal without changes?" });
    expect(within(confirm).queryByText(/Column/)).not.toBeInTheDocument();
    expect(game().defaultedSquads()).not.toContain("saltmarsh_column");
  });
});

describe("the Column in playback", () => {
  it("is named The Column in its banner and the caption", async () => {
    const { buildTimeline } = await import("./app/playback/timeline");
    const { PlaybackDirector } = await import("./app/playback/director");
    const view = game().view;
    const captions: string[] = [];
    const titles: string[] = [];
    const rule = { phase: 1, beat: 1, visibleTo: ["free_banners" as const], kind: "ruleFired" as const, squadId: "saltmarsh_column", doctrineId: "keep_the_column_moving", ruleId: "kcm_move", label: "Always → keep moving toward safety" };
    const timeline = buildTimeline([rule], "readable", { playerFaction: "free_banners", factionOf: () => "free_banners" });
    await new PlaybackDirector(timeline, {
      board: saltmarshColumn.board,
      playerFaction: "free_banners",
      maxFigures: 9,
      animator: () => null,
      pace: () => "readable",
      display: () => view,
      setDisplay: () => undefined,
      known: () => undefined,
      setBeat: () => undefined,
      callout: (spec) => titles.push(spec.title),
      focus: () => undefined,
      shake: () => undefined,
      sfx: () => undefined,
      caption: (text) => captions.push(text),
      sleep: () => Promise.resolve(),
    }).run();
    expect(titles).toEqual(["The Column"]);
    expect(captions.at(-1)).toBe("The Column: Always → keep moving toward safety");
  });
});
