import * as core from "@actions/core";

import { makeQaWolfSdk } from "@qawolf/ci-sdk";

import packageJson from "../package.json" with { type: "json" };

import { runGitHubAction } from "./runGitHubAction.js";
import { describeError } from "./sdkDependencies.js";

runGitHubAction({
  core: {
    getInput: (name) => core.getInput(name),
    info: core.info,
    setFailed: core.setFailed,
    setOutput: core.setOutput,
    setSecret: core.setSecret,
    warning: core.warning,
    async writeSummary(html) {
      await core.summary.addRaw(html).write();
    },
  },
  fetch,
  makeSdk: makeQaWolfSdk,
  processSignals: process,
  userAgent: `wait-for-verdict-action/${packageJson.version}`,
}).catch((error: unknown) => {
  core.setFailed(`Action failed with reason: ${describeError(error)}`);
});
