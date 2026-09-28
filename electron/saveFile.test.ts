import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_SAVE_BYTES as CAMPAIGN_MAX_SAVE_BYTES } from "../src/game/campaign/save";
import { checkSavePayload, MAX_SAVE_BYTES, readSaveFile, SAVE_FILE_NAME, saveFilePath, writeSaveFile } from "./saveFile";

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
    const payload = JSON.stringify({ version: 1, campaign: { campaignId: "ash_and_banner" } });
    await writeSaveFile(dir, payload);
    expect(await readSaveFile(dir)).toBe(payload);
    expect(await fs.readdir(dir)).toEqual([SAVE_FILE_NAME]);
  });

  it("rejects payloads that are not a size-capped, versioned JSON object", async () => {
    const bad: unknown[] = [
      42,
      { version: 1 },
      "not json",
      "[1,2]",
      '{"campaign":{}}',
      JSON.stringify({ version: 1, pad: "x".repeat(MAX_SAVE_BYTES) }),
    ];
    for (const data of bad) {
      expect(() => checkSavePayload(data)).toThrow();
      await expect(writeSaveFile(dir, data)).rejects.toThrow();
    }
    expect(await readSaveFile(dir)).toBeNull();
  });

  it("serializes overlapping writes: every save lands, the last one wins, no temp files remain", async () => {
    const save = (tag: string) => JSON.stringify({ version: 1, tag, pad: "x".repeat(200 * 1024) });
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
    const payload = JSON.stringify({ version: 1 });
    await writeSaveFile(dir, payload);
    expect(await readSaveFile(dir)).toBe(payload);
  });

  it("refuses to read an oversized save file", async () => {
    await fs.writeFile(saveFilePath(dir), "x".repeat(MAX_SAVE_BYTES + 1));
    await expect(readSaveFile(dir)).rejects.toThrow(/exceeds/);
  });
});
