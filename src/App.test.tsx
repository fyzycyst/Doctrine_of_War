import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

async function startTutorial() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: /begin command/i }));
  return user;
}

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
    await user.click(screen.getByRole("button", { name: /commit phase/i }));
    await user.click(screen.getByRole("button", { name: /commit phase/i }));

    expect(screen.getByText(/scenario victory|scenario defeat/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /commit phase/i })).toBeDisabled();
  });
});
