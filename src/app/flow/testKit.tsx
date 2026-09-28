// Test helpers for the app flow: an in-memory save store and stand-ins for the
// WebGL showcase scenes (jsdom has no WebGL).
import type { ReactNode } from "react";
import { applyCampaign, ashAndBanner, recordBattle, saveCampaign, startCampaign, type CampaignState, type SaveStore } from "../../game/campaign";
import { createInitialState, resolvePhase, scenarios, type EngineState, type Orders } from "../../game/engine";

/** Plays the campaign's current battle to its end (fortune off) with the given orders. */
export function playCurrentBattle(state: CampaignState, plan: "intended" | "bad" = "intended"): EngineState {
  const battle = ashAndBanner.battles[state.battleIndex];
  const scenario = applyCampaign(ashAndBanner, state, scenarios.find((item) => item.id === battle.scenarioId)!);
  const orders: Orders = scenario.referencePlans?.[plan] ?? {};
  let engine = createInitialState(scenario, { fortune: "off", seed: 1 });
  while (engine.status === "command") {
    engine = resolvePhase(engine, orders, scenario).state;
  }
  return engine;
}

/** A real campaign state after winning the tutorial (so it passes save validation). */
export function afterTutorial(): CampaignState {
  const start = startCampaign(ashAndBanner);
  return recordBattle(ashAndBanner, start, playCurrentBattle(start));
}

export function memoryStore(initial: string | null = null): SaveStore & { data: string | null } {
  const store = {
    data: initial,
    read: async () => store.data,
    write: async (data: string) => {
      store.data = data;
    },
  };
  return store;
}

export const savedStore = (state: CampaignState) => memoryStore(saveCampaign(state));

export function FakeTitleScene({ children }: { children?: ReactNode }) {
  return <div data-testid="title-scene">{children}</div>;
}

export function FakeCampaignMap({
  battles,
  onSelect,
  children,
}: {
  battles: { id: string; title: string; status: string }[];
  onSelect?: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <div data-testid="campaign-map">
      <ul aria-label="Islands">
        {battles.map((battle) => (
          <li key={battle.id}>
            <button type="button" data-status={battle.status} disabled={battle.status === "locked"} onClick={() => onSelect?.(battle.id)}>
              {battle.title}
            </button>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}
