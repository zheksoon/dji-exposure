import { BoxParser, createFile, type Movie, type MP4BoxBuffer, type Track } from "mp4box";
import { align, presentationTime, validateEdits } from "../analysis/timeline";
import type { ExposureSample, WorkerResponse } from "../types";
import { MAX_PACKET, MAX_SAMPLES } from "../types/limits";
import { Decoder } from "../workers/decoder";
import { chooseTrack, summarize } from "./metadata";
import { formatTimecode, parseTmcdSample, type TimecodeConfig } from "./timecode";

export type Source = Pick<Blob, "size" | "slice">;
export async function readRange(file: Source, offset: number, size: number): Promise<ArrayBuffer> {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size <= 0 ||
    !Number.isSafeInteger(offset + size) ||
    offset + size > file.size
  )
    throw new Error("Invalid MP4 byte range");
  const buffer = await file.slice(offset, offset + size).arrayBuffer();
  if (buffer.byteLength !== size) throw new Error("Truncated file read");
  return buffer;
}

/** MP4Box owns box parsing and sample indexing. The reader follows appendBuffer's
 * requested offsets; onSamples owns payload extraction. No MP4 headers are parsed here.
 */
export async function extract(file: Source, emit: (message: WorkerResponse) => void) {
  if (!Number.isSafeInteger(file.size) || file.size < 8)
    throw new Error("Invalid or truncated MP4/MOV file");
  const parser = createFile(false, undefined, { allowInvalidBoxTypes: true });
  const decoder = new Decoder();
  let movie: Movie | undefined,
    track: Track | undefined,
    summary: ReturnType<typeof summarize> | undefined;
  let failure: Error | undefined,
    delivered = 0,
    indexBytes = 0,
    assumedBrand = false,
    unmatched = 0;
  let videoTimes: number[] = [],
    tolerance = 0;
  let tmcdInfo: TimecodeConfig | undefined,
    tmcdChecked = false;
  let pending: ExposureSample[] = [];

  function applyTimecode(sample: ExposureSample) {
    if (!tmcdInfo) return;
    const frameIndex =
      sample.videoFrame ??
      Math.round(sample.timestamp * (tmcdInfo.timescale / tmcdInfo.frameDuration));
    sample.timecode = formatTimecode(frameIndex, tmcdInfo);
  }

  // Legacy MOV permits no ftyp. Populate only MP4Box's info-model brand through
  // its box-creation API; source buffers and sample offsets are never rewritten.
  parser.onMoovStart = () => {
    if (!parser.ftyp) {
      const brand = new BoxParser.box.ftyp();
      brand.major_brand = "qt  ";
      brand.compatible_brands = ["qt  "];
      parser.addBox(brand);
      assumedBrand = true;
    }
  };
  parser.onError = (module, message) => {
    failure = new Error(`${module}: ${message}`);
  };
  parser.onReady = (info) => {
    movie = info;
    if (info.isFragmented)
      throw new Error(
        "Fragmented MP4 is not supported; use an original progressive camera recording",
      );
    if (info.tracks.length > 32 || info.tracks.reduce((n, t) => n + t.nb_samples, 0) > 2000000)
      throw new Error("MP4 sample tables exceed safety limits");
    track = chooseTrack(info.tracks);
    summary = summarize(info, track);
    if (assumedBrand)
      summary.warnings.push(
        "MOV has no ftyp box; a QuickTime brand was assumed for MP4Box track summaries.",
      );
    if (track) {
      if (track.nb_samples > MAX_SAMPLES)
        throw new Error("Metadata exceeds the 500,000 sample safety limit");
      validateEdits(track.timescale, info.timescale, track.edits);
      if (parser.getTrackSamplesInfo(track.id).some((s) => s.size > MAX_PACKET))
        throw new Error("Metadata sample exceeds 2 MiB safety limit");
      const video = info.videoTracks[0];
      if (video) {
        validateEdits(video.timescale, info.timescale, video.edits);
        videoTimes = parser
          .getTrackSamplesInfo(video.id)
          .map((s) => presentationTime(s.cts, video.timescale, info.timescale, video.edits))
          .filter((t): t is number => t !== undefined)
          .sort((a, b) => a - b);
        tolerance = Math.max(1 / track.timescale, 1 / video.timescale);
        if (info.videoTracks.length > 1)
          summary.warnings.push("Multiple video tracks: alignment uses the first video track.");
      } else summary.warnings.push("No video track: independent frame alignment is unavailable.");
    }
    emit({ type: "summary", summary: { ...summary } });
    if (track?.nb_samples) {
      parser.setExtractionOptions(track.id, undefined, { nbSamples: 1 });
      parser.start();
    }
  };
  parser.onSamples = (id, _user, samples) => {
    if (!track || !movie || !summary) return;
    const currentTrack = track;
    const currentMovie = movie;
    try {
      const packets = samples
        .map((sample) => {
          delivered++;
          return {
            data: sample.data ?? new Uint8Array(),
            sourceIndex: sample.number,
            timestamp: presentationTime(
              sample.cts,
              currentTrack.timescale,
              currentMovie.timescale,
              currentTrack.edits,
            ),
            duration: sample.duration / currentTrack.timescale,
          };
        })
        .filter((p): p is typeof p & { timestamp: number } => p.timestamp !== undefined);
      const result = decoder.decodeBatch(packets);
      for (const sample of result.samples) {
        sample.videoFrame = align(videoTimes, sample.timestamp, tolerance);
        if (videoTimes.length && sample.videoFrame === undefined) unmatched++;
        applyTimecode(sample);
      }
      Object.assign(summary, {
        protocol: result.protocol,
        camera: result.camera,
        support: result.support,
      });
      pending.push(...result.samples);
      // Release each raw payload immediately; send only compact values to the UI.
      if (delivered % 256 === 0 || delivered === track.nb_samples) {
        emit({ type: "summary", summary: { ...summary } });
        emit({ type: "batch", samples: pending });
        pending = [];
        emit({
          type: "progress",
          done: delivered,
          total: track.nb_samples,
          stage: "Extracting metadata",
        });
      }
    } finally {
      const last = samples.at(-1);
      if (last) {
        parser.releaseUsedSamples(id, last.number + 1);
      }
    }
  };
  try {
    let offset = 0;
    emit({
      type: "progress",
      done: 0,
      total: 1,
      stage: "Opening movie index",
    });
    while (offset < file.size && (!movie || (track && delivered < track.nb_samples))) {
      const size = Math.min(track ? 256 : 65536, file.size - offset);
      if (!movie) {
        indexBytes += size;
        if (indexBytes > 64 * 1024 * 1024) {
          throw new Error("Movie index read exceeds 64 MiB safety limit");
        }
      }
      const buffer = (await readRange(file, offset, size)) as MP4BoxBuffer;
      buffer.fileStart = offset;
      const next = parser.appendBuffer(buffer, offset + size === file.size);
      if (failure) throw failure;

      if (movie && !tmcdChecked) {
        tmcdChecked = true;
        const tmcdTrack = movie.tracks.find((t) => t.codec.startsWith("tmcd"));
        if (tmcdTrack) {
          try {
            const tmcdSamples = parser.getTrackSamplesInfo(tmcdTrack.id);
            if (tmcdSamples.length > 0 && tmcdSamples[0].size >= 4) {
              const tmcdBuf = await readRange(file, tmcdSamples[0].offset, tmcdSamples[0].size);
              const desc = tmcdSamples[0].description as {
                data?: Uint8Array;
              };
              tmcdInfo = parseTmcdSample(tmcdBuf, desc?.data, tmcdTrack.timescale, summary?.fps);
            }
          } catch {
            // Continue without timecode if tmcd read fails
          }
        }
      }

      if (!Number.isSafeInteger(next) || next < 0 || next > file.size || next === offset)
        throw new Error("MP4Box requested an invalid or non-advancing read offset");
      offset = next;
    }
    parser.flush();
    if (failure) throw failure;
    if (!movie || !summary)
      throw new Error("No valid movie index found; the file may be incomplete");
    if (track && delivered !== track.nb_samples)
      throw new Error(`Truncated metadata: extracted ${delivered} of ${track.nb_samples} samples`);
    if (track) summary.warnings.push(...decoder.finish());
    if (unmatched)
      summary.warnings.push(
        `${unmatched} metadata samples have no unique video PTS match within one track tick.`,
      );

    if (tmcdInfo) {
      for (const sample of decoder.samples) {
        if (!sample.timecode) applyTimecode(sample);
      }
    }

    emit({ type: "progress", done: 1, total: 1, stage: "Complete" });
    emit({ type: "done", summary });
    return {
      file,
      parser,
      decoder,
      movie,
      track,
      summary,
      videoTimes,
      tolerance,
      tmcdInfo,
    };
  } finally {
    parser.stop();
  }
}
export type Extraction = Awaited<ReturnType<typeof extract>>;
