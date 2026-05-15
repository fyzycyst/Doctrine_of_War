import type { Squad } from "../game/types";

export function ObjectivePanel({ playerSquads, hostSquads }: { playerSquads: Squad[]; hostSquads: Squad[] }) {
  return (
    <section className="panel objective-panel">
      <div className="panel-heading">
        <span>Objective</span>
        <h2>Hold Until Dawn</h2>
      </div>
      <p>Survive three Host-first phases while Greyford Gate remains above zero integrity.</p>
      <div className="squad-counts">
        <span>Free Banners: {playerSquads.filter((squad) => squad.strength > 0).length}</span>
        <span>Ashen Host: {hostSquads.filter((squad) => squad.strength > 0).length}</span>
      </div>
    </section>
  );
}
