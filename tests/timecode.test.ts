import { describe, expect, it } from "vitest";
import { formatTimecode, parseTmcdSample } from "../src/demux/timecode";

describe("timecode parser and formatter", () => {
  it("formats 29.97 drop-frame timecode correctly", () => {
    const config = {
      startFrame: 1491774,
      timescale: 30000,
      frameDuration: 1001,
      numberOfFrames: 30,
      dropFrame: true,
    };
    expect(formatTimecode(0, config)).toBe("13:49:35;18");
    expect(formatTimecode(1, config)).toBe("13:49:35;19");
    expect(formatTimecode(30, config)).toBe("13:49:36;18");
  });

  it("formats non-drop-frame timecode correctly", () => {
    const config = {
      startFrame: 1000,
      timescale: 24000,
      frameDuration: 1000,
      numberOfFrames: 24,
      dropFrame: false,
    };
    // 1000 frames @ 24fps: 1000 / 24 = 41.666 s = 00:00:41:16
    expect(formatTimecode(0, config)).toBe("00:00:41:16");
    expect(formatTimecode(8, config)).toBe("00:00:42:00");
  });

  it("parses QuickTime tmcd sample description flags", () => {
    // 20-byte sample description data
    const descData = new Uint8Array([
      0,
      0,
      0,
      0, // reserved
      0,
      0,
      0,
      3, // flags = 3 (dropFrame = true, 24HourMax = true)
      0,
      0,
      117,
      48, // timescale = 30000
      0,
      0,
      3,
      233, // frame duration = 1001
      30, // num frames = 30
      0,
      0,
      0, // reserved
    ]);
    const sampleBytes = new Uint8Array([0x00, 0x16, 0xc3, 0x3e]).buffer; // 1491774
    const config = parseTmcdSample(sampleBytes, descData, 30000, 29.97);
    expect(config).toBeDefined();
    expect(config?.startFrame).toBe(1491774);
    expect(config?.dropFrame).toBe(true);
    expect(config?.timescale).toBe(30000);
    expect(config?.frameDuration).toBe(1001);
    expect(config?.numberOfFrames).toBe(30);
  });
});
