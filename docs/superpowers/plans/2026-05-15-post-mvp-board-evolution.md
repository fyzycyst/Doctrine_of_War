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
- [ ] Browser smoke test: place a support unit adjacent to a defender, commit a phase, confirm report and visible effect area reflect support.

**Commit:**

```bash
git add src/game/resolvePhase.ts src/game/resolvePhase.test.ts src/game/types.ts src/game/scenario.ts src/ui/HexBoard.tsx
git commit -m "feat: game: resolve phases on hex positions"
```

## Slice 5: Add Shared-Effect Indicators and Phase Playback

**Intent:** Make combat resolution visible. The player should see engagement markers, support areas, and meters changing during or immediately after phase resolution.

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

- [ ] Add `phaseEvents` to `BattleReport` with structured event data from Slice 4.
- [ ] Render support area overlays around active support squads.
- [ ] Render combat indicators on engaged hexes after commit, such as pulse rings, crossed-weapon icons, impact flashes, or brief event badges.
- [ ] Animate meter changes with CSS transitions; respect `prefers-reduced-motion`.
- [ ] Add playback state in `App.tsx`: `"command" | "resolving" | "report"`.
- [ ] Disable doctrine assignment and placement while playback is resolving.
- [ ] Keep playback short and skippable; the report remains available immediately after playback.
- [ ] Do not add a full timeline editor or replay system in this slice.

**Tests:**

- [ ] UI test verifies committing a phase shows at least one combat indicator and one support indicator when applicable.
- [ ] UI test verifies doctrine selects are disabled during resolution.
- [ ] UI test verifies report is visible after playback completes or after skip.
- [ ] Unit test verifies resolver emits structured phase events for support, engagement, and objective damage.

**Verification:**

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Browser smoke test: play one phase and confirm visual indicators appear, meters change, and report remains readable.
- [ ] Browser viewport check at desktop and narrow widths to confirm overlays do not obscure essential board state.

**Commit:**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css src/game src/ui
git commit -m "feat: ui: add phase playback indicators"
```

## Slice 6: Documentation and Evaluation Gate

**Intent:** Decide whether the board-first direction is working before expanding campaign scope.

**Files:**
- Modify: `PRD.md`
- Modify: `Stakeholder_Needs.md`
- Modify: `README.md`
- Create or modify: `docs/superpowers/plans/2026-05-15-post-mvp-board-evolution.md`

**Implementation:**

- [ ] Update docs to describe the actual board model chosen: hexes, terrain, deployment, support radius, and playback events.
- [ ] Add a short evaluation section comparing the new board experience against the post-MVP direction.
- [ ] Record any deferred debt explicitly: art assets, larger map scrolling, campaign progression, doctrine editor, utility AI, save/load.
- [ ] Do not start campaign expansion until the board-first loop is validated.

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
