import { useRef, useState, type ReactNode } from "react";
import { useAudioStore } from "../audioStore";
import { useGame } from "../game/gameStore";
import { useSettings, type QualitySetting } from "../settingsStore";
import type { DofMode, MotionPreference } from "../store";
import { useFlow } from "../flow/flowStore";
import { useGuide } from "../guide/guideStore";
import { exportSave } from "../support";
import { Modal } from "./Modal";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <p className="settings-title">{title}</p>
        {help && <p className="settings-help">{help}</p>}
      </div>
      {children}
    </div>
  );
}

const QUALITY: { value: QualitySetting; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" },
];
const DOF: { value: DofMode; label: string }[] = [
  { value: "on", label: "On" },
  { value: "subtle", label: "Subtle" },
  { value: "off", label: "Off" },
];
const MOTION: { value: MotionPreference; label: string }[] = [
  { value: "system", label: "Like my system" },
  { value: "reduce", label: "Reduced" },
  { value: "full", label: "Full" },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const muted = useAudioStore((s) => s.muted);
  const volume = useAudioStore((s) => s.volume);
  const setMuted = useAudioStore((s) => s.setMuted);
  const setVolume = useAudioStore((s) => s.setVolume);
  const musicVolume = useAudioStore((s) => s.musicVolume);
  const setMusicVolume = useAudioStore((s) => s.setMusicVolume);
  const setPace = useGame((s) => s.setPace);
  const close = useRef<HTMLButtonElement>(null);
  const setHowToOpen = useFlow((s) => s.setHowToOpen);
  const setEditor = useFlow((s) => s.setEditor);
  const saveStore = useFlow((s) => s.store);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const exportCopy = async () => {
    setExportNote(null);
    try {
      const outcome = await exportSave(saveStore);
      setExportNote(outcome === "exported" ? "Save file exported." : outcome === "no-save" ? "There is no saved campaign yet." : null);
    } catch (error) {
      setExportNote(`The save file could not be exported (${error instanceof Error ? error.message : "unknown error"}).`);
    }
  };
  const resetGuide = useGuide((s) => s.reset);
  const guideFresh = useGuide((s) => !s.introSeen && s.coach === "active" && s.step === "select");

  return (
    <Modal className="modal settings" labelledBy="settings-title" initialFocus={close} onCancel={onClose}>
      <h2 id="settings-title">Settings</h2>

      <Row title="Graphics" help="Low drops bloom and tilt-shift for older Macs. Ultra renders at full display resolution.">
        <Segmented label="Graphics quality" value={settings.quality} options={QUALITY} onChange={(quality) => settings.set({ quality })} />
      </Row>

      <Row title="Sound">
        <div className="settings-audio">
          <label className="check">
            <input type="checkbox" aria-label="Sound" checked={!muted} onChange={(event) => setMuted(!event.target.checked)} /> On
          </label>
          <label className="volume">
            <span className="sr-only">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              disabled={muted}
              aria-label="Volume"
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
            />
          </label>
        </div>
      </Row>

      <Row title="Music" help="The background score, under the master volume.">
        <label className="volume">
          <span className="sr-only">Music volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(musicVolume * 100)}
            disabled={muted}
            aria-label="Music volume"
            onChange={(event) => setMusicVolume(Number(event.target.value) / 100)}
          />
        </label>
      </Row>

      <Row title="Depth of field" help="The tilt-shift blur at the board's edges. Subtle keeps your companies sharp; Off turns it off.">
        <Segmented label="Depth of field" value={settings.depthOfField} options={DOF} onChange={(depthOfField) => settings.set({ depthOfField })} />
      </Row>

      <Row title="Battle pace" help="How fast each phase plays out. You can still switch during a battle.">
        <Segmented
          label="Default battle pace"
          value={settings.defaultPace}
          options={[
            { value: "readable", label: "Readable" },
            { value: "fast", label: "Fast" },
          ]}
          onChange={(defaultPace) => {
            settings.set({ defaultPace });
            setPace(defaultPace);
          }}
        />
      </Row>

      <Row
        title="Doctrine only"
        help="Turns off friction and fortune: no courage or wavering, no shifting weather, no fog of war, no dread. Every battle then plays out exactly as your doctrines dictate. Applies to battles you begin from now on."
      >
        <label className="check">
          <input
            type="checkbox"
            aria-label="Doctrine only"
            checked={settings.doctrineOnly}
            onChange={(event) => settings.set({ doctrineOnly: event.target.checked })}
          />{" "}
          On
        </label>
      </Row>

      <Row title="Motion" help="Reduced keeps callouts and cuts, but stops camera moves, drift and shakes.">
        <Segmented label="Motion" value={settings.motion} options={MOTION} onChange={(motion) => settings.set({ motion })} />
      </Row>

      <Row title="Guidance" help="The field manual, or the first battle's guide again (it shows on your next First Breach).">
        <div className="settings-audio">
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              onClose();
              setHowToOpen(true);
            }}
          >
            How to play
          </button>
          <button type="button" className="btn-quiet" disabled={guideFresh} onClick={resetGuide}>
            {guideFresh ? "Guide ready" : "Show the guide again"}
          </button>
        </div>
      </Row>

      <Row title="Doctrine editor" help="Experimental. Cut your own copy of a doctrine: reorder its orders, move its thresholds.">
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            onClose();
            setEditor({});
          }}
        >
          Open the editor
        </button>
      </Row>

      <h3 className="settings-section">Support</h3>
      <Row title="Show battle details" help="Shows each battle's seed in the top bar, reports and results. Useful when reporting a bug.">
        <label className="check">
          <input
            type="checkbox"
            aria-label="Show battle details"
            checked={settings.showBattleDetails}
            onChange={(event) => settings.set({ showBattleDetails: event.target.checked })}
          />{" "}
          On
        </label>
      </Row>
      <Row title="Export save file" help="Saves a copy of your campaign to send with a bug report.">
        <div className="settings-audio">
          <button type="button" className="btn-quiet" onClick={exportCopy}>
            Export save file…
          </button>
        </div>
      </Row>
      {exportNote && (
        <p className="settings-help" role="status">
          {exportNote}
        </p>
      )}

      <div className="modal-actions">
        <button ref={close} type="button" className="btn-command" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
