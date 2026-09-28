// Where saves live: localStorage on the web, a single userData file in Electron
// (through the preload bridge, window.doctrineOfWar.saves). Both store the string
// produced by saveCampaign(); loading always goes through loadCampaign() validation.
import { loadCampaign, saveCampaign, CampaignSaveError } from "./save";
import type { CampaignDefinition, CampaignState } from "./types";

export interface SaveStore {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
}

/** The Electron preload bridge (see electron/preload.ts). */
export interface SavesBridge {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
}

export const LOCAL_STORAGE_KEY = "doctrine-of-war:campaign";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** The browser's localStorage, or null where touching it throws (blocked site data, some previews). */
function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** `storage` null means none is available: reads and writes then throw. */
export function localStorageStore(
  storage: KeyValueStorage | null = browserStorage(),
  key = LOCAL_STORAGE_KEY,
): SaveStore {
  return {
    async read() {
      if (!storage) throw new CampaignSaveError("local storage is not available");
      return storage.getItem(key);
    },
    async write(data) {
      if (!storage) throw new CampaignSaveError("local storage is not available");
      storage.setItem(key, data);
    },
  };
}

export function electronStore(bridge: SavesBridge): SaveStore {
  return { read: () => bridge.read(), write: (data) => bridge.write(data) };
}

/** Electron's userData file when the preload bridge is present, else localStorage. */
export function defaultStore(): SaveStore {
  const bridge = typeof window === "undefined" ? undefined : window.doctrineOfWar?.saves;
  return bridge ? electronStore(bridge) : localStorageStore();
}

export async function saveCampaignTo(store: SaveStore, state: CampaignState): Promise<void> {
  await store.write(saveCampaign(state));
}

/** null when there is no save yet; throws CampaignSaveError when the save is unusable. */
export async function loadCampaignFrom(store: SaveStore, definition: CampaignDefinition): Promise<CampaignState | null> {
  const data = await store.read();
  return data === null ? null : loadCampaign(data, definition);
}
