import { Slider } from "@/components/ui/slider";
import type { VehicleDef } from "@/lib/telemetry/vehicles";
import type { DerivedSetup } from "@/lib/telemetry/simulator";

export function SetupPanel({
  vehicle,
  setup,
  onChange,
  onReset,
  derived,
  idealLap,
  topSpeed,
  highlight,
}: {
  vehicle: VehicleDef;
  setup: Record<string, number>;
  onChange: (id: string, value: number) => void;
  onReset: () => void;
  derived: DerivedSetup;
  idealLap: number;
  topSpeed: number;
  highlight?: string[];
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Setup sheet
        </h2>
        <button
          onClick={onReset}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
        >
          reset
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-px border-b border-border bg-border">
        <Stat label="Ideal lap" value={fmtLap(idealLap)} />
        <Stat label="Top speed" value={`${Math.round(topSpeed * 3.6)} km/h`} />
        <Stat label="Mass" value={`${Math.round(derived.mass)} kg`} />
      </dl>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {vehicle.setup.map((p) => {
          const value = setup[p.id] ?? p.default;
          const on = highlight?.includes(p.id);
          return (
            <div
              key={p.id}
              className={`border-b border-border/60 py-2.5 ${on ? "-mx-1 rounded-sm bg-primary/10 px-1" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-foreground">{p.name}</span>
                <span className="font-mono text-[12px] tabular-nums text-primary">
                  {value}
                  <span className="ml-0.5 text-[10px] text-muted-foreground">{p.unit}</span>
                </span>
              </div>
              <Slider
                className="mt-2"
                min={p.min}
                max={p.max}
                step={p.step}
                value={[value]}
                onValueChange={(v) => onChange(p.id, v[0] ?? p.default)}
              />
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{p.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-3 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-[15px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function fmtLap(t: number) {
  if (!Number.isFinite(t)) return "--:--.---";
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`;
}
