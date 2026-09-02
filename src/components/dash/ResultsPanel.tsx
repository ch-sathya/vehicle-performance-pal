import { useMemo } from "react";

import type { LapRecord } from "@/lib/telemetry/simulator";
import { formatLap } from "@/hooks/useSimulation";

export function ResultsPanel({
  laps,
  idealLap,
  onClear,
}: {
  laps: LapRecord[];
  idealLap: number;
  onClear: () => void;
}) {
  const stats = useMemo(() => {
    if (!laps.length) return null;
    const best = laps.reduce((a, b) => (b.time < a.time ? b : a));
    const s1 = Math.min(...laps.map((l) => l.sectors[0]));
    const s2 = Math.min(...laps.map((l) => l.sectors[1]));
    const s3 = Math.min(...laps.map((l) => l.sectors[2]));
    const groups = new Map<string, { key: string; n: number; best: number; avg: number }>();
    for (const l of laps) {
      const key = l.setupSummary || "baseline";
      const g = groups.get(key) ?? { key, n: 0, best: Infinity, avg: 0 };
      g.n += 1;
      g.best = Math.min(g.best, l.time);
      g.avg += l.time;
      groups.set(key, g);
    }
    return {
      best,
      theoretical: s1 + s2 + s3,
      sectorBests: [s1, s2, s3] as [number, number, number],
      groups: [...groups.values()].map((g) => ({ ...g, avg: g.avg / g.n })).sort((a, b) => a.best - b.best),
    };
  }, [laps]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Session results
        </h2>
        <button
          onClick={onClear}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
        >
          clear laps
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Stat label="Laps" value={String(laps.length)} />
        <Stat label="Best lap" value={stats ? formatLap(stats.best.time) : "--:--.---"} />
        <Stat label="Theoretical best" value={stats ? formatLap(stats.theoretical) : "--:--.---"} />
        <Stat label="Sim ideal" value={formatLap(idealLap)} />
      </dl>

      {!laps.length ? (
        <p className="p-3 text-[11px] text-muted-foreground">
          No completed laps yet. Let the car run a full lap and results appear here.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Th>Lap</Th>
                  <Th>Time</Th>
                  <Th>Δ best</Th>
                  <Th>S1</Th>
                  <Th>S2</Th>
                  <Th>S3</Th>
                  <Th>Top</Th>
                  <Th>Fuel</Th>
                  <Th>Wear</Th>
                  <Th>Setup</Th>
                </tr>
              </thead>
              <tbody>
                {laps.map((l) => {
                  const isBest = stats && l.id === stats.best.id;
                  const delta = stats ? l.time - stats.best.time : 0;
                  return (
                    <tr key={l.id} className="border-b border-border/50">
                      <Td>{l.index}</Td>
                      <Td className={isBest ? "text-primary" : "text-foreground"}>{formatLap(l.time)}</Td>
                      <Td className={delta > 0 ? "text-destructive" : "text-primary"}>
                        {delta > 0 ? `+${delta.toFixed(3)}` : "—"}
                      </Td>
                      {l.sectors.map((s, i) => (
                        <Td
                          key={i}
                          className={stats && Math.abs(s - stats.sectorBests[i]!) < 1e-6 ? "text-primary" : ""}
                        >
                          {s.toFixed(3)}
                        </Td>
                      ))}
                      <Td>{Math.round(l.topSpeed * 3.6)}</Td>
                      <Td>{l.fuelUsed.toFixed(2)}</Td>
                      <Td>{l.avgTyreWear.toFixed(2)}%</Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{l.setupSummary || "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3 className="mt-4 border-y border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Setup comparison
          </h3>
          <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                <Th>Setup</Th>
                <Th>Laps</Th>
                <Th>Best</Th>
                <Th>Average</Th>
              </tr>
            </thead>
            <tbody>
              {stats?.groups.map((g) => (
                <tr key={g.key} className="border-b border-border/50">
                  <Td className="text-muted-foreground">{g.key}</Td>
                  <Td>{g.n}</Td>
                  <Td className="text-primary">{formatLap(g.best)}</Td>
                  <Td>{formatLap(g.avg)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-3 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[16px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-1.5 font-normal">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}
