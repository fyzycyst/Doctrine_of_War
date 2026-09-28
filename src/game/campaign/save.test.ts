import { describe, expect, it } from "vitest";
import { playBattle } from "../engine/balance";
import { firstBreach } from "../engine/scenarios/firstBreach";
import { applyCampaign, recordBattle, startCampaign } from "./campaign";
import { ashAndBanner } from "./definition";
import { CampaignSaveError, loadCampaign, MAX_SAVE_BYTES, saveCampaign, SAVE_VERSION } from "./save";
import type { CampaignState } from "./types";

function afterTutorial(): CampaignState {
  const state = startCampaign(ashAndBanner);
  const scenario = applyCampaign(ashAndBanner, state, firstBreach);
  const final = playBattle(scenario, firstBreach.referencePlans!.intended, firstBreach.curatedSeed!, "on");
  return recordBattle(ashAndBanner, state, final);
}

const envelope = (campaign: unknown) => JSON.stringify({ version: SAVE_VERSION, campaign });

describe("campaign saves", () => {
  it("round-trips a real campaign exactly", () => {
    const state = afterTutorial();
    const json = saveCampaign(state);
    expect(JSON.parse(json).version).toBe(1);
    expect(loadCampaign(json, ashAndBanner)).toEqual(state);
    expect(loadCampaign(json)).toEqual(state);
  });

  it("round-trips a fresh campaign", () => {
    const state = startCampaign(ashAndBanner);
    expect(loadCampaign(saveCampaign(state), ashAndBanner)).toEqual(state);
  });

  describe("fails closed on malformed input", () => {
    const good = afterTutorial();
    const cases: [string, unknown][] = [
      ["not a string", 42],
      ["not JSON", "{campaign"],
      ["a JSON array", "[]"],
      ["no version", JSON.stringify({ campaign: good })],
      ["a future version", JSON.stringify({ version: 2, campaign: good })],
      ["no campaign", JSON.stringify({ version: 1 })],
      ["Resolve out of range", envelope({ ...good, companies: [{ ...good.companies[0], resolve: 4 }] })],
      ["fractional Resolve", envelope({ ...good, companies: [{ ...good.companies[0], resolve: 1.5 }] })],
      ["a bad company id", envelope({ ...good, companies: [{ ...good.companies[0], id: "../etc/passwd" }] })],
      ["an unknown role", envelope({ ...good, companies: [{ ...good.companies[0], role: "dragon" }] })],
      ["duplicate companies", envelope({ ...good, companies: [good.companies[0], good.companies[0]] })],
      ["a missing field", envelope({ ...good, companies: [{ ...good.companies[0], casualties: undefined }] })],
      ["a bad outcome", envelope({ ...good, history: [{ ...good.history[0], outcome: "triumph" }] })],
      ["a negative battle index", envelope({ ...good, battleIndex: -1 })],
      ["an unknown status", envelope({ ...good, status: "paused" })],
      ["oversized", envelope({ ...good, padding: "x".repeat(MAX_SAVE_BYTES) })],
    ];
    for (const [label, input] of cases) {
      it(`rejects ${label}`, () => {
        expect(() => loadCampaign(input, ashAndBanner)).toThrow(CampaignSaveError);
      });
    }

    it("rejects saves that do not fit this campaign", () => {
      expect(() => loadCampaign(envelope({ ...good, campaignId: "other_war" }), ashAndBanner)).toThrow(/campaignId/);
      expect(() => loadCampaign(envelope({ ...good, battleIndex: 9 }), ashAndBanner)).toThrow(/battleIndex/);
      expect(() => loadCampaign(envelope({ ...good, status: "complete" }), ashAndBanner)).toThrow(/does not match/);
      const stranger = { ...good.companies[0], id: "hired_blades" };
      expect(() => loadCampaign(envelope({ ...good, companies: [...good.companies, stranger] }), ashAndBanner)).toThrow(/unknown company/);
      expect(() => loadCampaign(envelope({ ...good, history: [{ ...good.history[0], battleId: "battle_9" }] }), ashAndBanner)).toThrow(/unknown battle/);
    });
  });

  it("drops unknown keys and cannot be used for prototype pollution", () => {
    const good = afterTutorial();
    const json = `{"version":1,"campaign":${JSON.stringify({ ...good, cheat: true }).slice(0, -1)},"__proto__":{"polluted":true}}}`;
    const loaded = loadCampaign(json, ashAndBanner);
    expect(loaded).toEqual(good);
    expect(Object.keys(loaded)).toEqual(["campaignId", "battleIndex", "status", "companies", "history"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses to write an oversized save", () => {
    const huge = { ...startCampaign(ashAndBanner), campaignId: "x".repeat(MAX_SAVE_BYTES) };
    expect(() => saveCampaign(huge)).toThrow(CampaignSaveError);
  });
});
