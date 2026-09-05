import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { CarViewer } from "@/components/dash/CarViewer";
import { PartPanel } from "@/components/dash/PartPanel";
import { PerformancePanel } from "@/components/dash/PerformancePanel";
import { ResultsPanel } from "@/components/dash/ResultsPanel";
import { SetupPanel } from "@/components/dash/SetupPanel";
import { Track3D } from "@/components/dash/Track3D";
import { TrackMap } from "@/components/dash/TrackMap";
import { formatLap, useSimulation } from "@/hooks/useSimulation";
import { TRACKS } from "@/lib/telemetry/track";
import { VEHICLES } from "@/lib/telemetry/vehicles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TITLE = "Apex Telemetry — 3D Vehicle Performance Assistant";
const DESC =
  "Live 3D vehicle telemetry: inspect every named part and sensor on an F1 car, tune the setup, and compare lap times, sectors, tyre and brake data on a simulated circuit.";

const TABS = [
  { v: "track", label: "Track" },
  { v: "performance", label: "Performance" },
  { v: "results", label: "Results" },
] as const;

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const sim = useSimulation();
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [trackView, setTrackView] = useState<"2d" | "3d">("2d");

  const setParam = useCallback(
    (id: string, value: number) => sim.setSetup((prev) => ({ ...prev, [id]: value })),
    [sim],
  );
  const resetSetup = useCallback(() => {
    const next: Record<string, number> = {};
    for (const p of sim.vehicle.setup) next[p.id] = p.default;
    sim.setSetup(next);
  }, [sim]);

  const activePart = useMemo(
    () => sim.vehicle.parts.find((p) => p.id === selectedPart),
    [sim.vehicle, selectedPart],
  );

  const s = sim.sample;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <div>
          <h1 className="font-mono text-[13px] uppercase tracking-[0.3em] text-primary">
            Apex Telemetry
          </h1>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            vehicle performance assistant
          </p>
        </div>

        <div className="flex items-center gap-1">
          {VEHICLES.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                sim.setVehicleId(v.id);
                setSelectedPart(null);
              }}
              className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                sim.vehicleId === v.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.klass}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              onClick={() => sim.setTrackId(t.id)}
              className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                sim.trackId === t.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:ml-auto">
          <div className="text-right">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              lap {s ? Math.floor(s.t / Math.max(1, sim.profile.lapTime)) + 1 : 1} · running
            </div>
            <div className="font-mono text-[16px] tabular-nums text-primary">
              {formatLap(s?.lapTime ?? 0)}
            </div>
          </div>
          <button
            onClick={() => sim.setPlaying(!sim.playing)}
            className="rounded-sm border border-primary bg-primary/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary"
          >
            {sim.playing ? "pause" : "run"}
          </button>
          <button
            onClick={sim.reset}
            className="rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            restart
          </button>
          <div className="flex items-center gap-1">
            {[0.5, 1, 2, 4].map((r) => (
              <button
                key={r}
                onClick={() => sim.setRate(r)}
                className={`rounded-sm border px-1.5 py-1 font-mono text-[10px] tabular-nums ${
                  sim.rate === r
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="grid flex-1 gap-px bg-border lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-px bg-border lg:min-h-0 lg:overflow-y-auto">
          <section className="relative h-[46vh] min-h-[320px] shrink-0 bg-background">
            <CarViewer
              vehicle={sim.vehicle}
              setup={sim.setup}
              selectedPart={selectedPart}
              onSelectPart={(id) => setSelectedPart((cur) => (cur === id ? null : id))}
            />
            <div className="pointer-events-none absolute left-3 top-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                {sim.vehicle.name}
              </div>
              <p className="max-w-xs text-[10px] text-muted-foreground">{sim.vehicle.blurb}</p>
            </div>
          </section>

          <section className="bg-background">
            <Tabs defaultValue="track" className="gap-0">
              <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.v}
                    value={t.v}
                    className="rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}

              </TabsList>

              <TabsContent value="track" className="m-0">
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  {(["2d", "3d"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setTrackView(v)}
                      className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
                        trackView === v
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {v === "2d" ? "circuit map" : "3d chase"}
                    </button>
                  ))}
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    {sim.geom.def.name} · {(sim.geom.length / 1000).toFixed(2)} km
                  </span>
                </div>
                <div className="grid gap-px bg-border lg:grid-cols-2">
                  <div className="h-[42vh] min-h-[280px] bg-background p-2">
                    {trackView === "2d" ? (
                      <TrackMap geom={sim.geom} sample={s} speedProfile={sim.profile.v} />
                    ) : (
                      <Track3D geom={sim.geom} vehicle={sim.vehicle} poseRef={sim.poseRef} />
                    )}
                  </div>
                  <div className="h-[42vh] min-h-[280px] bg-background p-2">
                    <div className="pb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      Speed vs lap distance (km/h)
                    </div>
                    <div className="h-[calc(100%-1.25rem)]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sim.trace}>
                          <CartesianGrid stroke="#1e242a" vertical={false} />
                          <XAxis dataKey="d" stroke="#5b6b78" tick={{ fontSize: 9, fill: "#7f8fa0" }} tickLine={false} />
                          <YAxis stroke="#5b6b78" tick={{ fontSize: 9, fill: "#7f8fa0" }} tickLine={false} width={34} />
                          <Tooltip
                            contentStyle={{
                              background: "#0e1114",
                              border: "1px solid #232a31",
                              borderRadius: 2,
                              fontSize: 11,
                            }}
                            labelStyle={{ color: "#7f8fa0" }}
                          />
                          <Area type="monotone" dataKey="v" name="actual" stroke="#ffb020" fill="#ffb02033" strokeWidth={1.6} dot={false} />
                          <Line type="monotone" dataKey="ideal" name="ideal" stroke="#4fc3f7" strokeWidth={1} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="m-0">
                <PerformancePanel vehicle={sim.vehicle} sample={s} />
              </TabsContent>

              <TabsContent value="results" className="m-0">
                <ResultsPanel laps={sim.laps} idealLap={sim.profile.lapTime} onClear={sim.clearLaps} />
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-px bg-border lg:min-h-0 lg:overflow-hidden">
          <div className="max-h-[52vh] min-h-[260px] shrink-0 overflow-y-auto bg-background">
            <PartPanel
              vehicle={sim.vehicle}
              partId={selectedPart}
              sample={s}
              setup={sim.setup}
              onClose={() => setSelectedPart(null)}
            />
          </div>
          <div className="flex-1 bg-background">
            <SetupPanel
              vehicle={sim.vehicle}
              setup={sim.setup}
              onChange={setParam}
              onReset={resetSetup}
              derived={sim.derived}
              idealLap={sim.profile.lapTime}
              topSpeed={sim.profile.topSpeed}
              {...(activePart ? { highlight: activePart.setupIds } : {})}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
