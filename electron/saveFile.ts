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
import { MAX_RUN_BYTES, readCampaignSave } from "../src/game/campaign/saveFiles";
import { registry as shippedRegistry } from "../src/game/packs/registry";
import type { PackRegistry } from "../src/game/packs/types";
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
  return serialized(() => readFixedFileNow(userDataDir, spec));
}

/** The read itself; callers hold the queue (serialized). */
function readFixedFileNow(userDataDir: string, spec: FixedFile): Promise<string | null> {
  const { maxBytes } = spec;
  return (async () => {
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
  })();
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
  return serialized(() => writeFixedFileNow(userDataDir, spec, payload, tempId));
}

/** The atomic write itself (payload already checked); callers hold the queue. */
async function writeFixedFileNow(userDataDir: string, spec: FixedFile, payload: string, tempId: () => string): Promise<void> {
  {
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
  }
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
 * to put it (`choosePath`: the native save dialog, offered a default file name for the
 * campaign; null when cancelled).
 *
 * The write follows no links: a link at the chosen path is refused, and the copy goes to
 * a fresh, exclusively created temp file beside it, renamed over the destination (a rename
 * replaces a link that appears meanwhile rather than writing through it).
 */
export async function exportSaveFile(
  userDataDir: string,
  choosePath: (defaultName: string) => Promise<string | null>,
  tempId: () => string = randomUUID,
  /** M1: which campaign's save (allowlisted; default the intro). */
  campaignId?: unknown,
  registry: PackRegistry = shippedRegistry,
): Promise<ExportResult> {
  const id = campaignIdOf(campaignId);
  const data = await readCampaignFile(userDataDir, id);
  if (data === null) return { exported: false, reason: "no-save" };
  if (id === INTRO) {
    checkSavePayload(data);
  } else if (readCampaignSave(registry, id, data).kind === "unreadable") {
    // A run this build cannot continue is still worth a bug report; a damaged file is not a save.
    throw new Error("save file is not readable");
  }
  const target = await choosePath(exportFileNameFor(id === INTRO ? undefined : id));
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

// ---------------------------------------------------------------------------
// Per-campaign saves (M1, P3)
// ---------------------------------------------------------------------------

/**
 * The main process's own, literal allowlist: campaign id -> save file in userData. A
 * campaign id from the renderer is only ever a key into this map (a test checks it
 * matches the renderer's CAMPAIGN_SAVE_FILES); no path or file name crosses the bridge.
 * The intro keeps the original file and its original read/write path, unchanged.
 */
export const MAIN_SAVE_FILES: Readonly<Record<string, string>> = Object.freeze({
  ash_and_banner: SAVE_FILE_NAME,
  cinder_road: "campaign-cinder_road.json",
});

const INTRO = "ash_and_banner";

/** The allowlisted file for a campaign id; refuses anything else (including a missing id other than the intro's default). */
export function campaignSaveFileName(campaignId: unknown): string {
  if (campaignId === undefined) return SAVE_FILE_NAME;
  if (typeof campaignId !== "string" || !Object.hasOwn(MAIN_SAVE_FILES, campaignId)) {
    throw new Error("unknown campaign save");
  }
  return MAIN_SAVE_FILES[campaignId];
}

function campaignIdOf(campaignId: unknown): string {
  campaignSaveFileName(campaignId);
  return campaignId === undefined ? INTRO : (campaignId as string);
}

/**
 * The export dialog's default file name for a campaign: the intro keeps the original name;
 * any other is "doctrine-of-war-<id>-save.json", where <id> is main's own allowlist key (the
 * renderer's string only selects it, and anything outside MAIN_SAVE_FILES is refused).
 */
export function exportFileNameFor(campaignId: unknown): string {
  const id = campaignIdOf(campaignId);
  if (id === INTRO) return "doctrine-of-war-save.json";
  const key = Object.keys(MAIN_SAVE_FILES).find((item) => item === id);
  if (!key) throw new Error("unknown campaign save");
  return `doctrine-of-war-${key}-save.json`;
}

/** A v2 payload main will write: a run this build reads as "ok" for exactly this campaign. */
function checkRunPayload(campaignId: string, registry: PackRegistry) {
  return (data: unknown): string => {
    if (typeof data !== "string") throw new Error("save payload must be a string");
    if (Buffer.byteLength(data, "utf8") > MAX_RUN_BYTES) throw new Error(`save payload exceeds ${MAX_RUN_BYTES} bytes`);
    const read = readCampaignSave(registry, campaignId, data);
    if (read.kind !== "ok") throw new Error(read.kind === "unavailable" ? read.reason : `save payload refused: ${read.kind === "unreadable" ? read.reason : read.kind}`);
    return data;
  };
}

function runFile(campaignId: string, suffix = "", registry: PackRegistry = shippedRegistry): FixedFile {
  return { name: `${MAIN_SAVE_FILES[campaignId]}${suffix}`, maxBytes: MAX_RUN_BYTES, check: checkRunPayload(campaignId, registry) };
}

/** A campaign's save (null when there is none). The intro goes through readSaveFile, unchanged. */
export function readCampaignFile(userDataDir: string, campaignId: unknown): Promise<string | null> {
  let id: string;
  try {
    id = campaignIdOf(campaignId);
  } catch (error) {
    return Promise.reject(error);
  }
  return id === INTRO ? readSaveFile(userDataDir) : readFixedFile(userDataDir, runFile(id));
}

/** A campaign's backup (the save before the current one), or null. The intro has none. */
export function readCampaignBackup(userDataDir: string, campaignId: unknown): Promise<string | null> {
  let id: string;
  try {
    id = campaignIdOf(campaignId);
  } catch (error) {
    return Promise.reject(error);
  }
  return id === INTRO ? Promise.resolve(null) : readFixedFile(userDataDir, runFile(id, ".bak"));
}

/**
 * Writes a campaign's save. The intro goes through writeSaveFile, unchanged. A v2 save is
 * validated in main (it must read "ok" for this campaign); the current file must itself be
 * empty or a run this build can continue (preserved runs are never overwritten), and it is
 * kept as `<file>.bak` before the new one is renamed into place.
 */
export function writeCampaignFile(
  userDataDir: string,
  campaignId: unknown,
  data: unknown,
  tempId: () => string = randomUUID,
  /** The packs this build ships (tests pass their own). */
  registry: PackRegistry = shippedRegistry,
): Promise<void> {
  let id: string;
  let payload: string;
  try {
    id = campaignIdOf(campaignId);
    if (id === INTRO) return writeSaveFile(userDataDir, data, tempId);
    payload = checkRunPayload(id, registry)(data);
  } catch (error) {
    return Promise.reject(error);
  }
  const spec = runFile(id, "", registry);
  return serialized(async () => {
    const current = await readFixedFileNow(userDataDir, spec);
    if (current !== null) {
      const read = readCampaignSave(registry, id, current);
      if (read.kind !== "ok") throw new Error("the current save is kept: set it aside first");
      await writeFixedFileNow(userDataDir, runFile(id, ".bak", registry), current, tempId);
    }
    await writeFixedFileNow(userDataDir, spec, payload, tempId);
  });
}

/** At most this many set-aside runs are kept per campaign (mirrors the renderer's MAX_ASIDES). */
export const MAX_ASIDES = 8;
export const TOO_MANY_ASIDES = `This campaign already has ${MAX_ASIDES} set-aside saves, which are kept. Export or remove one before setting another aside.`;

/**
 * Moves a v2 campaign's save aside so a fresh run can start. The copy goes to a new,
 * exclusively created `<file>.aside-<time>-<id>` (O_EXCL: an existing file, or a link, is
 * never replaced; on a name clash it retries with a new id), is flushed and verified, and
 * only then is the save removed. Set-aside runs are never deleted: past MAX_ASIDES it
 * refuses instead. The intro has no set-aside: its behaviour is unchanged.
 */
export function setAsideCampaignFile(userDataDir: string, campaignId: unknown, now: () => number = Date.now, tempId: () => string = randomUUID): Promise<void> {
  let id: string;
  try {
    id = campaignIdOf(campaignId);
    if (id === INTRO) throw new Error("the intro save cannot be set aside");
  } catch (error) {
    return Promise.reject(error);
  }
  return serialized(async () => {
    const name = MAIN_SAVE_FILES[id];
    const file = path.join(userDataDir, name);
    await checkDirectory(userDataDir);
    const current = await readFixedFileNow(userDataDir, { name, maxBytes: MAX_RUN_BYTES, check: (data) => String(data) });
    if (current === null) return;
    const kept = (await fs.readdir(userDataDir)).filter((entry) => entry.startsWith(`${name}.aside-`));
    if (kept.length >= MAX_ASIDES) throw new Error(TOO_MANY_ASIDES);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const target = `${file}.aside-${now()}-${tempId().replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
      let handle: fs.FileHandle;
      try {
        handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
      } catch (error) {
        if (code(error) === "EEXIST") continue;
        throw error;
      }
      try {
        await handle.writeFile(current, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      if ((await fs.readFile(target, "utf8")) !== current) throw new Error("the set-aside copy could not be verified");
      await checkNotLink(file);
      await fs.rm(file);
      return;
    }
    throw new Error("could not find a free name to set the save aside");
  });
}
