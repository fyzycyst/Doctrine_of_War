import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { macSigning } = require("./mac-signing.cjs");

const cert = { CSC_LINK: "file:///path/to/cert.p12" };
const notary = { APPLE_API_KEY: "/path/AuthKey_X.p8", APPLE_API_KEY_ID: "X", APPLE_API_ISSUER: "Y" };

describe("mac signing config", () => {
  it("no env: unsigned exactly as before (identity null, no notarize)", () => {
    expect(macSigning({})).toEqual({ mode: "unsigned", forceCodeSigning: false, mac: { identity: null, notarize: false } });
    expect(macSigning({ CSC_LINK: "  ", CSC_NAME: "" }).mode).toBe("unsigned");
  });

  it("certificate only: signed with hardened runtime and the minimal entitlements, not notarized", () => {
    const result = macSigning(cert);
    expect(result.mode).toBe("signed");
    expect(result.forceCodeSigning).toBe(true);
    expect(result.mac).toMatchObject({ hardenedRuntime: true, entitlements: "build/entitlements.mac.plist", notarize: false });
    expect(result.mac).not.toHaveProperty("identity");
    expect(macSigning({ CSC_NAME: "Developer ID Application: Someone (TEAMID)" }).mode).toBe("signed");
  });

  it("certificate + API key: notarized", () => {
    expect(macSigning({ ...cert, ...notary })).toMatchObject({ mode: "notarized", mac: { notarize: true, hardenedRuntime: true } });
  });

  it("fails fast on half-configured notarization instead of shipping an unnotarized build", () => {
    expect(() => macSigning({ ...cert, APPLE_API_KEY: "/k.p8" })).toThrow(/missing APPLE_API_KEY_ID, APPLE_API_ISSUER/);
    expect(() => macSigning(notary)).toThrow(/no certificate/);
  });

  it("never echoes secret values in errors", () => {
    try {
      macSigning({ APPLE_API_KEY: "SECRET-VALUE" });
    } catch (error) {
      expect(String(error)).not.toContain("SECRET-VALUE");
    }
  });
});
