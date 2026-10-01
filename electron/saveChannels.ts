// IPC channel names shared by the main process and the preload bridge.
// No Node imports here: the sandboxed preload bundles this file.
export const SAVE_READ_CHANNEL = "doctrine-of-war:saves:read";
export const SAVE_WRITE_CHANNEL = "doctrine-of-war:saves:write";
/** Settings → Support → Export save file…: main copies its own save to a path the user picks. */
export const SAVE_EXPORT_CHANNEL = "doctrine-of-war:saves:export";
export const VARIANTS_READ_CHANNEL = "doctrine-of-war:variants:read";
export const VARIANTS_WRITE_CHANNEL = "doctrine-of-war:variants:write";
