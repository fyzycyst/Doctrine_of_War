// The doctrine editor (T16, Experimental): cut your own copy of a doctrine by
// reordering its standing orders and moving their thresholds within the engine's
// bounds. Nothing else can change. A live card shows the result as it will play.
import { ArrowDown, ArrowUp, GripVertical, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  deriveDoctrine,
  doctrineLibrary,
  EDITABLE_DOCTRINE_IDS,
  editableParams,
  unreachableRules,
  type Condition,
  type Doctrine,
  type DoctrineVariant,
} from "../../game/engine";
import { useGame } from "../game/gameStore";
import { splitRule } from "../game/view";
import { DoctrineCardFace, ExperimentalBadge } from "../ui/DoctrineCard";
import { Modal } from "../ui/Modal";
import type { EditorTarget } from "../flow/flowStore";
import { FieldTestPanel } from "./FieldTestPanel";
import { useVariants, variantId } from "./variantStore";

interface Draft {
  baseId: string;
  /** The saved variant being edited, or null for a new one. */
  id: string | null;
  name: string;
  order: string[];
  params: DoctrineVariant["params"];
}

function fresh(baseId: string): Draft {
  const base = doctrineLibrary[baseId];
  return { baseId, id: null, name: `${base.name} (my cut)`, order: base.rules.map((rule) => rule.id), params: {} };
}

function fromVariant(variant: DoctrineVariant): Draft {
  return { baseId: variant.baseId, id: variant.id, name: variant.name, order: [...variant.order], params: structuredClone(variant.params) };
}

/** What a threshold is called on its stepper. */
function paramName(kind: Condition["kind"], param: string): string {
  if (param === "range") return "Within (hexes)";
  if (param === "minRange") return "At least (hexes)";
  if (kind === "selfStrengthBelow") return "Strength below";
  if (kind === "allyAdjacentBelow" || kind === "allyBelow") return "Ally cohesion below";
  if (kind === "enemyBelow") return "Enemy cohesion below";
  return "Cohesion below";
}

export function DoctrineEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const variants = useVariants((s) => s.variants);
  const storeNotice = useVariants((s) => s.notice);
  const saveVariant = useVariants((s) => s.save);
  const removeVariant = useVariants((s) => s.remove);
  const inBattle = useGame((s) => s.stage === "command" || s.stage === "deploy");
  const [draft, setDraft] = useState<Draft>(() => {
    const existing = variants.find((item) => item.variant.id === target.variantId);
    if (existing) return fromVariant(existing.variant);
    return fresh(target.baseId && EDITABLE_DOCTRINE_IDS.includes(target.baseId) ? target.baseId : EDITABLE_DOCTRINE_IDS[0]);
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [announce, setAnnounce] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const rows = useRef<HTMLOListElement>(null);
  const dragFrom = useRef<number | null>(null);

  const base = doctrineLibrary[draft.baseId];
  const preview: Doctrine = useMemo(
    () => deriveDoctrine(base, { id: draft.id ?? "v-preview", name: draft.name || base.name, order: draft.order, params: draft.params }),
    [base, draft],
  );
  const unreachable = unreachableRules(preview);
  const rulesById = new Map(base.rules.map((rule) => [rule.id, rule]));
  const edited = draft.order.some((id, index) => id !== base.rules[index].id) || Object.keys(draft.params).length > 0;

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors([]);
    setSavedNote(null);
  };

  const move = (from: number, to: number, focus = false) => {
    if (to < 0 || to >= draft.order.length || from === to) return;
    const order = [...draft.order];
    const [ruleId] = order.splice(from, 1);
    order.splice(to, 0, ruleId);
    update({ order });
    setAnnounce(`Moved “${rulesById.get(ruleId)!.label}” to position ${to + 1} of ${order.length}.`);
    // Moving a node blurs it; put focus back on the row once React has re-ordered the list.
    if (focus) setTimeout(() => rows.current?.querySelectorAll<HTMLElement>("li[data-rule]")[to]?.focus());
  };

  const onRowKey = (event: KeyboardEvent, index: number) => {
    if (event.target !== event.currentTarget) return;
    const up = event.key === "ArrowUp";
    const down = event.key === "ArrowDown";
    if (!up && !down) return;
    event.preventDefault();
    const to = index + (up ? -1 : 1);
    if (event.altKey) {
      move(index, to, true);
    } else {
      rows.current?.querySelectorAll<HTMLElement>("li[data-rule]")[to]?.focus();
    }
  };

  const setParam = (ruleId: string, param: string, value: number, original: number) => {
    const rule = { ...(draft.params[ruleId] ?? {}) };
    if (value === original) delete rule[param];
    else rule[param] = value;
    const params = { ...draft.params };
    if (Object.keys(rule).length) params[ruleId] = rule;
    else delete params[ruleId];
    update({ params });
  };

  const save = async () => {
    const taken = variants.map((item) => item.variant.id).filter((id) => id !== draft.id);
    const id = draft.id ?? variantId(draft.baseId, draft.name, taken);
    const result = await saveVariant({ id, baseId: draft.baseId, name: draft.name.trim(), order: draft.order, params: draft.params });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setDraft(fromVariant(result.variant));
    if (target.squadId && !draft.id) {
      useGame.getState().assignDoctrine(target.squadId, result.variant.id);
      setSavedNote(`Saved, and ordered for this company. It is in your hand.`);
    } else {
      setSavedNote(inBattle ? "Saved. It is in your hand wherever its doctrine is allowed." : "Saved. It will be in your hand wherever its doctrine is allowed.");
    }
  };

  const onDragStart = (event: DragEvent, index: number) => {
    dragFrom.current = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draft.order[index]);
  };
  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragFrom.current !== null) move(dragFrom.current, index);
    dragFrom.current = null;
  };

  return (
    <Modal className="modal editor" labelledBy="editor-title" describedBy="editor-help" initialFocus={close} onCancel={onClose}>
      <header className="editor-head">
        <h2 id="editor-title">Doctrine editor</h2>
        <ExperimentalBadge />
      </header>
      <p id="editor-help" className="editor-help">
        Cut your own copy of a doctrine: reorder its standing orders and move their thresholds. Each beat a company follows the first order
        that applies. Variants play wherever their doctrine is allowed, and your campaign notes that custom orders were used.
      </p>
      {storeNotice && <p className="editor-notice">{storeNotice}</p>}

      <div className="editor-grid">
        <section className="editor-side" aria-label="Doctrines">
          <label className="editor-field">
            <span>Cut from</span>
            <select
              value={draft.id ? "" : draft.baseId}
              onChange={(event) => {
                setDraft(fresh(event.target.value));
                setErrors([]);
                setSavedNote(null);
              }}
            >
              {draft.id && <option value="">(editing a saved variant)</option>}
              {EDITABLE_DOCTRINE_IDS.map((id) => (
                <option key={id} value={id}>
                  {doctrineLibrary[id].name}
                </option>
              ))}
            </select>
          </label>
          <p className="editor-label">Your variants</p>
          {variants.length === 0 ? (
            <p className="editor-empty">None yet.</p>
          ) : (
            <ul className="editor-variants">
              {variants.map(({ variant }) => (
                <li key={variant.id}>
                  <button type="button" aria-pressed={variant.id === draft.id} onClick={() => setDraft(fromVariant(variant))}>
                    <span>{variant.name}</span>
                    <span className="editor-of">of {doctrineLibrary[variant.baseId].name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="editor-main" aria-labelledby="editor-rules-title">
          <p id="editor-rules-title" className="editor-label">
            Standing orders, first to last
          </p>
          <p className="editor-keys">Drag a row, use the arrows, or focus a row and press Alt + ↑ / ↓.</p>
          <ol ref={rows} className="editor-rules">
            {draft.order.map((ruleId, index) => {
              const rule = preview.rules[index];
              const { when, then } = splitRule(rule.label);
              const baseRule = rulesById.get(ruleId)!;
              const dead = unreachable.includes(ruleId);
              return (
                <li
                  key={ruleId}
                  data-rule={ruleId}
                  tabIndex={0}
                  draggable
                  className={dead ? "unreachable" : ""}
                  aria-label={`Order ${index + 1} of ${draft.order.length}: ${rule.label}${dead ? " (never fires)" : ""}`}
                  onKeyDown={(event) => onRowKey(event, index)}
                  onDragStart={(event) => onDragStart(event, index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => onDrop(event, index)}
                >
                  <GripVertical className="grip" size={16} aria-hidden="true" />
                  <span className="editor-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="editor-rule">
                    {when && <span className="rule-when">{when} </span>}
                    <span className="rule-then">→ {then}</span>
                    {editableParams(baseRule).map(({ param, value: original, bound }) => {
                      const value = draft.params[ruleId]?.[param] ?? original;
                      const name = paramName(baseRule.when.kind, param);
                      return (
                        <span key={param} className="stepper" role="group" aria-label={`${name}, order ${index + 1}`}>
                          <span className="stepper-name">{name}</span>
                          <button
                            type="button"
                            aria-label={`Lower to ${value - bound.step}`}
                            disabled={value - bound.step < bound.min}
                            onClick={() => setParam(ruleId, param, value - bound.step, original)}
                          >
                            <Minus size={13} aria-hidden="true" />
                          </button>
                          <output aria-live="polite">{value}</output>
                          <button
                            type="button"
                            aria-label={`Raise to ${value + bound.step}`}
                            disabled={value + bound.step > bound.max}
                            onClick={() => setParam(ruleId, param, value + bound.step, original)}
                          >
                            <Plus size={13} aria-hidden="true" />
                          </button>
                          <span className="stepper-bounds">
                            {bound.min}–{bound.max}
                            {value !== original && <> · was {original}</>}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                  <span className="editor-move">
                    <button type="button" aria-label={`Move order ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move order ${index + 1} down`}
                      disabled={index === draft.order.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          {unreachable.length > 0 && (
            <p className="editor-warn" role="note">
              <TriangleAlert size={14} aria-hidden="true" /> Orders below an “Otherwise” never fire.
            </p>
          )}
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
        </section>

        <section className="editor-preview" aria-label="Preview">
          <p className="editor-label">As it will play</p>
          <div className="doctrine-card flat">
            <DoctrineCardFace doctrine={preview} />
          </div>
          <label className="editor-field">
            <span>Name</span>
            <input value={draft.name} maxLength={60} onChange={(event) => update({ name: event.target.value })} />
          </label>
          {errors.length > 0 && (
            <ul className="editor-errors" role="alert">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {savedNote && (
            <p className="editor-saved" role="status">
              {savedNote}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-command" disabled={!edited && !draft.id} onClick={save}>
              {draft.id ? "Save changes" : "Save variant"}
            </button>
            {draft.id && (
              <button
                type="button"
                className="btn-quiet"
                onClick={async () => {
                  // Storage refused: keep the draft (the variant is still saved) and say why.
                  if (!(await removeVariant(draft.id!))) {
                    setErrors([`Not deleted. ${useVariants.getState().notice ?? "Your variants could not be saved."}`]);
                    return;
                  }
                  setDraft(fresh(draft.baseId));
                  setErrors([]);
                  setSavedNote(null);
                }}
              >
                <Trash2 size={14} aria-hidden="true" /> Delete
              </button>
            )}
            <button ref={close} type="button" className="btn-quiet" onClick={onClose}>
              Close
            </button>
          </div>
          {!edited && !draft.id && <p className="editor-hint">Change the order or a threshold to cut a variant.</p>}
        </section>
      </div>

      {inBattle && <FieldTestPanel baseId={draft.baseId} variant={preview} squadId={target.squadId} edited={edited} />}
    </Modal>
  );
}
