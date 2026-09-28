import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ashAndBanner } from "../game/campaign";
import { firstBreach } from "../game/engine";
import { isCaptureToggle, useCaptureStore } from "./captureStore";
import { campaignAfter } from "./flow/devCampaign";
import { useFlow } from "./flow/flowStore";
import { memoryStore } from "./flow/testKit";
import { useGame } from "./game/gameStore";
import { Root } from "./Root";

vi.mock("../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./flow/testKit")).FakeTitleScene }));
vi.mock("../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./flow/testKit")).FakeCampaignMap }));
vi.mock("./ui/BattleBoard", () => ({ BattleBoard: () => null }));

beforeEach(() => {
  useCaptureStore.setState({ captureMode: false, keepCallouts: false });
  useFlow.setState({ screen: "battle", campaign: null, store: memoryStore(), settingsOpen: false });
  act(() => useGame.getState().loadBattle(firstBreach, { fortune: "off", seed: 1 }, "command"));
  useGame.setState({ playbackSpeed: 1 });
});
afterEach(() => useCaptureStore.setState({ captureMode: false }));

describe("capture mode", () => {
  it("hides every battle UI layer and brings it back with Ctrl/⌘+Shift+H", async () => {
    const user = userEvent.setup();
    render(<Root />);
    expect(screen.getByRole("navigation", { name: "Companies" })).toBeInTheDocument();

    await user.keyboard("{Control>}{Shift>}H{/Shift}{/Control}");
    expect(useCaptureStore.getState().captureMode).toBe(true);
    expect(screen.queryByRole("navigation", { name: "Companies" })).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seal Orders" })).not.toBeInTheDocument();

    await user.keyboard("{Meta>}{Shift>}h{/Shift}{/Meta}");
    expect(useCaptureStore.getState().captureMode).toBe(false);
    expect(screen.getByRole("navigation", { name: "Companies" })).toBeInTheDocument();
  });

  it("keeps playing a phase with no playback bar, so a battle can be filmed", async () => {
    render(<Root />);
    act(() => {
      useCaptureStore.getState().setCaptureMode(true);
      useGame.setState({ playbackSpeed: 500 });
      useGame.getState().sealOrders();
    });
    expect(useGame.getState().stage).toBe("resolving");
    expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
    await waitFor(() => expect(useGame.getState().stage).toBe("report"), { timeout: 5000 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides the epilogue panel and the settings dialog", () => {
    useFlow.setState({ screen: "ending", campaign: campaignAfter(ashAndBanner, 2), settingsOpen: true });
    useCaptureStore.setState({ captureMode: true });
    render(<Root />);
    expect(screen.queryByRole("heading", { name: "The chronicle so far" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("only toggles on the chord, never on a plain H", () => {
    const key = (init: Partial<KeyboardEvent>) => ({ key: "h", shiftKey: false, ctrlKey: false, metaKey: false, ...init });
    expect(isCaptureToggle(key({}))).toBe(false);
    expect(isCaptureToggle(key({ shiftKey: true }))).toBe(false);
    expect(isCaptureToggle(key({ shiftKey: true, ctrlKey: true }))).toBe(true);
    expect(isCaptureToggle(key({ key: "H", shiftKey: true, metaKey: true }))).toBe(true);
  });
});
