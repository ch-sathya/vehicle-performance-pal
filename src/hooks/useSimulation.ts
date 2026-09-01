import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildTrackGeometry, trackById } from "@/lib/telemetry/track";
import { Simulator, deriveSetup, buildSpeedProfile, type LapRecord } from "@/lib/telemetry/simulator";
import { defaultSetup, vehicleById, type TelemetrySample } from "@/lib/telemetry/vehicles";

const LAPS_KEY = "vpa.laps.v1";

export interface Trace {
  d: number;
  v: number;
  ideal: number;
}

export function useSimulation() {
  const [vehicleId, setVehicleId] = useState("f1");
  const [trackId, setTrackId] = useState("aurora");
  const vehicle = useMemo(() => vehicleById(vehicleId), [vehicleId]);
  const geom = useMemo(() => buildTrackGeometry(trackById(trackId)), [trackId]);

  const [setup, setSetup] = useState<Record<string, number>>(() => defaultSetup(vehicleById("f1")));
  useEffect(() => {
    setSetup(defaultSetup(vehicle));
  }, [vehicle]);

  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const [sample, setSample] = useState<TelemetrySample | null>(null);
  const [trace, setTrace] = useState<Trace[]>([]);

  const derived = useMemo(() => deriveSetup(vehicle, setup), [vehicle, setup]);
  const profile = useMemo(() => buildSpeedProfile(geom, vehicle, derived), [geom, vehicle, derived]);

  const simRef = useRef<Simulator | null>(null);
  const poseRef = useRef({ x: 0, y: 0, heading: 0 });
  const sampleRef = useRef<TelemetrySample | null>(null);
  const traceRef = useRef<Trace[]>([]);

  // Load persisted laps once on the client.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAPS_KEY);
      if (raw) setLaps(JSON.parse(raw) as LapRecord[]);
    } catch {
      /* ignore */
    }
  }, []);

  const pushLap = useCallback(
    (lap: LapRecord) => {
      setLaps((prev) => {
        const next = [{ ...lap, setupSummary: summarise(setup) }, ...prev].slice(0, 40);
        try {
          localStorage.setItem(LAPS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [setup],
  );

  const reset = useCallback(() => {
    simRef.current = new Simulator(geom, vehicle, setup);
    traceRef.current = [];
    setTrace([]);
  }, [geom, vehicle, setup]);

  // Rebuild the simulator whenever the vehicle, track or setup changes.
  useEffect(() => {
    simRef.current = new Simulator(geom, vehicle, setup);
    traceRef.current = [];
  }, [geom, vehicle, setup]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let uiClock = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const raw = Math.min((now - last) / 1000, 0.05);
      last = now;
      const sim = simRef.current;
      if (!sim) return;

      if (playing) {
        const dt = raw * rate;
        const steps = Math.max(1, Math.ceil(dt / 0.02));
        let s: TelemetrySample | null = null;
        for (let i = 0; i < steps; i++) s = sim.step(dt / steps, pushLap);
        if (s) {
          sampleRef.current = s;
          poseRef.current = sim.pose();
          const bucket = Math.round(s.s / 25) * 25;
          const t = traceRef.current;
          const ideal = idealAt(sim, bucket);
          if (!t.length || bucket > (t[t.length - 1]?.d ?? -1)) {
            t.push({ d: bucket, v: s.speed * 3.6, ideal });
          } else if (bucket < (t[0]?.d ?? 0)) {
            traceRef.current = [{ d: bucket, v: s.speed * 3.6, ideal }];
          }
        }
      }

      uiClock += raw;
      if (uiClock > 0.08) {
        uiClock = 0;
        setSample(sampleRef.current);
        setTrace([...traceRef.current]);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, pushLap]);

  const clearLaps = useCallback(() => {
    setLaps([]);
    try {
      localStorage.removeItem(LAPS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    vehicle,
    vehicleId,
    setVehicleId,
    trackId,
    setTrackId,
    geom,
    setup,
    setSetup,
    derived,
    profile,
    playing,
    setPlaying,
    rate,
    setRate,
    sample,
    trace,
    laps,
    clearLaps,
    reset,
    poseRef,
    sampleRef,
  };
}

function idealAt(sim: Simulator, s: number) {
  const n = sim.profile.v.length;
  const i = Math.floor((s / sim.geom.length) * n) % n;
  return (sim.profile.v[Math.max(0, i)] ?? 0) * 3.6;
}

function summarise(setup: Record<string, number>) {
  const bits: string[] = [];
  if (setup.frontWing !== undefined) bits.push(`FW ${setup.frontWing}`);
  if (setup.rearWing !== undefined) bits.push(`RW ${setup.rearWing}`);
  if (setup.rideHeight !== undefined) bits.push(`RH ${setup.rideHeight}`);
  if (setup.fuelLoad !== undefined) bits.push(`${setup.fuelLoad} kg`);
  return bits.join(" · ");
}

export function formatLap(t: number) {
  if (!Number.isFinite(t)) return "--:--.---";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}
