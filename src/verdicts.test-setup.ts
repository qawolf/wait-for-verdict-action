import { jest } from "@jest/globals";

import type { DeploymentVerdict, Outcome, VerdictRun } from "./types.js";
import type {
  WaitDependencies,
  waitForSettledVerdict,
} from "./waitForSettledVerdict.js";

export const deploymentId = "deployment-1";

export function makeRun(overrides: Partial<VerdictRun> = {}): VerdictRun {
  return {
    blockingBugCount: 0,
    runId: "run-1",
    runUrl: "https://app.qawolf.com/acme/runs/run-1",
    status: "passed",
    triggerName: "Staging deploys",
    ...overrides,
  };
}

const run = makeRun();

export const verdictsByOutcome: {
  [Key in Outcome]: Extract<DeploymentVerdict, { outcome: Key }>;
} = {
  "canceled-by-caller": { deploymentId, outcome: "canceled-by-caller" },
  failed: {
    blockingBugCount: 2,
    deploymentId,
    outcome: "failed",
    runs: [makeRun({ blockingBugCount: 2, status: "failed" })],
  },
  "invalid-response-body": { deploymentId, outcome: "invalid-response-body" },
  "needs-review": {
    deploymentId,
    outcome: "needs-review",
    runs: [makeRun({ status: "running" })],
  },
  "network-error": { deploymentId, outcome: "network-error" },
  "not-found": { deploymentId, message: undefined, outcome: "not-found" },
  "not-tested": {
    deploymentId,
    outcome: "not-tested",
    reason: "no-trigger-matched",
    triggers: [
      {
        message: "The deployment's branch is not main.",
        triggerName: "Main deploys",
      },
    ],
  },
  passed: { deploymentId, outcome: "passed", runs: [run] },
  "run-canceled": {
    deploymentId,
    outcome: "run-canceled",
    runs: [makeRun({ status: "canceled" })],
  },
  "server-error": { deploymentId, httpStatus: 503, outcome: "server-error" },
  superseded: {
    deploymentId,
    outcome: "superseded",
    runs: [makeRun({ status: "superseded" })],
    supersededBy: {
      runId: "run-2",
      url: "https://app.qawolf.com/acme/runs/run-2",
    },
  },
  "timed-out": {
    deploymentId,
    elapsedMs: 7_200_000,
    lastStage: { runs: [run], stage: "waiting-for-verdict" },
    outcome: "timed-out",
    runs: [makeRun({ status: "running" })],
  },
  unauthorized: {
    deploymentId,
    message: "Invalid API key",
    outcome: "unauthorized",
  },
  "unexpected-status": {
    deploymentId,
    httpStatus: 400,
    message: undefined,
    outcome: "unexpected-status",
  },
};

export const allOutcomes = Object.values(verdictsByOutcome).map(
  (verdict) => verdict.outcome,
);

/**
 * A clock whose sleep moves time forward at once, and a fake SDK wait that
 * answers each call with the next verdict. Every call also moves time forward
 * by `callMs`, the time the SDK spent.
 */
export function makeWaitDependencies(
  answers: DeploymentVerdict[],
  { callMs = 1000 }: { callMs?: number } = {},
) {
  const time = { now: 0 };
  const remaining = [...answers];
  const info = jest.fn<WaitDependencies["info"]>();
  const waitForVerdict = jest.fn<WaitDependencies["waitForVerdict"]>(
    async () => {
      const answer = remaining.shift();
      if (!answer) throw Error("The fake SDK ran out of answers.");
      time.now += callMs;
      return answer;
    },
  );
  const sleep = jest.fn<WaitDependencies["clock"]["sleep"]>(async (ms) => {
    time.now += ms;
  });
  const deps: WaitDependencies = {
    clock: { now: () => time.now, sleep },
    info,
    waitForVerdict,
  };
  return { deps, info, sleep, time, waitForVerdict };
}

export const twoHours = 2 * 60 * 60 * 1000;

export function waitParams(
  overrides: Partial<Parameters<typeof waitForSettledVerdict>[0]> = {},
) {
  return {
    deploymentId,
    keepWaitingOnNeedsReview: true,
    signal: new AbortController().signal,
    timeoutMs: twoHours,
    ...overrides,
  };
}
