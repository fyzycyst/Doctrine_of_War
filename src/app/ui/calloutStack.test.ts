import { describe, expect, it, vi } from "vitest";
import type { Callout } from "../game/gameStore";

vi.mock("@react-three/drei", () => ({ Html: () => null }));
vi.mock("@react-three/fiber", () => ({ useFrame: () => undefined, useThree: () => null }));

const { calloutStack } = await import("./PlaybackStage");

const at = (id: number, q: number, r: number): Callout => ({ id, kind: "rule", hex: { q, r }, faction: "free_banners", title: "", text: "", repeat: false, linger: 0 });

describe("callout stacking", () => {
  it("lifts a callout over older ones on the same or a neighbouring hex, not distant ones", () => {
    const callouts = [at(1, 2, 2), at(2, 3, 2), at(3, 5, 5), at(4, 2, 2)];
    expect(calloutStack(callouts, callouts[0])).toBe(0);
    expect(calloutStack(callouts, callouts[1])).toBe(1); // neighbour of 1
    expect(calloutStack(callouts, callouts[2])).toBe(0); // far away
    expect(calloutStack(callouts, callouts[3])).toBe(2); // over 1 and its neighbour 2
  });
});
