import { correction, splineBlob } from "../analysis/correction";
import { type Extraction, extract } from "../demux/mp4";
import type { WorkerRequest, WorkerResponse } from "../types";

let extraction: Extraction | undefined,
  loading = false,
  exporting = false;
const emit = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = async ({
  data: request,
}: MessageEvent<WorkerRequest | { type: "load"; file: File }>) => {
  try {
    if (request.type === "load") {
      if (loading) throw new Error("Already processing");
      loading = true;
      try {
        extraction = await extract(request.file, emit);
      } finally {
        loading = false;
      }
    } else if (request.type === "analyze") {
      try {
        if (!extraction || loading) throw Error("Finish processing before analyzing.");
        emit({
          type: "analysis",
          requestId: request.requestId,
          result: correction(extraction.decoder.samples, request.options),
        });
      } catch (e) {
        emit({
          type: "analysis",
          requestId: request.requestId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (request.type === "spline") {
      if (!extraction || loading) throw new Error("Finish processing before exporting");
      if (exporting) return;
      exporting = true;
      try {
        if (extraction.movie.videoTracks.length !== 1)
          throw Error("Spline export requires exactly one video track.");
        if (extraction.decoder.malformed || extraction.decoder.warnings.length)
          throw Error(
            "Resolve spline export requires metadata without decoding or protocol errors.",
          );
        const values = correction(extraction.decoder.samples, request.options);
        const blob = await splineBlob(
          extraction.decoder.samples,
          values.gains,
          extraction.videoTimes,
          extraction.tolerance,
          request.frameOffset,
        );
        emit({
          type: "export",
          blob,
          format: "spl",
        });
      } finally {
        exporting = false;
      }
    }
  } catch (e) {
    emit({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
