import { Slider } from "@/components/ui/slider";
import {
  formatSensor,
  sensorById,
  setupById,
  type TelemetrySample,
  type VehicleDef,
} from "@/lib/telemetry/vehicles";

export function PartPanel({
  vehicle,
  partId,
  sample,
  setup,
  onChange,
  onClose,
}: {
  vehicle: VehicleDef;
  partId: string | null;
  sample: TelemetrySample | null;
  setup: Record<string, number>;
  onChange: (id: string, value: number) => void;
  onClose: () => void;
}) {
  const part = vehicle.parts.find((p) => p.id === partId);

  if (!part) {
    return (
      <div className="flex h-full flex-col">
        <Header title="Part inspector" />
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Click any marker on the car to read that component's live sensors and adjust it.
          </p>
          <ul className="mt-3 space-y-px">
            {vehicle.parts.map((p) => (
              <li
                key={p.id}
                className="flex items-baseline justify-between border-b border-border/50 py-1.5"
              >
                <span className="text-[11px] text-foreground">{p.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  {p.group}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header title={part.group} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <h3 className="text-[15px] font-medium text-foreground">{part.name}</h3>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{part.description}</p>

        <SectionLabel>Sensors</SectionLabel>
        <div className="space-y-px">
          {part.sensorIds.map((id) => {
            const def = sensorById(vehicle, id);
            if (!def) return null;
            const raw = sample ? def.read(sample) : 0;
            const [lo, hi] = def.range;
            const pct = Math.max(0, Math.min(1, (raw - lo) / (hi - lo || 1)));
            const hot = raw > hi;
            return (
              <div key={id} className="border-b border-border/50 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-foreground">{def.name}</span>
                  <span
                    className={`font-mono text-[12px] tabular-nums ${hot ? "text-destructive" : "text-primary"}`}
                  >
                    {formatSensor(def, raw)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    {def.code}
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full ${hot ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {part.setupIds.length ? (
          <>
            <SectionLabel>Adjustments</SectionLabel>
            {part.setupIds.map((id) => {
              const def = setupById(vehicle, id);
              if (!def) return null;
              const value = setup[id] ?? def.default;
              return (
                <div key={id} className="border-b border-border/50 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-foreground">{def.name}</span>
                    <span className="font-mono text-[12px] tabular-nums text-primary">
                      {value}
                      <span className="ml-0.5 text-[10px] text-muted-foreground">{def.unit}</span>
                    </span>
                  </div>
                  <Slider
                    className="mt-2"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={[value]}
                    onValueChange={(v) => onChange(id, v[0] ?? def.default)}
                  />
                </div>
              );
            })}
          </>
        ) : (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            no adjustable parameters
          </p>
        )}
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </h2>
      {onClose ? (
        <button
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
        >
          close
        </button>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-4 mb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </h4>
  );
}
