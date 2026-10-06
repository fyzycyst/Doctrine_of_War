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
The shipped pack is `first_call` (The First Call), holding the intro and *Cinder Road*
(in development: battles 1–3 so far, until its length is frozen; see below).

**Editions.** `first_call` is at content revision **3** (`readsContent: [3]`) since
*Cinder Road* gained battle 3 (C3; revision 2 came with battle 2, C2): an earlier-content
Cinder Road run (one completed after battle 2 cannot replay against a three-battle
campaign) is read as **unavailable**, kept as it is, and can be set aside to begin anew; it
is never shown as unreadable. Appending
a battle to a campaign is such a change, so bump the content revision with it. The
intro's v1 save is not gated by content revision.

Adding an engine condition, action, selector, win or defeat kind means adding it to
`packs/manifest.ts` too; the shipped-pack round-trip test fails until you do.

## The Roll (`roll.ts`, M1): Roll campaigns

A campaign with `mode: "roll"` calls companies from its **Roll** into each battle; the
intro stays `"fixed"` and is untouched.

- **Slots** are the scenario's player squads (stable slot id = squad id; activation
  order = squad order, never changed by selection). `battle.slots` is the authored
  default. `battle.call.flex` allows at most 2 role-variable slots, each with the squad's
  own role first and a doctrine per role; `battle.call.locked` story-locks a company.
  `battle.call.labels` names posts by where they stand ("The Ford Road"; short plain
  names, never a company's). `RollSlot.label` is that name, else the hex's board label,
  else "<Terrain> · <role>" ("Ridge · skirmishers"), never the scenario squad's name;
  `RollSlot.hex` says where the post stands.
- **Realms.** A company may name its home realm (`realm`: `greyford_march`,
  `fenwardens`, `dawnwatch_holds`; `REALM_IDS` grows with later packs). It is frozen on
  release like the name, travels in carried snapshots, and is checked against the origin
  campaign's definition on load.
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
**At most 2 veterans take the field.** A run may carry up to 5 companies in, but at most
`maxCarriedFielded` of them (default 2, `DEFAULT_MAX_CARRIED_FIELDED`; a campaign may set
0–5) take the field in any one battle; the rest wait in reserve. `validateAssignment`
refuses a third ("At most 2 veterans from earlier campaigns may take the field; <Company>
must stay in reserve, not hold <post>."), `carriedFielded(def, state, assignment)` gives
the UI its "Veterans n/2", and a levy is legal where only a benched veteran could hold a
post. `recommendedForce` fills the posts from the campaign's own army by readiness, then
places at most the limit of veterans, each where it gains the most readiness over the
post's holder (a levy-held post first); the Host's fixed threat reads that force, so it
counts at most two veterans' fame. The harness's picks (`rollCalls`) respect the limit.
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

### Roll battles: the named calls (`rollCalls.ts`, P5)

A Roll battle is not one roster but a choice, so it is balanced on the **Tier A named
calls** (synthesis §6): deterministic assignments from deterministic campaign states.
`balanceVariantsIn(campaigns, scenarios, scenario)` dispatches: a Roll campaign's calls,
a fixed campaign's rosters, or the baseline.

| Call | Campaign state | Assignment | Guardrails |
| --- | --- | --- | --- |
| recommended | the curated path (earlier battles won by their recommended force, intended plan, curated seed) | `recommendedForce` | full |
| curated | the curated path | the battle's authored call (`battle.slots`) | full |
| rough | the curated Roll battered: the most famous company Reforming (−2, renown lost), the next two Worn at −1 (a hypothetical before battle 1) | `recommendedForce`: the **recovery force** | floor |
| greedy | the curated path | highest fame per post (veteran-heavy, ignores Worn) | floor |
| weakest legal | the curated path | lowest fame per post, Worn first, levies only where forced | **diagnostic**: its recovery force is the recommended call on the same state, gated in full |
| role: … | the curated path | one per combination of flex-post roles (the most famous company of that role), when it can be filled legally | floor |
| carried: recommended / greedy | every battle: the curated path replayed with the intro's 5 most famous companies carried in (`strongCarryOver`; at most `maxCarriedFielded` of them fielded) | recommended / greedy | full |

**Reference plans are played exactly as authored on every call** (P7): every order a plan
sets stands, whoever fills the post (doctrines are not tied to roles). The call's role
template (`flex.doctrines`) only fills a flex post a plan leaves unset (`templatePlan`); a
test pins every call's plans to the authored ones. Every gated call is also played with
no muster (the floor).

**The call census** (`rollCallMatrix`, P7): every documented call is built, or the run
fails (`MissingCallError`); the matrix never silently shrinks. The only exception is a
role pattern the Roll cannot legally field, listed as *not applicable* with its reason
(Cinder Road 1: frontline on both flex posts "needs 5 frontline companies and the Roll
has 4 ready"). `npm run balance` prints it.

**Diagnostics, not gates** (decided on pilot evidence at the Oct 8 gate), printed by `npm
run balance` with and without muster (`rollDiagnostics`):
- **selection spread**: intended-plan advance on the best call minus the worst (proposed
  ≤ 25 points, ≥ 5 informational);
- **plan beats roster**: the bad plan on the call where it does best still advances less
  than the intended plan on the worst call;
- **strongest alternative** (when a scenario authors `referencePlans.alternative`, the
  strongest known cheap plan): the intended plan's smallest lead over it across the calls
  (negative = the alternative wins there). Played on every call, never gated.

**Coverage matrix** (roster × plan × muster × seeds, and where it runs):

| Where | Calls | Plans | Muster | Seeds |
| --- | --- | --- | --- | --- |
| `balance.<battle>.test.ts` (every `npm run test:balance`, one test per call: a **smoke test**) | every named call | heuristic: intended, bad, alternative, every mono; none: intended, bad, alternative | as listed | gate seeds 100001–100060, fortune on; thresholds relaxed by 2 binomial SE (`smokeGuardrails`) |
| `npm run balance` (the gate; every content merge) | every named call, plus the census | the same | as listed, plus the diagnostics | gate seeds 100001–100500 (`--range gate`, default), fortune on |
| `campaign/cinderRoad.test.ts` | the authored call | intended and its ablations | none (the banner ablation: heuristic) | tuning seeds 1–60 |
| `fogProjection.test.ts` | the authored call | intended, bad, all Counterstroke, all Bring the Water | none | 10 (projection), 6 (decisions), random |

**Seed ranges** (P7, `engine/balance.ts`): balance is tuned on `TUNING_SEEDS` (1–1000:
sweeps, ablation tests, curated seeds) and gated on the held-out `GATE_SEEDS`
(100001–100500): every *scored* gate trial is played on gate seeds. One exception, by
design: the curated-path roster state (the `curated` call, and carried calls built from a
completed intro) is *constructed* by replaying earlier battles at their curated seeds,
which lie in the tuning range; only that setup reads tuning seeds, never a scored trial.
Never tune on the gate range; pack lint refuses a curated seed inside it. All plans in a
run play the same seeds (paired).

Sampling limits: 60 seeds at a true 75% has a standard error near 5.6 points, 500 seeds
near 1.9. The calls sample reachable states; they do not prove every state.

**The 60-seed smoke suite** judges each gated threshold relaxed by two binomial standard
errors at n = 60, computed in code (`smokeGuardrails`, `SMOKE_STANDARD_ERRORS`): intended
≥ 63.8%, bad ≤ 47.3%, mono < 72.6%. Each test prints the tolerance it used. It catches
gross regressions without flaking on a 60-seed window; it is not the sign-off.

**Balance merge checklist** (required before any content merge: a new or changed battle,
doctrine, campaign, roster profile or Host schedule):
1. `npm test` **and** `npm run test:balance` pass (the second runs every
   `balance.<battle>.test.ts` smoke suite and every `*.sim.test.ts` suite; see "Two test
   suites" below).
2. **`npm run balance -- --seeds 500` on the battle's sign-off range exits 0: the sign-off.**
   Every gated call meets GUARDRAILS exactly on held-out seeds. The sign-off range is the
   gate (100001–100500, the default) unless that range was **observed while tuning the
   battle** (a gate run read before a retune, or an adversarial search on it): then it is
   burned for that battle, and the sign-off uses the next reserved block nobody has observed
   for it, `--range signoff2` (200001–200500), then `signoff3` (300001–300500), … up to
   `signoff9`. The battle sheet records which range signed it off, and why a range was
   burned. Never tune to a sign-off range's outcomes.
3. The census shows every documented call, and any *not applicable* entry has a reason.
4. The diagnostics (selection spread, plan beats roster, strongest alternative) are read
   and any change is noted in the merge description; they are not gates.
5. Tuning happened on `--range tuning` (never on a sign-off range), and curated seeds stay
   outside every reserved sign-off block (pack lint).

**Two test suites (2026-10-05).** `npm test` is the fast suite: unit, UI and fast engine
tests. `npm run test:balance` runs the simulation-heavy files. The routing is by **file
name** (`src/test/suites.ts`, pinned by `src/test/suites.test.ts`):
- `balance.<battle>.test.ts`: a battle's guardrail smoke (one per battle, via
  `guardrails.testkit.ts`; `balance.test.ts` checks every battle has one);
- `*.sim.test.ts`: any other suite that plays many battles: role and unfilled-role sweeps
  (`cinderRoad2.roles.<call>.sim.test.ts`, one per named call), ablations over about 5 s
  (`holdForDawn.sim.test.ts`, `cinderRoad2.sim.test.ts`). A new battle's role gate follows
  C2: one `cinderRoad<N>.roles.<call>.sim.test.ts` per named call, each calling a
  `describeRoleGate("<call>")` from `cinderRoad<N>.roleGate.testkit.ts`, with the role
  declarations and observables in `cinderRoad<N>.roles.testkit.ts` (no vitest import, so
  scripts can use it) and the shared helpers in `roles.testkit.ts`. A fast test checks every
  call has its file. A testkit is not a test file and is not routed.
Keep each heavy test under about 10 s at normal load, so it stays under vitest's 60 s worker
RPC timeout even when the machine is busy. The balance suite yields to the event loop
before each test (`src/test/setup.balance.ts`), so long files no longer trip "Timeout
calling onTaskUpdate". Anything over about 5 s that simulates belongs in `*.sim.test.ts`.

**Decision (2026-10-02, P7): roster- and muster-dependent best plans are accepted.**
On *Cinder Road* battle 1, the strongest alternative (the stair held, everyone else
marching, no banner) beats the intended plan with **no muster** on two calls (the
frontline-bows role pattern by about 10 points, rough by about 5; about a tie on the
recommended force). The banner with the assault is worth about +32 points when the player
musters (relief and rallies) and about 0 when nobody does, while "keep the boats" and
"march" are essential either way. That is a feature of the Roll, not a defect: the
alternative stays a tracked diagnostic, and the briefing hints at the banner's role.

**Rule (2026-10-05, C2; tightened after the warden's re-review): roles are defined by what
they achieve, declared before the gate, and ablated as roles.**
- A battle's intended plan fills **roles**, and each role is defined by **function**, as
  something a run can observe, not by the doctrine that fills it (*Cinder Road* battle 2:
  the **guard** is a company holding the Sluice Walk when the ram comes up to it, or
  fighting the ram before it strikes the sluice; the **march** is companies striking the
  wagon park).
- The battle sheet **declares the roles and their accepted fillers before the gate run**.
  An accepted filler is a way of filling the role that the design accepts, with what it
  depends on: fixed orders, the roster, or the player's muster (battle 2's guard: Hold for
  Dawn, intended; Clean Counterstroke, roster-dependent; any holding doctrine, Shield the
  Line or an edited variant, mustered onto the walk, muster-dependent). Accepted fillers are
  never gated. Their per-call results under matched muster policies go on the battle sheet,
  and one of them may be the tracked `referencePlans.alternative` row.
- **The gate, and what makes the rule falsifiable:** plans where a role is genuinely
  **unfilled** are played on **every named call, with no muster, with the heuristic muster,
  and against the rush**. The unfilled plans are the **cartesian product of the battle's
  stock non-filler doctrines over the role's posts** (`unfilledCombos` in `roles.testkit.ts`:
  mixed orders too, since a mixed watch is still no watch; about 5^posts), with no muster
  that fills the role, plus the pure march. When the product is too large to simulate in
  full within about 10 s a file, the suite plays a documented spread sample with fewer seeds,
  and a static check must cover every combination (battle 2: no stock doctrine but Bring the
  Water can strike the park, so no march-unfilled plan can win). The rush (`rushMuster`) is the adversarial policy: every
  fighting company, or only the companies on the role that is filled, steps toward the
  enemy objective each phase, or toward the line of retreat in an escape battle. Strength
  alone must not skip a role. Each plan must stay **below the floor** (advance < 75%), and
  the role's observable must confirm the plan does not win by filling the role: it may win
  with the role filled in at most 5% of games with no muster or the heuristic, and 10%
  against the rush. (Since C5, routes are planned on what the mover knows, so a company can
  meet the enemy or stand on the guarded ground on its honest route and still lose: touching
  the role by accident is reported, not failed. Until C5 the check counted every game that
  touched the role.) These are scenario tests, and the 500-seed numbers go on the battle
  sheet.
- **The ≥ 15-point ablation is by role:** replace every doctrine that fills the role with
  the best doctrine that does not (no muster), and the advance rate must drop by at least 15
  points.
- **Adding an accepted filler after the gate run** needs the orchestrator's sign-off,
  recorded on the battle sheet with a **dominance review**: does it beat the intended plan
  anywhere, by how much, and at what cost (command effort, roster, muster)? There is no fixed
  numerical cap: a two-click muster and a self-positioning doctrine cost the player
  different things, and the Roll changes their performance by roster.
- An extra that is not a counted role (battle 2's standard on Rescue Standard) carries no
  ablation requirement.
- Unchanged: every mono plan, the named bad plan and the pure march stay gated.

**Decision (2026-10-05, C3 warden; for the user's review): editor variants are diagnostics,
not gated.** A doctrine-editor variant that out-thinks a battle is a reward for skill, which
is what Test in the field is for. The gate guarantees the lesson for **stock doctrines plus
legal musters** (the unfilled-role product above, under every muster policy). Variants a
review finds worth tracking are recorded per battle in `engine/variantProbes.ts`; `npm run
balance` plays each on every named call and prints it as an "editor variant (diagnostic)"
row (`runVariantProbe`, fails closed on a variant the editor would refuse). They are never
gated, and the battle sheet lists them.

**Carry-over and doctrine dominance.** Veterans make blunt plans stronger, and no
threat adjustment fixes that without also wrecking the intended plan (with two carried
veterans fielded, all Bring the Water still advanced about 78% on the first version of
*Cinder Road* battle 1). The fix is in content: each battle must **punish the blunt plan
whatever the force** (battle 1's outriders burn the boats behind a pure march). With
that, the carried calls face the full guardrails like the authored army.

## Cinder Road (`cinderRoad.ts`, M1 pilot)

The counter-offensive, fought from the Roll. Its own army of nine companies (ids never
reuse the intro's; intro companies arrive only by carry-over), with homes from the
setting bible: the Greyford March (Coldwater Shields, Ferrymoot Pikes, Thornwick Spears),
the Fenwardens (Sedgewick Levy, Wickmere Standard, Heronwick Bows), the Dawnwatch Holds
(Sunward Lances, Brightcrag Riders, Morningwall Slingers). Battle 1 calls six posts, each
with an authored label; two are flex (the lances' post may take a frontline company, which
marches on the barricade; the bows' post may take a frontline company, which carries a
banner with the assault).

**Battle 1, *The Saltmarsh, Northbound*** (`engine/scenarios/cinderRoad1.ts`): the intro's
Saltmarsh in reverse, by daylight, with Banner initiative and fog. Goal: `breakObjective`
on the Saltgate Barricade (integrity 30) at the causeway head, within 7 phases. Defeats:
one Host outrider reaching the Heron Stair, where the Banners' boats wait (`enemyEscape`,
count 1: "they burn the crossing behind us"), or 3 companies lost. The Host: two barricade
guards on No Step Back, Mire Stalkers on Terror Push in the central reeds, the Weirfen
Hunters loosed on Cull the Weak in phase 2, and two outriders that never fight but run for
the boats from phase 2 (the Drowned Hounds, renowned, Resolve 3, and the Ash Harriers).
Intended plan: Bring the Water on the three vanguard posts and the lances; the Wickmere
Standard holds the Heron Stair (Shield the Line: it never leaves, so the outriders cannot
pass); the bows carry a banner with the assault (Rescue Standard). The bad plan is the
pure march (everyone on Bring the Water): the stair is left empty, and it loses whatever
the force. Curated seed 91: won in phase 5 with no company lost, the Hounds held at the
stair. Numbers are in docs/ENGINE.md.

**Battle 2, *Strike the Wagon Park*** (`engine/scenarios/cinderRoad2.ts`, C2): upstream of
Ember Ford, by daylight, Banner initiative, fog, 6 phases. Win: break the Host's wagon
park (`breakObjective`), escorted by a detachment of the Kept Coal (the renowned main body
holds Greyford Gate in battle 6). Defeat: the Covenant's Weir Sluice on our bank falls
(`objectiveLost`, new in C2), or 3 companies lost. Posts (authored as the army stands
after battle 1, so the curated path meets a nil threat): the Wainford, the Wagon Track,
the Sedge Flank, the Lance Line (flex: cavalry or frontline), Willow Rise, and the Weir
Sluice keepers (flex: skirmish or cavalry). Roles, by function: **the march** strikes the
park (Bring the Water on the four assault posts); **the guard** holds the Sluice Walk when
the ram comes up, or fights the ram before it strikes the sluice. Accepted guards: Hold for
Dawn on the keepers (intended), who take their stand on the walk; Clean Counterstroke
(roster-dependent), which waits and strikes the ram when it comes up alone; and any holding
doctrine the player musters onto the walk (muster-dependent, signed off by the
orchestrator after the warden's re-review; numbers and the dominance review are on the
battle sheet). The standard carries a banner with the assault
(Rescue Standard: an extra, not a counted role). The briefing names the role ("someone
must keep the Sluice Walk"), not a doctrine. Bad plan: the pure march. Curated seed 64:
won in phase 3, no company lost, the sluice untouched. The sluice falls at the ram's first
blow (integrity 16), so even a strong force rushing the park cannot beat the ram to it.
Repaired on C5 (honest routes): five shallow fords (the Upper Shallows, (4,3)), the ram
waits on the weir bank (3,0) and the park's integrity is 44, so a march that misses the
shallows cannot reach the ram by the walk before it strikes. Signed off on `signoff3`
(300001–300500); the battle sheet has the numbers and why the earlier ranges are burned.

**Battle 3, *Open a Road*** (`engine/scenarios/cinderRoad3.ts`, C3): Ember Ford's own
ground by daylight, crossed the other way. The Banners deploy on the same east bank as on
the night of the burning bridges and cross west; the far-bank road now runs on to the west
edge, where it forks into the Cinder Road and the Ashpit Lane, and below the Mill Ford the
river runs shallow by the tollhouse (the Tollhouse Shallows, a second crossing). Goal:
`escapeEdge`, 2 companies onto those two road hexes within 7 phases. Defeats: one Host
company on the Mill Road behind us (`enemyEscape`, count 1), or 4 companies lost. The Host:
the Cinderwake Spears (No Step Back) and the Ashpit Wardens (Lie in Wait) stand on the two
road heads; the Chapel Stalkers rise from the Burnt Chapel on Cull the Weak in phase 3; the
reserve (the Scorchmark Spears, the Kilnbrand Raiders) waits opposite the Mill Ford and
wades over at the first horn, by the ford or the shallows, on Through the Embers, for the
Mill Road. Posts (authored labels): the Cinder Ford, the Ferry Road and the North Bank
(frontline), Watcher's Rise (the standard, support), the Mill Road (cavalry) and the Mill
Ford (skirmish, flex: frontline). Roles, by function: **the march** (the column) gets
companies onto the far-bank roads (Open the Road on the three frontline posts and the
standard); **the guard** keeps the Mill Road: a company stands on it when the reserve comes
up beside it, or fights the reserve on our bank before any Host company gets through.
Accepted guards by orders: Shield the Line (intended), Clean Counterstroke (the tracked
alternative: it waits and strikes the crossers), and Bring the Water and Rescue Standard
(nothing to march on, no one to rally there: they stand where posted). The guard is left
unfilled by a watch that leaves the Mill Road (Open the Road, Fighting Withdrawal, mixed
too) and by the pure march: the reserve is on the road before any column can cut through.
The role gate is `cinderRoad3.roles.<call>.sim.test.ts`, one per named call. Bad plan:
everyone on Bring the Water (last battle's star misapplied: no objective to march on).
Curated seed 1: won in phase 3 by daylight, no company lost, the Mill Road guard breaking
the reserve. Signed off on `signoff2` (the gate range was observed for C3). Numbers are in
docs/ENGINE.md and on the battle sheet.

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
  **v2 envelope** `{"version": 2, "provenance": {packId, packRevision, campaignId,
  contentRevision, rulesRevision}, "campaign": …}` (at most `MAX_RUN_BYTES`, 512 KiB per campaign; a full
  11-battle run with 120 attempts and five carried companies uses well under half).
  - `readCampaignSave(registry, id, payload)` never throws: `empty`, `ok`, `unavailable`
    (a well-formed run this build cannot continue: other pack, pack format, campaign,
    content or rules revision) or `unreadable`. v2 loading rebuilds every field and replays the
    history from the carried snapshot with the Roll rules (`loadRollCampaignState`):
    each assignment must be legal in the replayed state, start strengths as fielded, end
    strengths no higher and 0 exactly when destroyed, and conditions, Resolve, renown and
    the Roll must match.
  - **Preserved runs:** `saveCampaignRun` refuses to replace an `unavailable` or
    `unreadable` v2 save; the player sets it aside first (`store.setAside`), which copies
    it to a new slot (`:aside:1`…`:aside:8` in the browser; an exclusively created
    `<file>.aside-<time>-<id>` in Electron, retrying on a clash), verifies the copy and
    only then removes the save. Set-aside runs are never replaced or deleted: past
    `MAX_ASIDES` (8) per campaign, setting another aside is refused. The intro is never
    set aside. Each v2 write keeps the previous
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
