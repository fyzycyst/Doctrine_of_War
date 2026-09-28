// Test helpers for the app flow: an in-memory save store and stand-ins for the
// WebGL showcase scenes (jsdom has no WebGL).
import type { ReactNode } from "react";
import { ashAndBanner, saveCampaign, type CampaignState, type SaveStore } from "../../game/campaign";
import { campaignAfter } from "./devCampaign";

/** A real campaign state after winning the tutorial (so it passes save validation). */
export const afterTutorial = (): CampaignState => campaignAfter(ashAndBanner, 1);

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
