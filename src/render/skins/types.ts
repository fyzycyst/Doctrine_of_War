import type { TerrainType } from "../../game/board";
import type { FactionId } from "../../game/types";

/**
 * A Skin is the complete "look" of the diorama as data. Scenarios only speak
 * semantically (time of day, weather); the active skin decides how that looks.
 * Renderer components read colors and tuning from the active skin and never
 * hard-code them.
 */

/** Semantic time-of-day / weather keys a scenario may request. */
export type TimeOfDay = "dusk" | "nightFires" | "rainGrey" | "predawn" | "sunrise";

export const TIME_OF_DAY_KEYS: TimeOfDay[] = ["dusk", "nightFires", "rainGrey", "predawn", "sunrise"];

export type Hex = string; // "#rrggbb"

export interface TerrainStyle {
  /** Top-surface colour of the tile. */
  top: Hex;
  /** Top of the tile above the island base, in world units (hex radius = 1). */
  height: number;
  /** Optional secondary colour (road strip, rocks, masonry, riverbed…). */
  accent?: Hex;
}

export interface FactionStyle {
  /** Main cloth / tabard colour. */
  primary: Hex;
  /** Secondary cloth / trim colour. */
  secondary: Hex;
  /** Helmet / armour metal. */
  metal: Hex;
  /** Small accents only (plume, belt buckle, shield boss, finial). */
  trim: Hex;
  /** Ember glints (emissive spear tips / helm spikes); 0 = none. */
  glint: number;
  /** Shield face. */
  shield: Hex;
  /** Banner cloth colours and emblem. */
  bannerCloth: Hex;
  bannerEmblem: Hex;
  /** Cohesion ring + rim highlight colour (emissive, HDR-friendly). */
  glow: Hex;
  skin: Hex;
  /** Multiplier on the skin's figure rim light (dark factions need more). */
  rim: number;
}

export interface MaterialStyle {
  /** "standard" = PBR-lite, "toon" = banded diffuse. */
  shading: "standard" | "toon";
  /** Draw an ink outline pass around figures and props. */
  outline: boolean;
  outlineColor: Hex;
  roughness: number;
  /** Per-tile brightness/hue jitter (0..1). */
  tileJitter: number;
}

export interface FigureStyle {
  /** World height of a figure, including base. */
  height: number;
  /** Fresnel rim light strength so figures pop off terrain. */
  rimStrength: number;
  /** Idle bob amplitude in world units. */
  bobAmplitude: number;
  /** Min/max figures in a full-strength squad (tech plan D7: 6–9). */
  maxFigures: number;
}

export interface IslandStyle {
  cliffTop: Hex;
  cliffBottom: Hex;
  /** Rock strata banding colour. */
  strata: Hex;
  shoreTop: Hex;
  foliage: Hex;
  foliageDark: Hex;
  trunk: Hex;
  water: Hex;
  waterDeep: Hex;
}

export interface GradingParams {
  saturation: number; // -1..1 (HueSaturation)
  contrast: number; // -1..1 (BrightnessContrast)
  brightness: number;
  /** Split toning: tint pushed into shadows and highlights. */
  shadowTint: Hex;
  highlightTint: Hex;
  splitStrength: number;
  vignetteDarkness: number;
  vignetteOffset: number;
  bloomIntensity: number;
  bloomThreshold: number;
  tiltShiftBlur: number;
}

/**
 * Lighting is data: one rig, swappable values. Directions use azimuth in degrees
 * (0 = +x / east, 90 = -z / north) and elevation in degrees above the horizon.
 */
export interface LightingPreset {
  id: TimeOfDay;
  label: string;
  sky: { zenith: Hex; mid: Hex; horizon: Hex; below: Hex };
  sun: { color: Hex; intensity: number; azimuth: number; elevation: number };
  /** Cool counter-light from the Host's (west) side. */
  fill: { color: Hex; intensity: number; azimuth: number; elevation: number };
  hemisphere: { sky: Hex; ground: Hex; intensity: number };
  fog: { color: Hex; near: number; far: number };
  mist: { color: Hex; density: number; height: number; speed: number };
  particles: { kind: "embers" | "rain" | "ash"; rate: number; color: Hex; speed: number; size: number };
  /** Point-light fires (braziers, burning river). 0 = none. */
  fires: { color: Hex; intensity: number };
  /** Emissive glow on water (burning river at night). */
  waterGlow: number;
  /** Cliff sides fade toward this colour with depth (should match the lower sky). */
  cliffFade: Hex;
  exposure: number;
  toneMapping: "agx" | "aces";
  grading: GradingParams;
}

export interface Skin {
  id: string;
  label: string;
  terrain: Record<TerrainType, TerrainStyle>;
  factions: Record<FactionId, FactionStyle>;
  island: IslandStyle;
  material: MaterialStyle;
  figures: FigureStyle;
  lighting: Record<TimeOfDay, LightingPreset>;
}
