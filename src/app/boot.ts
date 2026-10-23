// Dev-only URL boot for the scenario picker and screenshot capture. Production always
// starts at the title screen (flowStore); `?screen=campaign|ending` opens those in dev.
//
//   ?scenario=emberFord    pick a scenario: any registry id (any case), or cinderRoad2 = a campaign's battle 2
//   &fortune=off &seed=7   battle setup
//   &stage=deploy|command|resolving|report|outcome   fast-forward (orders: &plan=intended|bad)
//   &phase=2               which phase to stop in (command, resolving, report)
//   &pauseAt=rule|rule-mine|surge|rout|…|stage   freeze playback on that callout (stage: the dawn moment)
//   &speed=N               fast-forward playback
//   &select=<squadId>      select a squad
//   &still=1               no idle camera drift (captures)
//   &guide=reset | &coach=<step> (COACH_STEPS: select … relief) | &howto=1   the tutorial and guidance
//   &help=play|doctrines|companies|call|modes|editor|controls|about   the Field Manual on a page (T26)
//   &callHelp=seen|open    Call the Banners' "How the call works" (T25)
import type { EngineScenario } from "../game/engine";
import { registry } from "../game/packs";
import { campaignAfter } from "./flow/devCampaign";
import { useFlow } from "./flow/flowStore";
import { COACH_STEPS, useGuide, type CoachStep } from "./guide/guideStore";
import { useGame, type Stage } from "./game/gameStore";
import { bootMockRoll } from "./roll/devBoot";
import { cinderRoad } from "../game/campaign";
import { HELP_PAGES } from "./guide/FieldManual";
import type { HelpPageId } from "./flow/flowStore";
import { useSettings } from "./settingsStore";
import { useAppStore } from "./store";

export interface BootOptions {
  still: boolean;
  pauseAt?: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * `?scenario=`: any scenario in the packs registry, by id (any case or punctuation:
 * `emberFord`, `cinder_road_wagon_park`), or a campaign battle by number (`cinderRoad2`).
 */
export function findScenario(key: string | null): EngineScenario | undefined {
  if (!key) return undefined;
  const wanted = normalize(key);
  const byId = registry.scenarios().find((item) => normalize(item.id) === wanted);
  if (byId) return byId;
  for (const pack of registry.packs) {
    for (const campaign of pack.campaigns) {
      const match = wanted.match(/^(.*?)(\d+)$/);
      if (!match || match[1] !== normalize(campaign.id)) continue;
      const battle = campaign.battles[Number(match[2]) - 1];
      if (battle && !battle.placeholder) return registry.scenario(battle.scenarioId);
    }
  }
  return undefined;
}

const ORDER: Stage[] = ["briefing", "deploy", "command", "resolving", "report", "outcome"];

/**
 * Dev and video capture only (T34): the stores on `window.__dow`, so a frame-stepped capture
 * (scripts/video-*.mjs) can move the real game on (next phase, seal) with the UI hidden.
 * Production builds drop it (`import.meta.env.DEV` is false there).
 */
export function exposeStoresForCapture(target: Record<string, unknown> = window as unknown as Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  target.__dow = { game: useGame, flow: useFlow, app: useAppStore, guide: useGuide };
}

export function bootFromUrl(search: string): BootOptions {
  exposeStoresForCapture();
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

  // A battle opened straight from the URL (dev, captures) shows no tutorial unless asked for
  // with `&guide=reset` or `&coach=<step>`. Not saved: the next visit is unaffected.
  const direct = Boolean(scenario || fortune || seed || params.get("stage") || skirmish || params.get("rollBattle"));
  if (direct && !params.get("guide") && !params.get("coach")) useGuide.setState({ off: true });

  // The tutorial (captures): `&guide=reset` starts it fresh; `&coach=<step>` jumps to a step.
  if (params.get("guide") === "reset" || params.get("coach")) {
    useGuide.getState().reset();
  }
  // `&callHelp=seen|open`: Call the Banners' "How the call works" already seen, or due to open (T25).
  const callHelp = params.get("callHelp");
  if (callHelp === "seen" || callHelp === "open") useGuide.setState({ callHelpSeen: callHelp === "seen" });
  const coach = params.get("coach") as CoachStep | null;
  if (coach && COACH_STEPS.includes(coach)) {
    useGuide.setState({ introSeen: true, step: coach });
  }
  if (params.get("howto") === "1") {
    useFlow.getState().setHowToOpen(true);
  }
  // `&help=<page>`: the Field Manual open on a page (T26 captures).
  const help = params.get("help");
  if (help && HELP_PAGES.some((page) => page.id === help)) useFlow.getState().openHelp(help as HelpPageId);

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
