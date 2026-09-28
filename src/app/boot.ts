// Dev-only URL boot for the scenario picker and screenshot capture. Production always
// starts at the title screen (flowStore); `?screen=campaign|ending` opens those in dev.
//
//   ?scenario=emberFord    pick a scenario (id or camelCase name)
//   &fortune=off &seed=7   battle setup
//   &stage=deploy|command|resolving|report|outcome   fast-forward (orders: &plan=intended|bad)
//   &phase=2               which phase to stop in (command, resolving, report)
//   &pauseAt=rule|rule-mine|surge|rout|…   freeze playback on the first callout of that kind
//   &select=<squadId>      select a squad
//   &still=1               no idle camera drift (captures)
import { scenarios, type EngineScenario } from "../game/engine";
import { useFlow } from "./flow/flowStore";
import { useGame, type Stage } from "./game/gameStore";
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
  if (screen === "title" || screen === "campaign" || screen === "ending") {
    useFlow.getState().go(screen);
  }

  const select = params.get("select");
  if (select) {
    useAppStore.getState().selectSquad(select);
  }
  return { still: params.get("still") === "1", pauseAt: params.get("pauseAt") ?? undefined };
}
