import { describe, expect, it } from "@jest/globals";

import { isPassing } from "./isPassing.js";
import type { Outcome } from "./types.js";
import type { Policy } from "./validateInput.js";
import { allOutcomes, verdictsByOutcome } from "./verdicts.test-setup.js";

const strictest: Policy = {
  onNeedsReview: "fail",
  onNotTested: "fail",
  onSuperseded: "fail",
};
const mostLenient: Policy = {
  onNeedsReview: "wait",
  onNotTested: "pass",
  onSuperseded: "pass",
};

const passesUnderStrictest: Outcome[] = ["passed"];
const passesUnderMostLenient: Outcome[] = [
  "passed",
  "not-tested",
  "superseded",
];

describe("isPassing", () => {
  it.each(allOutcomes)("decides %s under the strictest inputs", (outcome) => {
    expect(isPassing(verdictsByOutcome[outcome], strictest)).toBe(
      passesUnderStrictest.includes(outcome),
    );
  });

  it.each(allOutcomes)(
    "decides %s under the most lenient inputs",
    (outcome) => {
      expect(isPassing(verdictsByOutcome[outcome], mostLenient)).toBe(
        passesUnderMostLenient.includes(outcome),
      );
    },
  );

  it("lets each on- input decide only its own outcome", () => {
    const onlyNotTested = { ...strictest, onNotTested: "pass" } as const;

    expect(isPassing(verdictsByOutcome["not-tested"], onlyNotTested)).toBe(
      true,
    );
    expect(isPassing(verdictsByOutcome.superseded, onlyNotTested)).toBe(false);
  });
});
