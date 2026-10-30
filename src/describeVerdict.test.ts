import { describe, expect, it } from "@jest/globals";

import { describeVerdict } from "./describeVerdict.js";
import { allOutcomes, verdictsByOutcome } from "./verdicts.test-setup.js";

describe("describeVerdict", () => {
  it.each(allOutcomes)("describes %s in one sentence", (outcome) => {
    const description = describeVerdict(verdictsByOutcome[outcome]);

    expect(description).toMatch(/^[A-Z].*\.$/);
  });

  it.each([
    [
      { ...verdictsByOutcome["not-found"], message: "Deployment is gone" },
      "QA Wolf found no deployment with id 'deployment-1': Deployment is gone. Pass the deployment-id output of the step that reported the deployment.",
    ],
    [
      verdictsByOutcome["not-found"],
      "QA Wolf found no deployment with id 'deployment-1'. Pass the deployment-id output of the step that reported the deployment.",
    ],
    [
      { ...verdictsByOutcome["unexpected-status"], message: "Bad request" },
      "QA Wolf answered with HTTP status 400: Bad request.",
    ],
    [verdictsByOutcome["timed-out"], "Gave up after 2h without a verdict."],
  ])("adds the details of %j", (verdict, description) => {
    expect(describeVerdict(verdict)).toBe(description);
  });
});
