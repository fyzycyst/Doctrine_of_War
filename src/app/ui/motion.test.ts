import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardCamera, usePrefersReducedMotion } from "./motion";

function mockMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return {
    set(next: boolean) {
      media.matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("usePrefersReducedMotion", () => {
  it("reads the preference and follows changes", () => {
    const media = mockMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it("defaults to motion when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});

describe("the board camera during playback (T19)", () => {
  const hex = { q: 2, r: 3 };
  it("stays anchored while a phase plays: no drift, and the acting company is ringed instead", () => {
    expect(boardCamera({ stage: "resolving", still: false, reducedMotion: false, focus: hex })).toEqual({ drift: false, emphasisHex: hex });
    expect(boardCamera({ stage: "resolving", still: false, reducedMotion: true, focus: null })).toEqual({ drift: false, emphasisHex: null });
  });

  it("drifts gently while planning (unless reduced motion or a still), with no emphasis ring", () => {
    expect(boardCamera({ stage: "command", still: false, reducedMotion: false, focus: hex })).toEqual({ drift: true, emphasisHex: null });
    expect(boardCamera({ stage: "command", still: false, reducedMotion: true, focus: null }).drift).toBe(false);
    expect(boardCamera({ stage: "deploy", still: true, reducedMotion: false, focus: null }).drift).toBe(false);
  });
});
