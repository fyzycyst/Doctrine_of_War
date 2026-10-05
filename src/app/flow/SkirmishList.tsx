// "Skirmish" (M1, P6; T25 §4): every battle of every campaign (registry.skirmishes()),
// fought on its default forces: the authored companies, or for a Roll battle the recommended
// call from its campaign's starting army (all fresh, no veterans). Every fight draws a fresh
// seed, and nothing is saved: no run is touched and no Resolve is won or lost.
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
  const firstButton = useRef<HTMLButtonElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const entries = packs()
    .skirmishes()
    .map((offer) => ({ ...offer, scenario: packs().scenario(offer.skirmish.scenarioId) }))
    .filter((entry) => entry.scenario !== undefined);
  const first = entries[0]?.skirmish.id;
  /** A pack's offers grouped by campaign, in order; standalone skirmishes last, under the pack. */
  const groupsOf = (packId: string) => {
    const groups: { key: string; title: string | null; items: typeof entries }[] = [];
    for (const entry of entries.filter((item) => item.pack.id === packId)) {
      const key = entry.campaign?.id ?? "";
      const group = groups.find((item) => item.key === key) ?? groups[groups.push({ key, title: entry.campaign?.title ?? null, items: [] }) - 1];
      group.items.push(entry);
    }
    return groups;
  };
  // One island per skirmish: the board it is fought on.
  const chains: CampaignSelectChain[] = entries.map(({ skirmish, scenario }) => ({ id: skirmish.id, boards: [scenario!.board] }));
  const byPack = packs().packs.filter((pack) => entries.some((entry) => entry.pack.id === pack.id));

  useEffect(() => firstButton.current?.focus({ preventScroll: true }), []);

  return (
    <div className="screen choice-screen">
      <CampaignSelectBackdrop chains={chains} highlightedId={highlighted} inCanvas={<FrameProbe />}>
        <section className="choice-panel" aria-labelledby="skirmish-title" aria-describedby="skirmish-rules">
          <header>
            <p className="bar-stage">Doctrine of War</p>
            <h1 id="skirmish-title">Skirmish</h1>
            <div id="skirmish-rules">
              <p className="choice-lede">Fight any battle of any campaign again, on a fresh fortune each time. No company gains or loses Resolve.</p>
              <p className="choice-lede">
                Every skirmish starts with the battle&apos;s default forces: its own companies, all fresh, with no veterans. The Host comes at its
                usual strength. Nothing is saved.
              </p>
            </div>
          </header>
          {entries.length === 0 && <p className="choice-lede">No skirmishes are offered in this build.</p>}
          {byPack.map((pack) => (
            <section key={pack.id} className="choice-pack" aria-label={pack.title}>
              <h2>{pack.title}</h2>
              {groupsOf(pack.id).map((group) => (
                <section key={group.key} className="choice-group" aria-label={group.title ?? pack.title}>
                  {group.title && <h3 className="choice-group-title">{group.title}</h3>}
                  <ul className="choice-list">
                    {group.items.map(({ skirmish, scenario, campaign }) => {
                      const own = scenario!.squads.filter((squad) => squad.faction === scenario!.playerFaction).length;
                      return (
                        <li
                          key={skirmish.id}
                          className="choice-card"
                          onPointerEnter={() => setHighlighted(skirmish.id)}
                          onFocus={() => setHighlighted(skirmish.id)}
                        >
                          <div className="choice-body">
                            <h4>{skirmish.title}</h4>
                            <p>{firstSentence(scenario!.briefing)}</p>
                            <p className="choice-status">
                              {own} companies · {scenario!.maxPhases} phases
                            </p>
                            {campaign?.mode === "roll" && <p className="choice-default">Default force: the recommended call.</p>}
                          </div>
                          <button
                            ref={skirmish.id === first ? firstButton : undefined}
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
