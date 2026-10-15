import { useEffect } from "react";
import { sameHex } from "../../game/board";
import { useGame } from "../game/gameStore";
import { useAppStore } from "../store";

/**
 * Board clicks during deployment. The Diorama's picking selects the clicked hex and
 * then the squad on it (or none). A click on an empty hex while one of your companies
 * is selected moves that company there; the company stays selected.
 *
 * Every pick writes a new hex object, so a pick is detected by identity, not by
 * coordinates: clicking the same hex again (say, after arming another company) still acts.
 */
export function useBoardDeployment() {
  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (!state.selectedHex || state.selectedHex === prev.selectedHex) {
          return;
        }
        const game = useGame.getState();
        const armed = prev.selectedSquadId;
        const mine = game.view.squads.find((squad) => squad.id === armed && squad.faction === game.view.viewer);
        if (game.stage !== "deploy" || !mine) {
          return;
        }
        const hex = state.selectedHex;
        const holder = game.view.squads.find((squad) => squad.hex && squad.status === "active" && sameHex(squad.hex, hex));
        if (holder?.faction === game.view.viewer) {
          return; // A click on another of your companies just selects it.
        }
        if (game.placeSquad(mine.id, hex).ok) {
          // Picking clears the squad selection after an empty-hex click; keep the placed company selected.
          queueMicrotask(() => useAppStore.getState().selectSquad(mine.id));
        }
      }),
    [],
  );
}
