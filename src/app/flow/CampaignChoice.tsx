// "Choose a campaign" (M1, P6): every campaign this build's packs offer, each with an honest
// status from its own saved run. A run this build cannot continue, or cannot read, is said
// so and kept as it is: nothing here replaces it.
import { BookOpen, Flag, Home, Lock, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ashAndBanner, CARRY_OVER_MAX, CARRY_RESOLVE, currentBattle, type CampaignDefinition, type CampaignState } from "../../game/campaign";
import { CampaignSelectBackdrop, type CampaignSelectChain } from "../../render/showcase/CampaignSelectBackdrop";
import { packs } from "../roll/api";
import { realmOf } from "../roll/realms";
import { resolveRank } from "../game/view";
import { FrameProbe } from "../ui/FrameProbe";
import { RoleGlyph, ROLE_NAME } from "../ui/glyphs";
import { Modal } from "../ui/Modal";
import { scenarioFor } from "./campaignView";
import { useFlow, type CarrySource } from "./flowStore";

/** What the player can do with a campaign now, and how its card says it. */
export interface CampaignStatus {
  kind: "checking" | "new" | "inProgress" | "complete" | "unavailable" | "unbuilt";
  /** A preserved run (not the intro's): it may be set aside, or restored from a good backup. */
  preserved?: { restorable: boolean };
  /** The card's status line. */
  line: string;
  action: string | null;
}

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

function progress(def: CampaignDefinition, state: CampaignState): CampaignStatus {
  const next = currentBattle(def, state);
  if (!next) return { kind: "complete", line: `Completed · ${state.history.length} ${state.history.length === 1 ? "battle" : "battles"} fought`, action: "Read the chronicle" };
  return { kind: "inProgress", line: `In progress · next: ${next.title}`, action: "Continue" };
}

/** A campaign's status from its run (or, for the intro, its v1 save). */
export function campaignStatus(
  def: CampaignDefinition,
  flow: Pick<ReturnType<typeof useFlow.getState>, "save" | "saved" | "runReads" | "backupReads">,
): CampaignStatus {
  const built = def.battles.some((battle) => scenarioFor(battle));
  if (def.id === ashAndBanner.id) {
    if (flow.save === "checking") return { kind: "checking", line: "Looking for your run…", action: null };
    if (flow.save === "invalid") return { kind: "unavailable", line: "Your saved run could not be read. It is kept as it is.", action: null };
    if (flow.save === "valid" && flow.saved) return progress(def, flow.saved);
    return { kind: "new", line: "Not started", action: "Begin" };
  }
  const read = flow.runReads[def.id];
  if (!read) return { kind: "checking", line: "Looking for your run…", action: null };
  if (read.kind === "unavailable" || read.kind === "unreadable") {
    const reason = /[.!?]$/.test(read.reason) ? read.reason : `${read.reason}.`;
    return { kind: "unavailable", line: `${reason} Your run is kept as it is.`, action: null, preserved: { restorable: flow.backupReads[def.id]?.kind === "ok" } };
  }
  if (read.kind === "ok") return progress(def, read.state);
  if (!built) return { kind: "unbuilt", line: "Still being forged: it opens in a later build.", action: null };
  return { kind: "new", line: "Not started", action: "Begin" };
}

export function CampaignChoice({ onSettings }: { onSettings?: () => void }) {
  const flow = useFlow();
  const first = useRef<HTMLButtonElement>(null);
  const list = packs().packs;
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [settingAside, setSettingAside] = useState<CampaignDefinition | null>(null);
  // One chain of islands per campaign: the boards of its first built battles.
  const chains: CampaignSelectChain[] = list.flatMap((pack) =>
    pack.campaigns.map((def) => ({ id: def.id, boards: def.battles.map((battle) => scenarioFor(battle)?.board).filter((board) => board !== undefined).slice(0, 3) })),
  );

  useEffect(() => {
    void flow.checkSave();
    void flow.checkRuns();
    // Once, as the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);

  return (
    <div className="screen choice-screen">
      <CampaignSelectBackdrop chains={chains} highlightedId={highlighted} inCanvas={<FrameProbe />}>
        <section className="choice-panel" aria-labelledby="choice-title">
          <header>
            <p className="bar-stage">Doctrine of War</p>
            <h1 id="choice-title">Choose a campaign</h1>
          </header>
          {list.map((pack) => (
            <section key={pack.id} className="choice-pack" aria-label={pack.title}>
              <h2>{pack.title}</h2>
              <ul className="choice-list">
                {pack.campaigns.map((def, index) => {
                  const status = campaignStatus(def, flow);
                  const Icon = status.kind === "complete" ? BookOpen : status.kind === "inProgress" ? Flag : Swords;
                  return (
                    <li
                      key={def.id}
                      className={`choice-card status-${status.kind}`}
                      onPointerEnter={() => setHighlighted(def.id)}
                      onFocus={() => setHighlighted(def.id)}
                    >
                      <div className="choice-body">
                        <h3>{def.title}</h3>
                        <p className="choice-kind">
                          {def.mode === "roll" ? "Call the Banners: choose your companies for each battle" : "The defence: a fixed army"} ·{" "}
                          {def.battles.length} {def.battles.length === 1 ? "battle" : "battles"}
                        </p>
                        <p className="choice-status" role="status">
                          {status.kind === "unavailable" && <Lock size={13} aria-hidden="true" />} {status.line}
                        </p>
                      </div>
                      {status.preserved ? (
                        <div className="choice-recover">
                          {status.preserved.restorable && (
                            <button type="button" className="btn-quiet" onClick={() => void flow.restoreRun(def.id)} aria-label={`Restore from backup: ${def.title}`}>
                              Restore from backup
                            </button>
                          )}
                          <button type="button" className="btn-quiet" onClick={() => setSettingAside(def)} aria-label={`Set aside and start again: ${def.title}`}>
                            Set aside and start again
                          </button>
                        </div>
                      ) : status.action ? (
                        <button
                          ref={index === 0 && pack === list[0] ? first : undefined}
                          type="button"
                          className="btn-command"
                          onClick={() => void flow.chooseCampaign(def.id)}
                          aria-label={`${status.action}: ${def.title}`}
                        >
                          <Icon size={15} aria-hidden="true" /> {status.action}
                        </button>
                      ) : (
                        <button type="button" className="btn-quiet" disabled aria-label={`${def.title}: ${status.line}`}>
                          {status.kind === "checking" ? "…" : "Unavailable"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="choice-actions">
            <button type="button" className="btn-quiet" onClick={() => flow.go("title")}>
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
      {flow.notice && (
        <p className="choice-notice" role="alert">
          {flow.notice}
        </p>
      )}
      {settingAside && (
        <ConfirmSetAside
          def={settingAside}
          onConfirm={() => {
            const id = settingAside.id;
            setSettingAside(null);
            void flow.setAsideRun(id);
          }}
          onCancel={() => setSettingAside(null)}
        />
      )}
      {flow.carryOver && <CarryOverPicker campaignId={flow.carryOver.campaignId} sources={flow.carryOver.sources} />}
    </div>
  );
}

/** At the start of a Roll campaign: bring up to CARRY_OVER_MAX companies from a completed one. */
export function CarryOverPicker({ campaignId, sources }: { campaignId: string; sources: CarrySource[] }) {
  const startRun = useFlow((s) => s.startRun);
  const close = useFlow((s) => s.closeCarryOver);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const begin = useRef<HTMLButtonElement>(null);
  const target = packs().campaign(campaignId)?.campaign;
  const source = sources[sourceIndex];
  const full = picked.length >= CARRY_OVER_MAX;
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((item) => item !== id) : now.length < CARRY_OVER_MAX ? [...now, id] : now));
  const start = async (withCarry: boolean) => {
    try {
      await startRun(campaignId, withCarry ? { source, ids: picked } : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Those companies cannot be brought.");
    }
  };

  return (
    <Modal className="modal carry-over" labelledBy="carry-title" describedBy="carry-help" initialFocus={begin} onCancel={close}>
      <h2 id="carry-title">Bring veterans to {target?.title}?</h2>
      <p id="carry-help">
        You may bring up to {CARRY_OVER_MAX} companies from a campaign you have completed. They join {target?.title}&apos;s own army. Resolve
        carries between {signed(CARRY_RESOLVE.min)} and {signed(CARRY_RESOLVE.max)}; renown is kept. The Host hears of them too.
      </p>
      {sources.length > 1 && (
        <label className="carry-source">
          <span>From</span>
          <select
            value={sourceIndex}
            onChange={(event) => {
              setSourceIndex(Number(event.target.value));
              setPicked([]);
            }}
          >
            {sources.map((item, index) => (
              <option key={item.def.id} value={index}>
                {item.def.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="carry-list" aria-label={`Companies from ${source.def.title}`}>
        {source.candidates.map((company) => {
          const was = source.state.companies.find((item) => item.id === company.id)?.resolve;
          const clamped = was !== undefined && was !== company.resolve;
          const on = picked.includes(company.id);
          const realm = realmOf(company.id);
          return (
            <li key={company.id}>
              <label className={`carry-row ${on ? "on" : ""}`}>
                <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(company.id)} />
                <RoleGlyph role={company.role} />
                <span className="carry-name">
                  {company.name}
                  {company.renown && <span className="renown"> “{company.renown.title}”</span>}
                  <span className="carry-sub">
                    {ROLE_NAME[company.role]}
                    {realm && <> · {realm.name}</>}
                  </span>
                </span>
                <span className="carry-resolve">
                  {resolveRank(company.resolve)} {signed(company.resolve)}
                  {clamped && <span className="carry-was"> (was {signed(was!)})</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="carry-count" aria-live="polite">
        {picked.length} of {CARRY_OVER_MAX} chosen
      </p>
      {error && (
        <p className="carry-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn-command" onClick={() => void start(true)} disabled={picked.length === 0}>
          Begin with {picked.length === 1 ? "this company" : "these companies"}
        </button>
        <button ref={begin} type="button" className="btn-quiet" onClick={() => void start(false)}>
          Begin with {target?.title}&apos;s own army only
        </button>
      </div>
    </Modal>
  );
}

function ConfirmSetAside({ def, onConfirm, onCancel }: { def: CampaignDefinition; onConfirm: () => void; onCancel: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <Modal className="modal" role="alertdialog" labelledBy="aside-title" describedBy="aside-body" initialFocus={keep} onCancel={onCancel}>
      <h2 id="aside-title">Set this run aside?</h2>
      <p id="aside-body">
        This version cannot continue your run of {def.title}. Setting it aside keeps it, untouched, and starts the campaign again. Nothing is
        deleted.
      </p>
      <div className="modal-actions">
        <button ref={keep} type="button" className="btn-command" onClick={onCancel}>
          Keep it where it is
        </button>
        <button type="button" className="btn-quiet" onClick={onConfirm}>
          Set aside and start again
        </button>
      </div>
    </Modal>
  );
}
