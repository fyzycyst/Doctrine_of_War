// T25 §3: Skirmish and Choose a campaign dock their panel on the left and frame the islands
// on the right; hovering or focusing a card highlights its island (with its title), and a
// narrow window falls back to the centred panel.
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ashAndBanner } from "../../game/campaign";
import { registry } from "../../game/packs";
import type { CampaignSelectBackdropProps } from "../../render/showcase/CampaignSelectBackdrop";
import { Root } from "../Root";
import { useFlow } from "./flowStore";
import { memoryStore } from "./testKit";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("./testKit")).FakeTitleScene }));
vi.mock("../../render/showcase/CampaignSelectBackdrop", () => ({
  CampaignSelectBackdrop: ({ chains, highlightedId, framing, children }: CampaignSelectBackdropProps & { children?: ReactNode }) => (
    <div data-testid="backdrop" data-framing={framing ?? "center"} data-highlighted={highlightedId ?? ""} data-titles={chains.map((chain) => chain.title ?? "").join("|")}>
      {children}
    </div>
  ),
}));

const backdrop = () => screen.getByTestId("backdrop");

function open(at: "skirmish" | "campaigns", width = 1600) {
  cleanup();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  useFlow.setState({ screen: at, definition: ashAndBanner, campaign: null, save: "checking", saved: null, store: memoryStore(), runReads: {}, backupReads: {}, notice: null });
  render(<Root />);
}

afterEach(() => Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 }));

describe.each(["skirmish", "campaigns"] as const)("the %s menu", (at) => {
  it("docks its panel on the left and frames the islands on the right, each island titled", () => {
    open(at);
    expect(backdrop()).toHaveAttribute("data-framing", "right");
    expect(document.querySelector(".choice-panel")).toHaveClass("docked");
    const titles = backdrop().getAttribute("data-titles")!.split("|");
    expect(titles.every(Boolean)).toBe(true);
    if (at === "skirmish") expect(titles).toEqual(registry.skirmishes().map(({ skirmish }) => skirmish.title));
    else expect(titles).toEqual(registry.packs.flatMap((pack) => pack.campaigns.map((def) => def.title)));
  });

  it("highlights the island of the focused card, following Tab", async () => {
    const user = userEvent.setup();
    open(at);
    const cards = [...document.querySelectorAll<HTMLElement>(".choice-card")];
    // Before any hover or focus, the first card's island is lit.
    const first = backdrop().getAttribute("data-highlighted");
    expect(first).not.toBe("");
    // (Choose a campaign enables its buttons once each run has been read.)
    await vi.waitFor(() => expect(cards[1].querySelector("button")).toBeEnabled());
    act(() => cards[1].querySelector("button")!.focus());
    expect(backdrop().getAttribute("data-highlighted")).not.toBe(first);
    await user.tab({ shift: true });
    expect(backdrop().getAttribute("data-highlighted")).toBe(first);
  });

  it("falls back to the centred panel in a narrow window", () => {
    open(at, 900);
    expect(backdrop()).toHaveAttribute("data-framing", "center");
    expect(document.querySelector(".choice-panel")).not.toHaveClass("docked");
  });
});
