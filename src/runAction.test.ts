import { describe, expect, it } from "@jest/globals";

import { isPassing } from "./isPassing.js";
import { runAction } from "./runAction.js";
import type { Policy } from "./validateInput.js";
import {
  allOutcomes,
  deploymentId,
  makeRun,
  makeWaitDependencies,
  verdictsByOutcome,
} from "./verdicts.test-setup.js";

const policy: Policy = {
  onNeedsReview: "fail",
  onNotTested: "fail",
  onSuperseded: "fail",
};

function run(
  answers: Parameters<typeof makeWaitDependencies>[0],
  inputPolicy: Policy = policy,
) {
  const { deps } = makeWaitDependencies(answers);
  return runAction(
    { deploymentId, policy: inputPolicy, timeoutMs: 60 * 60 * 1000 },
    new AbortController().signal,
    deps,
  );
}

const failingOutcomes = allOutcomes.filter(
  (outcome) => !isPassing(verdictsByOutcome[outcome], policy),
);
const passingOutcomes = allOutcomes.filter(
  (outcome) => !failingOutcomes.includes(outcome),
);

describe("runAction", () => {
  it.each(failingOutcomes)("fails with a reason on %s", async (outcome) => {
    const result = await run([verdictsByOutcome[outcome]]);

    expect(result.failure).toMatch(/\S/);
    expect(result.outputs.outcome).toBe(outcome);
  });

  it.each(passingOutcomes)("passes on %s", async (outcome) => {
    const result = await run([verdictsByOutcome[outcome]]);

    expect(result.failure).toBeUndefined();
  });

  it("passes with the outcome, run URLs and verdict as outputs", async () => {
    const verdict = {
      ...verdictsByOutcome.passed,
      runs: [
        makeRun(),
        makeRun({
          runId: "run-2",
          runUrl: "https://app.qawolf.com/acme/runs/run-2",
          triggerName: "Smoke",
        }),
      ],
    };

    const result = await run([verdict]);

    expect(result.failure).toBeUndefined();
    expect(result.outputs).toEqual({
      outcome: "passed",
      "run-urls":
        "https://app.qawolf.com/acme/runs/run-1\nhttps://app.qawolf.com/acme/runs/run-2",
      verdict: JSON.stringify(verdict),
    });
    expect(result.summary).toContain("QA Wolf verdict: ✅ Passed");
    expect(result.summary).toContain("The step passed.");
    expect(result.summary).toContain(
      '<tr><td>Smoke</td><td>passed</td><td><a href="https://app.qawolf.com/acme/runs/run-2">Open run</a></td></tr>',
    );
  });

  it("fails with one line that names the reason and the first run", async () => {
    const result = await run([verdictsByOutcome.failed]);

    expect(result.failure).toBe(
      "QA Wolf found 2 blocking bugs. https://app.qawolf.com/acme/runs/run-1",
    );
    expect(result.outputs.outcome).toBe("failed");
    expect(result.summary).toContain("The step failed.");
  });

  it("sets the outcome and empty run URLs when the verdict has no runs", async () => {
    const result = await run([verdictsByOutcome.unauthorized]);

    expect(result.outputs).toMatchObject({
      outcome: "unauthorized",
      "run-urls": "",
    });
    expect(result.failure).toBe(
      "QA Wolf refused the API key: Invalid API key.",
    );
    expect(result.summary).not.toContain("<th>Run</th>");
  });

  it("lists each trigger's note when nothing was tested", async () => {
    const result = await run([verdictsByOutcome["not-tested"]]);

    expect(result.failure).toBe(
      "Nothing tested this deployment: no trigger matched it. Set on-not-tested to pass if this deployment is not expected to be tested.",
    );
    expect(result.summary).toContain(
      "<tr><td>Main deploys</td><td>The deployment&#39;s branch is not main.</td></tr>",
    );
  });

  it("passes a not-tested deployment when on-not-tested is pass", async () => {
    const result = await run([verdictsByOutcome["not-tested"]], {
      ...policy,
      onNotTested: "pass",
    });

    expect(result.failure).toBeUndefined();
    expect(result.outputs.outcome).toBe("not-tested");
  });

  it("links the replacement of a superseded run", async () => {
    const result = await run([verdictsByOutcome.superseded]);

    expect(result.summary).toContain(
      'Replaced by <a href="https://app.qawolf.com/acme/runs/run-2">',
    );
  });

  it("asks for an answer on the run page on needs-review", async () => {
    const result = await run([verdictsByOutcome["needs-review"]]);

    expect(result.failure).toBe(
      "The run's failures wait for someone to answer on the run page, so QA Wolf has no verdict yet. Answer on the run page, then re-run this job. https://app.qawolf.com/acme/runs/run-1",
    );
  });

  it("settles after someone answers when on-needs-review is wait", async () => {
    const result = await run(
      [verdictsByOutcome["needs-review"], verdictsByOutcome.passed],
      {
        ...policy,
        onNeedsReview: "wait",
      },
    );

    expect(result.failure).toBeUndefined();
    expect(result.outputs.outcome).toBe("passed");
  });

  it("escapes trigger names in the summary", async () => {
    const result = await run([
      {
        ...verdictsByOutcome.passed,
        runs: [makeRun({ triggerName: "<img src=x>" })],
      },
    ]);

    expect(result.summary).toContain("<td>&lt;img src=x&gt;</td>");
  });

  it("shows the runs it saw when the job is canceled", async () => {
    const { deps, waitForVerdict } = makeWaitDependencies([]);
    waitForVerdict.mockImplementationOnce(async ({ onProgress }) => {
      await onProgress?.({ runs: [makeRun()], stage: "waiting-for-verdict" });
      return verdictsByOutcome["canceled-by-caller"];
    });

    const result = await runAction(
      { deploymentId, policy, timeoutMs: 60_000 },
      new AbortController().signal,
      deps,
    );

    expect(result.outputs["run-urls"]).toBe(
      "https://app.qawolf.com/acme/runs/run-1",
    );
    expect(result.failure).toBe(
      "The job was canceled before QA Wolf answered. https://app.qawolf.com/acme/runs/run-1",
    );
    expect(result.summary).toContain("QA Wolf verdict: 🚫 Canceled");
  });
});
