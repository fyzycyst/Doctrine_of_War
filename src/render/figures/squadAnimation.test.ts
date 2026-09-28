import { describe, expect, it } from "vitest";
import { MAX_FIGURES, SquadAnimator, type AnimatorScene } from "./squadAnimation";

// A tiny fake scene: one squad on a line of hexes one unit apart in x.
function makeScene(alive = 7): AnimatorScene {
  return {
    squad: (id) =>
      id === "a" ? { anchor: { x: 0, y: 0.3, z: 0 }, facing: 0, alive, home: [-1, 0] } : undefined,
    hexWorld: (hex) => ({ x: hex.q, y: 0.3, z: hex.r }),
  };
}

function run(anim: SquadAnimator, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds; t += step) anim.tick(step);
}

describe("SquadAnimator", () => {
  it("march moves the anchor along the path and keeps it there", async () => {
    const anim = new SquadAnimator(makeScene());
    let done = false;
    const p = anim.march("a", [{ q: 1, r: 0 }, { q: 2, r: 0 }], { secondsPerHex: 0.5 }).then(() => (done = true));
    run(anim, 0.5);
    const mid = anim.squadPose("a")!.anchor!;
    expect(mid.x).toBeGreaterThan(0.5);
    expect(mid.x).toBeLessThan(1.5);
    run(anim, 0.6);
    await p;
    expect(done).toBe(true);
    anim.tick(0.016);
    expect(anim.squadPose("a")!.anchor!.x).toBeCloseTo(2);
  });

  it("fall topples exactly n of the lowest-ranked standing figures", async () => {
    const anim = new SquadAnimator(makeScene(7));
    const p = anim.fall("a", 2);
    run(anim, 2);
    await p;
    anim.tick(0.016);
    const faded = Array.from({ length: MAX_FIGURES }, (_, i) => anim.figurePose("a", i)!.fade);
    expect(faded.slice(0, 5).every((f) => f === 1)).toBe(true);
    expect(faded[5]).toBe(0);
    expect(faded[6]).toBe(0);
    // A second fall takes the next ones, never the already fallen.
    const q = anim.fall("a", 1);
    run(anim, 2);
    await q;
    anim.tick(0.016);
    expect(anim.figurePose("a", 4)!.fade).toBe(0);
    expect(anim.figurePose("a", 3)!.fade).toBe(1);
  });

  it("rout scatters and hides the whole squad; reset restores it", async () => {
    const anim = new SquadAnimator(makeScene());
    const p = anim.rout("a", { duration: 1 });
    run(anim, 0.5);
    const f = anim.figurePose("a", 0)!;
    expect(f.dx).toBeLessThan(0); // Host home edge is -x
    run(anim, 0.7);
    await p;
    anim.tick(0.016);
    expect(anim.squadPose("a")!.bannerFade).toBe(0);
    expect(anim.figurePose("a", 0)!.fade).toBe(0);
    anim.reset("a");
    expect(anim.squadPose("a")).toBeUndefined();
  });

  it("lunge, rally and brace return to rest and resolve", async () => {
    const anim = new SquadAnimator(makeScene());
    const all = Promise.all([anim.lunge("a", { q: 1, r: 0 }), anim.rally("a"), anim.brace("a", { hold: 0.2 })]);
    run(anim, 0.3);
    expect(anim.figurePose("a", 0)!.still).toBe(true);
    run(anim, 1.5);
    await all;
    anim.tick(0.016);
    const f = anim.figurePose("a", 0)!;
    expect(f.dx).toBe(0);
    expect(f.lean).toBe(0);
    expect(f.fade).toBe(1);
    expect(anim.activeCount).toBe(0);
  });

  it("unknown squads resolve immediately and timeScale 0 freezes tweens", async () => {
    const anim = new SquadAnimator(makeScene());
    await anim.rally("nobody");
    anim.timeScale = 0;
    void anim.lunge("a", { q: 1, r: 0 });
    run(anim, 2);
    expect(anim.activeCount).toBe(1);
  });
});

describe("playback controls", () => {
  it("setTimeScale / pause / resume without casts", async () => {
    const anim = new SquadAnimator(makeScene());
    anim.setTimeScale(0.5);
    let done = false;
    const p = anim.rally("a").then(() => (done = true));
    run(anim, 1);
    expect(done).toBe(false); // 0.5 s of rally time elapsed; it lasts 0.8 s
    anim.pause();
    run(anim, 5);
    expect(anim.activeCount).toBe(1);
    anim.resume();
    run(anim, 1);
    await p;
    expect(done).toBe(true);
  });

  it("shakeObjective reports an active hit, then resolves", async () => {
    const anim = new SquadAnimator(makeScene());
    const p = anim.shakeObjective({ q: 2, r: 0 }, 0.8);
    anim.tick(0.1);
    const [hit] = anim.activeShakes();
    expect(hit.at.x).toBe(2);
    expect(hit.intensity).toBeCloseTo(0.8);
    expect(hit.t).toBeCloseTo(0.1);
    run(anim, 2);
    await p;
    expect(anim.activeShakes()).toHaveLength(0);
  });

  it("reveal resolves figures from silhouette to colour and snaps the banner open", async () => {
    const anim = new SquadAnimator(makeScene(9));
    const p = anim.reveal("a");
    anim.tick(0.05);
    expect(anim.figurePose("a", 0)!.silhouette).toBeGreaterThan(0.9);
    expect(anim.squadPose("a")!.bannerColor).toBe(0);
    expect(anim.squadPose("a")!.bannerOpen).toBeLessThan(0.3);
    run(anim, 0.55);
    // Past the snap: the cloth overshoots open while its colour returns.
    run(anim, 0.2);
    expect(anim.squadPose("a")!.bannerOpen).toBeGreaterThan(1);
    run(anim, 1);
    await p;
    anim.tick(0.016);
    const pose = anim.squadPose("a")!;
    expect(pose.bannerOpen).toBe(1);
    expect(pose.bannerColor).toBe(1);
    for (let i = 0; i < MAX_FIGURES; i += 1) {
      expect(anim.figurePose("a", i)!.silhouette).toBe(0);
      expect(anim.figurePose("a", i)!.fade).toBe(1);
    }
  });
});
