// The doctrine identity matrix (T17): every doctrine has a job it is best at.
import { describe, expect, it } from "vitest";
import { microBattles, runMicro } from "./identityKit";

const battle = (id: string) => microBattles.find((item) => item.id === id)!;
const STL = "shield_the_line";
const CC = "clean_counterstroke";
const HFD = "hold_for_dawn";

describe("doctrine identity matrix", () => {
  it("Shield the Line is the wall: best at holding against a supported line, and it bites", () => {
    const line = battle("supportedLine");
    const shield = runMicro(line, [STL, STL]);
    const counter = runMicro(line, [CC, CC]);
    const endure = runMicro(line, [HFD, HFD]);
    expect(shield.bannerLoss).toBeLessThan(counter.bannerLoss);
    expect(shield.held).toBeGreaterThan(counter.held);
    expect(shield.net).toBeGreaterThan(counter.net);
    // The braced riposte: attackers pay more against the wall than against any other brace.
    expect(shield.hostLoss).toBeGreaterThan(endure.hostLoss + 30);
  });

  it("Clean Counterstroke is the opportunist: best against a lone crosser", () => {
    const lone = battle("loneCrosser");
    const shield = runMicro(lone, [STL]);
    const counter = runMicro(lone, [CC]);
    expect(counter.hostLoss).toBeGreaterThan(shield.hostLoss + 30);
    expect(counter.net).toBeGreaterThan(shield.net);
  });

  it("on a mixed front the right mix beats either doctrine alone, and the wrong mix is worst", () => {
    const front = battle("mixedFront");
    const net = (doctrineIds: string[]) => runMicro(front, doctrineIds).net;
    const right = net([STL, CC]);
    expect(right).toBeGreaterThan(net([STL, STL]));
    expect(right).toBeGreaterThan(net([CC, CC]));
    expect(net([CC, STL])).toBeLessThan(Math.min(net([STL, STL]), net([CC, CC])));
  });
});
