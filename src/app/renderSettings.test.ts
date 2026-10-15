import { describe, expect, it } from "vitest";
import { SETTINGS_STORAGE_KEY, useSettings } from "./settingsStore";
import { useAppStore } from "./store";

// T20: render-facing settings the UI agent wires into the Settings panel.
describe("depth of field setting", () => {
  it("defaults to subtle, persists, and reaches the renderer's store", () => {
    expect(useSettings.getState().depthOfField).toBe("subtle");
    expect(useAppStore.getState().dofMode).toBe("subtle");
    useSettings.getState().set({ depthOfField: "off" });
    expect(useAppStore.getState().dofMode).toBe("off");
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"depthOfField":"off"');
    useSettings.getState().set({ depthOfField: "subtle" });
  });

  it("tracks the playback focus company without redundant writes", () => {
    const app = useAppStore.getState();
    app.setFocusSquad("greyford_shields");
    const before = useAppStore.getState();
    app.setFocusSquad("greyford_shields");
    expect(useAppStore.getState()).toBe(before);
    app.setFocusSquad(null);
    expect(useAppStore.getState().focusSquadId).toBeNull();
  });
});
