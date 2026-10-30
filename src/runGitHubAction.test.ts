import { describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "node:events";

import type { ActionCore, MakeSdk } from "./runGitHubAction.js";
import { runGitHubAction } from "./runGitHubAction.js";
import type { DeploymentVerdict } from "./types.js";
import {
  deploymentId,
  makeRun,
  verdictsByOutcome,
} from "./verdicts.test-setup.js";
import type { WaitDependencies } from "./waitForSettledVerdict.js";

const validInputs = {
  "deployment-id": deploymentId,
  "qawolf-api-key": "test-api-key",
};

function makeCore(inputs: Record<string, string> = validInputs) {
  return {
    getInput: (name: string) => inputs[name] ?? "",
    info: jest.fn<ActionCore["info"]>(),
    setFailed: jest.fn<ActionCore["setFailed"]>(),
    setOutput: jest.fn<ActionCore["setOutput"]>(),
    setSecret: jest.fn<ActionCore["setSecret"]>(),
    warning: jest.fn<ActionCore["warning"]>(),
    writeSummary: jest.fn<ActionCore["writeSummary"]>(async () => undefined),
  };
}

function setUp(
  waitForVerdict: WaitDependencies["waitForVerdict"],
  inputs: Record<string, string> = validInputs,
) {
  const core = makeCore(inputs);
  const makeSdk = jest.fn<MakeSdk>(() => ({ deployment: { waitForVerdict } }));
  const processSignals = new EventEmitter();
  const running = runGitHubAction({
    core,
    fetch: jest.fn<typeof fetch>(),
    makeSdk,
    processSignals,
    userAgent: "wait-for-verdict-action/test",
  });
  return { core, makeSdk, processSignals, running };
}

function outputNames(core: ReturnType<typeof makeCore>): string[] {
  return core.setOutput.mock.calls.map(([name]) => name);
}

const answer = (verdict: DeploymentVerdict) =>
  jest.fn<WaitDependencies["waitForVerdict"]>(async () => verdict);

describe("runGitHubAction", () => {
  it("writes the outputs and the summary, and masks the API key", async () => {
    const { core, makeSdk, running } = setUp(answer(verdictsByOutcome.passed));
    await running;

    expect(core.setSecret).toHaveBeenCalledWith("test-api-key");
    expect(makeSdk).toHaveBeenCalledWith(
      expect.objectContaining({ serviceBase: "https://app.qawolf.com/" }),
      expect.anything(),
    );
    expect(core.setOutput).toHaveBeenCalledWith("outcome", "passed");
    expect(core.writeSummary).toHaveBeenCalledWith(
      expect.stringContaining("QA Wolf verdict: ✅ Passed"),
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("fails with a summary and no outcome when an input is invalid", async () => {
    const waitForVerdict = answer(verdictsByOutcome.passed);
    const { core, running } = setUp(waitForVerdict, {
      ...validInputs,
      "on-not-tested": "skip",
    });
    await running;

    const message =
      "Action input is invalid: 'on-not-tested' must be 'pass' or 'fail', not 'skip'";
    expect(core.setFailed).toHaveBeenCalledWith(message);
    expect(core.writeSummary).toHaveBeenCalledWith(
      `<p>${message.replaceAll("'", "&#39;")}</p>`,
    );
    expect(core.setOutput).not.toHaveBeenCalled();
    expect(waitForVerdict).not.toHaveBeenCalled();
  });

  it("fails with a summary and the runs seen so far when the SDK throws", async () => {
    const { core, running } = setUp(async ({ onProgress }) => {
      await onProgress?.({ runs: [makeRun()], stage: "waiting-for-verdict" });
      throw Error("boom");
    });
    await running;

    expect(core.setFailed).toHaveBeenCalledWith(
      "Action failed with reason: Error: boom",
    );
    expect(core.writeSummary).toHaveBeenCalledWith(
      expect.stringContaining(
        '<a href="https://app.qawolf.com/acme/runs/run-1">',
      ),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "run-urls",
      "https://app.qawolf.com/acme/runs/run-1",
    );
    expect(outputNames(core)).not.toContain("outcome");
  });

  it("still fails when the summary cannot be written", async () => {
    const { core, running } = setUp(answer(verdictsByOutcome.failed));
    core.writeSummary.mockRejectedValue(Error("disk full"));
    await running;

    expect(core.warning).toHaveBeenCalledWith(
      "Could not write the job summary: Error: disk full",
    );
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("QA Wolf found 2 blocking bugs."),
    );
  });

  it("ends as canceled-by-caller with its outputs on SIGINT", async () => {
    const { core, processSignals, running } = setUp(
      ({ signal }) =>
        new Promise((resolve) => {
          signal?.addEventListener("abort", () =>
            resolve({ deploymentId, outcome: "network-error" }),
          );
        }),
    );
    processSignals.emit("SIGINT");
    await running;

    expect(core.setOutput).toHaveBeenCalledWith(
      "outcome",
      "canceled-by-caller",
    );
    expect(outputNames(core)).toEqual(["outcome", "run-urls", "verdict"]);
    expect(core.writeSummary).toHaveBeenCalledWith(
      expect.stringContaining("QA Wolf verdict: 🚫 Canceled"),
    );
    expect(core.setFailed).toHaveBeenCalledWith(
      "The job was canceled before QA Wolf answered.",
    );
  });
});
