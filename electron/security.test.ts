import { describe, expect, it } from "vitest";
import { isAppUrl, isTrustedSender, PRODUCTION_CSP } from "./security";

const packaged = { indexUrl: "file:///Applications/Doctrine%20of%20War.app/Contents/Resources/app.asar/dist/index.html" };
const dev = { ...packaged, devServerUrl: "http://localhost:5173/" };

describe("app origin", () => {
  it("packaged: only the app's own index.html, any hash or query", () => {
    expect(isAppUrl(packaged.indexUrl, packaged)).toBe(true);
    expect(isAppUrl(`${packaged.indexUrl}#/campaign`, packaged)).toBe(true);
    expect(isAppUrl(`${packaged.indexUrl}?debug=1`, packaged)).toBe(true);
    for (const url of [
      "https://evil.example/",
      "http://localhost:5173/",
      "file:///etc/passwd",
      "file:///Applications/Doctrine%20of%20War.app/Contents/Resources/app.asar/dist/other.html",
      "file://evil-host/Applications/Doctrine%20of%20War.app/Contents/Resources/app.asar/dist/index.html",
      "data:text/html,<script>alert(1)</script>",
      "javascript:alert(1)",
      "about:blank",
      "not a url",
    ]) {
      expect(isAppUrl(url, packaged), url).toBe(false);
    }
  });

  it("dev: only the dev server's origin", () => {
    expect(isAppUrl("http://localhost:5173/", dev)).toBe(true);
    expect(isAppUrl("http://localhost:5173/src/main.tsx?t=1", dev)).toBe(true);
    for (const url of ["http://localhost:5174/", "https://localhost:5173/", "http://127.0.0.1:5173/", packaged.indexUrl, "https://evil.example/"]) {
      expect(isAppUrl(url, dev), url).toBe(false);
    }
  });

  it("IPC: only the app's top-level frame may use the save bridge", () => {
    expect(isTrustedSender({ url: packaged.indexUrl, parent: null }, packaged)).toBe(true);
    expect(isTrustedSender({ url: packaged.indexUrl, parent: {} }, packaged)).toBe(false);
    expect(isTrustedSender({ url: "https://evil.example/", parent: null }, packaged)).toBe(false);
    expect(isTrustedSender(null, packaged)).toBe(false);
    expect(isTrustedSender(undefined, packaged)).toBe(false);
  });

  it("the production CSP forbids eval, inline script, plugins and framing", () => {
    expect(PRODUCTION_CSP).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(PRODUCTION_CSP).not.toMatch(/'unsafe-eval'|script-src[^;]*unsafe-inline/);
    expect(PRODUCTION_CSP).toContain("object-src 'none'");
    expect(PRODUCTION_CSP).toContain("frame-src 'none'");
    expect(PRODUCTION_CSP).toContain("base-uri 'none'");
  });
});
