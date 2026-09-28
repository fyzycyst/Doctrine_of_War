import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ashAndBanner, startCampaign } from "../../game/campaign";
import { Root } from "../Root";
import { useFlow } from "./flowStore";
import { afterTutorial, memoryStore, savedStore } from "./testKit";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./testKit")).FakeCampaignMap }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

function reset(store = memoryStore()) {
  useFlow.setState({ screen: "title", campaign: null, save: "checking", saved: null, store, saveError: null });
  return store;
}

beforeEach(() => {
  reset();
});

describe("title screen", () => {
  it("offers Begin, and a disabled Continue when there is no save", async () => {
    render(<Root />);
    expect(await screen.findByText("No saved campaign yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Begin the Campaign" })).toHaveFocus();
  });

  it("begins a campaign: saves it at once and opens the campaign map", async () => {
    const user = userEvent.setup();
    const store = reset();
    render(<Root />);
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(useFlow.getState().campaign).toEqual(startCampaign(ashAndBanner));
    expect(store.data).toContain('"battleIndex":0');
  });

  it("continues a valid save, naming the battle it leads to", async () => {
    const user = userEvent.setup();
    reset(savedStore(afterTutorial()));
    render(<Root />);
    const button = await screen.findByRole("button", { name: /Continue\s*Ember Ford/ });
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(useFlow.getState().campaign?.battleIndex).toBe(1);
  });

  it("asks before a new campaign replaces a save", async () => {
    const user = userEvent.setup();
    const store = reset(savedStore(afterTutorial()));
    render(<Root />);
    await user.click(await screen.findByRole("button", { name: "Begin the Campaign" }));
    expect(screen.getByRole("alertdialog", { name: "Begin a new campaign?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep my campaign" }));
    expect(useFlow.getState().screen).toBe("title");
    expect(store.data).toContain('"battleIndex":1');

    await user.click(screen.getByRole("button", { name: "Begin the Campaign" }));
    await user.click(screen.getByRole("button", { name: "Begin anew" }));
    await waitFor(() => expect(useFlow.getState().screen).toBe("campaign"));
    expect(store.data).toContain('"battleIndex":0');
  });

  it("keeps Continue disabled for an unreadable save and never loads it", async () => {
    reset(memoryStore("{ not a save"));
    render(<Root />);
    expect(await screen.findByText("The saved campaign could not be read")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await act(() => useFlow.getState().continueCampaign());
    expect(useFlow.getState().campaign).toBeNull();
  });
});
