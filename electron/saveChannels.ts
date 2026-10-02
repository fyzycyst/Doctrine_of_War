// IPC channel names shared by the main process and the preload bridge.
// No Node imports here: the sandboxed preload bundles this file.
// The save channels take an optional campaign id (default: the intro). Main checks it
// against its own fixed allowlist (MAIN_SAVE_FILES); no path ever crosses the bridge.
export const SAVE_READ_CHANNEL = "doctrine-of-war:saves:read";
export const SAVE_WRITE_CHANNEL = "doctrine-of-war:saves:write";
/** Settings → Support → Export save file…: main copies its own save to a path the user picks. */
export const SAVE_EXPORT_CHANNEL = "doctrine-of-war:saves:export";
/** M1: a v2 campaign's backup (the save before the current one). Takes a campaign id. */
export const SAVE_BACKUP_CHANNEL = "doctrine-of-war:saves:backup";
/** M1: set a v2 campaign's save aside (kept) so a fresh run can start. Takes a campaign id. */
export const SAVE_SET_ASIDE_CHANNEL = "doctrine-of-war:saves:set-aside";
export const VARIANTS_READ_CHANNEL = "doctrine-of-war:variants:read";
export const VARIANTS_WRITE_CHANNEL = "doctrine-of-war:variants:write";
