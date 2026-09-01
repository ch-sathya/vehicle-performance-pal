import type { TrackGeometry } from "./track";
import type { TelemetrySample, VehicleDef } from "./vehicles";

const G = 9.81;

export interface DerivedSetup {
  mass: number;
  aeroFactor: number;
  dragK: number;
  gripFactor: number;
  brakeFactor: number;
  tractionFactor: number;
  vCeiling: number;
  wearRate: number;
  ers: number;
  brakeBias: number;
}

function get(setup: Record<string, number>, id: string, fallback: number) {
  const v = setup[id];
  return typeof v === "number" ? v : fallback;
}

export function deriveSetup(vehicle: VehicleDef, setup: Record<string, number>): DerivedSetup {
  const p = vehicle.physics;
  const fw = get(setup, "frontWing", 0);
  const rw = get(setup, "rearWing", 0);
  const wingRef = vehicle.id === "f1" ? 31 : 3;
  const wingSum = fw + rw;
  const aeroFactor = Math.max(0.35, 1 + (wingSum - wingRef) / (wingRef > 10 ? 55 : 26));

  const rideRef = get(setup, "rideHeight", 40);
  const rideDef = vehicle.setup.find((s) => s.id === "rideHeight")?.default ?? rideRef;
  const rideGain = 1 + (rideDef - rideRef) / 260;

  const press = get(setup, "tyrePressure", 22);
  const pressOpt = vehicle.setup.find((s) => s.id === "tyrePressure")?.default ?? press;
  const pressPenalty = Math.min(0.22, Math.abs(press - pressOpt) * 0.022);

  const camber = get(setup, "camber", 1);
  const camberOpt = vehicle.setup.find((s) => s.id === "camber")?.default ?? camber;
  const camberGain = 0.03 * (camber - camberOpt) - 0.012 * Math.max(0, camber - camberOpt - 1.2);

  const gripFactor = Math.max(0.55, 1 - pressPenalty + camberGain);
  const diff = get(setup, "diff", 60);
  const tractionFactor = gripFactor * (0.9 + diff / 600);

  const fuel = get(setup, "fuelLoad", 20);
  const mass = p.dryMass + fuel + 80;

  const dragK = p.dragK * (1 + (wingSum - wingRef) / (wingRef > 10 ? 40 : 20)) * (1 + Math.max(0, rideRef - rideDef) / 900);

  const finalDrive = get(setup, "finalDrive", 3.4);
  const vCeiling = ((p.rpmMax / 60) * 2 * Math.PI * p.wheelRadius) / (finalDrive * 1.05);

  const bias = get(setup, "brakeBias", 60);
  const brakeFactor = p.brakeScale * (1 - Math.abs(bias - 60) / 260);

  return {
    mass,
    aeroFactor: aeroFactor * rideGain,
    dragK,
    gripFactor,
    brakeFactor,
    tractionFactor,
    vCeiling,
    wearRate: 1 + Math.max(0, camber - camberOpt) * 0.35 + pressPenalty * 2,
    ers: get(setup, "ersMode", 0) / 100,
    brakeBias: bias,
  };
}

/** Grip coefficient available at speed v. */
function mu(vehicle: VehicleDef, d: DerivedSetup, v: number) {
  const p = vehicle.physics;
  const aeroMu = p.muAero * d.aeroFactor * (v / p.vRef) ** 2 * (p.refMass / d.mass);
  return (p.muMech + Math.min(aeroMu, p.muAero * 3)) * d.gripFactor;
}

export interface SpeedProfile {
  /** Target speed at each track sample (m/s). */
  v: Float64Array;
  /** Ideal lap time for this profile (s). */
  lapTime: number;
  topSpeed: number;
}

export function buildSpeedProfile(
  geom: TrackGeometry,
  vehicle: VehicleDef,
  d: DerivedSetup,
): SpeedProfile {
  const p = vehicle.physics;
  const n = geom.k.length;
  const vPower = Math.cbrt((p.powerKW * 1000) / Math.max(0.05, d.dragK));
  const vMax = Math.min(vPower, d.vCeiling);
  const v = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const k = geom.k[i]!;
    if (k < 1e-5) {
      v[i] = vMax;
      continue;
    }
    // solve k v^2 = g * mu(v)
    let lo = 3;
    let hi = vMax;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (k * mid * mid <= G * mu(vehicle, d, mid)) lo = mid;
      else hi = mid;
    }
    v[i] = Math.min(vMax, lo);
  }

  // Forward pass: traction/power limited acceleration.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const vi = Math.max(v[i]!, 3);
      const aPower = (p.powerKW * 1000) / (d.mass * vi);
      const aGrip = G * mu(vehicle, d, vi) * d.tractionFactor * 0.75;
      const aDrag = (d.dragK * vi * vi) / d.mass;
      const a = Math.max(0.1, Math.min(aPower, aGrip) - aDrag);
      const vNext = Math.sqrt(vi * vi + 2 * a * geom.ds[i]!);
      if (vNext < v[j]!) v[j] = vNext;
    }
    // Backward pass: braking limit.
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n;
      const vj = Math.max(v[j]!, 3);
      const dec = G * mu(vehicle, d, vj) * d.brakeFactor + (d.dragK * vj * vj) / d.mass;
      const vPrev = Math.sqrt(vj * vj + 2 * dec * geom.ds[i]!);
      if (vPrev < v[i]!) v[i] = vPrev;
    }
  }

  let lapTime = 0;
  let topSpeed = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vm = Math.max(3, (v[i]! + v[j]!) / 2);
    lapTime += geom.ds[i]! / vm;
    topSpeed = Math.max(topSpeed, v[i]!);
  }

  return { v, lapTime, topSpeed };
}

export interface LapRecord {
  id: string;
  index: number;
  time: number;
  sectors: [number, number, number];
  vehicleId: string;
  trackId: string;
  topSpeed: number;
  fuelUsed: number;
  avgTyreWear: number;
  setupSummary: string;
}

function sampleAt(arr: Float64Array, geom: TrackGeometry, s: number) {
  const n = arr.length;
  const frac = (s / geom.length) * n;
  const i = Math.floor(frac) % n;
  const j = (i + 1) % n;
  const t = frac - Math.floor(frac);
  return arr[i]! * (1 - t) + arr[j]! * t;
}

export class Simulator {
  geom: TrackGeometry;
  vehicle: VehicleDef;
  derived: DerivedSetup;
  profile: SpeedProfile;

  s = 0;
  v = 0;
  t = 0;
  lapTime = 0;
  lapIndex = 1;
  sectorTimes: number[] = [];
  private lastSector = 0;
  private fuelStart: number;
  fuel: number;
  tyreTemp: number[];
  tyreWear = [0, 0, 0, 0];
  brakeTemp: number[];
  ersCharge = 0.8;
  waterTemp: number;
  private lapTop = 0;
  private wearAtLapStart = 0;

  constructor(geom: TrackGeometry, vehicle: VehicleDef, setup: Record<string, number>) {
    this.geom = geom;
    this.vehicle = vehicle;
    this.derived = deriveSetup(vehicle, setup);
    this.profile = buildSpeedProfile(geom, vehicle, this.derived);
    this.fuelStart = get(setup, "fuelLoad", 30);
    this.fuel = this.fuelStart;
    this.tyreTemp = [0, 0, 0, 0].map(() => vehicle.physics.tyreBase);
    this.brakeTemp = [0, 0, 0, 0].map(() => vehicle.physics.brakeBase * 0.5);
    this.waterTemp = 88;
    this.v = this.profile.v[0]! * 0.6;
  }

  private drsActive(frac: number) {
    return this.vehicle.id === "f1"
      ? this.geom.def.drsZones.some(([a, b]) => (a < b ? frac >= a && frac <= b : frac >= a || frac <= b))
      : false;
  }

  /** Advance the simulation and return the current sample. */
  step(dt: number, onLap?: (lap: LapRecord) => void): TelemetrySample {
    const p = this.vehicle.physics;
    const d = this.derived;
    const frac = (this.s % this.geom.length) / this.geom.length;
    const vTarget = sampleAt(this.profile.v, this.geom, this.s % this.geom.length);
    const vAhead = sampleAt(this.profile.v, this.geom, (this.s + Math.max(20, this.v * 1.2)) % this.geom.length);

    const drs = this.drsActive(frac);
    const target = Math.min(d.vCeiling, drs ? vTarget * 1.04 : vTarget);

    let throttle = 0;
    let brake = 0;
    if (this.v > vAhead * 1.005) {
      brake = Math.min(1, (this.v - vAhead) / 8 + 0.15);
    } else if (this.v < target) {
      throttle = Math.min(1, (target - this.v) / 6 + 0.35);
    } else {
      throttle = 0.35;
    }

    const aPower = (throttle * p.powerKW * 1000 * (1 + 0.06 * d.ers)) / (d.mass * Math.max(6, this.v));
    const aGrip = G * mu(this.vehicle, d, this.v) * d.tractionFactor * 0.8;
    const aDrag = (d.dragK * this.v * this.v * (drs ? 0.86 : 1)) / d.mass;
    const aBrake = brake * G * mu(this.vehicle, d, this.v) * d.brakeFactor;
    const accel = Math.min(aPower, aGrip) - aDrag - aBrake;

    this.v = Math.max(4, this.v + accel * dt);
    const ds = this.v * dt;
    this.s += ds;
    this.t += dt;
    this.lapTime += dt;
    this.lapTop = Math.max(this.lapTop, this.v);

    const k = sampleAt(this.geom.k, this.geom, this.s % this.geom.length);
    const latG = (k * this.v * this.v) / G;
    const longG = accel / G;

    // Fuel, tyres, brakes, ERS.
    this.fuel = Math.max(0.4, this.fuel - (p.fuelPerKm * ds) / 1000 * (0.6 + throttle * 0.8));
    const loadHeat = 12 * latG + 26 * brake + 6 * throttle;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const bias = front ? d.brakeBias / 60 : (100 - d.brakeBias) / 40;
      const side = i % 2 === 0 ? 1.08 : 0.94;
      const tTarget = p.tyreBase + loadHeat * side * (front ? 1.05 : 1);
      this.tyreTemp[i] = this.tyreTemp[i]! + (tTarget - this.tyreTemp[i]!) * (1 - Math.exp(-0.5 * dt));
      const bTarget = p.brakeBase * 0.5 + brake * p.brakeBase * 1.5 * bias;
      this.brakeTemp[i] = this.brakeTemp[i]! + (bTarget - this.brakeTemp[i]!) * (1 - Math.exp(-0.9 * dt));
      this.tyreWear[i] = Math.min(
        1,
        this.tyreWear[i]! + dt * 0.00022 * d.wearRate * (1 + latG * 0.8 + brake * 0.5) * side,
      );
    }
    this.ersCharge = Math.min(
      1,
      Math.max(0, this.ersCharge + dt * (brake * 0.06 - throttle * 0.05 * d.ers)),
    );
    const waterTarget = 88 + throttle * 14 + Math.max(0, 1 - this.v / 40) * 6;
    this.waterTemp += (waterTarget - this.waterTemp) * (1 - Math.exp(-0.25 * dt));

    // Sector + lap bookkeeping.
    const [s1, s2] = this.geom.def.sectorSplits;
    const sectorIdx = frac < s1 ? 0 : frac < s2 ? 1 : 2;
    if (sectorIdx !== this.lastSector) {
      if (sectorIdx > this.lastSector) this.sectorTimes.push(this.lapTime - (this.sectorTimes.reduce((a, b) => a + b, 0)));
      this.lastSector = sectorIdx;
    }
    if (this.s >= this.geom.length) {
      this.s -= this.geom.length;
      const acc = this.sectorTimes.reduce((a, b) => a + b, 0);
      const sectors: [number, number, number] = [
        this.sectorTimes[0] ?? this.lapTime / 3,
        this.sectorTimes[1] ?? this.lapTime / 3,
        Math.max(0, this.lapTime - acc) || this.lapTime / 3,
      ];
      const avgWear = this.tyreWear.reduce((a, b) => a + b, 0) / 4;
      onLap?.({
        id: `${Date.now()}-${this.lapIndex}`,
        index: this.lapIndex,
        time: this.lapTime,
        sectors,
        vehicleId: this.vehicle.id,
        trackId: this.geom.def.id,
        topSpeed: this.lapTop * 3.6,
        fuelUsed: Math.max(0, this.fuelStart - this.fuel),
        avgTyreWear: Math.max(0, avgWear - this.wearAtLapStart) * 100,
        setupSummary: "",
      });
      this.lapIndex += 1;
      this.lapTime = 0;
      this.sectorTimes = [];
      this.lastSector = 0;
      this.lapTop = 0;
      this.wearAtLapStart = avgWear;
    }

    const gearSpan = d.vCeiling / p.gears;
    const gear = Math.max(1, Math.min(p.gears, Math.ceil(this.v / gearSpan)));
    const inGear = this.v - (gear - 1) * gearSpan;
    const rpm = p.rpmIdle + (inGear / gearSpan) * (p.rpmMax - p.rpmIdle);
    const heading = sampleAt(this.geom.heading, this.geom, this.s);
    void heading;

    return {
      t: this.t,
      s: this.s,
      lapFraction: this.s / this.geom.length,
      speed: this.v,
      rpm,
      gear,
      throttle,
      brake,
      drs,
      latG,
      longG,
      steering: Math.max(-1, Math.min(1, k * 45)),
      tyreTemp: [...this.tyreTemp],
      tyreWear: [...this.tyreWear],
      brakeTemp: [...this.brakeTemp],
      fuel: this.fuel,
      ersCharge: this.ersCharge,
      waterTemp: this.waterTemp,
      oilPressure: 2.6 + (rpm / p.rpmMax) * 2.6,
      downforce: 0.5 * d.dragK * 2.6 * d.aeroFactor * this.v * this.v,
      lapTime: this.lapTime,
    };
  }

  /** World position + heading for rendering. */
  pose() {
    const s = this.s % this.geom.length;
    return {
      x: sampleAt(this.geom.x, this.geom, s),
      y: sampleAt(this.geom.y, this.geom, s),
      heading: sampleAt(this.geom.heading, this.geom, s),
    };
  }
}
