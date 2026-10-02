// Per-campaign saves (M1, P3), browser side: the v1 corpus, v2 envelopes, routing and
// isolation, preserved runs, backup and recovery, and the size budget.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRegistry, firstCall, registry } from "../packs/registry";
import { RULES_REVISION } from "../packs/types";
import { startCampaign } from "./campaign";
import { ashAndBanner } from "./definition";
import { snapshotCarryOver } from "./roll";
import { fightRoll, longRoad, testRegistry, testRoad } from "./rollTestKit";
import { loadCampaign, MAX_SAVE_BYTES } from "./save";
import {
  asideKey,
  CAMPAIGN_SAVE_FILES,
  INTRO_NOT_SET_ASIDE,
  MAX_ASIDES,
  TOO_MANY_ASIDES,
  INTRO_CAMPAIGN_ID,
  isSaveCampaignId,
  loadCampaignBackup,
  loadCampaignRun,
  localStorageCampaignStore,
  localStorageKeyFor,
  MAX_RUN_BYTES,
  PRESERVED_RUN,
  readCampaignSave,
  saveCampaignRun,
  serializeCampaignSave,
} from "./saveFiles";
import { LOCAL_STORAGE_KEY } from "./storage";
import type { CampaignState } from "./types";

const FIXTURES = path.join(__dirname, "fixtures", "v1");
const corpus = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, payload: readFileSync(path.join(FIXTURES, name), "utf8") }));

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  };
}

/** A Roll run two battles in: a Worn company, a Reforming one, a defeat and a carried veteran. */
function rollRun(): CampaignState {
  const intro = loadCampaign(corpus.find((item) => item.name === "complete.json")!.payload, ashAndBanner);
  const carried = snapshotCarryOver({ def: ashAndBanner, state: intro, packId: "first_call" }, testRoad, ["dawnwatch_archers"]);
  let state = startCampaign(testRoad, { carryOver: carried });
  state = fightRoll(testRoad, state, "defeat", { greyford_shields: { status: "routed" } });
  state = fightRoll(testRoad, state, "victory", { greyford_shields: { status: "routed" }, mercy_standard: { status: "destroyed" }, dawnwatch_archers: { strength: 20 } });
  return state;
}

describe("the v1 save corpus (written by v1.0-intro)", () => {
  it("is a real corpus: fresh, defeat, retry, custom orders, stalemate, complete", () => {
    expect(corpus.map((item) => item.name).sort()).toEqual(
      ["after-tutorial-retry", "complete", "fresh", "mid-campaign-custom-orders", "post-defeat", "stalemate"].map((name) => `${name}.json`),
    );
    const outcomes = corpus.flatMap((item) => (JSON.parse(item.payload).campaign.history as { outcome: string }[]).map((entry) => entry.outcome));
    expect(new Set(outcomes)).toEqual(new Set(["victory", "defeat", "stalemate"]));
  });

  it("loads every save through the new app and re-saves it byte for byte, to the original key and file", () => {
    for (const { name, payload } of corpus) {
      const read = readCampaignSave(registry, INTRO_CAMPAIGN_ID, payload);
      expect(read.kind, name).toBe("ok");
      if (read.kind !== "ok") continue;
      expect(read.state).toEqual(loadCampaign(payload, ashAndBanner));
      expect(read.provenance).toEqual({ packId: "first_call", packRevision: 1, campaignId: INTRO_CAMPAIGN_ID, contentRevision: 1, rulesRevision: RULES_REVISION });
      expect(serializeCampaignSave(registry, read.state), name).toBe(payload);
    }
    expect(localStorageKeyFor(INTRO_CAMPAIGN_ID)).toBe(LOCAL_STORAGE_KEY);
    expect(LOCAL_STORAGE_KEY).toBe("doctrine-of-war:campaign");
    expect(CAMPAIGN_SAVE_FILES[INTRO_CAMPAIGN_ID]).toBe("campaign-save.json");
  });

  it("is written exactly as before: no backup, no other key", async () => {
    const { data, storage } = memory();
    const store = localStorageCampaignStore(storage);
    for (const { payload } of corpus) {
      const read = readCampaignSave(registry, INTRO_CAMPAIGN_ID, payload);
      if (read.kind === "ok") await saveCampaignRun(store, registry, read.state);
    }
    expect([...data.keys()]).toEqual([LOCAL_STORAGE_KEY]);
    expect(data.get(LOCAL_STORAGE_KEY)).toBe(corpus.at(-1)!.payload);
  });
});

describe("v2 runs", () => {
  it("round-trip with full replay: carried companies, Worn, Reforming, defeats and the assignment", () => {
    const state = rollRun();
    expect(state.companies.find((company) => company.id === "dawnwatch_archers")).toMatchObject({ condition: "worn", carriedFrom: { campaignId: "ash_and_banner" } });
    const json = serializeCampaignSave(testRegistry, state);
    expect(JSON.parse(json)).toMatchObject({ version: 2, provenance: { packId: "first_call", packRevision: 1, campaignId: "cinder_road", contentRevision: 1, rulesRevision: RULES_REVISION } });
    const read = readCampaignSave(testRegistry, "cinder_road", json);
    expect(read).toMatchObject({ kind: "ok" });
    expect(read.kind === "ok" && read.state).toEqual(state);
  });

  it("refuses any history the Roll rules could not have produced", () => {
    const state = rollRun();
    const tamper = (change: (draft: CampaignState) => void) => {
      const draft = structuredClone(state);
      change(draft);
      const read = readCampaignSave(testRegistry, "cinder_road", JSON.stringify({ version: 2, provenance: JSON.parse(serializeCampaignSave(testRegistry, state)).provenance, campaign: draft }));
      return read.kind === "unreadable" ? read.reason : read.kind;
    };
    expect(tamper((draft) => (draft.companies.find((company) => company.condition === "worn")!.condition = "fresh"))).toMatch(/does not match the history/);
    expect(tamper((draft) => (draft.history[1].companies[0].endStrength = 99))).toMatch(/cannot exceed the starting strength/);
    expect(tamper((draft) => (draft.history[1].companies[0].startStrength = 99))).toMatch(/startStrength must be/);
    expect(tamper((draft) => (draft.history[1].assignment!.greyford_shields = "r_riders"))).toMatch(/assignment is not legal here/);
    expect(tamper((draft) => (draft.carried![0].resolve = 3))).toMatch(/carried\[0\]\.resolve must be an integer in -1\.\.2/);
    expect(tamper((draft) => (draft.carried![0].id = "r_shields"))).toMatch(/r_shields is not a company of ash_and_banner/);
    expect(tamper((draft) => (draft.companies[0].profile = { strength: 99, cohesion: 70 }))).toMatch(/profile.strength must be an integer/);
    // Carried snapshots must be ones this build could have made (review: a forged "phantom").
    const phantom = {
      id: "phantom",
      name: "Phantom",
      role: "frontline" as const,
      profile: { strength: 90, cohesion: 80 },
      resolve: 2,
      renown: { title: "The Unbowed" },
      from: { packId: "missing_pack", campaignId: "missing_campaign" },
    };
    expect(tamper((draft) => draft.carried!.push(phantom))).toMatch(/names a campaign this build does not have/);
    expect(tamper((draft) => draft.carried!.push({ ...phantom, from: { packId: "first_call", campaignId: "ash_and_banner" } }))).toMatch(/phantom is not a company of ash_and_banner/);
    expect(tamper((draft) => (draft.carried![0].name = "Dawnwatch Heroes"))).toMatch(/must be Dawnwatch Archers \(skirmish\)/);
    expect(tamper((draft) => (draft.carried![0].profile = { strength: 72, cohesion: 74 }))).toMatch(/must be dawnwatch_archers's profile/);
    expect(tamper((draft) => (draft.carried![0].renown = { title: "The Pyre-Breaker" }))).toMatch(/is not a title dawnwatch_archers can earn/);
    expect(tamper((draft) => (draft.carried![0].from = { packId: "other_pack", campaignId: "ash_and_banner" }))).toMatch(/names a campaign this build does not have/);
    expect(tamper((draft) => draft.history.push(structuredClone(draft.history[1])))).toMatch(/must be road_2|no playable battle|attempt/);
  });

  it("is unreadable when it is not a v2 run of this campaign", () => {
    const json = serializeCampaignSave(testRegistry, rollRun());
    const envelope = JSON.parse(json);
    const read = (payload: string, campaignId = "cinder_road") => readCampaignSave(testRegistry, campaignId, payload);
    expect(read(JSON.stringify({ ...envelope, version: 1 }))).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/version must be 2/) });
    expect(read(JSON.stringify({ ...envelope, provenance: { ...envelope.provenance, campaignId: "ash_and_banner" } }))).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/belongs to campaign ash_and_banner/) });
    expect(read("{")).toMatchObject({ kind: "unreadable" });
    // Prototype-named ids and keys are refused (review).
    expect(read(JSON.stringify({ ...envelope, provenance: { ...envelope.provenance, packId: "constructor" } }))).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/packId must be a lowercase id/) });
    const protoKey = json.replace('"assignment":{', '"assignment":{"__proto__":"r_shields",');
    expect(protoKey).not.toBe(json);
    expect(read(protoKey)).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/may not be "__proto__"/) });
    const { packRevision: _dropped, ...noPack } = envelope.provenance;
    expect(read(JSON.stringify({ ...envelope, provenance: noPack }))).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/revisions \(pack, content, rules\)/) });
    expect(read(JSON.stringify({ ...envelope, provenance: { ...envelope.provenance, extra: 1 } }))).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/unknown fields: extra/) });
    expect(read("x".repeat(MAX_RUN_BYTES + 1))).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/larger than/) });
    // Isolation: a v2 run is never taken for the intro, nor an intro save for a v2 run.
    expect(read(json, INTRO_CAMPAIGN_ID)).toMatchObject({ kind: "unreadable" });
    expect(read(corpus[0].payload)).toMatchObject({ kind: "unreadable" });
    expect(readCampaignSave(testRegistry, "nowhere", json)).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/No save slot/) });
  });

  it("reports a run this build cannot continue as unavailable, and never overwrites it", async () => {
    const state = rollRun();
    const envelope = JSON.parse(serializeCampaignSave(testRegistry, state));
    const variants = {
      content: { ...envelope, provenance: { ...envelope.provenance, contentRevision: 9 } },
      rules: { ...envelope, provenance: { ...envelope.provenance, rulesRevision: 9 } },
      pack: { ...envelope, provenance: { ...envelope.provenance, packId: "shoal_towns" } },
      packFormat: { ...envelope, provenance: { ...envelope.provenance, packRevision: 2 } },
    };
    for (const [name, saved] of Object.entries(variants)) {
      const payload = JSON.stringify(saved);
      expect(readCampaignSave(testRegistry, "cinder_road", payload), name).toMatchObject({ kind: "unavailable", provenance: saved.provenance });
      const { data, storage } = memory();
      data.set(localStorageKeyFor("cinder_road"), payload);
      const store = localStorageCampaignStore(storage);
      await expect(saveCampaignRun(store, testRegistry, startCampaign(testRoad))).rejects.toThrow(PRESERVED_RUN);
      expect(data.get(localStorageKeyFor("cinder_road"))).toBe(payload);
      // Setting it aside keeps it, and frees the slot.
      await store.setAside("cinder_road");
      expect(data.get(`${localStorageKeyFor("cinder_road")}:aside:1`)).toBe(payload);
      await saveCampaignRun(store, testRegistry, startCampaign(testRoad));
      expect((await loadCampaignRun(store, testRegistry, "cinder_road")).kind).toBe("ok");
    }
    // A build without the run's campaign keeps it unavailable too.
    expect(readCampaignSave(createRegistry([firstCall]), "cinder_road", serializeCampaignSave(testRegistry, state))).toMatchObject({ kind: "unavailable" });
  });
});

describe("levy results on replay (review)", () => {
  it("compares a levy's whole saved result with the generated one", () => {
    // A two-battle road without a second support company: the banner is destroyed, then a levy holds its post.
    const thin = { ...testRoad, companies: testRoad.companies.filter((company) => !["r_lamps"].includes(company.id)), battles: [testRoad.battles[0], { ...testRoad.battles[0], id: "road_2" }] };
    const reg = createRegistry([{ ...firstCall, campaigns: [...firstCall.campaigns, thin] }]);
    let state = fightRoll(thin, startCampaign(thin), "victory", { mercy_standard: { status: "destroyed" } });
    state = fightRoll(thin, state, "victory");
    const line = state.history[1].companies.find((item) => item.squadId === "mercy_standard")!;
    expect(line).toMatchObject({ companyId: "levy", levy: true, resolveBefore: -1 });
    const json = serializeCampaignSave(reg, state);
    expect(readCampaignSave(reg, "cinder_road", json).kind).toBe("ok");
    const envelope = JSON.parse(json);
    const forged = structuredClone(envelope);
    forged.campaign.history[1].companies.find((item: { squadId: string }) => item.squadId === "mercy_standard").resolveBefore = 3;
    expect(readCampaignSave(reg, "cinder_road", JSON.stringify(forged))).toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/resolveBefore must be -1/) });
    const unmarked = structuredClone(envelope);
    delete unmarked.campaign.history[1].companies.find((item: { squadId: string }) => item.squadId === "mercy_standard").levy;
    expect(readCampaignSave(reg, "cinder_road", JSON.stringify(unmarked))).toMatchObject({ kind: "unreadable" });
  });
});

describe("routing, isolation, backup and recovery (browser)", () => {
  it("keys each campaign separately and allowlists campaign ids", () => {
    expect(localStorageKeyFor("cinder_road")).toBe("doctrine-of-war:campaign:cinder_road");
    for (const bad of ["../campaign", "__proto__", "constructor", "toString", "", "CINDER_ROAD"]) {
      expect(isSaveCampaignId(bad), bad).toBe(false);
      expect(() => localStorageKeyFor(bad), bad).toThrow(/no save slot/);
    }
  });

  it("keeps the intro and a v2 run apart", async () => {
    const { data, storage } = memory();
    const store = localStorageCampaignStore(storage);
    const intro = loadCampaign(corpus[0].payload, ashAndBanner);
    await saveCampaignRun(store, testRegistry, intro);
    await saveCampaignRun(store, testRegistry, rollRun());
    expect((await loadCampaignRun(store, testRegistry, INTRO_CAMPAIGN_ID)).kind).toBe("ok");
    expect((await loadCampaignRun(store, testRegistry, "cinder_road")).kind).toBe("ok");
    expect(data.get(LOCAL_STORAGE_KEY)).toBe(corpus[0].payload);
    expect([...data.keys()].sort()).toEqual([LOCAL_STORAGE_KEY, localStorageKeyFor("cinder_road")]);
  });

  it("keeps the previous good save as a backup, and recovers from it when the save is damaged", async () => {
    const { data, storage } = memory();
    const store = localStorageCampaignStore(storage);
    const first = startCampaign(testRoad);
    const second = fightRoll(testRoad, first, "victory");
    await saveCampaignRun(store, testRegistry, first);
    await saveCampaignRun(store, testRegistry, second);
    expect((await loadCampaignBackup(store, testRegistry, "cinder_road")).kind === "ok" && (await loadCampaignBackup(store, testRegistry, "cinder_road"))).toMatchObject({ state: first });
    data.set(localStorageKeyFor("cinder_road"), '{"version":2,"provenance":');
    expect((await loadCampaignRun(store, testRegistry, "cinder_road")).kind).toBe("unreadable");
    const backup = await loadCampaignBackup(store, testRegistry, "cinder_road");
    expect(backup).toMatchObject({ kind: "ok", state: first });
    // Recovery: set the damaged save aside, then restore the backup.
    await store.setAside("cinder_road");
    if (backup.kind === "ok") await saveCampaignRun(store, testRegistry, backup.state);
    expect(await loadCampaignRun(store, testRegistry, "cinder_road")).toMatchObject({ kind: "ok", state: first });
    expect(data.get(`${localStorageKeyFor("cinder_road")}:aside:1`)).toBe('{"version":2,"provenance":');
  });

  it("keeps every set-aside run: repeated cycles never replace one, and past the limit it refuses", async () => {
    const { data, storage } = memory();
    const store = localStorageCampaignStore(storage);
    const key = localStorageKeyFor("cinder_road");
    const payloads: string[] = [];
    for (let cycle = 1; cycle <= MAX_ASIDES; cycle += 1) {
      const payload = `{"damaged":${cycle}}`;
      payloads.push(payload);
      data.set(key, payload);
      await store.setAside("cinder_road");
      expect(data.has(key)).toBe(false);
    }
    expect(Array.from({ length: MAX_ASIDES }, (_, index) => data.get(asideKey(key, index + 1)))).toEqual(payloads);
    data.set(key, '{"damaged":"one too many"}');
    await expect(store.setAside("cinder_road")).rejects.toThrow(TOO_MANY_ASIDES);
    expect(data.get(key)).toBe('{"damaged":"one too many"}');
    expect(Array.from({ length: MAX_ASIDES }, (_, index) => data.get(asideKey(key, index + 1)))).toEqual(payloads);
  });

  it("never sets the intro's save aside", async () => {
    const { data, storage } = memory();
    data.set(LOCAL_STORAGE_KEY, corpus[0].payload);
    await expect(localStorageCampaignStore(storage).setAside(INTRO_CAMPAIGN_ID)).rejects.toThrow(INTRO_NOT_SET_ASIDE);
    expect([...data.entries()]).toEqual([[LOCAL_STORAGE_KEY, corpus[0].payload]]);
  });

  it("fails closed when storage is missing or throws", async () => {
    const none = localStorageCampaignStore(null);
    await expect(none.read("cinder_road")).rejects.toThrow(/not available/);
    const full = localStorageCampaignStore({
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
      },
      removeItem: () => undefined,
    });
    await expect(full.write("cinder_road", "{}")).rejects.toThrow(/QuotaExceededError/);
  });
});

describe("size budget", () => {
  it("fits a full 11-battle Roll campaign with five carried companies and 120 retried attempts", () => {
    const long = longRoad(11);
    const reg = createRegistry([{ ...firstCall, campaigns: [...firstCall.campaigns, long] }]);
    const intro = loadCampaign(corpus.find((item) => item.name === "complete.json")!.payload, ashAndBanner);
    const carried = snapshotCarryOver({ def: ashAndBanner, state: intro, packId: "first_call" }, long, intro.companies.slice(0, 5).map((company) => company.id));
    let state = startCampaign(long, { carryOver: carried });
    while (state.status !== "complete") {
      for (let retry = 0; retry < 10; retry += 1) state = fightRoll(long, state, "defeat", { greyford_shields: { status: "routed" } });
      state = fightRoll(long, state, "victory", { greyford_shields: { status: "routed" } });
    }
    expect(state.history).toHaveLength(121);
    const json = serializeCampaignSave(reg, state);
    expect(readCampaignSave(reg, "cinder_road", json).kind).toBe("ok");
    const bytes = new TextEncoder().encode(json).length;
    // Far inside the per-campaign budget; the intro's v1 budget is unchanged.
    expect(bytes).toBeLessThan(MAX_RUN_BYTES / 2);
    expect(MAX_SAVE_BYTES).toBe(256 * 1024);
  });
});
