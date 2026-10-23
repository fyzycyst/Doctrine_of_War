// The product video's shots (T34; annex A §0.2, script v3), for `npm run video`.
// Each shot is the real game on the dev server, frame-stepped on a virtual clock:
//   id        file name and manifest id (the Remotion edit reads these)
//   query     URL query (the dev boot: scenario, stage, phase, plan, capture=1 hides the UI,
//             captureShot/captureAz frame a close beat); `lab: true` loads the Look Lab instead
//   ready     page expression that says the scene is up (default: the battle board's probe)
//   anchor    page expression for the shot's key moment; the clip starts `lead` s before it
//   start     otherwise, seconds after ready to start
//   seconds   clip length: the §0.2 target plus ~1 s of handle at each end
//   actions   [{ at, js }]: page code run `at` s into the clip (UI shots)
//   focalX    where the action sits horizontally (0..1), for the 9:16 crop
// Clips: 1920x1080, 30 fps, H.264 yuv420p CRF 16, no audio.

/** innerText test, for anchors on in-world callouts and captions. */
const text = (re) => `${re}.test(document.body.innerText)`;
/** The game's stores in dev (window.__dow): move the real game on with the UI hidden. */
const game = "window.__dow.game.getState()";
/** Seal this command window with the scenario's intended orders (as the boot's plan=intended). */
const sealIntended = `const g = ${game}; for (const [s, d] of Object.entries(g.scenario.referencePlans?.intended ?? {})) g.assignDoctrine(s, d); ${game}.sealOrders();`;
/** Re-aim the capture camera mid-shot (the hook in src/render/camera/CaptureShot.tsx). */
const aim = (query) => `window.__captureAim(${JSON.stringify(query)})`;

export const SHOTS = [
  {
    id: "s01-cold-open",
    // The script's First Breach Shields only brace (Shield the Line); "If an enemy bars the way →
    // Strike it" is Bring the Water. Cinder Road 1: the Coldwater Shields surge ("Heroic stand!")
    // and fire it, phase 3, beat 1.
    // Phase 1, beat 3: the Coldwater Shields at (2,5) strike the Mire Stalkers at (3,4).
    query: "scenario=cinderRoad1&stage=resolving&phase=1&plan=intended&still=1&capture=1&captureShot=2,5;3,4&captureAz=-15&captureDist=5.2",
    anchor: text("/coldwater shields[\\s\\S]{0,12}if an enemy bars the way/i"),
    lead: 1.8,
    seconds: 7,
    focalX: 0.4,
    note: "Cinder Road 1 (not First Breach: its Shields carry Shield the Line). Close on the Coldwater Shields as 'If an enemy bars the way -> Strike it' fires and they strike.",
  },
  {
    id: "s02-title",
    // The title crane over First Breach at dusk, clean: no menu (capture=1), the lockup hidden.
    query: "screen=title&capture=1",
    ready: "!!document.querySelector('canvas')",
    warm: 75,
    setup: `document.querySelector('[aria-label^="DOCTRINE OF WAR"]')?.style.setProperty("display", "none");`,
    seconds: 9,
    focalX: 0.5,
    note: "Title crane over the island at dusk; no UI and no lockup (the edit adds it).",
  },
  {
    id: "s06-hold-for-dawn",
    // In phase 4's playback (predawn): finishing it opens the report and the hour turns to sunrise
    // (the light crossfades to gold over 2 s); the next phase's orders are sealed, the Host recoils
    // from the wall, and the Hillfort Slingers counter-charge the Cinderram at (5,5), which breaks.
    // Wide for the dawn, then a hard cut close on the charge.
    query: "scenario=holdForDawn&stage=resolving&phase=4&plan=intended&still=1&capture=1",
    actions: [
      { at: 1.0, js: `${game}.finishPlayback()` },
      { at: 3.4, js: `${game}.nextPhase()` },
      { at: 3.6, js: sealIntended },
      { at: 17.6, js: aim("captureShot=6,5;5,5&captureAz=-25&captureDist=6") },
    ],
    parts: [
      { start: 0.3, seconds: 4.4 },
      { start: 18.0, seconds: 5.0 },
    ],
    focalX: 0.5,
    note: "Two parts, hard cut at 4.4 s: (1) wide, night turns gold at sunrise; (2) close, the Hillfort Slingers counter-charge the Cinderram, 'Broken! They flee'.",
  },
  {
    id: "s11-end-card",
    // The campaign map: Ash & Banner's islands at dusk with the march between them, three battles
    // played so every island is revealed. Its camera holds still; the edit adds a slow push-in.
    query: "screen=campaign&campaignAt=3&capture=1",
    ready: "!!document.querySelector('canvas')",
    warm: 60,
    seconds: 11,
    focalX: 0.5,
    note: "The campaign map's archipelago at dusk, clean. The camera holds: add a slow push-in in the edit.",
  },
];
