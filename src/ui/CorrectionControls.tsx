import type { CorrectionOptions } from "../analysis/correction";
import { limitRange } from "./derived";
import { maxSmooth as maxSmoothSignal } from "./store";

const SLIDER_STEPS = 1000;
/** Slider curve exponent: seconds = max * t^SMOOTH_POWER. 1 = linear, 2 = sqrt-like, 3 = more fine room. */
const SMOOTH_POWER = 3;

/** Slider position (0..SLIDER_STEPS) to seconds using a power curve. */
function posToSeconds(pos: number, max: number, power = SMOOTH_POWER): number {
  const t = Math.min(Math.max(pos / SLIDER_STEPS, 0), 1);
  return Math.round(max * t ** power * 100) / 100;
}

function secondsToPos(sec: number, max: number, power = SMOOTH_POWER): number {
  if (sec <= 0 || max <= 0) return 0;
  return Math.round((Math.min(sec, max) / max) ** (1 / power) * SLIDER_STEPS);
}

export function CorrectionControls({
  options,
  onChange,
  frameOffset,
  onOffset,
}: {
  options: CorrectionOptions;
  onChange: (options: CorrectionOptions) => void;
  frameOffset: number;
  onOffset: (n: number) => void;
}) {
  const maxSmooth = maxSmoothSignal.value;
  const range = limitRange.value;
  const lowLimit = Math.max(range.low, options.lowLimit ?? -3.0);
  const highLimit = Math.min(range.high, options.highLimit ?? 3.0);
  const clampLow = (n: number) => Math.min(0, Math.max(range.low, n));
  const clampHigh = (n: number) => Math.max(0, Math.min(range.high, n));

  return (
    <section className="control-group" aria-label="Exposure correction controls">
      <h3>Correction settings</h3>

      <div className="control-item">
        <div className="control-header">
          <label htmlFor="smooth-slider">Gaussian smoothing</label>
          <span className="control-val">
            {options.supportSeconds.toFixed(1)} s{options.supportSeconds === 0 ? " (off)" : ""}
          </span>
        </div>
        <div className="slider-row">
          <input
            id="smooth-slider"
            aria-label="Gaussian support width"
            type="range"
            min="0"
            max={SLIDER_STEPS}
            step="1"
            value={secondsToPos(options.supportSeconds, maxSmooth)}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n) && n >= 0)
                onChange({ ...options, supportSeconds: posToSeconds(n, maxSmooth) });
            }}
          />
          <input
            aria-label="Gaussian support width seconds"
            className="num-input"
            type="number"
            min="0"
            step="0.01"
            value={options.supportSeconds}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n) && n >= 0) onChange({ ...options, supportSeconds: n });
            }}
          />
        </div>
      </div>

      <div className="control-item">
        <div className="control-header">
          <label htmlFor="low-limit-slider">Low correction limit</label>
          <span className="control-val">
            {lowLimit.toFixed(1)} EV ({(2 ** lowLimit).toFixed(2)}×)
          </span>
        </div>
        <div className="slider-row">
          <input
            id="low-limit-slider"
            aria-label="Low correction limit"
            type="range"
            min={range.low}
            max="0.0"
            step="0.05"
            value={lowLimit}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n)) onChange({ ...options, lowLimit: clampLow(n) });
            }}
          />
          <input
            aria-label="Low correction limit EV"
            className="num-input"
            type="number"
            min={range.low}
            max="0"
            step="0.05"
            value={lowLimit}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n)) onChange({ ...options, lowLimit: clampLow(n) });
            }}
          />
        </div>
      </div>

      <div className="control-item">
        <div className="control-header">
          <label htmlFor="high-limit-slider">High correction limit</label>
          <span className="control-val">
            +{highLimit.toFixed(1)} EV ({(2 ** highLimit).toFixed(2)}×)
          </span>
        </div>
        <div className="slider-row">
          <input
            id="high-limit-slider"
            aria-label="High correction limit"
            type="range"
            min="0.0"
            max={range.high}
            step="0.05"
            value={highLimit}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n)) onChange({ ...options, highLimit: clampHigh(n) });
            }}
          />
          <input
            aria-label="High correction limit EV"
            className="num-input"
            type="number"
            min="0"
            max={range.high}
            step="0.05"
            value={highLimit}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n)) onChange({ ...options, highLimit: clampHigh(n) });
            }}
          />
        </div>
      </div>

      <div className="control-item">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={options.ignoreIso}
            onChange={(e) => onChange({ ...options, ignoreIso: e.currentTarget.checked })}
          />
          Shutter-only correction (ignore ISO)
        </label>
      </div>

      <div className="control-item">
        <label htmlFor="ref-select">Reference</label>
        <select
          id="ref-select"
          value={options.reference}
          onChange={(e) =>
            onChange({
              ...options,
              reference: e.currentTarget.value as CorrectionOptions["reference"],
            })
          }
        >
          <option value="median">Median exposure</option>
          <option value="first">First exposure</option>
        </select>
      </div>

      <div className="control-item">
        <label htmlFor="frame-offset">Frame offset</label>
        <input
          id="frame-offset"
          className="num-input full-width"
          type="number"
          step="1"
          value={frameOffset}
          onChange={(e) => {
            const n = Number(e.currentTarget.value);
            if (Number.isSafeInteger(n)) onOffset(n);
          }}
        />
      </div>
    </section>
  );
}
