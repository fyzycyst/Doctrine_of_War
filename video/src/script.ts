// Script v3, "the Chronicler" (LOCKED): the launch kit's video annex, §0.2. This file drives
// the whole timeline: shot order, on-screen text, the VO line at each shot and the target
// lengths. Edit §0.2 first, then mirror it here, so the captions match what is said.

export type ShotId =
  | "s01-cold-open"
  | "s02-title"
  | "s03-orders"
  | "s04-playback"
  | "s05-ember-ford"
  | "s06-hold-for-dawn"
  | "s07-call-the-banners"
  | "s08-cinder-road"
  | "s09-finale"
  | "s10-editor"
  | "s11-end-card";

/**
 * The score's stems (music/<stem>*.wav, from the render agent; see music/README.txt). Night
 * and the orders under dusk, the fighting under battle, the dawn swell where the light turns
 * at Hold for Dawn, and the victory sting under the end card.
 */
export type Stem = "dusk" | "battle" | "dawn" | "victory";

export interface VoLine {
  /** vo-01 … vo-10: the file name of the user's ElevenLabs take (vo/vo-NN.mp3). */
  id: string;
  /** Exactly as recorded: also the caption. */
  text: string;
  /** For the temporary macOS voice only: spelt as said, with pauses ([[slnc ms]]). */
  say?: string;
}

export interface Shot {
  id: ShotId;
  /** What the footage shows (§0.2's "Shot" column). */
  footage: string;
  /** Planned length in seconds: a minimum; a longer VO line stretches the shot. */
  target: number;
  /** On-screen text (kinetic type), if any. */
  text?: string;
  vo?: VoLine;
  /** How the shot is laid out: plain footage with text, the title lockup, or the end card. */
  layout?: "title" | "end";
  /** The score bed under this shot (the victory sting plays from the end card's start). */
  stem: Stem;
}

export const SHOTS: Shot[] = [
  {
    id: "s01-cold-open",
    footage: "Close on the Greyford Shields; the rule banner fires: If an enemy bars the way → Strike it (First Breach)",
    target: 5,
    text: "You never command a soldier.",
    stem: "dusk",
  },
  {
    id: "s02-title",
    footage: "The title crane over the island at dusk; lockup",
    target: 7,
    layout: "title",
    vo: {
      id: "vo-01",
      text: "I have outlived three kings, and every war they started. Only one still keeps me awake.",
      say: "I have outlived three kings, [[slnc 250]] and every war they started. [[slnc 400]] Only one still keeps me awake.",
    },
    stem: "dusk",
  },
  {
    id: "s03-orders",
    footage: "The UI: select a company, the doctrine hand, lift a card, the wax seal",
    target: 10,
    text: "Give orders. Seal them.",
    vo: {
      id: "vo-02",
      text: "We never moved our soldiers like pieces on a board. We gave each company its orders, and we sealed them.",
      say: "We never moved our soldiers like pieces on a board. [[slnc 350]] We gave each company its orders, [[slnc 200]] and we sealed them.",
    },
    stem: "dusk",
  },
  {
    id: "s04-playback",
    footage: "Playback: the Host marches, a clash, rule callouts firing, Heroic stand!",
    target: 9,
    text: "Every rule, in plain sight.",
    vo: {
      id: "vo-03",
      text: "Then we watched. Every order kept, or broken, in plain sight.",
      say: "Then we watched. [[slnc 350]] Every order kept, [[slnc 150]] or broken, [[slnc 150]] in plain sight.",
    },
    stem: "battle",
  },
  {
    id: "s05-ember-ford",
    footage: "Ember Ford by night: fog, the Pyre-Sworn stepping out of it, They know that banner…",
    target: 8,
    text: "Fog. Fear. Fortune.",
    vo: {
      id: "vo-04",
      text: "Fog hid the enemy. And the fear of famous banners crossed the river before they did.",
      say: "Fog hid the enemy. [[slnc 300]] And the fear of famous banners crossed the river before they did.",
    },
    stem: "battle",
  },
  {
    id: "s06-hold-for-dawn",
    footage: "Hold for Dawn: the light turns gold, the counter-charge",
    target: 7,
    vo: {
      id: "vo-05",
      text: "We held through the night, and struck when the light turned.",
      say: "We held through the night, [[slnc 200]] and struck when the light turned.",
    },
    stem: "dawn",
  },
  {
    id: "s07-call-the-banners",
    footage: "Call the Banners: companies filling their posts",
    target: 8,
    text: "Choose who answers the call.",
    vo: {
      id: "vo-06",
      text: "Then the war turned. And every war asks the same question: who answers the call?",
      say: "Then the war turned. [[slnc 350]] And every war asks the same question: [[slnc 250]] who answers the call?",
    },
    stem: "dawn",
  },
  {
    id: "s08-cinder-road",
    footage: "Cinder Road montage: the ram at the Sluice Walk, the wagon park breaking; Turn the Retreat: the lances charging the fleeing column",
    target: 13,
    text: "Cinder Road · five battles",
    vo: {
      id: "vo-07",
      text: "We broke their wagons, kept our own works standing, and harried the Host until its retreat became a rout.",
      say: "We broke their wagons, [[slnc 200]] kept our own works standing, [[slnc 200]] and harried the Host until its retreat became a rout.",
    },
    stem: "battle",
  },
  {
    id: "s09-finale",
    footage: "The finale: banners rallying at the wall, Greyford Gate breached at nightfall",
    target: 8,
    vo: {
      id: "vo-08",
      text: "And at Greyford Gate, our banners carried the assault into the Kept Coal.",
      say: "And at Grayford Gate, [[slnc 200]] our banners carried the assault into the Kept [[slnc 60]] Coal.",
    },
    stem: "battle",
  },
  {
    id: "s10-editor",
    footage: "The doctrine editor: reorder a rule → Test in the field → Clearly better",
    target: 8,
    text: "Test your doctrine across hundreds of battles.",
    vo: {
      id: "vo-09",
      text: "The wise commander tests his orders a hundred times, before he trusts them once.",
      say: "The wise commander tests his orders a hundred times, [[slnc 250]] before he trusts them once.",
    },
    stem: "dusk",
  },
  {
    id: "s11-end-card",
    footage: "End card over the archipelago",
    target: 9,
    layout: "end",
    vo: {
      id: "vo-10",
      text: "Doctrine of War. Ash and Banner. Choose your orders well.",
      say: "Doctrine of War. [[slnc 300]] Ash and Banner. [[slnc 900]] Choose your orders well.",
    },
    stem: "victory",
  },
];

/** The title lockup and the end card's lines. */
export const LOCKUP = { title: "Doctrine of War", subtitle: "Ash & Banner" };
export const END_CARD = [
  { label: "Play free in your browser", value: "doctrinegame.ftlenterprises.us" },
  { label: "Mac", value: "github.com/fyzycyst/Doctrine_of_War" },
];
export const COPYRIGHT = "© 2026 FTL Enterprises";

/** The user's own intro (10–20 s) goes here, after the cold open. A placeholder until spliced. */
export const INTRO = { after: "s01-cold-open" as ShotId, placeholderSeconds: 2 };
