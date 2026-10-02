// Dev-only URL boot for the scenario picker and screenshot capture. Production always
// starts at the title screen (flowStore); `?screen=campaign|ending` opens those in dev.
//
//   ?scenario=emberFord    pick a scenario (id or camelCase name)
//   &fortune=off &seed=7   battle setup
//   &stage=deploy|command|resolving|report|outcome   fast-forward (orders: &plan=intended|bad)
//   &phase=2               which phase to stop in (command, resolving, report)
//   &pauseAt=rule|rule-mine|surge|rout|…|stage   freeze playback on that callout (stage: the dawn moment)
//   &speed=N               fast-forward playback
//   &select=<squadId>      select a squad
//   &still=1               no idle camera drift (captures)
//   &guide=reset | &coach=select|read|assign|seal|watch|chronicle | &howto=1   guidance
import { scenarios, type EngineScenario } from "../game/engine";
import { campaignAfter } from "./flow/devCampaign";
import { useFlow } from "./flow/flowStore";
import { COACH_STEPS, useGuide, type CoachStep } from "./guide/guideStore";
import { useGame, type Stage } from "./game/gameStore";
import { bootMockRoll } from "./roll/devBoot";
import { cinderRoad } from "../game/campaign";
import { useSettings } from "./settingsStore";
import { useAppStore } from "./store";

export interface BootOptions {
  still: boolean;
  pauseAt?: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function findScenario(key: string | null): EngineScenario | undefined {
  return key ? scenarios.find((item) => normalize(item.id) === normalize(key)) : undefined;
}

const ORDER: Stage[] = ["briefing", "deploy", "command", "resolving", "report", "outcome"];

export function bootFromUrl(search: string): BootOptions {
  const params = new URLSearchParams(search);
  // `&mockRoll=1|carry|veterans|stale` (`&rollBattle=1`): Cinder Road on in-memory saves (see roll/devBoot.ts).
  const mockRoll = params.get("mockRoll");
  if (mockRoll) bootMockRoll(mockRoll, params.get("rollBattle") === "1");

  // `&skirmish=<id>`: that skirmish's briefing (a `seed` pins its fortune for captures).
  const skirmish = params.get("skirmish");
  if (skirmish) useFlow.getState().playSkirmish(skirmish);

  const scenario = findScenario(params.get("scenario"));
  const fortune = params.get("fortune");
  const seed = Number(params.get("seed"));
  const game = useGame.getState();

  // Any battle parameter skips the title and campaign map (dev and captures only).
  if (scenario || fortune || seed || params.get("stage")) {
    useFlow.getState().go("battle");
  }

  if (scenario || fortune || seed) {
    // Another scenario than the campaign's current battle is played standalone.
    const standalone = scenario !== undefined && scenario.id !== game.baseScenario.id;
    const target = standalone ? scenario : game.baseScenario;
    game.loadBattle(
      target,
      { fortune: fortune === "off" ? "off" : "on", seed: seed > 0 ? seed : (target.curatedSeed ?? 1) },
      "briefing",
      standalone ? null : game.campaign,
    );
  }

  // First-battle guidance (captures): `&guide=reset` starts it fresh; `&coach=<step>` jumps to a mark.
  if (params.get("guide") === "reset" || params.get("coach")) {
    useGuide.getState().reset();
  }
  const coach = params.get("coach") as CoachStep | null;
  if (coach && COACH_STEPS.includes(coach)) {
    useGuide.setState({ introSeen: true, step: coach });
  }
  if (params.get("howto") === "1") {
    useFlow.getState().setHowToOpen(true);
  }

  // `&motion=reduce|full`: the Settings motion override (reduced-motion QA).
  const motion = params.get("motion");
  if (motion === "reduce" || motion === "full") useSettings.getState().set({ motion });

  // `&speed=N`: fast-forward playback timers (captures of late moments).
  const speed = Number(params.get("speed"));
  if (speed > 0) useGame.setState({ playbackSpeed: speed });

  const stage = params.get("stage") as Stage | null;
  const goal = stage ? ORDER.indexOf(stage) : -1;
  const plan = params.get("plan");
  const phase = Math.max(1, Number(params.get("phase")) || 1);
  for (let guard = 0; goal > 0 && guard < 60; guard += 1) {
    const now = useGame.getState();
    const played = now.log.length;
    if (now.stage === "briefing") now.takeCommand();
    else if (now.stage === "deploy") {
      if (goal <= ORDER.indexOf("deploy")) break;
      now.confirmDeployment();
    } else if (now.stage === "command") {
      if (stage === "command" && played + 1 >= phase) break;
      const orders = plan === "bad" ? now.scenario.referencePlans?.bad : plan ? now.scenario.referencePlans?.intended : undefined;
      for (const [squadId, doctrineId] of Object.entries(orders ?? {})) now.assignDoctrine(squadId, doctrineId);
      now.sealOrders();
    } else if (now.stage === "resolving") {
      // Leave this phase's playback running; skip earlier ones.
      if (stage === "resolving" && played >= phase) break;
      now.finishPlayback();
    } else if (now.stage === "report") {
      if (stage === "report" && played >= phase) break;
      now.nextPhase();
    } else {
      break;
    }
  }

  const screen = params.get("screen");
  if (screen === "campaigns" || screen === "skirmish") {
    useFlow.getState().go(screen);
  } else if (screen === "roll" && mockRoll) {
    // Straight to Call the Banners on Cinder Road's current battle.
    void (async () => {
      const flow = useFlow.getState();
      await flow.chooseCampaign(cinderRoad.id);
      if (useFlow.getState().carryOver) await useFlow.getState().startRun(cinderRoad.id, null);
      const now = useFlow.getState();
      const battle = now.campaign && now.definition.battles[now.campaign.battleIndex];
      if (battle) now.openBattle(battle.id);
    })();
  } else if (screen === "title" || screen === "campaign" || screen === "ending") {
    // `&campaignAt=N`: a real campaign after N battles (fortune on, curated seeds), not saved.
    const flow = useFlow.getState();
    const played = Number(params.get("campaignAt")) || 0;
    if (screen !== "title") {
      const campaign = campaignAfter(flow.definition, played, { fortune: "on" });
      // `&complete=1`: preview the epilogue before the last battles exist.
      const complete = params.get("complete") === "1";
      useFlow.setState({
        campaign: complete ? { ...campaign, battleIndex: flow.definition.battles.length, status: "complete" } : campaign,
      });
    }
    flow.go(screen);
  }

  const select = params.get("select");
  if (select) {
    useAppStore.getState().selectSquad(select);
  }
  // `&hover=q,r`: a hovered hex, for the terrain chip capture (T19).
  const hover = params.get("hover")?.split(",").map(Number);
  if (hover?.length === 2 && hover.every(Number.isFinite)) useAppStore.getState().setHoveredHex({ q: hover[0], r: hover[1] });
  return { still: params.get("still") === "1", pauseAt: params.get("pauseAt") ?? undefined };
}
