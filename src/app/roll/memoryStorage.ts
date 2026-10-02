// An in-memory key-value storage (dev `?mockRoll=…` and tests): the engine's own
// localStorageCampaignStore runs over it, so mocks exercise the real save code.
export function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}
