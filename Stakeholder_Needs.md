# Stakeholder Needs - Doctrine of War: Ash & Banner

## Purpose

Doctrine of War: Ash & Banner is a phase-based fantasy command game about preparing standing orders, assigning doctrines to squads, and watching those orders play out under battlefield pressure. The game should capture the dramatic energy of commanding armies in a mythic war while avoiding any direct dependence on Tolkien-specific names, species, places, quotes, or story structures.

The initial product goal is to prove whether doctrine-driven command is fun before investing in campaign breadth, a scenario editor, advanced AI, or Mac-native packaging.

## Stakeholders

- Project lead: defines vision, evaluates design fit, and approves implementation scope.
- Player: wants a strategy game where good planning matters more than rapid micromanagement.
- Future scenario designer: needs scenarios to be data-driven enough that a campaign editor can eventually be built on top.
- Future developer: needs clear boundaries between simulation, scenario data, AI behavior, and UI.

## Product Vision

Players command either:

- The Ashen Host: an advancing war host that usually acts first and pressures the battlefield through momentum, siege, sacrifice, and ruthless doctrine.
- The Free Banners: a defensive coalition that usually answers the first blow through discipline, preservation, terrain, reserves, and counterstroke.

The game uses "bad guys first, exceptions possible" as a scenario rule. This gives the Host initiative by default while allowing special scenarios such as ambushes, sorties, or desperate preemptive strikes.

## Core Pillars

1. Doctrine over micromanagement
   - The player wins by choosing and assigning standing orders, not by high actions per minute.
   - Battle control happens mostly between phases.

2. Readable battlefield consequences
   - Doctrine choices must visibly affect formation, targeting, retreat, pursuit, resource use, and cohesion.
   - The player should understand why a squad held, broke, advanced, or failed.

3. Moral and faction asymmetry
   - The Ashen Host and Free Banners use the same underlying systems but have different preset doctrines, scenario pressures, and strategic trade-offs.

4. Campaign continuity through mechanics
   - Long-term consequences should initially be mechanical, not heavily branching.
   - Resolve is the first campaign continuity stat, though persistence can be deferred until multiple scenarios exist.

5. Data-shaped scenarios
   - Scenarios should be defined as data early, even though the campaign editor is deferred.
   - Scenario data should eventually support objectives, deployment, initiative rules, doctrine availability, rewards, and special rules.

## MVP Stakeholder Needs

For the first MVP, the project needs only one tutorial scenario.

The MVP should:

- Teach the phase loop.
- Let the player choose a side or at least clearly preview both factions.
- Present a 2D battlefield view with readable squads, lanes, objectives, and phase outcomes.
- Use faction-flavored doctrine presets.
- Allow doctrine assignment from a pick list.
- Defer full doctrine editing until the basic UI and mechanics are proven.
- Use a small scenario-driven opponent, not a heavyweight AI.
- Run as a web app first.
- Keep Mac app delivery deferred.

## Battle Presentation Direction

The battlefield should be fundamentally 2D, with optional pseudo-3D or isometric presentation cues if they improve readability. The goal is not visual spectacle first. The goal is to make squad roles, battlefield state, doctrine execution, and phase outcomes legible.

Useful references:

- Bad North: small readable islands, real-time tactics, compact squad identity.
- Tooth and Tail: RTS influence with simplified controls and approachable 2D presentation.
- Into the Breach: chess-like positional clarity and strong cause-and-effect readability.
- Tactics Ogre-style isometric battlefields: useful as a warning and inspiration for depth, height, and tactical staging, but the MVP should avoid excessive grid complexity.

## Post-MVP Direction

The MVP validated the core doctrine loop, but the next experience should move away from a text-heavy control surface and toward a battlefield-first game board.

Future direction should prioritize:

- A full-window landscape with UI overlaid only where it does not obscure essential game elements.
- Reduced always-visible text; show only essential state by default and reveal detail through hover, context menus, buttons, or panels.
- Visual meters for Strength, Cohesion, Integrity, and similar quantities, with exact values available on demand.
- A move from lane-field presentation toward full 2D tactical positioning.
- Player-controlled unit placement before battle phases.
- Terrain effects that influence movement, defense, visibility, support, or doctrine reliability.
- A likely hex-based board with a limited terrain tile set and a limited unit icon/sprite set.
- Clear visual indication for shared effects, such as support auras, command radius, morale influence, or area denial.
- Animation or visual combat indicators during phase resolution so players can see engagements and state meters change in response.

The current MVP board has known temporary placement and overlap issues. Those issues should not drive large cleanup work if the next slice replaces the lane-field board with a richer 2D board model.

## Doctrine System Needs

The first version should include a small library of preset doctrines per faction.

Example Ashen Host doctrines:

- No Step Back
- Iron Tide
- Break the Gate
- Cull the Weak
- Terror Push

Example Free Banners doctrines:

- Shield the Line
- Fighting Withdrawal
- Rescue Standard
- Clean Counterstroke
- Hold for Dawn

Doctrines should initially be selected from a pick list and assigned to squads. Editing can be deferred until the player experience around assignment, battle resolution, and feedback is tested.

## Resolve Needs

Resolve is a squad-level stat that represents battle-hardening, morale, discipline, and reliability under pressure.

Resolve should eventually use a signed range:

- -3 Broken
- -2 Shaken
- -1 Unsteady
- 0 Green
- +1 Tested
- +2 Hardened
- +3 Veteran

Resolve should have hybrid effects:

- Small direct combat effectiveness impact.
- Larger impact on doctrine reliability, cohesion, rout resistance, reaction time, and recovery from shock.

For the one-scenario MVP, Resolve can be displayed and used locally without long-term persistence. Persistence becomes important when the campaign expands beyond the tutorial.

## Computer-Controlled Side Needs

The opponent should begin as scenario-driven behavior:

- Scripted tutorial decisions where teaching clarity matters.
- Simple heuristic or utility scoring later for replayable scenarios.

The project should not begin with a planner AI, LLM-driven opponent, or opaque decision system. The opponent must be small, inspectable, and tunable.

## Platform Needs

The project should start as a web app.

Reasons:

- Faster iteration.
- Easier UI experimentation.
- Easier local testing.
- Good fit for a portable deterministic simulation core.
- Keeps future Mac packaging or native rebuild open.

Mac app delivery is deferred until the core loop proves fun.

## IP and Creative Guardrails

The project must avoid:

- Tolkien-specific names, quotes, places, lineages, story arcs, and species-specific lore.
- Hobbits or close analogues.
- Directly recognizable Mordor/Isengard-style naming, geography, or faction identity.
- Marketing copy that references a Tolkien quote as the game premise.

Common fantasy elements such as armies, banners, siege engines, elves, dwarves, humans, or monstrous troops may be used only through original worldbuilding and naming.

## Open Questions

- Should the first tutorial allow choosing either faction, or should it teach one faction first and preview the other?
- Should the first battle use lanes, free movement, or a hybrid 2D battlefield with authored routes?
- How much randomness should battle resolution include?
- Should doctrine assignment be per squad only, or should some scenario-level orders also exist?
- What visual style best balances clarity, mood, and implementation cost?
- Should the post-MVP 2D board use hexes from the start, or should it first use a simpler zone grid to prove placement, terrain, and adjacency?
- Which details should be visible by default, and which should move behind tooltips, context menus, or inspector panels?
