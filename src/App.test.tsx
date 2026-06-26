import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

async function startTutorial() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: /begin command/i }));
  return user;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("renders the tutorial briefing", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /the first breach/i })).toBeInTheDocument();
    expect(screen.getByText(/you command the free banners/i)).toBeInTheDocument();
    expect(screen.getByText(/the ashen host moves first/i)).toBeInTheDocument();
  });

  it("lets the player assign doctrines to at least three squads", async () => {
    const user = await startTutorial();

    await user.selectOptions(screen.getByLabelText(/doctrine for greyford shields/i), "hold_for_dawn");
    await user.selectOptions(screen.getByLabelText(/doctrine for dawnwatch archers/i), "shield_the_line");
    await user.selectOptions(screen.getByLabelText(/doctrine for stoneford riders/i), "clean_counterstroke");

    expect(screen.getByLabelText(/doctrine for greyford shields/i)).toHaveValue("hold_for_dawn");
    expect(screen.getByLabelText(/doctrine for dawnwatch archers/i)).toHaveValue("shield_the_line");
    expect(screen.getByLabelText(/doctrine for stoneford riders/i)).toHaveValue("clean_counterstroke");
  });

  it("keeps doctrine summaries available without always showing them in the command panel", async () => {
    await startTutorial();

    const greyfordDoctrine = screen.getByLabelText(/doctrine for greyford shields/i);

    expect(greyfordDoctrine).toHaveAttribute("title", "Hold formation, protect the gate, and absorb pressure.");
    expect(screen.queryByText("Hold formation, protect the gate, and absorb pressure.")).not.toBeInTheDocument();
  });

  it("keeps exact battlefield stats accessible while reducing visible token text", async () => {
    await startTutorial();

    expect(screen.getByLabelText("Greyford Shields strength 86 of 100")).toBeInTheDocument();
    expect(screen.getByLabelText("Greyford Shields cohesion 76 of 100")).toBeInTheDocument();
    expect(screen.getByLabelText("Gate integrity 100")).toHaveTextContent("100");

    const fieldGateMeter = screen.getByLabelText("Greyford Gate field integrity 100 of 100");

    expect(fieldGateMeter).toBeInTheDocument();
    expect(fieldGateMeter.querySelector(".stat-meter-fill")).toHaveStyle({ width: "100%" });
    expect(screen.queryByText("STR 86 / COH 76")).not.toBeInTheDocument();
  });

  it("commits a phase and shows report output", async () => {
    const user = await startTutorial();

    await user.click(screen.getByRole("button", { name: /commit phase/i }));

    expect(screen.getByRole("heading", { name: /phase 1/i })).toBeInTheDocument();
    expect(screen.getByText(/the host moves first/i)).toBeInTheDocument();
    expect(screen.getByText(/casualties/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Objective" })).toBeInTheDocument();
  });

  it("starts playback with support context before individual engagements", async () => {
    const user = await startTutorial();

    await user.click(screen.getByRole("button", { name: /commit phase/i }));

    expect(screen.getByText("Resolving")).toBeInTheDocument();
    expect(screen.getByLabelText(/support from mercy standard/i)).toHaveClass("active");
    expect(screen.queryByLabelText(/engagement at hex 2,2/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /commit phase/i })).toBeDisabled();
    expect(screen.getByLabelText(/doctrine for greyford shields/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /skip playback/i })).toBeInTheDocument();
  });

  it("steps through engagements at the selected readable timing", async () => {
    vi.useFakeTimers();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /begin command/i }));
    fireEvent.click(screen.getByRole("button", { name: /commit phase/i }));

    await act(async () => {
      vi.advanceTimersByTime(625);
    });

    expect(screen.getByLabelText(/engagement at hex 2,2/i)).toHaveClass("active");
    expect(screen.queryByLabelText(/engagement at hex 2,1/i)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1250);
    });

    expect(screen.getByLabelText(/engagement at hex 2,1/i)).toHaveClass("active");
    expect(screen.getByLabelText(/engagement at hex 2,2/i)).not.toHaveClass("active");
  });

  it("uses fast playback timing when the player changes playback pace", async () => {
    vi.useFakeTimers();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /begin command/i }));
    fireEvent.click(screen.getByRole("button", { name: "Fast" }));
    fireEvent.click(screen.getByRole("button", { name: /commit phase/i }));

    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/support from mercy standard/i)).toHaveClass("active");

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByLabelText(/engagement at hex 2,2/i)).toHaveClass("active");
  });

  it("stops pulsing phase indicators after playback reaches the report state", async () => {
    vi.useFakeTimers();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /begin command/i }));
    fireEvent.click(screen.getByRole("button", { name: /commit phase/i }));

    await act(async () => {
      vi.advanceTimersByTime(625);
    });
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    await act(async () => {
      vi.advanceTimersByTime(1250);
    });
    await act(async () => {
      vi.advanceTimersByTime(875);
    });

    expect(screen.getByText("Report")).toBeInTheDocument();
    expect(document.querySelectorAll(".phase-indicator.active, .phase-indicator.pulsing")).toHaveLength(0);
    expect(screen.getByLabelText(/engagement at hex 2,2/i)).toBeInTheDocument();
  });

  it("keeps the battle report visible after skipping phase playback", async () => {
    const user = await startTutorial();

    await user.click(screen.getByRole("button", { name: /commit phase/i }));
    await user.click(screen.getByRole("button", { name: /skip playback/i }));

    expect(screen.getByText("Report")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /phase 1/i })).toBeInTheDocument();
    expect(screen.getByText(/the host moves first/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /commit phase/i })).not.toBeDisabled();
  });

  it("lets the player deploy a Free Banners squad to an empty friendly hex before phase one", async () => {
    const user = await startTutorial();

    await user.click(screen.getByLabelText(/select stoneford riders at hex 3,3/i));
    await user.click(screen.getByLabelText(/deploy stoneford riders to hex 2,3/i));

    expect(screen.getByLabelText(/select stoneford riders at hex 2,3/i)).toBeInTheDocument();
  });

  it("prevents deployment to occupied, enemy-only, and objective hexes", async () => {
    const user = await startTutorial();

    await user.click(screen.getByLabelText(/select stoneford riders at hex 3,3/i));

    expect(screen.queryByLabelText(/deploy stoneford riders to hex 3,2/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/deploy stoneford riders to hex 1,2/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/deploy stoneford riders to hex 4,2/i)).not.toBeInTheDocument();
  });

  it("locks deployment after the first phase has been committed", async () => {
    const user = await startTutorial();

    await user.click(screen.getByRole("button", { name: /commit phase/i }));
    await user.click(screen.getByLabelText(/select stoneford riders at hex 3,3/i));

    expect(screen.queryByLabelText(/deploy stoneford riders to hex 2,3/i)).not.toBeInTheDocument();
  });

  it("renders a fully tessellated 25 tile battlefield instead of lane fields", async () => {
    await startTutorial();

    expect(screen.getByRole("img", { name: /tessellated hex battlefield/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("hex-tile")).toHaveLength(25);
    expect(screen.queryByRole("img", { name: /three approach lanes/i })).not.toBeInTheDocument();
  });

  it("shows a terrain legend with each terrain impact", async () => {
    await startTutorial();

    const legend = screen.getByRole("list", { name: /terrain effects/i });

    expect(legend).toHaveTextContent("Road +0 defense");
    expect(legend).toHaveTextContent("Ridge +3 defense");
    expect(legend).toHaveTextContent("Ford -1 defense");
    expect(legend).toHaveTextContent("Wall +4 defense");
    expect(legend).toHaveTextContent("Field +0 defense");
    expect(legend).toHaveTextContent("Ruin +2 defense");
  });

  it("lets the player collapse and expand a completed battle report", async () => {
    const user = await startTutorial();

    await user.click(screen.getByRole("button", { name: /commit phase/i }));
    await user.click(screen.getByRole("button", { name: /collapse report/i }));

    expect(screen.queryByRole("heading", { name: "Casualties" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand report/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand report/i }));

    expect(screen.getByRole("heading", { name: "Casualties" })).toBeInTheDocument();
  });

  it("can reach a terminal scenario state", async () => {
    const user = await startTutorial();

    await user.click(screen.getByRole("button", { name: /commit phase/i }));
    await user.click(screen.getByRole("button", { name: /skip playback/i }));
    await user.click(screen.getByRole("button", { name: /commit phase/i }));
    await user.click(screen.getByRole("button", { name: /skip playback/i }));
    await user.click(screen.getByRole("button", { name: /commit phase/i }));
    await user.click(screen.getByRole("button", { name: /skip playback/i }));

    expect(screen.getByText(/scenario victory|scenario defeat/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /commit phase/i })).toBeDisabled();
  });
});
