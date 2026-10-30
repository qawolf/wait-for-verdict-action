import { describeVerdict, runsToShow } from "./describeVerdict.js";
import type { DeploymentVerdict, Outcome, VerdictRun } from "./types.js";

const outcomeTitles: Record<Outcome, string> = {
  "canceled-by-caller": "🚫 Canceled",
  failed: "❌ Failed",
  "invalid-response-body": "⚠️ Unreadable answer",
  "needs-review": "❓ Needs review",
  "network-error": "⚠️ Network error",
  "not-found": "⚠️ Deployment not found",
  "not-tested": "⚪ Not tested",
  passed: "✅ Passed",
  "run-canceled": "🚫 Run canceled",
  "server-error": "⚠️ Server error",
  superseded: "⏭️ Superseded",
  "timed-out": "⏱️ Timed out",
  unauthorized: "⚠️ Unauthorized",
  "unexpected-status": "⚠️ Unexpected answer",
};

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function link(url: string, text: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
}

function row(cells: string[], tag: "td" | "th"): string {
  return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join("")}</tr>`;
}

function table(header: string[], rows: string[][]): string {
  return `<table>${row(header, "th")}${rows.map((cells) => row(cells, "td")).join("")}</table>`;
}

function runsTable(runs: VerdictRun[]): string {
  return table(
    ["Trigger", "Status", "Run"],
    runs.map((run) => [
      escapeHtml(run.triggerName),
      escapeHtml(run.status),
      link(run.runUrl, "Open run"),
    ]),
  );
}

function detailsOf(verdict: DeploymentVerdict): string[] {
  if (verdict.outcome === "not-tested") {
    return [
      table(
        ["Trigger", "Note"],
        verdict.triggers.map((trigger) => [
          escapeHtml(trigger.triggerName),
          escapeHtml(trigger.message),
        ]),
      ),
    ];
  }
  if (verdict.outcome === "superseded") {
    return [
      `<p>Replaced by ${link(verdict.supersededBy.url, verdict.supersededBy.url)}</p>`,
    ];
  }
  return [];
}

/** The job summary, as HTML that GitHub renders inside its Markdown. */
export function buildSummary({
  isPassing,
  knownRuns,
  verdict,
}: {
  isPassing: boolean;
  knownRuns: VerdictRun[];
  verdict: DeploymentVerdict;
}): string {
  const runs = runsToShow(verdict, knownRuns);
  return [
    `<h2>QA Wolf verdict: ${outcomeTitles[verdict.outcome]}</h2>`,
    `<p>${escapeHtml(describeVerdict(verdict))} The step ${isPassing ? "passed" : "failed"}.</p>`,
    ...detailsOf(verdict),
    ...(runs.length > 0 ? [runsTable(runs)] : []),
    `<p>Deployment <code>${escapeHtml(verdict.deploymentId)}</code></p>`,
  ].join("\n");
}
