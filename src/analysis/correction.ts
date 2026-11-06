import type { ExposureSample } from "../types";

export type CorrectionOptions = {
  supportSeconds: number;
  ignoreIso: boolean;
  reference: "median" | "first";
  lowLimit?: number;
  highLimit?: number;
};
export const defaultCorrection: CorrectionOptions = {
  supportSeconds: 0,
  ignoreIso: false,
  reference: "median",
  lowLimit: -3.0,
  highLimit: 3.0,
};
export type CorrectionResult = {
  iso?: (number | null)[];
  shutter?: (number | null)[];
  exposure: (number | null)[];
  gains: (number | null)[];
  reference?: number;
  median?: number;
};
const log = (n?: number) => (n !== undefined && Number.isFinite(n) && n > 0 ? Math.log2(n) : null);

/** Deriche 4th-order recursive Gaussian approximation (Deriche 1993):
 * causal kernel Σ e^{-b k/σ}(cosAmp·cos(w k/σ) + sinAmp·sin(w k/σ)). */
const DERICHE = [
  { cosAmp: 1.68, sinAmp: 3.735, b: 1.783, w: 0.6318 },
  { cosAmp: -0.6803, sinAmp: -0.2598, b: 1.723, w: 1.997 },
];

const polyMul = (x: number[], y: number[]) => {
  const r = new Array<number>(x.length + y.length - 1).fill(0);
  for (let i = 0; i < x.length; i++) for (let j = 0; j < y.length; j++) r[i + j] += x[i] * y[j];
  return r;
};

/** Normalized recursion coefficients for a Gaussian of `sigma` samples. */
function dericheCoefficients(sigma: number) {
  // Each exponential term is a 2nd-order section:
  // (α + e(β sin w − α cos w) z⁻¹) / (1 − 2e cos w z⁻¹ + e² z⁻²)
  const terms = DERICHE.map(({ cosAmp, sinAmp, b, w }) => {
    const e = Math.exp(-b / sigma),
      cs = Math.cos(w / sigma),
      sn = Math.sin(w / sigma);
    return {
      n: [cosAmp, e * (sinAmp * sn - cosAmp * cs)],
      d: [1, -2 * e * cs, e * e],
    };
  });
  const den = polyMul(terms[0].d, terms[1].d),
    a = polyMul(terms[0].n, terms[1].d),
    c = polyMul(terms[1].n, terms[0].d),
    num = den.slice(0, 4).map((_, i) => (a[i] ?? 0) + (c[i] ?? 0));
  const sum = (v: number[]) => v.reduce((x, y) => x + y, 0),
    dc = sum(num) / sum(den),
    norm = 2 * dc - num[0];
  return {
    num: num.map((v) => v / norm),
    den,
    dc: dc / norm,
    k0: num[0] / norm,
  };
}

/** Filters one uniformly sampled run; boundaries extend the edge value. */
export function dericheRun(
  x: number[],
  sigma: number,
  start?: number,
  end?: number,
  direction?: number,
): number[] {
  const n = x.length;
  if (n === 0) return [];
  const { num, den, dc, k0 } = dericheCoefficients(sigma);
  const pass = (start: number, end: number, direction: number) => {
    const y = new Array<number>(n);
    const edge = direction > 0 ? x[0] : x[n - 1],
      edgeDc = edge * dc;
    for (let i = start; i !== end; i += direction) {
      let v = 0;
      for (let j = 0; j < 4; j++) {
        const idx = i - direction * j;
        v += num[j] * (idx >= 0 && idx < n ? x[idx] : edge);
      }
      for (let j = 1; j < 5; j++) {
        const idx = i - direction * j;
        v -= den[j] * (idx >= 0 && idx < n ? y[idx] : edgeDc);
      }
      y[i] = v;
    }
    return y;
  };
  if (start !== undefined && end !== undefined && direction !== undefined) {
    return pass(start, end, direction);
  }
  const forward = pass(0, n, 1),
    backward = pass(n - 1, -1, -1),
    result = new Array<number>(n);
  for (let i = 0; i < n; i++) result[i] = forward[i] + backward[i] - k0 * x[i];
  return result;
}

/** Gaussian smoothing with sigma = width / 6 seconds via a constant-time-per-sample
 * Deriche causal + anticausal IIR filter, independent of the support width.
 * Each run of consecutive valid records is treated as uniformly sampled (its mean
 * frame interval) and edge-replicated. Missing records split runs so smoothing
 * cannot bridge an unknown exposure.
 */
export function gaussian(
  times: number[],
  values: (number | null)[],
  width: number,
): (number | null)[] {
  if (!Number.isFinite(width) || width < 0)
    throw Error("Gaussian support width must be finite and nonnegative.");
  if (
    times.length !== values.length ||
    times.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= times[i - 1]))
  )
    throw Error("Smoothing needs unique, increasing presentation timestamps.");
  if (values.some((v) => v !== null && !Number.isFinite(v)))
    throw Error("Invalid smoothing value.");
  if (!width) return values.slice();
  const result = values.slice();
  for (let begin = 0; begin < times.length; ) {
    if (values[begin] === null) {
      begin++;
      continue;
    }
    let end = begin + 1;
    while (end < times.length && values[end] !== null) end++;
    if (end - begin > 1) {
      const dt = (times[end - 1] - times[begin]) / (end - begin - 1),
        sigma = width / 6 / dt;
      const run = dericheRun(values.slice(begin, end) as number[], sigma);
      for (let i = begin; i < end; i++) result[i] = run[i - begin];
    }
    begin = end;
  }
  return result;
}

export function correction(
  samples: ExposureSample[],
  options: CorrectionOptions,
): CorrectionResult {
  if (!["median", "first"].includes(options.reference))
    throw Error("Invalid correction reference.");
  const times = samples.map((s) => s.timestamp);
  const isoLogs = samples.map((s) => log(s.iso));
  const shutterLogs = samples.map((s) => log(s.shutterSeconds));
  const raw = shutterLogs.map((s, i) => {
    if (s === null) return null;
    if (options.ignoreIso) return s;
    const isoLog = isoLogs[i];
    if (isoLog === null || isoLog === undefined) return null;
    return s + isoLog;
  });
  const valid = raw.filter((v): v is number => v !== null);
  let median: number | undefined;
  if (valid.length) {
    valid.sort((a, b) => a - b);
    median = (valid[Math.floor((valid.length - 1) / 2)] + valid[Math.floor(valid.length / 2)]) / 2;
  }
  let reference: number | undefined;
  if (options.reference === "first") reference = raw[0] ?? undefined;
  else reference = median;

  const smoothed = gaussian(times, raw, options.supportSeconds);
  const exposure = smoothed.map((v) => (v !== null && median !== undefined ? v - median : v));
  return {
    exposure,
    gains: smoothed.map((v) => {
      if (v === null || reference === undefined) return null;
      let ev = reference - v;
      if (options.lowLimit !== undefined && Number.isFinite(options.lowLimit)) {
        ev = Math.max(options.lowLimit, ev);
      }
      if (options.highLimit !== undefined && Number.isFinite(options.highLimit)) {
        ev = Math.min(options.highLimit, ev);
      }
      const gain = 2 ** ev;
      return Number.isFinite(gain) && gain > 0 ? gain : null;
    }),
    reference,
    median,
  };
}

/** Same DFSP frame/value format and gain sign as dji_exposure.spline_cli.spline_text.
 * Video-frame indices come from presentation-time alignment, never metadata ordinals.
 */
export async function splineBlob(
  samples: ExposureSample[],
  gains: (number | null)[],
  videoTimes: number[],
  tick: number,
  frameOffset = 0,
): Promise<Blob> {
  if (!Number.isSafeInteger(frameOffset) || !Number.isSafeInteger(frameOffset + videoTimes.length))
    throw Error("Frame offset must be a safe integer.");
  if (
    !Number.isFinite(tick) ||
    tick < 0 ||
    videoTimes.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= videoTimes[i - 1]))
  )
    throw Error("Invalid video presentation timestamps or track tick.");
  if (!videoTimes.length)
    throw Error("Spline export requires a video track with verified frame alignment.");
  if (samples.length !== videoTimes.length || gains.length !== samples.length)
    throw Error("Spline export requires complete metadata for every video frame.");
  if (videoTimes.length > 1) {
    const lastTime = videoTimes[videoTimes.length - 1];
    const step = (lastTime - videoTimes[0]) / (videoTimes.length - 1);
    if (
      step <= 0 ||
      videoTimes.some(
        (t, i) =>
          i > 0 && Math.abs(t - videoTimes[i - 1] - step) > Math.max(2 * tick, step * 0.00001),
      )
    )
      throw Error(
        "Spline export requires constant-rate video PTS. Retimed or variable-rate footage needs separate frame mapping.",
      );
  }
  const parts: BlobPart[] = ["DFSP\n"];
  for (let begin = 0; begin < samples.length; begin += 4096) {
    let text = "";
    for (let i = begin; i < Math.min(samples.length, begin + 4096); i++) {
      if (samples[i].videoFrame !== i)
        throw Error(`Missing or duplicate video-frame alignment at frame ${i}.`);
      const gain = gains[i];
      if (gain === null || !Number.isFinite(gain) || gain <= 0)
        throw Error(`Missing or invalid exposure correction at video frame ${i}.`);
      text += `${i + frameOffset} ${Number(gain.toPrecision(15))}\n`;
    }
    parts.push(text);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Blob(parts, { type: "text/plain;charset=utf-8" });
}
