import type { WaitForVerdictParams } from "@qawolf/ci-sdk";

import { formatDuration } from "./parseDuration.js";
import type { DeploymentVerdict, VerdictRun } from "./types.js";

/** Between two asks while the run waits for a person; the SDK's own run poll interval. */
export const needsReviewPollIntervalMs = 30 * 1000;

export type Clock = {
  now: () => number;
  /** Resolves early, without throwing, when the signal aborts. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

export type WaitDependencies = {
  clock: Clock;
  info: (message: string) => void;
  waitForVerdict: (params: WaitForVerdictParams) => Promise<DeploymentVerdict>;
};

export type SettledWait = {
  /** Every run the wait saw, for outcomes that carry none of their own. */
  knownRuns: VerdictRun[];
  verdict: DeploymentVerdict;
};

const transportOutcomes = new Set<DeploymentVerdict["outcome"]>([
  "invalid-response-body",
  "network-error",
  "not-found",
  "server-error",
  "unauthorized",
  "unexpected-status",
]);

/**
 * Waits for the deployment's verdict within one budget. With
 * `keepWaitingOnNeedsReview`, a `needs-review` answer is asked again every
 * `needsReviewPollIntervalMs` until a person answers and the run settles, the
 * budget runs out (`timed-out`) or the signal aborts (`canceled-by-caller`).
 */
export async function waitForSettledVerdict(
  {
    deploymentId,
    keepWaitingOnNeedsReview,
    signal,
    timeoutMs,
  }: {
    deploymentId: string;
    keepWaitingOnNeedsReview: boolean;
    signal: AbortSignal;
    timeoutMs: number;
  },
  deps: WaitDependencies,
): Promise<SettledWait> {
  const startedAt = deps.clock.now();
  const deadlineAt = startedAt + timeoutMs;
  const runsById = new Map<string, VerdictRun>();
  const rememberRuns = (runs: VerdictRun[]) => {
    for (const run of runs) runsById.set(run.runId, run);
  };
  const settle = (verdict: DeploymentVerdict): SettledWait => ({
    knownRuns: [...runsById.values()],
    verdict,
  });
  const canceled = (): SettledWait =>
    settle({ deploymentId, outcome: "canceled-by-caller" });
  const timedOut = (runs: VerdictRun[]): SettledWait =>
    settle({
      deploymentId,
      elapsedMs: deps.clock.now() - startedAt,
      lastStage: { runs, stage: "waiting-for-verdict" },
      outcome: "timed-out",
      runs,
    });

  const ask = async (): Promise<DeploymentVerdict> => {
    const verdict = await deps.waitForVerdict({
      deploymentId,
      onProgress(stage) {
        if (stage.stage === "waiting-for-verdict") rememberRuns(stage.runs);
      },
      signal,
      timeout: Math.max(0, deadlineAt - deps.clock.now()),
    });
    if ("runs" in verdict) rememberRuns(verdict.runs);
    // An aborted request can surface as a transport failure.
    if (signal.aborted && transportOutcomes.has(verdict.outcome))
      return { deploymentId, outcome: "canceled-by-caller" };
    return verdict;
  };

  const first = await ask();
  if (!keepWaitingOnNeedsReview || first.outcome !== "needs-review")
    return settle(first);

  const remainingAfterFirstMs = deadlineAt - deps.clock.now();
  if (remainingAfterFirstMs <= 0) return timedOut(first.runs);
  deps.info(
    `Waiting up to ${formatDuration(remainingAfterFirstMs)} for someone to answer on the run page.`,
  );
  const keepWaiting = async (
    waitingRuns: VerdictRun[],
  ): Promise<SettledWait> => {
    const remainingMs = deadlineAt - deps.clock.now();
    if (remainingMs <= 0) return timedOut(waitingRuns);
    await deps.clock.sleep(
      Math.min(needsReviewPollIntervalMs, remainingMs),
      signal,
    );
    if (signal.aborted) return canceled();
    if (deps.clock.now() >= deadlineAt) return timedOut(waitingRuns);

    const verdict = await ask();
    if (verdict.outcome === "timed-out")
      return timedOut(verdict.runs.length > 0 ? verdict.runs : waitingRuns);
    if (verdict.outcome !== "needs-review") return settle(verdict);
    return keepWaiting(verdict.runs);
  };
  return keepWaiting(first.runs);
}
