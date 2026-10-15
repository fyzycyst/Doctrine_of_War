// The notices are built from the bundle's own module ids; these pin how an id maps to its package.
import { describe, expect, it } from "vitest";
import { noticesText, packageOf } from "./thirdPartyNotices";

describe("packageOf", () => {
  it("finds the package a bundled module or asset belongs to", () => {
    expect(packageOf("/repo/node_modules/three/build/three.module.js")).toEqual({ name: "three", dir: "/repo/node_modules/three" });
    expect(packageOf("node_modules/three/build/three.module.js")).toEqual({ name: "three", dir: "node_modules/three" });
    expect(packageOf("/repo/node_modules/@react-three/fiber/dist/index.js?v=1")).toEqual({ name: "@react-three/fiber", dir: "/repo/node_modules/@react-three/fiber" });
    expect(packageOf("\0/repo/node_modules/react/index.js?commonjs-proxy")?.name).toBe("react");
    expect(packageOf("node_modules/@fontsource/cinzel/files/cinzel-latin-400-normal.woff2")?.name).toBe("@fontsource/cinzel");
  });

  it("takes the innermost package of a nested dependency", () => {
    expect(packageOf("/repo/node_modules/@react-three/drei/node_modules/three-stdlib/index.js")).toEqual({
      name: "three-stdlib",
      dir: "/repo/node_modules/@react-three/drei/node_modules/three-stdlib",
    });
  });

  it("ignores the game's own code", () => {
    expect(packageOf("/repo/src/app/Root.tsx")).toBeNull();
    expect(packageOf("\0vite/preload-helper.js")).toBeNull();
  });
});

describe("noticesText", () => {
  it("lists each package with its licence and text", () => {
    const text = noticesText([{ name: "three", version: "0.180.0", licence: "MIT", text: "The MIT License\n\nCopyright © 2010-2025 three.js authors" }]);
    expect(text).toMatch(/^Doctrine of War: third-party notices/);
    expect(text).toContain("three 0.180.0\nLicence: MIT");
    expect(text).toContain("Copyright © 2010-2025 three.js authors");
  });
});
