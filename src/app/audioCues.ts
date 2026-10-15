// Music and drum cues from where the player is (T19, wiring T20's audio). The menus
// (title, campaign map, ending) pin the "dusk" score; a battle releases it so the score
// follows the battle's time of day. The war drums rest low in a command window and rise
// while a phase plays.
import { clearAmbience, DRUM_BASE, setDrumIntensity, setMusic, unlockAudio } from "../audio";
import { useFlow, type Screen } from "./flow/flowStore";
import { useGame, type Stage } from "./game/gameStore";

export const MENU_MOOD = "dusk" as const;

function music(screen: Screen) {
  if (screen === "battle") {
    // The battle's own ambience (BattleBoard) brings back its beds and drums.
    setMusic(undefined);
    return;
  }
  // Menus (T24): the score without drums, and nothing left over from a battle.
  setMusic(MENU_MOOD);
  clearAmbience();
}

/**
 * Switches audio on as early as the platform allows (T24): at start-up in the
 * Mac app (its window allows autoplay), otherwise on the first click or key
 * anywhere in the app, so the menus are never silent. Returns the cleanup.
 */
export function installAudioUnlock(): () => void {
  const inElectron = typeof window !== "undefined" && "doctrineOfWar" in window;
  if (inElectron) {
    void unlockAudio();
    return () => {};
  }
  const go = () => {
    off();
    void unlockAudio();
  };
  const off = () => {
    window.removeEventListener("pointerdown", go, true);
    window.removeEventListener("keydown", go, true);
  };
  window.addEventListener("pointerdown", go, true);
  window.addEventListener("keydown", go, true);
  return off;
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
