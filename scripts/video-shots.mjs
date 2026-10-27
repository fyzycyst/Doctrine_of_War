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
//   focalX    where the action sits horizontally (0..1), for the 9:16 crop; "auto" measures it
//             from the in-world callouts on the captured frames (the most callout-time in the band)
//   focalOn   with "auto": a regex for the shot's key callouts, which count five times over
//   zoom      capture-only page zoom: the HTML overlay (rule callouts, UI) that much larger,
//             the 3D framing unchanged (2 on the callout shots: ~22 px callout text at 1080p)
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
    zoom: 2,
    // The script's First Breach Shields only brace (Shield the Line); "If an enemy bars the way →
    // Strike it" is Bring the Water. Cinder Road 1: the Coldwater Shields surge ("Heroic stand!")
    // and fire it, phase 3, beat 1.
    // Phase 1, beat 3: the Coldwater Shields at (2,5) strike the Mire Stalkers at (3,4).
    query: "scenario=cinderRoad1&stage=resolving&phase=1&plan=intended&still=1&capture=1&captureShot=2,5;3,4&captureAz=-15&captureDist=5.2",
    anchor: text("/coldwater shields[\\s\\S]{0,12}if an enemy bars the way/i"),
    lead: 1.8,
    seconds: 7,
    focalX: "auto",
    focalOn: "bars the way",
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
    id: "s03-orders",
    zoom: 1.5,
    // First Breach, the first orders window (the defaults: the Stoneford Riders start on Hold for
    // Dawn). Select the Riders, browse the hand, lift Clean Counterstroke and assign it (the wax
    // mark), then press the wax seal: the orders are sealed and playback begins.
    query: "scenario=firstBreach&stage=command&phase=1&still=1",
    warm: 45,
    cursor: true,
    actions: [
      { at: 0.4, click: '[data-squad="stoneford_riders"]', glide: 0.7 },
      { at: 2.3, hover: '.doctrine-card.in-hand[data-doctrine="hold_for_dawn"]', glide: 0.6 },
      { at: 3.6, hover: '.doctrine-card.in-hand[data-doctrine="clean_counterstroke"]', glide: 0.6 },
      { at: 5.0, click: '.doctrine-card.in-hand[data-doctrine="clean_counterstroke"]' },
      { at: 6.6, hover: ".wax-seal", glide: 0.8 },
      { at: 8.2, click: ".wax-seal" },
    ],
    start: 0,
    seconds: 12,
    focalX: 0.45,
    note: "UI, First Breach orders: select the Stoneford Riders, browse the hand, lift Clean Counterstroke, assign (wax mark), press the wax seal (8.2 s). The roster is at the left and the seal at the bottom right, so 9:16 cannot hold both: focalX follows the hand.",
  },
  {
    id: "s04-playback",
    zoom: 2,
    // First Breach, phase 1 playback over the gate approach: the Host attacks and charges, the
    // Shields brace, a rally; then "Heroic stand! Greyford Shields holds and strikes harder" and
    // the Ford Reavers break. Two parts of one run, hard cut at 5.5 s.
    query: "scenario=firstBreach&stage=resolving&phase=1&plan=intended&still=1&capture=1&captureShot=1,2;2,2;3,2;2,1&captureAz=-20&captureDist=9",
    warm: 0,
    parts: [
      { start: 0.0, seconds: 5.5 },
      { start: 19.8, seconds: 4.8 },
    ],
    focalX: "auto",
    focalOn: "heroic stand|broken",
    note: "First Breach playback, two parts (cut at 5.5 s): the Host strikes and charges, rule callouts fire; then 'Heroic stand! Greyford Shields holds and strikes harder' and 'Ford Reavers: Broken!'.",
  },
  {
    id: "s05-ember-ford",
    zoom: 2,
    // Ember Ford by night under fog: the orders are sealed at 1 s; the Unquenched (Pyre-Sworn, at
    // (3,1)) strike fear across the river ("They know that banner…", twice) and push for the far edge.
    query: "scenario=emberFord&stage=command&phase=1&plan=intended&still=1&capture=1&captureShot=3,1;4,1;5,2&captureAz=-20&captureDist=8",
    warm: 0,
    actions: [{ at: 1.0, js: sealIntended }],
    start: 0.4,
    seconds: 10,
    focalX: "auto",
    focalOn: "know that banner|unquenched",
    note: "Ember Ford at night, fog: 'They know that banner... The Unquenched' (twice) as the Pyre-Sworn push across the river.",
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
    focalX: "auto",
    focalOn: "broken|flee",
    note: "Two parts, hard cut at 4.4 s: (1) wide, night turns gold at sunrise; (2) close, the Hillfort Slingers counter-charge the Cinderram, 'Broken! They flee'.",
  },
  // s08: Cinder Road montage, three beats and the three joined (s08-cinder-road).
  {
    id: "s07-call-the-banners",
    zoom: 1.5,
    // Cinder Road's Call the Banners (battle 1, on in-memory saves): the posts start empty and the
    // companies are called one by one, each filling the first post it fits.
    query: "screen=roll&mockRoll=1&callHelp=seen",
    ready: "!!document.querySelector('.roll-screen .roll-company')",
    warm: 45,
    cursor: true,
    setup: `document.querySelectorAll(".post-clear").forEach((b) => b.click());`,
    actions: [1, 2, 3, 4, 5, 6].map((n, i) => ({ at: 0.6 + i * 1.25, click: `.roll-roster li:nth-child(${n}) .roll-company`, glide: 0.55 })),
    start: 0,
    seconds: 10,
    focalX: 0.5,
    note: "UI, Call the Banners: six companies called one by one into the empty posts (posts at the left, the Roll at the right).",
  },
  {
    id: "s08a-sluice-ram",
    zoom: 2,
    // Strike the Wagon Park, phase 2: the Kiln Ram drives down on the Sluice Walk, where the keepers stand.
    query: "scenario=cinderRoad2&stage=resolving&phase=2&plan=intended&still=1&capture=1&captureShot=5,0;5,1;6,1;7,0&captureAz=-30&captureDist=7",
    warm: 0,
    start: 4.0,
    seconds: 5.0,
    focalX: "auto",
    note: "Cinder Road 2: the Kiln Ram comes down on the Sluice Walk; the keepers brace before the sluice-house.",
  },
  {
    id: "s08b-wagon-park",
    zoom: 2,
    // Phase 3: the last blows on the wagon park (3 -> 0): it breaks into steam.
    query: "scenario=cinderRoad2&stage=resolving&phase=3&plan=intended&still=1&capture=1&captureShot=1,6;2,6&captureAz=-20&captureDist=6.5",
    warm: 0,
    start: 23.8,
    seconds: 5.2,
    focalX: "auto",
    focalOn: "wagon park",
    note: "Cinder Road 2: 'The Wagon Park 3 -> 0': the park breaks (carts over, pots doused, steam); its strength ring drains.",
  },
  {
    id: "s08c-harrying",
    zoom: 2,
    // Turn the Retreat (battle 4), phase 1: the Sunward Lances charge the fleeing column.
    query: "scenario=cinderRoad4&stage=resolving&phase=1&plan=intended&still=1&capture=1&captureShot=5,0;5,1&captureAz=-30&captureDist=6",
    warm: 0,
    // The caption bar ("… charged …") is UI, hidden with capture=1: anchor on the in-world callout.
    anchor: text("/sunward lances[\\s\\S]{0,60}counter-charge/i"),
    lead: 1.2,
    seconds: 5.0,
    focalX: "auto",
    focalOn: "sunward lances",
    note: "Turn the Retreat: the Sunward Lances counter-charge the fleeing column ('Sunward Lances charged Cinderwake Spears').",
  },
  {
    id: "s08-cinder-road",
    concat: ["s08a-sluice-ram", "s08b-wagon-park", "s08c-harrying"],
    focalX: "auto",
    note: "s08a + s08b + s08c joined with hard cuts (5.0 + 5.2 + 5.0 s): the ram at the Sluice Walk, the wagon park breaking, the lances harrying the column.",
  },
  {
    id: "s09-finale",
    zoom: 2,
    // Break the Strongpoint (battle 5, curated seed 58), phase 5: the Wickmere Standard rallies
    // the assault; then the last blows and "Greyford Gate 7 -> 0": the gate is breached. From the
    // attackers' side (-55), two parts of one run.
    query: "scenario=cinderRoad5&stage=resolving&phase=5&plan=intended&still=1&capture=1&captureShot=6,3;7,3;8,3&captureAz=-55&captureDist=8",
    warm: 0,
    parts: [
      { start: 5.4, seconds: 4.2 },
      { start: 17.6, seconds: 6.0 },
    ],
    focalX: "auto",
    focalOn: "rallied|greyford gate",
    note: "The finale, two parts (cut at 4.2 s): the assault rallied at the wall ('Rallied'), then 'Greyford Gate 7 -> 0': breached. Daylight under ash-wind (the battle's own hour), not nightfall.",
  },
  {
    id: "s10-editor",
    zoom: 1.5,
    // First Breach: the Dawnwatch Archers' Shield the Line, edited from the hand. Moving its second
    // order up and testing it in the field gives "Clearly better" (39 -> 54 wins in 80 battles,
    // the same fortunes; checked with the engine's own field test). The test runs in a Web
    // Worker, off the virtual clock: the timeline holds until the verdict lands.
    query: "scenario=firstBreach&stage=command&phase=1&still=1",
    warm: 45,
    cursor: true,
    actions: [
      { at: 0.4, click: '[data-squad="dawnwatch_archers"]', glide: 0.7 },
      { at: 2.0, click: ".hand-edit", glide: 0.6 },
      { at: 3.8, click: 'button[aria-label="Move order 2 up"]', glide: 0.7 },
      { at: 5.6, click: "text=Run the test", glide: 0.7 },
      { at: 6.5, waitFor: "document.querySelector('.field-test-verdict')" },
      // Ease the editor down to the win bars on the virtual clock (rAF and performance.now).
      {
        at: 7.6,
        js: `const bars = document.querySelector(".field-test-bars");
          let box = bars?.parentElement;
          while (box && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement;
          if (bars && box) {
            const from = box.scrollTop, by = bars.getBoundingClientRect().bottom + 24 - box.getBoundingClientRect().bottom, t0 = performance.now();
            const tick = () => { const k = Math.min(1, (performance.now() - t0) / 700); box.scrollTop = from + by * (1 - (1 - k) ** 3); if (k < 1) requestAnimationFrame(tick); };
            if (by > 0) requestAnimationFrame(tick);
          }`,
      },
    ],
    start: 0,
    seconds: 10,
    focalX: 0.27,
    note: "UI, the doctrine editor: Dawnwatch Archers' Shield the Line, 'Move order 2 up', Test in the field -> 'Clearly better' (68% vs 49% of 80 battles, 6.6 s), then eases down to the win bars (7.6 s). The test's progress is skipped (it runs off the frame clock). focalX holds the verdict's headline and line, not the whole editor.",
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
