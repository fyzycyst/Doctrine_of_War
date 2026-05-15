import { RotateCcw } from "lucide-react";

export function ActionBar({
  onCommit,
  onRestart,
  disabled,
}: {
  onCommit: () => void;
  onRestart: () => void;
  disabled: boolean;
}) {
  return (
    <div className="actions">
      <button className="primary-action" type="button" onClick={onCommit} disabled={disabled}>
        Commit Phase
      </button>
      <button className="secondary-action" type="button" onClick={onRestart}>
        <RotateCcw aria-hidden="true" />
        Restart
      </button>
    </div>
  );
}
