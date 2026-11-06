import { batch, computed, effect, signal } from "@preact/signals";
import {
  type CorrectionOptions,
  type CorrectionResult,
  defaultCorrection,
} from "../analysis/correction";
import { ExposureSession } from "../demux/session";
import type { ExposureSample, Summary, WorkerRequest, WorkerResponse } from "../types";

export const correctionOptions = signal<CorrectionOptions>(defaultCorrection);
export const analysis = signal<CorrectionResult | undefined>(undefined);
export const analysisError = signal<string | undefined>(undefined);
export const calculating = signal(false);
export const frameOffset = signal(0);
export const file = signal<File | undefined>(undefined);
export const summary = signal<Summary | undefined>(undefined);
export const samples = signal<ExposureSample[]>([]);
export const busy = signal(false);
export const exporting = signal(false);
export const error = signal("");
export const progress = signal<{ done: number; total: number }>({
  done: 0,
  total: 1,
});
export const selected = signal(0);
export const pendingCount = signal(0);

let analysisId = 0;
let worker: ExposureSession | undefined;
let pending: ExposureSample[] = [];

export function send(message: WorkerRequest) {
  worker?.postMessage(message);
}

export function terminate() {
  worker?.terminate();
  worker = undefined;
}

export function cancel() {
  terminate();
  pending = [];
  pendingCount.value = 0;
  batch(() => {
    busy.value = false;
    error.value = "Processing canceled. Reopen the file to start again.";
  });
}

export function select(index: number) {
  if (index >= 0 && index < samples.value.length) selected.value = index;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function requestSpline() {
  error.value = "";
  exporting.value = true;
  send({
    type: "spline",
    options: correctionOptions.value,
    frameOffset: frameOffset.value,
  });
}

export function load(input: File) {
  if (!/\.(mp4|mov)$/i.test(input.name)) {
    error.value = "Choose an MP4 or MOV file.";
    return;
  }
  terminate();
  analysisId++;
  pending = [];
  batch(() => {
    file.value = input;
    summary.value = undefined;
    samples.value = [];
    analysis.value = undefined;
    analysisError.value = undefined;
    calculating.value = false;
    pendingCount.value = 0;
    selected.value = 0;
    error.value = "";
    busy.value = true;
    exporting.value = false;
    progress.value = { done: 0, total: 1 };
  });

  const w = new ExposureSession((m: WorkerResponse) => {
    batch(() => {
      if (m.type === "summary") summary.value = m.summary;
      if (m.type === "progress") progress.value = m;
      if (m.type === "batch") {
        pending.push(...m.samples);
        pendingCount.value = pending.length;
      }
      if (m.type === "done") {
        summary.value = m.summary;
        samples.value = pending.sort(
          (a, b) => a.timestamp - b.timestamp || a.sourceIndex - b.sourceIndex,
        );
        busy.value = false;
      }
      if (m.type === "error") {
        error.value = m.message;
        busy.value = false;
        exporting.value = false;
      }
      if (m.type === "analysis" && m.requestId >= minAnalysisId && m.requestId > appliedId) {
        appliedId = m.requestId;
        analysis.value = m.result;
        analysisError.value = m.error;
        calculating.value = m.requestId !== analysisId;
      }
      if (m.type === "export") {
        download(m.blob, `${input.name}.exposure.${m.format}`);
        exporting.value = false;
      }
    });
  });
  worker = w;
  void w.start(input);
}

const analysisOptions = computed(() => {
  const { supportSeconds, ignoreIso, reference } = correctionOptions.value;
  return { supportSeconds, ignoreIso, reference };
});
// Only the smoothing/reference fields matter here; limits never reach this effect.
const smoothKey = computed(() => JSON.stringify(analysisOptions.value));

let analyzedSamples: unknown;
let minAnalysisId = 0;
let appliedId = 0;
/** Re-run analysis when samples, busy state or smoothing/reference options change.
 * Correction limits are applied locally (see derived.ts), and the previous result
 * stays on screen until a newer one arrives, so smoothing updates continuously. */
effect(() => {
  const s = samples.value,
    isBusy = busy.value;
  smoothKey.value;
  const options = analysisOptions.peek();
  const id = ++analysisId;
  batch(() => {
    if (analyzedSamples !== s) {
      analysis.value = undefined;
      minAnalysisId = id;
      appliedId = 0;
    }
    analyzedSamples = s;
    analysisError.value = undefined;
    calculating.value = !isBusy && s.length > 0;
  });
  if (isBusy || !s.length) return;
  send({ type: "analyze", options, requestId: id });
});

export const track = computed(() =>
  summary.value?.tracks.find((t) => t.id === summary.value?.metadataTrack),
);
export const canExport = computed(
  () =>
    !exporting.value &&
    !calculating.value &&
    !!analysis.value &&
    analysis.value.reference !== undefined &&
    !analysisError.value,
);
export const maxSmooth = computed(() =>
  Math.max(10, Math.min(30, Math.ceil(summary.value?.duration || 10))),
);
