import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstBreach } from "../../game/engine";
import { useFlow } from "../flow/flowStore";
import { memoryStore } from "../flow/testKit";
import { useGame } from "../game/gameStore";
import { useAppStore } from "../store";
import { DoctrineHand } from "../ui/DoctrineHand";
import { DoctrineEditor } from "./DoctrineEditor";
import type { FieldTestInput, FieldTestResult } from "./fieldTest";
import { useVariants } from "./variantStore";

// jsdom has no Web Workers: the field test's worker client is replaced with a controllable fake.
const fieldTests: { input: FieldTestInput; progress: (done: number, total: number) => void; finish: (result: FieldTestResult) => void; cancelled: boolean }[] = [];
vi.mock("./fieldTestClient", () => ({
  FieldTestCancelled: class extends Error {},
  startFieldTest: (input: FieldTestInput, progress: (done: number, total: number) => void) => {
    let finish!: (result: FieldTestResult) => void;
    const result = new Promise<FieldTestResult>((resolve) => (finish = resolve));
    const run = { input, progress, finish, cancelled: false };
    fieldTests.push(run);
    return { result, cancel: () => (run.cancelled = true) };
  },
}));

const rowLabels = () => screen.getAllByRole("listitem").filter((item) => item.dataset.rule).map((item) => item.dataset.rule);

beforeEach(async () => {
  cleanup();
  fieldTests.length = 0;
  useVariants.setState({ status: "ready", variants: [], notice: null, store: memoryStore() });
  useFlow.setState({ editor: null });
  act(() => useGame.getState().loadBattle(firstBreach, { seed: firstBreach.curatedSeed ?? 1, fortune: "on" }, "command"));
});

describe("the doctrine editor", () => {
  it("reorders orders from the keyboard (Alt + arrows) and warns about orders below Otherwise", async () => {
    const user = userEvent.setup();
    render(<DoctrineEditor target={{ baseId: "shield_the_line" }} onClose={() => {}} />);
    expect(rowLabels()).toEqual(["stl_break", "stl_brace", "stl_hold"]);
    expect(screen.getByRole("button", { name: "Save variant" })).toBeDisabled();

    const hold = screen.getByRole("listitem", { name: /Order 3 of 3: Otherwise/ });
    hold.focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(rowLabels()).toEqual(["stl_break", "stl_hold", "stl_brace"]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("listitem", { name: /Order 2 of 3: Otherwise/ })));
    expect(screen.getByText(/Moved “Otherwise → hold the line” to position 2 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Orders below an “Otherwise” never fire.");
    expect(screen.getByRole("listitem", { name: /Order 3 of 3: .*\(never fires\)/ })).toBeInTheDocument();

    // Plain arrows move focus without moving the order.
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("listitem", { name: /Order 3 of 3/ }));
    expect(rowLabels()).toEqual(["stl_break", "stl_hold", "stl_brace"]);

    // The buttons do the same.
    await user.click(screen.getByRole("button", { name: "Move order 3 up" }));
    expect(rowLabels()).toEqual(["stl_break", "stl_brace", "stl_hold"]);
  });

  it("steps thresholds within their bounds, and the live card follows", async () => {
    const user = userEvent.setup();
    render(<DoctrineEditor target={{ baseId: "shield_the_line" }} onClose={() => {}} />);
    const stepper = screen.getByRole("group", { name: "Cohesion below, order 1" });
    expect(within(stepper).getByText("10–90")).toBeInTheDocument();
    await user.click(within(stepper).getByRole("button", { name: "Raise to 25" }));
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByText(/If cohesion < 25/)).toBeInTheDocument();
    expect(within(stepper).getByText(/was 20/)).toBeInTheDocument();
    for (let i = 0; i < 3; i += 1) await user.click(within(stepper).getByRole("button", { name: /Lower to/ }));
    expect(within(stepper).getByRole("button", { name: "Lower to 5" })).toBeDisabled();
    expect(within(preview).getByText(/If cohesion < 10/)).toBeInTheDocument();
    // Enemy-adjacent carries no number: nothing to step.
    expect(screen.queryByRole("group", { name: /order 2/ })).not.toBeInTheDocument();
  });

  it("saves a named variant, orders it for the company it was opened from, and shows it in the hand", async () => {
    const user = userEvent.setup();
    useAppStore.getState().selectSquad("greyford_shields");
    render(
      <>
        <DoctrineHand />
        <DoctrineEditor target={{ baseId: "shield_the_line", squadId: "greyford_shields" }} onClose={() => {}} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Move order 2 up" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Shield the Line (Veteran's cut)");
    await user.click(screen.getByRole("button", { name: "Save variant" }));

    await waitFor(() => expect(useVariants.getState().variants).toHaveLength(1));
    const { variant } = useVariants.getState().variants[0];
    expect(variant).toMatchObject({ baseId: "shield_the_line", name: "Shield the Line (Veteran's cut)", order: ["stl_brace", "stl_break", "stl_hold"] });
    expect(useGame.getState().orders.greyford_shields).toBe(variant.id);
    expect(screen.getByText(/ordered for this company/)).toBeInTheDocument();

    const hand = screen.getByRole("listbox", { name: /Doctrine for/ });
    const card = within(hand).getByRole("option", { name: /Veteran's cut/ });
    expect(card).toHaveAttribute("aria-selected", "true");
    expect(within(card).getByText("Experimental")).toBeInTheDocument();
    // The variant sits right after its base doctrine.
    const names = within(hand).getAllByRole("option").map((option) => option.querySelector(".card-name")?.textContent);
    expect(names.indexOf("Shield the Line (Veteran's cut)")).toBe(names.indexOf("Shield the Line") + 1);
  });

  it("offers only the player's doctrines to cut from (never the Host's Hurl Fire)", () => {
    render(<DoctrineEditor target={{}} onClose={() => {}} />);
    const options = within(screen.getByRole("combobox", { name: "Cut from" })).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Shield the Line", "Fighting Withdrawal", "Rescue Standard", "Clean Counterstroke", "Hold for Dawn"]);
  });

  it("shows Counterstroke's strike from guard as it will play", () => {
    render(<DoctrineEditor target={{ baseId: "clean_counterstroke" }} onClose={() => {}} />);
    expect(within(screen.getByRole("region", { name: "Preview" })).getByText(/strike back from guard/i)).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /^Cohesion below/ })).toHaveLength(1);
  });

  it("opens from the hand on the doctrine in focus", async () => {
    const user = userEvent.setup();
    useAppStore.getState().selectSquad("greyford_shields");
    render(<DoctrineHand />);
    await user.click(screen.getByRole("button", { name: /Edit a copy/ }));
    expect(useFlow.getState().editor).toMatchObject({ squadId: "greyford_shields" });
    expect(useFlow.getState().editor?.baseId).toBe(useGame.getState().view.squads.find((squad) => squad.id === "greyford_shields")?.doctrineId);
  });
});

describe("test in the field", () => {
  it("runs in the worker from the start of the battle, shows progress, and can be cancelled", async () => {
    const user = userEvent.setup();
    render(<DoctrineEditor target={{ baseId: "shield_the_line", squadId: "greyford_shields" }} onClose={() => {}} />);
    const panel = screen.getByRole("region", { name: "Test in the field" });
    expect(panel).toHaveTextContent(/from the start of this battle/);
    expect(within(panel).getByRole("button", { name: "Run the test" })).toBeDisabled(); // nothing changed yet

    await user.click(screen.getByRole("button", { name: "Move order 3 up" }));
    await user.click(within(panel).getByRole("button", { name: "Run the test" }));
    expect(fieldTests).toHaveLength(1);
    const run = fieldTests[0];
    expect(run.input).toMatchObject({ squadIds: ["greyford_shields"], baseId: "shield_the_line", firstSeed: firstBreach.curatedSeed });
    expect(panel).toHaveTextContent(/60 to 300 battles/);
    expect(run.input.scenario.playerDoctrineIds).toContain(run.input.variantId);
    expect(run.input.doctrines[run.input.variantId].rules.map((rule) => rule.id)).toEqual(["stl_break", "stl_hold", "stl_brace"]);

    act(() => run.progress(23, 300));
    expect(within(panel).getByText("23 of up to 300")).toBeInTheDocument();
    expect(within(panel).getByRole("progressbar", { name: "Field test progress" })).toHaveAttribute("value", "23");
    await user.click(within(panel).getByRole("button", { name: "Cancel" }));
    expect(run.cancelled).toBe(true);
    expect(within(panel).getByRole("button", { name: "Run the test" })).toBeEnabled();
  });

  it("shows an honest verdict, the win rates as bars, and the paired battles behind it", async () => {
    const user = userEvent.setup();
    render(<DoctrineEditor target={{ baseId: "shield_the_line", squadId: "greyford_shields" }} onClose={() => {}} />);
    const panel = screen.getByRole("region", { name: "Test in the field" });
    await user.click(screen.getByRole("button", { name: "Move order 3 up" }));
    await user.click(within(panel).getByRole("button", { name: "Run the test" }));
    await act(async () =>
      fieldTests[0].finish({
        runs: 240,
        base: { victories: 120, stalemates: 24, defeats: 96 },
        variant: { victories: 144, stalemates: 12, defeats: 84 },
        ahead: 30,
        behind: 12,
        stoppedBy: "runs",
      }),
    );
    const result = within(panel).getByRole("status");
    expect(within(result).getByText("Clearly better")).toHaveClass("field-test-verdict", "better");
    expect(result).toHaveTextContent("Holds Greyford Gate in 60% of 240 battles; the original, 50%.");
    const bars = within(within(result).getByRole("list", { name: "Win rate" }).parentElement!).getAllByRole("listitem").map((bar) => bar.textContent);
    expect(bars).toEqual(["Shield the Line50% won · 60% advanced", "Shield the Line (my cut)60% won · 65% advanced"]);
    expect(result).toHaveTextContent("Same fortunes, different results in 42 battles: your cut came out ahead in 30, the original in 12.");
    // A later edit marks the result as stale.
    await user.click(screen.getByRole("button", { name: "Move order 1 down" }));
    expect(result).toHaveTextContent("These results are for your previous cut.");
  });

  it("offers Run longer once when the verdict is not certain, continuing the same fortunes", async () => {
    const user = userEvent.setup();
    render(<DoctrineEditor target={{ baseId: "shield_the_line", squadId: "greyford_shields" }} onClose={() => {}} />);
    const panel = screen.getByRole("region", { name: "Test in the field" });
    await user.click(screen.getByRole("button", { name: "Move order 3 up" }));
    await user.click(within(panel).getByRole("button", { name: "Run the test" }));
    const leaning = {
      runs: 83,
      base: { victories: 40, stalemates: 0, defeats: 43 },
      variant: { victories: 47, stalemates: 0, defeats: 36 },
      ahead: 14,
      behind: 7,
      stoppedBy: "time" as const,
    };
    await act(async () => fieldTests[0].finish(leaning));
    expect(within(panel).getByText("Slightly better, not certain")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Run longer" }));
    expect(fieldTests[1].input.from).toEqual(leaning);
    // The earlier result stays up while it runs; progress counts on from it.
    expect(within(panel).getByText("Slightly better, not certain")).toBeInTheDocument();
    expect(within(panel).getByText("83 of up to 383")).toBeInTheDocument();
    await act(async () =>
      fieldTests[1].finish({ ...leaning, runs: 383, base: { victories: 180, stalemates: 0, defeats: 203 }, variant: { victories: 205, stalemates: 0, defeats: 178 }, ahead: 60, behind: 35 }),
    );
    expect(within(panel).getByText("Clearly better")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Run longer" })).not.toBeInTheDocument();
  });

  it("does not offer Run longer for a clear verdict", async () => {
    const user = userEvent.setup();
    render(<DoctrineEditor target={{ baseId: "shield_the_line", squadId: "greyford_shields" }} onClose={() => {}} />);
    const panel = screen.getByRole("region", { name: "Test in the field" });
    await user.click(screen.getByRole("button", { name: "Move order 3 up" }));
    await user.click(within(panel).getByRole("button", { name: "Run the test" }));
    await act(async () =>
      fieldTests[0].finish({ runs: 120, base: { victories: 47, stalemates: 0, defeats: 73 }, variant: { victories: 75, stalemates: 0, defeats: 45 }, ahead: 47, behind: 19, stoppedBy: "clear" }),
    );
    expect(within(panel).getByText("Clearly better")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Run longer" })).not.toBeInTheDocument();
  });
});
