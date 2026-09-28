import App from "../App";
import { useFlow } from "./flow/flowStore";
import { TitleScreen } from "./flow/TitleScreen";

/**
 * The whole game: title → campaign map → battle → campaign map … → ending.
 * The battle screen is the command shell (App); the flow store picks the screen.
 */
export function Root({ still = false, pauseAt }: { still?: boolean; pauseAt?: string }) {
  const screen = useFlow((s) => s.screen);
  switch (screen) {
    case "title":
      return <TitleScreen />;
    case "battle":
      return <App still={still} pauseAt={pauseAt} />;
    case "campaign":
    case "ending":
      // Filled in by the campaign map and ending screens.
      return <TitleScreen />;
  }
}
