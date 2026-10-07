// Cinder Road, battle 5, the finale: Break the Strongpoint. The Banners come back to Greyford
// Gate, where the intro began, and this time the Host holds it: the Kept Coal's main body, the
// sworn who carry live coals from the first kiln, stand before the gate, and every Host company
// here is sworn (Resolve 3: they do not waver). The whole army takes the field.
// Lesson (the Advance and the standards; First Breach turned round): the march breaks the gate,
// and a banner carried with the assault keeps it on its feet. The sworn line and the No Step
// Back flanks grind the assault on the way in and at the wall, so without a banner every company
// falls back (Bring the Water steadies below 30 cohesion) before the gate breaks. The Kept Coal's dread,
// on the ash-wind, hits the less famous companies hardest. Roles (by function, declared on the
// battle sheet): the breach (a company strikes the gate; only Bring the Water can) and the banner
// (a rally restores an assault company, observed when it fires; only Rescue Standard rallies). The intended plan carries two banners;
// one, on either post, is an accepted filler (the second banner's post is the stronger and the
// tracked alternative; the standard alone is weak on a battered army).
// The Banners' squads are authored at fame 18, one above the recovery force's, not the curated
// path's: the Roll's threat then never eases the sworn's Resolve, and hardens the Host by +12 strength a company for a famous
// army, which the battle's 10 Host companies turn into a real difference (docs/CAMPAIGN.md).
// Registered in the First Call pack (packs/registry.ts), not in the intro's scenario list.
import type { EngineScenario } from "../types";
import { GREYFORD_GATE, greyfordGateBoard } from "./greyfordGate.board";

export { GREYFORD_GATE };

// The finale's deployment: the Banners on the bank west of the field, the Host before the wall.
const board = greyfordGateBoard();

const BANNERS = "free_banners" as const;
const HOST = "ashen_host" as const;
const BTW = "bring_the_water";

export const cinderRoad6: EngineScenario = {
  id: "cinder_road_greyford_gate",
  title: "Break the Strongpoint",
  briefing:
    "We are back where it began: Greyford Gate. This time the Host holds it. The Kept Coal stand before the gate with coals from the first kiln, " +
    "and every company on that wall is sworn: they do not waver, and they do not step back. " +
    "They will grind down any assault on the way in and at the wall; only the standards keep it on its feet, so carry the banners with it. " +
    "Their coals smoke on the wind all day, and the companies that have seen least will feel the Kept Coal most. " +
    "Bring the whole army, break the gate, and do not lose four companies.",
  playerFaction: BANNERS,
  initiativeSide: BANNERS,
  // A long day (14 phases): the battered recovery force's assault needs the hours (its losses
  // are partly the timeout), while an assault that sequences its strong companies to break the
  // sworn line without the standards gains nothing from them (the CR6 warden's partial rush).
  maxPhases: 14,
  timeOfDay: "day",
  // The Kept Coal's coals smoke on the wind: ash-wind all day (dread from the Host x1.5; it
  // bites the less famous companies, which are below the sworn's Resolve).
  forecast: { start: "ashWind", shiftChance: 0, shifts: ["ashWind"] },
  curatedSeed: 58,
  board,
  objectives: [
    {
      id: "greyford_gate",
      name: "Greyford Gate",
      description: "The Host holds our gate. Break it.",
      hex: GREYFORD_GATE,
      // 25 blows' worth: a fresh second wave cannot finish the gate alone; banners keep the
      // assault on it (the partial rush: docs/CAMPAIGN.md, battle 5).
      integrity: 25,
      defender: HOST,
    },
  ],
  playerDoctrineIds: ["bring_the_water", "shield_the_line", "fighting_withdrawal", "rescue_standard", "clean_counterstroke", "hold_for_dawn"],
  squads: [
    // The posts of the Cinder Road call (squad id = slot id): the whole army.
    // Authored at fame 18, one above the recovery ("rough") force's 17 on the path through the
    // pursuit (the Brightcrag Riders as that path leaves them, Resolve 1), not the curated path's
    // 31: the Roll's threat then never eases the sworn's Resolve (it stays 3 on every call: they
    // do not waver), eases the recovery force's Host by 2 strength a company, and hardens it for
    // a famous army (+2 strength a fame point, capped at +12).
    // The Roll replaces these with the companies it fields. The banners stand in the front row
    // with the vans: Rescue Standard only moves when an ally falls below 50, so a banner posted
    // behind the march arrives after the assault has already broken.
    { id: "north_van", name: "Coldwater Shields", faction: BANNERS, role: "frontline", hex: { q: 2, r: 2 }, strength: 84, cohesion: 74, resolve: 3, doctrineId: BTW },
    { id: "gate_van", name: "Ferrymoot Pikes", faction: BANNERS, role: "frontline", hex: { q: 1, r: 3 }, strength: 80, cohesion: 70, resolve: 3, doctrineId: BTW },
    { id: "road_van", name: "Sedgewick Levy", faction: BANNERS, role: "frontline", hex: { q: 1, r: 4 }, strength: 72, cohesion: 64, resolve: 3, doctrineId: BTW },
    { id: "south_van", name: "Thornwick Spears", faction: BANNERS, role: "frontline", hex: { q: 2, r: 5 }, strength: 76, cohesion: 68, resolve: 1, doctrineId: BTW },
    { id: "standard", name: "Wickmere Standard", faction: BANNERS, role: "support", hex: { q: 2, r: 3 }, strength: 52, cohesion: 82, resolve: 3, doctrineId: "rescue_standard" },
    { id: "bows", name: "Morningwall Slingers", faction: BANNERS, role: "skirmish", hex: { q: 2, r: 4 }, strength: 62, cohesion: 68, resolve: 0, doctrineId: "rescue_standard" },
    { id: "lances", name: "Brightcrag Riders", faction: BANNERS, role: "cavalry", hex: { q: 1, r: 1 }, strength: 68, cohesion: 64, resolve: 1, doctrineId: BTW },
    { id: "riders", name: "Sunward Lances", faction: BANNERS, role: "cavalry", hex: { q: 1, r: 6 }, strength: 72, cohesion: 66, resolve: 2, doctrineId: BTW },
    { id: "slingers", name: "Heronwick Bows", faction: BANNERS, role: "skirmish", hex: { q: 2, r: 6 }, strength: 64, cohesion: 70, resolve: 2, doctrineId: BTW },

    // The gate: the Kept Coal's main body and the sworn beside it, all of them sworn (Resolve 3).
    { id: "slagwall_oathguard", name: "Slagwall Oathguard", faction: HOST, role: "frontline", hex: { q: 7, r: 2 }, strength: 38, cohesion: 76, resolve: 3, doctrineId: "no_step_back", renown: { title: "The Kept Coal" } },
    { id: "kilnborn_oathguard", name: "Kiln-Born Oathguard", faction: HOST, role: "frontline", hex: { q: 7, r: 5 }, strength: 28, cohesion: 66, resolve: 3, doctrineId: "no_step_back" },
    // The wall-guards at the foot of Greyford Wall.
    { id: "north_wardens", name: "Coalward North", faction: HOST, role: "frontline", hex: { q: 7, r: 1 }, strength: 14, cohesion: 56, resolve: 3, doctrineId: "no_step_back" },
    { id: "south_wardens", name: "Coalward South", faction: HOST, role: "frontline", hex: { q: 7, r: 6 }, strength: 14, cohesion: 56, resolve: 3, doctrineId: "no_step_back" },
    // The sworn line before the gate: the assault must break it, then the gate.
    { id: "gate_ward", name: "Ashbound Gate-Ward", faction: HOST, role: "frontline", hex: { q: 6, r: 3 }, strength: 14, cohesion: 60, resolve: 3, doctrineId: "no_step_back" },
    { id: "coal_bearers", name: "Coal-Bearers", faction: HOST, role: "frontline", hex: { q: 6, r: 4 }, strength: 14, cohesion: 60, resolve: 3, doctrineId: "no_step_back" },
    // The sallies: out of the works at whoever reaches the wall. Pyre-Sworn waits in the Broken
    // Watch until phase 3 (hostSchedule): a north sally that charges from phase 1 could be
    // decoyed by an army holding its north flank back (the CR6 warden's partial rush).
    { id: "pyre_sworn", name: "Pyre-Sworn", faction: HOST, role: "frontline", hex: { q: 7, r: 0 }, strength: 24, cohesion: 60, resolve: 3, doctrineId: "lie_in_wait" },
    { id: "cindermaw_thralls", name: "Cinder-Born", faction: HOST, role: "frontline", hex: { q: 7, r: 7 }, strength: 20, cohesion: 54, resolve: 3, doctrineId: "terror_push" },
    // The hunters: they lie in the flank works, then go for whatever is weakest (the banners).
    { id: "ember_hunters", name: "Ember Hunters", faction: HOST, role: "skirmish", hex: { q: 5, r: 0 }, strength: 18, cohesion: 58, resolve: 3, doctrineId: "lie_in_wait" },
    { id: "ash_harriers", name: "Ash Harriers", faction: HOST, role: "skirmish", hex: { q: 5, r: 7 }, strength: 18, cohesion: 58, resolve: 3, doctrineId: "lie_in_wait" },
  ],
  hostSchedule: [
    { phase: 1, intent: "The Kept Coal stand before Greyford Gate with the first kiln's coals; the sworn wait in the works.", orders: {} },
    { phase: 2, intent: "The south works empty at whoever reaches the wall.", orders: {} },
    {
      phase: 3,
      intent: "The Pyre-Sworn burst from the Broken Watch, and the hunters slip out of the flank works for the banners.",
      orders: { pyre_sworn: "terror_push", ember_hunters: "cull_the_weak", ash_harriers: "cull_the_weak" },
    },
    { phase: 4, intent: "No step back: the sworn hold the gate while the coals still burn.", orders: {} },
    { phase: 5, intent: "The coals still burn; the ash-wind carries their smoke over the field.", orders: {} },
    { phase: 6, intent: "The morning is gone, and the sworn have not given a step.", orders: {} },
    { phase: 7, intent: "Noon over Greyford Wall.", orders: {} },
    { phase: 8, intent: "The coals still burn.", orders: {} },
    { phase: 9, intent: "The afternoon wears on; the ash-wind does not drop.", orders: {} },
    { phase: 10, intent: "The sun is on Greyford Wall.", orders: {} },
    { phase: 11, intent: "The shadows of the wall reach the siege field.", orders: {} },
    { phase: 12, intent: "The day is going.", orders: {} },
    { phase: 13, intent: "The light goes.", orders: {} },
    { phase: 14, intent: "Whatever still stands at nightfall, the Host keeps.", orders: {} },
  ],
  winCondition: { kind: "breakObjective", objectiveId: "greyford_gate" },
  // Four companies: the battered recovery force's assault loses partly to routs of its worn
  // companies, which a fourth company's grace helps far more than any assault without banners.
  defeatConditions: [{ kind: "squadsLost", count: 4 }],
  timeoutOutcome: "defeat",
  referencePlans: {
    // The march breaks the gate; two banners keep it on its feet on the way in and at the wall.
    intended: {
      north_van: BTW,
      gate_van: BTW,
      road_van: BTW,
      south_van: BTW,
      standard: "rescue_standard",
      bows: "rescue_standard",
      lances: BTW,
      riders: BTW,
      slingers: BTW,
    },
    // The strongest accepted filler (tracked, never gated): one banner, on the second banner's
    // post (the standard marches). The standard alone is the other one-banner filler, weaker on
    // a battered army; both are on the battle sheet.
    alternative: {
      north_van: BTW,
      gate_van: BTW,
      road_van: BTW,
      south_van: BTW,
      standard: BTW,
      bows: "rescue_standard",
      lances: BTW,
      riders: BTW,
      slingers: BTW,
    },
    // The bare assault: everyone at the gate, no banner.
    bad: {
      north_van: BTW,
      gate_van: BTW,
      road_van: BTW,
      south_van: BTW,
      standard: BTW,
      bows: BTW,
      lances: BTW,
      riders: BTW,
      slingers: BTW,
    },
  },
};
