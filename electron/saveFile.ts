// The campaign save file in Electron's userData folder. Main-process only.
// Exactly one fixed file: no path ever comes from the renderer. Before anything is
// written, main runs the same full loadCampaign() validation the renderer uses, so a
// compromised renderer cannot replace a good save with one the game would refuse.
// Symlinks are never followed: a link planted at the save, a temp file or the
// userData folder itself is refused rather than read through or written through.
import { randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { ashAndBanner } from "../src/game/campaign/definition";
import { loadCampaign, MAX_SAVE_BYTES } from "../src/game/campaign/save";

export { MAX_SAVE_BYTES };
export const SAVE_FILE_NAME = "campaign-save.json";

export function saveFilePath(userDataDir: string): string {
  return path.join(userDataDir, SAVE_FILE_NAME);
}

/** Returns the payload if it is a save this campaign would load; throws otherwise. */
export function checkSavePayload(data: unknown): string {
  if (typeof data !== "string") {
    throw new Error("save payload must be a string");
  }
  if (Buffer.byteLength(data, "utf8") > MAX_SAVE_BYTES) {
    throw new Error(`save payload exceeds ${MAX_SAVE_BYTES} bytes`);
  }
  loadCampaign(data, ashAndBanner);
  return data;
}

// O_NOFOLLOW is POSIX; where it is missing (Windows) the lstat checks still apply.
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

function code(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

/** The userData folder must be a real directory (not a link), owned by this user where that is knowable. */
async function checkDirectory(dir: string): Promise<void> {
  const stats = await fs.lstat(dir);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("save folder is not a plain directory");
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new Error("save folder is owned by another user");
  }
}

/** Refuses a save path that exists as anything but a regular file (a symlink in particular). */
async function checkNotLink(file: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(file);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("save file is not a regular file");
    }
    return true;
  } catch (error) {
    if (code(error) === "ENOENT") return false;
    throw error;
  }
}

// Every read and write runs one at a time, in call order: overlapping saves from the
// renderer queue up instead of racing on the file.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** The saved string, or null when there is no save yet. Reads at most MAX_SAVE_BYTES + 1 bytes. */
export function readSaveFile(userDataDir: string): Promise<string | null> {
  return serialized(async () => {
    const file = saveFilePath(userDataDir);
    try {
      await checkDirectory(userDataDir);
    } catch (error) {
      if (code(error) === "ENOENT") return null;
      throw error;
    }
    if (!(await checkNotLink(file))) return null;
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(file, constants.O_RDONLY | NOFOLLOW);
    } catch (error) {
      if (code(error) === "ENOENT") return null;
      if (code(error) === "ELOOP") throw new Error("save file is not a regular file");
      throw error;
    }
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        throw new Error("save file is not a regular file");
      }
      if (stats.size > MAX_SAVE_BYTES) {
        throw new Error(`save file exceeds ${MAX_SAVE_BYTES} bytes`);
      }
      // Bounded read through the descriptor: the file may grow after the stat.
      const buffer = Buffer.alloc(MAX_SAVE_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > MAX_SAVE_BYTES) {
        throw new Error(`save file exceeds ${MAX_SAVE_BYTES} bytes`);
      }
      return buffer.subarray(0, length).toString("utf8");
    } finally {
      await handle.close();
    }
  });
}

/**
 * Validates, then writes atomically so a crash never leaves half a save: the payload
 * goes to a fresh, exclusively created temp file, which is flushed and renamed over
 * the save. Writes are serialized, and each uses its own temp name (`tempId` exists
 * so tests can predict one; main never passes it).
 */
export function writeSaveFile(userDataDir: string, data: unknown, tempId: () => string = randomUUID): Promise<void> {
  let payload: string;
  try {
    payload = checkSavePayload(data);
  } catch (error) {
    return Promise.reject(error);
  }
  return serialized(async () => {
    const file = saveFilePath(userDataDir);
    const temp = `${file}.${tempId()}.tmp`;
    await fs.mkdir(userDataDir, { recursive: true });
    await checkDirectory(userDataDir);
    await checkNotLink(file);
    // O_EXCL refuses any existing path, links included; O_NOFOLLOW is belt and braces.
    const handle = await fs.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
    try {
      try {
        await handle.writeFile(payload, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      // The target may have been swapped for a link while we wrote; rename replaces a
      // link rather than following it, but refuse anyway so a planted link is visible.
      await checkNotLink(file);
      await fs.rename(temp, file);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
  });
}
