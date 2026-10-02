// "Skirmish" (M1, P6): any battle from the packs' skirmish lists, fought again as authored.
// The companies stand at their authored strength, every fight draws a fresh seed, and
// nothing is saved: no run is touched and no Resolve is won or lost.
import { Home, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CampaignSelectBackdrop, type CampaignSelectChain } from "../../render/showcase/CampaignSelectBackdrop";
import { packs } from "../roll/api";
import { FrameProbe } from "../ui/FrameProbe";
import { useFlow } from "./flowStore";

/** The briefing's opening sentence: enough to tell the battles apart. */
export function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

export function SkirmishList({ onSettings }: { onSettings?: () => void }) {
  const go = useFlow((s) => s.go);
  const playSkirmish = useFlow((s) => s.playSkirmish);
  const first = useRef<HTMLButtonElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const entries = packs()
    .skirmishes()
    .map(({ pack, skirmish }) => ({ pack, skirmish, scenario: packs().scenario(skirmish.scenarioId) }))
    .filter((entry) => entry.scenario !== undefined);
  // One island per skirmish: the board it is fought on.
  const chains: CampaignSelectChain[] = entries.map(({ skirmish, scenario }) => ({ id: skirmish.id, boards: [scenario!.board] }));
  const byPack = packs().packs.filter((pack) => entries.some((entry) => entry.pack.id === pack.id));

  useEffect(() => first.current?.focus({ preventScroll: true }), []);

  return (
    <div className="screen choice-screen">
      <CampaignSelectBackdrop chains={chains} highlightedId={highlighted} inCanvas={<FrameProbe />}>
        <section className="choice-panel" aria-labelledby="skirmish-title" aria-describedby="skirmish-rules">
          <header>
            <p className="bar-stage">Doctrine of War</p>
            <h1 id="skirmish-title">Skirmish</h1>
            <p id="skirmish-rules" className="choice-lede">
              Fight any battle again as it was written: its companies at full authored strength and a fresh fortune each time. Nothing is
              saved, and no company gains or loses Resolve.
            </p>
          </header>
          {entries.length === 0 && <p className="choice-lede">No skirmishes are offered in this build.</p>}
          {byPack.map((pack) => (
            <section key={pack.id} className="choice-pack" aria-label={pack.title}>
              <h2>{pack.title}</h2>
              <ul className="choice-list">
                {entries
                  .filter((entry) => entry.pack.id === pack.id)
                  .map(({ skirmish, scenario }, index) => {
                    const own = scenario!.squads.filter((squad) => squad.faction === scenario!.playerFaction).length;
                    return (
                      <li
                        key={skirmish.id}
                        className="choice-card"
                        onPointerEnter={() => setHighlighted(skirmish.id)}
                        onFocus={() => setHighlighted(skirmish.id)}
                      >
                        <div className="choice-body">
                          <h3>{skirmish.title}</h3>
                          <p>{firstSentence(scenario!.briefing)}</p>
                          <p className="choice-status">
                            {own} companies · {scenario!.maxPhases} phases
                          </p>
                        </div>
                        <button
                          ref={index === 0 && pack === byPack[0] ? first : undefined}
                          type="button"
                          className="btn-command"
                          onClick={() => playSkirmish(skirmish.id)}
                          aria-label={`Fight: ${skirmish.title}`}
                        >
                          <Swords size={15} aria-hidden="true" /> Fight
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          <div className="choice-actions">
            <button type="button" className="btn-quiet" onClick={() => go("title")}>
              <Home size={14} aria-hidden="true" /> Title screen
            </button>
            {onSettings && (
              <button type="button" className="btn-quiet" onClick={onSettings}>
                Settings
              </button>
            )}
          </div>
        </section>
      </CampaignSelectBackdrop>
    </div>
  );
}
