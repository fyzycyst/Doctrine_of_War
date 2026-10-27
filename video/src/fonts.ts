// Cinzel (titles, on-screen text) and Alegreya Sans (small print), from Fontsource as in the
// game (both SIL OFL 1.1). Frames wait until they have loaded.
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import { continueRender, delayRender } from "remotion";

const waiting = delayRender("Loading Cinzel and Alegreya Sans");
Promise.all(["500 40px Cinzel", "600 40px Cinzel", "700 40px Cinzel", "400 24px 'Alegreya Sans'", "500 24px 'Alegreya Sans'"].map((font) => document.fonts.load(font)))
  .then(() => continueRender(waiting))
  .catch((error) => {
    console.error(error);
    continueRender(waiting);
  });
