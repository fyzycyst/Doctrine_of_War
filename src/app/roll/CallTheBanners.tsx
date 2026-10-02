// "Call the Banners" (M1, P6): before each battle of a Roll campaign, choose which companies
// answer. Posts come in activation order; a flex post takes either of two roles; a locked post
// is the story's. Click a post then a company, drag a company onto a post, or use each post's
// list (the keyboard path). The Host's strength is fixed before you choose.
import { Lock, Shuffle, Swords, Undo2, X } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  currentBattle,
  LEVY_ID,
  WORN_PENALTY,
  type Assignment,
  type CampaignDefinition,
  type CampaignState,
  type HostThreat,
  type RollEntry,
  type RollSlot,
} from "../../game/campaign";
import type { EngineScenario } from "../../game/engine";
import { scenarioFor } from "../flow/campaignView";
import { useFlow } from "../flow/flowStore";
import { resolveRank } from "../game/view";
import { RoleGlyph, ROLE_NAME } from "../ui/glyphs";
import { roll } from "./api";
import { realmOf } from "./realms";

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** A company's readiness, as a badge. */
export function ConditionBadge({ condition }: { condition: RollEntry["condition"] }) {
  if (condition === "worn") {
    return (
      <span className="condition worn" title="Worn: fights weaker until it rests one battle in reserve">
        Worn −{WORN_PENALTY.strength}/−{WORN_PENALTY.cohesion}
      </span>
    );
  }
  if (condition === "reforming") {
    return (
      <span className="condition reforming" title="Reforming: sits out this battle">
        Reforming · sits out
      </span>
    );
  }
  return <span className="condition fresh">Fresh</span>;
}

/** What the Host's fixed adjustment means, in words. */
export function threatWords(threat: HostThreat): string {
  if (threat.fame > 0) {
    const parts = [threat.strength ? `${signed(threat.strength)} strength` : null, threat.resolve ? `${signed(threat.resolve)} Resolve` : null].filter(Boolean);
    return `The Host has heard of you: its companies take the field ${parts.length ? parts.join(", ") : "warier"}.`;
  }
  if (threat.fame < 0) return `The Host thinks little of you: its companies come on ${signed(threat.strength)} strength, careless.`;
  return "The Host knows nothing of you yet: it comes on as it always does.";
}

interface Called {
  def: CampaignDefinition;
  state: CampaignState;
  scenario: EngineScenario;
  battleTitle: string;
  slots: RollSlot[];
  entries: RollEntry[];
  threat: HostThreat;
  recommended: Assignment;
}

function useCalled(): Called | null {
  const def = useFlow((s) => s.definition);
  const state = useFlow((s) => s.campaign);
  return useMemo(() => {
    const battle = state ? currentBattle(def, state) : null;
    const scenario = battle ? scenarioFor(battle) : undefined;
    if (!state || !battle || !scenario) return null;
    const api = roll();
    return {
      def,
      state,
      scenario,
      battleTitle: battle.title,
      slots: api.rollSlots(def, state, scenario),
      entries: api.rollFor(def, state),
      threat: api.battleThreat(def, state, scenario),
      recommended: api.recommendedForce(def, state, scenario),
    };
  }, [def, state]);
}

export function CallTheBanners() {
  const called = useCalled();
  const go = useFlow((s) => s.go);
  const fieldBanners = useFlow((s) => s.fieldBanners);
  const [assignment, setAssignment] = useState<Assignment>(() => (called ? { ...called.recommended } : {}));
  const [armed, setArmed] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const field = useRef<HTMLButtonElement>(null);
  if (!called) return null;
  const { def, state, scenario, slots, entries, threat, recommended } = called;

  const problems = roll().validateAssignment(def, state, scenario, assignment);
  const entryOf = (id: string | undefined) => entries.find((entry) => entry.company.id === id);
  const slotOf = (companyId: string) => slots.find((slot) => assignment[slot.slotId] === companyId);
  const fits = (slot: RollSlot, entry: RollEntry) => slot.roles.includes(entry.company.role) && (entry.available || slot.locked === entry.company.id);
  const isRecommended = slots.every((slot) => assignment[slot.slotId] === recommended[slot.slotId]);

  const assign = (slotId: string, companyId: string | null) => {
    setAssignment((now) => {
      const next = { ...now };
      // A company answers one post: take it from wherever it was.
      if (companyId) for (const [key, id] of Object.entries(next)) if (id === companyId && key !== slotId) delete next[key];
      if (companyId) next[slotId] = companyId;
      else delete next[slotId];
      return next;
    });
    const slot = slots.find((item) => item.slotId === slotId);
    setAnnounce(companyId ? `${companyId === LEVY_ID ? "A levy" : entryOf(companyId)?.company.name} called to ${slot?.label}.` : `${slot?.label} left empty.`);
    setArmed(null);
  };

  const onCompany = (entry: RollEntry) => {
    const target = armed ? slots.find((slot) => slot.slotId === armed) : slots.find((slot) => !assignment[slot.slotId] && fits(slot, entry));
    if (target && fits(target, entry) && !target.locked) assign(target.slotId, entry.company.id);
    else if (target && !fits(target, entry)) setAnnounce(`${target.label} needs ${target.roles.map((role) => ROLE_NAME[role]).join(" or ")}.`);
  };

  const onDrop = (event: DragEvent, slot: RollSlot) => {
    event.preventDefault();
    const entry = entryOf(event.dataTransfer.getData("text/plain"));
    if (entry && fits(slot, entry) && !slot.locked) assign(slot.slotId, entry.company.id);
  };

  return (
    <div className="screen roll-screen">
      <header className="roll-head">
        <p className="bar-stage">{def.title} · Call the Banners</p>
        <h1>{called.battleTitle}</h1>
        <p className="roll-threat" role="note">
          <Swords size={15} aria-hidden="true" /> {threatWords(threat)} <span className="roll-fixed">Fixed before you choose: your picks do not change it.</span>
        </p>
      </header>

      <section className="roll-posts" aria-labelledby="posts-title">
        <h2 id="posts-title">The posts, in the order they act</h2>
        <ol>
          {slots.map((slot) => {
            const id = assignment[slot.slotId];
            const entry = entryOf(id);
            const problem = problems[slot.slotId];
            return (
              <li
                key={slot.slotId}
                className={`post ${armed === slot.slotId ? "armed" : ""} ${problem ? "problem" : ""} ${slot.locked ? "locked" : ""} ${id === LEVY_ID ? "levy" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, slot)}
              >
                <button
                  type="button"
                  className="post-head"
                  aria-pressed={armed === slot.slotId}
                  disabled={Boolean(slot.locked)}
                  onClick={() => setArmed(armed === slot.slotId ? null : slot.slotId)}
                  aria-label={`Post: ${slot.label}${slot.flex ? ` (flex: ${slot.roles.map((role) => ROLE_NAME[role]).join(" or ")})` : ""}`}
                >
                  <span className="post-roles" aria-hidden="true">
                    {slot.roles.map((role) => (
                      <RoleGlyph key={role} role={role} />
                    ))}
                  </span>
                  <span className="post-label">
                    {slot.label}
                    <span className="post-sub">
                      {slot.flex ? `Flex: ${slot.roles.map((role) => ROLE_NAME[role]).join(" or ")}` : ROLE_NAME[slot.roles[0]]}
                    </span>
                  </span>
                  {slot.locked && <Lock size={14} aria-label="Locked" />}
                </button>
                <div className="post-company">
                  {id === LEVY_ID ? (
                    <span className="post-levy">Levy (no ready company) · {ROLE_NAME[slot.roles[0]]}, Resolve −1</span>
                  ) : entry ? (
                    <span className="post-called">
                      <strong>{entry.company.name}</strong> <ConditionBadge condition={entry.condition} />
                      <span className="post-numbers">
                        {entry.fielded.strength} strength · {entry.fielded.cohesion} cohesion
                      </span>
                      {slot.locked && <span className="post-lock-note"> · the story calls it here</span>}
                    </span>
                  ) : (
                    <span className="post-empty">{armed === slot.slotId ? "Now choose a company from the Roll" : "No company called"}</span>
                  )}
                  {!slot.locked && (
                    <label className="post-pick">
                      <span className="sr-only">Company for {slot.label}</span>
                      <select value={id ?? ""} onChange={(event) => assign(slot.slotId, event.target.value || null)}>
                        <option value="">Choose…</option>
                        {entries
                          .filter((item) => fits(slot, item))
                          .map((item) => (
                            <option key={item.company.id} value={item.company.id}>
                              {item.company.name} ({item.condition})
                            </option>
                          ))}
                        <option value={LEVY_ID}>Levy (no ready company)</option>
                      </select>
                    </label>
                  )}
                  {id && !slot.locked && (
                    <button type="button" className="post-clear" aria-label={`Clear ${slot.label}`} onClick={() => assign(slot.slotId, null)}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {problem && (
                  <p className="post-problem" role="alert">
                    {problem}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="roll-roster" aria-labelledby="roster-title">
        <h2 id="roster-title">The Roll</h2>
        <ul>
          {entries.map((entry) => {
            const at = slotOf(entry.company.id);
            const realm = realmOf(entry.company.id);
            return (
              <li key={entry.company.id}>
                <button
                  type="button"
                  className={`roll-company ${at ? "called" : ""} ${entry.available ? "" : "out"}`}
                  draggable={entry.available}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", entry.company.id)}
                  onClick={() => onCompany(entry)}
                  disabled={!entry.available}
                  aria-label={`${entry.company.name}, ${ROLE_NAME[entry.company.role]}, ${entry.condition}${at ? `, called to ${at.label}` : ""}`}
                >
                  <RoleGlyph role={entry.company.role} />
                  <span className="roll-name">
                    {entry.company.name}
                    {entry.company.renown && <span className="renown"> “{entry.company.renown.title}”</span>}
                    <span className="roll-sub">
                      {resolveRank(entry.company.resolve)} {signed(entry.company.resolve)}
                      {realm && <> · {realm.name}</>}
                      {entry.company.carriedFrom && <> · veteran</>}
                    </span>
                  </span>
                  <ConditionBadge condition={entry.condition} />
                  <span className="roll-at">{at ? `→ ${at.label}` : entry.unavailableReason ?? "In reserve"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="roll-rest">Companies in reserve rest: a battle in reserve makes a Worn company fresh again.</p>
      </section>

      <footer className="roll-foot">
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <button type="button" className="btn-quiet" disabled={isRecommended} onClick={() => setAssignment({ ...recommended })}>
          {isRecommended ? <Shuffle size={14} aria-hidden="true" /> : <Undo2 size={14} aria-hidden="true" />} Recommended force
        </button>
        {Object.keys(problems).length > 0 && (
          <p className="roll-problems" role="status">
            {Object.keys(problems).length === 1 ? "One post needs attention." : `${Object.keys(problems).length} posts need attention.`}
          </p>
        )}
        <button type="button" className="btn-quiet" onClick={() => go("campaign")}>
          Back to the map
        </button>
        <button ref={field} type="button" className="btn-command" disabled={Object.keys(problems).length > 0} onClick={() => fieldBanners(assignment)}>
          <Swords size={15} aria-hidden="true" /> Take the field
        </button>
      </footer>
    </div>
  );
}
