import type { DeploymentVerdict } from "./types.js";
import type { Policy } from "./validateInput.js";

/**
 * Whether the step passes. Only `passed` always does: this step is a gate, so
 * it never passes on an answer it could not get.
 */
export function isPassing(verdict: DeploymentVerdict, policy: Policy): boolean {
  switch (verdict.outcome) {
    // With on-needs-review: wait, the wait ends on a settled run, a timeout or
    // a cancellation instead, so a needs-review that reaches here fails too.
    case "canceled-by-caller":
    case "failed":
    case "invalid-response-body":
    case "needs-review":
    case "network-error":
    case "not-found":
    case "run-canceled":
    case "server-error":
    case "timed-out":
    case "unauthorized":
    case "unexpected-status":
      return false;
    case "not-tested":
      return policy.onNotTested === "pass";
    case "passed":
      return true;
    case "superseded":
      return policy.onSuperseded === "pass";
    default:
      throw Error(
        `Unexpected verdict: ${JSON.stringify(verdict satisfies never)}`,
      );
  }
}
