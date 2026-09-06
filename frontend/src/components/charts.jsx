import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Two hand-drawn SVG charts, replacing Recharts.
 *
 * Recharts was the heaviest dependency in the tree and was imported for exactly
 * one area chart and one bar chart, neither of which needed a charting library.
 * These also fix three things the Recharts versions got wrong:
 *   - grid and axis colours were hardcoded per-theme (stroke="#374151"), so they
 *     were wrong in one mode or the other. These read CSS custom properties.
 *   - inspection was hover-only, which does not exist on touch — the app's
 *     primary target. These respond to tap as well as hover.
 *   - the day-of-week section promises "your strongest and weakest days" but
 *     drew every bar identically. Best and worst are now marked.
 *
 * Both charts are single-series, so there is no legend: the section heading names
 * the measure. Values and labels use text tokens, never the series colour.
 */

/** Track a container's pixel width so the SVG is drawn 1:1 and strokes aren't scaled. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function Tooltip({ x, y, label, value, width }) {
  // Keep the bubble inside the plot rather than letting it overflow the card,
  // horizontally AND vertically: near the top of the plot it flips below the
  // point instead of translating up out of the card and over the heading.
  const clamped = Math.min(Math.max(x, 46), Math.max(width - 46, 46));
  const flip = y < 44;
  return (
    <div
      className={`pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 shadow-lg ${ flip ?"translate-y-2" : "-translate-y-full"
      }`}
      style={{ left: clamped, top: flip ? y : Math.max(y - 8, 0) }}
    >
      <p className="whitespace-nowrap font-manrope text-[10px] leading-none text-ink-subtle">{label}</p>
      <p className="mt-0.5 whitespace-nowrap font-chivo text-sm font-bold leading-none text-ink">{value}</p>
    </div>
  );
}

/** Horizontal gridlines + y labels at 0 / 50 / 100. Shared by both charts. */
function Grid({ ticks, scaleY, left, right }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={left} x2={right} y1={scaleY(t)} y2={scaleY(t)}
            stroke="var(--chart-grid)" strokeWidth={1}
            strokeDasharray={t === 0 ? undefined : "3 3"}
          />
          <text
            x={left - 6} y={scaleY(t)} dy="0.32em" textAnchor="end"
            className="font-manrope" fontSize={10} fill="var(--chart-axis)"
          >
            {t}
          </text>
        </g>
      ))}
    </g>
  );
}

// ── Area chart: daily completion % over time ─────────────────────────────────
export function ScoreAreaChart({ data, height = 160 }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);

  const M = { top: 10, right: 8, bottom: 20, left: 30 };
  const innerW = Math.max(width - M.left - M.right, 0);
  const innerH = height - M.top - M.bottom;

  const scaleX = useCallback(
    (i) => (data.length <= 1 ? M.left + innerW / 2 : M.left + (i / (data.length - 1)) * innerW),
    [data.length, innerW, M.left]
  );
  const scaleY = (v) => M.top + innerH - (Math.min(Math.max(v, 0), 100) / 100) * innerH;

  const onPointer = (e) => {
    if (!innerW || !data.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - M.left;
    const i = Math.round((rel / innerW) * (data.length - 1));
    setActive(Math.min(Math.max(i, 0), data.length - 1));
  };

  if (!data.length) return null;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(d.pct)}`).join(" ");
  const area = `${line} L${scaleX(data.length - 1)},${scaleY(0)} L${scaleX(0)},${scaleY(0)} Z`;
  const point = active != null ? data[active] : null;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width} height={height} role="img"
          aria-label={`Daily completion percentage over the last ${data.length} days`}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setActive(null)}
          style={{ touchAction: "pan-y" }}
        >
          <Grid ticks={[0, 50, 100]} scaleY={scaleY} left={M.left} right={width - M.right} />

          <path d={area} fill="var(--chart-accent-fill)" />
          <path
            d={line} fill="none" stroke="var(--chart-accent)"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          />

          {/* First and last x labels only — a label per point is unreadable at this width. */}
          <text x={scaleX(0)} y={height - 4} textAnchor="start" className="font-manrope" fontSize={10} fill="var(--chart-axis)">
            {data[0].date.slice(5)}
          </text>
          <text x={scaleX(data.length - 1)} y={height - 4} textAnchor="end" className="font-manrope" fontSize={10} fill="var(--chart-axis)">
            {data[data.length - 1].date.slice(5)}
          </text>

          {point && (
            <g>
              <line
                x1={scaleX(active)} x2={scaleX(active)} y1={M.top} y2={M.top + innerH}
                stroke="var(--chart-axis)" strokeWidth={1} strokeDasharray="3 3"
              />
              {/* 2px surface ring so the marker reads against the fill beneath it. */}
              <circle cx={scaleX(active)} cy={scaleY(point.pct)} r={5}
                      fill="var(--chart-accent)" stroke="var(--chart-surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {point && (
        <Tooltip x={scaleX(active)} y={scaleY(point.pct)} width={width}
                 label={point.date} value={`${Math.round(point.pct)}%`} />
      )}
    </div>
  );
}

// ── Bar chart: completion % by day of week ───────────────────────────────────
export function DayOfWeekChart({ data, height = 160 }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);

  const M = { top: 10, right: 8, bottom: 22, left: 30 };
  const innerW = Math.max(width - M.left - M.right, 0);
  const innerH = height - M.top - M.bottom;

  if (!data.length) return null;

  const scaleY = (v) => M.top + innerH - (Math.min(Math.max(v, 0), 100) / 100) * innerH;
  const slot = innerW / data.length;
  const GAP = 2;                                   // 2px surface gap between bars
  const barW = Math.max(slot - GAP * 2, 2);

  const values = data.map((d) => d.pct);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // Only call out a best/worst when they actually differ — the section header
  // promises "your strongest and weakest days", so encode that, don't just claim it.
  const meaningful = max > min;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width} height={height} role="img"
          aria-label={
            meaningful
              ? `Completion percentage by day of week. Strongest ${data.find((d) => d.pct === max).day} at ${Math.round(max)} percent, weakest ${data.find((d) => d.pct === min).day} at ${Math.round(min)} percent.`
              : "Completion percentage by day of week"
          }
        >
          <Grid ticks={[0, 50, 100]} scaleY={scaleY} left={M.left} right={width - M.right} />

          {data.map((d, i) => {
            const x = M.left + i * slot + GAP;
            const y = scaleY(d.pct);
            const h = M.top + innerH - y;
            const r = Math.min(4, barW / 2, h);     // rounded data-end, anchored to baseline
            const isBest = meaningful && d.pct === max;
            const isWorst = meaningful && d.pct === min && d.pct > 0;
            // Encode the claim the heading makes. Best is the full accent, the
            // weakest non-zero day is neutral grey, and the rest sit back at half
            // strength — one hue, varying emphasis, so this stays a sequential
            // encoding rather than turning seven days into seven categories.
            const fill = isWorst ? "var(--chart-muted)" : "var(--chart-accent)";
            const fillOpacity = active === i || isBest || isWorst || !meaningful ? 1 : 0.5;
            return (
              <g key={d.day}
                 onPointerMove={() => setActive(i)}
                 onPointerDown={() => setActive(i)}
                 onPointerLeave={() => setActive(null)}
                 style={{ cursor: "pointer" }}>
                {/* Full-height hit target — bigger than the mark, per touch guidance. */}
                <rect x={M.left + i * slot} y={M.top} width={slot} height={innerH} fill="transparent" />
                <path
                  d={h <= 0
                    ? `M${x},${M.top + innerH} h${barW}`
                    : `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`}
                  fill={fill}
                  fillOpacity={fillOpacity}
                />
                <text
                  x={x + barW / 2} y={height - 6} textAnchor="middle"
                  className="font-manrope" fontSize={10}
                  fill="var(--chart-axis)"
                  fontWeight={isBest ? 700 : 400}
                >
                  {d.day}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {active != null && (
        <Tooltip
          x={M.left + active * slot + slot / 2}
          y={scaleY(data[active].pct)}
          width={width}
          label={data[active].day}
          value={`${Math.round(data[active].pct)}%`}
        />
      )}
    </div>
  );
}
