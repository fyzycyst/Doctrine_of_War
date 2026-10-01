/**
 * Pure mapping from what the scene looks like to how loud each ambient bed is.
 * Beds are synthesized in the audio engine (see engine.ts).
 */

export type AmbientBed = "wind" | "rain" | "river" | "drums" | "fire";
export const AMBIENT_BEDS: AmbientBed[] = ["wind", "rain", "river", "drums", "fire"];

export interface AmbienceSpec {
  /** Renderer time of day (skin lighting preset key). */
  timeOfDay: "dusk" | "nightFires" | "rainGrey" | "predawn" | "sunrise";
  weather: "clear" | "rain" | "mist" | "ashWind";
  /** The board has a river or fords. */
  water: boolean;
  /** The Host is on the field (distant war drums). */
  hostDrums: boolean;
}

export function ambienceMix(spec: AmbienceSpec): Record<AmbientBed, number> {
  const night = spec.timeOfDay === "nightFires" || spec.timeOfDay === "predawn";
  const raining = spec.weather === "rain" || spec.timeOfDay === "rainGrey";
  let wind = night ? 0.18 : 0.26;
  if (spec.weather === "mist") wind = 0.12;
  if (raining) wind = 0.34;
  if (spec.weather === "ashWind") wind = 0.62;
  const rain = raining ? (spec.weather === "rain" ? 0.7 : 0.55) : 0;
  const river = spec.water ? (raining ? 0.22 : 0.34) : 0;
  // Louder since playtest 1; the engine's battle intensity rides on top.
  let drums = spec.hostDrums ? (night ? 0.85 : 0.72) : 0;
  if (spec.hostDrums && spec.weather === "ashWind") drums += 0.08;
  const fire = spec.timeOfDay === "nightFires" ? 0.45 : spec.timeOfDay === "predawn" ? 0.18 : 0;
  return { wind, rain, river, drums, fire };
}
