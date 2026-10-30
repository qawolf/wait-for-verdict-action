const unitMs = { h: 60 * 60 * 1000, m: 60 * 1000, s: 1000 };

/**
 * Reads a duration made of hours, minutes and seconds in that order, such as
 * `2h`, `90m`, `5400s` or `1h30m`. A bare number has no unit, so it is invalid.
 */
export function parseDuration(text: string): number | "invalid" {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(
    text.trim().toLowerCase(),
  );
  if (!match) return "invalid";
  const [, hours, minutes, seconds] = match;
  if (hours === undefined && minutes === undefined && seconds === undefined)
    return "invalid";
  const ms =
    Number(hours ?? 0) * unitMs.h +
    Number(minutes ?? 0) * unitMs.m +
    Number(seconds ?? 0) * unitMs.s;
  return ms > 0 ? ms : "invalid";
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : "",
    seconds > 0 || totalSeconds === 0 ? `${seconds}s` : "",
  ];
  return parts.filter((part) => part !== "").join(" ");
}
