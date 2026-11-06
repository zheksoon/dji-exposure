import { computed, signal } from "@preact/signals";
import type { ChartData } from "chart.js";
import type { AnnotationOptions } from "chartjs-plugin-annotation";
import { exposureIndex } from "../analysis/timeline";
import { analysis, correctionOptions, samples, selected } from "./store";

export const showGain = signal(false);
/** Visible x-range; undefined means the full range. */
export const range = signal<[number, number] | undefined>(undefined);

export const times = computed(() => samples.value.map((s) => s.timestamp));
export const first = computed(() => times.value[0] ?? 0);
export const last = computed(() => times.value.at(-1) ?? 1);
export const view = computed((): [number, number] => range.value ?? [first.value, last.value]);
export const start = computed(() => view.value[0]);
export const end = computed(() => view.value[1]);
export const current = computed(() => samples.value[selected.value]);
export const selectedTime = computed(() => current.value?.timestamp);
export const currentFrame = computed(() => current.value?.frame ?? current.value?.videoFrame);
/** Effective limits: clamped to the correction range the data can reach. */
export const lowLimit = computed(() =>
  Math.max(limitRange.value.low, correctionOptions.value.lowLimit ?? -3.0),
);
export const highLimit = computed(() =>
  Math.min(limitRange.value.high, correctionOptions.value.highLimit ?? 3.0),
);

export const median = computed(() => {
  const samples_ = samples.value,
    ignoreIso = correctionOptions.value.ignoreIso;
  if (analysis.value?.median !== undefined) return analysis.value.median;
  const vals = samples_
    .map((s) => exposureIndex(s, ignoreIso))
    .filter((v): v is number => v !== undefined && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!vals.length) return undefined;
  return (vals[Math.floor((vals.length - 1) / 2)] + vals[Math.floor(vals.length / 2)]) / 2;
});

const ref = computed(() => analysis.value?.reference);

/** Achievable correction range in EV (reference - exposure index), from the data's min/max exposure index. */
export const limitRange = computed(() => {
  const ignoreIso = correctionOptions.value.ignoreIso,
    r = ref.value;
  if (r === undefined) return { low: -6, high: 6 };
  let min = Infinity,
    max = -Infinity;
  for (const s of samples.value) {
    const v = exposureIndex(s, ignoreIso);
    if (v === undefined || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min > max) return { low: -6, high: 6 };
  return { low: Math.min(0, r - max), high: Math.max(0, r - min) };
});
const refNorm = computed(() =>
  ref.value !== undefined && median.value !== undefined ? ref.value - median.value : 0,
);

type Annotations = Record<string, AnnotationOptions>;

const selectionAnnotation = computed(
  (): Annotations => ({
    selection: {
      type: "line",
      scaleID: "x",
      value: selectedTime.value,
      display:
        selectedTime.value !== undefined &&
        selectedTime.value >= start.value &&
        selectedTime.value <= end.value,
      adjustScaleRange: false,
      borderColor: "#88919c",
      borderWidth: 1,
      borderDash: [4, 4],
    },
  }),
);

const exposureAnnotations = computed((): Annotations => {
  const annotations: Annotations = {};
  if (ref.value === undefined) return annotations;
  const refNorm_ = refNorm.value,
    lowLimit_ = lowLimit.value,
    highLimit_ = highLimit.value;
  annotations.upperWaterline = {
    type: "line",
    scaleID: "y",
    value: refNorm_ - lowLimit_,
    borderColor: "rgba(224, 108, 117, 0.85)",
    borderWidth: 1.5,
    borderDash: [6, 4],
    adjustScaleRange: false,
    label: {
      display: true,
      content: `Low limit (${lowLimit_.toFixed(1)} EV)`,
      position: "end",
      backgroundColor: "rgba(35, 38, 43, 0.85)",
      color: "#f07178",
      font: { size: 9 },
      padding: 2,
    },
  };
  annotations.lowerWaterline = {
    type: "line",
    scaleID: "y",
    value: refNorm_ - highLimit_,
    borderColor: "rgba(74, 146, 117, 0.85)",
    borderWidth: 1.5,
    borderDash: [6, 4],
    adjustScaleRange: false,
    label: {
      display: true,
      content: `High limit (+${highLimit_.toFixed(1)} EV)`,
      position: "end",
      backgroundColor: "rgba(35, 38, 43, 0.85)",
      color: "#5bb98c",
      font: { size: 9 },
      padding: 2,
    },
  };
  return annotations;
});

const gainAnnotations = computed((): Annotations => {
  const annotations: Annotations = {};
  if (ref.value === undefined) return annotations;
  const lowLimit_ = lowLimit.value,
    highLimit_ = highLimit.value;
  annotations.gainLow = {
    type: "line",
    scaleID: "y",
    value: 2 ** lowLimit_,
    borderColor: "rgba(224, 108, 117, 0.85)",
    borderWidth: 1.5,
    borderDash: [6, 4],
    adjustScaleRange: false,
    label: {
      display: true,
      content: `Low limit (${(2 ** lowLimit_).toFixed(2)}×)`,
      position: "end",
      backgroundColor: "rgba(35, 38, 43, 0.85)",
      color: "#f07178",
      font: { size: 9 },
      padding: 2,
    },
  };
  annotations.gainHigh = {
    type: "line",
    scaleID: "y",
    value: 2 ** highLimit_,
    borderColor: "rgba(74, 146, 117, 0.85)",
    borderWidth: 1.5,
    borderDash: [6, 4],
    adjustScaleRange: false,
    label: {
      display: true,
      content: `High limit (${(2 ** highLimit_).toFixed(2)}×)`,
      position: "end",
      backgroundColor: "rgba(35, 38, 43, 0.85)",
      color: "#5bb98c",
      font: { size: 9 },
      padding: 2,
    },
  };
  annotations.gainNeutral = {
    type: "line",
    scaleID: "y",
    value: 1.0,
    borderColor: "rgba(127, 113, 181, 0.5)",
    borderWidth: 1,
    borderDash: [3, 3],
    adjustScaleRange: false,
    label: {
      display: true,
      content: "1.0× (Neutral)",
      position: "start",
      backgroundColor: "rgba(35, 38, 43, 0.8)",
      color: "#b0a5db",
      font: { size: 9 },
      padding: 2,
    },
  };
  return annotations;
});

/** Gains with the correction limits applied locally, so limit changes are instant. */
const gains = computed((): (number | null)[] | undefined => {
  const a = analysis.value;
  if (!a || a.reference === undefined || a.median === undefined) return undefined;
  const lo = lowLimit.value,
    hi = highLimit.value,
    r = a.reference,
    m = a.median;
  return a.exposure.map((v) => {
    if (v === null) return null;
    const g = 2 ** Math.min(hi, Math.max(lo, r - (v + m)));
    return Number.isFinite(g) && g > 0 ? g : null;
  });
});

/** Chart.js datasets (plus per-chart metadata) for every visible series. */
export const series = computed(() => {
  const samples_ = samples.value,
    analysis_ = analysis.value,
    options_ = correctionOptions.value,
    median_ = median.value;
  const definitions = [
    {
      label: "ISO",
      color: "#527db4",
      raw: samples_.map((s) => s.iso),
      smooth: undefined,
      shutter: false,
    },
    {
      label: "Shutter",
      color: "#b5783a",
      raw: samples_.map((s) => s.shutterSeconds),
      smooth: undefined,
      shutter: true,
    },
    {
      label: options_.ignoreIso
        ? "Exposure index (shutter only, median = 0)"
        : "Exposure index (stops, median = 0)",
      color: "#7f71b5",
      raw: samples_.map((s) => {
        const val = exposureIndex(s, options_.ignoreIso);
        if (val === undefined || median_ === undefined) return val;
        return val - median_;
      }),
      smooth: analysis_?.exposure,
      shutter: false,
    },
  ];
  const points = (values: (number | null | undefined)[]) =>
    values.map((v, i) => ({ x: samples_[i].timestamp, y: v ?? NaN }));
  const bounds = (values: (number | null | undefined)[]) => {
    let min = Infinity,
      max = -Infinity;
    for (const v of values)
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    if (min > max) return {};
    if (min === max) return { yMin: min - 0.5, yMax: max + 0.5 };
    return { yMin: min, yMax: max };
  };
  const charts: {
    label: string;
    color: string;
    shutter: boolean;
    data: ChartData<"line">;
    yMin?: number;
    yMax?: number;
  }[] = definitions.map((d) => ({
    ...(d.label.startsWith("Exposure index") ? bounds(d.raw) : {}),
    label: d.label,
    color: d.color,
    shutter: d.shutter,
    data: {
      datasets: [
        {
          label: "Raw",
          data: points(d.raw),
          borderColor: d.color,
          borderWidth: 1,
          pointRadius: samples_.length === 1 ? 3 : 0,
          ...(d.smooth && options_.supportSeconds > 0 ? { borderDash: [3, 3] } : {}),
        },
        ...(options_.supportSeconds > 0 && d.smooth
          ? [
              {
                label: "Gaussian",
                data: points(d.smooth),
                borderColor: d.color,
                borderWidth: 2,
                pointRadius: 0,
              },
            ]
          : []),
      ],
    } as ChartData<"line">,
  }));
  if (showGain.value && analysis_ && gains.value) {
    const r = limitRange.value;
    charts.push({
      ...(r.low < r.high ? { yMin: 2 ** r.low, yMax: 2 ** r.high } : {}),
      label: "Correction gain",
      color: "#4a9275",
      shutter: false,
      data: {
        datasets: [
          {
            label: "Linear gain",
            data: points(gains.value ?? []),
            borderColor: "#4a9275",
            borderWidth: 1.5,
            pointRadius: 0,
          },
        ],
      },
    });
  }

  const sel = selectionAnnotation.value;
  return charts.map((c) => ({
    ...c,
    annotations: {
      ...sel,
      ...(c.label.startsWith("Exposure index")
        ? exposureAnnotations.value
        : c.label === "Correction gain"
          ? gainAnnotations.value
          : {}),
    } as Annotations,
  }));
});
