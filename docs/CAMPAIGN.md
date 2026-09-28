# Campaign

Code: `src/game/campaign/` (pure TypeScript; the campaign-map UI lives in the app layer).

## Shape

- **`CampaignDefinition`** (authored data, `definition.ts`): the companies and an ordered
  list of battles. *Ash & Banner* is *The First Breach* → *Ember Ford* →
  *The Saltmarsh Column* → *Hold for Dawn*; the last two are `placeholder` battles until
  T12 builds them. The campaign shows placeholders but cannot play them.
- **Roster continuity.** Each battle maps every player squad of its scenario to a campaign
  company (`slots: {scenarioSquadId: companyId}`). Roles must match, and a company fills at
  most one slot per battle. `validateCampaignDefinition()` checks this against the
  scenarios. A company **joins** the first time a battle uses it:
  - at its `startingResolve`, which defaults to 0 ("fresh");
  - the tutorial's four founding companies start at the Resolve the tutorial was
    balanced around.
- **`applyCampaign(def, state, scenario)`**: each mapped squad takes its company's name,
  Resolve and renown (renown also brings dread, for either side). The input scenario is
  never modified.
- **`CampaignState`** (saved): `battleIndex`, `status`, the roster (Resolve, renown title,
  battles fought, times routed and destroyed, times reformed) and `history`. Each history
  entry records the outcome, seed, attempt, phases played, companies broken, enemies
  broken, the defended objective's integrity, and every company's Resolve before and
  after.

## After each battle (`recordBattle`)

| Battle outcome | Company ended the battle… | Resolve |
| --- | --- | --- |
| victory or stalemate (the campaign advances) | steady (on the field, or escaped) | +1 |
| victory | routed | −1 |
| stalemate | routed | −2 (−1 plus the stalemate penalty) |
| victory or stalemate | destroyed | **reforms at −2** and loses its renown title |
| defeat | anything | no change: the same battle is **retried** with the same roster |

- Resolve is clamped to −3…+3.
- After a defeat, casualties and battles fought are still counted, and the attempt number
  goes up. Resolve does not change, which avoids death spirals.
- **Destroyed companies reform rather than disappear**, so later battles always have
  their slots filled. The banner is raised again by survivors and recruits, at −2
  (Shaken).
- **Renown**: reaching +3 without a title earns one from `titles.ts`. It is a
  deterministic, original generator seeded by the company id (for example
  "The Fordwardens" or "The Unbowed"), rerolled if another company already holds the
  same title. The title is kept when Resolve later dips, and lost only on destruction.

## Saves

- `saveCampaign(state)` writes `{"version": 1, "campaign": …}`, capped at 256 KiB.
- `loadCampaign(json, def)` **fails closed** with a `CampaignSaveError` on:
  - wrong type, bad JSON, the wrong version or an oversized save;
  - any malformed field (ids, ranges, enums, duplicates);
  - a campaign id, battle, company or status/battleIndex mismatch against the
    definition;
  - a history that could not have been played: the history is replayed from a fresh
    start with the campaign rules, and the battle order, scenario ids, attempt numbers,
    one result per slot with the slot's company, Resolve before/after, renown earned,
    `companiesBroken`, `battleIndex` and the whole roster (name, role, Resolve, renown and
    every counter) must match the replay.

  JSON `-0` is normalized to `0`.

  It rebuilds the state field by field, so unknown keys are dropped.
- **Stores** (`storage.ts`): `defaultStore()` uses Electron's bridge when present, else
  `localStorage` (key `doctrine-of-war:campaign`).
- **Electron** (`electron/saveFile.ts`): the preload exposes
  `window.doctrineOfWar.saves.{read, write}`. The main process handles two IPC channels
  that read and write **one fixed file**, `userData/campaign-save.json`:
  - the renderer never supplies a path;
  - only the app's own top-level document may call them (`electron/security.ts`:
    the packaged `dist/index.html`, or the dev server origin in development); subframes
    and foreign pages are rejected, and the window cannot navigate away, open windows
    or attach webviews;
  - before writing, main runs the same full `loadCampaign(data, ashAndBanner)`
    validation, so a bad write can never replace a good save;
  - writes are serialized and atomic (a fresh exclusive `0600` temp file, fsync, rename);
  - symlinks are never followed (the save, temp files or userData itself), and reads
    are bounded to 256 KiB.
- **CSP**: production builds (web and Electron) get a `Content-Security-Policy` meta
  from `vite.config.ts` (`PRODUCTION_CSP` in `electron/security.ts`): `script-src 'self'
  'wasm-unsafe-eval'` (the meshopt WASM decoder `useGLTF` uses), no `'unsafe-eval'`,
  no plugins or frames. The dev server has none (React refresh needs inline scripts).
