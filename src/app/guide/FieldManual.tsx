// The Field Manual (T26): How to play grown into the game's Help, a few short pages drawn
// with the game's own pieces. Generated where it can be: the Doctrines page is the doctrine
// library, the Controls page is the shortcut table, the campaigns are the installed packs,
// and every number is the engine's constant, so none of it can drift out of date.
import { useRef, type KeyboardEvent } from "react";
import { CARRY_OVER_MAX, CARRY_RESOLVE, DEFAULT_MAX_CARRIED_FIELDED, REFORMED_RESOLVE, WORN_PENALTY } from "../../game/campaign";
import { MAX_ASIDES } from "../../game/campaign/saveFiles";
import { doctrineLibrary, type Doctrine, type SquadRole } from "../../game/engine";
import { useFlow, type HelpPageId } from "../flow/flowStore";
import { resolveRank } from "../game/view";
import { ConditionBadge } from "../roll/CallTheBanners";
import { packs } from "../roll/api";
import { REALMS } from "../roll/realms";
import { comboLabel, SHORTCUTS } from "../shortcuts";
import { DoctrineCardFace } from "../ui/DoctrineCard";
import { RoleGlyph, ROLE_NAME } from "../ui/glyphs";
import { Modal } from "../ui/Modal";
import { CALL_HELP_COPY } from "./CallHelp";
import { HowToPlayPage } from "./HowToPlay";

export const HELP_PAGES: { id: HelpPageId; title: string }[] = [
  { id: "play", title: "How to play" },
  { id: "doctrines", title: "Doctrines" },
  { id: "companies", title: "Your companies" },
  { id: "call", title: "Call the Banners" },
  { id: "modes", title: "Modes" },
  { id: "editor", title: "The doctrine editor" },
  { id: "controls", title: "Controls" },
];

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

export function FieldManual({ onClose }: { onClose: () => void }) {
  const page = useFlow((s) => s.helpPage);
  const openHelp = useFlow((s) => s.openHelp);
  const tabs = useRef<HTMLDivElement>(null);
  const current = HELP_PAGES.find((item) => item.id === page) ?? HELP_PAGES[0];
  const at = HELP_PAGES.indexOf(current);
  const go = (index: number) => {
    const next = HELP_PAGES[(index + HELP_PAGES.length) % HELP_PAGES.length];
    openHelp(next.id);
    requestAnimationFrame(() => tabs.current?.querySelector<HTMLElement>(`[data-page="${next.id}"]`)?.focus());
  };
  const onTabKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      // From the tab that has focus (it may not be the open one).
      const from = HELP_PAGES.findIndex((item) => item.id === (event.target as HTMLElement).dataset.page);
      go((from < 0 ? at : from) + (event.key === "ArrowRight" ? 1 : -1));
    }
  };
  const firstTab = useRef<HTMLButtonElement>(null);

  return (
    <Modal className="howto manual" labelledBy="manual-title" initialFocus={firstTab} onCancel={onClose}>
      <header className="howto-head">
        <p className="scroll-eyebrow">Field manual</p>
        <h2 id="manual-title">{current.title}</h2>
        <div ref={tabs} className="manual-tabs" role="tablist" aria-label="Field manual pages" onKeyDown={onTabKey}>
          {HELP_PAGES.map((item) => (
            <button
              key={item.id}
              ref={item.id === current.id ? firstTab : undefined}
              type="button"
              role="tab"
              data-page={item.id}
              id={`manual-tab-${item.id}`}
              aria-selected={item.id === current.id}
              aria-controls="manual-page"
              tabIndex={item.id === current.id ? 0 : -1}
              onClick={() => openHelp(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </header>

      <div id="manual-page" className={`manual-page page-${current.id}`} role="tabpanel" aria-labelledby={`manual-tab-${current.id}`}>
        {page === "play" && <HowToPlayPage />}
        {page === "doctrines" && <DoctrinesPage />}
        {page === "companies" && <CompaniesPage />}
        {page === "call" && <CallPage />}
        {page === "modes" && <ModesPage />}
        {page === "editor" && <EditorPage />}
        {page === "controls" && <ControlsPage />}
      </div>

      <footer className="howto-foot">
        <button type="button" className="btn-command" onClick={onClose}>
          Back
        </button>
      </footer>
    </Modal>
  );
}

const SIDES: { faction: Doctrine["faction"]; title: string; note: string }[] = [
  { faction: "free_banners", title: "Your doctrines", note: "The standing orders you can give. Each battle offers some of them." },
  {
    faction: "ashen_host",
    title: "The Host's doctrines",
    note: "The Host is the enemy, the Ashen Host. In battle you see its orders only on its companies you can see.",
  },
];

/** Every doctrine in the library, by side: its card face and what it is for. */
function DoctrinesPage() {
  const all = Object.values(doctrineLibrary);
  const sides = [...SIDES, ...[...new Set(all.map((doctrine) => doctrine.faction))].filter((faction) => !SIDES.some((side) => side.faction === faction)).map((faction) => ({ faction, title: "Other doctrines", note: "" }))];
  return (
    <div className="manual-doctrines">
      <p className="manual-lede">Read a card top to bottom: each beat, a company follows the first rule that fits. Under each card, the order&apos;s spirit in a line.</p>
      {sides.map((side) => (
        <section key={side.faction} className="howto-panel wide" aria-labelledby={`side-${side.faction}`}>
          <h3 id={`side-${side.faction}`}>{side.title}</h3>
          {side.note && <p className="manual-note">{side.note}</p>}
          <ul className="manual-cards">
            {all
              .filter((doctrine) => doctrine.faction === side.faction)
              .map((doctrine) => (
                <li key={doctrine.id} data-doctrine={doctrine.id}>
                  <div className="doctrine-card flat howto-card">
                    <DoctrineCardFace doctrine={doctrine} compact />
                  </div>
                  <p className="manual-flavor">{doctrine.flavor}</p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const ROLES: SquadRole[] = ["frontline", "cavalry", "skirmish", "support", "siege"];

function CompaniesPage() {
  return (
    <div className="howto-grid">
      <section className="howto-panel" aria-labelledby="c-rank">
        <h3 id="c-rank">Rank: how steady</h3>
        <ul className="howto-ranks">
          {[-3, -2, -1, 0, 1, 2, 3].map((resolve) => (
            <li key={resolve} className={resolve === 3 ? "top" : ""}>
              {resolveRank(resolve)} <span className="mono">{signed(resolve)}</span>
            </li>
          ))}
        </ul>
        <p>
          The rank word is a company&apos;s <strong>Resolve</strong>, its nerve. It grows with each battle survived; at +3 a company earns a name,
          its renown.
        </p>
      </section>

      <section className="howto-panel" aria-labelledby="c-condition">
        <h3 id="c-condition">Condition: how ready</h3>
        <dl className="manual-conditions">
          <dt>
            <ConditionBadge condition="fresh" />
          </dt>
          <dd>Ready, at full strength.</dd>
          <dt>
            <ConditionBadge condition="worn" />
          </dt>
          <dd>
            After a battle you won or held: it routed, or ended under half its strength. It fights {WORN_PENALTY.strength} points of strength and{" "}
            {WORN_PENALTY.cohesion} of cohesion down until it rests.
          </dd>
          <dt>
            <ConditionBadge condition="reforming" />
          </dt>
          <dd>
            Destroyed: raised again at Resolve {REFORMED_RESOLVE}, its renown lost. It sits out the next battle.
          </dd>
        </dl>
        <p>
          Rank and condition are separate: a Hardened company can still be Worn. Only Call the Banners campaigns track condition; Ash &amp;
          Banner&apos;s fixed army does not.
        </p>
      </section>

      <section className="howto-panel" aria-labelledby="c-rest">
        <h3 id="c-rest">Rest and the levy</h3>
        <p>
          A company left in reserve for a battle you win (or hold to a stalemate) comes back <strong>Fresh</strong>. A lost battle is fought
          again, and changes no one&apos;s condition. If no ready company can hold a post, a nameless <strong>levy</strong> does, at Resolve −1.
        </p>
      </section>

      <section className="howto-panel" aria-labelledby="c-veterans">
        <h3 id="c-veterans">Carried companies</h3>
        <p>
          Starting a Call the Banners campaign, you may bring up to {CARRY_OVER_MAX} companies from one you have completed (the screen calls
          them veterans). Their Resolve carries between {signed(CARRY_RESOLVE.min)} and {signed(CARRY_RESOLVE.max)}, so a Veteran +3 arrives
          as {resolveRank(CARRY_RESOLVE.max)} {signed(CARRY_RESOLVE.max)}; their renown is kept. At most {DEFAULT_MAX_CARRIED_FIELDED} take the
          field in any one battle; the rest wait in reserve.
        </p>
      </section>

      <section className="howto-panel" aria-labelledby="c-realms">
        <h3 id="c-realms">Realms</h3>
        <dl className="manual-realms">
          {Object.values(REALMS).map((realm) => (
            <div key={realm.name}>
              <dt>{realm.name}</dt>
              <dd>{realm.temperament}</dd>
            </div>
          ))}
        </dl>
        <p>On the Roll, the line under a company gives its rank, then its home realm. Each realm&apos;s companies lean the way it says.</p>
      </section>

      <section className="howto-panel" aria-labelledby="c-roles">
        <h3 id="c-roles">Roles</h3>
        <ul className="manual-roles">
          {ROLES.map((role) => (
            <li key={role}>
              <RoleGlyph role={role} /> {ROLE_NAME[role]}
            </li>
          ))}
        </ul>
        <p>The icon beside a company or a post is its role. A post takes only its own role (a Flex post, either of two).</p>
      </section>
    </div>
  );
}

/** A numbered marker, as on "How the call works". */
const Mark = ({ n }: { n: number }) => (
  <span className="call-help-number manual-mark" aria-hidden="true">
    {n}
  </span>
);

/** "How the call works", as a page: the screen in miniature, drawn with its own pieces, and the four notes. */
function CallPage() {
  return (
    <div className="manual-call">
      <figure className="manual-call-sample" aria-label="Call the Banners in miniature">
        <div className="roll-threat manual-mini-host">
          <div>
            <h2>The Host knows nothing of you yet</h2>
            <p>It comes on as it always does.</p>
          </div>
          <Mark n={4} />
        </div>
        <div className="manual-mini-columns">
          <span>
            Posts <Mark n={1} />
          </span>
          <span>
            Company selection <Mark n={2} />
          </span>
        </div>
        <ol className="manual-mini-posts">
          {[
            { n: 1, name: "The West Causeway", roles: ["frontline"] as SquadRole[], sub: "Takes: Line infantry", company: "Coldwater Shields", rank: "Tested" },
            { n: 2, name: "The Causeway Van", roles: ["cavalry", "frontline"] as SquadRole[], sub: "Flex: Cavalry or Line infantry", company: "Sunward Lances", rank: "Green" },
          ].map((post) => (
            <li key={post.n} className="post">
              <span className="post-head">
                <span className="post-number">{post.n}</span>
                <span className="post-roles">
                  {post.roles.map((role) => (
                    <RoleGlyph key={role} role={role} />
                  ))}
                </span>
                <span className="post-label">
                  {post.name}
                  <span className="post-sub">{post.sub}</span>
                </span>
              </span>
              <span className="post-company">
                <span className="post-choose">
                  <span className="post-called">
                    <strong>{post.company}</strong> <ConditionBadge condition="fresh" /> <span className="post-rank">{post.rank}</span>
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="manual-mini-roll">
          <span className="manual-mini-label">
            The Roll <Mark n={3} />
          </span>
          <span className="manual-mini-entry">
            <RoleGlyph role="frontline" /> <strong>Coldwater Shields</strong> <ConditionBadge condition="fresh" /> <em>→ The West Causeway</em>
          </span>
          <span className="manual-mini-entry">
            <RoleGlyph role="frontline" /> <strong>Thornwick Spears</strong> <ConditionBadge condition="worn" /> <em>In reserve</em>
          </span>
        </div>
        <span className="manual-mini-recommended">
          <span className="btn-quiet">Recommended force</span> <Mark n={4} />
        </span>
        <figcaption>Before each battle of a Call the Banners campaign: choose which company holds each post, then Take the field.</figcaption>
      </figure>
      <ol className="manual-call-notes">
        {CALL_HELP_COPY.map((note) => (
          <li key={note.title} className="howto-panel">
            <h3>{note.title}</h3>
            <p>{note.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ModesPage() {
  const campaigns = packs().packs.flatMap((pack) => pack.campaigns);
  return (
    <div className="howto-grid">
      <section className="howto-panel" aria-labelledby="m-campaigns">
        <h3 id="m-campaigns">Campaigns</h3>
        <ul className="manual-list">
          {campaigns.map((def) => (
            <li key={def.id}>
              <strong>{def.title}</strong>: {def.mode === "roll" ? "Call the Banners, choosing your companies for each battle" : "the defence, with a fixed army"}.
            </li>
          ))}
        </ul>
        <p>Choose a campaign from the title. Companies carry their Resolve and renown from battle to battle.</p>
      </section>

      <section className="howto-panel" aria-labelledby="m-saves">
        <h3 id="m-saves">Saves</h3>
        <p>
          Each campaign keeps its own save, written after every battle; the one before it is kept as a backup. If this version of the game
          cannot continue a run, it is kept as it is: restore the backup, or set the run aside and start again. Set-aside runs are never
          deleted: a campaign keeps up to {MAX_ASIDES}, and asks you to export or remove one before setting aside another.
        </p>
      </section>

      <section className="howto-panel" aria-labelledby="m-skirmish">
        <h3 id="m-skirmish">Skirmish</h3>
        <p>
          Fight any battle of any campaign again, on a fresh fortune each time. Every skirmish starts with the battle&apos;s default forces: its
          own companies, all fresh, with no veterans. The Host comes at its usual strength. Nothing is saved.
        </p>
      </section>

      <section className="howto-panel wide" aria-labelledby="m-support">
        <h3 id="m-support">Reporting a problem</h3>
        <p>
          Settings → Export save file copies a campaign&apos;s save to send with a bug report. Show battle details puts each battle&apos;s seed on
          screen.
        </p>
      </section>
    </div>
  );
}

function EditorPage() {
  return (
    <div className="howto-grid">
      <section className="howto-panel" aria-labelledby="e-open">
        <h3 id="e-open">Your own doctrines</h3>
        <p>
          Open the Doctrine editor from the title, or choose <strong>Edit a copy…</strong> on a card in a company&apos;s hand. Reorder the rules
          (the first that fits fires) and tune their thresholds. A saved copy joins the hand.
        </p>
      </section>

      <section className="howto-panel" aria-labelledby="e-test">
        <h3 id="e-test">Test in the field</h3>
        <p>
          In the editor, <strong>Test in the field</strong> plays the battle many times with your copy and with the original, on the same fortunes, and compares how often each wins. If it is
          not yet sure, <strong>Run longer</strong> plays more.
        </p>
      </section>

      <section className="howto-panel" aria-labelledby="e-verdict">
        <h3 id="e-verdict">Reading the verdict</h3>
        <dl className="manual-verdicts">
          <dt>Clearly better / Clearly worse</dt>
          <dd>Your copy wins more (or less) often than the original, and the difference holds up.</dd>
          <dt>Slightly better (or worse), not certain</dt>
          <dd>It leans one way, but could still be luck: Run longer to be sure.</dd>
          <dt>No real difference</dt>
          <dd>The two play about the same.</dd>
        </dl>
      </section>
    </div>
  );
}

/** Every shortcut, from the same table the key handlers use. */
function ControlsPage() {
  return (
    <table className="manual-controls">
      <thead>
        <tr>
          <th scope="col">Keys</th>
          <th scope="col">Does</th>
          <th scope="col">Where</th>
        </tr>
      </thead>
      <tbody>
        {SHORTCUTS.map((shortcut) => (
          <tr key={shortcut.id}>
            <td>
              {shortcut.combos.map((combo, index) => (
                <span key={index}>
                  {index > 0 && " or "}
                  <kbd>{comboLabel(combo)}</kbd>
                </span>
              ))}
            </td>
            <td>{shortcut.does}</td>
            <td>{shortcut.where}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
