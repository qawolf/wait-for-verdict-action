import { describe, expect, it, jest } from "@jest/globals";

import type { FetchDriver } from "@qawolf/ci-sdk";

import {
  clock,
  makeLogDriver,
  makeSdkDependencies,
} from "./sdkDependencies.js";

function makeLog() {
  return {
    info: jest.fn<(message: string) => void>(),
    warning: jest.fn<(message: string) => void>(),
  };
}

describe("makeLogDriver", () => {
  it("drops a line identical to the one before it", () => {
    const log = makeLog();
    const driver = makeLogDriver(log);

    driver.error("❓ Needs review.");
    driver.error("❓ Needs review.");
    driver.info("⏳ 1 run executing...");
    driver.error("❓ Needs review.");

    expect(log.info.mock.calls).toEqual([
      ["❓ Needs review."],
      ["⏳ 1 run executing..."],
      ["❓ Needs review."],
    ]);
  });

  it("prints warnings as warnings and errors with their cause", () => {
    const log = makeLog();
    const driver = makeLogDriver(log);

    driver.warn("Trying again.");
    driver.error("Invalid response.", Error("boom"));

    expect(log.warning).toHaveBeenCalledWith("Trying again.");
    expect(log.info).toHaveBeenCalledWith("Invalid response.\nError: boom");
  });
});

describe("clock.sleep", () => {
  it("ends early when the signal aborts", async () => {
    const controller = new AbortController();
    const startedAt = Date.now();

    const sleeping = clock.sleep(60_000, controller.signal);
    controller.abort();
    await sleeping;

    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});

describe("makeSdkDependencies fetch", () => {
  function setUp() {
    const cancellation = new AbortController();
    const fetch = jest.fn<FetchDriver>(async () => new Response());
    const deps = makeSdkDependencies({
      fetch,
      log: makeLog(),
      signal: cancellation.signal,
    });
    const sentSignal = () => fetch.mock.calls[0]?.[1]?.signal;
    return { cancellation, deps, sentSignal };
  }

  it("ends a request without a signal of its own on cancellation", async () => {
    const { cancellation, deps, sentSignal } = setUp();

    await deps.fetch("https://app.qawolf.com/api", { method: "GET" });
    cancellation.abort();

    expect(sentSignal()?.aborted).toBe(true);
  });

  it("ends a request with its own signal when that signal aborts", async () => {
    const { deps, sentSignal } = setUp();
    const request = new AbortController();

    await deps.fetch("https://app.qawolf.com/api", { signal: request.signal });
    expect(sentSignal()?.aborted).toBe(false);
    request.abort();

    expect(sentSignal()?.aborted).toBe(true);
  });

  it("ends a request with its own signal on cancellation", async () => {
    const { cancellation, deps, sentSignal } = setUp();
    const request = new AbortController();

    await deps.fetch("https://app.qawolf.com/api", { signal: request.signal });
    cancellation.abort();

    expect(sentSignal()?.aborted).toBe(true);
  });
});
