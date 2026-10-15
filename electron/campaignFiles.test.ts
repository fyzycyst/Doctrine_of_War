// Per-campaign save files in Electron's main process (M1, P3): the fixed allowlist, routing,
// isolation, main-side validation, preserved runs, backup, set-aside and recovery.
import { promises as fs, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startCampaign } from "../src/game/campaign/campaign";
import { ashAndBanner } from "../src/game/campaign/definition";
import { saveCampaign } from "../src/game/campaign/save";
import { fightRoll, testRegistry, testRoad } from "../src/game/campaign/rollTestKit";
import { CAMPAIGN_SAVE_FILES, MAX_ASIDES as RENDERER_MAX_ASIDES, readCampaignSave, serializeCampaignSave } from "../src/game/campaign/saveFiles";
import {
  campaignSaveFileName,
  exportFileNameFor,
  exportSaveFile,
  MAIN_SAVE_FILES,
  MAX_ASIDES,
  readCampaignBackup,
  readCampaignFile,
  readSaveFile,
  SAVE_FILE_NAME,
  setAsideCampaignFile,
  TOO_MANY_ASIDES,
  writeCampaignFile,
  writeSaveFile,
} from "./saveFile";

const FIXTURES = path.join(__dirname, "..", "src", "game", "campaign", "fixtures", "v1");
const corpus = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .map((name) => readFileSync(path.join(FIXTURES, name), "utf8"));

const ROAD = "cinder_road";
const roadFile = (dir: string) => path.join(dir, MAIN_SAVE_FILES[ROAD]);
const run = (battles = 0) => {
  let state = startCampaign(testRoad);
  for (let i = 0; i < battles; i += 1) state = fightRoll(testRoad, state, "victory");
  return serializeCampaignSave(testRegistry, state);
};
const write = (dir: string, data: unknown, campaignId: unknown = ROAD) => writeCampaignFile(dir, campaignId, data, undefined, testRegistry);

describe("Electron per-campaign saves", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "dow-runs-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("keeps its own fixed allowlist, matching the renderer's, and refuses every other id", () => {
    expect(MAIN_SAVE_FILES).toEqual(CAMPAIGN_SAVE_FILES);
    expect(MAX_ASIDES).toBe(RENDERER_MAX_ASIDES);
    expect(Object.isFrozen(MAIN_SAVE_FILES)).toBe(true);
    expect(campaignSaveFileName(undefined)).toBe(SAVE_FILE_NAME);
    expect(campaignSaveFileName("ash_and_banner")).toBe(SAVE_FILE_NAME);
    expect(campaignSaveFileName(ROAD)).toBe("campaign-cinder_road.json");
    for (const bad of ["../campaign-save", "__proto__", "constructor", "hasOwnProperty", "", "x".repeat(500), 5, null, {}, ["cinder_road"]]) {
      expect(() => campaignSaveFileName(bad), String(bad)).toThrow("unknown campaign save");
    }
  });

  it("refuses an unknown id on every channel without touching the disk", async () => {
    for (const bad of ["../escape", "__proto__", 7]) {
      await expect(readCampaignFile(dir, bad)).rejects.toThrow("unknown campaign save");
      await expect(write(dir, run(), bad)).rejects.toThrow("unknown campaign save");
      await expect(readCampaignBackup(dir, bad)).rejects.toThrow("unknown campaign save");
      await expect(setAsideCampaignFile(dir, bad)).rejects.toThrow("unknown campaign save");
    }
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("routes the intro to its original file exactly as before, for every v1 fixture", async () => {
    for (const payload of corpus) {
      await writeCampaignFile(dir, undefined, payload);
      expect(await readCampaignFile(dir, undefined)).toBe(payload);
      expect(await readSaveFile(dir)).toBe(payload);
      expect(await readCampaignFile(dir, "ash_and_banner")).toBe(payload);
    }
    expect(await fs.readdir(dir)).toEqual([SAVE_FILE_NAME]);
    expect(await readCampaignBackup(dir, undefined)).toBeNull();
    await expect(setAsideCampaignFile(dir, "ash_and_banner")).rejects.toThrow(/cannot be set aside/);
  });

  it("keeps the intro and a v2 run in separate files", async () => {
    await writeSaveFile(dir, corpus[0]);
    await write(dir, run(1));
    expect(await readCampaignFile(dir, ROAD)).toBe(run(1));
    expect(await readSaveFile(dir)).toBe(corpus[0]);
    expect((await fs.readdir(dir)).sort()).toEqual([MAIN_SAVE_FILES[ROAD], SAVE_FILE_NAME].sort());
  });

  it("validates every v2 payload in main: only a run this build continues, for this very campaign", async () => {
    const valid = JSON.parse(run(1));
    const refused: unknown[] = [
      42,
      "not json",
      corpus[0], // an intro save is not a v2 run
      JSON.stringify({ ...valid, version: 1 }),
      JSON.stringify({ ...valid, provenance: { ...valid.provenance, campaignId: "ash_and_banner" } }),
      JSON.stringify({ ...valid, provenance: { ...valid.provenance, contentRevision: 9 } }),
      JSON.stringify({ ...valid, campaign: { ...valid.campaign, battleIndex: 2 } }),
    ];
    for (const data of refused) {
      await expect(write(dir, data)).rejects.toThrow();
    }
    // Main validates against the shipped registry's own Cinder Road: a run of another
    // campaign under that id (the test road) is refused.
    await expect(writeCampaignFile(dir, ROAD, run(1))).rejects.toThrow(/does not have|no campaign|Invalid campaign save/);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("keeps the previous save as its backup, written atomically", async () => {
    await write(dir, run(0));
    expect(await readCampaignBackup(dir, ROAD)).toBeNull();
    await write(dir, run(1));
    expect(await readCampaignBackup(dir, ROAD)).toBe(run(0));
    await write(dir, run(2));
    expect(await readCampaignBackup(dir, ROAD)).toBe(run(1));
    expect((await fs.readdir(dir)).sort()).toEqual([MAIN_SAVE_FILES[ROAD], `${MAIN_SAVE_FILES[ROAD]}.bak`].sort());
  });

  it("never overwrites a run it cannot continue; setting it aside keeps it and frees the slot", async () => {
    const valid = JSON.parse(run(1));
    const unavailable = JSON.stringify({ ...valid, provenance: { ...valid.provenance, contentRevision: 9 } });
    await fs.writeFile(roadFile(dir), unavailable);
    expect(readCampaignSave(testRegistry, ROAD, await readCampaignFile(dir, ROAD))).toMatchObject({ kind: "unavailable" });
    await expect(write(dir, run(0))).rejects.toThrow(/kept: set it aside first/);
    expect(await fs.readFile(roadFile(dir), "utf8")).toBe(unavailable);

    await setAsideCampaignFile(dir, ROAD, () => 1700000000000, () => "abcdef1234");
    expect(await readCampaignFile(dir, ROAD)).toBeNull();
    const aside = path.join(dir, `${MAIN_SAVE_FILES[ROAD]}.aside-1700000000000-abcdef1234`);
    expect(await fs.readFile(aside, "utf8")).toBe(unavailable);
    await write(dir, run(0));
    expect(await readCampaignFile(dir, ROAD)).toBe(run(0));
  });

  it("never replaces an earlier set-aside run: a name clash retries, and past the limit it refuses", async () => {
    // Plant a file (and a link) at the first names it will try.
    const victim = path.join(dir, "victim.txt");
    await fs.writeFile(victim, "keep me");
    await fs.writeFile(`${roadFile(dir)}.aside-5-clash`, "earlier run");
    await fs.symlink(victim, `${roadFile(dir)}.aside-5-link`);
    const ids = ["clash", "link", "fresh"];
    await fs.writeFile(roadFile(dir), "damaged run");
    await setAsideCampaignFile(dir, ROAD, () => 5, () => ids.shift()!);
    expect(await fs.readFile(`${roadFile(dir)}.aside-5-clash`, "utf8")).toBe("earlier run");
    expect(await fs.readFile(victim, "utf8")).toBe("keep me");
    expect(await fs.readFile(`${roadFile(dir)}.aside-5-fresh`, "utf8")).toBe("damaged run");
    expect(await readCampaignFile(dir, ROAD)).toBeNull();

    // Repeated cycles keep every run, up to the limit; then it refuses and keeps the save.
    let n = 0;
    while ((await fs.readdir(dir)).filter((entry) => entry.includes(".aside-")).length < MAX_ASIDES) {
      await fs.writeFile(roadFile(dir), `run ${n}`);
      await setAsideCampaignFile(dir, ROAD, () => 6, () => `cycle${n++}`);
    }
    await fs.writeFile(roadFile(dir), "one too many");
    await expect(setAsideCampaignFile(dir, ROAD)).rejects.toThrow(TOO_MANY_ASIDES);
    expect(await fs.readFile(roadFile(dir), "utf8")).toBe("one too many");
    const kept = (await fs.readdir(dir)).filter((entry) => entry.includes(".aside-"));
    expect(kept).toHaveLength(MAX_ASIDES);
    expect(await fs.readFile(`${roadFile(dir)}.aside-5-clash`, "utf8")).toBe("earlier run");
  });

  it("recovers from a damaged save through its backup", async () => {
    await write(dir, run(0));
    await write(dir, run(1));
    await fs.writeFile(roadFile(dir), '{"version":2,"prov');
    expect(readCampaignSave(testRegistry, ROAD, await readCampaignFile(dir, ROAD)).kind).toBe("unreadable");
    await expect(write(dir, run(2))).rejects.toThrow(/set it aside first/);
    const backup = readCampaignSave(testRegistry, ROAD, await readCampaignBackup(dir, ROAD));
    expect(backup.kind).toBe("ok");
    await setAsideCampaignFile(dir, ROAD);
    await write(dir, await readCampaignBackup(dir, ROAD));
    expect(await readCampaignFile(dir, ROAD)).toBe(run(0));
  });

  it("follows no links: not at the save, not at its backup", async () => {
    const victim = path.join(dir, "victim.txt");
    await fs.writeFile(victim, "keep me");
    await fs.symlink(victim, roadFile(dir));
    await expect(readCampaignFile(dir, ROAD)).rejects.toThrow(/not a regular file/);
    await expect(write(dir, run(0))).rejects.toThrow(/not a regular file/);
    await fs.rm(roadFile(dir));
    await write(dir, run(0));
    await fs.symlink(victim, `${roadFile(dir)}.bak`);
    await expect(write(dir, run(1))).rejects.toThrow(/not a regular file/);
    expect(await fs.readFile(victim, "utf8")).toBe("keep me");
    expect(await readCampaignFile(dir, ROAD)).toBe(run(0));
  });

  it("exports a chosen campaign's save, including a run this build cannot continue", async () => {
    const valid = JSON.parse(run(1));
    const unavailable = JSON.stringify({ ...valid, provenance: { ...valid.provenance, rulesRevision: 9 } });
    await fs.writeFile(roadFile(dir), unavailable);
    const picked = path.join(dir, "export.json");
    expect(await exportSaveFile(dir, async () => picked, undefined, ROAD, testRegistry)).toEqual({ exported: true });
    expect(await fs.readFile(picked, "utf8")).toBe(unavailable);
    await fs.writeFile(roadFile(dir), "garbage");
    await expect(exportSaveFile(dir, async () => picked, undefined, ROAD, testRegistry)).rejects.toThrow(/not readable/);
    await expect(exportSaveFile(dir, async () => picked, undefined, "../x")).rejects.toThrow("unknown campaign save");
  });

  it("offers a default export name per campaign, made from main's own allowlist key", async () => {
    await fs.writeFile(roadFile(dir), run(1));
    await writeSaveFile(dir, saveCampaign(startCampaign(ashAndBanner)));
    const offered: string[] = [];
    const choose = async (defaultName: string) => (offered.push(defaultName), null);
    await exportSaveFile(dir, choose, undefined, ROAD, testRegistry);
    await exportSaveFile(dir, choose);
    expect(offered).toEqual(["doctrine-of-war-cinder_road-save.json", "doctrine-of-war-save.json"]);
    for (const id of Object.keys(MAIN_SAVE_FILES)) expect(exportFileNameFor(id)).toMatch(/^doctrine-of-war-([a-z_]+-)?save\.json$/);
    // An id outside the allowlist never becomes a name.
    expect(() => exportFileNameFor("../../x")).toThrow("unknown campaign save");
    expect(() => exportFileNameFor("toString")).toThrow("unknown campaign save");
    await expect(exportSaveFile(dir, choose, undefined, "cinder_road/../x")).rejects.toThrow("unknown campaign save");
    expect(offered).toHaveLength(2);
  });
});
