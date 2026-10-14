// electron-builder configuration (moved out of package.json so signing can be env-driven).
// See docs/RELEASE.md. With no signing env vars this builds unsigned DMGs, as before.
const { macSigning } = require("./scripts/mac-signing.cjs");

const signing = macSigning(process.env);
console.log(`[electron-builder] macOS build mode: ${signing.mode}`);

module.exports = {
  // The bundle identifier. Saves don't follow it: Electron's userData folder is named for the
  // app (productName), so it stays "Doctrine of War" (pinned by electron/appIdentity.test.ts).
  appId: "us.ftlenterprises.doctrine-of-war",
  productName: "Doctrine of War",
  copyright: "© 2026 FTL Enterprises",
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: ["dist/**/*", "dist-electron/**/*", "package.json", "!node_modules/**/*"],
  asar: true,
  // Electron's and Chromium's own licences, which electron-builder doesn't copy on macOS:
  // into Contents/Resources/licenses/, beside the game's (dist/licenses/ inside app.asar).
  extraResources: [
    { from: "node_modules/electron/dist/LICENSE", to: "licenses/Electron-LICENSE.txt" },
    { from: "node_modules/electron/dist/LICENSES.chromium.html", to: "licenses/LICENSES.chromium.html" },
  ],
  forceCodeSigning: signing.forceCodeSigning,
  mac: {
    category: "public.app-category.games",
    icon: "build/icon.icns",
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "dir", arch: ["arm64"] },
    ],
    ...signing.mac,
  },
};
