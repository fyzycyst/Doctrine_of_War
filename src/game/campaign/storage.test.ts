import { afterEach, describe, expect, it } from "vitest";
import { startCampaign } from "./campaign";
import { ashAndBanner } from "./definition";
import { CampaignSaveError } from "./save";
import {
  defaultStore,
  electronStore,
  loadCampaignFrom,
  LOCAL_STORAGE_KEY,
  localStorageStore,
  saveCampaignTo,
  type SavesBridge,
} from "./storage";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

function memoryBridge(): SavesBridge & { data: string | null } {
  const bridge = {
    data: null as string | null,
    read: async () => bridge.data,
    write: async (data: string) => {
      bridge.data = data;
    },
  };
  return bridge;
}

describe("save stores", () => {
  afterEach(() => {
    delete window.doctrineOfWar;
    window.localStorage.clear();
  });

  it("localStorage: no save yet is null; a save round-trips", async () => {
    const storage = memoryStorage();
    const store = localStorageStore(storage);
    expect(await loadCampaignFrom(store, ashAndBanner)).toBeNull();
    const state = startCampaign(ashAndBanner);
    await saveCampaignTo(store, state);
    expect(storage.items.has(LOCAL_STORAGE_KEY)).toBe(true);
    expect(await loadCampaignFrom(store, ashAndBanner)).toEqual(state);
  });

  it("localStorage: a tampered save is rejected, not half-loaded", async () => {
    const storage = memoryStorage();
    storage.setItem(LOCAL_STORAGE_KEY, '{"version":1,"campaign":{"campaignId":"ash_and_banner"}}');
    await expect(loadCampaignFrom(localStorageStore(storage), ashAndBanner)).rejects.toThrow(CampaignSaveError);
  });

  it("localStorage unavailable fails loudly", async () => {
    await expect(localStorageStore(null).read()).rejects.toThrow(/not available/);
    await expect(localStorageStore(null).write("{}")).rejects.toThrow(/not available/);
  });

  it("localStorage method failures become CampaignSaveError", async () => {
    const quota = new Error("quota");
    quota.name = "QuotaExceededError";
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw quota;
      },
    };
    const store = localStorageStore(throwing);
    await expect(store.read()).rejects.toThrow(CampaignSaveError);
    await expect(loadCampaignFrom(store, ashAndBanner)).rejects.toThrow(/could not be read/);
    await expect(saveCampaignTo(store, startCampaign(ashAndBanner))).rejects.toThrow(CampaignSaveError);
    await expect(store.write("{}")).rejects.toThrow(/could not be written \(QuotaExceededError\)/);
  });

  it("Electron: goes through the preload bridge", async () => {
    const bridge = memoryBridge();
    const state = startCampaign(ashAndBanner);
    await saveCampaignTo(electronStore(bridge), state);
    expect(JSON.parse(bridge.data!).version).toBe(1);
    expect(await loadCampaignFrom(electronStore(bridge), ashAndBanner)).toEqual(state);
  });

  it("defaultStore picks the Electron bridge when present, else localStorage", async () => {
    const state = startCampaign(ashAndBanner);
    await saveCampaignTo(defaultStore(), state);
    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).not.toBeNull();

    const bridge = memoryBridge();
    window.doctrineOfWar = { platform: "darwin", saves: bridge };
    await saveCampaignTo(defaultStore(), state);
    expect(bridge.data).not.toBeNull();
  });
});
