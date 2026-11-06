/** Recover small rational durations from numeric metadata, without snapping to
 * photographic presets. Otherwise label the rounded reciprocal as approximate. */
export function formatShutter(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  let x = seconds,
    a = 0,
    b = 1,
    c = 1,
    d = 0;
  for (let i = 0; i < 20; i++) {
    const whole = Math.floor(x),
      n = whole * c + a,
      den = whole * d + b;
    if (den > 10000 || !Number.isSafeInteger(n)) break;
    if (n > 0 && Math.abs(n / den - seconds) <= seconds * 1e-10)
      return den === 1 ? `${n} s` : `${n}/${den} s`;
    [a, b, c, d] = [c, d, n, den];
    const remainder = x - whole;
    if (!remainder) break;
    x = 1 / remainder;
  }
  return seconds < 1
    ? `≈1/${Number((1 / seconds).toPrecision(5))} s`
    : `≈${Number(seconds.toPrecision(5))} s`;
}
