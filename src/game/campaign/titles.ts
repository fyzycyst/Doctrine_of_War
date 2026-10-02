// Renown titles, generated deterministically from a company id. The word lists are
// original content; extend them freely (existing titles only change if their index
// shifts, so append rather than insert).

const DEEDS_FIRST = ["Gate", "Ford", "Ember", "Ash", "Dawn", "Lantern", "Wall", "Bridge", "Cinder", "Banner", "Thorn", "Flint"];
const DEEDS_SECOND = ["breakers", "wardens", "keepers", "holders", "walkers", "menders", "binders", "callers"];
const EPITHETS = [
  "The Unbowed",
  "The Last Lanterns",
  "The Steadfast",
  "The Emberproof",
  "The Unbroken Line",
  "The Dawn-Sworn",
  "The Grey Wall",
  "The Unyielding",
];

/** 32-bit FNV-1a: stable across platforms and runs. */
export function hashId(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function candidate(companyId: string, attempt: number): string {
  const hash = hashId(attempt === 0 ? companyId : `${companyId}#${attempt}`);
  if (hash % 3 === 0) {
    return EPITHETS[(hash >>> 2) % EPITHETS.length];
  }
  const first = DEEDS_FIRST[(hash >>> 2) % DEEDS_FIRST.length];
  const second = DEEDS_SECOND[(hash >>> 8) % DEEDS_SECOND.length];
  return `The ${first}${second}`;
}

/**
 * A renown title for `companyId`, e.g. "The Gatebreakers". Deterministic; if another
 * company already holds the same title it rerolls deterministically.
 */
export function renownTitle(companyId: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const title = candidate(companyId, attempt);
    if (!used.has(title)) {
      return title;
    }
  }
  return `The ${companyId.replace(/_/g, " ")} Company`;
}

/** Every title renownTitle() could ever give `companyId` (any set of titles already taken). */
export function possibleRenownTitles(companyId: string): Set<string> {
  const titles = new Set<string>();
  for (let attempt = 0; attempt < 64; attempt += 1) titles.add(candidate(companyId, attempt));
  titles.add(`The ${companyId.replace(/_/g, " ")} Company`);
  return titles;
}
