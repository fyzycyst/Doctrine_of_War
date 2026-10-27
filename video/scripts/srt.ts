// `npm run srt`: captions for both cuts, timed from the actual VO lengths, into
// $DOW_VIDEO_DIR/out/. The vertical cut gets its own file only if its line breaks differ.
import fs from "node:fs";
import path from "node:path";
import { cues, LINE_LENGTH, toSrt } from "../src/captions";
import { buildTimeline, type Media } from "../src/timeline";
import { GENERATED, OUT_DIR } from "./paths";

const media = JSON.parse(fs.readFileSync(GENERATED, "utf8")) as Media;
const timeline = buildTimeline(media, { intro: process.env.INTRO !== "0" });
fs.mkdirSync(OUT_DIR, { recursive: true });
const main = toSrt(cues(timeline, LINE_LENGTH.main));
const vertical = toSrt(cues(timeline, LINE_LENGTH.vertical));
fs.writeFileSync(path.join(OUT_DIR, "doctrine-of-war.srt"), main);
console.log(`wrote ${path.join(OUT_DIR, "doctrine-of-war.srt")}`);
const verticalFile = path.join(OUT_DIR, "doctrine-of-war-vertical.srt");
if (vertical !== main) {
  fs.writeFileSync(verticalFile, vertical);
  console.log(`wrote ${verticalFile}`);
} else fs.rmSync(verticalFile, { force: true });
