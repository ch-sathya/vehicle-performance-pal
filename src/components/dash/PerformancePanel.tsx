import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TelemetrySample, VehicleDef } from "@/lib/telemetry/vehicles";

const CORNERS = ["FL", "FR", "RL", "RR"];

interface ChannelRow {
  t: number;
  speed: number;
  throttle: number;
  brake: number;
  tFL: number;
  tFR: number;
  tRL: number;
  tRR: number;
  bFL: number;
  bRR: number;
  fuel: number;
  ers: number;
}

export function PerformancePanel({
  vehicle,
  sample,
}: {
  vehicle: VehicleDef;
  sample: TelemetrySample | null;
}) {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const lastT = useRef(-1);

  useEffect(() => {
    if (!sample) return;
    if (sample.t - lastT.current < 0.2) return;
    lastT.current = sample.t;
    setRows((prev) => {
      const next = [
        ...prev,
        {
          t: Math.round(sample.t * 10) / 10,
          speed: sample.speed * 3.6,
          throttle: sample.throttle * 100,
          brake: sample.brake * 100,
          tFL: sample.tyreTemp[0] ?? 0,
          tFR: sample.tyreTemp[1] ?? 0,
          tRL: sample.tyreTemp[2] ?? 0,
          tRR: sample.tyreTemp[3] ?? 0,
          bFL: sample.brakeTemp[0] ?? 0,
          bRR: sample.brakeTemp[3] ?? 0,
          fuel: sample.fuel,
          ers: sample.ersCharge * 100,
        },
      ];
      return next.length > 220 ? next.slice(next.length - 220) : next;
    });
  }, [sample]);

  const p = vehicle.physics;
  const speed = (sample?.speed ?? 0) * 3.6;
  const rpm = sample?.rpm ?? 0;

  return (
    <div className="flex h-full flex-col gap-px overflow-y-auto bg-border">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Gauge label="Speed" value={speed.toFixed(0)} unit="km/h" pct={speed / 360} />
        <Gauge label="RPM" value={rpm.toFixed(0)} unit="rpm" pct={rpm / p.rpmMax} danger={rpm > p.rpmMax * 0.93} />
        <Gauge label="Gear" value={String(sample?.gear ?? 1)} unit={`/ ${p.gears}`} pct={(sample?.gear ?? 1) / p.gears} />
        <Gauge
          label="DRS"
          value={sample?.drs ? "OPEN" : "CLOSED"}
          unit=""
          pct={sample?.drs ? 1 : 0}
          accent={sample?.drs ?? false}
        />
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Bar label="Throttle" pct={sample?.throttle ?? 0} tone="primary" />
        <Bar label="Brake" pct={sample?.brake ?? 0} tone="destructive" />
        <Gauge label="Lat G" value={(sample?.latG ?? 0).toFixed(2)} unit="g" pct={(sample?.latG ?? 0) / 5} />
        <Gauge label="Long G" value={(sample?.longG ?? 0).toFixed(2)} unit="g" pct={Math.abs(sample?.longG ?? 0) / 5} />
      </div>

      <div className="grid gap-px bg-border lg:grid-cols-2">
        <Chart title="Speed / throttle / brake">
          <AreaChart data={rows}>
            <CartesianGrid stroke="#1e242a" vertical={false} />
            <XAxis dataKey="t" {...axis} />
            <YAxis {...axis} width={34} />
            <Tooltip {...tip} />
            <Area type="monotone" dataKey="speed" stroke="#ffb020" fill="#ffb02033" strokeWidth={1.6} dot={false} />
            <Area type="monotone" dataKey="throttle" stroke="#4fc3f7" fill="#4fc3f722" strokeWidth={1} dot={false} />
            <Area type="monotone" dataKey="brake" stroke="#f2545b" fill="#f2545b22" strokeWidth={1} dot={false} />
          </AreaChart>
        </Chart>

        <Chart title="Tyre surface temps (°C)">
          <LineChart data={rows}>
            <CartesianGrid stroke="#1e242a" vertical={false} />
            <XAxis dataKey="t" {...axis} />
            <YAxis {...axis} width={34} domain={["auto", "auto"]} />
            <Tooltip {...tip} />
            {["tFL", "tFR", "tRL", "tRR"].map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                name={CORNERS[i]}
                stroke={["#ffb020", "#ffd98a", "#4fc3f7", "#8ba0ad"][i]}
                strokeWidth={1.4}
                dot={false}
              />
            ))}
          </LineChart>
        </Chart>

        <Chart title="Brake disc temps (°C)">
          <LineChart data={rows}>
            <CartesianGrid stroke="#1e242a" vertical={false} />
            <XAxis dataKey="t" {...axis} />
            <YAxis {...axis} width={34} domain={["auto", "auto"]} />
            <Tooltip {...tip} />
            <Line type="monotone" dataKey="bFL" name="FL" stroke="#f2545b" strokeWidth={1.4} dot={false} />
            <Line type="monotone" dataKey="bRR" name="RR" stroke="#ffb020" strokeWidth={1.4} dot={false} />
          </LineChart>
        </Chart>

        <Chart title="Fuel (kg) & ERS charge (%)">
          <LineChart data={rows}>
            <CartesianGrid stroke="#1e242a" vertical={false} />
            <XAxis dataKey="t" {...axis} />
            <YAxis {...axis} width={34} />
            <Tooltip {...tip} />
            <Line type="monotone" dataKey="fuel" stroke="#ffb020" strokeWidth={1.6} dot={false} />
            <Line type="monotone" dataKey="ers" stroke="#4fc3f7" strokeWidth={1.4} dot={false} />
          </LineChart>
        </Chart>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {CORNERS.map((c, i) => (
          <div key={c} className="bg-background px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Tyre wear {c}
            </div>
            <div className="font-mono text-[15px] tabular-nums text-foreground">
              {((sample?.tyreWear[i] ?? 0) * 100).toFixed(1)}%
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, (sample?.tyreWear[i] ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const axis = {
  stroke: "#5b6b78",
  tick: { fontSize: 9, fill: "#7f8fa0" },
  tickLine: false,
} as const;

const tip = {
  contentStyle: {
    background: "#0e1114",
    border: "1px solid #232a31",
    borderRadius: 2,
    fontSize: 11,
    fontFamily: "var(--font-mono, monospace)",
  },
  labelStyle: { color: "#7f8fa0" },
} as const;

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="bg-background px-2 py-2">
      <div className="px-1 pb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Gauge({
  label,
  value,
  unit,
  pct,
  danger,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  pct: number;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bg-background px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-mono text-[22px] leading-tight tabular-nums ${danger ? "text-destructive" : accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
        <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full ${danger ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Bar({ label, pct, tone }: { label: string; pct: number; tone: "primary" | "destructive" }) {
  return (
    <div className="bg-background px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-[22px] leading-tight tabular-nums text-foreground">
        {(pct * 100).toFixed(0)}
        <span className="ml-1 text-[10px] text-muted-foreground">%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={tone === "primary" ? "h-full bg-primary" : "h-full bg-destructive"}
          style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }}
        />
      </div>
    </div>
  );
}
