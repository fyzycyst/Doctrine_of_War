// The player's doctrine variants (T16, Experimental): their own versioned store,
// apart from the campaign save. localStorage on the web, a fixed userData file in
// Electron (window.doctrineOfWar.variants). Everything read or saved goes through the
// engine's validator; a variant that fails it is dropped and its base plays instead.
import { create } from "zustand";
import { localStorageStore, type SaveStore } from "../../game/campaign";
import {
  doctrineLibrary,
  EDITABLE_DOCTRINE_IDS,
  MAX_VARIANTS,
  parseVariants,
  serializeVariants,
  validateVariant,
  type CheckedVariant,
  type Doctrine,
  type DoctrineVariant,
} from "../../game/engine";

export const VARIANTS_STORAGE_KEY = "doctrine-of-war:variants";

export function defaultVariantsStore(): SaveStore {
  const bridge = typeof window === "undefined" ? undefined : window.doctrineOfWar?.variants;
  return bridge ? { read: () => bridge.read(), write: (data) => bridge.write(data) } : localStorageStore(undefined, VARIANTS_STORAGE_KEY);
}

export type SaveResult = { ok: true; variant: DoctrineVariant; doctrine: Doctrine } | { ok: false; errors: string[] };

interface VariantsState {
  status: "idle" | "loading" | "ready";
  variants: CheckedVariant[];
  /** Plain words for the player: an unreadable file, dropped variants, a failed save. */
  notice: string | null;
  store: SaveStore;
  load: () => Promise<void>;
  /** Validates, then saves (replacing a variant with the same id). */
  save: (variant: DoctrineVariant) => Promise<SaveResult>;
  remove: (id: string) => Promise<void>;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

export const useVariants = create<VariantsState>((set, get) => {
  async function write(next: CheckedVariant[]): Promise<boolean> {
    const previous = get().variants;
    set({ variants: next });
    try {
      await get().store.write(serializeVariants(next.map((item) => item.variant)));
      set({ notice: null });
      return true;
    } catch (error) {
      set({ variants: previous, notice: `Your variants could not be saved (${reason(error)}).` });
      return false;
    }
  }

  return {
    status: "idle",
    variants: [],
    notice: null,
    store: defaultVariantsStore(),

    load: async () => {
      set({ status: "loading" });
      try {
        const data = await get().store.read();
        const { variants, dropped } = data === null ? { variants: [], dropped: 0 } : parseVariants(data);
        set({
          status: "ready",
          variants,
          notice: dropped ? `${dropped} saved ${dropped === 1 ? "variant no longer fits its" : "variants no longer fit their"} doctrine and ${dropped === 1 ? "was" : "were"} set aside; the standard orders play instead.` : null,
        });
      } catch (error) {
        // Fail closed: no variants at all, the standard doctrines play.
        set({ status: "ready", variants: [], notice: `Your saved variants could not be read (${reason(error)}); the standard doctrines play.` });
      }
    },

    save: async (raw) => {
      const checked = validateVariant(raw, doctrineLibrary, EDITABLE_DOCTRINE_IDS);
      if (!checked.ok) return checked;
      const { variants } = get();
      const others = variants.filter((item) => item.variant.id !== checked.variant.id);
      if (others.length >= MAX_VARIANTS) return { ok: false, errors: [`You can keep up to ${MAX_VARIANTS} variants. Delete one first.`] };
      if (others.some((item) => item.variant.name.toLowerCase() === checked.variant.name.toLowerCase())) {
        return { ok: false, errors: ["Another variant already has that name."] };
      }
      const entry = { variant: checked.variant, doctrine: checked.doctrine };
      const index = variants.findIndex((item) => item.variant.id === checked.variant.id);
      const next = index < 0 ? [...variants, entry] : variants.map((item, i) => (i === index ? entry : item));
      return (await write(next)) ? checked : { ok: false, errors: [get().notice ?? "Could not save."] };
    },

    remove: async (id) => {
      await write(get().variants.filter((item) => item.variant.id !== id));
    },
  };
});

/** A fresh id for a new variant: v-<base>-<name slug>, unique among `taken`. */
export function variantId(baseId: string, name: string, taken: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "cut";
  const stem = `v-${baseId}-${slug}`;
  let id = stem;
  for (let n = 2; taken.includes(id); n += 1) id = `${stem}-${n}`;
  return id;
}

/** Variants are Experimental: every surface that shows one says so. */
export const isVariantId = (id: string | null | undefined): boolean => Boolean(id?.startsWith("v-"));
