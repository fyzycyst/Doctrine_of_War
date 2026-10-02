// Dev and captures only (`?mockRoll=…`): installs the stand-in Roll (src/app/roll/fake.ts)
// and the preview packs, so the Roll screens can be seen before the engine's land.
//   mockRoll=1      the preview campaign, no saved run (plus one run this build cannot continue)
//   mockRoll=worn   a run in progress with Worn, Reforming and carried companies on the Roll
//   mockRoll=carry  the intro completed, so starting the preview offers carry-over
import { ashAndBanner, startCampaign, type CampaignSaveRead, type CampaignState } from "../../game/campaign";
import { createRegistry } from "../../game/packs";
import { campaignAfter } from "../flow/devCampaign";
import { useFlow } from "../flow/flowStore";
import { installRollApi } from "./api";
import { fakeRoll, memoryRuns } from "./fake";
import { causewayPreview, cinderRoadPreview, previewPacks, PREVIEW_CAMPAIGN_ID } from "./fixtures";

/** A preview run with a lived-in Roll: one company Worn, one Reforming, a carried veteran. */
export function wornRun(): CampaignState {
  const start = startCampaign(cinderRoadPreview, {
    carryOver: [
      { id: "greyford_shields", name: "Greyford Shields", role: "frontline", profile: { strength: 84, cohesion: 74 }, resolve: 2, renown: { title: "The Iron Hinge" }, from: { packId: "first_call", campaignId: "ash_and_banner" } },
    ],
  });
  const companies = fakeRoll.rollFor(cinderRoadPreview, start).map((entry) => ({ ...entry.company }));
  const condition: Record<string, "worn" | "reforming"> = { cr_saltgate_pikes: "worn", cr_dawnward_lances: "reforming", cr_fenmere_bowmen: "worn" };
  return { ...start, companies: companies.map((company) => ({ ...company, condition: condition[company.id] ?? "fresh", ...(company.id === "cr_dawnward_lances" ? { resolve: -2 } : {}) })) };
}

export function bootMockRoll(mode: string) {
  const registry = createRegistry(previewPacks);
  const seed: Record<string, CampaignSaveRead> = {
    [causewayPreview.id]: {
      kind: "unavailable",
      reason: "This run was played on a different edition of The First Call (preview) (content 2).",
      provenance: { packId: "first_call_preview", campaignId: causewayPreview.id, contentRevision: 2, rulesRevision: 1 },
    },
  };
  if (mode === "worn") {
    seed[PREVIEW_CAMPAIGN_ID] = {
      kind: "ok",
      state: wornRun(),
      provenance: { packId: "first_call_preview", campaignId: PREVIEW_CAMPAIGN_ID, contentRevision: 1, rulesRevision: 1 },
    };
  }
  installRollApi({ roll: fakeRoll, registry, runs: memoryRuns(registry, seed) });
  if (mode === "carry") {
    const done = campaignAfter(ashAndBanner, ashAndBanner.battles.length, { fortune: "on" });
    useFlow.setState({ save: "valid", saved: done });
  }
}
