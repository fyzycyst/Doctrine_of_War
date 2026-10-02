# Campaign

Code: `src/game/campaign/` (pure TypeScript; the campaign-map UI lives in the app layer).

## Shape

- **`CampaignDefinition`** (authored data, `definition.ts`): the companies and an ordered
  list of battles. *Ash & Banner* is *The First Breach* → *Ember Ford* →
  *The Saltmarsh Column* → *Hold for Dawn*. A battle can be marked `placeholder` while it
  is being built: the campaign shows it but cannot play it (none are left in *Ash &
  Banner*).
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

## Packs (`src/game/packs`, M1)

Content ships as **packs**: `packs -> campaigns -> battles`, plus a skirmish list per
pack. A `PackManifest` is plain, versioned data (`revision {pack, content, rules}`,
`readsContent`: the content revisions whose saves it still replays). Packs are compiled
in, but `createRegistry` treats every manifest as untrusted: `parsePackManifest`
rebuilds it field by field through a fail-closed schema (unknown fields and kinds are
refused; ids, numbers and lists are bounded), then `lintPacks` checks ids unique across
packs (packs, campaigns, **companies**, scenarios, doctrines, skirmishes), every
reference, each scenario's internal consistency, and each campaign against its
scenarios. Nothing is exposed from a set that fails. `registry.compatibility(provenance)`
says whether a saved run (pack, campaign, content and rules revision) can continue.
The shipped pack is `first_call` (The First Call), holding the intro.

Adding an engine condition, action, selector, win or defeat kind means adding it to
`packs/manifest.ts` too; the shipped-pack round-trip test fails until you do.

## The Roll (`roll.ts`, M1): Roll campaigns

A campaign with `mode: "roll"` calls companies from its **Roll** into each battle; the
intro stays `"fixed"` and is untouched.

- **Slots** are the scenario's player squads (stable slot id = squad id; activation
  order = squad order, never changed by selection). `battle.slots` is the authored
  default. `battle.call.flex` allows at most 2 role-variable slots, each with the squad's
  own role first and a doctrine per role; `battle.call.locked` story-locks a company.
- **Companies own their profile** (`strength`, `cohesion`), linted against a per-role
  band (`PROFILE_BANDS`), and **arrive** at an authored battle (`joins`).
- **Assignment** (`slot id -> company id`) is checked by `validateAssignment` (plain
  reasons per slot); `recommendedForce` is always legal: locks, then the readiest company
  per slot (fresh before Worn, then Resolve and renown; ties to the authored company).
- **The Host's threat is fixed at battle entry** (`battleThreat`): the intro's bounded
  escalation, computed from the *recommended* force and the state at entry, not from the
  picks. A defeat changes nothing it reads, so retries face the same Host.
- `assembleBattle` returns an ordinary `EngineScenario`: each slot squad takes its
  company's name, role, profile (minus the Worn penalty), Resolve, renown and, on a flex
  slot, the doctrine for its role. `recordBattle(..., { assignment })` settles it.

**Worn, reserves and reform (B2).** Conditions change only on an advancing result
(victory or stalemate); a defeat changes nobody's readiness.

| A company that... | becomes |
| --- | --- |
| was fielded and destroyed | **Reforming** (Resolve −2, renown lost, as today): sits out the next advancing battle |
| was fielded and routed | **Worn** |
| was fielded and ended under half the strength it took the field with | **Worn** |
| was fielded otherwise | keeps its condition (only rest clears Worn) |
| sat in reserve | **fresh** (one advancing battle in reserve clears Worn and Reforming) |

Precedence: destroyed > routed > under strength. A Worn company may be fielded at −15
strength and −10 cohesion (`WORN_PENALTY`). A Reforming company cannot be assigned unless
a slot story-locks it, and then it fights with the Worn penalty (and comes out Worn).
**Legal force:** a slot no ready company can fill takes a nameless **levy** (`LEVY_ID`;
the bottom of its role's band, Resolve −1, no renown, never settled). A levy is only
legal where it is forced. Records store each slot's `startStrength` and `endStrength`, so
conditions re-derive on replay.

**Carry-over.** Starting a Roll campaign, the player may bring up to 5 companies from a
*completed* campaign (`carryOverCandidates`, `snapshotCarryOver`). Each is snapshotted
into the new run (`state.carried`: id, name, role, profile, Resolve clamped to −1…+2,
renown kept, origin); replay starts from the snapshot and never re-reads the earlier
save. Carried companies join the Roll at the start, beside the authored army, and count
toward the Host's threat like any other. Company ids are unique across campaigns (lint).
Loading a run checks each carried snapshot against this build's registry: the origin pack
and campaign exist, the company is in that campaign's definition with the same id, name
and role, its profile is the frozen definition profile, Resolve is inside the clamp, and
renown is none or a title the generator can give that company. **Trust decision:** the
snapshot does not prove that the source run was completed, or that the company really
earned that Resolve or renown there. The game is single-player and the snapshot stands
alone by design (the earlier save is never re-read), so editing a local save only changes
the player's own campaign.
The intro's companies carry their Hold for Dawn numbers as their profile.

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
  company, capped at ±12. Above the authored roster, every 4 points add 1 Host Resolve
  (capped at +1).
- **Catch-up handicap** (below the authored roster): every 2 points of missing fame
  remove 1 Host Resolve, capped at −2. It is small and relative (a roster at or above
  the authored fame never sees it), and it exists because a battered army's low Resolve
  hurts twice, through wavering and through dread; without it Ember Ford's rough roster
  fell to about 30% once a timeout became a defeat.
- Veterans draw the Host's hardest companies; a battered army faces a Host that holds
  its best back. It is deliberately small: it keeps strong-roster battles tense rather
  than rebalancing them.

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
  - **Accepted risk:** userData is checked with `lstat` and the file is then opened by
    path, so a process that swaps the userData folder for a symlink in between can
    redirect a read; exploiting that needs write access to the user's own Library
    folder, which already grants control of the app's data, so it is out of scope.
- **Per-campaign saves** (M1, `saveFiles.ts`): one save per campaign, keyed by an
  **allowlisted** campaign id (`CAMPAIGN_SAVE_FILES`). The intro (`ash_and_banner`)
  keeps its v1 file and localStorage key and is read and written exactly as before (no
  migration, no backup file; a v1 fixture corpus written by the `v1.0-intro` build,
  `fixtures/v1/`, must load and re-save byte for byte). Every other campaign writes a
  **v2 envelope** `{"version": 2, "provenance": {packId, campaignId, contentRevision,
  rulesRevision}, "campaign": …}` (at most `MAX_RUN_BYTES`, 512 KiB per campaign; a full
  11-battle run with 120 attempts and five carried companies uses well under half).
  - `readCampaignSave(registry, id, payload)` never throws: `empty`, `ok`, `unavailable`
    (a well-formed run this build cannot continue: other pack, campaign, content or
    rules revision) or `unreadable`. v2 loading rebuilds every field and replays the
    history from the carried snapshot with the Roll rules (`loadRollCampaignState`):
    each assignment must be legal in the replayed state, start strengths as fielded, end
    strengths no higher and 0 exactly when destroyed, and conditions, Resolve, renown and
    the Roll must match.
  - **Preserved runs:** `saveCampaignRun` refuses to replace an `unavailable` or
    `unreadable` v2 save; the player sets it aside first (`store.setAside`, which keeps
    it under `:aside` / `<file>.aside-<time>-<id>`). Each v2 write keeps the previous
    save as a backup (`:backup` / `<file>.bak`); `loadCampaignBackup` reads it for
    recovery.
  - **Electron:** the save channels take an optional campaign id (none means the
    intro). Main checks it against **its own literal allowlist** (`MAIN_SAVE_FILES`,
    tested equal to the renderer's) and accepts nothing else; no path crosses the
    bridge. Before a v2 write, main itself requires the payload to read `ok` for exactly
    that campaign against the shipped registry, refuses to overwrite a preserved run,
    and writes the backup and the save atomically with the same no-symlink rules. Two
    channels, `saves:backup` and `saves:set-aside`, take a campaign id only. Export
    takes an optional campaign id and will copy out a run this build cannot continue
    (useful in a bug report), but not an unreadable file.
- **Seeds and support** (T19): every battle's seed stays in the save (each history
  record) and in the phase log, but the UI shows it only with Settings → Support →
  "Show battle details" (off by default). "Export save file…" copies the campaign save
  for a bug report: a download on the web; in Electron a fixed-purpose channel,
  `doctrine-of-war:saves:export`, that takes no arguments: main reads and validates its
  own save and writes it where the user picks in the native save dialog.
- **Doctrine variants** (T16, Experimental) live in their own versioned store,
  `{"version": 1, "variants": […]}` (at most 24, 64 KiB): `localStorage` key
  `doctrine-of-war:variants` on the web, or a second fixed file,
  `userData/doctrine-variants.json`, on its own IPC channels with the same checks as
  the save (main-side validation refuses any variant the game would drop). Changes are
  stored before they are shown, so a refused write changes nothing. A campaign battle
  fought with a variant records `customOrders: true` in its history; there is no penalty.
- **CSP**: production builds (web and Electron) get a `Content-Security-Policy` meta
  from `vite.config.ts` (`PRODUCTION_CSP` in `electron/security.ts`): `script-src 'self'
  'wasm-unsafe-eval'` (the meshopt WASM decoder `useGLTF` uses), no `'unsafe-eval'`,
  no plugins or frames. The dev server has none (React refresh needs inline scripts).
