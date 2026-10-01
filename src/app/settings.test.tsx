import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrefersReducedMotion } from "../render/motion";
import { useAudioStore } from "./audioStore";
import { campaignAfter } from "./flow/devCampaign";
import { useFlow } from "./flow/flowStore";
import { memoryStore } from "./flow/testKit";
import { useGame } from "./game/gameStore";
import { Root } from "./Root";
import { SETTINGS_STORAGE_KEY, useSettings } from "./settingsStore";
import { useAppStore } from "./store";
import { ashAndBanner, saveCampaign } from "../game/campaign";
import { firstBreach } from "../game/engine";
import { EXPORT_FILE_NAME } from "./support";

vi.mock("../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./flow/testKit")).FakeTitleScene }));
vi.mock("../render/showcase/CampaignMap", async () => ({ CampaignMap: (await import("./flow/testKit")).FakeCampaignMap }));
vi.mock("./ui/BattleBoard", () => ({ BattleBoard: () => null }));

beforeEach(() => {
  act(() => useSettings.getState().set({ quality: "high", defaultPace: "readable", doctrineOnly: false, motion: "system", showBattleDetails: false }));
  useAudioStore.setState({ muted: false, volume: 0.7 });
  useFlow.setState({ screen: "title", campaign: null, save: "none", saved: null, store: memoryStore(), settingsOpen: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("settings", () => {
  it("persists and pushes quality into the renderer's store", () => {
    act(() => useSettings.getState().set({ quality: "ultra" }));
    expect(useAppStore.getState()).toMatchObject({ quality: "high", ultra: true });
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"quality":"ultra"');
    act(() => useSettings.getState().set({ quality: "low" }));
    expect(useAppStore.getState()).toMatchObject({ quality: "low", ultra: false });
  });

  it("overrides the system's reduced-motion preference both ways", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })));
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => useSettings.getState().set({ motion: "reduce" }));
    expect(result.current).toBe(true);
    act(() => useSettings.getState().set({ motion: "full" }));
    expect(result.current).toBe(false);
  });

  it("starts the next battle with fortune off in Doctrine only mode, at the default pace", () => {
    act(() => useSettings.getState().set({ doctrineOnly: true, defaultPace: "fast" }));
    useFlow.setState({ campaign: campaignAfter(ashAndBanner, 1), screen: "campaign" });
    act(() => useFlow.getState().openBattle("battle_1"));
    expect(useGame.getState().setup.fortune).toBe("off");
    expect(useGame.getState().pace).toBe("fast");
  });

  it("opens from the title, changes settings with the keyboard-friendly controls, and closes", async () => {
    const user = userEvent.setup();
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.tagName).toBe("DIALOG");

    await user.click(screen.getByRole("radio", { name: "Low" }));
    expect(useSettings.getState().quality).toBe("low");
    await user.click(screen.getByRole("radio", { name: "Fast" }));
    expect(useSettings.getState().defaultPace).toBe("fast");
    await user.click(screen.getByRole("checkbox", { name: "Doctrine only" }));
    expect(useSettings.getState().doctrineOnly).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Reduced" }));
    expect(useSettings.getState().motion).toBe("reduce");

    await user.click(screen.getByRole("checkbox", { name: "Sound" }));
    expect(useAudioStore.getState().muted).toBe(true);
    expect(screen.getByRole("slider", { name: "Volume" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
  });
});

describe("Settings → Support", () => {
  it("hides the seed until Show battle details is on, then shows it in the top bar and keeps it on", async () => {
    const user = userEvent.setup();
    act(() => useGame.getState().loadBattle(firstBreach, { fortune: "on", seed: 146 }, "command"));
    useFlow.setState({ screen: "battle" });
    render(<Root />);
    expect(screen.getByLabelText("Fortune on")).not.toHaveTextContent("#146");
    act(() => useFlow.getState().setSettingsOpen(true));
    await user.click(screen.getByRole("checkbox", { name: "Show battle details" }));
    expect(screen.getByLabelText("Fortune on, seed 146")).toHaveTextContent("#146");
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"showBattleDetails":true');
  });

  it("exports the save as a download on the web", async () => {
    const user = userEvent.setup();
    const data = saveCampaign(campaignAfter(ashAndBanner, 1));
    useFlow.setState({ store: memoryStore(data), settingsOpen: true });
    const created: Blob[] = [];
    vi.stubGlobal("URL", { ...URL, createObjectURL: (blob: Blob) => (created.push(blob), "blob:save"), revokeObjectURL: vi.fn() });
    const clicked: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "Export save file…" }));
    expect(await screen.findByText("Save file exported.")).toBeInTheDocument();
    expect(clicked[0]).toMatchObject({ download: EXPORT_FILE_NAME });
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(created[0]);
    });
    expect(text).toBe(data);
    click.mockRestore();
  });

  it("asks Electron's main process for the export, passing nothing (it reads its own save)", async () => {
    const user = userEvent.setup();
    const exporter = vi.fn(async (..._args: unknown[]) => ({ exported: false, reason: "no-save" }));
    vi.stubGlobal("doctrineOfWar", { platform: "darwin", saves: { read: async () => null, write: async () => {}, export: exporter } });
    useFlow.setState({ settingsOpen: true });
    render(<Root />);
    await user.click(screen.getByRole("button", { name: "Export save file…" }));
    expect(await screen.findByText("There is no saved campaign yet.")).toBeInTheDocument();
    expect(exporter).toHaveBeenCalledWith();
  });
});

describe("render and music settings (T20)", () => {
  it("sets depth of field (pushed to the renderer) and the music volume", async () => {
    const user = userEvent.setup();
    useFlow.setState({ settingsOpen: true });
    render(<Root />);
    const dof = screen.getByRole("radiogroup", { name: "Depth of field" });
    expect(within(dof).getByRole("radio", { name: "Subtle" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(dof).getByRole("radio", { name: "Off" }));
    expect(useSettings.getState().depthOfField).toBe("off");
    expect(useAppStore.getState().dofMode).toBe("off");
    const music = screen.getByRole("slider", { name: "Music volume" });
    fireEvent.change(music, { target: { value: "25" } });
    expect(useAudioStore.getState().musicVolume).toBeCloseTo(0.25);
    act(() => useSettings.getState().set({ depthOfField: "subtle" }));
  });
});

describe("the Settings dialog", () => {
  it("opens at its top: focus lands on the heading, not on Done at the foot of a long list", () => {
    useFlow.setState({ settingsOpen: true });
    render(<Root />);
    expect(screen.getByRole("heading", { name: "Settings" })).toHaveFocus();
  });

  it("groups its rows in two columns: Display & motion and Rules | Sound & pace and Help & support", () => {
    useFlow.setState({ settingsOpen: true });
    render(<Root />);
    const columns = [...document.querySelectorAll(".settings-columns > .settings-column")];
    expect(columns).toHaveLength(2);
    const outline = columns.map((column) =>
      [...column.querySelectorAll(".settings-section, .settings-title")].map((node) => node.textContent),
    );
    expect(outline).toEqual([
      ["Display & motion", "Graphics", "Depth of field", "Motion", "Rules", "Doctrine only", "Doctrine editor"],
      ["Sound & pace", "Sound", "Music", "Battle pace", "Help & support", "Guidance", "Show battle details", "Export save file"],
    ]);
  });
});
