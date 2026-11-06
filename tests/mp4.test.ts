import { createHash } from "node:crypto";
import { access, open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { align, presentationTime, validateEdits } from "../src/analysis/timeline";
import { extract, readRange } from "../src/demux/mp4";

const fixtures = new URL("./fixtures/", import.meta.url);
for (const name of ["pocket3-front.mp4", "pocket3-tail.mp4", "pocket3-no-ftyp.mov"]) {
  it(`uses callbacks to extract ${name}`, async () => {
    const session = await extract(new Blob([await readFile(new URL(name, fixtures))]), () => {});
    expect(session.decoder.samples.map((s) => s.iso)).toEqual([400, 500, 600]);
    expect(session.decoder.samples[1].timestamp).toBe(1001 / 30000);
    expect(session.parser.getAllocatedSampleDataSize()).toBe(0);
    if (name.endsWith(".mov")) expect(session.summary.warnings.join()).toContain("QuickTime brand");
  });
}
it("returns track details and a useful notice for missing DJI metadata", async () => {
  const session = await extract(
    new Blob([await readFile(new URL("no-dji.mp4", fixtures))]),
    () => {},
  );
  expect(session.summary.tracks).toHaveLength(1);
  expect(session.decoder.samples).toEqual([]);
  expect(session.summary.warnings.join()).toContain("No DJI");
});
it("validates file reads and rejects malformed indexes", async () => {
  await expect(
    readRange(new Blob([new Uint8Array(8)]), Number.MAX_SAFE_INTEGER, 8),
  ).rejects.toThrow(/range/);
  await expect(extract(new Blob([new Uint8Array(3)]), () => {})).rejects.toThrow(/truncated/);
  await expect(extract(new Blob([new Uint8Array(16)]), () => {})).rejects.toThrow(/index/);
});
it("handles empty edits and media offsets, with unmatched and duplicate video PTS left unaligned", () => {
  const edits = [
    {
      segment_duration: 1000,
      media_time: -1,
      media_rate_integer: 1,
      media_rate_fraction: 0,
    },
    {
      segment_duration: 2000,
      media_time: 3000,
      media_rate_integer: 1,
      media_rate_fraction: 0,
    },
  ];
  validateEdits(3000, 1000, edits);
  expect(presentationTime(6000, 3000, 1000, edits)).toBe(2);
  expect(presentationTime(2000, 3000, 1000, edits)).toBeUndefined();
  expect(presentationTime(9000, 3000, 1000, edits)).toBeUndefined();
  expect(align([0, 0.04, 0.12], 0.12, 0.00001)).toBe(2);
  expect(align([0, 0.04, 0.12], 0.08, 0.00001)).toBeUndefined();
  expect(align([0, 0.04, 0.04], 0.04, 0.00001)).toBeUndefined();
  expect(() => validateEdits(3000, 1000, [{ ...edits[1], media_rate_integer: 0 }])).toThrow();
  expect(() => validateEdits(3000, 1000, [edits[1], edits[1]])).toThrow(/overlapping/);
});
const candidates = [
  resolve(import.meta.dirname, "../data/sample.MP4"),
  resolve(import.meta.dirname, "../../sample.MP4"),
];
let sourcePath = candidates[0];
let available = false;
for (const candidate of candidates) {
  try {
    await access(candidate);
    sourcePath = candidate;
    available = true;
    break;
  } catch {}
}
it.skipIf(!available)(
  "verifies all real Pocket 4 values, sparse reads, and video PTS alignment",
  async () => {
    const handle = await open(sourcePath, "r"),
      stat = await handle.stat();
    let bytes = 0,
      largest = 0;
    const source = {
      size: stat.size,
      slice: (start = 0, end = stat.size) =>
        ({
          arrayBuffer: async () => {
            bytes += end - start;
            largest = Math.max(largest, end - start);
            const data = new Uint8Array(end - start);
            const result = await handle.read(data, 0, data.length, start);
            if (result.bytesRead !== data.length) throw Error("Truncated read");
            return data.buffer;
          },
        }) as Blob,
    };
    try {
      const session = await extract(source, () => {}),
        samples = session.decoder.samples;
      const reference = JSON.parse(
        await readFile(new URL("pocket4-reference.json", fixtures), "utf8"),
      );
      const canonical = samples
        .map(
          (s) =>
            `${s.timestamp.toFixed(6)},${s.frame ?? 0},${s.iso?.toFixed(6)},${s.shutterSeconds?.toFixed(12)}\n`,
        )
        .join("");
      expect(samples).toHaveLength(reference.records);
      expect(createHash("sha256").update(canonical).digest("hex")).toBe(reference.sha256);
      expect(samples[0].videoFrame).toBe(0);
      expect(samples[5000].videoFrame).toBe(5000);
      expect(session.summary.warnings).toEqual([]);
      expect(bytes).toBeLessThan(5 * 1024 * 1024);
      expect(largest).toBeLessThanOrEqual(65536);
      expect(session.parser.getAllocatedSampleDataSize()).toBe(0);
      console.log(
        `MP4Box callbacks: ${samples.length} verified records, ${bytes} bytes, max read ${largest}`,
      );
    } finally {
      await handle.close();
    }
  },
  30000,
);
