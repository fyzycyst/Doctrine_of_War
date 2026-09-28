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
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).queryByText(/Column/)).not.toBeInTheDocument();
    expect(game().defaultedSquads()).not.toContain("saltmarsh_column");
  });
});
