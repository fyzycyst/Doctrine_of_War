import { Flag, Shield, Swords } from "lucide-react";
import { firstBreachScenario } from "../game/scenario";

export function Briefing({ onBegin }: { onBegin: () => void }) {
  return (
    <section className="briefing" aria-labelledby="briefing-title">
      <div>
        <p className="kicker">Doctrine of War: Ash & Banner</p>
        <h1 id="briefing-title">The First Breach</h1>
        <p className="briefing-copy">{firstBreachScenario.briefing}</p>
        <div className="briefing-grid">
          <div>
            <Shield aria-hidden="true" />
            <strong>You command the Free Banners.</strong>
            <span>Assign standing orders, preserve cohesion, and hold Greyford Gate.</span>
          </div>
          <div>
            <Swords aria-hidden="true" />
            <strong>The Ashen Host moves first.</strong>
            <span>Each phase begins with scripted pressure that your doctrines must answer.</span>
          </div>
          <div>
            <Flag aria-hidden="true" />
            <strong>Hold until dawn.</strong>
            <span>Survive three phases with the gate intact to win the tutorial.</span>
          </div>
        </div>
      </div>
      <button className="primary-action" type="button" onClick={onBegin}>
        Begin Command
      </button>
    </section>
  );
}
