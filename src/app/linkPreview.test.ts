// T31: link previews (the FTLEnterprises.us game page, Skool, chat apps) read index.html's
// Open Graph and Twitter tags. og:image is absolute (crawlers need it) and 1200×630.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_URL } from "./about";

const html = readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
const meta = (key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

describe("link previews", () => {
  it("name the game, say what it is, and point at the web build and its preview image", () => {
    expect(meta("og:title")).toBe("Doctrine of War: Ash &amp; Banner");
    expect(meta("og:description")).toMatch(/never move a soldier/);
    expect(meta("og:url")).toBe(`${WEB_URL}/`);
    expect(meta("og:image")).toBe(`${WEB_URL}/og-image.png`);
    expect([meta("og:image:width"), meta("og:image:height")]).toEqual(["1200", "630"]);
    expect(meta("twitter:card")).toBe("summary_large_image");
    expect(meta("twitter:image")).toBe(meta("og:image"));
    expect(meta("description")).toBe(meta("og:description"));
  });
});
