import { create, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { exportBlob } from "../src/analysis/export";
import { exposureIndex, nearest } from "../src/analysis/timeline";
import { decode, identify, Pocket3PacketSchema, Pocket4PacketSchema } from "../src/dji/mappings";

function pocket3Bytes(protocol = "dvtm_PP-101.proto", frame = 7n) {
  return toBinary(
    Pocket3PacketSchema,
    create(Pocket3PacketSchema, {
      header: { meta: { protocol } },
      payload: {
        frameInfo: { frame, deviceTimestamp: 18446744073709551615n },
        camera: {
          iso: { value: 400 },
          shutter: { rational: [1n, 143n] },
          colorTemperature: { value: 5600n },
        },
      },
    }),
  );
}

describe("DJI schema-based decoding", () => {
  it("identifies protocols and ignores unknown protocols", () => {
    const bytes = pocket3Bytes("dvtm_new.proto");
    const protocol = identify(bytes);
    expect(protocol).toBe("dvtm_new.proto");
    expect(decode(bytes, protocol, 1, 0)).toEqual({
      timestamp: 1,
      sourceIndex: 0,
    });
  });

  it("decodes documented Pocket 3 fields, including rational shutter and uint64 timestamp", () => {
    const bytes = pocket3Bytes();
    const protocol = identify(bytes);
    expect(protocol).toBe("dvtm_PP-101.proto");
    const s = decode(bytes, protocol, 0.25, 3);
    expect(s).toMatchObject({
      timestamp: 0.25,
      sourceIndex: 3,
      frame: 7,
      iso: 400,
      shutterSeconds: 1 / 143,
      colorTemperature: 5600,
      deviceTimestamp: "18446744073709551615",
    });
    expect(exposureIndex(s)).toBeCloseTo(Math.log2(400 / 143));
  });

  it("decodes only verified Pocket 4 frame/ISO/shutter fields", () => {
    // Encode with Pocket 3 schema (which includes colorTemperature and deviceTimestamp)
    // and verify Pocket 4 schema ignores unverified fields
    const bytes = pocket3Bytes("dvtm_osmo_pocket_4.proto");
    const protocol = identify(bytes);
    expect(protocol).toBe("dvtm_osmo_pocket_4.proto");
    const s = decode(bytes, protocol, 0, 0);
    expect(s.frame).toBe(7);
    expect(s.iso).toBe(400);
    expect(s.shutterSeconds).toBe(1 / 143);
    expect(s.colorTemperature).toBeUndefined();
    expect(s.deviceTimestamp).toBeUndefined();
  });

  it("rejects overflowing frame integers, invalid rationals, and non-positive ISO", () => {
    const overflowFrame = toBinary(
      Pocket4PacketSchema,
      create(Pocket4PacketSchema, {
        payload: { frameInfo: { frame: 18446744073709551615n } },
      }),
    );
    expect(() => decode(overflowFrame, "dvtm_osmo_pocket_4.proto", 0, 0)).toThrow(/precision/);

    for (const rational of [[1n, 0n], [1n], [1n, 2n, 3n]]) {
      const badRational = toBinary(
        Pocket4PacketSchema,
        create(Pocket4PacketSchema, {
          payload: { camera: { shutter: { rational } } },
        }),
      );
      expect(() => decode(badRational, "dvtm_osmo_pocket_4.proto", 0, 0)).toThrow(
        /Invalid rational/,
      );
    }

    const nanIso = toBinary(
      Pocket4PacketSchema,
      create(Pocket4PacketSchema, {
        payload: { camera: { iso: { value: Number.NaN } } },
      }),
    );
    expect(() => decode(nanIso, "dvtm_osmo_pocket_4.proto", 0, 0)).toThrow(/iso/);
  });
});

it("selects chart samples using timestamps rather than frame index", () => {
  expect(nearest([0, 0.04, 0.12, 0.15], 0.119)).toBe(2);
});

it("exports valid JSON and CSV with numeric missing values empty", async () => {
  const samples = [
    decode(pocket3Bytes(), "dvtm_PP-101.proto", 0, 0),
    { timestamp: 1, sourceIndex: 1 },
  ];
  const json = JSON.parse(await (await exportBlob(samples, "json")).text());
  expect(json.length).toBe(2);
  expect(json[0].iso).toBe(400);
  const csv = await (await exportBlob(samples, "csv")).text();
  expect(csv).toContain("1,,,,,,1\r\n");
});
