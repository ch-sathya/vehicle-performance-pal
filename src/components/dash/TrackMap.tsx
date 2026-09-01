import { useMemo } from "react";

import type { TrackGeometry } from "@/lib/telemetry/track";
import type { TelemetrySample } from "@/lib/telemetry/vehicles";

const SECTOR_COLORS = ["#ffb020", "#4fc3f7", "#f2545b"];

export function TrackMap({
  geom,
  sample,
  speedProfile,
}: {
  geom: TrackGeometry;
  sample: TelemetrySample | null;
  speedProfile: Float64Array;
}) {
  const pad = 60;
  const { minX, maxX, minY, maxY } = geom.bounds;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;

  const segments = useMemo(() => {
    const n = geom.x.length;
    const [s1, s2] = geom.def.sectorSplits;
    const out: { d: string; color: string }[] = [];
    let current: string[] = [];
    let sector = 0;
    for (let i = 0; i < n; i++) {
      const frac = i / n;
      const sec = frac < s1 ? 0 : frac < s2 ? 1 : 2;
      const pt = `${geom.x[i]!.toFixed(1)},${geom.y[i]!.toFixed(1)}`;
      if (sec !== sector && current.length) {
        current.push(pt);
        out.push({ d: `M ${current.join(" L ")}`, color: SECTOR_COLORS[sector]! });
        current = [pt];
        sector = sec;
      } else {
        current.push(pt);
      }
    }
    current.push(`${geom.x[0]!.toFixed(1)},${geom.y[0]!.toFixed(1)}`);
    out.push({ d: `M ${current.join(" L ")}`, color: SECTOR_COLORS[sector]! });
    return out;
  }, [geom]);

  const speedDots = useMemo(() => {
    const n = geom.x.length;
    let max = 1;
    for (let i = 0; i < n; i++) max = Math.max(max, speedProfile[i] ?? 0);
    const out: { x: number; y: number; f: number }[] = [];
    for (let i = 0; i < n; i += 3) {
      out.push({ x: geom.x[i]!, y: geom.y[i]!, f: (speedProfile[i] ?? 0) / max });
    }
    return out;
  }, [geom, speedProfile]);

  const frac = sample?.lapFraction ?? 0;
  const idx = Math.min(geom.x.length - 1, Math.floor(frac * geom.x.length));
  const carX = geom.x[idx] ?? 0;
  const carY = geom.y[idx] ?? 0;

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${w} ${h}`}
      className="h-full w-full"
      style={{ transform: "scaleY(-1)" }}
    >
      <path
        d={`${segments.map((s) => s.d).join(" ")}`}
        fill="none"
        stroke="#15191d"
        strokeWidth={44}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {speedDots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={7}
          fill={`hsl(${20 + d.f * 140} 90% ${35 + d.f * 22}%)`}
          opacity={0.85}
        />
      ))}
      {segments.map((s, i) => (
        <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={5} opacity={0.85} strokeLinecap="round" />
      ))}
      <circle cx={geom.x[0]} cy={geom.y[0]} r={16} fill="none" stroke="#ffffff" strokeWidth={5} />
      <g>
        <circle cx={carX} cy={carY} r={30} fill="#ffb020" opacity={0.18} />
        <circle cx={carX} cy={carY} r={14} fill="#ffb020" stroke="#0b0d0f" strokeWidth={4} />
      </g>
    </svg>
  );
}
