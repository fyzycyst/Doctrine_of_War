// "Call the Banners" (M1, P6): before each battle of a Roll campaign, choose which companies
// answer. Posts are positions on the field, in the order they act, shown on a small map of
// the ground; a flex post takes either of two roles; a locked post is the story's. Click a
// post's company to choose from a list, click a post then a company on the Roll, or drag a
// company onto a post. The Host's strength is fixed before you choose.
import { ChevronDown, Lock, Shuffle, Swords, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  currentBattle,
  LEVY_ID,
  WORN_PENALTY,
  type Assignment,
  type CampaignBattle,
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
import { RoleGlyph, ROLE_NAME, Sigil } from "../ui/glyphs";
import { roll } from "./api";
import { PostMap } from "./PostMap";
import { postNames } from "./posts";
import { realmOf } from "./realms";

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const roleWords = (slot: RollSlot) => slot.roles.map((role) => ROLE_NAME[role]).join(" or ");
/** A carried veteran the per-battle cap keeps out (it stays available: the engine says why on the post). */
const VETERAN_CAP_NOTE = "In reserve: veteran cap reached";

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

/** The Host's fixed adjustment as a story beat: a heading and what it means. */
export function threatWords(threat: HostThreat): { heading: string; detail: string } {
  if (threat.fame > 0) {
    const parts = [threat.strength ? `${signed(threat.strength)} strength` : null, threat.resolve ? `${signed(threat.resolve)} Resolve` : null].filter(Boolean);
    return { heading: "The Host has heard of you", detail: `Its companies take the field ${parts.length ? parts.join(", ") : "warier"}.` };
  }
  if (threat.fame < 0) return { heading: "The Host thinks little of you", detail: `Its companies come on careless, ${signed(threat.strength)} strength.` };
  return { heading: "The Host knows nothing of you yet", detail: "It comes on as it always does." };
}

interface Called {
  def: CampaignDefinition;
  state: CampaignState;
  battle: CampaignBattle;
  scenario: EngineScenario;
  slots: RollSlot[];
  names: Record<string, string>;
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
    const slots = api.rollSlots(def, state, scenario);
    return {
      def,
      state,
      battle,
      scenario,
      slots,
      names: postNames(slots),
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
  const [choosing, setChoosing] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  // Dev captures: no canvas here, so the screen says it is ready itself.
  useEffect(() => {
    if (import.meta.env.DEV) window.__battleBoard = { ready: true, frames: 9999 };
  }, []);
  if (!called) return null;
  const { def, state, scenario, slots, names, entries, threat, recommended } = called;

  const problems = roll().validateAssignment(def, state, scenario, assignment);
  // Carried veterans: at most `limit` take the field in one battle; the rest wait in reserve.
  const veterans = roll().carriedFielded(def, state, assignment);
  const hasVeterans = entries.some((entry) => entry.company.carriedFrom);
  const capReached = veterans.fielded >= veterans.limit;
  const benched = (entry: RollEntry) => Boolean(entry.company.carriedFrom && entry.available && capReached && !slotOf(entry.company.id));
  const entryOf = (id: string | undefined) => entries.find((entry) => entry.company.id === id);
  const slotOf = (companyId: string) => slots.find((slot) => assignment[slot.slotId] === companyId);
  const fits = (slot: RollSlot, entry: RollEntry) => slot.roles.includes(entry.company.role) && (entry.available || slot.locked === entry.company.id);
  const isRecommended = slots.every((slot) => assignment[slot.slotId] === recommended[slot.slotId]);
  const story = threatWords(threat);

  const assign = (slotId: string, companyId: string | null) => {
    setAssignment((now) => {
      const next = { ...now };
      // A company answers one post: take it from wherever it was.
      if (companyId) for (const [key, id] of Object.entries(next)) if (id === companyId && key !== slotId) delete next[key];
      if (companyId) next[slotId] = companyId;
      else delete next[slotId];
      return next;
    });
    setAnnounce(companyId ? `${companyId === LEVY_ID ? "A levy" : entryOf(companyId)?.company.name} called to ${names[slotId]}.` : `${names[slotId]} left empty.`);
    setArmed(null);
    setChoosing(null);
  };

  const onCompany = (entry: RollEntry) => {
    const target = armed ? slots.find((slot) => slot.slotId === armed) : slots.find((slot) => !assignment[slot.slotId] && fits(slot, entry));
    if (target && fits(target, entry) && !target.locked) assign(target.slotId, entry.company.id);
    else if (target && !fits(target, entry)) setAnnounce(`${names[target.slotId]} needs ${roleWords(target)}.`);
  };

  const onDrop = (event: DragEvent, slot: RollSlot) => {
    event.preventDefault();
    const entry = entryOf(event.dataTransfer.getData("text/plain"));
    if (entry && fits(slot, entry) && !slot.locked) assign(slot.slotId, entry.company.id);
  };

  return (
    <div className="screen roll-screen">
      <header className="roll-head">
        <div className="roll-title">
          <p className="bar-stage">{def.title} · Call the Banners</p>
          <h1>{called.battle.title}</h1>
          <section className="roll-threat" aria-label="The Host">
            <Sigil faction="ashen_host" size={30} />
            <div>
              <h2>{story.heading}</h2>
              <p>
                {story.detail} <span className="roll-fixed">Fixed before you choose: your picks do not change it.</span>
              </p>
            </div>
          </section>
        </div>
        <PostMap scenario={scenario} slots={slots} names={names} active={hovered ?? choosing ?? armed} />
      </header>

      <section className="roll-posts" aria-labelledby="posts-title">
        <h2 id="posts-title">The posts, in the order they act</h2>
        <ol>
          {slots.map((slot, index) => {
            const id = assignment[slot.slotId];
            const entry = entryOf(id);
            const problem = problems[slot.slotId];
            const name = names[slot.slotId];
            return (
              <li
                key={slot.slotId}
                className={`post ${armed === slot.slotId ? "armed" : ""} ${problem ? "problem" : ""} ${slot.locked ? "locked" : ""} ${id === LEVY_ID ? "levy" : ""}`}
                onPointerEnter={() => setHovered(slot.slotId)}
                onPointerLeave={() => setHovered(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, slot)}
              >
                <button
                  type="button"
                  className="post-head"
                  aria-pressed={armed === slot.slotId}
                  disabled={Boolean(slot.locked)}
                  onClick={() => setArmed(armed === slot.slotId ? null : slot.slotId)}
                  onFocus={() => setHovered(slot.slotId)}
                  onBlur={() => setHovered(null)}
                  aria-label={`Post ${index + 1}: ${name}, ${slot.flex ? `flex: ${roleWords(slot)}` : roleWords(slot)}`}
                >
                  <span className="post-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="post-roles" aria-hidden="true">
                    {slot.roles.map((role) => (
                      <RoleGlyph key={role} role={role} />
                    ))}
                  </span>
                  <span className="post-label">
                    {name}
                    <span className="post-sub">{slot.flex ? `Flex: ${roleWords(slot)}` : roleWords(slot)}</span>
                  </span>
                  {slot.locked && <Lock size={14} aria-hidden="true" />}
                </button>
                <div className="post-company">
                  {slot.locked ? (
                    <span className="post-called" title={entry ? `${entry.fielded.strength} strength · ${entry.fielded.cohesion} cohesion` : undefined}>
                      <CompanyLine entry={entry} levy={id === LEVY_ID} slot={slot} />
                      <span className="post-lock-note">The story calls it here</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="post-choose"
                      aria-haspopup="listbox"
                      aria-expanded={choosing === slot.slotId}
                      aria-label={`Company for ${name}: ${id === LEVY_ID ? "levy" : (entry?.company.name ?? "none")}`}
                      title={entry ? `${entry.fielded.strength} strength · ${entry.fielded.cohesion} cohesion` : undefined}
                      onClick={() => setChoosing(choosing === slot.slotId ? null : slot.slotId)}
                    >
                      <CompanyLine entry={entry} levy={id === LEVY_ID} slot={slot} />
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                  )}
                  {id && !slot.locked && (
                    <button type="button" className="post-clear" aria-label={`Clear ${name}`} onClick={() => assign(slot.slotId, null)}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {choosing === slot.slotId && (
                  <CompanyChoices
                    name={name}
                    slot={slot}
                    options={entries.filter((item) => fits(slot, item))}
                    current={id}
                    benched={(companyId) => {
                      const option = entryOf(companyId);
                      return Boolean(option && benched(option));
                    }}
                    calledTo={(companyId) => {
                      const at = slotOf(companyId);
                      return at && at.slotId !== slot.slotId ? names[at.slotId] : null;
                    }}
                    onPick={(companyId) => assign(slot.slotId, companyId)}
                    onClose={() => setChoosing(null)}
                  />
                )}
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
        <div className="roll-roster-head">
          <h2 id="roster-title">The Roll</h2>
          {hasVeterans && (
            <p className={`veteran-count ${veterans.fielded > veterans.limit ? "over" : capReached ? "full" : ""}`} role="status">
              Veterans fielded: {veterans.fielded} / {veterans.limit}
            </p>
          )}
        </div>
        <ul>
          {entries.map((entry) => {
            const at = slotOf(entry.company.id);
            const realm = realmOf(entry.company);
            const reserved = benched(entry);
            return (
              <li key={entry.company.id}>
                <button
                  type="button"
                  className={`roll-company ${at ? "called" : ""} ${entry.available ? "" : "out"} ${reserved ? "capped" : ""}`}
                  draggable={entry.available}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", entry.company.id)}
                  onClick={() => onCompany(entry)}
                  onPointerEnter={() => at && setHovered(at.slotId)}
                  onPointerLeave={() => setHovered(null)}
                  disabled={!entry.available}
                  title={`${entry.fielded.strength} strength · ${entry.fielded.cohesion} cohesion`}
                  aria-label={`${entry.company.name}, ${ROLE_NAME[entry.company.role]}, ${entry.condition}${at ? `, called to ${names[at.slotId]}` : reserved ? `, ${VETERAN_CAP_NOTE}` : ""}`}
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
                  <span className="roll-at">{at ? `→ ${names[at.slotId]}` : reserved ? VETERAN_CAP_NOTE : (entry.unavailableReason ?? "In reserve")}</span>
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
          <Shuffle size={14} aria-hidden="true" /> Recommended force
        </button>
        {Object.keys(problems).length > 0 && (
          <p className="roll-problems" role="status">
            {Object.keys(problems).length === 1 ? "One post needs attention." : `${Object.keys(problems).length} posts need attention.`}
          </p>
        )}
        <button type="button" className="btn-quiet" onClick={() => go("campaign")}>
          Back to the map
        </button>
        <button type="button" className="btn-command" disabled={Object.keys(problems).length > 0} onClick={() => fieldBanners(assignment)}>
          <Swords size={15} aria-hidden="true" /> Take the field
        </button>
      </footer>
    </div>
  );
}

/** A post's company in one line: name, condition, rank and renown (numbers on hover). */
function CompanyLine({ entry, levy, slot }: { entry: RollEntry | undefined; levy: boolean; slot: RollSlot }) {
  if (levy) return <span className="post-levy">Levy (no ready company) · {ROLE_NAME[slot.roles[0]]}, Resolve −1</span>;
  if (!entry) return <span className="post-empty">No company called</span>;
  return (
    <span className="post-called">
      <strong>{entry.company.name}</strong> <ConditionBadge condition={entry.condition} />{" "}
      <span className="post-rank">
        {resolveRank(entry.company.resolve)}
        {entry.company.renown && <> · “{entry.company.renown.title}”</>}
      </span>
    </span>
  );
}

/** The companies that can answer a post, as a small list (the keyboard path: arrows, Enter, Escape). */
function CompanyChoices({
  name,
  slot,
  options,
  current,
  calledTo,
  benched,
  onPick,
  onClose,
}: {
  name: string;
  slot: RollSlot;
  options: RollEntry[];
  current: string | undefined;
  calledTo: (companyId: string) => string | null;
  /** A veteran the cap keeps in reserve (it may still be picked; the post then says why not). */
  benched: (companyId: string) => boolean;
  onPick: (companyId: string) => void;
  onClose: () => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"], [role="option"]')?.focus();
  }, []);
  const onKey = (event: KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };
  const ids = [...options.map((entry) => entry.company.id), LEVY_ID];
  return (
    <ul ref={list} className="post-choices" role="listbox" aria-label={`Choose a company for ${name}`} onKeyDown={onKey}>
      {ids.map((id) => {
        const entry = options.find((item) => item.company.id === id);
        const elsewhere = id === LEVY_ID ? null : calledTo(id);
        return (
          <li key={id}>
            <button type="button" role="option" aria-selected={current === id} onClick={() => onPick(id)}>
              {entry ? (
                <>
                  <RoleGlyph role={entry.company.role} size={14} />
                  <span>{entry.company.name}</span>
                  <ConditionBadge condition={entry.condition} />
                  {elsewhere && <span className="choice-elsewhere">now at {elsewhere}</span>}
                  {!elsewhere && benched(id) && <span className="choice-elsewhere">veteran cap reached</span>}
                </>
              ) : (
                <span className="post-levy">Levy (no ready company) · {ROLE_NAME[slot.roles[0]]}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
