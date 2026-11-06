# DJI Exposure

Browser app that reads per-frame exposure metadata (ISO, shutter, color temperature) embedded in DJI MP4 files, plots it on an interactive chart, and lets you expore DaVinci Resolve .spl file with gain for correction in Fusion using keyframes. Parsing runs locally using `mp4box` and DJI protobuf telemetry. Nothing is uploaded.

## Stack

Preact + signals, Vite, TypeScript, Chart.js (zoom/annotation), mp4box, Vitest, Biome.

## Usage

```sh
npm install
npm run dev        # http://127.0.0.1:5173
```

| Script          | Purpose             |
| --------------- | ------------------- |
| `npm run build` | Typecheck and build |
| `npm test`      | Unit tests (Vitest) |
| `npm run lint`  | Lint with Biome     |

## Layout

- `src/demux/`: MP4 parsing, metadata and timecode extraction
- `src/dji/`: DJI field mappings
- `src/analysis/`: timeline, exposure correction, export
- `src/workers/`: decoding and exposure worker threads
- `src/ui/`: components, chart and store
- `scripts/generate-fixture.py`: generates a small synthetic MP4 fixture into `tests/fixtures`
