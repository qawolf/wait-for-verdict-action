import type { ClockDriver, FetchDriver, LogDriver } from "@qawolf/ci-sdk";

import { escapeHtml, link } from "./buildSummary.js";
import { runAction } from "./runAction.js";
import type { ActionResult } from "./runAction.js";
import {
  clock,
  describeError,
  makeSdkDependencies,
} from "./sdkDependencies.js";
import type { Log } from "./sdkDependencies.js";
import type { VerdictRun } from "./types.js";
import type { ValidatedInput } from "./validateInput.js";
import { validateInput } from "./validateInput.js";
import type { WaitDependencies } from "./waitForSettledVerdict.js";

/** The parts of `@actions/core` the action uses. */
export type ActionCore = Log & {
  getInput: (name: string) => string;
  setFailed: (message: string) => void;
  setOutput: (name: string, value: string) => void;
  setSecret: (secret: string) => void;
  writeSummary: (html: string) => Promise<void>;
};

export type MakeSdk = (
  config: { apiKey: string; serviceBase: string; userAgent: string },
  deps: { clock: ClockDriver; fetch: FetchDriver; log: LogDriver },
) => { deployment: { waitForVerdict: WaitDependencies["waitForVerdict"] } };

export type ProcessSignals = {
  once: (event: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
};

export type Dependencies = {
  core: ActionCore;
  fetch: FetchDriver;
  makeSdk: MakeSdk;
  processSignals: ProcessSignals;
  userAgent: string;
};

async function writeSummary(core: ActionCore, html: string): Promise<void> {
  try {
    await core.writeSummary(html);
  } catch (error) {
    core.warning(`Could not write the job summary: ${describeError(error)}`);
  }
}

/** Fails the step with a one-line summary, plus the links of any runs seen. */
async function failWithoutVerdict(
  core: ActionCore,
  message: string,
  runs: VerdictRun[],
): Promise<void> {
  const links = runs.map((run) => `<li>${link(run.runUrl, run.runUrl)}</li>`);
  await writeSummary(
    core,
    [
      `<p>${escapeHtml(message)}</p>`,
      ...(links.length > 0 ? [`<ul>${links.join("")}</ul>`] : []),
    ].join("\n"),
  );
  core.setFailed(message);
}

async function waitForVerdict(
  input: ValidatedInput,
  { core, fetch, makeSdk, processSignals, userAgent }: Dependencies,
  rememberRuns: (runs: VerdictRun[]) => void,
): Promise<ActionResult> {
  // GitHub sends SIGINT, then SIGTERM, when the job is canceled. Ending the
  // wait on either still writes the outputs and the summary.
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  processSignals.once("SIGINT", cancel);
  processSignals.once("SIGTERM", cancel);

  const { deployment } = makeSdk(
    {
      apiKey: input.apiKey,
      serviceBase: `${input.qawolfBaseUrl}/`,
      userAgent,
    },
    makeSdkDependencies({ fetch, log: core, signal: cancellation.signal }),
  );

  core.info(
    `Waiting for QA Wolf's verdict on deployment ${input.deploymentId}.`,
  );
  return runAction(input, cancellation.signal, {
    clock,
    info: core.info,
    async waitForVerdict(params) {
      const verdict = await deployment.waitForVerdict({
        ...params,
        onProgress(stage) {
          if (stage.stage === "waiting-for-verdict") rememberRuns(stage.runs);
          return params.onProgress?.(stage);
        },
      });
      if ("runs" in verdict) rememberRuns(verdict.runs);
      return verdict;
    },
  });
}

/**
 * Validates the inputs, waits for the verdict, then writes the outputs and
 * the job summary. The `outcome` output stays empty when the inputs are
 * invalid or the action fails before QA Wolf's verdict is known.
 */
export async function runGitHubAction(deps: Dependencies): Promise<void> {
  const { core } = deps;
  const input = validateInput((name) => core.getInput(name));
  if (!input.isValid) {
    await failWithoutVerdict(
      core,
      `Action input is invalid: ${input.error}`,
      [],
    );
    return;
  }
  core.setSecret(input.apiKey);

  const runsById = new Map<string, VerdictRun>();
  const rememberRuns = (runs: VerdictRun[]) => {
    for (const run of runs) runsById.set(run.runId, run);
  };
  const result = await waitForVerdict(input, deps, rememberRuns).catch(
    (error: unknown) => ({ error }),
  );
  if ("error" in result) {
    const runs = [...runsById.values()];
    core.setOutput("run-urls", runs.map((run) => run.runUrl).join("\n"));
    await failWithoutVerdict(
      core,
      `Action failed with reason: ${describeError(result.error)}`,
      runs,
    );
    return;
  }

  core.setOutput("outcome", result.outputs.outcome);
  core.setOutput("run-urls", result.outputs["run-urls"]);
  core.setOutput("verdict", result.outputs.verdict);
  await writeSummary(core, result.summary);

  if (result.failure) core.setFailed(result.failure);
  else core.info(`QA Wolf verdict: ${result.verdict.outcome}.`);
}
