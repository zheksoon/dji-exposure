export type TimecodeConfig = {
  startFrame: number;
  timescale: number;
  frameDuration: number;
  numberOfFrames: number;
  dropFrame: boolean;
};

/** Parse QuickTime/MP4 tmcd sample description (20-byte data) and sample payload (4-byte start frame). */
export function parseTmcdSample(
  sampleBytes: ArrayBuffer,
  descData?: Uint8Array,
  tmcdTimescale?: number,
  videoFps?: number,
): TimecodeConfig | undefined {
  if (sampleBytes.byteLength < 4) return undefined;
  const view = new DataView(sampleBytes);
  const startFrame = view.getUint32(0, false);

  let dropFrame = false;
  let timescale = tmcdTimescale || 30000;
  let frameDuration = 1001;
  let numberOfFrames = videoFps ? Math.round(videoFps) : 30;

  if (descData && descData.byteLength >= 17) {
    const descView = new DataView(descData.buffer, descData.byteOffset, descData.byteLength);
    const flags = descView.getUint32(4, false);
    dropFrame = (flags & 1) !== 0;
    const parsedTimescale = descView.getUint32(8, false);
    if (parsedTimescale > 0) timescale = parsedTimescale;
    const parsedDuration = descView.getUint32(12, false);
    if (parsedDuration > 0) frameDuration = parsedDuration;
    const parsedNumFrames = descView.getUint8(16);
    if (parsedNumFrames > 0) numberOfFrames = parsedNumFrames;
  } else if (videoFps) {
    dropFrame = Math.abs(videoFps - 29.97) < 0.05 || Math.abs(videoFps - 59.94) < 0.05;
  }

  return {
    startFrame,
    timescale,
    frameDuration,
    numberOfFrames,
    dropFrame,
  };
}

/** Format frame offset from startFrame into standard SMPTE timecode string (HH:MM:SS;FF or HH:MM:SS:FF). */
export function formatTimecode(frameOffset: number, config: TimecodeConfig): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const totalFrame = config.startFrame + frameOffset;
  if (totalFrame < 0) return "—";

  if (config.dropFrame) {
    const framesPer10M = config.numberOfFrames === 60 ? 35964 : 17982;
    const dropPerMinute = config.numberOfFrames === 60 ? 4 : 2;
    const framesPerMinute = config.numberOfFrames * 60 - dropPerMinute;
    const d = totalFrame;
    const D = Math.floor(d / framesPer10M);
    const m = d % framesPer10M;
    const f = Math.max(0, m - dropPerMinute);
    const dropFrames = dropPerMinute * 9 * D + dropPerMinute * Math.floor(f / framesPerMinute);
    const total = d + dropFrames;
    const frames = total % config.numberOfFrames;
    const seconds = Math.floor(total / config.numberOfFrames) % 60;
    const minutes = Math.floor(total / (config.numberOfFrames * 60)) % 60;
    const hours = Math.floor(total / (config.numberOfFrames * 3600)) % 24;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)};${pad(frames)}`;
  }
  const fps = config.numberOfFrames;
  const frames = totalFrame % fps;
  const seconds = Math.floor(totalFrame / fps) % 60;
  const minutes = Math.floor(totalFrame / (fps * 60)) % 60;
  const hours = Math.floor(totalFrame / (fps * 3600)) % 24;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}
