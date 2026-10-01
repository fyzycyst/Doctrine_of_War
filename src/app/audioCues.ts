// Music and drum cues from where the player is (T19, wiring T20's audio). The menus
// (title, campaign map, ending) pin the "dusk" score; a battle releases it so the score
// follows the battle's time of day. The war drums rest low in a command window and rise
// while a phase plays.
import { DRUM_BASE, setDrumIntensity, setMusic } from "../audio";
import { useFlow, type Screen } from "./flow/flowStore";
import { useGame, type Stage } from "./game/gameStore";

export const MENU_MOOD = "dusk" as const;

function music(screen: Screen) {
  setMusic(screen === "battle" ? undefined : MENU_MOOD);
}

function drums(stage: Stage) {
  if (stage === "resolving") setDrumIntensity(DRUM_BASE.playback);
  else if (stage === "command" || stage === "deploy") setDrumIntensity(DRUM_BASE.command);
}

/** Starts following the flow and the battle; returns the unsubscribe. */
export function startAudioCues(): () => void {
  music(useFlow.getState().screen);
  drums(useGame.getState().stage);
  const offFlow = useFlow.subscribe((state, previous) => {
    if (state.screen !== previous.screen) music(state.screen);
  });
  const offGame = useGame.subscribe((state, previous) => {
    if (state.stage !== previous.stage) drums(state.stage);
  });
  return () => {
    offFlow();
    offGame();
  };
}
