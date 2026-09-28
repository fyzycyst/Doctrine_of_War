// The doctrine library: pure data. Each rule list is read top to bottom and the
// first rule whose condition matches fires. Labels are the player-facing text
// shown as a banner callout over the squad when the rule fires.
import type { Doctrine, DoctrineLibrary } from "./types";

export const doctrines: Doctrine[] = [
  // ---------------------------------------------------------------- Free Banners
  {
    id: "shield_the_line",
    faction: "free_banners",
    name: "Shield the Line",
    flavor: "Hold formation, protect the gate, and absorb pressure.",
    passives: { defense: 3, cohesion: 2, counter: 1 },
    rules: [
      {
        id: "stl_break",
        label: "If cohesion < 20 → fall back 1 hex",
        when: { kind: "selfCohesionBelow", value: 20 },
        then: { kind: "fallBack", hexes: 1 },
      },
      {
        id: "stl_brace",
        label: "If enemy adjacent → brace shields",
        when: { kind: "enemyAdjacent" },
        then: { kind: "hold" },
      },
      {
        id: "stl_hold",
        label: "Otherwise → hold the line",
        when: { kind: "always" },
        then: { kind: "hold" },
      },
    ],
  },
  {
    id: "fighting_withdrawal",
    faction: "free_banners",
    name: "Fighting Withdrawal",
    flavor: "Yield ground in order to preserve strength and cohesion.",
    passives: { defense: 1, cohesion: 3, counter: 0 },
    rules: [
      {
        id: "fw_rout_guard",
        label: "If cohesion < 50 → fall back 2 hexes",
        when: { kind: "selfCohesionBelow", value: 50 },
        then: { kind: "fallBack", hexes: 2 },
      },
      {
        id: "fw_give_ground",
        label: "If enemy adjacent → fall back 1 hex",
        when: { kind: "enemyAdjacent" },
        then: { kind: "fallBack", hexes: 1 },
      },
      {
        id: "fw_retreat",
        label: "If there is a line of retreat → withdraw along it",
        when: { kind: "retreatOpen" },
        then: { kind: "advance", toward: { kind: "exitEdge" } },
      },
      {
        id: "fw_ready",
        label: "Otherwise → hold, ready to withdraw",
        when: { kind: "always" },
        then: { kind: "hold" },
      },
    ],
  },
  {
    id: "rescue_standard",
    faction: "free_banners",
    name: "Rescue Standard",
    flavor: "Stabilize wounded allies and keep banners standing.",
    passives: { defense: 0, cohesion: 3, counter: 0 },
    rules: [
      {
        id: "rs_escort",
        label: "If the column pulls ahead → march at its side",
        when: { kind: "wardNear", minRange: 2, range: 3 },
        then: { kind: "advance", toward: { kind: "ward" } },
      },
      {
        id: "rs_rally",
        label: "If an adjacent ally's cohesion < 75 → rally them",
        when: { kind: "allyAdjacentBelow", stat: "cohesion", value: 75 },
        then: { kind: "rally" },
      },
      {
        id: "rs_seek",
        label: "If any ally's cohesion < 50 → go to the weakest ally",
        when: { kind: "allyBelow", stat: "cohesion", value: 50 },
        then: { kind: "advance", toward: { kind: "weakestAlly", stat: "cohesion" } },
      },
      {
        id: "rs_avoid",
        label: "If enemy adjacent → fall back 1 hex",
        when: { kind: "enemyAdjacent" },
        then: { kind: "fallBack", hexes: 1 },
      },
      {
        id: "rs_stand",
        label: "Otherwise → keep the standard raised",
        when: { kind: "always" },
        then: { kind: "hold" },
      },
    ],
  },
  {
    id: "clean_counterstroke",
    faction: "free_banners",
    name: "Clean Counterstroke",
    flavor: "Hold until the enemy overextends, then strike exposed units.",
    passives: { defense: 1, cohesion: 0, counter: 4 },
    rules: [
      {
        id: "cc_disengage",
        label: "If cohesion < 30 → fall back 1 hex",
        when: { kind: "selfCohesionBelow", value: 30 },
        then: { kind: "fallBack", hexes: 1 },
      },
      {
        id: "cc_strike",
        label: "If an enemy is overextended → counter-charge it",
        when: { kind: "enemyOverextended", range: 2 },
        then: { kind: "counterCharge", target: { kind: "overextendedEnemy", range: 2 } },
      },
      {
        id: "cc_answer",
        label: "If enemy adjacent → strike the nearest enemy",
        when: { kind: "enemyAdjacent" },
        then: { kind: "attack", target: { kind: "nearestEnemy" } },
      },
      {
        id: "cc_wait",
        label: "Otherwise → hold and watch",
        when: { kind: "always" },
        then: { kind: "hold" },
      },
    ],
  },
  {
    id: "hold_for_dawn",
    faction: "free_banners",
    name: "Hold for Dawn",
    flavor: "Conserve strength, refuse panic, and delay the breach.",
    passives: { defense: 1, cohesion: 4, counter: 0 },
    rules: [
      {
        id: "hfd_endure",
        label: "If enemy adjacent → brace and endure",
        when: { kind: "enemyAdjacent" },
        then: { kind: "hold" },
      },
      {
        id: "hfd_to_gate",
        label: "Otherwise → take position at the objective",
        when: { kind: "always" },
        then: { kind: "advance", toward: { kind: "objective", side: "own" } },
      },
    ],
  },

  // ---------------------------------------------------------------- Ashen Host
  {
    id: "iron_tide",
    faction: "ashen_host",
    name: "Iron Tide",
    flavor: "Press the line with steady infantry pressure. The tide does not ebb.",
    passives: { defense: 1, cohesion: 1, counter: 2 },
    rules: [
      {
        id: "it_press",
        label: "If enemy within 2 → attack the nearest enemy",
        when: { kind: "enemyWithin", range: 2 },
        then: { kind: "attack", target: { kind: "nearestEnemy" } },
      },
      {
        id: "it_march",
        label: "Otherwise → march on the objective",
        when: { kind: "always" },
        then: { kind: "attack", target: { kind: "objective", side: "enemy" } },
      },
    ],
  },
  {
    id: "break_the_gate",
    faction: "ashen_host",
    name: "Break the Gate",
    flavor: "Drive the siege crews into the weakest point. Nothing else matters.",
    passives: { defense: 0, cohesion: 0, counter: 2 },
    rules: [
      {
        id: "btg_batter",
        label: "If at the gate → batter it",
        when: { kind: "atObjective" },
        then: { kind: "attack", target: { kind: "objective", side: "enemy" } },
      },
      {
        id: "btg_drive",
        label: "Otherwise → drive on the gate, ramming anyone in the way",
        when: { kind: "always" },
        then: { kind: "attack", target: { kind: "objective", side: "enemy" } },
      },
    ],
  },
  {
    id: "no_step_back",
    faction: "ashen_host",
    name: "No Step Back",
    flavor: "Ground taken is never given. Those who turn are cut down by their own.",
    passives: { defense: 3, cohesion: 4, counter: 1 },
    rules: [
      {
        id: "nsb_strike",
        label: "If enemy adjacent → strike the nearest enemy",
        when: { kind: "enemyAdjacent" },
        then: { kind: "attack", target: { kind: "nearestEnemy" } },
      },
      {
        id: "nsb_stand",
        label: "Otherwise → stand where you were put",
        when: { kind: "always" },
        then: { kind: "hold" },
      },
    ],
  },
  {
    id: "cull_the_weak",
    faction: "ashen_host",
    name: "Cull the Weak",
    flavor: "Find the bleeding company and finish it. Mercy is a Banner word.",
    passives: { defense: 0, cohesion: 0, counter: 3 },
    rules: [
      {
        id: "ctw_hunt",
        label: "If a wavering enemy (cohesion < 50) is within 3 → hunt it down",
        when: { kind: "enemyBelow", stat: "cohesion", value: 50, range: 3 },
        then: { kind: "attack", target: { kind: "weakestEnemy", stat: "cohesion", range: 3 } },
      },
      {
        id: "ctw_bleed",
        label: "If enemy adjacent → strike the weakest adjacent enemy",
        when: { kind: "enemyAdjacent" },
        then: { kind: "attack", target: { kind: "weakestEnemy", stat: "strength", range: 1 } },
      },
      {
        id: "ctw_stalk",
        label: "Otherwise → stalk the weakest enemy",
        when: { kind: "always" },
        then: { kind: "advance", toward: { kind: "weakestEnemy", stat: "strength" } },
      },
    ],
  },
  {
    id: "terror_push",
    faction: "ashen_host",
    name: "Terror Push",
    flavor: "Run at them screaming. Spend the fodder; let fear do the rest.",
    passives: { defense: -1, cohesion: -1, counter: 4 },
    rules: [
      {
        id: "tp_charge",
        label: "If enemy within 3 → charge the nearest enemy",
        when: { kind: "enemyWithin", range: 3 },
        then: { kind: "counterCharge", target: { kind: "nearestEnemy" } },
      },
      {
        id: "tp_surge",
        label: "Otherwise → surge toward the objective",
        when: { kind: "always" },
        then: { kind: "advance", toward: { kind: "objective", side: "enemy" } },
      },
    ],
  },
  {
    id: "keep_the_column_moving",
    faction: "free_banners",
    name: "Keep the Column Moving",
    flavor: "Carts, children and the old: they do not stop, and they do not fight.",
    passives: { defense: 0, cohesion: 2, counter: 0 },
    rules: [
      {
        id: "kcm_move",
        label: "Always → keep moving toward safety",
        when: { kind: "always" },
        then: { kind: "advance", toward: { kind: "exitEdge" } },
      },
    ],
  },
  {
    id: "through_the_embers",
    faction: "ashen_host",
    name: "Through the Embers",
    flavor: "Wade the burning water and do not stop on the far bank. Whoever stands in the way is fuel.",
    passives: { defense: 0, cohesion: 1, counter: 2 },
    rules: [
      {
        id: "tte_cut",
        label: "If enemy adjacent → cut down the nearest enemy",
        when: { kind: "enemyAdjacent" },
        then: { kind: "attack", target: { kind: "nearestEnemy" } },
      },
      {
        id: "tte_push",
        label: "Otherwise → push for the far edge",
        when: { kind: "always" },
        then: { kind: "advance", toward: { kind: "exitEdge" } },
      },
    ],
  },
  {
    id: "lie_in_wait",
    faction: "ashen_host",
    name: "Lie in Wait",
    flavor: "Lie flat in the reeds. Let them come close. Not yet.",
    passives: { defense: 2, cohesion: 1, counter: 0 },
    rules: [
      {
        id: "liw_wait",
        label: "Always → lie hidden and wait for the signal",
        when: { kind: "always" },
        then: { kind: "hold" },
      },
    ],
  },
  {
    id: "slip_the_leash",
    faction: "ashen_host",
    name: "Slip the Leash",
    flavor: "Outriders do not fight. They find the gap the fighting leaves and run through it.",
    passives: { defense: 1, cohesion: 0, counter: 0 },
    rules: [
      {
        id: "stl2_run",
        label: "Always → run for the roads behind the line",
        when: { kind: "always" },
        then: { kind: "advance", toward: { kind: "exitEdge" } },
      },
    ],
  },
];

export const doctrineLibrary: DoctrineLibrary = Object.fromEntries(
  doctrines.map((doctrine) => [doctrine.id, doctrine]),
);
