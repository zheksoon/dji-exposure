import { expect, it } from "vitest";
import {
  type CorrectionOptions,
  correction,
  defaultCorrection,
  dericheRun,
  gaussian,
  splineBlob,
} from "../src/analysis/correction";
import { formatShutter } from "../src/ui/format";
import reference from "./fixtures/spline-python-reference.json";

const samples = [400, 800, 200].map((iso, i) => ({
  timestamp: i / 30,
  iso,
  shutterSeconds: 1 / 100,
  sourceIndex: i,
  videoFrame: i,
}));
const times = samples.map((s) => s.timestamp);
it("approximates Python Gaussian exposure and reference/gain math for all 12 configurations (unsmoothed cases)", () => {
  // Smoothed cases are Deriche IIR approximations and not comparable on this tiny nonuniform fixture.
  for (const { options, gains } of reference.cases.filter((c) => !c.options.supportSeconds)) {
    const actual = correction(reference.samples, options as CorrectionOptions);
    actual.gains.forEach((v, i) => {
      expect(v).toBeCloseTo(gains[i], 12);
    });
  }
});
it("Deriche IIR approximates a truncated Gaussian on uniform samples", () => {
  const n = 400,
    t = Array.from({ length: n }, (_, i) => i / 30),
    x = t.map((_, i) => (i === 200 ? 1 : 0)),
    width = 6, // sigma = 1 s = 30 samples
    y = gaussian(t, x, width) as number[];
  const sigma = 30;
  for (const k of [0, 15, 30, 60]) {
    const exact = Math.exp(-0.5 * (k / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
    expect(y[200 + k]).toBeCloseTo(exact, 3);
    expect(y[200 - k]).toBeCloseTo(exact, 3);
  }
  expect(y.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
});
it("is constant time per sample regardless of support width", () => {
  const n = 20000,
    t = Array.from({ length: n }, (_, i) => i / 30),
    x = t.map((_, i) => Math.sin(i / 50));
  const start = performance.now();
  gaussian(t, x, 30);
  expect(performance.now() - start).toBeLessThan(200);
});
it("preserves constants and single samples", () => {
  for (const v of gaussian([0, 1, 2], [5, 5, 5], 10)) expect(v).toBeCloseTo(5, 9);
  expect(gaussian([0], [5], Number.MIN_VALUE)).toEqual([5]);
});
it("supports dericheRun directional passes and full run", () => {
  const x = [1, 2, 4, 3, 5];
  const forward = dericheRun(x, 2, 0, x.length, 1);
  const backward = dericheRun(x, 2, x.length - 1, -1, -1);
  expect(forward).toHaveLength(x.length);
  expect(backward).toHaveLength(x.length);
  const full = dericheRun(x, 2);
  expect(full).toHaveLength(x.length);
  // Single sample and empty run
  expect(dericheRun([], 2)).toEqual([]);
  expect(dericheRun([7], 2)[0]).toBeCloseTo(7, 5);
});
it("does not fill or bridge missing exposure and rejects invalid timing/settings", () => {
  expect(gaussian([0, 0.01, 0.02], [1, null, 5], 1)).toEqual([1, null, 5]);
  expect(gaussian(times, [1, 2, 3], 0)).toEqual([1, 2, 3]);
  for (const width of [-1, Infinity, NaN])
    expect(() => gaussian(times, [1, 2, 3], width)).toThrow();
  expect(() => gaussian([0, 0], [1, 2], 1)).toThrow(/increasing/);
  expect(() => gaussian([0, 1], [1], 1)).toThrow();
  const missing = correction([{ timestamp: 0, sourceIndex: 0 }], defaultCorrection);
  expect(missing.gains).toEqual([null]);
});
it("removes ISO before smoothing and reference selection in shutter-only mode", () => {
  const all = correction(samples, defaultCorrection);
  expect(all.gains[0]).toBeCloseTo(1);
  expect(all.gains[1]).toBeCloseTo(0.5);
  expect(all.gains[2]).toBeCloseTo(2);
  for (const reference of ["first", "median"] as const) {
    const only = correction(samples, {
      supportSeconds: 1,
      ignoreIso: true,
      reference,
    });
    only.gains.forEach((v) => {
      expect(v).toBeCloseTo(1, 12);
    });
  }
  const noIso = correction(
    samples.map((s) => ({ ...s, iso: undefined })),
    { ...defaultCorrection, ignoreIso: true },
  );
  noIso.gains.forEach((v) => {
    expect(v).toBeCloseTo(1);
  });
});
it("applies high and low correction limits to gains", () => {
  // Raw gains with defaultCorrection are [1.0, 0.5, 2.0] which correspond to EV [0, -1, +1]
  const clamped = correction(samples, {
    ...defaultCorrection,
    lowLimit: -0.5,
    highLimit: 0.5,
  });
  expect(clamped.gains[0]).toBeCloseTo(1.0);
  expect(clamped.gains[1]).toBeCloseTo(2 ** -0.5); // clamped from 0.5 (-1.0 EV) to 2^-0.5 (-0.5 EV)
  expect(clamped.gains[2]).toBeCloseTo(2 ** 0.5); // clamped from 2.0 (+1.0 EV) to 2^+0.5 (+0.5 EV)

  const clampedLowOnly = correction(samples, {
    ...defaultCorrection,
    lowLimit: -0.2,
    highLimit: 2.0,
  });
  expect(clampedLowOnly.gains[1]).toBeCloseTo(2 ** -0.2);
  expect(clampedLowOnly.gains[2]).toBeCloseTo(2.0);
});
it("writes Python-compatible DFSP gain keys, offsets and newline in bounded export chunks", async () => {
  expect(await (await splineBlob(samples, [1, 0.5, 2], times, 1 / 30000, 1001)).text()).toBe(
    "DFSP\n1001 1\n1002 0.5\n1003 2\n",
  );
  const many = Array.from({ length: 4200 }, (_, i) => ({
    ...samples[0],
    timestamp: i / 30,
    sourceIndex: i,
    videoFrame: i,
  }));
  const text = await (
    await splineBlob(
      many,
      many.map(() => 1),
      many.map((s) => s.timestamp),
      1 / 30000,
      -10,
    )
  ).text();
  expect(text.split("\n")).toHaveLength(4202);
  expect(text).toMatch(/4189 1\n$/);
});
it("rejects missing, duplicate or partial frame alignment, VFR and invalid gains", async () => {
  await expect(splineBlob(samples, [1, 1, 1], [], 0)).rejects.toThrow(/video track/);
  await expect(splineBlob(samples.slice(1), [1, 1], times, 0)).rejects.toThrow(/complete/);
  await expect(
    splineBlob(
      samples.map((s) => ({ ...s, videoFrame: 0 })),
      [1, 1, 1],
      times,
      0,
    ),
  ).rejects.toThrow(/alignment/);
  await expect(splineBlob(samples, [1, 1, 1], [0, 0.03, 0.08], 1 / 30000)).rejects.toThrow(
    /constant-rate/,
  );
  for (const n of [null, NaN, Infinity, 0, -1])
    await expect(splineBlob(samples, [1, n, 1], times, 0)).rejects.toThrow(/exposure/);
  await expect(splineBlob(samples, [1, 1, 1], times, 0, 0.5)).rejects.toThrow(/offset/);
});
it("formats exact small rational shutters without snapping to camera presets", () => {
  expect(formatShutter(1 / 100)).toBe("1/100 s");
  expect(formatShutter(1 / 143)).toBe("1/143 s");
  expect(formatShutter(3 / 1000)).toBe("3/1000 s");
  expect(formatShutter(2)).toBe("2 s");
  expect(formatShutter(Math.PI / 1000)).toContain("≈");
  expect(formatShutter()).toBe("—");
});
