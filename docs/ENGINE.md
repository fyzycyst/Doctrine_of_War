# Doctrine Engine v2

Code: `src/game/engine/` (public surface in `index.ts`). It lives beside the lane-era
resolver (`src/game/resolvePhase.ts`, `scenario.ts`), which stays until the UI
switches over (T07).

## Contract

```ts
createInitialState(scenario, { seed?, fortune? }) → state
resolvePhase(state, orders, scenario, { doctrines? }) → { state, events, report }
```

- **Pure and deterministic.** The input state is never mutated. No DOM, `Date` or
  `Math.random`. The same inputs always give the same output.
- **The rng lives in state.** `state.seed` (default 1) is fixed at battle start, and
  `state.rngState` is the current mulberry32 state. Each call reads it and returns it
  advanced, so a save file or "replay with same fortune" needs nothing but the state.
  `report.seed` repeats the seed.
- **`fortune: "on" | "off"`** is set once per battle in `createInitialState`, and
  **defaults to `"off"`**. With `"off"`, every chance check returns its neutral outcome,
  the rng is never advanced, weather stays at the forecast's `start`, there is no fog
  (both sides are omniscient) and no dread. The battle is then fully deterministic
  whatever the seed, and it emits zero `fortune`, `dread`, `weatherShift` or `sighted`
  events.
- `orders`: `squadId → doctrineId` for the player's squads. Invalid orders throw,
  including a doctrine not listed in `scenario.playerDoctrineIds`. Starting doctrines
  come from scenario data and are exempt.
- `options.doctrines`: the doctrine lookup (defaults to the built-in library), so a
  future editor can pass edited doctrines without touching the engine.
- **Renderer and UI contract: play back `eventsFor(events, scenario.playerFaction)` only.**
  Every event carries `visibleTo: FactionId[]`, which is fixed when the event happens:
  - the acting side always sees its own events;
  - the other side sees an event only if it could see where it happened at that moment
    (for a `move`, any hex of the path; for a `ruleFired`, the acting squad);
  - both sides see an engagement, the defender always sees damage to its objective,
    and weather and outcomes are public.

  `eventsFor` returns **projected copies**, the event as that side witnessed it:
  - a move's `path` is clipped to the hexes the side saw. `from` or `to` is null when
    the start or end was not seen (render it as the squad emerging from, or vanishing
    into, the fog);
  - actor ids the side could not see are null. For example, `objectiveDamage.attackerId`
    is null when the defender could not see who struck, and the report reads
    "Greyford Gate took 12 damage from an unseen company";
  - `visibleTo` is reduced to the viewer, and the raw-only `redactions` field is
    removed.

  Audit of actor fields by event kind:
  - `ruleFired`, `blocked`, `fortune`, `move`, `rout` and `exit` have a single actor
    and are witnessed only by a side that saw it.
  - `engagement` is always between neighbours, who always see each other.
  - `sighted` belongs to the observer.
  - `objectiveDamage.attackerId`, `rally.sourceId`/`targetId` and `dread.sourceId` can
    be redacted.

  `fogProjection.test.ts` checks this as a property: over random seeds and plans on
  every scenario, each squad id and hex in `eventsFor(…, "free_banners")` was visible
  to the Banners when the event happened, judged by the true state through the
  `onEmit` debug hook.

  `report.lines` is already built from the player's projected stream. The raw `events`
  array is for tests, the balance harness and a debug/capture mode, never for normal
  playback. With fortune off, every event is visible to everyone.
- Call it once per phase. `state.phase` advances until `state.status` becomes
  `"victory"` or `"defeat"`. Calling it again after that throws.

## Beat model

A phase is **3 beats**. In each beat:

1. The **initiative side** (`scenario.initiativeSide`, usually the Ashen Host) activates
   each of its active squads in **scenario squad-list order**.
2. Then the **responding side** does the same.

On activation, a squad:

1. clears its `braced` and `surging` flags;
2. walks its doctrine's rules top to bottom, and the **first rule whose condition
   matches** is chosen (no match gives a `blocked` event);
3. passes the rule through the **courage check** (below): it may waver (the rule does
   not fire) or surge;
4. emits `ruleFired` (the label is the player-facing callout) and executes the action;
5. refreshes fog-of-war intel, then applies dread from any new sightings.

Each activation sees the results of every earlier one, including those earlier in the
same beat. For example, a squad routed by an earlier attacker never acts. Win
conditions are checked **after every activation**, so a battle can end mid-beat. The
last event is then an `outcome` event, and nothing after it resolves.

At phase start (beat 0), the Host's orders from `scenario.hostSchedule` for that phase
are applied (Host squads not listed keep their previous doctrine), then the player's
orders. After that the weather may shift, and sighting and dread are refreshed. The
report title is the schedule entry's `intent`.

## Actions

| Action | Behaviour |
| --- | --- |
| `hold` | Brace: +2 defense and a stronger riposte until the squad's next activation (this carries across a phase boundary). |
| `advance {toward}` | Move up to speed toward the target. If it is already in position, it braces instead. |
| `attack {target}` | If adjacent, strike the enemy squad or batter the objective hex. Otherwise advance (no strike this activation). If there is no way to close in, it strikes the nearest adjacent enemy instead ("ram whoever bars the way"). |
| `counterCharge {target}` | Move up to speed + 1, then strike on arrival. A **clean** charge (target overextended) gets `+2 + passives.counter` (+2 more for cavalry). A **reckless** charge into a supported target gets no bonus, and every neighbour of the target joins the riposte. |
| `fallBack {hexes}` | Step away from the enemy (maximise nearest-enemy distance, then total distance). Ignores ZOC. If it is cornered, it braces instead. |
| `rally` | +`12 + passives.cohesion + resolve` cohesion to the weakest adjacent ally (capped at 100). |

**Movement.** Speed is 1 hex (cavalry 2). In rain, entering a ford ends the move.
Deep `river` hexes, like walls, cannot be entered; `ford` hexes can. Squads cannot enter walls, objective hexes,
off-board hexes or occupied hexes. Paths are found by BFS in `hexNeighbors` order, so
tie-breaks are deterministic. If no goal hex is reachable, the squad moves to the
reachable hex closest to the goal, and never further away. **Zone of control:** a move
stops after entering a hex adjacent to an enemy.

**Combat.** Battles turn on cohesion (morale), which only a rally restores.
- `attack = str/10 + resolve + role + charge + surge`.
- `defense = coh/25 + terrain + role + passives.defense + brace + surge + resolve`.
- The defender loses `3 + margin` strength and `13 + margin − passives.cohesion`
  cohesion (minimum 2).
- The attacker takes half a riposte scaled by the defender's strength, its brace and its
  counter.
- Role modifiers (attack/defense): frontline 0/+1, skirmish −1/−1, support −3/−2,
  cavalry 0/−1, siege 0/−2. A support banner is a poor wall, so "everyone brace" has a
  cost.
- Objective damage is `strength% × (siege 40 | other 12)`, halved if the attacker has an
  enemy adjacent.

All constants are named exports in `actions.ts`, `fortune.ts` and `fog.ts`.

**Routing.** A squad at 0 strength is `destroyed`, and one at 0 cohesion is `routed`.
Either way it emits `rout` and leaves the board (`hex: null`), which frees its hex.

## Schema (all JSON-serialisable, no functions)

- `Doctrine { id, faction, name, flavor, rules: DoctrineRule[], passives { defense, cohesion, counter } }`
- `DoctrineRule { id, label, when: Condition, then: Action }`
- `Condition`: `always`, `selfCohesionBelow`, `selfStrengthBelow`, `enemyAdjacent`,
  `enemyWithin`, `enemyBelow`, `allyAdjacentBelow`, `allyBelow`, `enemyOverextended`,
  `objectiveThreatened` (an enemy within 2 of an objective the squad's faction defends),
  `atObjective` (the squad is adjacent to an objective it assaults).
- `TargetSelector`: `nearestEnemy`, `weakestEnemy {stat, range?}`,
  `overextendedEnemy {range?}`, `weakestAlly {stat}`, `objective {side: own|enemy, objectiveId?}`,
  `exitEdge`. Ties always fall back to distance, then squad-list order. `attack` and
  `counterCharge` take only an `EnemySelector` (the three enemy selectors, or
  `objective {side: "enemy"}`). At runtime, a strike at an ally or at the squad's own
  objective is refused with `blocked`, because editor JSON can bypass the types.
- `EngineScenario`: board, squads (with start hexes and optional `renown {title}`),
  objectives (`hex`, `defender`), `playerDoctrineIds`, `hostSchedule: {phase, intent, orders}[]`,
  `winCondition`, optional `forecast {start, shiftChance, shifts}`, and optional
  `referencePlans {intended, bad}` (used by the balance harness and tutorial hints),
  optional `timeOfDay` (`"nightFires"`: sight −1, but a squad on a ford or beside the
  river is lit and seen from 1 hex further), and `curatedSeed` (a fortune-on seed that
  plays the intended plan to a clean win, used for the first playthrough and for video
  capture; `scenarios.test.ts` asserts it).
- `WinCondition` (from the player's side):
  - `holdObjective`: defeat at integrity 0, victory after `maxPhases`.
  - `escapeEdge {edgeHexes, count}`: a player squad standing on an edge hex after its
    activation exits; victory at `count` exits.
  - `destroySquads {squadIds}`: victory once all of them are routed or destroyed. The
    list must be non-empty and name only existing, non-player squads; otherwise
    `createInitialState` throws.
  - Optional `defeatConditions` add more ways to lose:
    - `enemyEscape {edgeHexes, count}`: the opposing side gets `count` squads off
      through those hexes. Its `exitEdge` selector points at them, and a Host squad
      standing on one after its activation exits.
    - `squadsLost {count}`: that many player squads are routed or destroyed ("the line
      breaks").
  - `timeoutOutcome: "defeat" | "stalemate"` (default `"defeat"`) decides what running out
    of phases means for `escapeEdge` and `destroySquads`. With `"stalemate"`, the battle
    ends with `status: "stalemate"`: neither side met its goal. The campaign treats it as
    "advance, with a Resolve penalty". `holdObjective` always wins on time. The balance
    harness reports stalemates as their own column; they never count as wins.
  - In every mode it is defeat when no player squad is left on the field. For
    `escapeEdge` and `destroySquads`, reaching the end of `maxPhases` is also defeat.
- Events (`phase`, `beat` on each, where beat 0 means phase-level): `ruleFired`, `move {path, reason}`,
  `blocked`, `engagement {charge, reckless}`, `rally`, `rout`, `exit`, `objectiveDamage`,
  `outcome`, `fortune {outcome: surge|waver}`, `dread {title, shock}`, `weatherShift {from, to}`,
  `sighted {faction, squadId, byId, hex}`.
  `report.lines` is prose generated from these events (`report.ts`).

The library (`doctrines.ts`) holds the Free Banners doctrines *Shield the Line*,
*Fighting Withdrawal*, *Rescue Standard*, *Clean Counterstroke* and *Hold for Dawn*, and
the Ashen Host doctrines *Iron Tide*, *Break the Gate*, *No Step Back*, *Cull the Weak*,
*Terror Push*, *Through the Embers* (cross and cut through blockers toward the exits)
and *Slip the Leash* (outriders: never fight, run for the exits). Every rule list ends with an `always` catch-all.

## Friction & fortune (`fortune.ts`, `fog.ts`)

The design rule is that doctrine decides the odds and fortune decides the moment. Every
chance outcome is an event with its own callout.

| System | Rule | Event |
| --- | --- | --- |
| **Courage & cowardice** | A squad under stress (enemy adjacent, or cohesion < 50) rolls once when its rule fires. The chance depends on Resolve (−3 Broken … +3 Veteran): waver 30% → 3%, surge 2% → 13%. **Waver:** the rule does not fire this beat. **Surge:** +5 cohesion and +3 attack/defense until the squad's next activation, and a fall-back rule becomes a *Heroic stand* (hold). | `fortune` |
| **Renown & dread** | Squads may carry `renown {title}` (scenario data now, earned in the campaign in T09). The first time a squad sights or engages an enemy renowned squad, it loses `5 × max(0, renowned.resolve − own.resolve)` cohesion (×1.5 for Host renown in ash-wind). This happens once per pair (`state.dreaded`), works for both factions, and can rout. | `dread` |
| **Weather** | Phase 1 uses `forecast.start`. At each later phase start, with probability `shiftChance`, it shifts to a different entry in `shifts`. **Rain:** entering a ford ends a move, and counter passives are halved. **Mist:** sight −1. **Ash-wind:** Host dread ×1.5, and Host squads get +1 cohesion passive. | `weatherShift` |
| **Fog of war** | Sight is 2 hexes (+1 standing on a ridge, −1 in mist, minimum 1). Ruins strictly between two squads block sight; neighbours always see each other. `state.intel[faction][enemyId]` keeps the last sighting. **The engine resolves on the true state.** Every decision a squad makes (conditions, targets, fall-back direction, who bars the way) reads the **perceived world** from `perceive()` in `perception.ts`: the enemies its side sees now, with an enemy's support judged only from visible enemies. Combat, blocking and zones of control stay on the true state. **The Host is omniscient for now** (an invading host with outriders). | `sighted` (when an enemy comes into view) |

`visibleState(state, faction)` is the pure filter for the UI and renderer:
- own squads and enemies in sight are shown as they are;
- enemies seen before are shown at their last-known hex with their stats from that
  sighting, `doctrineId: null` and `lastKnown: true`;
- enemies never seen are omitted;
- it is built from an explicit allowlist of fields (`VisibleState`, `VisibleSquad`), so
  `rngState`, `intel`, `contacts` and `dreaded` are never exposed;
- with fortune off it reveals everything.

## Balance harness

`npm run balance -- [--seeds 500] [--fortune on|off] [--scenario id]` (run via `vite-node`)
plays each scenario's reference plans (`intended`, `bad`) and every mono-doctrine plan
(all player squads on doctrine X) across seeds 1..N. It prints win rates and the mean
objective integrity, and exits 1 if a guardrail fails:

- the intended plan wins ≥ 75%;
- the bad plan wins ≤ 35%;
- no mono plan wins ≥ 60%.

`balance.test.ts` runs the same check with 60 seeds on every `npm test`. Every
scenario in `scenarios/index.ts` must pass. The scenarios so far:
- *The First Breach*: the tutorial, which teaches holding and rallying.
- *Ember Ford*: battle 1, which teaches Clean Counterstroke against overextension, kept
  steady by a rally banner.
