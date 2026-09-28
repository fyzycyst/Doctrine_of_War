# Doctrine Engine v2

Code: `src/game/engine/` (public surface in `index.ts`). It lives beside the lane-era
resolver (`src/game/resolvePhase.ts`, `scenario.ts`), which stays until the UI
switches over (T07).

## Contract

```ts
resolvePhase(state, orders, scenario, rng, options?) → { state, events, report }
```

- **Pure and deterministic.** The input state is never mutated. No DOM, `Date` or
  `Math.random`. The same inputs, including the rng state, always give the same output.
- `orders`: `squadId → doctrineId` for the player's squads. Invalid orders throw.
- `rng`: a seeded mulberry32 stream (`createRng(seed)`; `createRng(rng.state)` resumes it).
  It is threaded through to the fortune seams (below).
- `options.fortune`: `"on" | "off"`, **default `"off"`**. With `"off"`, every chance
  check returns its neutral outcome and the rng is never consumed, so the battle is
  fully deterministic whatever the seed. T03 has no chance systems yet, so `"on"`
  currently behaves the same as `"off"`.
- `options.doctrines`: the doctrine lookup (defaults to the built-in library), so a
  future editor can pass edited doctrines without touching the engine.
- Call it once per phase. `state.phase` advances until `state.status` becomes
  `"victory"` or `"defeat"`. Calling it again after that throws.

## Beat model

A phase is **3 beats**. In each beat:

1. The **initiative side** (`scenario.initiativeSide`, usually the Ashen Host) activates
   each of its active squads in **scenario squad-list order**.
2. Then the **responding side** does the same.

On activation, a squad:

1. clears its `braced` flag;
2. walks its doctrine's rules top to bottom, and the **first rule whose condition
   matches** is chosen (no match gives a `blocked` event);
3. passes the rule through the **stress-check seam** (a no-op in T03);
4. emits `ruleFired` (the label is the player-facing callout) and executes the action.

Each activation sees the results of every earlier one, including those earlier in the
same beat. For example, a squad routed by an earlier attacker never acts. Win
conditions are checked **after every activation**, so a battle can end mid-beat. The
last event is then an `outcome` event, and nothing after it resolves.

At phase start, the Host's orders from `scenario.hostSchedule` for that phase are
applied (Host squads not listed keep their previous doctrine), then the player's orders.
The report title is the schedule entry's `intent`.

## Actions

| Action | Behaviour |
| --- | --- |
| `hold` | Brace: +3 defense and a stronger riposte until the squad's next activation (this carries across a phase boundary). |
| `advance {toward}` | Move up to speed toward the target. If it is already in position, it braces instead. |
| `attack {target}` | If adjacent, strike the enemy squad or batter the objective hex. Otherwise advance (no strike this activation). |
| `counterCharge {target}` | Move up to speed + 1, then strike on arrival with `+2 + passives.counter`. |
| `fallBack {hexes}` | Step away from the enemy (maximise nearest-enemy distance, then total distance). Ignores ZOC. If it is cornered, it braces instead. |
| `rally` | +`6 + passives.cohesion + resolve` cohesion to the weakest adjacent ally (capped at 100). |

**Movement.** Speed is 1 hex (cavalry 2). Squads cannot enter walls, objective hexes,
off-board hexes or occupied hexes. Paths are found by BFS in `hexNeighbors` order, so
tie-breaks are deterministic. If no goal hex is reachable, the squad moves to the
reachable hex closest to the goal, and never further away. **Zone of control:** a move
stops after entering a hex adjacent to an enemy.

**Combat.** `attack = str/10 + 1.5·resolve (+ charge bonus)` and
`defense = coh/25 + terrain + passives.defense + brace + 1.5·resolve`. The defender loses
`5 + margin` strength and `7 + margin − passives.cohesion` cohesion. The attacker takes a
riposte scaled by the defender's strength, its brace and its counter. Objective damage is
`strength% × (siege 30 | other 10)`, halved if the attacker has an enemy adjacent.
Constants are exported from `actions.ts` for the balance harness.

**Routing.** A squad at 0 strength is `destroyed`, and one at 0 cohesion is `routed`.
Either way it emits `rout` and leaves the board (`hex: null`), which frees its hex.

## Schema (all JSON-serialisable, no functions)

- `Doctrine { id, faction, name, flavor, rules: DoctrineRule[], passives { defense, cohesion, counter } }`
- `DoctrineRule { id, label, when: Condition, then: Action }`
- `Condition`: `always`, `selfCohesionBelow`, `selfStrengthBelow`, `enemyAdjacent`,
  `enemyWithin`, `enemyBelow`, `allyAdjacentBelow`, `allyBelow`, `enemyOverextended`,
  `objectiveThreatened` (an enemy within 2 of an objective the squad's faction defends).
- `TargetSelector`: `nearestEnemy`, `weakestEnemy {stat, range?}`,
  `overextendedEnemy {range?}`, `weakestAlly {stat}`, `objective {side: own|enemy, objectiveId?}`,
  `exitEdge`. Ties always fall back to distance, then squad-list order.
- `EngineScenario`: board, squads (with start hexes), objectives (`hex`, `defender`),
  `playerDoctrineIds`, `hostSchedule: {phase, intent, orders}[]`, `winCondition`.
- `WinCondition` (from the player's side):
  - `holdObjective`: defeat at integrity 0, victory after `maxPhases`.
  - `escapeEdge {edgeHexes, count}`: a player squad standing on an edge hex after its
    activation exits; victory at `count` exits.
  - `destroySquads {squadIds}`: victory once all of them are routed or destroyed.
  - In every mode it is defeat when no player squad is left on the field. For
    `escapeEdge` and `destroySquads`, reaching the end of `maxPhases` is also defeat.
- Events (`phase`, `beat` on each, where beat 0 means phase-level): `ruleFired`, `move {path, reason}`,
  `blocked`, `engagement`, `rally`, `rout`, `exit`, `objectiveDamage`, `outcome`.
  `report.lines` is prose generated from these events (`report.ts`).

The library (`doctrines.ts`) holds the Free Banners doctrines *Shield the Line*,
*Fighting Withdrawal*, *Rescue Standard*, *Clean Counterstroke* and *Hold for Dawn*, and
the Ashen Host doctrines *Iron Tide*, *Break the Gate*, *No Step Back*, *Cull the Weak*
and *Terror Push*. Every rule list ends with an `always` catch-all.

## Fortune seams for T04 (`fortune.ts`)

Each seam receives a `FortuneContext` (`state, scenario, options, rng, phase, beat`).
With `fortune: "off"`, each one **must** return its neutral value and must not touch
`rng`.

| Seam | Called | Neutral outcome | T04 feature |
| --- | --- | --- | --- |
| `phaseStartWeather(ctx)` | once per phase, before beat 1 | `[]` | weather shifts |
| `stressCheck(ctx, squad, rule)` | after a rule is chosen, before its action | `{ rule, events: [] }` | courage & cowardice (return a substitute rule, or `null` to waver) |
| `firstContact(ctx, a, b)` | the first time two opposing squads engage (`state.contacts`) | `[]` | renown & dread, fog-of-war `sighted` |

New T04 event kinds (`fortune`, `dread`, `sighted`, `weatherShift`) are added to the
`EngineEvent` union, and `narrateEvent` then has to handle them (the type checker
enforces this).
