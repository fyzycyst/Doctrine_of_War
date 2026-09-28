// macOS signing/notarization settings for electron-builder, derived ONLY from env vars
// that the user (or CI secrets) provide. Nothing here reads, prints or stores a secret:
// it only checks which variables are present.
//
//   CSC_LINK (+ CSC_KEY_PASSWORD) or CSC_NAME   Developer ID Application certificate
//   APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER   App Store Connect API key (notarytool)
//
// No env: identity null, exactly the unsigned local DMGs the project always built.
const NOTARY_VARS = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"];

const present = (env, name) => typeof env[name] === "string" && env[name].trim() !== "";

/**
 * `forceCodeSigning` makes a requested-but-impossible signature (wrong CSC_NAME, bad
 * .p12) fail the build; electron-builder otherwise skips signing with only a log line.
 * @returns {{ mode: "unsigned" | "signed" | "notarized", forceCodeSigning: boolean, mac: Record<string, unknown> }}
 */
function macSigning(env) {
  const signing = present(env, "CSC_LINK") || present(env, "CSC_NAME");
  const notaryCount = NOTARY_VARS.filter((name) => present(env, name)).length;
  if (notaryCount > 0 && notaryCount < NOTARY_VARS.length) {
    const missing = NOTARY_VARS.filter((name) => !present(env, name));
    throw new Error(`Notarization needs all of ${NOTARY_VARS.join(", ")}; missing ${missing.join(", ")}.`);
  }
  const notarize = notaryCount === NOTARY_VARS.length;
  if (notarize && !signing) {
    throw new Error("APPLE_API_* is set but no certificate (CSC_LINK or CSC_NAME): cannot notarize an unsigned app.");
  }
  if (!signing) {
    return { mode: "unsigned", forceCodeSigning: false, mac: { identity: null, notarize: false } };
  }
  return {
    mode: notarize ? "notarized" : "signed",
    forceCodeSigning: true,
    mac: {
      // identity left unset: electron-builder takes the certificate from CSC_LINK / CSC_NAME.
      hardenedRuntime: true,
      entitlements: "build/entitlements.mac.plist",
      entitlementsInherit: "build/entitlements.mac.plist",
      notarize,
    },
  };
}

module.exports = { macSigning, NOTARY_VARS };
