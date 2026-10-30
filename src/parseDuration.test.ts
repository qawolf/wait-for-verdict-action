import { describe, expect, it } from "@jest/globals";

import { formatDuration, parseDuration } from "./parseDuration.js";

describe("parseDuration", () => {
  it.each([
    ["2h", 7_200_000],
    ["90m", 5_400_000],
    ["5400s", 5_400_000],
    ["1h30m", 5_400_000],
    ["1h30m15s", 5_415_000],
    [" 45M ", 2_700_000],
  ])("reads %s", (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(["", "90", "0m", "1.5h", "30m1h", "two hours", "-5m", "5 m"])(
    "rejects '%s'",
    (text) => {
      expect(parseDuration(text)).toBe("invalid");
    },
  );
});

describe("formatDuration", () => {
  it.each([
    [7_200_000, "2h"],
    [5_415_000, "1h 30m 15s"],
    [90_000, "1m 30s"],
    [0, "0s"],
  ])("formats %d ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
