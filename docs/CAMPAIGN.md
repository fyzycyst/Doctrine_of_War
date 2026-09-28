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
| victory (the campaign advances) | steady (on the field, or escaped) | +1 |
| stalemate (the campaign advances) | steady | +0 (a stalemate earns nothing) |
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

## Balancing campaign battles

Carried-over Resolve and renown change a battle a lot, so `npm run balance` checks
every campaign battle after the first against three rosters:

| Roster | What it is | Guardrails |
| --- | --- | --- |
| baseline | the scenario as authored | full: intended wins ≥ 75%, bad ≤ 35%, every mono plan advances < 60% |
| strong | the curated path (every earlier battle won with its intended plan on its curated seed), replayed live | full |
| rough | a plausible bad run: the strong roster's best company destroyed and reformed at −2 (renown lost), the next two at −1 | **floor only**: intended advances ≥ 75%, bad advances ≤ 35%, no mono cap |

**Why rough is only a floor.** The rough roster makes sure a struggling player can
still win. Policing doctrine dominance there fights the escalation instead:
- anything that makes a battered army winnable also makes blunt plans winnable;
- on a broken army, "just do the one thing" working is acceptable.

Doctrine dominance is policed on the baseline and strong rosters, and each battle's
scenario tests include an **ablation test**. The intended plan uses at least two
doctrine families in meaningful roles, and swapping out any one family costs at least
15 points of advance rate.

**The Host has heard of you** (`hostEscalation`, applied by `applyCampaign`):
- The Host scales to the army that takes the field, relative to the roster the
  scenario was authored for, in **both** directions.
- *Fame* is the fielded companies' Resolve sum plus 2 per renowned company. Each point
  of fame above (below) the authored roster's adds (removes) 2 strength on every Host
  company, capped at ±12. Every 4 points shift Host Resolve by 1, capped at ±1.
- Veterans draw the Host's hardest companies; a battered army faces a Host that holds
  its best back. It is deliberately small: it keeps strong-roster battles tense rather
  than rebalancing them.

## Saves

- `saveCampaign(state)` writes `{"version": 1, "campaign": …}`, capped at 256 KiB.
- `loadCampaign(json, def)` **fails closed** with a `CampaignSaveError` on:
  - wrong type, bad JSON, the wrong version or an oversized save;
  - any malformed field (ids, ranges, enums, duplicates);
  - a campaign id, battle, company or status/battleIndex mismatch against the
    definition.

  It rebuilds the state field by field, so unknown keys are dropped.
- **Stores** (`storage.ts`): `defaultStore()` uses Electron's bridge when present, else
  `localStorage` (key `doctrine-of-war:campaign`).
- **Electron** (`electron/saveFile.ts`): the preload exposes
  `window.doctrineOfWar.saves.{read, write}`. The main process handles two IPC channels
  that read and write **one fixed file**, `userData/campaign-save.json`:
  - the renderer never supplies a path;
  - payloads must be strings of at most 256 KiB holding a versioned JSON object;
  - writes are atomic (a temp file, then a rename).
