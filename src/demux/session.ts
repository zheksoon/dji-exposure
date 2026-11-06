import type { WorkerRequest, WorkerResponse } from "../types";
/** The worker owns MP4Box, the File reader, decoding, inspection and exports. */
export class ExposureSession {
  private worker: Worker;
  constructor(emit: (message: WorkerResponse) => void) {
    this.worker = new Worker(new URL("../workers/exposure.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => emit(data);
    this.worker.onerror = (event) =>
      emit({
        type: "error",
        message: event.message || "Metadata worker failed",
      });
  }
  async start(file: File) {
    this.worker.postMessage({ type: "load", file });
  }
  postMessage(request: WorkerRequest) {
    this.worker.postMessage(request);
  }
  terminate() {
    this.worker.terminate();
  }
}
