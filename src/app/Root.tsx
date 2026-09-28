import { useEffect } from "react";
import App from "../App";
import { isCaptureToggle, useCaptureStore } from "./captureStore";
import { CampaignScreen } from "./flow/CampaignScreen";
import { EndScreen } from "./flow/EndScreen";
import { useFlow } from "./flow/flowStore";
import { DoctrineEditor } from "./variants/DoctrineEditor";
import { useVariants } from "./variants/variantStore";
import { TitleScreen } from "./flow/TitleScreen";
import { HowToPlay } from "./guide/HowToPlay";
import { SettingsDialog } from "./ui/SettingsDialog";

/**
 * The whole game: title → campaign map → battle → campaign map … → ending.
 * The battle screen is the command shell (App); the flow store picks the screen.
 */
export function Root({ still = false, pauseAt }: { still?: boolean; pauseAt?: string }) {
  const screen = useFlow((s) => s.screen);
  const settingsOpen = useFlow((s) => s.settingsOpen);
  const setSettingsOpen = useFlow((s) => s.setSettingsOpen);
  const howToOpen = useFlow((s) => s.howToOpen);
  const setHowToOpen = useFlow((s) => s.setHowToOpen);
  const openSettings = () => setSettingsOpen(true);
  const captureMode = useCaptureStore((s) => s.captureMode);
  const editor = useFlow((s) => s.editor);
  const setEditor = useFlow((s) => s.setEditor);
  // Doctrine variants (T16): read once; a broken store leaves the standard doctrines.
  useEffect(() => {
    if (useVariants.getState().status === "idle") void useVariants.getState().load();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isCaptureToggle(event)) {
        event.preventDefault();
        const capture = useCaptureStore.getState();
        capture.setCaptureMode(!capture.captureMode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {screen === "title" && <TitleScreen onSettings={openSettings} onHowTo={() => setHowToOpen(true)} onEditor={() => setEditor({})} />}
      {screen === "campaign" && <CampaignScreen onSettings={openSettings} />}
      {screen === "battle" && <App still={still} pauseAt={pauseAt} />}
      {screen === "ending" && <EndScreen />}
      {settingsOpen && !captureMode && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {howToOpen && !captureMode && <HowToPlay onClose={() => setHowToOpen(false)} />}
      {editor && !captureMode && <DoctrineEditor target={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
