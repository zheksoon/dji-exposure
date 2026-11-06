import type { ExposureSample } from "../types";
import { exposureIndex } from "./timeline";
export async function exportBlob(samples: ExposureSample[], format: "csv" | "json"): Promise<Blob> {
  const parts: BlobPart[] = [
    format === "csv"
      ? "Time,Frame,ISO,ShutterSeconds,ColorTemperature,ExposureIndex,SourceSample\r\n"
      : "[\n",
  ];
  for (let start = 0; start < samples.length; start += 4096) {
    const end = Math.min(start + 4096, samples.length);
    let chunk = "";
    for (let i = start; i < end; i++) {
      const s = samples[i];
      chunk +=
        format === "csv"
          ? `${[
              s.timestamp,
              s.frame,
              s.iso,
              s.shutterSeconds,
              s.colorTemperature,
              exposureIndex(s),
              s.sourceIndex,
            ]
              .map((v) => v ?? "")
              .join(",")}\r\n`
          : JSON.stringify({ ...s, exposureIndex: exposureIndex(s) }) +
            (i < samples.length - 1 ? ",\n" : "\n");
    }
    parts.push(new Blob([chunk]));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (format === "json") parts.push("]");
  return new Blob(parts, {
    type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
  });
}
