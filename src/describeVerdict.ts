import { formatDuration } from "./parseDuration.js";
import type { DeploymentVerdict, VerdictRun } from "./types.js";
import type { Policy } from "./validateInput.js";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function withMessage(text: string, message: string | undefined): string {
  return message ? `${text}: ${message}` : text;
}

/** One sentence saying what QA Wolf answered. */
export function describeVerdict(verdict: DeploymentVerdict): string {
  switch (verdict.outcome) {
    case "canceled-by-caller":
      return "The job was canceled before QA Wolf answered.";
    case "failed":
      return `QA Wolf found ${plural(verdict.blockingBugCount, "blocking bug")}.`;
    case "invalid-response-body":
      return "QA Wolf answered with a body this action does not understand. Update the action.";
    case "needs-review":
      return "The run's failures wait for someone to answer on the run page, so QA Wolf has no verdict yet.";
    case "network-error":
      return "Failed to reach the QA Wolf API.";
    case "not-found":
      return `${withMessage(`QA Wolf found no deployment with id '${verdict.deploymentId}'`, verdict.message)}. Pass the deployment-id output of the step that reported the deployment.`;
    case "not-tested":
      return verdict.reason === "no-trigger-matched"
        ? "Nothing tested this deployment: no trigger matched it."
        : "Nothing tested this deployment: a trigger matched it but started no run.";
    case "passed":
      return "QA Wolf found no blocking bug.";
    case "run-canceled":
      return "The run was canceled, so QA Wolf reached no verdict.";
    case "server-error":
      return `QA Wolf answered with HTTP status ${verdict.httpStatus}.`;
    case "superseded":
      return "A newer deployment replaced the run before it finished, so QA Wolf reached no verdict for this one.";
    case "timed-out":
      return `Gave up after ${formatDuration(verdict.elapsedMs)} without a verdict.`;
    case "unauthorized":
      return `${withMessage("QA Wolf refused the API key", verdict.message)}.`;
    case "unexpected-status":
      return `${withMessage(`QA Wolf answered with HTTP status ${verdict.httpStatus}`, verdict.message)}.`;
    default:
      throw Error(
        `Unexpected verdict: ${JSON.stringify(verdict satisfies never)}`,
      );
  }
}

/**
 * The runs to show. Outcomes such as `not-tested`, `canceled-by-caller` and
 * the transport outcomes carry none, so this falls back to the runs the wait
 * saw on its way.
 */
export function runsToShow(
  verdict: DeploymentVerdict,
  knownRuns: VerdictRun[],
): VerdictRun[] {
  return "runs" in verdict ? verdict.runs : knownRuns;
}

function describeHint(verdict: DeploymentVerdict, policy: Policy): string {
  if (verdict.outcome === "needs-review")
    return " Answer on the run page, then re-run this job.";
  if (verdict.outcome === "not-tested" && policy.onNotTested === "fail")
    return " Set on-not-tested to pass if this deployment is not expected to be tested.";
  return "";
}

/** The one line the step fails with. */
export function describeFailure({
  knownRuns,
  policy,
  verdict,
}: {
  knownRuns: VerdictRun[];
  policy: Policy;
  verdict: DeploymentVerdict;
}): string {
  const firstRun = runsToShow(verdict, knownRuns)[0];
  const link = firstRun ? ` ${firstRun.runUrl}` : "";
  return `${describeVerdict(verdict)}${describeHint(verdict, policy)}${link}`;
}
