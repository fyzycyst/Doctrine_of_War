import { describe, expect, it } from "vitest";
import { parseCaptureShot } from "./captureParams";

describe("dev capture shot (?captureShot=q,r;q,r&captureAz=deg)", () => {
  it("reads the hexes and an optional azimuth", () => {
    expect(parseCaptureShot("?captureShot=7,3;8,3&captureAz=-55")).toEqual({ hexes: [{ q: 7, r: 3 }, { q: 8, r: 3 }], azimuth: -55 });
    expect(parseCaptureShot("?captureShot=5,5")).toEqual({ hexes: [{ q: 5, r: 5 }], azimuth: undefined });
  });

  it("reads an optional distance and polar angle (closer or steeper beats for the video)", () => {
    expect(parseCaptureShot("?captureShot=2,5;3,4&captureAz=-10&captureDist=4.5&capturePolar=50")).toEqual({
      hexes: [{ q: 2, r: 5 }, { q: 3, r: 4 }],
      azimuth: -10,
      distance: 4.5,
      polar: 50,
    });
    expect(parseCaptureShot("?captureShot=2,5&captureDist=-1")).toEqual({ hexes: [{ q: 2, r: 5 }], azimuth: undefined });
  });

  it("ignores a missing or malformed shot", () => {
    expect(parseCaptureShot("")).toBeNull();
    expect(parseCaptureShot("?captureShot=")).toBeNull();
    expect(parseCaptureShot("?captureShot=x,y")).toBeNull();
    expect(parseCaptureShot("?captureShot=7,3&captureAz=north")).toEqual({ hexes: [{ q: 7, r: 3 }], azimuth: undefined });
  });
});
