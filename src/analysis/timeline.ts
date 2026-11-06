import type { ExposureSample } from "../types";
export function nearest(times: number[], t: number): number {
  let lo = 0,
    hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo && (lo === times.length || t - times[lo - 1] <= times[lo] - t) ? lo - 1 : lo;
}
export function exposureIndex(s: ExposureSample, ignoreIso = false): number | undefined {
  if (ignoreIso) {
    if (s.shutterSeconds && s.shutterSeconds > 0) return Math.log2(s.shutterSeconds);
    return undefined;
  }
  if (s.iso && s.shutterSeconds && s.iso > 0 && s.shutterSeconds > 0)
    return Math.log2(s.iso) + Math.log2(s.shutterSeconds);
}

export type Edit = {
  segment_duration: number;
  media_time: number;
  media_rate_integer: number;
  media_rate_fraction: number;
};
export function validateEdits(timescale: number, movieScale: number, edits: Edit[] = []) {
  if (
    !Number.isSafeInteger(timescale) ||
    timescale <= 0 ||
    !Number.isSafeInteger(movieScale) ||
    movieScale <= 0
  )
    throw new Error("Invalid track timescale");
  const ranges: { start: number; end: number }[] = [];
  for (const e of edits) {
    if (e.media_rate_integer !== 1 || e.media_rate_fraction !== 0)
      throw new Error("Non-unit edit rates are unsupported");
    if (
      !Number.isSafeInteger(e.media_time) ||
      e.media_time < -1 ||
      !Number.isSafeInteger(e.segment_duration) ||
      e.segment_duration < 0
    )
      throw new Error("Invalid edit list");
    if (e.media_time >= 0)
      ranges.push({
        start: e.media_time / timescale,
        end: e.media_time / timescale + e.segment_duration / movieScale,
      });
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.some((r, i) => i > 0 && r.start < ranges[i - 1].end))
    throw new Error("Repeated/overlapping media edits are unsupported");
}
export function presentationTime(
  cts: number,
  timescale: number,
  movieScale: number,
  edits: Edit[] = [],
): number | undefined {
  if (!Number.isSafeInteger(cts)) throw new Error("Unsafe presentation timestamp");
  if (!edits.length) return cts / timescale;
  let start = 0;
  for (const edit of edits) {
    const duration = edit.segment_duration / movieScale;
    const relative = (cts - edit.media_time) / timescale;
    if (edit.media_time >= 0 && relative >= 0 && relative < duration) return start + relative;
    start += duration;
  }
}
export function align(times: number[], timestamp: number, tolerance: number): number | undefined {
  if (!times.length) return;
  const i = nearest(times, timestamp);
  if (
    Math.abs(times[i] - timestamp) <= tolerance &&
    times[i - 1] !== times[i] &&
    times[i + 1] !== times[i]
  )
    return i;
}
