# Doctrine of War: Ash & Banner

Doctrine of War: Ash & Banner is a web-first fantasy command game prototype. Players lead the Free Banners in the tutorial scenario, assign doctrines to squads during command windows, and watch deterministic battle phases resolve against the Ashen Host.

## MVP Status

This repository currently implements the first playable MVP slice:

- Vite + React + TypeScript web app.
- One tutorial scenario: `The First Breach`.
- Player controls the Free Banners.
- Ashen Host acts first through scripted phase pressure.
- 2D lane-field hybrid battlefield.
- Preset doctrine assignment from pick lists.
- Squad-level strength, cohesion, and Resolve.
- Deterministic phase resolution with battle reports.

Deferred until later:

- Doctrine editing.
- Multi-scenario campaign progression.
- Resolve persistence between scenarios.
- Campaign editor.
- Utility AI skirmish mode.
- Save/load.
- Mac packaging or native app.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Checks

```bash
npm test
npm run build
```

## Project Shape

- `src/game/` contains pure TypeScript game types, scenario data, doctrines, and phase resolution.
- `src/ui/` is reserved for future extracted React UI components.
- `src/App.tsx` currently composes the tutorial screen, doctrine assignment, battlefield, and battle report.
- `PRD.md` and `Stakeholder_Needs.md` capture the product intent and MVP constraints.

## IP Guardrails

This project should not use Tolkien-specific names, quoted lines, places, species-specific lore, hobbit analogues, or recognizable story structures. Common fantasy ingredients may be used only through original naming, worldbuilding, and mechanics.

