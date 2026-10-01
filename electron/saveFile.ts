// The campaign save file (and, since T16, the doctrine variants file) in Electron's
// userData folder. Main-process only. Each is one fixed file: no path ever comes from
// the renderer. Before anything is written, main runs the same full validation the
// renderer uses (loadCampaign, parseVariants), so a compromised renderer cannot
// replace a good file with one the game would refuse.
// Symlinks are never followed: a link planted at the save, a temp file or the
// userData folder itself is refused rather than read through or written through.
import { randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { ashAndBanner } from "../src/game/campaign/definition";
import { loadCampaign, MAX_SAVE_BYTES } from "../src/game/campaign/save";
import { checkVariantsPayload, MAX_VARIANTS_BYTES } from "../src/game/engine/editor";

export { MAX_SAVE_BYTES };
export const SAVE_FILE_NAME = "campaign-save.json";
export const VARIANTS_FILE_NAME = "doctrine-variants.json";

/** One fixed file: its name, its size cap, and the full validation a payload must pass before it is written. */
interface FixedFile {
  name: string;
  maxBytes: number;
  check: (data: unknown) => string;
}

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

const CAMPAIGN_FILE: FixedFile = { name: SAVE_FILE_NAME, maxBytes: MAX_SAVE_BYTES, check: checkSavePayload };
// The variants file runs the renderer's own parseVariants() and refuses any variant that would be dropped.
const VARIANTS_FILE: FixedFile = { name: VARIANTS_FILE_NAME, maxBytes: MAX_VARIANTS_BYTES, check: checkVariantsPayload };

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
  return readFixedFile(userDataDir, CAMPAIGN_FILE);
}

/** The doctrine variants file, or null when there is none yet. */
export function readVariantsFile(userDataDir: string): Promise<string | null> {
  return readFixedFile(userDataDir, VARIANTS_FILE);
}

function readFixedFile(userDataDir: string, spec: FixedFile): Promise<string | null> {
  const { maxBytes } = spec;
  return serialized(async () => {
    const file = path.join(userDataDir, spec.name);
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
      if (stats.size > maxBytes) {
        throw new Error(`save file exceeds ${maxBytes} bytes`);
      }
      // Bounded read through the descriptor: the file may grow after the stat.
      const buffer = Buffer.alloc(maxBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > maxBytes) {
        throw new Error(`save file exceeds ${maxBytes} bytes`);
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
  return writeFixedFile(userDataDir, CAMPAIGN_FILE, data, tempId);
}

/** Same guarantees as writeSaveFile, for the doctrine variants file. */
export function writeVariantsFile(userDataDir: string, data: unknown, tempId: () => string = randomUUID): Promise<void> {
  return writeFixedFile(userDataDir, VARIANTS_FILE, data, tempId);
}

function writeFixedFile(userDataDir: string, spec: FixedFile, data: unknown, tempId: () => string): Promise<void> {
  let payload: string;
  try {
    payload = spec.check(data);
  } catch (error) {
    return Promise.reject(error);
  }
  return serialized(async () => {
    const file = path.join(userDataDir, spec.name);
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

export type ExportResult = { exported: true } | { exported: false; reason: "no-save" | "cancelled" };

/** Shown when the export's chosen file is a link: never write through one. */
export const EXPORT_LINK_REFUSED = "Can't save over a link; choose another file.";

/** The chosen destination may be new or a plain file; a link (or anything else) is refused. */
async function checkExportTarget(target: string): Promise<void> {
  try {
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink()) throw new Error(EXPORT_LINK_REFUSED);
    if (!stats.isFile()) throw new Error("Can't save over that; choose a file.");
  } catch (error) {
    if (code(error) === "ENOENT") return;
    throw error;
  }
}

/**
 * Settings → Support → "Export save file…": copies the campaign save to a file the user
 * picks, for a bug report. The renderer supplies neither the data nor the path: main reads
 * its own save (with every check readSaveFile makes), validates it, and asks the user where
 * to put it (`choosePath`: the native save dialog; null when cancelled).
 *
 * The write follows no links: a link at the chosen path is refused, and the copy goes to
 * a fresh, exclusively created temp file beside it, renamed over the destination (a rename
 * replaces a link that appears meanwhile rather than writing through it).
 */
export async function exportSaveFile(
  userDataDir: string,
  choosePath: () => Promise<string | null>,
  tempId: () => string = randomUUID,
): Promise<ExportResult> {
  const data = await readSaveFile(userDataDir);
  if (data === null) return { exported: false, reason: "no-save" };
  checkSavePayload(data);
  const target = await choosePath();
  if (!target) return { exported: false, reason: "cancelled" };
  await checkExportTarget(target);
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${tempId()}.tmp`);
  const handle = await fs.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
  try {
    try {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await checkExportTarget(target);
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  return { exported: true };
}
