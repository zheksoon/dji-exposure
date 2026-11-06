import type { CorrectionOptions, CorrectionResult } from "../analysis/correction";
export type ExposureSample = {
  timestamp: number;
  frame?: number;
  iso?: number;
  shutterSeconds?: number;
  colorTemperature?: number;
  rawFields?: Record<string, unknown>;
  sourceIndex: number;
  videoFrame?: number;
  deviceTimestamp?: string;
  timecode?: string;
};
export type TrackSummary = {
  id: number;
  index: number;
  codec: string;
  type: string;
  name: string;
  samples: number;
  duration: number;
  timescale: number;
  edits: unknown;
};
export type Summary = {
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  tracks: TrackSummary[];
  metadataTrack?: number;
  protocol?: string;
  camera?: string;
  support?: string;
  warnings: string[];
};
export type WorkerRequest =
  | { type: "analyze"; options: CorrectionOptions; requestId: number }
  | { type: "spline"; options: CorrectionOptions; frameOffset: number };
export type WorkerResponse =
  | {
      type: "analysis";
      requestId: number;
      result?: CorrectionResult;
      error?: string;
    }
  | { type: "summary"; summary: Summary }
  | { type: "batch"; samples: ExposureSample[] }
  | { type: "progress"; done: number; total: number; stage: string }
  | { type: "done"; summary: Summary }
  | { type: "error"; message: string }
  | { type: "export"; blob: Blob; format: string };
export type Packet = {
  timestamp: number;
  duration: number;
  sourceIndex: number;
  data: Uint8Array;
};
