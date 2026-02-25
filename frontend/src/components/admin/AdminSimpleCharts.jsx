import React, { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 260;
const CHART_PADDING = { top: 16, right: 20, bottom: 34, left: 46 };

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compactNumber = (value) => toNumber(value).toLocaleString("en-IN");

const buildLineGeometry = (data, yKey) => {
  if (!data.length) return null;
  const values = data.map((row) => toNumber(row[yKey]));
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const range = maxValue - minValue || 1;
  const xSpan = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const ySpan = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const xForIndex = (index) => {
    if (data.length <= 1) return CHART_PADDING.left;
    return CHART_PADDING.left + (index / (data.length - 1)) * xSpan;
  };
  const yForValue = (value) =>
    CHART_PADDING.top + ((maxValue - value) / range) * ySpan;

  const points = values.map((value, index) => ({
    x: xForIndex(index),
    y: yForValue(value),
    value,
  }));
  if (!points.length) return null;

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const baselineY = yForValue(minValue);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
  return {
    points,
    maxValue,
    minValue,
    baselineY,
    linePath,
    areaPath,
  };
};

const bottomTicks = (data, xKey) => {
  if (data.length <= 6) {
    return data.map((row, index) => ({ index, label: row[xKey] }));
  }
  const selectedIndexes = new Set([0, data.length - 1]);
  const step = Math.ceil(data.length / 5);
  for (let index = step; index < data.length - 1; index += step) {
    selectedIndexes.add(index);
  }
  return [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => ({ index, label: data[index]?.[xKey] || "" }));
};

export const SimpleLineChart = ({
  data,
  xKey,
  yKey,
  color = "#2563eb",
  areaColor = "",
  valueFormatter = compactNumber,
}) => {
  const geometry = useMemo(() => buildLineGeometry(data, yKey), [data, yKey]);
  const ticks = useMemo(() => bottomTicks(data, xKey), [data, xKey]);

  if (!geometry) return null;

  const xSpan = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const ySpan = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const xForIndex = (index) => {
    if (data.length <= 1) return CHART_PADDING.left;
    return CHART_PADDING.left + (index / (data.length - 1)) * xSpan;
  };

  return (
    <div className="w-full h-full">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-full">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = CHART_PADDING.top + ratio * ySpan;
          return (
            <line
              key={ratio}
              x1={CHART_PADDING.left}
              y1={y}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          );
        })}

        <line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top}
          x2={CHART_PADDING.left}
          y2={CHART_HEIGHT - CHART_PADDING.bottom}
          stroke="#cbd5e1"
        />
        <line
          x1={CHART_PADDING.left}
          y1={CHART_HEIGHT - CHART_PADDING.bottom}
          x2={CHART_WIDTH - CHART_PADDING.right}
          y2={CHART_HEIGHT - CHART_PADDING.bottom}
          stroke="#cbd5e1"
        />

        {areaColor ? <path d={geometry.areaPath} fill={areaColor} opacity="0.5" /> : null}
        <path d={geometry.linePath} fill="none" stroke={color} strokeWidth="3" />

        {ticks.map((tick) => (
          <text
            key={`tick-${tick.index}`}
            x={xForIndex(tick.index)}
            y={CHART_HEIGHT - 10}
            textAnchor="middle"
            fontSize="10"
            fill="#64748b"
          >
            {String(tick.label || "")}
          </text>
        ))}

        <text
          x={8}
          y={CHART_PADDING.top + 8}
          fontSize="10"
          fill="#64748b"
          textAnchor="start"
        >
          {valueFormatter(geometry.maxValue)}
        </text>
        <text
          x={8}
          y={CHART_HEIGHT - CHART_PADDING.bottom + 4}
          fontSize="10"
          fill="#64748b"
          textAnchor="start"
        >
          {valueFormatter(geometry.minValue)}
        </text>
      </svg>
    </div>
  );
};

export const SimpleBarChart = ({
  data,
  labelKey,
  valueKey,
  valueFormatter = compactNumber,
  color = "#0ea5e9",
  horizontal = false,
  maxItems = 8,
}) => {
  const slicedData = (data || []).slice(0, maxItems);
  const maxValue = Math.max(1, ...slicedData.map((item) => toNumber(item[valueKey])));

  if (!slicedData.length) return null;

  if (horizontal) {
    return (
      <div className="space-y-3">
        {slicedData.map((item, index) => {
          const value = toNumber(item[valueKey]);
          const ratio = Math.max(0, Math.min(100, (value / maxValue) * 100));
          return (
            <div key={`${item[labelKey]}-${index}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{String(item[labelKey] || "--")}</span>
                <span className="text-muted-foreground">{valueFormatter(value)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${ratio}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="h-full flex items-end gap-2">
      {slicedData.map((item, index) => {
        const value = toNumber(item[valueKey]);
        const ratio = Math.max(0, Math.min(100, (value / maxValue) * 100));
        return (
          <div
            key={`${item[labelKey]}-${index}`}
            className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1 h-full"
          >
            <span className="text-[10px] text-muted-foreground">{valueFormatter(value)}</span>
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${Math.max(4, ratio)}%`,
                backgroundColor: color,
              }}
            />
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">
              {String(item[labelKey] || "--")}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const DONUT_SIZE = 220;
const DONUT_CX = DONUT_SIZE / 2;
const DONUT_CY = DONUT_SIZE / 2;
const DONUT_OUTER = 96;
const DONUT_INNER = 62;
const DONUT_HOVER_OUTER = 102;
const GAP_DEG = 1.2;

const describeArc = (cx, cy, radius, startAngle, endAngle) => {
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(toRad(startAngle));
  const y1 = cy + radius * Math.sin(toRad(startAngle));
  const x2 = cx + radius * Math.cos(toRad(endAngle));
  const y2 = cy + radius * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
};

const describeDonutSlice = (cx, cy, outerR, innerR, startDeg, endDeg) => {
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  const outerStart = { x: cx + outerR * Math.cos(toRad(startDeg)), y: cy + outerR * Math.sin(toRad(startDeg)) };
  const outerEnd = { x: cx + outerR * Math.cos(toRad(endDeg)), y: cy + outerR * Math.sin(toRad(endDeg)) };
  const innerStart = { x: cx + innerR * Math.cos(toRad(startDeg)), y: cy + innerR * Math.sin(toRad(startDeg)) };
  const innerEnd = { x: cx + innerR * Math.cos(toRad(endDeg)), y: cy + innerR * Math.sin(toRad(endDeg)) };
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
};

export const SimpleDonutChart = ({
  data,
  labelKey,
  valueKey,
  colors = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b"],
  hideLegend = false,
}) => {
  const [hovered, setHovered] = useState(null);
  const rows = data || [];
  const total = rows.reduce((sum, row) => sum + toNumber(row[valueKey]), 0);

  const slices = useMemo(() => {
    const items = rows.map((row, index) => {
      const value = toNumber(row[valueKey]);
      const percentage = total > 0 ? (value / total) * 100 : 0;
      return {
        label: String(row[labelKey] || "Unknown"),
        value,
        percentage,
        color: colors[index % colors.length],
        index,
      };
    });

    let running = 0;
    return items.map((slice) => {
      const spanDeg = (slice.percentage / 100) * 360;
      const halfGap = items.length > 1 ? GAP_DEG / 2 : 0;
      const startDeg = running + halfGap;
      const endDeg = running + spanDeg - halfGap;
      running += spanDeg;
      return { ...slice, startDeg, endDeg, spanDeg };
    });
  }, [rows, labelKey, valueKey, colors, total]);

  const activeSlice = hovered !== null ? slices[hovered] : null;

  return (
    <div className="flex flex-col items-center gap-3 h-full justify-center">
      <svg
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        className="w-48 h-48 md:w-52 md:h-52"
        onMouseLeave={() => setHovered(null)}
      >
        {slices.map((slice) => {
          if (slice.spanDeg <= 0) return null;
          const isActive = hovered === slice.index;
          const outerR = isActive ? DONUT_HOVER_OUTER : DONUT_OUTER;
          const d =
            slice.spanDeg >= 359.5
              ? [
                describeArc(DONUT_CX, DONUT_CY, outerR, 0, 179.99),
                describeArc(DONUT_CX, DONUT_CY, outerR, 180, 359.99),
                describeArc(DONUT_CX, DONUT_CY, DONUT_INNER, 0, 179.99),
                describeArc(DONUT_CX, DONUT_CY, DONUT_INNER, 180, 359.99),
              ].join(" ") + " Z"
              : describeDonutSlice(
                DONUT_CX,
                DONUT_CY,
                outerR,
                DONUT_INNER,
                slice.startDeg,
                slice.endDeg
              );
          return (
            <path
              key={slice.index}
              d={d}
              fill={slice.color}
              opacity={hovered !== null && !isActive ? 0.4 : 1}
              stroke="white"
              strokeWidth={isActive ? 2 : 0.5}
              className="cursor-pointer"
              style={{
                transition: "opacity 0.2s ease, d 0.2s ease",
                filter: isActive ? "drop-shadow(0 2px 6px rgba(0,0,0,0.18))" : "none",
              }}
              onMouseEnter={() => setHovered(slice.index)}
            />
          );
        })}

        <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_INNER - 1} fill="white" pointerEvents="none" />

        {activeSlice ? (
          <g pointerEvents="none">
            <text
              x={DONUT_CX}
              y={DONUT_CY - 14}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#334155"
            >
              {activeSlice.label.length > 14
                ? activeSlice.label.slice(0, 13) + "…"
                : activeSlice.label}
            </text>
            <text
              x={DONUT_CX}
              y={DONUT_CY + 4}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#0f172a"
            >
              {formatCurrency(activeSlice.value)}
            </text>
            <text
              x={DONUT_CX}
              y={DONUT_CY + 20}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
            >
              {activeSlice.percentage.toFixed(1)}%
            </text>
          </g>
        ) : (
          <g pointerEvents="none">
            <text
              x={DONUT_CX}
              y={DONUT_CY - 6}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
            >
              Total
            </text>
            <text
              x={DONUT_CX}
              y={DONUT_CY + 12}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#0f172a"
            >
              {formatCurrency(total)}
            </text>
          </g>
        )}
      </svg>

      {!hideLegend && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-2">
          {slices.map((slice) => (
            <div
              key={slice.index}
              className="flex items-center gap-1.5 cursor-pointer"
              onMouseEnter={() => setHovered(slice.index)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: slice.color,
                  opacity: hovered !== null && hovered !== slice.index ? 0.4 : 1,
                  transition: "opacity 0.2s ease",
                }}
              />
              <span
                className="text-xs"
                style={{
                  color: hovered === slice.index ? "#0f172a" : "#64748b",
                  fontWeight: hovered === slice.index ? 600 : 400,
                  transition: "color 0.2s ease, font-weight 0.2s ease",
                }}
              >
                {slice.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
