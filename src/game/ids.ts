// Ids that untrusted data (packs, saves) may never use: they name Object.prototype
// members, so as keys or lookups they could reach the prototype instead of own data.
export const RESERVED_IDS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** True for a plain lowercase id ([a-z0-9_], 1..64) that is not reserved. */
export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value) && !RESERVED_IDS.has(value);
}
