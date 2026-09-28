import { describe, expect, it } from "vitest";
import { ashAndBanner } from "./definition";
import { hashId, renownTitle } from "./titles";

describe("renown titles", () => {
  it("are deterministic per company id and read like 'The ...'", () => {
    for (const company of ashAndBanner.companies) {
      const title = renownTitle(company.id);
      expect(title).toBe(renownTitle(company.id));
      expect(title).toMatch(/^The [A-Z][A-Za-z -]+$/);
    }
    expect(hashId("greyford_shields")).toBe(hashId("greyford_shields"));
  });

  it("vary across companies", () => {
    const titles = new Set(ashAndBanner.companies.map((company) => renownTitle(company.id)));
    expect(titles.size).toBeGreaterThanOrEqual(5);
  });

  it("never hand out a title another company already holds", () => {
    const first = renownTitle("greyford_shields");
    const second = renownTitle("greyford_shields", [first]);
    expect(second).not.toBe(first);
    expect(renownTitle("greyford_shields", [first])).toBe(second);
  });
});
