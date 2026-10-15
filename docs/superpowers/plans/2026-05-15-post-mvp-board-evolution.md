# Post-MVP Board Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Doctrine of War from the current lane-field MVP toward a battlefield-first tactical board with lower text density, testable 2D positioning, visible state meters, shared-effect indicators, and phase-resolution feedback.

**Architecture:** Preserve the current React + TypeScript app and pure `src/game/` simulation core. Implement this as sequential slices: first extract UI boundaries and reduce always-visible text, then introduce a hex-board model behind tests, then render the hex board and placement interactions, then add phase event playback. Do not expand campaign scope, doctrine editing, persistence, or AI until the board loop is stable.

**Tech Stack:** Vite, React, TypeScript, Vitest, React Testing Library, CSS/SVG/HTML for board presentation.

---

## Current Context

- Current UI is mostly in `src/App.tsx`; the first task should split reusable UI pieces into `src/ui/`.
- Current simulation uses `laneId` on `Squad`, `Lane[]` on `Scenario`, and lane-based `ScriptedThreat`.
- Current MVP has valid tests in `src/game/*.test.ts` and `src/App.test.tsx`.
- Current board overlap and label placement issues are accepted temporary debt; do not spend a full slice polishing the old lane board if the slice replaces it.

## Public Interface Changes

The following game interfaces should evolve across the slices:

- Add `StatMeter` UI props for strength/cohesion/integrity display; exact values are exposed through accessible labels/tooltips.
- Add board model types in `src/game/board.ts`: `HexCoord`, `TerrainType`, `BoardHex`, `BoardLayout`, and helper functions for coordinate keys, neighbor lookup, distance, and terrain lookup.
- Replace lane placement with board placement in a later slice by adding `hex: HexCoord` to squads and threats while keeping temporary compatibility helpers until lane references are fully removed.
- Add `EffectArea` data as `{ sourceSquadId: string; affectedHexes: HexCoord[]; kind: "support" | "command" | "danger" }` so UI can render support radius without deriving it from CSS positions.
- Add `PhaseEvent` data to `BattleReport.phaseEvents`, separate from prose report strings, so animation can use structured events instead of parsing text.

## Slice 1: Decompose UI and Reduce Text Density

**Intent:** Keep the same lane-field gameplay, but make the interface less word-heavy and create UI boundaries for later board replacement.

**Status 2026-05-15:** Complete as smaller reversible sub-slices. `StatMeter` remains a local helper inside `Battlefield.tsx` because it is only used there so far; a standalone `StatusBar` was deferred because the current header status pill is still simple.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/ui/Briefing.tsx`, `src/ui/DoctrinePanel.tsx`, `src/ui/Battlefield.tsx`, `src/ui/BattleReportPanel.tsx`, `src/ui/ObjectivePanel.tsx`, `src/ui/ActionBar.tsx`
- Modify: `src/App.test.tsx`

**Implementation:**

- [x] Extract the inline `Briefing`, `DoctrinePanel`, `Battlefield`, `BattleReportPanel`, and `ReportList` components from `src/App.tsx` into `src/ui/`.
- [x] Add a local `StatMeter` helper in `src/ui/Battlefield.tsx` with exact-value accessible labels and bounded visual fill.
- [x] Render Strength, Cohesion, and Gate Integrity as compact bars instead of inline `STR 70 / COH 42` text.
- [x] Keep exact values accessible through `aria-label` and `title`, e.g. `aria-label="Greyford Shields strength 86 of 100"`.
- [x] Replace long squad card text on the battlefield with name, doctrine name, and meters only; move longer doctrine summaries to doctrine select `title` attributes.
- [x] Keep the right-side battle report scrollable/collapsible and tune desktop layout so the main board is visible above the fold before the report rail on mid-width screens.
- [x] Do not change battle math in this slice.

**Tests:**

- [x] Update `src/App.test.tsx` to assert that meters render with accessible labels for squad strength, cohesion, and gate integrity.
- [x] Keep existing tests for briefing, doctrine assignment, commit phase, and terminal scenario state.
- [x] Add a UI test that exact stat values are available through accessible labels even when the visible board text is reduced.
- [x] Add UI coverage for report collapse/expand behavior and hidden doctrine summaries.

**Verification:**

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run browser smoke tests: start tutorial, assign at least one doctrine, commit phases, confirm meters update, report collapse/expand works, doctrine summaries remain available by title, and battlefield layout prioritizes the board at desktop breakpoints.

**Commit:**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css src/ui
git commit -m "refactor: ui: extract tutorial panels and add stat meters"
```

## Slice 2: Add Testable Hex Board Model

**Intent:** Introduce full 2D tactical board data under the simulation without changing the visible board yet. This lowers risk before replacing the lane view.

**Files:**
- Create: `src/game/board.ts`
- Create: `src/game/board.test.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/scenario.ts`
- Modify: `src/game/scenario.test.ts`

**Implementation:**

- [ ] Create `HexCoord` as `{ q: number; r: number }` using axial coordinates.
- [ ] Create `TerrainType` as `"road" | "ridge" | "ford" | "wall" | "field" | "ruin"`.
- [ ] Create `BoardHex` as `{ coord: HexCoord; terrain: TerrainType; label?: string; objectiveId?: string }`.
- [ ] Create `BoardLayout` as `{ hexes: BoardHex[]; width: number; height: number }`.
- [ ] Add helper functions:
  - `hexKey(coord)` returns `"q,r"`.
  - `sameHex(a, b)` compares coordinates.
  - `hexDistance(a, b)` returns axial hex distance.
  - `hexNeighbors(coord)` returns the six adjacent axial coordinates.
  - `getHex(layout, coord)` returns a matching hex or `undefined`.
  - `terrainDefenseBonus(terrain)` returns a small numeric modifier.
- [ ] Extend `Squad` with `hex?: HexCoord`.
- [ ] Extend `ScriptedThreat` with `targetHex?: HexCoord`.
- [ ] Extend `Scenario` with `board?: BoardLayout`.
- [ ] Add a first board layout to `firstBreachScenario` matching the current three routes conceptually: ridge, gate road, ford, wall/gate hex, and surrounding field/ruin tiles.
- [ ] Assign each existing squad an initial `hex` while keeping `laneId` intact for compatibility.
- [ ] Add `targetHex` to scripted threats while keeping `laneId` intact.
- [ ] Do not modify `resolvePhase` to require hexes yet.

**Tests:**

- [ ] `src/game/board.test.ts` verifies axial distance, neighbor count, key lookup, terrain lookup, and terrain defense bonuses.
- [ ] `src/game/scenario.test.ts` verifies every squad hex exists on the board and every threat target hex exists on the board.
- [ ] Existing tests continue to pass.

**Verification:**

- [ ] Run `npm test`.
- [ ] Run `npm run build`.

**Commit:**

```bash
git add src/game/board.ts src/game/board.test.ts src/game/types.ts src/game/scenario.ts src/game/scenario.test.ts
git commit -m "feat: game: add hex board model"
```

## Slice 3: Render Hex Board and Unit Placement

**Intent:** Replace the lane-field view with a hex board view and let the player place Free Banners squads on allowed starting hexes before committing phase one.

**Files:**
- Create: `src/ui/HexBoard.tsx`
- Create: `src/ui/HexBoard.test.tsx`
- Modify: `src/ui/Battlefield.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/game/scenario.ts`
- Modify: `src/App.test.tsx`

**Implementation:**

- [ ] Add `deploymentFaction?: FactionId` to `BoardHex`.
- [ ] Render `scenario.board.hexes` as CSS-positioned hex tiles, using terrain-specific classes.
- [ ] Render squads by `squad.hex` instead of lane-derived positions.
- [ ] Add selected-squad local UI state in `App.tsx`.
- [ ] Let the player select a Free Banners squad and click an allowed deployment hex before phase one.
- [ ] Prevent placement on occupied hexes, enemy-only deployment hexes, and objective-only wall/gate hexes.
- [ ] After phase one starts, lock placement and keep only doctrine assignment active.
- [ ] Show terrain labels only when useful; prefer terrain color/icon and tooltip over always-visible text.
- [ ] Show an objective marker on Greyford Gate.
- [ ] Keep the old lane fields in scenario data until `resolvePhase` is migrated in Slice 4.

**Tests:**

- [ ] `HexBoard.test.tsx` verifies board tiles render, terrain labels are accessible, and squad tokens appear on expected hexes.
- [ ] `App.test.tsx` verifies selecting a squad and clicking a valid deployment hex moves that squad before the first commit.
- [ ] `App.test.tsx` verifies occupied/invalid hex clicks do not move the selected squad.
- [ ] Existing doctrine assignment and commit tests continue to pass.

**Verification:**

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Browser smoke test: move one squad, change one doctrine, commit a phase, confirm the squad remains on the chosen hex and the report still updates.

**Commit:**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css src/ui src/game/scenario.ts
git commit -m "feat: ui: render hex board and deployment"
```

## Slice 4: Move Resolution From Lanes to Hexes

**Intent:** Make combat, support, terrain, and objectives use board positions instead of lanes. This is the true replacement for the temporary MVP board model.

**Files:**
- Modify: `src/game/resolvePhase.ts`
- Modify: `src/game/resolvePhase.test.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/scenario.ts`
- Modify: `src/ui/HexBoard.tsx`

**Implementation:**

- [ ] Update threat resolution to use `targetHex` and nearby defenders instead of `laneId`.
- [ ] Define engagement radius as distance `<= 1` from the threat target for normal clashes.
- [ ] Define support radius as distance `<= 1` from support squads using `Rescue Standard` or future support doctrines.
- [ ] Apply `terrainDefenseBonus()` to defenders based on their current hex.
- [ ] Add an on-screen terrain legend once terrain changes resolution, showing each terrain type and its gameplay impact.
- [ ] Apply objective damage when an attacker threat targets an objective hex or an adjacent gate approach.
- [ ] Generate structured events for the UI:
  - `engagement`: attacker id, defender ids, target hex, strength/cohesion changes.
  - `support`: source id, target id, affected hexes.
  - `objectiveDamage`: objective id, hex, old integrity, new integrity.
  - `movement`: squad id, from hex, to hex if scripted movement is added.
- [ ] Keep prose `BattleReport` output, but make it a summary of structured events rather than the only source of truth.
- [ ] Remove lane dependency from resolution tests after hex resolution is stable.

**Tests:**

- [ ] `resolvePhase.test.ts` verifies defenders adjacent to a threat hex engage, while distant defenders do not.
- [ ] `resolvePhase.test.ts` verifies ridge/wall terrain reduces cohesion or objective pressure compared with field terrain.
- [ ] `resolvePhase.test.ts` verifies support affects neighboring friendly units and not distant units.
- [ ] `resolvePhase.test.ts` verifies objective damage is generated when a threat targets the gate approach.
- [ ] Existing victory/defeat and doctrine-difference tests continue to pass.

**Verification:**

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Browser smoke test: place a support unit adjacent to a defender, commit a phase, confirm support and terrain effects appear in the report and the terrain legend is visible.

**Commit:**

```bash
git add src/game/resolvePhase.ts src/game/resolvePhase.test.ts src/game/types.ts src/game/scenario.ts src/ui/HexBoard.tsx
git commit -m "feat: game: resolve phases on hex positions"
```

## Slice 5: Add Shared-Effect Indicators and Phase Playback

**Intent:** Make combat resolution visible. The player should see engagement markers, support areas, and meters changing during or immediately after phase resolution.

**Status 2026-05-22:** Complete. Playback uses structured `BattleReport.phaseEvents`; support appears as context, engagements resolve one at a time at the selected readable timing, objective damage resolves afterward, and pulsing stops in the report state. User-adjustable playback speed/off-switch is deferred until larger scenarios prove the need.

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/resolvePhase.ts`
- Modify: `src/game/resolvePhase.test.ts`
- Modify: `src/ui/HexBoard.tsx`
- Modify: `src/ui/BattleReportPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Implementation:**

- [x] Add `phaseEvents` to `BattleReport` with structured event data from Slice 4.
- [x] Render support area overlays around active support squads.
- [x] Render combat indicators on engaged hexes after commit, such as pulse rings, crossed-weapon icons, impact flashes, or brief event badges.
- [x] Animate meter changes with CSS transitions; respect `prefers-reduced-motion`.
- [x] Add playback state in `App.tsx`: `"command" | "resolving" | "report"`.
- [x] Disable doctrine assignment and placement while playback is resolving.
- [x] Keep playback short and skippable; the report remains available immediately after playback.
- [x] Do not add a full timeline editor or replay system in this slice.
- [ ] Consider token-only unit presentation for larger boards; text-heavy unit cards on the board will not scale.
- [ ] Explore round tokens with circular integrity/strength/cohesion fills around the token edge when larger boards make text labels too small.

**Tests:**

- [x] UI test verifies committing a phase shows at least one combat indicator and one support indicator when applicable.
- [x] UI test verifies doctrine selects are disabled during resolution.
- [x] UI test verifies report is visible after playback completes or after skip.
- [x] Unit test verifies resolver emits structured phase events for support, engagement, and objective damage.
- [x] UI test verifies support appears before individual engagements.
- [x] UI test verifies engagements step through at the selected readable timing.
- [x] UI test verifies pulsing indicators stop after playback reaches the report state.

**Verification:**

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Browser smoke test: play one phase and confirm visual indicators appear, meters change, and report remains readable.
- [x] Browser viewport check at desktop and narrow widths to confirm overlays do not obscure essential board state.
- [x] Browser smoke confirmed support active first, individual engagement beats, report state, and zero active/pulsing indicators after playback completes.

**Commit:**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css src/game src/ui
git commit -m "feat: ui: add phase playback indicators"
```

## Slice 6: Documentation and Evaluation Gate

**Intent:** Decide whether the board-first direction is working before expanding campaign scope.

**Status 2026-05-22:** In progress. The board-first loop is promising enough to continue, but larger-scenario readability remains the key gate before campaign/editor expansion.

**Files:**
- Modify: `PRD.md`
- Modify: `Stakeholder_Needs.md`
- Modify: `README.md`
- Create or modify: `docs/superpowers/plans/2026-05-15-post-mvp-board-evolution.md`

**Implementation:**

- [x] Update docs to describe the actual board model chosen: hexes, terrain, deployment, support radius, and playback events.
- [x] Add a short evaluation section comparing the new board experience against the post-MVP direction.
- [x] Record any deferred debt explicitly: art assets, larger map scrolling, campaign progression, doctrine editor, utility AI, save/load.
- [x] Do not start campaign expansion until the board-first loop is validated.

**Tests:**

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Manual browser pass from briefing through scenario victory or defeat.

**Commit:**

```bash
git add PRD.md Stakeholder_Needs.md README.md docs/superpowers/plans/2026-05-15-post-mvp-board-evolution.md
git commit -m "docs: product: document board evolution outcome"
```

## Cross-Slice Acceptance Criteria

- The player can still complete `The First Breach` after each slice.
- Doctrine assignment remains the main command decision; no rapid RTS micromanagement is introduced.
- Exact numeric state remains available, but the board no longer reads as a wall of text.
- Full 2D positioning, terrain, and shared-effect areas are represented in data and tested before richer visuals are added.
- Combat resolution produces visible feedback, not only prose reports.
- The implementation remains web-first and avoids campaign/editor/Mac scope expansion.
- The project remains free of Tolkien-specific names, quotes, places, hobbit analogues, and recognizable story structures.

## Recommended Execution Order

1. Slice 1: UI decomposition and meters.
2. Slice 2: Hex model under tests.
3. Slice 3: Hex rendering and deployment.
4. Slice 4: Hex-based resolution.
5. Slice 5: Shared-effect indicators and phase playback.
6. Slice 6: Documentation and evaluation.

Stop after Slice 3 if the hex board is not legible or fun enough; adjust board model before moving combat resolution fully onto it.

## Future Board Loop Notes

These are intentionally deferred until the board-first loop has stable resolution and feedback.

- `Clean Counterstroke` implies forward movement: on success, the Ash unit should retreat and the Free Banners unit should advance.
- `Fighting Withdrawal` implies fallback movement: the unit should move back by one hex when the doctrine resolves.
- Player turns should eventually include deliberate unit movement, with cavalry able to move farther than infantry.
- Ranged units should reach beyond adjacent hexes. Their effect may diminish with range, or they may take reduced melee damage because ranged pressure happens before close combat.

## Slice 7: Larger-Board Readability Evaluation Spike

**Intent:** Test whether the current board presentation has enough headroom before adding campaign breadth or richer scenario systems.

**Status 2026-06-26:** Complete. Added a data-only readability fixture with an 8 by 7 axial board, 14 squads, 2 objectives, and 7 scripted threats across 3 phases. The fixture is intentionally not wired into the app as a selectable scenario; it exists to stress board density, token identity, terrain spread, support adjacency, and playback event volume without starting campaign scope.

**Files:**
- Create: `src/game/readabilityScenario.ts`
- Create: `src/game/readabilityScenario.test.ts`
- Modify: `docs/superpowers/plans/2026-05-15-post-mvp-board-evolution.md`

**Evaluation:**

- The larger fixture stays within the existing scenario data shape and confirms the board model can represent a wider line without new architecture.
- The current rectangular token treatment is likely the next scaling bottleneck. On a 14-squad fixture, role-based token text such as `Shield` or `Engine` would repeat across multiple squads, weakening at-a-glance identity.
- The side status panel also becomes longer with the larger roster, so exact stats should remain off-token but the board token itself needs denser, clearer identity cues.
- Fixed playback timing is worth revisiting after token density improves. Seven scripted threats across three phases is enough to test event volume, but the stronger immediate issue is token identity rather than playback pacing.

**Tests:**

- [x] `src/game/readabilityScenario.test.ts` verifies board size, squad count, threat count, complete rectangular axial coordinates, valid squad/objective/threat hexes, unique initial squad positions, terrain variety, support adjacency, and multiple objective locations.

**Recommendation:**

- Proceed to Slice 8 before Slice 9. Use the larger fixture as evidence that compact token identity should improve before adding playback pace controls.

## Slice 8: Token Density and Board Information Pass

**Intent:** Improve board-token identity so a larger board can be scanned without relying on repeated role words or wide text rectangles.

**Status 2026-06-26:** Complete. Squad tokens now render as compact circular faction markers with two-character callsigns and role pips. Accessible labels still expose squad name, hex, role, and doctrine; exact strength and cohesion remain in the status panel rather than on-token.

**Files:**
- Modify: `src/ui/HexBoard.tsx`
- Modify: `src/ui/HexBoard.test.tsx`
- Modify: `src/styles.css`

**Evaluation:**

- The tutorial roster now renders as unique short codes: `GS`, `DA`, `MS`, `SR`, `CV`, `GE`, `ER`, and `FR`.
- The larger readability fixture also receives unique two-character token codes across all 14 squads, preventing repeated `Shield` or `Engine` labels.
- Faction remains encoded through token body color, while role is encoded through a small pip and role class.
- Browser QA confirmed desktop token selection, commit/skip playback flow, and a 390px mobile viewport with no horizontal overflow.
- Slice 9 remains useful: the larger fixture can generate enough phase events that fixed readable timing may feel long once the fixture is rendered or simulated through future scenario flows.

**Tests:**

- [x] `src/ui/HexBoard.test.tsx` verifies compact tutorial token codes, unique larger-fixture token codes, role/faction cues, selectable player tokens, deployment behavior, and objective hex labeling.
- [x] `npm test` passed with 53 tests.
- [x] `npm run build` passed.
- [x] `git diff --check` passed.

**Recommendation:**

- Proceed to Slice 9 with the smallest pace control. Do not add a replay timeline or scenario selector.

## Slice 9: Playback Pace and Event-Volume Control

**Intent:** Keep phase playback understandable as event volume grows without building a replay timeline or exposing the larger fixture as a scenario.

**Status 2026-06-26:** Complete. Added a compact `Readable` / `Fast` playback pace control in the right rail. Readable keeps the original timing; Fast shortens support, engagement, and objective-damage beats for higher-volume phases.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `PRD.md`
- Modify: `Stakeholder_Needs.md`
- Modify: `docs/superpowers/plans/2026-05-15-post-mvp-board-evolution.md`

**Evaluation:**

- The control is intentionally small: two segmented buttons, no replay timeline, no off switch, and no scenario selector.
- `Readable` remains the default for first-time tutorial comprehension.
- `Fast` gives the existing playback loop a lower-latency path for phases with more support, engagement, and objective events.
- Playback off remains deferred until larger rendered scenarios prove that skipping is not enough.

**Tests:**

- [x] `src/App.test.tsx` verifies that selecting `Fast` changes event stepping duration with fake timers while preserving the existing readable timing tests.

**Recommendation:**

- Stop this three-slice stack here. The next stack should decide whether to render the readability fixture in a controlled evaluation route, add board zoom/scroll, or begin doctrine-driven movement events.
