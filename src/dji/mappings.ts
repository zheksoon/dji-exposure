import { create, createFileRegistry, fromBinary, type Message } from "@bufbuild/protobuf";
import { messageDesc } from "@bufbuild/protobuf/codegenv2";
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorProtoSchema,
} from "@bufbuild/protobuf/wkt";
import type { ExposureSample } from "../types";

export type HeaderMeta = Message<"dji.HeaderMeta"> & {
  protocol?: string;
};

export type Header = Message<"dji.Header"> & {
  meta?: HeaderMeta;
};

export type HeaderPacket = Message<"dji.HeaderPacket"> & {
  header?: Header;
};

export type FloatBox = Message<"dji.FloatBox"> & {
  value?: number;
};

export type UintBox = Message<"dji.UintBox"> & {
  value?: bigint;
};

export type ShutterBox = Message<"dji.ShutterBox"> & {
  rational: bigint[];
};

export type Pocket3FrameInfo = Message<"dji.Pocket3FrameInfo"> & {
  frame?: bigint;
  deviceTimestamp?: bigint;
};

export type Pocket3Camera = Message<"dji.Pocket3Camera"> & {
  iso?: FloatBox;
  shutter?: ShutterBox;
  colorTemperature?: UintBox;
};

export type Pocket3Payload = Message<"dji.Pocket3Payload"> & {
  frameInfo?: Pocket3FrameInfo;
  camera?: Pocket3Camera;
};

export type Pocket3Packet = Message<"dji.Pocket3Packet"> & {
  header?: Header;
  payload?: Pocket3Payload;
};

export type Pocket4FrameInfo = Message<"dji.Pocket4FrameInfo"> & {
  frame?: bigint;
};

export type Pocket4Camera = Message<"dji.Pocket4Camera"> & {
  iso?: FloatBox;
  shutter?: ShutterBox;
};

export type Pocket4Payload = Message<"dji.Pocket4Payload"> & {
  frameInfo?: Pocket4FrameInfo;
  camera?: Pocket4Camera;
};

export type Pocket4Packet = Message<"dji.Pocket4Packet"> & {
  header?: Header;
  payload?: Pocket4Payload;
};

const { MESSAGE, STRING, UINT64, FLOAT } = FieldDescriptorProto_Type;
const { OPTIONAL, REPEATED } = FieldDescriptorProto_Label;

const djiFileProto = create(FileDescriptorProtoSchema, {
  name: "dji.proto",
  package: "dji",
  syntax: "proto3",
  messageType: [
    {
      name: "HeaderMeta",
      field: [{ name: "protocol", number: 1, label: OPTIONAL, type: STRING, proto3Optional: true }],
    },
    {
      name: "Header",
      field: [
        { name: "meta", number: 1, label: OPTIONAL, type: MESSAGE, typeName: ".dji.HeaderMeta" },
      ],
    },
    {
      name: "HeaderPacket",
      field: [
        { name: "header", number: 1, label: OPTIONAL, type: MESSAGE, typeName: ".dji.Header" },
      ],
    },
    {
      name: "FloatBox",
      field: [{ name: "value", number: 1, label: OPTIONAL, type: FLOAT, proto3Optional: true }],
    },
    {
      name: "UintBox",
      field: [{ name: "value", number: 1, label: OPTIONAL, type: UINT64, proto3Optional: true }],
    },
    {
      name: "ShutterBox",
      field: [{ name: "rational", number: 1, label: REPEATED, type: UINT64 }],
    },
    {
      name: "Pocket3FrameInfo",
      field: [
        { name: "frame", number: 1, label: OPTIONAL, type: UINT64, proto3Optional: true },
        {
          name: "device_timestamp",
          number: 2,
          label: OPTIONAL,
          type: UINT64,
          proto3Optional: true,
        },
      ],
    },
    {
      name: "Pocket3Camera",
      field: [
        { name: "iso", number: 9, label: OPTIONAL, type: MESSAGE, typeName: ".dji.FloatBox" },
        {
          name: "shutter",
          number: 10,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.ShutterBox",
        },
        {
          name: "color_temperature",
          number: 24,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.UintBox",
        },
      ],
    },
    {
      name: "Pocket3Payload",
      field: [
        {
          name: "frame_info",
          number: 1,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.Pocket3FrameInfo",
        },
        {
          name: "camera",
          number: 2,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.Pocket3Camera",
        },
      ],
    },
    {
      name: "Pocket3Packet",
      field: [
        { name: "header", number: 1, label: OPTIONAL, type: MESSAGE, typeName: ".dji.Header" },
        {
          name: "payload",
          number: 3,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.Pocket3Payload",
        },
      ],
    },
    {
      name: "Pocket4FrameInfo",
      field: [{ name: "frame", number: 1, label: OPTIONAL, type: UINT64, proto3Optional: true }],
    },
    {
      name: "Pocket4Camera",
      field: [
        { name: "iso", number: 9, label: OPTIONAL, type: MESSAGE, typeName: ".dji.FloatBox" },
        {
          name: "shutter",
          number: 10,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.ShutterBox",
        },
      ],
    },
    {
      name: "Pocket4Payload",
      field: [
        {
          name: "frame_info",
          number: 1,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.Pocket4FrameInfo",
        },
        {
          name: "camera",
          number: 2,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.Pocket4Camera",
        },
      ],
    },
    {
      name: "Pocket4Packet",
      field: [
        { name: "header", number: 1, label: OPTIONAL, type: MESSAGE, typeName: ".dji.Header" },
        {
          name: "payload",
          number: 3,
          label: OPTIONAL,
          type: MESSAGE,
          typeName: ".dji.Pocket4Payload",
        },
      ],
    },
  ],
});

const djiRegistry = createFileRegistry(djiFileProto, () => undefined);
const djiFile = djiRegistry.files[Symbol.iterator]().next().value;
if (!djiFile) throw new Error("Failed to initialize DJI protobuf registry");

export const HeaderPacketSchema = messageDesc<HeaderPacket>(djiFile, 2);
export const Pocket3PacketSchema = messageDesc<Pocket3Packet>(djiFile, 9);
export const Pocket4PacketSchema = messageDesc<Pocket4Packet>(djiFile, 13);

const READ_OPTIONS = { readUnknownFields: false } as const;

type Definition = {
  protocols: string[];
  camera: string;
  support?: string;
  parseSample: (bytes: Uint8Array, sample: ExposureSample) => void;
};

function safeUnsigned(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Integer exceeds safe numeric precision");
  return Number(value);
}

function applyCommonExposure(
  frame: bigint | undefined,
  iso: number | undefined,
  shutter: ShutterBox | undefined,
  sample: ExposureSample,
) {
  if (frame !== undefined) {
    sample.frame = safeUnsigned(frame);
  }
  if (iso !== undefined) {
    if (!Number.isFinite(iso) || iso <= 0) throw new Error("iso must be positive");
    sample.iso = iso;
  }
  if (shutter !== undefined && shutter.rational.length > 0) {
    if (shutter.rational.length !== 2 || shutter.rational[1] <= 0n)
      throw new Error("Invalid rational shutter");
    const shutterSeconds = Number(shutter.rational[0]) / Number(shutter.rational[1]);
    if (!Number.isFinite(shutterSeconds) || shutterSeconds <= 0)
      throw new Error("shutterSeconds must be positive");
    sample.shutterSeconds = shutterSeconds;
  }
}

export const definitions: Definition[] = [
  {
    protocols: ["dvtm_PP-101.proto"],
    camera: "DJI Osmo Pocket 3",
    support: "ExifTool documented mapping",
    parseSample(bytes, sample) {
      const msg = fromBinary(Pocket3PacketSchema, bytes, READ_OPTIONS);
      const frameInfo = msg.payload?.frameInfo;
      const camera = msg.payload?.camera;
      applyCommonExposure(frameInfo?.frame, camera?.iso?.value, camera?.shutter, sample);
      if (camera?.colorTemperature?.value !== undefined) {
        const ct = safeUnsigned(camera.colorTemperature.value);
        if (ct <= 0) throw new Error("colorTemperature must be positive");
        sample.colorTemperature = ct;
      }
      if (frameInfo?.deviceTimestamp !== undefined) {
        sample.deviceTimestamp = frameInfo.deviceTimestamp.toString();
      }
    },
  },
  {
    protocols: ["dvtm_osmo_pocket_4.proto"],
    camera: "DJI Osmo Pocket 4",
    parseSample(bytes, sample) {
      const msg = fromBinary(Pocket4PacketSchema, bytes, READ_OPTIONS);
      const frameInfo = msg.payload?.frameInfo;
      const camera = msg.payload?.camera;
      applyCommonExposure(frameInfo?.frame, camera?.iso?.value, camera?.shutter, sample);
    },
  },
];

export function identify(bytes: Uint8Array): string | undefined {
  const msg = fromBinary(HeaderPacketSchema, bytes, READ_OPTIONS);
  const protocol = msg.header?.meta?.protocol;
  if (protocol && /^(dvtm_|dbginfo)[\w.-]+\.proto$/.test(protocol)) {
    return protocol;
  }
}

export function definition(protocol?: string) {
  return definitions.find((d) => d.protocols.includes(protocol ?? ""));
}

export function decode(
  bytes: Uint8Array,
  protocol: string | undefined,
  timestamp: number,
  sourceIndex: number,
): ExposureSample {
  const sample: ExposureSample = { timestamp, sourceIndex };
  const def = definition(protocol);
  if (def) {
    def.parseSample(bytes, sample);
  }
  return sample;
}
