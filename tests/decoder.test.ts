import { create, toBinary } from "@bufbuild/protobuf";
import type { Movie, Track } from "mp4box";
import { expect, it } from "vitest";
import { chooseTrack, summarize } from "../src/demux/metadata";
import { Pocket4PacketSchema } from "../src/dji/mappings";
import { Decoder, MAX_PACKET } from "../src/workers/decoder";

function packet(timestamp: number, sourceIndex: number, header = false) {
  return {
    timestamp,
    sourceIndex,
    duration: 1001 / 30000,
    data: toBinary(
      Pocket4PacketSchema,
      create(Pocket4PacketSchema, {
        ...(header ? { header: { meta: { protocol: "dvtm_osmo_pocket_4.proto" } } } : {}),
        payload: {
          camera: {
            iso: { value: 400 },
            shutter: { rational: [1n, 143n] },
          },
        },
      }),
    ),
  };
}

it("keeps protocol context across batches and trusts packet PTS, not sample index", () => {
  const d = new Decoder();
  d.decodeBatch([packet(2, 0, true)]);
  const result = d.decodeBatch([packet(2.12, 9)]);
  expect(result.samples[0]).toMatchObject({
    timestamp: 2.12,
    sourceIndex: 9,
    iso: 400,
    shutterSeconds: 1 / 143,
  });
  expect(result.samples[0].frame).toBeUndefined();
  expect(d.finish()).toEqual([]);
});

it("reports malformed packets without leaking fields into later records", () => {
  const d = new Decoder();
  const bad = { ...packet(0, 0), data: new Uint8Array([10, 255]) };
  const result = d.decodeBatch([bad, packet(0.1, 1, true)]);
  expect(result.samples).toHaveLength(1);
  expect(result.samples[0].sourceIndex).toBe(1);
  expect(d.finish().join()).toContain("1 malformed samples skipped");
});

it("does not infer exposure for unidentified protocols", () => {
  const d = new Decoder();
  expect(d.decodeBatch([packet(0, 0)]).samples[0].iso).toBeUndefined();
  expect(d.finish().join()).toContain("No mapped ISO/shutter");
});

it("rejects invalid packet timing and oversized packets", () => {
  const d = new Decoder();
  expect(d.decodeBatch([packet(Number.NaN, 0, true)]).samples).toEqual([]);
  expect(
    d.decodeBatch([{ ...packet(0, 0, true), data: new Uint8Array(MAX_PACKET + 1) }]).samples,
  ).toEqual([]);
  expect(d.warnings.join()).toContain("exceeds 2 MiB limit");
});

const track = (id: number, codec: string) =>
  ({
    id,
    codec,
    type: "metadata",
    name: codec,
    nb_samples: 3,
    timescale: 30000,
    duration: 3003,
    samples_duration: 3003,
  }) as Track;

it("selects DJI sample-entry codecs independently of track ordinal", () => {
  const tracks = [track(7, "tmcd"), track(4, "dbgi"), track(3, "djmd")];
  expect(chooseTrack(tracks)?.id).toBe(3);
  expect(chooseTrack([...tracks, { ...track(9, "djmd"), name: "CAM meta" } as Track])?.id).toBe(9);
  expect(chooseTrack([tracks[0]])).toBeUndefined();
});

it("summarizes real codecs and track timescales", () => {
  const video = {
      ...track(1, "hvc1"),
      type: "video",
      video: { width: 3840, height: 2160 },
    } as Track,
    data = track(3, "djmd");
  const result = summarize(
    {
      duration: 3003,
      timescale: 30000,
      tracks: [video, data],
      videoTracks: [video],
    } as Movie,
    data,
  );
  expect(result.fps).toBeCloseTo(30000 / 1001);
  expect(result.tracks[1].codec).toBe("djmd");
  expect(result.tracks[1].timescale).toBe(30000);
  expect(result.warnings).toEqual([]);
});
