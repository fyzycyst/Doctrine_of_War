// T25 §1: Escape deselects the company, battle-wide, while placing (deploy) or ordering
// (command). One layer per press: the layers above handle Escape first and stop it here:
//   - a coach mark (capture phase, skips the guide), an open dialog (How to Play, Settings,
//     a confirmation: native <dialog> cancel), the hand (focus back to the company's tab);
//   - otherwise the selection clears, which also drops a muster in progress (the selected
//     company is the armed muster; nothing else is pending).
// Playback keeps Escape as "skip the phase" (Playback.tsx); this hook is idle then.
import { useEffect } from "react";
import { useGame } from "../game/gameStore";
import { useAppStore } from "../store";
import { pressed } from "../shortcuts";

export function useEscapeDeselects() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!pressed("deselect", event) || event.defaultPrevented) return;
      const stage = useGame.getState().stage;
      if (stage !== "deploy" && stage !== "command") return;
      if (document.querySelector("dialog[open]")) return;
      const app = useAppStore.getState();
      const squadId = app.selectedSquadId;
      if (!squadId) return;
      app.selectSquad(null);
      // Never strand keyboard focus on the page: land on the company's roster tab.
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) {
        document.querySelector<HTMLElement>(`[data-squad="${CSS.escape(squadId)}"]`)?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
