// electron-builder configuration (moved out of package.json so signing can be env-driven).
// See docs/RELEASE.md. With no signing env vars this builds unsigned DMGs, as before.
const { macSigning } = require("./scripts/mac-signing.cjs");

const signing = macSigning(process.env);
console.log(`[electron-builder] macOS build mode: ${signing.mode}`);

module.exports = {
  appId: "com.modeleer.doctrine-of-war",
  productName: "Doctrine of War",
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: ["dist/**/*", "dist-electron/**/*", "package.json", "!node_modules/**/*"],
  asar: true,
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
