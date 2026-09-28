import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("is reproducible for a seed and stays in [0, 1)", () => {
    const a = createRng(42);
    const b = createRng(42);
    const values = Array.from({ length: 100 }, () => a.next());
    expect(values).toEqual(Array.from({ length: 100 }, () => b.next()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBe(100);
  });

  it("differs across seeds and can resume from its state", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
    const rng = createRng(9);
    rng.next();
    const resumed = createRng(rng.state);
    expect(resumed.next()).toBe(rng.next());
  });
});
