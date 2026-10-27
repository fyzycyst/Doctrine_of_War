// Keys the user's intro off its green background (a virtual background: a vertical gradient
// from a muted green at the top to a greyer green at the bottom), so the edit can set them in
// the game's world. Pre-keyed once into work/intro-keyed.mov (ProRes 4444 with alpha, 1920 wide,
// 30 fps); prepare-media remakes it when the clip changes.
//
// The key, in ffmpeg (geq), per pixel:
// - greenness d = G - max(R, B), against the background's own greenness at that row (measured
//   from the clip's edge columns, top and bottom, and taken as linear between): fully keyed
//   above 65% of it, solid below 10%. Skin, the black shirt, the gold motif and the glasses all
//   sit well below 0.
// - the soft segmentation edge is un-mixed from the background colour at that row, then
//   despilled (G ≤ (R+B)/2), so hair edges come out neutral rather than olive;
// - the matte is choked 3 px (the segmentation leaves a light rim on the hair) and feathered (blur σ 1).
import { execFileSync } from "node:child_process";

type Rgb = [number, number, number];
const greenness = ([r, g, b]: Rgb) => g - Math.max(r, b);

/** The background's colour at the top and the bottom rows, from the clip's left and right edges over a few frames. */
export function measureBackground(file: string, seconds: number): { top: Rgb; bottom: Rgb } {
  const w = 480;
  const samples: { top: Rgb[]; bottom: Rgb[] } = { top: [], bottom: [] };
  for (const at of [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => f * seconds)) {
    const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", `scale=${w}:-2`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
    const h = raw.length / (w * 3);
    const px = (x: number, y: number): Rgb => [raw[(y * w + x) * 3], raw[(y * w + x) * 3 + 1], raw[(y * w + x) * 3 + 2]];
    for (const x of [4, w - 5]) {
      samples.top.push(px(x, 2));
      samples.bottom.push(px(x, h - 3));
    }
  }
  const median = (list: Rgb[]): Rgb => [0, 1, 2].map((i) => list.map((c) => c[i]).sort((a, b) => a - b)[Math.floor(list.length / 2)]) as Rgb;
  return { top: median(samples.top), bottom: median(samples.bottom) };
}

/** Whether the clip's background is green enough to key (a plain backdrop is left as filmed). */
export const isGreenScreen = (background: { top: Rgb; bottom: Rgb }) => greenness(background.top) >= 8 && greenness(background.bottom) >= 8;

/** The ffmpeg filter graph: [0:v] in, keyed RGBA [k] out at `width` × `height`. */
export function keyGraph({ top, bottom }: { top: Rgb; bottom: Rgb }, width: number, height: number): string {
  const lerp = (a: number, b: number) => `(${a}+${b - a}*Y/H)`;
  const bg = [0, 1, 2].map((i) => lerp(top[i], bottom[i]));
  const dBg = lerp(greenness(top), greenness(bottom));
  // `\,` and `\;` are escaped for the filter graph; st()/ld() keep d and the mix in registers.
  const pixel = (c: string) => `${c}(X\\,Y)`;
  const prelude = `st(1\\,${pixel("g")}-max(${pixel("r")}\\,${pixel("b")}))\\;st(2\\,clip(1-ld(1)/${dBg}\\,0.05\\,1))\\;`;
  const unmix = (i: number, c: string) => `clip((${pixel(c)}-(1-ld(2))*${bg[i]})/ld(2)\\,0\\,255)`;
  const r = prelude + unmix(0, "r");
  const b = prelude + unmix(2, "b");
  const g = `${prelude}st(3\\,${unmix(0, "r")})\\;st(4\\,${unmix(2, "b")})\\;min(${unmix(1, "g")}\\,(ld(3)+ld(4))/2)`;
  const a = `255*clip((0.65*${dBg}-(${pixel("g")}-max(${pixel("r")}\\,${pixel("b")})))/(0.55*${dBg})\\,0\\,1)`;
  return [
    `[0:v]fps=30,scale=${width}:${height}:flags=lanczos,format=gbrap,geq=r=${r}:g=${g}:b=${b}:a=${a},split[c][m]`,
    "[m]alphaextract,erosion,erosion,erosion,gblur=sigma=1[a]",
    "[c][a]alphamerge,format=yuva444p10le[k]",
  ].join(";\n");
}
