// IPC channel names shared by the main process and the preload bridge.
// No Node imports here: the sandboxed preload bundles this file.
export const SAVE_READ_CHANNEL = "doctrine-of-war:saves:read";
export const SAVE_WRITE_CHANNEL = "doctrine-of-war:saves:write";
