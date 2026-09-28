// The campaign save file in Electron's userData folder. Main-process only.
// Exactly one fixed file: no path ever comes from the renderer. Payloads are
// size-capped and must be a JSON object with a numeric version; full validation
// happens in the renderer's loadCampaign().
import { promises as fs } from "node:fs";
import path from "node:path";

export const SAVE_FILE_NAME = "campaign-save.json";
/** Mirrors MAX_SAVE_BYTES in src/game/campaign/save.ts (a test keeps them equal). */
export const MAX_SAVE_BYTES = 256 * 1024;

export function saveFilePath(userDataDir: string): string {
  return path.join(userDataDir, SAVE_FILE_NAME);
}

/** Returns the payload if it is an acceptable save string; throws otherwise. */
export function checkSavePayload(data: unknown): string {
  if (typeof data !== "string") {
    throw new Error("save payload must be a string");
  }
  if (Buffer.byteLength(data, "utf8") > MAX_SAVE_BYTES) {
    throw new Error(`save payload exceeds ${MAX_SAVE_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error("save payload is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || typeof (parsed as { version?: unknown }).version !== "number") {
    throw new Error("save payload is not a versioned save");
  }
  return data;
}

/** The saved string, or null when there is no save yet. */
export async function readSaveFile(userDataDir: string): Promise<string | null> {
  const file = saveFilePath(userDataDir);
  try {
    const stats = await fs.stat(file);
    if (stats.size > MAX_SAVE_BYTES) {
      throw new Error(`save file exceeds ${MAX_SAVE_BYTES} bytes`);
    }
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Validates, then writes atomically (temp file + rename) so a crash never leaves half a save. */
export async function writeSaveFile(userDataDir: string, data: unknown): Promise<void> {
  const payload = checkSavePayload(data);
  const file = saveFilePath(userDataDir);
  const temp = `${file}.tmp`;
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(temp, payload, "utf8");
  await fs.rename(temp, file);
}
