import {
  Chart as ChartJS,
  type ChartOptions,
  Decimation,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import zoomPlugin from "chartjs-plugin-zoom";
import { Line } from "react-chartjs-2";
import { nearest } from "../analysis/timeline";
import * as d from "./derived";
import { formatShutter } from "./format";
import * as store from "./store";

ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Decimation,
  annotationPlugin,
  zoomPlugin,
);

export function Chart() {
  const samples = store.samples.value,
    selected = store.selected.value,
    times = d.times.value,
    first = d.first.value,
    last = d.last.value,
    start = d.start.value,
    end = d.end.value,
    current = d.current.value,
    selectedTime = d.selectedTime.value,
    currentFrame = d.currentFrame.value,
    showGain = d.showGain.value,
    series = d.series.value;
  const onSelect = store.select;
  const setRange = (r: [number, number] | undefined) => {
    d.range.value = r;
  };
  const setShowGain = (v: boolean) => {
    d.showGain.value = v;
  };

  function zoom(factor: number) {
    const center =
      selectedTime !== undefined && selectedTime >= start && selectedTime <= end
        ? selectedTime
        : (start + end) / 2;
    const span = Math.min(last - first, Math.max(0.001, (end - start) * factor));
    const left = Math.max(first, Math.min(last - span, center - span / 2));
    setRange([left, left + span]);
  }
  const syncRange = ({ chart }: { chart: ChartJS }) =>
    setRange([chart.scales.x.min, chart.scales.x.max]);

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { top: 2, bottom: 2 } },
    parsing: false,
    interaction: { mode: "nearest", axis: "x", intersect: false },
    scales: {
      x: {
        type: "linear",
        min: start,
        max: end > start ? end : start + 0.001,
        title: { display: true, text: "Time (s)" },
        ticks: { maxRotation: 0, maxTicksLimit: 8 },
      },
      y: {
        type: "linear",
        ticks: { maxTicksLimit: 4 },
      },
    },
    plugins: {
      decimation: { enabled: true, algorithm: "min-max" },
      zoom: {
        limits: {
          x: {
            min: first,
            max: last,
            minRange: Math.min(0.001, last - first),
          },
        },
        zoom: {
          mode: "x",
          wheel: { enabled: true, modifierKey: "ctrl" },
          drag: {
            enabled: true,
            backgroundColor: "rgba(82, 125, 180, 0.2)",
            borderColor: "#527db4",
            borderWidth: 1,
            threshold: 5,
          },
          pinch: { enabled: true },
          onZoomComplete: syncRange,
        },
        pan: {
          enabled: true,
          mode: "x",
          modifierKey: "alt",
          onPanComplete: syncRange,
        },
      },
    },
    onClick: (event, _elements, chart) => {
      if (event.x === null || event.x < chart.chartArea.left || event.x > chart.chartArea.right)
        return;
      const time = chart.scales.x.getValueForPixel(event.x);
      if (time !== undefined) onSelect(nearest(times, time));
    },
  };

  return (
    <section className="plot-section" aria-label="Exposure timeline">
      <div className="plot-controls">
        <div className="selection-info">
          <span className="sel-item">
            <strong>Time:</strong> {current ? `${current.timestamp.toFixed(6)} s` : "—"}
          </span>
          <span className="sel-item">
            <strong>Frame:</strong> {currentFrame !== undefined ? currentFrame : "—"}
            {current?.frame !== undefined &&
            current?.videoFrame !== undefined &&
            current.frame !== current.videoFrame
              ? ` (vid ${current.videoFrame})`
              : ""}
          </span>
          <span className="sel-item">
            <strong>Timecode:</strong> {current?.timecode ?? "—"}
          </span>
          <div className="sel-nav-buttons">
            <button
              type="button"
              aria-label="Previous frame"
              disabled={selected <= 0}
              onClick={() => onSelect(selected - 1)}
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="Next frame"
              disabled={selected >= samples.length - 1}
              onClick={() => onSelect(selected + 1)}
            >
              ▶
            </button>
          </div>
        </div>

        <div className="zoom-controls">
          <button type="button" onClick={() => zoom(0.5)} disabled={last <= first}>
            Zoom in
          </button>
          <button type="button" onClick={() => zoom(2)} disabled={last <= first}>
            Zoom out
          </button>
          <label>
            From{" "}
            <input
              aria-label="Chart start seconds"
              className="seconds"
              type="number"
              step="0.1"
              min={first}
              max={end}
              value={start}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (n >= first && n < end) setRange([n, end]);
              }}
            />
          </label>
          <label>
            to{" "}
            <input
              aria-label="Chart end seconds"
              className="seconds"
              type="number"
              step="0.1"
              min={start}
              max={last}
              value={end}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (n > start && n <= last) setRange([start, n]);
              }}
            />{" "}
            s
          </label>
          <button type="button" onClick={() => setRange(undefined)}>
            Reset view
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showGain}
              onChange={(e) => setShowGain(e.currentTarget.checked)}
            />{" "}
            Correction gain
          </label>
        </div>
      </div>

      <div
        className="chart"
        role="slider"
        tabIndex={0}
        aria-label="Select metadata sample by time"
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={selectedTime ?? first}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            onSelect(
              Math.max(
                0,
                Math.min(samples.length - 1, selected + (e.key === "ArrowLeft" ? -1 : 1)),
              ),
            );
          }
        }}
      >
        {series.map((seriesItem) => (
          <div className="chart-series" key={seriesItem.label}>
            <Line
              data={seriesItem.data}
              options={{
                ...options,
                plugins: {
                  ...options.plugins,
                  annotation: {
                    clip: false,
                    annotations: seriesItem.annotations,
                  },
                  tooltip: {
                    callbacks: {
                      title: (items) => {
                        // dataIndex refers to the decimated dataset, so look up by time instead.
                        const x = items[0]?.parsed.x;
                        const s = x === undefined ? undefined : samples[nearest(times, x)];
                        if (!s) return `${items[0]?.parsed.x?.toFixed(6)} s`;
                        const parts = [`${s.timestamp.toFixed(6)} s`];
                        if (s.frame !== undefined) parts.push(`Frame ${s.frame}`);
                        else if (s.videoFrame !== undefined) parts.push(`Frame ${s.videoFrame}`);
                        if (s.timecode) parts.push(s.timecode);
                        return parts.join(" · ");
                      },
                      label: (item) => {
                        if (seriesItem.shutter)
                          return `${item.dataset.label}: ${formatShutter(item.parsed.y)}`;
                        if (seriesItem.label.startsWith("Exposure index")) {
                          const val = item.parsed.y;
                          if (typeof val === "number") {
                            return `${item.dataset.label}: ${val >= 0 ? "+" : ""}${val.toFixed(2)} EV`;
                          }
                        }
                        return `${item.dataset.label}: ${item.formattedValue}`;
                      },
                    },
                  },
                },
                scales: {
                  ...options.scales,
                  y: {
                    ...options.scales?.y,
                    afterFit: (scale: { width: number }) => {
                      scale.width = 80;
                    },
                    grace: 0,
                    offset: false,
                    min: seriesItem.yMin,
                    max: seriesItem.yMax,
                    ticks: {
                      maxTicksLimit: 4,
                      ...(seriesItem.shutter
                        ? {
                            callback: (value: string | number) => formatShutter(Number(value)),
                          }
                        : {}),
                    },
                    title: {
                      display: true,
                      text: seriesItem.label,
                      color: seriesItem.color,
                    },
                  },
                },
              }}
              aria-label={`${seriesItem.label} over time`}
            />
          </div>
        ))}
      </div>
      <p className="muted chart-hint">
        Drag on plot to zoom into a range. Click to select sample; arrow keys step one sample.
        Alt-drag to pan; Ctrl-wheel to zoom. Exposure index = log₂(ISO × shutter) or log₂(shutter).
      </p>
    </section>
  );
}
