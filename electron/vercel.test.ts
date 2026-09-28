// vercel.json serves the web build; its HTTP headers must stay in step with the CSP meta
// the build injects (electron/security.ts), plus what only a header can do (framing).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_CSP } from "./security";

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}
const config = JSON.parse(readFileSync(path.join(__dirname, "../vercel.json"), "utf8")) as {
  buildCommand: string;
  outputDirectory: string;
  rewrites: { source: string; destination: string }[];
  headers: HeaderRule[];
};
const header = (source: string, key: string) =>
  config.headers.find((rule) => rule.source === source)?.headers.find((item) => item.key === key)?.value;

describe("vercel.json", () => {
  it("serves the static build with an SPA fallback (no lab-only CC0 figures needed)", () => {
    expect(config.outputDirectory).toBe("dist");
    expect(config.buildCommand).toBe("npm run build");
    expect(config.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });

  it("sends the production CSP as a header, plus frame-ancestors", () => {
    expect(header("/(.*)", "Content-Security-Policy")).toBe(`${PRODUCTION_CSP}; frame-ancestors 'none'`);
    expect(header("/(.*)", "X-Content-Type-Options")).toBe("nosniff");
    expect(header("/(.*)", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("/(.*)", "Permissions-Policy")).toMatch(/camera=\(\), microphone=\(\)/);
  });

  it("caches only Vite's hashed top-level assets forever, never index.html", () => {
    expect(header("/assets/:file([^/]+)", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(header("/index.html", "Cache-Control")).toBe("no-cache");
  });
});
