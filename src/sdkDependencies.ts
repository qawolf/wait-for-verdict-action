import { setTimeout as delay } from "node:timers/promises";

import type { ClockDriver, FetchDriver, LogDriver } from "@qawolf/ci-sdk";

import type { Clock } from "./waitForSettledVerdict.js";

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  return JSON.stringify(error) ?? String(error);
}

export const clock: Clock = {
  now: () => Date.now(),
  async sleep(ms, signal) {
    // Cancellation ends the sleep; the caller checks the signal next.
    await delay(ms, undefined, { signal }).catch(() => undefined);
  },
};

export type Log = {
  info: (message: string) => void;
  warning: (message: string) => void;
};

/**
 * Routes the SDK's lines to the job log. The step fails with one line of its
 * own, so the SDK's errors print as plain lines instead of annotations. A line
 * identical to the one before it is dropped, so asking again while a run waits
 * for a person does not repeat the same line every poll.
 */
export function makeLogDriver(log: Log): LogDriver {
  let lastMessage: string | undefined = undefined;
  const once = (print: () => void, message: string) => {
    if (message === lastMessage) return;
    lastMessage = message;
    print();
  };
  return {
    error(message, error) {
      const text =
        error === undefined ? message : `${message}\n${describeError(error)}`;
      once(() => log.info(text), text);
    },
    info: (message) => once(() => log.info(message), message),
    warn: (message) => once(() => log.warning(message), message),
  };
}

/** The SDK's dependencies, with every wait and request ended by the signal. */
export function makeSdkDependencies({
  fetch,
  log,
  signal,
}: {
  fetch: FetchDriver;
  log: Log;
  signal: AbortSignal;
}): { clock: ClockDriver; fetch: FetchDriver; log: LogDriver } {
  return {
    clock: { now: clock.now, sleep: (ms) => clock.sleep(ms, signal) },
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
      }),
    log: makeLogDriver(log),
  };
}
