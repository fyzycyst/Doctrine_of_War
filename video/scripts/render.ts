// `npm run render:main | render:vertical | render:all`: H.264 (CRF 16) with AAC audio into
// $DOW_VIDEO_DIR/out/. INTRO=0 drops the intro placeholder.
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { OUT_DIR, VIDEO_DIR } from "./paths";

const OUTPUT: Record<string, string> = { Main: "doctrine-of-war-1080p.mp4", Vertical: "doctrine-of-war-vertical.mp4" };
const ids = process.argv.slice(2);
if (ids.length === 0 || ids.some((id) => !OUTPUT[id])) {
  console.error(`usage: render.ts ${Object.keys(OUTPUT).join(" | ")} …`);
  process.exit(1);
}

const inputProps = { intro: process.env.INTRO !== "0" };
const serveUrl = await bundle({
  entryPoint: path.join(VIDEO_DIR, "src", "index.ts"),
  // public/ holds symlinks into the media folder: forwarded, not copied.
  onSymlinkDetected: () => {},
});
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id, inputProps });
  const outputLocation = path.join(OUT_DIR, OUTPUT[id]);
  let shown = -1;
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    codec: "h264",
    crf: 16,
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    audioBitrate: "320k",
    outputLocation,
    onProgress: ({ progress }) => {
      const step = Math.floor(progress * 10);
      if (step !== shown) {
        shown = step;
        process.stdout.write(`${id}: ${step * 10}%\n`);
      }
    },
  });
  console.log(`rendered ${outputLocation} (${(composition.durationInFrames / composition.fps).toFixed(1)} s, ${composition.width}x${composition.height})`);
}
