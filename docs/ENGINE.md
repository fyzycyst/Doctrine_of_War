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
    removed;
  - an event that first brings an enemy into the viewer's sight carries `introduces`: a
    `SquadSnapshot` of each such squad at that moment. `sighted` events carry a
    `snapshot`. Both use the same field allowlist as `VisibleSquad`, so playback can
    place emerging squads exactly.

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

  The same file checks the **decision** side (P4): at every move and rule firing, each
  Banner company's chosen rule, its action's resolved target, `aheadOfLine` and
  `atObjective` are identical on the true state and on copies with every unseen enemy
  erased or moved to another free hex (shipped battles and prototypes, including an
  everyone-on-Bring-the-Water plan). A mutant `aheadOfLine` that peeks at true enemy
  positions fails it.

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
orders. Then the player's **muster** (below) is applied, before the Host acts, so the
Host sees the mustered positions. After that the weather may shift, and sighting and
dread are refreshed. The report title is the schedule entry's `intent`.

## Muster and relief of the line (`muster.ts`, T21)

Each command window opens with a short repositioning, passed as
`resolvePhase(state, orders, scenario, { muster })` with `muster: MusterMove[]`:
- `{ squadId, to }`: a company **not in contact** (no adjacent enemy) moves up to 1 hex
  (cavalry 2) along a clear path. The usual rules apply: walls, deep river, objective
  hexes and occupied hexes cannot be entered; marsh, a ford in rain, and an enemy's zone
  of control end the move.
- `{ squadId, relieve }`: a fresh company (not in contact itself) next to an **engaged**
  friendly company swaps hexes with it; the tired company steps back out of contact.
  This is the only way to pull a company out of contact, and it costs a fresh company
  in the line.
- Each company musters or relieves at most once per window (a relieved company counts
  as having mustered). Moves apply in order, so a hex one company leaves is free for
  the next. The Column never musters ("The Column moves on its own orders.").

**For the UI:** `musterOptions(state, scenario)` lists, per company, the hexes it may
muster to and the engaged neighbours it may relieve; `validateMuster(state, scenario,
moves)` returns a plain-language reason per refused company (empty = valid). Both read
**only what the player's side sees**: an unseen enemy's hex looks free, and no reason
ever names it. The engine applies the muster on the true state: a company that runs
into something it could not see halts short (`mustered.halted`, or a `blocked` event
with the neutral reason "The way was barred."). Every planned move yields exactly one
outcome for its company: a `mustered` move (after `relieved` for a relief), or that
neutral `blocked` when it can no longer be carried out as planned, for example because
an earlier move halted on the hex it was counting on. `applyMuster(state, scenario, moves)`
is the same on a copy, for tests; a UI previews a muster from its own planned moves,
never from it (that would leak the truth). An invalid muster passed to `resolvePhase`
throws, like an invalid order.

Events (beat 0, before the phase's other events): `mustered {squadId, path, from, to,
halted}` (shaped like a move, and projected per faction like one) and `relieved
{squadId, relievedId, hex}`, which is followed by the two companies' `mustered` moves.

## Actions

| Action | Behaviour |
| --- | --- |
| `hold` | Brace: +2 defense and a stronger riposte until the squad's next activation (this carries across a phase boundary). |
| `advance {toward}` | Move up to speed toward the target. If it is already in position, it braces instead. |
| `attack {target, power?}` | If adjacent, strike the enemy squad or batter the objective hex. Otherwise advance (no strike this activation). If there is no way to close in, it strikes the nearest adjacent enemy instead ("ram whoever bars the way"). `power` shifts the blow's attack (Clean Counterstroke strikes back from guard at −1). |
| `bombard {range}` | Siege engines: batter an enemy objective within `range` hexes (`strength% × 10`, halved if an enemy is adjacent); otherwise advance toward it. |
| `counterCharge {target}` | Move up to speed + 1, then strike on arrival. A **clean** charge (target overextended) gets `+2 + passives.counter` (+2 more for cavalry). A **reckless** charge into a supported target gets no bonus, and every neighbour of the target joins the riposte. |
| `fallBack {hexes}` | Step away from the enemy (maximise nearest-enemy distance, then total distance). Ignores ZOC. If it is cornered, it braces instead. |
| `rally` | +`12 + passives.cohesion + resolve` cohesion to the weakest adjacent ally (capped at 100). |

**Movement.** Speed is 1 hex (cavalry 2). In rain, entering a ford ends the move.
Deep `river` hexes, like walls, cannot be entered; `ford` hexes can. Entering `marsh`
ends a move, a squad cannot brace in marsh, and marsh gives −1 defense. `reeds` give +1
defense and, like ruins, block sight. Squads cannot enter walls, objective hexes,
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
- **The braced bite (the wall).** A braced defender also costs the attacker
  `3 × (passives.defense − 1)` strength and cohesion per blow. Only Shield the Line
  (defense 3, bite 6) and the Host's holders (Lie in Wait 3, No Step Back 6) bite; Resolve
  does not scale it (it already hardens the defense; a veteran wall that also bit harder
  could not be broken).
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
  `atObjective` (the squad is adjacent to an objective it assaults), `retreatOpen` (its
  side has exit hexes on this field), `wardNear {range, minRange?}` (an allied
  noncombatant is within range), `fightBeyond {range}` (an ally is in contact with
  an enemy this side sees, and no seen enemy is within `range` of the squad: idle while
  the fight is elsewhere), and `aheadOfLine {by, objectiveId?}` ("keep step", P4): every
  other active company on the **same doctrine** (noncombatants excluded) stands at least
  `by` hexes farther (hex distance) from the enemy objective than this squad does, so it
  is out in front alone. The objective is `objectiveId`, else the first standing one the
  squad's side assaults (the same one `objective {side: "enemy"}` picks). False with no
  such objective or no such company. It reads only the objective's hex and the squad's
  own side, never an enemy, so it means the same under fog; only the front company waits,
  so a straggler (or a company falling back) never stalls the line.
- `TargetSelector`: `nearestEnemy`, `weakestEnemy {stat, range?}`,
  `overextendedEnemy {range?}`, `fightingEnemy` (the nearest seen enemy in contact with
  one of the squad's allies), `weakestAlly {stat}`, `objective {side: own|enemy, objectiveId?}`,
  `exitEdge`, `ward` (the nearest allied noncombatant). **Fog-independent targets:**
  `objective`, `exitEdge` and `ward` read only public data (objectives and terrain are on
  every commander's map) or the squad's own side, so they always resolve under fog; the
  enemy selectors see only enemies in sight and return null (`blocked "no target"`) when
  none is. An offensive doctrine therefore anchors its march to `objective {side: "enemy"}`.
  Ties always fall back to distance,
  then squad-list order. `attack` and
  `counterCharge` take only an `EnemySelector` (the three enemy selectors, or
  `objective {side: "enemy"}`). At runtime, a strike at an ally or at the squad's own
  objective is refused with `blocked`, because editor JSON can bypass the types.
- `EngineScenario`: board, squads (with start hexes and optional `renown {title}`),
  objectives (`hex`, `defender`), `playerDoctrineIds`, `hostSchedule: {phase, intent, orders}[]`,
  `winCondition`, optional `forecast {start, shiftChance, shifts}`, and optional
  `referencePlans {intended, bad}` (used by the balance harness and tutorial hints),
  optional `timeOfDay` (`"nightFires"`: sight −1, but a squad on a ford or beside the
  river is lit and seen from 1 hex further), `timeOfDayByPhase` (per-phase overrides;
  the current hour is `state.timeOfDay`, which turns with `state.phase`, so the command
  window for phase N already sees by phase N's hour; the dark hours `nightFires`, `rainGrey` and
  `predawn` cut sight by 1, and `sunrise` does not), and `curatedSeed` (a fortune-on
  seed that
  plays the intended plan to a clean win, used for the first playthrough and for video
  capture; `scenarios.test.ts` asserts it: at most one company broken and the objective
  at 85+, except the finale, whose first play is a near-miss by design). Curated seeds
  must also win on the campaign's curated-path roster, since the strong roster replays
  them.
- `WinCondition` (from the player's side):
  - `holdObjective`: defeat at integrity 0, victory after `maxPhases`.
  - `escapeEdge {edgeHexes, count, mustEscape?}`: a player squad standing on an edge hex
    after its activation exits; victory at `count` exits once every `mustEscape` squad is
    out. Losing a must-escape squad is an immediate defeat.
- **Noncombatant squads** (`noncombatant: true`, for example a refugee column):
  - they keep their scenario doctrine (the player's orders for them are rejected);
  - they never strike;
  - they are not campaign companies and don't count toward `squadsLost`.

  In escape battles, *Fighting Withdrawal* walks toward the line of retreat when not
  pressed and leans toward it when falling back. *Rescue Standard* marches at a
  column's side when it pulls ahead and rallies a shaken column first. Both rules are
  inert where there is no exit or no column.
  - `destroySquads {squadIds, count?}`: victory once `count` of them (default: all) are
    routed or destroyed. The
    list must be non-empty and name only existing, non-player squads; otherwise
    `createInitialState` throws.
  - `holdThenBreak {objectiveId, dawnPhase, squadIds, count?}`: a staged win. Before
    `dawnPhase` the player holds (losing the player-defended objective is an immediate
    defeat, before or after dawn); from `dawnPhase` on it is a victory once `count`
    (default: all) of the target squads are routed or destroyed. Breaking them earlier
    does not end the battle early. `winStage(scenario, phase)` returns `"hold"`,
    `"break"` or null (other win kinds) for the UI. Bad data (an objective the player
    does not defend, a dawn phase outside 1..`maxPhases`, player or missing targets)
    throws at `createInitialState`.
  - `breakObjective {objectiveId}` (P4, offensive battles): victory the moment that
    objective (one the opposing side defends, standing at battle start; otherwise
    `createInitialState` throws) is battered to integrity 0. Integrity is the scenario's
    `ObjectiveSetup.integrity`, lost to blows exactly as a gate is (`strength% × 12`, or
    40 for siege, halved with an enemy adjacent). **Timing:** checked after every
    activation, so the battle ends mid-beat on the breaking blow. **Precedence:** the break
    is checked before the defeat conditions, like every win; a blow on an objective draws
    no riposte, so a break and a defeat cannot become true in the same activation. While
    it stands, `defeatConditions` and "no company left" apply as usual. Running out of
    phases falls to `timeoutOutcome` (default defeat: "Time ran out with the Wagon Park
    still standing."). There is no break-then-hold.
  - Optional `defeatConditions` add more ways to lose:
    - `enemyEscape {edgeHexes, count}`: the opposing side gets `count` squads off
      through those hexes. Its `exitEdge` selector points at them, and a Host squad
      standing on one after its activation exits.
    - `squadsLost {count}`: that many player squads are routed or destroyed ("the line
      breaks").
  - `timeoutOutcome: "defeat" | "stalemate"` (default `"defeat"`) decides what running out
    of phases means for `escapeEdge`, `destroySquads`, `holdThenBreak` and `breakObjective`. A stalemate must be earned:
    `stalemateRequires {minEnemyBroken, targetsOnly?}` turns a timeout with too few
    enemies broken into a defeat. For `escapeEdge` with `mustEscape`, the timeout is a
    stalemate only if every must-escape squad got out and at most one short of `count`. With `"stalemate"`, the battle
    ends with `status: "stalemate"`: neither side met its goal. The campaign treats it as
    "advance, with a Resolve penalty". `holdObjective` always wins on time. The balance
    harness reports stalemates as their own column; they never count as wins.
  - In every mode it is defeat when no player squad is left on the field. For
    `escapeEdge`, `destroySquads`, `holdThenBreak` and `breakObjective`, reaching the end
    of `maxPhases` is also defeat (unless `timeoutOutcome` says stalemate).
- Events (`phase`, `beat` on each, where beat 0 means phase-level): `ruleFired`, `move {path, reason}`,
  `blocked`, `engagement {charge, reckless}`, `rally`, `rout`, `exit`, `objectiveDamage`,
  `outcome`, `fortune {outcome: surge|waver}`, `dread {title, shock}`, `weatherShift {from, to}`,
  `sighted {faction, squadId, byId, hex}`, `mustered`, `relieved` (see Muster).
  `report.lines` is prose generated from these events (`report.ts`).

The library (`doctrines.ts`) holds the Free Banners doctrines *Shield the Line*,
*Fighting Withdrawal*, *Rescue Standard*, *Clean Counterstroke*, *Hold for Dawn* and
*Bring the Water* (the Advance, P4: fall back below 30 cohesion, batter the objective when
beside it, strike whoever bars the way, wait when 2 hexes ahead of the line, otherwise
march on the objective; passives 1/2/1; not yet offered by a shipped battle), and
the Ashen Host doctrines *Iron Tide*, *Break the Gate*, *No Step Back*, *Cull the Weak*,
*Terror Push*, *Through the Embers* (cross and cut through blockers toward the exits),
*Slip the Leash* (outriders: never fight, run for the exits), *Hurl Fire* (a mangonel:
bombard the gate from 4 hexes), *Lie in Wait* (hold
hidden until the schedule springs the ambush), *Under Wet Hides* (a ram's night
doctrine: batter the gate, ram whoever is adjacent, else drive on the gate; passives
defense +6 and cohesion +12, so blows glance off) and *The Nerve Fails* (always fall
back 2 hexes; the schedule hands it out at dawn). *Keep the Column Moving* is the
noncombatant column's own doctrine and is never offered to the player. Every rule list ends with an `always` catch-all.

**Smarter fallback (T21).** Clean Counterstroke has "If the nearest fight is beyond 3
hexes → march toward it" (`cc_hunt`) before "Otherwise → hold and watch", so a company
is not left sitting idle after an isolated enemy breaks. It fires only once a fight has
started somewhere. Shield the Line deliberately has no such rule: the wall does not
leave its post (in Hold for Dawn a "close on the line" rule pulled the shields off the
gate and dropped the intended win rate from 98% to 54%). The muster covers a shield
company stranded off to the side.

## Friction & fortune (`fortune.ts`, `fog.ts`)

The design rule is that doctrine decides the odds and fortune decides the moment. Every
chance outcome is an event with its own callout.

| System | Rule | Event |
| --- | --- | --- |
| **Courage & cowardice** | A squad under stress (enemy adjacent, or cohesion < 50) rolls once when its rule fires. The chance depends on Resolve (−3 Broken … +3 Veteran): waver 30% → 3%, surge 2% → 13%. **Waver:** the rule does not fire this beat. **Surge:** +5 cohesion and +3 attack/defense until the squad's next activation, and a fall-back rule becomes a *Heroic stand* (hold). | `fortune` |
| **Renown & dread** | Squads may carry `renown {title}` (scenario data now, earned in the campaign in T09). The first time a squad sights or engages an enemy renowned squad, it loses `5 × max(0, renowned.resolve − own.resolve)` cohesion (×1.5 for Host renown in ash-wind). This happens once per pair (`state.dreaded`), works for both factions, and can rout. | `dread` |
| **Weather** | Phase 1 uses `forecast.start`. At each later phase start, with probability `shiftChance`, it shifts to a different entry in `shifts`. **Rain:** entering a ford ends a move, and counter passives are halved. **Mist:** sight −1. **Ash-wind:** Host dread ×1.5, and Host squads get +1 cohesion passive. | `weatherShift` |
| **Fog of war** | Sight is 2 hexes (+1 standing on a ridge, −1 in mist, minimum 1). Ruins strictly between two squads block sight; neighbours always see each other. `state.intel[faction][enemyId]` keeps the last sighting. **The engine resolves on the true state.** Every decision a squad makes (conditions, targets, fall-back direction, who bars the way) reads the **perceived world** from `perceive()` in `perception.ts`: the enemies its side sees now, with an enemy's support judged only from visible enemies. Combat, blocking and zones of control stay on the true state. **The Host is omniscient for now** (an invading host with outriders). **Terrain is known to both sides; fog hides companies and their orders** (commanders have maps: the renderer draws fogged ground dimmed, and the UI's terrain chip reads fogged hexes, but never what stands on them). | `sighted` (when an enemy comes into view) |

`visibleState(state, faction)` is the pure filter for the UI and renderer:
- own squads and enemies in sight are shown as they are;
- enemies seen before are shown at their last-known hex with their stats from that
  sighting, `doctrineId: null` and `lastKnown: true`;
- enemies never seen are omitted;
- it is built from an explicit allowlist of fields (`VisibleState`, `VisibleSquad`), so
  `rngState`, `intel`, `contacts` and `dreaded` are never exposed;
- with fortune off it reveals everything.

## Balance harness

`npm run balance -- [--seeds 500] [--range gate|tuning] [--fortune on|off] [--scenario id]`
(run via `vite-node`) plays each scenario's reference plans (`intended`, `bad`, and the
optional diagnostic `alternative`) and every mono-doctrine plan (all player squads on
doctrine X) on the held-out gate seeds 100001..100000+N (`--range tuning`: 1..N; see the
seed ranges in docs/CAMPAIGN.md). Plans are played with a
**muster policy**: `"heuristic"` (`heuristicMuster`: relieve an engaged company below 35
cohesion with a fresh neighbour of 60+, then step idle fighting companies, those with
no seen enemy within 3, toward the fight or the line of retreat; standards stay put;
it reads only the player's view) or `"none"`. The guardrails are judged with the
heuristic, the player-realistic one; with `"none"` the intended plan must still pass
the winnability floor. It prints win rates and the mean objective integrity, and exits 1
if a guardrail fails:

- the intended plan wins ≥ 75%;
- the bad plan wins ≤ 35%;
- no mono plan **advances** (wins plus stalemates) ≥ 60%.

The same check runs with 60 seeds on every `npm test`, one file per battle
(`balance.<battle>.test.ts` via `guardrails.testkit.ts`; Roll battles one test per named
call). Every pack scenario (`registry.scenarios()`) must pass, and so must the engine prototypes in
`fixtures/` (test fixtures, never offered to the player; run one by name with
`npm run balance -- --scenario proto_wagon_park`). The scenarios so far:
Each battle has a **star doctrine** even when it uses a mix:
- *The First Breach*: the tutorial; the star is the wall. Shields hold the gate, the
  standard rallies them, and the riders (Counterstroke) pounce on whatever comes alone.
- *Ember Ford*: battle 1; the star is the opportunist. Counterstroke hunts crossers as
  they climb out alone beside the roads, and a rally banner holds nerve against the
  Unquenched. Breaking the vanguard is the only win (a timeout is a defeat): a wall
  bites whoever hits it but never hunts. Host outriders lurk by both roads.

- *The Saltmarsh Column*: battle 2, which teaches Fighting Withdrawal with a Rescue
  Standard escorting the refugee column, while the hunters come out of the mist in
  waves.
- *Hold for Dawn*: battle 3, the finale (`holdThenBreak`): the wall through the night,
  the opportunist at dawn. Shields hold the front line against the Cinderram under its
  hides while the Ash Mangonel lobs fire at the gate (it typically ends a win at 40–70),
  and the standards keep the line standing. The hides burn through in the last hour of
  dark; at sunrise the Host falls back and the counterstroke companies break the exposed
  ram. Losing three companies breaks the line.

- *The Saltmarsh, Northbound* (*Cinder Road* battle 1, `scenarios/cinderRoad1.ts`, in the
  First Call pack, not the intro's `scenarios` list): the star is **Bring the Water**.
  Banner initiative under fog, `breakObjective` on the Saltgate Barricade. The assault
  cannot see the reed hunters, but it can see the barricade on the map, so it marches on
  it. The Host's outriders (the Drowned Hounds, the Ash Harriers) never fight: they run
  for the boats at the Heron Stair (`enemyEscape`, count 1), so a pure march loses
  whatever the force; the Wickmere Standard holds the stair on Shield the Line, and the
  bows carry a banner with the assault. Gate seeds (100001–100500), fortune on,
  recommended call: intended 95.6% (90.8% with no muster), bad (the pure march, played
  as authored since P7) 1.4% (2.0%), all Bring the Water 1.4%, every other mono 0%; the
  strongest alternative (the stair held, no banner) 63.2% (90.0%). With no muster that
  alternative beats the intended plan on two calls (docs/CAMPAIGN.md). Ablations (tuning
  seeds, heuristic / no muster): the standard leaving the stair 0% / 0–1%; no banner
  with the assault (bows on Bring the Water) 72.2% / 87.4%; the march on Clean
  Counterstroke 0% / 0%. The banner matters with the player-realistic muster and on weak
  forces (weakest legal: 81% with it, 41% without). **Keep step is inert here:** the Sunward Lances (cavalry) never get 2 hexes ahead of
  every other company (they move after the infantry, and lead by at most 1), so Bring the
  Water without `btw_step` scores the same. Every named call is in docs/CAMPAIGN.md.
- *The Wagon Park* (prototype, `fixtures/wagonPark.ts`, P4): the first battle with
  **Banner initiative**, `breakObjective` and fog. The Banners cannot see the park's guard
  from their start, so the assault is anchored to the objective: Bring the Water marches
  four companies on the wagon park (integrity 48) while a Rescue Standard keeps them
  standing against the Kept Coal's dread and the thralls' Terror Push charge. Everyone on
  Bring the Water, standard included, is a storm without a standard and breaks on the
  guard. Gate range (seeds 100001–100500), fortune on: intended 90.8% (91.2% with no
  muster), bad 0%, all Bring the Water 16.6%, every other mono 0%. (Tuning-range figures
  from authoring were 93% / 91.8% / 23%.) `btw_step` (keep step) does not fire in this
  fixture's intended plan (the line starts and moves together); it is the guard against
  a fast or forward company arriving alone, covered by `offensive.test.ts`.

**Scenario design principle.** Every battle's intended plan uses at least two doctrine
families in meaningful roles. Its scenario test ablates each family (swapping it for
another doctrine) and requires each swap to cost at least 15 points of advance rate.

**Doctrine identity matrix** (`identityKit.ts`, `identity.test.ts`). Canonical
micro-battles against Iron Tide marching on a gate (30 seeds, fortune on) assert that
every doctrine has a job:
- against a supported line, Shield the Line holds more ground, loses less and wins the
  exchange over Clean Counterstroke, and its bite costs attackers far more than any
  other brace;
- against a lone crosser, Clean Counterstroke deals far more damage than Shield the Line;
- on a mixed front (a supported pair and a lone raider), the right mix (Shield facing the
  pair, Counterstroke facing the raider) beats either doctrine alone, and the wrong mix
  is worst.

## UI surface

- **Deployment** (`deployment.ts`):
  - `deploymentHexes(scenario)` lists the player's deployment zone.
  - `checkPlacement` and `validateDeployment(scenario, placements)` return a
    plain-language reason for each squad whose placement is illegal. Noncombatants
    (the Column) cannot be placed: "The Column moves on its own orders."
  - `applyDeployment` returns a copy of the scenario with the placements applied, and
    throws on an illegal one.
- **Narration** reads names from a `NameSource`, which the player's `VisibleState`
  satisfies, so the UI never touches raw state. An unknown id is narrated as "an unseen
  company".
- **Reports:** `report.intent` is the Host's line for the phase on its own; `title` is
  "Phase N: intent".
- **`VisibleSquad.lastSeen`** is `{phase, beat}` of the last sighting (null for own
  squads, or with fortune off). `visibleHexes(state, scenario, faction)` lists the hexes
  in sight (every hex with fortune off), for the fog-mist renderer.
- **Orders:** `isOrderAllowed(scenario, squadId, doctrineId)` accepts any doctrine in
  `playerDoctrineIds`, and always the squad's own scenario default.
