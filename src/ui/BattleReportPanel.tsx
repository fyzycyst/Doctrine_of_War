import type { BattleReport } from "../game/types";

export function BattleReportPanel({ report }: { report?: BattleReport }) {
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
      <div className="panel-heading">
        <span>Battle Report</span>
        <h2 id="report-title">{report.title}</h2>
      </div>
      <ReportList title="Casualties" items={report.casualties} />
      <ReportList title="Cohesion" items={report.cohesionChanges} />
      <ReportList title="Objective" items={report.objectiveChanges} />
      <ReportList title="Command Notes" items={report.notes} />
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
