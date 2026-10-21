// What the game says about itself (T31, 1.0): its version (kept equal to package.json by
// about.test.ts), its maker, where it is played, and what it is built from.
export const APP_VERSION = "1.0.0";
export const COPYRIGHT = "© 2026 FTL Enterprises";
export const WEB_URL = "https://doctrinegame.ftlenterprises.us";
export const RELEASES_URL = "https://github.com/fyzycyst/Doctrine_of_War/releases";
/** The game's section of the studio-wide privacy policy. */
export const PRIVACY_URL = "https://ftlenterprises.us/privacy#doctrine-of-war";

/** Every third-party thing the shipped game carries, with its licence (see CREDITS.md). The fonts'
 * licence texts ship in the build's licenses/ (public/licenses/), for the web and the Mac app. */
export const FONT_LICENCES = ["licenses/Cinzel-OFL-1.1.txt", "licenses/AlegreyaSans-OFL-1.1.txt"];
export const CREDITS: { what: string; who: string; licence: string }[] = [
  { what: "Orchestral samples: Versilian Studios Chamber Orchestra 2, Community Edition", who: "Versilian Studios", licence: "CC0 1.0" },
  { what: "Sound effects: Impact Sounds, Casino Audio, RPG Audio", who: "Kenney", licence: "CC0 1.0" },
  { what: "Typeface: Cinzel", who: "The Cinzel Project Authors", licence: "SIL Open Font License 1.1 (licenses/Cinzel-OFL-1.1.txt)" },
  {
    what: "Typeface: Alegreya Sans",
    who: "The Alegreya Sans Project Authors",
    licence: "SIL Open Font License 1.1 (licenses/AlegreyaSans-OFL-1.1.txt)",
  },
  { what: "three.js, React, React Three Fiber, drei, zustand", who: "their authors", licence: "MIT" },
  { what: "postprocessing", who: "Raoul van Rüschen", licence: "zlib" },
  { what: "Lucide icons", who: "Lucide contributors", licence: "ISC" },
  {
    what: "Their dependencies (troika, three-stdlib, camera-controls, MediaPipe Tasks, hls.js and others)",
    who: "their authors",
    licence: "MIT, ISC, Apache-2.0: every package and its licence text in licenses/THIRD_PARTY_NOTICES.txt",
  },
  { what: "Electron (the Mac app)", who: "OpenJS Foundation and contributors", licence: "MIT" },
];
