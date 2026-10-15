// T25 §2: Call the Banners, clearer at a glance: the two column headings, "Takes" / "Flex"
// under each post (what it requires, from slot.roles), and "How the call works", an
// annotated overlay that opens by itself on the first visit only.
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cinderRoad, rollSlots, startCampaign } from "../../game/campaign";
import { registry } from "../../game/packs";
import { useFlow } from "../flow/flowStore";
import { CALL_HELP_COPY } from "../guide/CallHelp";
import { GUIDE_STORAGE_KEY, useGuide } from "../guide/guideStore";
import { ROLE_NAME } from "../ui/glyphs";
import { Root } from "../Root";

vi.mock("../../render/showcase/TitleScene", async () => ({ TitleScene: (await import("../flow/testKit")).FakeTitleScene }));
vi.mock("../ui/BattleBoard", () => ({ BattleBoard: () => null }));

const scenario = registry.scenario(cinderRoad.battles[0].scenarioId)!;
const slots = rollSlots(cinderRoad, startCampaign(cinderRoad), scenario);

function open() {
  cleanup();
  useFlow.setState({ screen: "roll", definition: cinderRoad, campaign: startCampaign(cinderRoad), notice: null });
  render(<Root />);
}

beforeEach(() => useGuide.setState({ callHelpSeen: true }));

describe("Call the Banners at a glance", () => {
  it("heads the post column and the company column separately", () => {
    open();
    expect(screen.getByRole("heading", { name: "The posts, in the order they act" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Company selection" })).toBeInTheDocument();
  });

  it("says what each post takes, from its roles: Takes for one, Flex for either of two", () => {
    open();
    const posts = screen.getAllByRole("button", { name: /^Post \d/ });
    expect(posts).toHaveLength(slots.length);
    slots.forEach((slot, index) => {
      const words = slot.roles.map((role) => ROLE_NAME[role]).join(" or ");
      expect(posts[index]).toHaveTextContent(slot.flex ? `Flex: ${words}` : `Takes: ${words}`);
    });
  });

  it("an empty post asks for what it takes, in the same words", async () => {
    const user = userEvent.setup();
    open();
    const flex = slots.findIndex((slot) => slot.flex);
    const label = (index: number) => screen.getAllByRole("button", { name: /^Clear / })[index];
    await user.click(label(0));
    await user.click(screen.getAllByRole("button", { name: /^Clear / })[flex - 1]);
    const choosers = screen.getAllByRole("button", { name: /^Company for / });
    expect(choosers[0]).toHaveTextContent(`Choose ${ROLE_NAME[slots[0].roles[0]].toLowerCase()}…`);
    expect(choosers[flex]).toHaveTextContent(`Choose ${slots[flex].roles.map((role) => ROLE_NAME[role].toLowerCase()).join(" or ")}…`);
  });
});

describe("How the call works", () => {
  it("opens by itself on the first visit only, remembered by the guide", async () => {
    const user = userEvent.setup();
    useGuide.setState({ callHelpSeen: false });
    open();
    const help = screen.getByRole("dialog", { name: "How the call works" });
    const notes = within(help).getAllByRole("listitem");
    expect(notes).toHaveLength(CALL_HELP_COPY.length);
    CALL_HELP_COPY.forEach((note, index) => expect(notes[index]).toHaveTextContent(`${index + 1} ${note.title}${note.body}`));
    expect(within(help).getByRole("button", { name: /Got it/ })).toHaveFocus();
    expect(localStorage.getItem(GUIDE_STORAGE_KEY)).toContain('"callHelpSeen":true');
    await user.click(within(help).getByRole("button", { name: /Got it/ }));
    expect(screen.queryByRole("dialog", { name: "How the call works" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How the call works" })).toHaveFocus();
    // The next visit: only on the button.
    open();
    expect(screen.queryByRole("dialog", { name: "How the call works" })).not.toBeInTheDocument();
  });

  it("opens from the (?) button and closes with Escape, the button again, or a click anywhere", async () => {
    const user = userEvent.setup();
    open();
    const button = screen.getByRole("button", { name: "How the call works" });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "How the call works" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "How the call works" })).not.toBeInTheDocument();
    expect(useFlow.getState().screen).toBe("roll");

    await user.click(button);
    await user.click(screen.getByRole("dialog", { name: "How the call works" }));
    expect(screen.queryByRole("dialog", { name: "How the call works" })).not.toBeInTheDocument();
    act(() => button.click());
    act(() => button.click());
    expect(screen.queryByRole("dialog", { name: "How the call works" })).not.toBeInTheDocument();
  });
});
