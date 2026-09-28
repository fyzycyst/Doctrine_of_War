import { emberDusk } from "./emberDusk";
import type { LightingPreset, Skin, TimeOfDay } from "./types";

/**
 * ROUGH STUB of mood board C (Illuminated Chronicle), only here to prove that
 * swapping skins works end to end. Bright even daylight, parchment palette,
 * toon shading and the ink-outline flag on. Not art-directed yet.
 */
const C = {
  parchment: "#f1e6cc",
  vellum: "#e8d7b2",
  field: "#a8b86a",
  road: "#dbb77c",
  water: "#6aa6c9",
  stone: "#dcd1b8",
  earth: "#b08858",
  ultramarine: "#2446a8",
  vellumWhite: "#f4ecd8",
  goldLeaf: "#d9a520",
  soot: "#211b1b",
  vermilion: "#c8321e",
  ink: "#2a1d14",
} as const;

function daylight(base: LightingPreset): LightingPreset {
  return {
    ...base,
    sky: { zenith: C.parchment, mid: C.vellum, horizon: "#d8bf8e", below: "#c8ad80" },
    sun: { ...base.sun, color: "#fff2cc", intensity: 2.6, elevation: 55 },
    fill: { ...base.fill, color: "#fff6e0", intensity: 0.8 },
    hemisphere: { sky: "#fff6e0", ground: "#b08858", intensity: 1.4 },
    fog: { color: C.vellum, near: 40, far: 90 },
    mist: { ...base.mist, color: C.parchment, density: base.id === "rainGrey" ? 0.5 : 0.15 },
    fires: { ...base.fires, intensity: 0 },
    waterGlow: 0,
    cliffFade: "#c8ad80",
    exposure: 1,
    toneMapping: "agx",
    grading: {
      ...base.grading,
      saturation: 0.15,
      contrast: 0.05,
      splitStrength: 0,
      vignetteDarkness: 0.2,
      bloomIntensity: 0.2,
      tiltShiftBlur: 0.08,
    },
  };
}

const lighting = Object.fromEntries(
  Object.entries(emberDusk.lighting).map(([key, preset]) => [key, daylight(preset)]),
) as Record<TimeOfDay, LightingPreset>;

export const illuminatedChronicle: Skin = {
  id: "illuminatedChronicle",
  label: "Illuminated Chronicle (stub)",
  terrain: {
    field: { top: C.field, height: 0.3 },
    road: { top: C.field, height: 0.3, accent: C.road },
    ford: { top: C.earth, height: 0.08, accent: C.water },
    river: { top: C.earth, height: -0.12, accent: C.water },
    ridge: { top: "#c4b894", height: 0.72, accent: C.stone },
    wall: { top: C.stone, height: 0.38, accent: C.stone },
    ruin: { top: "#b8b48a", height: 0.36, accent: C.stone },
  },
  factions: {
    free_banners: {
      primary: C.ultramarine,
      secondary: C.vellumWhite,
      metal: "#c8ccd4",
      trim: C.goldLeaf,
      glint: 0,
      shield: C.vellumWhite,
      bannerCloth: C.ultramarine,
      bannerEmblem: C.goldLeaf,
      glow: C.goldLeaf,
      skin: "#e8c0a0",
      rim: 1,
    },
    ashen_host: {
      primary: C.soot,
      secondary: C.vermilion,
      metal: "#5a4a40",
      trim: C.vermilion,
      glint: 0,
      shield: C.vermilion,
      bannerCloth: C.vermilion,
      bannerEmblem: C.soot,
      glow: C.vermilion,
      skin: "#b89880",
      rim: 1,
    },
  },
  island: {
    cliffTop: C.earth,
    cliffBottom: "#5e4226",
    strata: "#9a7448",
    shoreTop: "#98a860",
    foliage: "#7c9a48",
    foliageDark: "#5a7a38",
    trunk: "#6e4f2e",
    water: C.water,
    waterDeep: "#3a78a0",
  },
  material: {
    shading: "toon",
    outline: true,
    outlineColor: C.ink,
    roughness: 1,
    tileJitter: 0.05,
  },
  figures: { ...emberDusk.figures, rimStrength: 0.15 },
  lighting,
};
