import { buildSummary } from "./buildSummary.js";
import { describeFailure, runsToShow } from "./describeVerdict.js";
import { isPassing } from "./isPassing.js";
import type { DeploymentVerdict } from "./types.js";
import type { ValidatedInput } from "./validateInput.js";
import type { WaitDependencies } from "./waitForSettledVerdict.js";
import { waitForSettledVerdict } from "./waitForSettledVerdict.js";

export type ActionResult = {
  /** The one line the step fails with; absent when it passes. */
  failure: string | undefined;
  outputs: { outcome: string; "run-urls": string; verdict: string };
  summary: string;
  verdict: DeploymentVerdict;
};

export async function runAction(
  input: Pick<ValidatedInput, "deploymentId" | "policy" | "timeoutMs">,
  signal: AbortSignal,
  deps: WaitDependencies,
): Promise<ActionResult> {
  const { knownRuns, verdict } = await waitForSettledVerdict(
    {
      deploymentId: input.deploymentId,
      keepWaitingOnNeedsReview: input.policy.onNeedsReview === "wait",
      signal,
      timeoutMs: input.timeoutMs,
    },
    deps,
  );
  const passing = isPassing(verdict, input.policy);

  return {
    failure: passing
      ? undefined
      : describeFailure({ knownRuns, policy: input.policy, verdict }),
    outputs: {
      outcome: verdict.outcome,
      "run-urls": runsToShow(verdict, knownRuns)
        .map((run) => run.runUrl)
        .join("\n"),
      verdict: JSON.stringify(verdict),
    },
    summary: buildSummary({ isPassing: passing, knownRuns, verdict }),
    verdict,
  };
}
