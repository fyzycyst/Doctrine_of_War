// T25 §1: Escape deselects a company anywhere in the battle (deploy and command), one
// layer per press: a coach mark or open dialog first, then the hand, then the selection.
// Playback keeps Escape as "skip the phase".
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { emberFord, firstBreach } from "../../game/engine";
import { useGame } from "../game/gameStore";
import { useGuide } from "../guide/guideStore";
import { useAppStore } from "../store";

vi.mock("./BattleBoard", () => ({ BattleBoard: () => null }));

const game = () => useGame.getState();
const selected = () => useAppStore.getState().selectedSquadId;
const esc = (target: Element | Window = document.activeElement ?? document.body) => fireEvent.keyDown(target, { key: "Escape" });
/** A board pick: the selection changes, keyboard focus stays where it was (the page). */
const pickOnBoard = (squadId: string) => act(() => useAppStore.getState().selectSquad(squadId));

beforeEach(() => {
  useGame.setState({ playbackSpeed: 1 });
  useGuide.setState({ introSeen: true, coach: "done", step: "select" });
  act(() => useAppStore.getState().clearSelection());
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("Escape in the battle", () => {
  it("clears a company selected on the board, in command, and focus lands on its roster tab, never the page", () => {
    act(() => game().loadBattle(emberFord, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    pickOnBoard("tollbridge_pikes");
    expect(document.activeElement).toBe(document.body);
    esc();
    expect(selected()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveAttribute("data-squad", "tollbridge_pikes");
  });

  it("with the hand in use, the first Escape leaves the hand and keeps the company; the second deselects", () => {
    act(() => game().loadBattle(emberFord, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    pickOnBoard("tollbridge_pikes");
    const hand = screen.getByRole("region", { name: /Doctrines for/ });
    const card = within(hand).getAllByRole("option")[0];
    act(() => card.focus());
    esc(card);
    expect(selected()).toBe("tollbridge_pikes");
    expect(document.activeElement).toHaveAttribute("data-squad", "tollbridge_pikes");
    esc();
    expect(selected()).toBeNull();
  });

  it("clears the company being placed during deployment", () => {
    act(() => game().loadBattle(emberFord, { fortune: "off", seed: 1 }, "deploy"));
    render(<App />);
    pickOnBoard("tollbridge_pikes");
    esc();
    expect(selected()).toBeNull();
  });

  it("an open dialog takes Escape first: the selection stays", () => {
    act(() => game().loadBattle(emberFord, { fortune: "off", seed: 1 }, "command"));
    render(
      <>
        <App />
        <dialog open aria-label="How to play">
          <button type="button">Close</button>
        </dialog>
      </>,
    );
    pickOnBoard("tollbridge_pikes");
    esc(screen.getByRole("button", { name: "Close" }));
    expect(selected()).toBe("tollbridge_pikes");
  });

  it("a coach mark takes Escape first (it skips the guide); the selection stays", () => {
    useGuide.setState({ introSeen: true, coach: "active", step: "select" });
    act(() => game().loadBattle(firstBreach, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    pickOnBoard("greyford_shields");
    // Selecting moves the guide on; whichever mark is up takes this press.
    expect(useGuide.getState().coach).toBe("active");
    esc(window);
    expect(useGuide.getState().coach).toBe("done");
    expect(selected()).toBe("greyford_shields");
    esc();
    expect(selected()).toBeNull();
  });

  it("during playback Escape still skips the phase and leaves the selection alone", async () => {
    act(() => game().loadBattle(emberFord, { fortune: "off", seed: 1 }, "command"));
    render(<App />);
    pickOnBoard("tollbridge_pikes");
    act(() => game().sealOrders());
    expect(game().stage).toBe("resolving");
    act(() => {
      esc(window);
    });
    // The skip runs the rest of the phase at once; the report follows.
    await waitFor(() => expect(game().stage).toBe("report"));
    expect(selected()).toBe("tollbridge_pikes");
  });
});
