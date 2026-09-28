// Small heraldic glyphs: role marks for the roster and faction sigils for the cards.
// Decorative only (aria-hidden); the text beside them carries the meaning.
import type { FactionId, SquadRole } from "../../game/engine";

const ROLE_PATHS: Record<SquadRole, string> = {
  // Heater shield.
  frontline: "M4 3h16v7c0 5.5-3.6 9.2-8 11-4.4-1.8-8-5.5-8-11z",
  // Arrow in flight.
  skirmish: "M3 21 17 7M17 7h-5M17 7v5M17 7l3-3M5 16l3 3M8 13l3 3",
  // Standard on a pole.
  support: "M6 22V2M6 3h13l-3 4 3 4H6",
  // Horseshoe.
  cavalry: "M6 4v8a6 6 0 0 0 12 0V4M6 7h3M15 7h3",
  // Ram head on a beam.
  siege: "M2 14h13M15 10h4a3 3 0 0 1 0 6h-4zM5 14v5M11 14v5",
};

export const ROLE_NAME: Record<SquadRole, string> = {
  frontline: "Line infantry",
  skirmish: "Skirmishers",
  support: "Standard bearers",
  cavalry: "Cavalry",
  siege: "Siege crew",
};

export function RoleGlyph({ role, size = 18 }: { role: SquadRole; size?: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ROLE_PATHS[role]} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Free Banners: a swallowtail pennant with a star. Ashen Host: an ember in a broken ring. */
export function Sigil({ faction, size = 22 }: { faction: FactionId; size?: number }) {
  if (faction === "free_banners") {
    return (
      <svg className="sigil sigil-banners" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 2v20" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M5 3h15l-4 5 4 5H5z" fill="var(--lapis)" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
        <path d="m11 5.2.8 1.7 1.8.2-1.3 1.2.4 1.8-1.7-.9-1.6.9.3-1.8-1.3-1.2 1.8-.2z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="sigil sigil-host" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 7.5A8.5 8.5 0 1 1 12 3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M12 7c2.6 2.6 3.4 4.6 2.4 6.8-.7 1.5-2.1 2.2-3.4 2-1.9-.3-3-2-2.4-4 .3 1 .9 1.5 1.6 1.4C9.7 11 10.6 9 12 7z" fill="var(--ember)" />
    </svg>
  );
}

/** The wax seal's embossed mark: the Banners' star inside a ring of ticks. */
export function SealMark({ size = 44 }: { size?: number }) {
  const ticks = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `M${24 + Math.cos(a) * 17} ${24 + Math.sin(a) * 17}L${24 + Math.cos(a) * 20} ${24 + Math.sin(a) * 20}`;
  }).join("");
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="14.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d={ticks} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="m24 14.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="currentColor" />
    </svg>
  );
}
