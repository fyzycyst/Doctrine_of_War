// Editor-variant probes, per battle (docs/CAMPAIGN.md, "editor variants are diagnostics").
// Variants a player could cut in the doctrine editor that a reviewer (the warden) has tried
// against a battle. `npm run balance` plays each on every named call and prints it as a
// diagnostic row; they are never gated. Add a probe when a review finds one worth tracking.
import type { VariantProbe } from "./balance";

const C2_ORDERS = {
  ford_van: "bring_the_water",
  track_van: "bring_the_water",
  sedge_van: "bring_the_water",
  lances: "bring_the_water",
  standard: "rescue_standard",
};

export const variantProbes: Record<string, VariantProbe[]> = {
  // C2 warden re-review: a stubborn Shield (it breaks only below 10 cohesion) on the keepers,
  // left at its post. It never guards the walk without a muster, so it should lose.
  cinder_road_wagon_park: [
    {
      name: "keepers on a stubborn Shield the Line (stl_break 10), left at their post",
      variants: [
        {
          id: "v-shield-stubborn",
          baseId: "shield_the_line",
          name: "Shield the Line (stubborn)",
          order: ["stl_break", "stl_brace", "stl_hold"],
          params: { stl_break: { value: 10 } },
        },
      ],
      orders: { ...C2_ORDERS, keepers: "v-shield-stubborn" },
      musters: ["none", "heuristic", "rush"],
    },
  ],
};
