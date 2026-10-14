// Third-party notices (T31, the pre-public audit): a production build writes
// `licenses/THIRD_PARTY_NOTICES.txt` listing every npm package that is actually in the bundle
// (its modules, and assets such as the Fontsource fonts), each with its licence and the
// licence text from the package. Read from the build's own module list, so it covers exactly
// what ships, transitive dependencies included, with no extra dependency. The web build and
// the Mac app (which packs dist/) both carry it; the OFL texts sit beside it in licenses/.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export const NOTICES_FILE = "licenses/THIRD_PARTY_NOTICES.txt";

/** The node_modules package a module id or asset path belongs to (the innermost one), or null. */
export function packageOf(id: string): { name: string; dir: string } | null {
  // Ids may be absolute, relative to the project ("node_modules/…", asset names) or virtual ("\0…").
  const clean = id.replace(/^\0/, "").split("?")[0].replace(/\\/g, "/");
  const at = clean.lastIndexOf("node_modules/");
  if (at < 0 || (at > 0 && clean[at - 1] !== "/")) return null;
  const rest = clean.slice(at + "node_modules/".length).split("/");
  const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1] ?? ""}` : rest[0];
  if (!name || name.endsWith("/")) return null;
  return { name, dir: `${clean.slice(0, at)}node_modules/${name}` };
}

interface PackageNotice {
  name: string;
  version: string;
  licence: string;
  text: string;
}

const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

type Person = string | { name?: string; email?: string } | undefined;
const personName = (person: Person) => (typeof person === "string" ? person.replace(/\s*[<(].*$/, "") : (person?.name ?? ""));

/**
 * For a package that ships no licence file: who it is by, where it lives, and the standard
 * text of the licence its package.json declares (the MIT notice in full; others by reference).
 */
function declaredLicence(pkg: { name?: string; license?: unknown; author?: Person; repository?: string | { url?: string } }, licence: string): string {
  const author = personName(pkg.author);
  // An author given only as an address is a contact, not a name.
  const by = author && !author.includes("@") ? author : `the ${pkg.name} authors${author ? ` (${author})` : ""}`;
  const repository = typeof pkg.repository === "string" ? pkg.repository : (pkg.repository?.url ?? "");
  const lines = [`(The package ships no licence file; its package.json declares ${licence}.)`, `Copyright (c) ${by}${repository ? `, ${repository.replace(/^git\+/, "")}` : ""}`];
  if (licence === "MIT") lines.push("", MIT_TEXT);
  else lines.push(`The standard ${licence} text: https://spdx.org/licenses/${licence}.html`);
  return lines.join("\n");
}

function noticeFor(relativeOrAbsolute: string): PackageNotice | null {
  // A relative path is the project's (the build runs from its root).
  const dir = path.resolve(relativeOrAbsolute);
  const manifest = path.join(dir, "package.json");
  if (!existsSync(manifest)) return null;
  const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
    name?: string;
    version?: string;
    license?: string | { type?: string };
    author?: Person;
    repository?: string | { url?: string };
  };
  const licence = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "UNKNOWN");
  const files = readdirSync(dir).filter((file) => LICENCE_FILE.test(file)).sort();
  const text = files.map((file) => readFileSync(path.join(dir, file), "utf8").trim()).join("\n\n");
  return { name: pkg.name ?? path.basename(dir), version: pkg.version ?? "", licence, text: text || declaredLicence(pkg, licence) };
}

/** The notices text for these packages, by name. */
export function noticesText(notices: PackageNotice[]): string {
  const rule = "=".repeat(78);
  const head = [
    "Doctrine of War: third-party notices",
    "",
    "The game includes the following third-party software. Each is listed with its licence",
    "and the licence text from the package. The game's own code, art and music are",
    "© 2026 FTL Enterprises. The typefaces' SIL Open Font License texts are also in this folder.",
    "",
    `Packages: ${notices.length}`,
  ].join("\n");
  const body = notices.map((notice) => [rule, `${notice.name} ${notice.version}`, `Licence: ${notice.licence}`, rule, "", notice.text, ""].join("\n"));
  return [head, "", ...body].join("\n");
}

/** The Vite plugin: emits NOTICES_FILE alongside the bundle on every production build. */
export function thirdPartyNotices(): Plugin {
  return {
    name: "doctrine-of-war:third-party-notices",
    apply: "build",
    generateBundle(_options, bundle) {
      const dirs = new Map<string, string>();
      const add = (id: string) => {
        const found = packageOf(id);
        if (found && !dirs.has(found.name)) dirs.set(found.name, found.dir);
      };
      for (const item of Object.values(bundle)) {
        if (item.type === "chunk") Object.keys(item.modules).forEach(add);
        else (item.originalFileNames ?? []).forEach(add);
      }
      const notices = [...dirs.values()]
        .map(noticeFor)
        .filter((notice): notice is PackageNotice => notice !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      this.emitFile({ type: "asset", fileName: NOTICES_FILE, source: noticesText(notices) });
    },
  };
}
