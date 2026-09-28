// Dev-only URL boot for the scenario picker and screenshot capture. Production always
// starts at the First Breach briefing on its curated seed with fortune on (gameStore).
//
//   ?scenario=emberFord    pick a scenario (id or camelCase name)
//   &fortune=off &seed=7   battle setup
//   &stage=deploy|command|report|outcome   fast-forward (orders: &plan=intended|bad)
//   &select=<squadId>      select a squad
//   &still=1               no idle camera drift (captures)
import { scenarios, type EngineScenario } from "../game/engine";
import { useGame, type Stage } from "./game/gameStore";
import { useAppStore } from "./store";

export interface BootOptions {
  still: boolean;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function findScenario(key: string | null): EngineScenario | undefined {
  return key ? scenarios.find((item) => normalize(item.id) === normalize(key)) : undefined;
}

const ORDER: Stage[] = ["briefing", "deploy", "command", "report", "outcome"];

export function bootFromUrl(search: string): BootOptions {
  const params = new URLSearchParams(search);
  const scenario = findScenario(params.get("scenario"));
  const fortune = params.get("fortune");
  const seed = Number(params.get("seed"));
  const game = useGame.getState();

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
  for (let guard = 0; goal > 0 && guard < 50; guard += 1) {
    const now = useGame.getState();
    if (ORDER.indexOf(now.stage) >= goal) {
      break;
    }
    if (now.stage === "briefing") now.takeCommand();
    else if (now.stage === "deploy") now.confirmDeployment();
    else if (now.stage === "command") {
      const orders = plan === "bad" ? now.scenario.referencePlans?.bad : plan ? now.scenario.referencePlans?.intended : undefined;
      for (const [squadId, doctrineId] of Object.entries(orders ?? {})) now.assignDoctrine(squadId, doctrineId);
      now.sealOrders();
    } else if (now.stage === "report") {
      // Reaching "report" stops at the first report; "outcome" keeps playing phases.
      if (goal === ORDER.indexOf("report")) break;
      now.nextPhase();
    }
  }

  const select = params.get("select");
  if (select) {
    useAppStore.getState().selectSquad(select);
  }
  return { still: params.get("still") === "1" };
}
