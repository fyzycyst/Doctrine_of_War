import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startCampaign } from "../src/game/campaign/campaign";
import { ashAndBanner } from "../src/game/campaign/definition";
import { MAX_SAVE_BYTES as CAMPAIGN_MAX_SAVE_BYTES, saveCampaign } from "../src/game/campaign/save";
import { serializeVariants } from "../src/game/engine/editor";
import {
  checkSavePayload,
  MAX_SAVE_BYTES,
  readSaveFile,
  readVariantsFile,
  SAVE_FILE_NAME,
  saveFilePath,
  VARIANTS_FILE_NAME,
  writeSaveFile,
  writeVariantsFile,
} from "./saveFile";

/** A real, loadable save; `extra` envelope keys are ignored by loadCampaign. */
const validSave = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ...JSON.parse(saveCampaign(startCampaign(ashAndBanner))), ...extra });

describe("Electron save file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "dow-save-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("uses one fixed file inside userData", () => {
    expect(saveFilePath(dir)).toBe(path.join(dir, SAVE_FILE_NAME));
    expect(MAX_SAVE_BYTES).toBe(CAMPAIGN_MAX_SAVE_BYTES);
  });

  it("reads null before the first save, then round-trips atomically", async () => {
    expect(await readSaveFile(dir)).toBeNull();
    const payload = validSave();
    await writeSaveFile(dir, payload);
    expect(await readSaveFile(dir)).toBe(payload);
    expect(await fs.readdir(dir)).toEqual([SAVE_FILE_NAME]);
  });

  it("rejects anything the game's own loadCampaign would refuse", async () => {
    const fresh = JSON.parse(validSave()).campaign;
    const bad: unknown[] = [
      42,
      { version: 1 },
      "not json",
      "[1,2]",
      '{"campaign":{}}',
      // Review probe: a shallow version check let this destroy a valid save.
      '{"version":2,"campaign":{}}',
      '{"version":1,"campaign":{}}',
      JSON.stringify({ version: 1, campaign: { ...fresh, campaignId: "other_war" } }),
      JSON.stringify({ version: 1, campaign: { ...fresh, battleIndex: 1 } }),
      validSave({ pad: "x".repeat(MAX_SAVE_BYTES) }),
    ];
    const good = validSave();
    await writeSaveFile(dir, good);
    for (const data of bad) {
      expect(() => checkSavePayload(data)).toThrow();
      await expect(writeSaveFile(dir, data)).rejects.toThrow();
    }
    expect(await readSaveFile(dir)).toBe(good);
  });

  it("serializes overlapping writes: every save lands, the last one wins, no temp files remain", async () => {
    const save = (tag: string) => validSave({ tag, pad: "x".repeat(200 * 1024) });
    for (let round = 0; round < 20; round += 1) {
      const a = save(`a${round}`);
      const b = save(`b${round}`);
      const results = await Promise.allSettled([writeSaveFile(dir, a), writeSaveFile(dir, b), readSaveFile(dir)]);
      expect(results.map((item) => item.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
      expect(await readSaveFile(dir)).toBe(b);
    }
    expect(await fs.readdir(dir)).toEqual([SAVE_FILE_NAME]);
  });

  it("a rejected write does not block the queue", async () => {
    await expect(writeSaveFile(dir, "not json")).rejects.toThrow();
    await expect(writeSaveFile(path.join(dir, "missing", "\0bad"), "{}")).rejects.toThrow();
    const payload = validSave();
    await writeSaveFile(dir, payload);
    expect(await readSaveFile(dir)).toBe(payload);
  });

  it("refuses to read an oversized save file", async () => {
    await fs.writeFile(saveFilePath(dir), "x".repeat(MAX_SAVE_BYTES + 1));
    await expect(readSaveFile(dir)).rejects.toThrow(/exceeds/);
  });

  describe("never follows symlinks", () => {
    let victim: string;
    const secret = "not a save: private data";

    beforeEach(async () => {
      victim = path.join(dir, "victim.txt");
      await fs.writeFile(victim, secret);
    });

    it("refuses to read through a save file that is a link", async () => {
      await fs.symlink(victim, saveFilePath(dir));
      await expect(readSaveFile(dir)).rejects.toThrow(/not a regular file/);
    });

    it("refuses to write over a save file that is a link, leaving its target alone", async () => {
      await fs.symlink(victim, saveFilePath(dir));
      await expect(writeSaveFile(dir, validSave())).rejects.toThrow(/not a regular file/);
      expect(await fs.readFile(victim, "utf8")).toBe(secret);
      expect((await fs.lstat(saveFilePath(dir))).isSymbolicLink()).toBe(true);
    });

    it("refuses to write through a planted temp-file link", async () => {
      const temp = `${saveFilePath(dir)}.planted.tmp`;
      await fs.symlink(victim, temp);
      await expect(writeSaveFile(dir, validSave(), () => "planted")).rejects.toThrow(/EEXIST/);
      expect(await fs.readFile(victim, "utf8")).toBe(secret);
      expect((await fs.lstat(temp)).isSymbolicLink()).toBe(true);
      expect(await readSaveFile(dir)).toBeNull();
    });

    it("refuses a dangling temp-file link too", async () => {
      const target = path.join(dir, "created-through-link.txt");
      await fs.symlink(target, `${saveFilePath(dir)}.dangling.tmp`);
      await expect(writeSaveFile(dir, validSave(), () => "dangling")).rejects.toThrow(/EEXIST/);
      await expect(fs.stat(target)).rejects.toThrow(/ENOENT/);
    });

    it("refuses a userData folder that is a link", async () => {
      const real = path.join(dir, "real");
      const linked = path.join(dir, "linked");
      await fs.mkdir(real);
      await fs.writeFile(saveFilePath(real), validSave());
      await fs.symlink(real, linked);
      await expect(readSaveFile(linked)).rejects.toThrow(/plain directory/);
      await expect(writeSaveFile(linked, validSave({ tag: 2 }))).rejects.toThrow(/plain directory/);
      expect(JSON.parse(await fs.readFile(saveFilePath(real), "utf8")).version).toBe(1);
    });

    it("refuses a save path that is a directory", async () => {
      await fs.mkdir(saveFilePath(dir));
      await expect(readSaveFile(dir)).rejects.toThrow(/not a regular file/);
      await expect(writeSaveFile(dir, validSave())).rejects.toThrow(/not a regular file/);
    });
  });
});

describe("Electron doctrine variants file", () => {
  let dir: string;
  const variant = {
    id: "v-shield-veterans-cut",
    baseId: "shield_the_line",
    name: "Shield the Line (Veteran's cut)",
    order: ["stl_brace", "stl_break", "stl_hold"],
    params: { stl_break: { value: 35 } },
  };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "dow-variants-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("round-trips its own fixed file beside the save", async () => {
    expect(await readVariantsFile(dir)).toBeNull();
    const payload = serializeVariants([variant]);
    await writeVariantsFile(dir, payload);
    expect(await readVariantsFile(dir)).toBe(payload);
    expect(await fs.readdir(dir)).toEqual([VARIANTS_FILE_NAME]);
    expect(await readSaveFile(dir)).toBeNull();
  });

  it("refuses to write a file with any variant the game would drop", async () => {
    for (const bad of [42, "{}", serializeVariants([{ ...variant, params: { stl_break: { value: 95 } } }]), serializeVariants([{ ...variant, order: ["stl_hold"] }])]) {
      await expect(writeVariantsFile(dir, bad)).rejects.toThrow();
    }
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("does not follow a planted link", async () => {
    const outside = path.join(dir, "outside.json");
    await fs.writeFile(outside, serializeVariants([variant]));
    await fs.symlink(outside, path.join(dir, VARIANTS_FILE_NAME));
    await expect(readVariantsFile(dir)).rejects.toThrow(/not a regular file/);
  });
});
