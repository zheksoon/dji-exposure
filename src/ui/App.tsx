import { useEffect } from "preact/hooks";
import { Chart } from "./Chart";
import { CorrectionControls } from "./CorrectionControls";
import * as store from "./store";
import { load, requestSpline } from "./store";

export function App() {
  useEffect(() => store.terminate, []);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files[0]) load(e.dataTransfer.files[0]);
    };
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const file = store.file.value,
    summary = store.summary.value,
    samples = store.samples.value,
    busy = store.busy.value,
    progress = store.progress.value,
    analysisError = store.analysisError.value,
    calculating = store.calculating.value,
    exporting = store.exporting.value,
    error = store.error.value,
    correctionOptions = store.correctionOptions.value,
    frameOffset = store.frameOffset.value;

  return (
    <div className="app-container">
      <header>
        <h1>DJI exposure</h1>
        <label className="button choose-btn">
          {file ? "Open another video" : "Choose video"}
          <input
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            onChange={(e) => {
              if (e.currentTarget.files?.[0]) load(e.currentTarget.files[0]);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </header>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!file ? (
        <div className="drop">
          <h2>Drop an MP4 or MOV file here</h2>
          <p>Read frame-level exposure metadata directly from your recording.</p>
          <p className="muted">Entirely local. No uploads, video decoding or backend.</p>
        </div>
      ) : (
        <div className="two-column">
          <aside className="sidebar" aria-label="Controls sidebar">
            <div className="sidebar-section">
              <div className="fileline">
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 ** 3).toFixed(3)} GiB</span>
                {summary && (
                  <>
                    <span>{summary.duration.toFixed(3)} s</span>
                    <span>
                      {summary.width ? `${summary.width} × ${summary.height}` : "No video"}
                    </span>
                    <span>{summary.fps?.toFixed(3) ?? "—"} FPS</span>
                    <span>
                      {(
                        summary.tracks.find((t) => t.type === "video")?.samples ?? samples.length
                      ).toLocaleString()}{" "}
                      frames
                    </span>
                    <span className="muted">
                      {samples.length.toLocaleString()} extracted records
                    </span>
                  </>
                )}
              </div>
              {summary && (
                <p className="camera-info">
                  <strong>{summary.camera ?? "Inspecting…"}</strong>
                </p>
              )}
            </div>

            {busy && (
              <div className="sidebar-section busy-panel">
                <progress value={progress.done} max={progress.total || 1} />
                <span className="muted">
                  {"stage" in progress ? `${String(progress.stage)} · ` : ""}
                  {Math.round((progress.done / (progress.total || 1)) * 100)}% ·{" "}
                  {store.pendingCount.value.toLocaleString()} records
                </span>
                <button type="button" onClick={store.cancel}>
                  Cancel
                </button>
              </div>
            )}

            {summary && (
              <>
                {!!summary.warnings.length && (
                  <details className="warnings">
                    <summary>{summary.warnings.length} processing notices</summary>
                    <ul>
                      {summary.warnings.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </details>
                )}

                <CorrectionControls
                  options={correctionOptions}
                  onChange={(o) => {
                    store.correctionOptions.value = o;
                  }}
                  frameOffset={frameOffset}
                  onOffset={(n) => {
                    store.frameOffset.value = n;
                  }}
                />

                <div className="export-spl-panel">
                  <button
                    type="button"
                    className="spl-export-btn"
                    disabled={!store.canExport.value}
                    onClick={requestSpline}
                  >
                    Export Resolve .spl
                  </button>
                  {calculating && (
                    <span role="status" className="status-text">
                      Calculating correction…
                    </span>
                  )}
                  {exporting && (
                    <span role="status" className="status-text">
                      Exporting spline…
                    </span>
                  )}
                  {analysisError && (
                    <p role="alert" className="error">
                      {analysisError}
                    </p>
                  )}
                  <p className="muted spl-hint">
                    Exports linear gain = 2^(reference − smoothed exposure) clamped to limits.
                    Import onto Gain in scene-linear light.
                  </p>
                </div>
              </>
            )}
          </aside>

          <main className="main-column" aria-label="Main content">
            {!!samples.length && <Chart />}
          </main>
        </div>
      )}
    </div>
  );
}
