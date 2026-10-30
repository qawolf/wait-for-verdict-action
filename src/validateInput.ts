import { parseDuration } from "./parseDuration.js";

export type Policy = {
  onNeedsReview: "fail" | "wait";
  onNotTested: "fail" | "pass";
  onSuperseded: "fail" | "pass";
};

export type ValidatedInput = {
  apiKey: string;
  deploymentId: string;
  policy: Policy;
  qawolfBaseUrl: string;
  timeoutMs: number;
};

export type ValidationResult =
  | ({ isValid: true } & ValidatedInput)
  | { error: string; isValid: false };

/** Answers an empty string for an input the workflow did not set. */
export type GetInput = (name: string) => string;

const defaults = {
  "on-needs-review": "fail",
  "on-not-tested": "fail",
  "on-superseded": "fail",
  "qawolf-base-url": "https://app.qawolf.com",
  timeout: "2h",
};

function readInput(getInput: GetInput, name: keyof typeof defaults): string {
  return getInput(name).trim() || defaults[name];
}

function readChoice<Choice extends string>(
  getInput: GetInput,
  name: keyof typeof defaults,
  choices: readonly Choice[],
): Choice | { error: string } {
  const value = readInput(getInput, name).toLowerCase();
  const choice = choices.find((candidate) => candidate === value);
  if (choice) return choice;
  return {
    error: `'${name}' must be ${choices.map((candidate) => `'${candidate}'`).join(" or ")}, not '${value}'`,
  };
}

function invalid(error: string): ValidationResult {
  return { error, isValid: false };
}

export function validateInput(getInput: GetInput): ValidationResult {
  const apiKey = getInput("qawolf-api-key").trim();
  if (!apiKey) return invalid("'qawolf-api-key' is required");

  const deploymentId = getInput("deployment-id").trim();
  if (!deploymentId) {
    return invalid(
      "'deployment-id' is required: pass the deployment-id output of the step that reported the deployment",
    );
  }

  const timeout = readInput(getInput, "timeout");
  const timeoutMs = parseDuration(timeout);
  if (timeoutMs === "invalid") {
    return invalid(
      `'timeout' must be a duration such as 2h, 90m or 5400s, not '${timeout}'`,
    );
  }

  const onNotTested = readChoice(getInput, "on-not-tested", ["pass", "fail"]);
  if (typeof onNotTested === "object") return invalid(onNotTested.error);
  const onSuperseded = readChoice(getInput, "on-superseded", ["pass", "fail"]);
  if (typeof onSuperseded === "object") return invalid(onSuperseded.error);
  const onNeedsReview = readChoice(getInput, "on-needs-review", [
    "fail",
    "wait",
  ]);
  if (typeof onNeedsReview === "object") return invalid(onNeedsReview.error);

  const baseUrl = readInput(getInput, "qawolf-base-url");
  if (!URL.canParse(baseUrl) || !/^https?:$/.test(new URL(baseUrl).protocol)) {
    return invalid(
      `'qawolf-base-url' must be an http(s) URL, not '${baseUrl}'`,
    );
  }
  if (/[?#]/.test(baseUrl)) {
    return invalid(
      `'qawolf-base-url' must not have a query string or a hash, not '${baseUrl}'`,
    );
  }

  return {
    apiKey,
    deploymentId,
    isValid: true,
    policy: { onNeedsReview, onNotTested, onSuperseded },
    qawolfBaseUrl: baseUrl.replace(/\/+$/, ""),
    timeoutMs,
  };
}
