# Product Requirements Document - Doctrine of War: Ash & Banner

## 1. Product Summary

Doctrine of War: Ash & Banner is a web-first, phase-based fantasy command game. Players assign faction-flavored doctrines to squads during command windows, then watch battle phases resolve on a readable 2D battlefield. The MVP proves the core loop with one tutorial scenario.

## 2. Goals

- Prove that doctrine assignment is fun without high-speed micromanagement.
- Establish the Ashen Host and Free Banners as mechanically distinct sides.
- Deliver one playable tutorial scenario.
- Build the game around data-shaped scenarios so future campaigns and a campaign editor remain possible.
- Keep the simulation core portable enough that a Mac app can be considered later.

## 3. Non-Goals

- No full campaign in MVP.
- No campaign editor in MVP.
- No multiplayer in MVP.
- No Mac-native app in MVP.
- No full doctrine editor in MVP.
- No persistent Resolve progression in MVP.
- No heavyweight AI or LLM-controlled opponent in MVP.
- No Tolkien-derived names, places, quotes, species-specific lore, or recognizable story structures.

## 4. Target Audience

Players who like strategy games, tactical RPGs, autobattlers, and RTS concepts, but want planning and command judgment to matter more than rapid manual unit control.

## 5. MVP Scope

The MVP contains one tutorial scenario.

Required MVP features:

- Web app shell.
- 2D battlefield view.
- One tutorial scenario.
- Phase-based command loop.
- Squad-level doctrine assignment from a pick list.
- Faction-flavored doctrine presets.
- Scenario-driven computer-controlled opponent.
- Basic battle resolution and playback.
- Basic battle report after each phase.
- Visible squad state including role, health/cohesion, doctrine, and Resolve.
- Scenario data represented separately from UI code.

Deferred features:

- Doctrine editing.
- Multi-scenario campaign progression.
- Resolve persistence between scenarios.
- Branching campaigns.
- Campaign editor.
- Utility AI skirmish mode.
- Save/load.
- Mac packaging or native app.

## 6. Core User Stories

- As a player, I want to assign a doctrine to each squad from a short pick list so I can shape battle behavior without micromanaging individual units.
- As a player, I want to see a battle phase resolve after I commit orders so I can evaluate whether my doctrine choices worked.
- As a player, I want battle reports that explain important outcomes so I can improve my next command decision.
- As a player, I want the Ashen Host and Free Banners to feel different so choosing a side changes the experience.
- As a future scenario designer, I want the tutorial scenario represented as data so new scenarios can be added without rewriting the whole game.

## 7. Core Loop

1. Scenario briefing explains objective, sides, initiative rule, and available squads.
2. Player reviews squads, doctrines, and visible battlefield setup.
3. Player assigns doctrines to squads.
4. Player commits orders.
5. Battle phase resolves automatically.
6. System presents movement, clashes, losses, morale/cohesion changes, and objective progress.
7. Battle report explains key outcomes.
8. If the scenario is not over, another command window begins.

## 8. Tutorial Scenario Requirements

The tutorial scenario should:

- Teach doctrine assignment.
- Demonstrate that the Host usually acts first.
- Demonstrate that Banners answer pressure through doctrine.
- Include at least two battle phases.
- Include at least one visible consequence of a doctrine choice.
- End with a clear win/loss state.

Suggested tutorial framing:

- Scenario name: The First Breach.
- Scenario premise: the Ashen Host pressures a defensive line while the Free Banners attempt to hold long enough to counter.
- MVP simplification: the player can control one side while the opponent uses scripted choices.

## 9. Doctrine Requirements

MVP doctrine behavior should be preset-based.

Each doctrine should define a small number of readable behavior parameters, such as:

- Stance.
- Primary target preference.
- Formation behavior.
- Retreat threshold.
- Pursuit rule.
- Resource policy, if resources exist in the tutorial.

The MVP does not need to expose doctrine editing. It only needs enough internal structure for doctrines to produce distinct visible behavior.

## 10. Squad and Resolve Requirements

Squads are the primary controllable military units.

Each squad should have:

- Name.
- Faction.
- Role.
- Current doctrine.
- Health or strength.
- Cohesion or morale state.
- Resolve value.

Resolve should be represented at the squad level. In MVP, Resolve may affect battle resolution within the tutorial but does not need to persist after the scenario.

Resolve effects should be hybrid:

- Small combat modifier.
- Larger doctrine reliability and cohesion modifier.

## 11. Opponent Requirements

MVP opponent behavior should be scenario-driven and inspectable.

Acceptable MVP behavior:

- Scripted phase choices.
- Simple conditional reactions based on scenario state.

Not required:

- Search/planning AI.
- Machine learning.
- LLM decisions.
- Fully reusable skirmish AI.

## 12. Battle Presentation Requirements

The battle view should be readable before it is elaborate.

Requirements:

- 2D battlefield.
- Clear squad positions.
- Clear objectives.
- Clear phase state.
- Clear active doctrine per squad.
- Clear outcome animation or step playback.

Visual direction may use pseudo-3D, isometric, or elevated sprites if that improves clarity, but the simulation should remain simple enough for the tutorial.

Reference lessons:

- Bad North suggests compact squad readability and stylized tactical space.
- Tooth and Tail suggests simplified RTS control and approachable 2D strategy presentation.
- Into the Breach suggests high clarity around cause and effect.
- Isometric tactics games suggest useful staging ideas, but MVP should avoid excessive grid and elevation complexity.

## 13. Scenario Data Requirements

The tutorial scenario should be data-shaped from the start.

Scenario data should be able to describe:

- Scenario id and title.
- Briefing text.
- Factions.
- Acting side or initiative rule.
- Battlefield layout.
- Squads.
- Available doctrines.
- Objectives.
- Phase scripts or opponent choices.
- Win/loss conditions.

The exact file format can be decided during technical planning.

## 14. Success Criteria

The MVP succeeds if:

- A player can complete one tutorial scenario in the browser.
- The player can assign doctrines from a pick list before battle phases.
- The battle result visibly changes based on doctrine assignment.
- Battle reports explain at least one important cause-and-effect outcome per phase.
- The tutorial scenario is represented separately from rendering/UI code.
- The project remains free of Tolkien-specific IP dependencies.

## 15. Risks

- Doctrine effects may be too opaque.
  - Mitigation: battle reports must explain major outcomes.

- The battlefield view may become too complex too early.
  - Mitigation: prioritize readable 2D state over visual richness.

- The MVP may overbuild campaign systems before proving the loop.
  - Mitigation: only one tutorial scenario and no persistence in MVP.

- The opponent may feel too scripted.
  - Mitigation: acceptable for tutorial; utility AI can follow after core loop validation.

- The game may drift toward ordinary RTS controls.
  - Mitigation: keep player agency centered on doctrine assignment and command windows.

## 16. Post-MVP Direction

The MVP establishes the doctrine-command loop. Future slices should improve the game board and reduce cognitive load before expanding campaign scope.

Priority future needs:

- Replace the text-heavy interface with a battlefield-first layout.
- Keep essential information visible while moving details behind hover, right-click, buttons, menus, or focused inspector panels.
- Represent Strength, Cohesion, Integrity, and similar quantities as visual meters, with exact numbers available on demand.
- Expand from lane-field positioning toward full 2D tactical positioning.
- Evaluate a hex-based board with a small terrain tile set and a small unit icon/sprite set.
- Allow player-controlled unit placement before battle phases.
- Add terrain effects that can alter combat, support, movement, or doctrine reliability.
- Show shared-effect areas for support, morale, command, or area denial.
- Add phase-resolution animation or visual indicators for engagements, damage, cohesion loss, support effects, and objective damage.

Known MVP board issues:

- Some labels and units overlap or sit awkwardly in the lane-field view.
- This is acceptable as temporary MVP debt if the next board slice replaces the lane-field presentation.

## 17. Acceptance Criteria

- The app launches locally in a browser.
- The tutorial scenario can be started from the main screen or directly loaded.
- The player sees squads, doctrines, and objective state.
- The player can assign a doctrine to at least three squads.
- The player can commit orders to resolve a phase.
- At least two distinct doctrines produce visibly different behavior.
- The scenario can end in victory or defeat.
- A post-phase report shows casualties, cohesion/Resolve-relevant effects, objective progress, and at least one explanatory note.

## 18. MVP Evaluation

Current evaluation:

- The MVP successfully demonstrated that doctrine assignment and phase resolution can be interesting and fun even in a rudimentary form.
- The game has enough potential to justify further slices.
- The next planning pass should focus on board presentation, information hierarchy, 2D positioning, terrain, placement, shared-effect visualization, and combat feedback before broader campaign expansion.
