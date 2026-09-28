import type { EngineScenario } from "../types";
import { firstBreach } from "./firstBreach";

/** Every playable scenario, in campaign order. The balance harness runs them all. */
export const scenarios: EngineScenario[] = [firstBreach];
