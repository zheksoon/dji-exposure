import type { Movie, Track } from "mp4box";
import type { Summary } from "../types";
export function isMetadata(track: Pick<Track, "codec">) {
  return /^(djmd|dbgi)(\.|$)/.test(track.codec);
}
export function chooseTrack(tracks: Track[]) {
  const candidates = tracks.filter(isMetadata);
  return (
    candidates.find((t) => t.name === "CAM meta") ??
    candidates.find((t) => t.codec.startsWith("djmd")) ??
    candidates[0]
  );
}
export function summarize(info: Movie, selected?: Track): Summary {
  if (
    !Number.isSafeInteger(info.duration) ||
    info.duration < 0 ||
    !Number.isSafeInteger(info.timescale) ||
    info.timescale <= 0
  )
    throw new Error("Invalid movie duration or timescale");
  const video = info.videoTracks[0];
  return {
    duration: info.duration / info.timescale,
    width: video?.video?.width,
    height: video?.video?.height,
    fps:
      video && video.samples_duration > 0
        ? (video.nb_samples * video.timescale) / video.samples_duration
        : undefined,
    metadataTrack: selected?.id,
    tracks: info.tracks.map((t, index) => ({
      id: t.id,
      index,
      codec: t.codec,
      type: isMetadata(t) ? "data" : (t.type ?? "other"),
      name: t.name,
      samples: t.nb_samples,
      timescale: t.timescale,
      duration: t.duration / t.timescale,
      edits: t.edits ?? [],
    })),
    warnings: selected ? [] : ["No DJI djmd/dbgi timed metadata track found."],
  };
}
