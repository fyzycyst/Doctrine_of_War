import { describe, expect, it } from "vitest";
import { scenarios } from "../engine/scenarios";
import { emberFord } from "../engine/scenarios/emberFord";
import { firstBreach } from "../engine/scenarios/firstBreach";
import {
  applyCampaign,
  fameOf,
  HOST_RESOLVE_CAP,
  HOST_STRENGTH_CAP,
  hostEscalation,
  REFORMED_RESOLVE,
  startCampaign,
} from "./campaign";
import { ashAndBanner } from "./definition";
import { balanceRosters, balanceVariantsFor, curatedPathState, roughPathState } from "./rosters";
import type { CampaignCompany } from "./types";

const company = (resolve: number, renown = false): CampaignCompany => ({
  id: "c",
  name: "C",
  role: "frontline",
  resolve,
  renown: renown ? { title: "The Test" } : null,
  battlesFought: 0,
  casualties: { routed: 0, destroyed: 0 },
  reformed: 0,
});

describe("the Host has heard of you", () => {
  it("scales with fame relative to the authored roster, in small capped steps both ways", () => {
    expect(fameOf([company(3, true), company(-1)])).toBe(4);
    expect(hostEscalation([company(1)], 1)).toEqual({ fame: 0, strength: 0, resolve: 0 });
    expect(hostEscalation([company(3)], 0)).toEqual({ fame: 3, strength: 6, resolve: 0 });
    expect(hostEscalation([company(3, true)], 0)).toEqual({ fame: 5, strength: 10, resolve: 1 });
    expect(hostEscalation([company(3, true), company(3, true)], 0)).toEqual({ fame: 10, strength: HOST_STRENGTH_CAP, resolve: HOST_RESOLVE_CAP });
    expect(hostEscalation([company(-2), company(-1)], 1)).toEqual({ fame: -4, strength: -8, resolve: -1 });
    expect(hostEscalation([company(-3), company(-3), company(-3)], 0)).toEqual({ fame: -9, strength: -HOST_STRENGTH_CAP, resolve: -HOST_RESOLVE_CAP });
  });

  it("leaves the tutorial untouched: its founding companies are the authored roster", () => {
    const applied = applyCampaign(ashAndBanner, startCampaign(ashAndBanner), firstBreach);
    for (const squad of firstBreach.squads.filter((item) => item.faction === "ashen_host")) {
      expect(applied.squads.find((item) => item.id === squad.id)).toEqual(squad);
    }
  });
});

describe("reference rosters", () => {
  it("strong replays the curated path; rough reforms its best company and bruises the next two", () => {
    const strong = curatedPathState(ashAndBanner, scenarios, 1);
    expect(strong.battleIndex).toBe(1);
    expect(strong.history.map((entry) => [entry.battleId, entry.outcome, entry.seed])).toEqual([["tutorial", "victory", firstBreach.curatedSeed]]);
    const best = [...strong.companies].sort((a, b) => b.resolve - a.resolve)[0];
    const rough = roughPathState(ashAndBanner, scenarios, 1);
    expect(rough.companies.find((item) => item.id === best.id)).toMatchObject({ resolve: REFORMED_RESOLVE, renown: null, reformed: best.reformed + 1 });
    expect(rough.companies.filter((item) => item.resolve === -1)).toHaveLength(2);
  });

  it("checks baseline and strong in full and rough as a floor; the first battle only at baseline", () => {
    expect(balanceRosters(ashAndBanner, scenarios, 0).map((item) => item.kind)).toEqual(["baseline"]);
    const efVariants = balanceVariantsFor(ashAndBanner, scenarios, emberFord);
    expect(efVariants.map((item) => [item.kind, item.policy])).toEqual([
      ["baseline", "full"],
      ["strong", "full"],
      ["rough", "floor"],
    ]);
    expect(efVariants[0].scenario).toBe(emberFord);
    expect(efVariants[1].roster).toMatch(/Greyford Shields \+3/);
  });
});
