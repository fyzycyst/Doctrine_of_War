import { useGame } from "../game/gameStore";

/** Deployment instructions, the last rejection reason, and the button that starts phase 1 planning. */
export function DeployBar() {
  const notice = useGame((s) => s.notice);
  const confirm = useGame((s) => s.confirmDeployment);

  return (
    <div className="deploy-bar">
      <div>
        <p className="deploy-title">Deploy your companies</p>
        <p className="deploy-help">Your companies start in position. To move one, choose it, then a hex in your deployment zone.</p>
        <p className="deploy-notice" role="status" aria-live="polite">
          {notice}
        </p>
      </div>
      <button type="button" className="btn-command" onClick={confirm}>
        March to positions
      </button>
    </div>
  );
}
