// Downloads the CC0 KayKit figure pack used by the Look Lab's figure approach (b).
// Assets are gitignored; licenses are verified CC0 (see lab-assets/cc0/README.md).
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const RAW = "https://raw.githubusercontent.com/KayKit-Game-Assets";
const files = [
  [`${RAW}/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb`, "Knight.glb"],
  [`${RAW}/KayKit-Character-Pack-Adventures-1.0/main/LICENSE.txt`, "LICENSE-adventurers.txt"],
  [`${RAW}/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Warrior.glb`, "Skeleton_Warrior.glb"],
  [`${RAW}/KayKit-Character-Pack-Skeletons-1.0/main/LICENSE.txt`, "LICENSE-skeletons.txt"],
];

// Lab-only: served by the dev server at /lab-assets, never copied into a production build.
const outDir = path.resolve("lab-assets/cc0/kaykit");
await mkdir(outDir, { recursive: true });

for (const [url, name] of files) {
  const target = path.join(outDir, name);
  try {
    await access(target);
    console.log(`skip ${name} (exists)`);
    continue;
  } catch {
    // not downloaded yet
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log(`fetched ${name}`);
}
