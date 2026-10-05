// T26: the Field Manual. One modal, several pages, opened from the title, Settings, the
// battle bar, F1 or ? anywhere outside a text box, and Call the Banners' help. The
// Doctrines page is the doctrine library; the Controls page is the shortcut table.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cinderRoad, startCampaign } from "../../game/campaign";
import { doctrineLibrary, emberFord } from "../../game/engine";
import { memoryStore } from "../flow/testKit";
import { useFlow } from "../flow/flowStore";
import { useGame } from "../game/gameStore";
import { Root } from "../Root";
import { comboLabel, SHORTCUTS } from "../shortcuts";
import { HELP_PAGES } from "./FieldManual";
import { useGuide } from "./guideStore";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("../flow/testKit")).FakeCampaignMap }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

const manual = () => screen.getByRole("dialog", { name: /./ });
const openPage = () => within(manual()).getByRole("tab", { selected: true });

beforeEach(() => {
  useGuide.setState({ introSeen: true, coach: "done", callHelpSeen: true });
  useFlow.setState({ screen: "title", campaign: null, save: "none", saved: null, store: memoryStore(), settingsOpen: false, howToOpen: false, helpPage: "play" });
});

describe("the Field Manual", () => {
  it("opens from the title's Help on How to play, unchanged, with every page a tab away", async () => {
    const user = userEvent.setup();
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "Help" }));
    expect(manual()).toHaveAccessibleName("How to play");
    for (const heading of ["The doctrine loop", "A doctrine", "Three beats a phase", "Resolve and renown", "Fortune", "Fog of war"]) {
      expect(within(manual()).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    const tabs = within(manual()).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(HELP_PAGES.map((page) => page.title));
    for (const page of HELP_PAGES) {
      await user.click(within(manual()).getByRole("tab", { name: page.title }));
      expect(manual()).toHaveAccessibleName(page.title);
      expect(openPage()).toHaveTextContent(page.title);
    }
    // The tabs answer the arrow keys, and focus stays inside the manual.
    act(() => within(manual()).getByRole("tab", { name: HELP_PAGES[0].title }).focus());
    await user.keyboard("{ArrowRight}");
    expect(openPage()).toHaveTextContent(HELP_PAGES[1].title);
    expect(manual()).toContainElement(document.activeElement as HTMLElement);
    await user.click(within(manual()).getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the Doctrines page shows exactly the doctrine library: every card, nothing else", async () => {
    const user = userEvent.setup();
    act(() => useFlow.getState().openHelp("doctrines"));
    render(<Root />);
    const cards = [...manual().querySelectorAll<HTMLElement>("[data-doctrine]")].map((card) => card.dataset.doctrine);
    expect(cards.sort()).toEqual(Object.keys(doctrineLibrary).sort());
    for (const doctrine of Object.values(doctrineLibrary)) expect(within(manual()).getAllByText(doctrine.name).length).toBeGreaterThan(0);
    await user.click(within(manual()).getByRole("button", { name: "Back" }));
  });

  it("the Controls page is the shortcut table, row for row", () => {
    act(() => useFlow.getState().openHelp("controls"));
    render(<Root />);
    const rows = within(manual()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(SHORTCUTS.length);
    SHORTCUTS.forEach((shortcut, index) => {
      const cells = within(rows[index]).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent(shortcut.combos.map(comboLabel).join(" or "));
      expect(cells[1]).toHaveTextContent(shortcut.does);
      expect(cells[2]).toHaveTextContent(shortcut.where);
    });
  });

  it("every key the table gives for Help opens it, anywhere but a text box", () => {
    render(<Root />);
    const help = SHORTCUTS.find((shortcut) => shortcut.id === "help")!;
    for (const combo of help.combos) {
      fireEvent.keyDown(document.body, { key: combo.key, shiftKey: combo.key === "?" });
      expect(useFlow.getState().howToOpen).toBe(true);
      act(() => useFlow.getState().setHowToOpen(false));
    }
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "?", shiftKey: true });
    expect(useFlow.getState().howToOpen).toBe(false);
    input.remove();
  });

  it("opens from Settings and from the battle bar's (?)", async () => {
    const user = userEvent.setup();
    act(() => useGame.getState().loadBattle(emberFord, { fortune: "off", seed: 1 }, "command"));
    useFlow.setState({ screen: "battle" });
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "Field Manual" }));
    expect(manual()).toHaveAccessibleName("How to play");
    await user.click(within(manual()).getByRole("button", { name: "Back" }));
    act(() => useFlow.getState().setSettingsOpen(true));
    await user.click(within(screen.getByRole("dialog", { name: "Settings" })).getByRole("button", { name: "Field Manual" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(manual()).toHaveAccessibleName("How to play");
  });

  it("Call the Banners: F1 opens its own page, and its help overlay links there; the (?) hides while the overlay is up", async () => {
    const user = userEvent.setup();
    useFlow.setState({ screen: "roll", definition: cinderRoad, campaign: startCampaign(cinderRoad) });
    render(<Root />);
    fireEvent.keyDown(document.body, { key: "F1" });
    expect(manual()).toHaveAccessibleName("Call the Banners");
    act(() => useFlow.getState().setHowToOpen(false));

    const button = screen.getByRole("button", { name: "How the call works" });
    await user.click(button);
    expect(button).toHaveStyle({ visibility: "hidden" });
    await user.click(within(screen.getByRole("dialog", { name: "How the call works" })).getByRole("button", { name: /Field Manual/ }));
    expect(screen.queryByRole("dialog", { name: "How the call works" })).not.toBeInTheDocument();
    expect(manual()).toHaveAccessibleName("Call the Banners");
  });
});
