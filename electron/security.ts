// Which URLs count as the app itself, and which IPC senders may use the save bridge.
// Pure (no Electron imports) so it is unit-tested; main.ts wires it to the window.
//
// The app is exactly one document: the packaged dist/index.html (file://), or the
// Vite dev server's origin in development. Anything else is foreign: navigation to
// it is blocked, and a frame showing it cannot read or write saves.

export interface AppLocation {
  /** file:// URL of the packaged index.html. */
  indexUrl: string;
  /** VITE_DEV_SERVER_URL in development, else undefined. */
  devServerUrl?: string;
}

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** True for the app's own document (any hash or query), false for everything else. */
export function isAppUrl(raw: string, app: AppLocation): boolean {
  const url = parse(raw);
  if (!url) return false;
  if (app.devServerUrl) {
    const dev = parse(app.devServerUrl);
    return dev !== null && (url.protocol === "http:" || url.protocol === "https:") && url.origin === dev.origin;
  }
  const index = parse(app.indexUrl);
  return index !== null && url.protocol === "file:" && url.host === index.host && url.pathname === index.pathname;
}

/** The parts of an IPC event's sender frame the check needs (WebFrameMain in Electron). */
export interface SenderFrame {
  url: string;
  parent: unknown;
}

/** Only the app's own top-level document may use the save bridge; subframes never. */
export function isTrustedSender(frame: SenderFrame | null | undefined, app: AppLocation): boolean {
  return Boolean(frame) && frame!.parent === null && isAppUrl(frame!.url, app);
}

/**
 * Content-Security-Policy for the production build (injected into index.html at build
 * time; the dev server needs inline scripts for React refresh, so it has none).
 * No 'unsafe-eval': three.js compiles shaders through WebGL, not JavaScript eval.
 * 'wasm-unsafe-eval' allows WebAssembly compilation only (not JS eval): drei's
 * useGLTF decodes meshopt-compressed .glb files with a WASM decoder.
 * Inline styles are allowed because React and drei set style attributes. blob:/data:
 * cover textures GLTFLoader unpacks from .glb files.
 */
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
