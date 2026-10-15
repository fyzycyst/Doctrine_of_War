import type { EngineScenario } from "../types";
import { emberFord } from "./emberFord";
import { firstBreach } from "./firstBreach";
import { holdForDawn } from "./holdForDawn";
import { saltmarshColumn } from "./saltmarshColumn";

/** Every playable scenario, in campaign order. The balance harness runs them all. */
export const scenarios: EngineScenario[] = [firstBreach, emberFord, saltmarshColumn, holdForDawn];
