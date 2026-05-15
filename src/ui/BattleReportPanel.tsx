import { useState } from "react";
import type { BattleReport } from "../game/types";

export function BattleReportPanel({ report }: { report?: BattleReport }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!report) {
    return (
      <section className="panel report-panel" aria-labelledby="report-title">
        <div className="panel-heading">
          <span>Battle Report</span>
          <h2 id="report-title">Awaiting First Clash</h2>
        </div>
        <p className="empty-report">Commit orders to see casualties, cohesion, objective progress, and command notes.</p>
      </section>
    );
  }

  return (
    <section className="panel report-panel" aria-labelledby="report-title">
      <div className="panel-heading report-heading">
        <div>
          <span>Battle Report</span>
          <h2 id="report-title">{report.title}</h2>
        </div>
        <button
          className="report-toggle"
          type="button"
          aria-controls="report-details"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? "Expand Report" : "Collapse Report"}
        </button>
      </div>
      {!collapsed && (
        <div id="report-details">
          <ReportList title="Casualties" items={report.casualties} />
          <ReportList title="Cohesion" items={report.cohesionChanges} />
          <ReportList title="Objective" items={report.objectiveChanges} />
          <ReportList title="Command Notes" items={report.notes} />
        </div>
      )}
    </section>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="report-block">
      <h3>{title}</h3>
      <ul>
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li>No major change.</li>}
      </ul>
    </div>
  );
}
