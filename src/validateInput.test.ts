import { describe, expect, it } from "@jest/globals";

import { validateInput } from "./validateInput.js";

function inputs(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "deployment-id": "deployment-1",
    "qawolf-api-key": "test-api-key",
    ...overrides,
  };
  return (name: string) => values[name] ?? "";
}

describe("validateInput", () => {
  it("applies the defaults when only the required inputs are set", () => {
    expect(validateInput(inputs())).toEqual({
      apiKey: "test-api-key",
      deploymentId: "deployment-1",
      isValid: true,
      policy: {
        onNeedsReview: "fail",
        onNotTested: "fail",
        onSuperseded: "fail",
      },
      qawolfBaseUrl: "https://app.qawolf.com",
      timeoutMs: 7_200_000,
    });
  });

  it("reads every optional input", () => {
    expect(
      validateInput(
        inputs({
          "on-needs-review": "wait",
          "on-not-tested": "pass",
          "on-superseded": "PASS",
          "qawolf-base-url": "https://qawolf.example.com/",
          timeout: "90m",
        }),
      ),
    ).toMatchObject({
      isValid: true,
      policy: {
        onNeedsReview: "wait",
        onNotTested: "pass",
        onSuperseded: "pass",
      },
      qawolfBaseUrl: "https://qawolf.example.com",
      timeoutMs: 5_400_000,
    });
  });

  it("drops every trailing slash of the base URL", () => {
    expect(
      validateInput(inputs({ "qawolf-base-url": "https://app.qawolf.com//" })),
    ).toMatchObject({
      qawolfBaseUrl: "https://app.qawolf.com",
    });
  });

  it.each([
    [{ "qawolf-api-key": " " }, "'qawolf-api-key' is required"],
    [{ "deployment-id": "" }, "'deployment-id' is required"],
    [
      { timeout: "90" },
      "'timeout' must be a duration such as 2h, 90m or 5400s, not '90'",
    ],
    [
      { "on-not-tested": "skip" },
      "'on-not-tested' must be 'pass' or 'fail', not 'skip'",
    ],
    [
      { "on-superseded": "warn" },
      "'on-superseded' must be 'pass' or 'fail', not 'warn'",
    ],
    [
      { "on-needs-review": "pass" },
      "'on-needs-review' must be 'fail' or 'wait', not 'pass'",
    ],
    [
      { "qawolf-base-url": "app.qawolf.com" },
      "'qawolf-base-url' must be an http(s) URL",
    ],
    [
      { "qawolf-base-url": "ftp://app.qawolf.com" },
      "'qawolf-base-url' must be an http(s) URL",
    ],
    [
      { "qawolf-base-url": "https://app.qawolf.com?region=eu" },
      "'qawolf-base-url' must not have a query string or a hash",
    ],
    [
      { "qawolf-base-url": "https://app.qawolf.com/#api" },
      "'qawolf-base-url' must not have a query string or a hash",
    ],
  ])("rejects %j", (overrides, error) => {
    const result = validateInput(inputs(overrides));

    expect(result.isValid).toBe(false);
    if (result.isValid) throw Error("Expected the input to be invalid.");
    expect(result.error).toContain(error);
  });
});
