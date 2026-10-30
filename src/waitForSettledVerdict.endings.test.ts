import { describe, expect, it } from "@jest/globals";

import {
  makeRun,
  makeWaitDependencies,
  twoHours,
  verdictsByOutcome,
  waitParams,
} from "./verdicts.test-setup.js";
import { waitForSettledVerdict } from "./waitForSettledVerdict.js";

const needsReview = verdictsByOutcome["needs-review"];

describe("waitForSettledVerdict endings", () => {
  it("times out at once when the first ask spent the whole budget", async () => {
    const { deps, info, sleep, waitForVerdict } = makeWaitDependencies(
      [needsReview],
      { callMs: twoHours },
    );

    const result = await waitForSettledVerdict(waitParams(), deps);

    expect(result.verdict).toMatchObject({
      elapsedMs: twoHours,
      outcome: "timed-out",
      runs: needsReview.runs,
    });
    expect(info).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(waitForVerdict).toHaveBeenCalledTimes(1);
  });

  it("times out with the runs the SDK saw last when it has some", async () => {
    const latestRuns = [makeRun({ runId: "run-3", status: "running" })];
    const { deps } = makeWaitDependencies([
      needsReview,
      { ...verdictsByOutcome["timed-out"], runs: latestRuns },
    ]);

    const result = await waitForSettledVerdict(waitParams(), deps);

    expect(result.verdict).toMatchObject({
      outcome: "timed-out",
      runs: latestRuns,
    });
  });

  it("settles on a network error while waiting, keeping the runs it saw", async () => {
    const { deps } = makeWaitDependencies([
      needsReview,
      verdictsByOutcome["network-error"],
    ]);

    const result = await waitForSettledVerdict(waitParams(), deps);

    expect(result).toEqual({
      knownRuns: needsReview.runs,
      verdict: verdictsByOutcome["network-error"],
    });
  });
});
