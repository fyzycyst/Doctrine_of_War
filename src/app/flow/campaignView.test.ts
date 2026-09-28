import { describe, expect, it } from "vitest";
import { ashAndBanner, recordBattle, startCampaign } from "../../game/campaign";
import { isPlayable, islandStatus, ledger, mapBattles } from "./campaignView";
import { campaignAfter, playCurrentBattle } from "./devCampaign";

const def = ashAndBanner;

describe("campaign map statuses", () => {
  it("starts with the tutorial current and everything after it locked", () => {
    const battles = mapBattles(def, startCampaign(def));
    expect(battles.map((battle) => battle.status)).toEqual(["current", "locked", "locked", "locked"]);
    expect(battles[0].board).toBeDefined();
    // Unbuilt battles get placeholder islands and say so.
    expect(battles[2]).toMatchObject({ placeholder: "saltmarsh", title: "The Saltmarsh Column (coming soon)" });
    expect(battles[3]).toMatchObject({ placeholder: "holdForDawn" });
  });

  it("marks a won battle and moves the current island on", () => {
    const state = campaignAfter(def, 1);
    expect(mapBattles(def, state).map((battle) => battle.status)).toEqual(["won", "current", "locked", "locked"]);
    expect(isPlayable(def, state, "battle_1")).toBe(true);
    expect(isPlayable(def, state, "tutorial")).toBe(false);
  });

  it("shows a lost battle as lost but still the one to fight", () => {
    const start = startCampaign(def);
    const lost = recordBattle(def, start, playCurrentBattle(def, start, { plan: "bad" }));
    expect(lost.history[0].outcome).toBe("defeat");
    expect(islandStatus(def, lost, 0)).toBe("lost");
    expect(isPlayable(def, lost, "tutorial")).toBe(true);
  });

  it("stops at an unbuilt battle: current, but not playable", () => {
    const state = campaignAfter(def, 2);
    expect(state.battleIndex).toBe(2);
    expect(islandStatus(def, state, 2)).toBe("current");
    expect(isPlayable(def, state, "battle_2")).toBe(false);
  });
});

describe("army ledger", () => {
  it("previews the companies a new campaign musters", () => {
    const { companies, mustering } = ledger(def, startCampaign(def));
    expect(mustering).toBe(true);
    expect(companies.map((company) => company.name)).toEqual(["Greyford Shields", "Dawnwatch Archers", "Mercy Standard", "Stoneford Riders"]);
  });

  it("lists the companies that have fought, with their Resolve carried over", () => {
    const state = campaignAfter(def, 1);
    const { companies } = ledger(def, state);
    const shields = companies.find((company) => company.id === "greyford_shields")!;
    expect(shields.battlesFought).toBe(1);
    expect(shields.resolve).toBe(state.companies.find((company) => company.id === "greyford_shields")!.resolve);
  });
});
