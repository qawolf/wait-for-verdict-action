import { describe, expect, it } from "@jest/globals";

import {
  deploymentId,
  makeRun,
  makeWaitDependencies,
  twoHours,
  verdictsByOutcome,
  waitParams as params,
} from "./verdicts.test-setup.js";
import {
  needsReviewPollIntervalMs,
  waitForSettledVerdict,
} from "./waitForSettledVerdict.js";

const needsReview = verdictsByOutcome["needs-review"];

describe("waitForSettledVerdict", () => {
  it("answers the SDK's verdict with the whole budget", async () => {
    const { deps, waitForVerdict } = makeWaitDependencies([
      verdictsByOutcome.passed,
    ]);

    const result = await waitForSettledVerdict(params(), deps);

    expect(result.verdict).toEqual(verdictsByOutcome.passed);
    expect(waitForVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId, timeout: twoHours }),
    );
  });

  it("stops at needs-review when on-needs-review is fail", async () => {
    const { deps, waitForVerdict } = makeWaitDependencies([needsReview]);

    const result = await waitForSettledVerdict(
      params({ keepWaitingOnNeedsReview: false }),
      deps,
    );

    expect(result.verdict.outcome).toBe("needs-review");
    expect(waitForVerdict).toHaveBeenCalledTimes(1);
  });

  it("asks again after a pause until someone answers and the run settles", async () => {
    const failed = verdictsByOutcome.failed;
    const { deps, info, sleep, waitForVerdict } = makeWaitDependencies([
      needsReview,
      needsReview,
      needsReview,
      failed,
    ]);

    const result = await waitForSettledVerdict(params(), deps);

    expect(result.verdict).toEqual(failed);
    expect(waitForVerdict).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(
      needsReviewPollIntervalMs,
      expect.any(AbortSignal),
    );
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("for someone to answer on the run page"),
    );
  });

  it("gives each new ask only the budget that is left", async () => {
    const { deps, waitForVerdict } = makeWaitDependencies(
      [needsReview, verdictsByOutcome.passed],
      {
        callMs: 60_000,
      },
    );

    await waitForSettledVerdict(params(), deps);

    expect(waitForVerdict.mock.calls.map(([call]) => call.timeout)).toEqual([
      twoHours,
      twoHours - 60_000 - needsReviewPollIntervalMs,
    ]);
  });

  it("times out with the waiting runs when nobody answers within the budget", async () => {
    const tenMinutes = 10 * 60 * 1000;
    const { deps, sleep, waitForVerdict } = makeWaitDependencies(
      Array.from({ length: 100 }, () => needsReview),
    );

    const result = await waitForSettledVerdict(
      params({ timeoutMs: tenMinutes }),
      deps,
    );

    expect(result.verdict).toMatchObject({
      elapsedMs: tenMinutes,
      outcome: "timed-out",
      runs: needsReview.runs,
    });
    // Paced by the poll interval rather than asking in a tight loop.
    const totalSleptMs = sleep.mock.calls.reduce(
      (total, [ms]) => total + ms,
      0,
    );
    expect(waitForVerdict.mock.calls.length).toBeLessThanOrEqual(
      tenMinutes / needsReviewPollIntervalMs + 1,
    );
    expect(totalSleptMs).toBeGreaterThan(tenMinutes - 60_000);
  });

  it("keeps the waiting runs when the SDK times out before seeing them again", async () => {
    const { deps } = makeWaitDependencies([
      needsReview,
      { ...verdictsByOutcome["timed-out"], runs: [] },
    ]);

    const result = await waitForSettledVerdict(params(), deps);

    expect(result.verdict).toMatchObject({
      outcome: "timed-out",
      runs: needsReview.runs,
    });
  });

  it("ends as canceled-by-caller when the job is canceled during the pause", async () => {
    const controller = new AbortController();
    const { deps, sleep, waitForVerdict } = makeWaitDependencies([needsReview]);
    sleep.mockImplementation(async () => controller.abort());

    const result = await waitForSettledVerdict(
      params({ signal: controller.signal }),
      deps,
    );

    expect(result).toEqual({
      knownRuns: needsReview.runs,
      verdict: { deploymentId, outcome: "canceled-by-caller" },
    });
    expect(waitForVerdict).toHaveBeenCalledTimes(1);
  });

  it("reads a transport failure after cancellation as canceled-by-caller", async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps } = makeWaitDependencies([verdictsByOutcome["network-error"]]);

    const result = await waitForSettledVerdict(
      params({ signal: controller.signal }),
      deps,
    );

    expect(result.verdict.outcome).toBe("canceled-by-caller");
  });

  it("remembers the runs it saw in progress for outcomes that carry none", async () => {
    const run = makeRun({ status: "running" });
    const { deps, waitForVerdict } = makeWaitDependencies([
      verdictsByOutcome["canceled-by-caller"],
    ]);
    waitForVerdict.mockImplementationOnce(async ({ onProgress }) => {
      await onProgress?.({ runs: [run], stage: "waiting-for-verdict" });
      return verdictsByOutcome["canceled-by-caller"];
    });

    const result = await waitForSettledVerdict(params(), deps);

    expect(result.knownRuns).toEqual([run]);
  });
});
