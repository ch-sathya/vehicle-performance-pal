export type Vec3 = [number, number, number];

export interface TelemetrySample {
  /** Session time (s). */
  t: number;
  /** Lap distance (m). */
  s: number;
  lapFraction: number;
  speed: number; // m/s
  rpm: number;
  gear: number;
  throttle: number; // 0..1
  brake: number; // 0..1
  drs: boolean;
  latG: number;
  longG: number;
  steering: number; // -1..1
  tyreTemp: number[]; // FL FR RL RR (degC)
  tyreWear: number[]; // 0..1
  brakeTemp: number[]; // FL FR RL RR (degC)
  fuel: number; // kg
  ersCharge: number; // 0..1
  waterTemp: number;
  oilPressure: number;
  downforce: number; // N
  lapTime: number; // elapsed on current lap
}

export type SensorRead = (s: TelemetrySample) => number;

export interface SensorDef {
  id: string;
  name: string;
  code: string;
  unit: string;
  read: SensorRead;
  /** Nominal operating window, used for the status colouring. */
  range: [number, number];
  decimals?: number;
}

export interface SetupParamDef {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  note: string;
}

export interface PartDef {
  id: string;
  name: string;
  group: string;
  /** Hotspot position in model-local space, +z = forward, metres. */
  hotspot: Vec3;
  description: string;
  sensorIds: string[];
  setupIds: string[];
}

export interface PhysicsDef {
  dryMass: number;
  /** Reference mass used for aero-grip scaling. */
  refMass: number;
  powerKW: number;
  /** Mechanical grip coefficient (tyres, no aero). */
  muMech: number;
  /** Extra grip coefficient contributed by aero at vRef. */
  muAero: number;
  vRef: number; // m/s
  /** Drag area factor: drag force = dragK * v^2 (N). */
  dragK: number;
  brakeScale: number;
  rpmMax: number;
  rpmIdle: number;
  gears: number;
  wheelRadius: number;
  fuelPerKm: number;
  tyreBase: number;
  brakeBase: number;
}

export interface VehicleDef {
  id: string;
  name: string;
  klass: string;
  blurb: string;
  model: string;
  modelScale: number;
  /** Front of the imported model points at -z when true. */
  physics: PhysicsDef;
  parts: PartDef[];
  sensors: SensorDef[];
  setup: SetupParamDef[];
  accent: string;
}

const C = (v: number) => Math.round(v);

/* ------------------------------------------------------------------ */
/* Shared sensor builders                                             */
/* ------------------------------------------------------------------ */

const corner = ["FL", "FR", "RL", "RR"];

function tyreSensors(base: number): SensorDef[] {
  return corner.map((c, i) => ({
    id: `tyre-temp-${c.toLowerCase()}`,
    name: `Tyre surface temp ${c}`,
    code: `TTMP_${c}`,
    unit: "°C",
    read: (s) => s.tyreTemp[i] ?? base,
    range: [base + 5, base + 55] as [number, number],
    decimals: 0,
  }));
}

function tyreWearSensors(): SensorDef[] {
  return corner.map((c, i) => ({
    id: `tyre-wear-${c.toLowerCase()}`,
    name: `Tyre wear ${c}`,
    code: `TWR_${c}`,
    unit: "%",
    read: (s) => (s.tyreWear[i] ?? 0) * 100,
    range: [0, 70] as [number, number],
    decimals: 1,
  }));
}

function brakeSensors(base: number, hot: number): SensorDef[] {
  return corner.map((c, i) => ({
    id: `brake-temp-${c.toLowerCase()}`,
    name: `Brake disc temp ${c}`,
    code: `BTMP_${c}`,
    unit: "°C",
    read: (s) => s.brakeTemp[i] ?? base,
    range: [base + 20, hot] as [number, number],
    decimals: 0,
  }));
}

const coreSensors: SensorDef[] = [
  {
    id: "speed",
    name: "Ground speed",
    code: "SPD",
    unit: "km/h",
    read: (s) => s.speed * 3.6,
    range: [0, 360],
  },
  { id: "rpm", name: "Engine speed", code: "RPM", unit: "rpm", read: (s) => s.rpm, range: [0, 15000] },
  { id: "gear", name: "Gear engaged", code: "GEAR", unit: "", read: (s) => s.gear, range: [1, 8] },
  { id: "throttle", name: "Throttle position", code: "THR", unit: "%", read: (s) => s.throttle * 100, range: [0, 100] },
  { id: "brake", name: "Brake pressure", code: "BRK", unit: "%", read: (s) => s.brake * 100, range: [0, 100] },
  { id: "lat-g", name: "Lateral acceleration", code: "GLAT", unit: "g", read: (s) => s.latG, range: [0, 5], decimals: 2 },
  { id: "long-g", name: "Longitudinal acceleration", code: "GLON", unit: "g", read: (s) => s.longG, range: [-6, 3], decimals: 2 },
  { id: "steering", name: "Steering angle", code: "STR", unit: "%", read: (s) => s.steering * 100, range: [-100, 100] },
  { id: "downforce", name: "Total downforce", code: "DF", unit: "N", read: (s) => s.downforce, range: [0, 20000] },
  { id: "fuel", name: "Fuel remaining", code: "FUEL", unit: "kg", read: (s) => s.fuel, range: [1, 110], decimals: 1 },
  { id: "ers", name: "ERS state of charge", code: "ERS", unit: "%", read: (s) => s.ersCharge * 100, range: [10, 100] },
  { id: "water", name: "Coolant temp", code: "H2O", unit: "°C", read: (s) => s.waterTemp, range: [80, 118], decimals: 0 },
  { id: "oil", name: "Oil pressure", code: "OILP", unit: "bar", read: (s) => s.oilPressure, range: [2.5, 6], decimals: 2 },
];

/* ------------------------------------------------------------------ */
/* F1 car                                                             */
/* ------------------------------------------------------------------ */

const f1: VehicleDef = {
  id: "f1",
  name: "FW-26 Prototype",
  klass: "Formula 1",
  blurb: "Open-wheel single seater, 1.6L turbo hybrid, ground-effect floor.",
  model: "/models/race.glb",
  modelScale: 1,
  accent: "amber",
  physics: {
    dryMass: 798,
    refMass: 860,
    powerKW: 760,
    muMech: 1.75,
    muAero: 2.6,
    vRef: 75,
    dragK: 0.95,
    brakeScale: 1.35,
    rpmMax: 13500,
    rpmIdle: 4200,
    gears: 8,
    wheelRadius: 0.36,
    fuelPerKm: 0.42,
    tyreBase: 90,
    brakeBase: 320,
  },
  setup: [
    { id: "frontWing", name: "Front wing angle", unit: "°", min: 0, max: 30, step: 0.5, default: 14, note: "Front downforce and turn-in bite. Too much brings understeer relief but drag." },
    { id: "rearWing", name: "Rear wing angle", unit: "°", min: 0, max: 30, step: 0.5, default: 17, note: "Rear stability and drag. Trim it for top speed on long straights." },
    { id: "rideHeight", name: "Ride height", unit: "mm", min: 20, max: 80, step: 1, default: 34, note: "Lower runs the floor closer to the ground: more ground effect, more risk." },
    { id: "tyrePressure", name: "Tyre pressure", unit: "psi", min: 18, max: 28, step: 0.2, default: 22, note: "Peak grip near 22 psi. Off-window pressure loses contact patch." },
    { id: "camber", name: "Front camber", unit: "°", min: 0, max: 4.5, step: 0.1, default: 2.8, note: "Negative camber buys cornering grip and costs straight-line tyre life." },
    { id: "brakeBias", name: "Brake bias", unit: "% front", min: 50, max: 70, step: 0.5, default: 58, note: "Forward bias stabilises braking; rearward shortens stopping distance until lock-up." },
    { id: "diff", name: "Differential lock", unit: "%", min: 20, max: 95, step: 1, default: 62, note: "Higher lock stabilises traction on exit and blunts rotation." },
    { id: "finalDrive", name: "Final drive", unit: ":1", min: 2.8, max: 4.6, step: 0.05, default: 3.5, note: "Short gearing accelerates harder and caps top speed." },
    { id: "fuelLoad", name: "Fuel load", unit: "kg", min: 10, max: 110, step: 1, default: 62, note: "Every 10 kg costs roughly 0.3 s a lap." },
    { id: "ersMode", name: "ERS deployment", unit: "%", min: 0, max: 100, step: 5, default: 70, note: "Deployment aggression: more lap time now, less battery later." },
  ],
  parts: [
    {
      id: "front-wing",
      name: "Front wing assembly",
      group: "Aerodynamics",
      hotspot: [0, 0.14, 1.42],
      description: "Multi-element front wing with adjustable flap. Sets the front aero balance and feeds the floor.",
      sensorIds: ["downforce", "speed"],
      setupIds: ["frontWing"],
    },
    {
      id: "nose",
      name: "Nose cone",
      group: "Chassis",
      hotspot: [0, 0.36, 1.05],
      description: "Crash structure and front wing mount. Houses the front pitot and ride-height sensor.",
      sensorIds: ["speed", "long-g"],
      setupIds: ["rideHeight"],
    },
    {
      id: "front-suspension",
      name: "Front suspension",
      group: "Mechanical",
      hotspot: [0.5, 0.28, 0.86],
      description: "Push-rod wishbones with inboard torsion bars. Controls camber and platform stiffness.",
      sensorIds: ["lat-g", "steering"],
      setupIds: ["camber", "rideHeight"],
    },
    {
      id: "tyre-fl",
      name: "Front-left tyre",
      group: "Tyres",
      hotspot: [0.72, 0.32, 0.9],
      description: "Loaded hardest through right-hand corners. Watch surface temp and wear rate.",
      sensorIds: ["tyre-temp-fl", "tyre-wear-fl", "brake-temp-fl"],
      setupIds: ["tyrePressure", "camber"],
    },
    {
      id: "tyre-fr",
      name: "Front-right tyre",
      group: "Tyres",
      hotspot: [-0.72, 0.32, 0.9],
      description: "Front-right contact patch. Pressure and camber move the whole front axle window.",
      sensorIds: ["tyre-temp-fr", "tyre-wear-fr", "brake-temp-fr"],
      setupIds: ["tyrePressure", "camber"],
    },
    {
      id: "brakes-front",
      name: "Front brake assembly",
      group: "Braking",
      hotspot: [0.55, 0.42, 0.7],
      description: "Carbon-carbon discs and calipers with brake-duct cooling. Bias sets front/rear torque split.",
      sensorIds: ["brake-temp-fl", "brake-temp-fr", "brake"],
      setupIds: ["brakeBias"],
    },
    {
      id: "cockpit",
      name: "Cockpit & halo",
      group: "Chassis",
      hotspot: [0, 0.66, 0.28],
      description: "Survival cell, steering column and halo. Driver controls for ERS and brake bias live here.",
      sensorIds: ["steering", "lat-g", "ers"],
      setupIds: ["brakeBias", "ersMode"],
    },
    {
      id: "sidepod",
      name: "Sidepod & radiators",
      group: "Cooling",
      hotspot: [0.62, 0.4, 0.0],
      description: "Inlet ducts feeding water and oil radiators. Governs coolant temperature under load.",
      sensorIds: ["water", "oil"],
      setupIds: [],
    },
    {
      id: "floor",
      name: "Floor & venturi tunnels",
      group: "Aerodynamics",
      hotspot: [0, 0.06, 0.05],
      description: "Primary downforce generator. Ride height directly scales ground-effect load.",
      sensorIds: ["downforce", "lat-g"],
      setupIds: ["rideHeight"],
    },
    {
      id: "power-unit",
      name: "Power unit",
      group: "Powertrain",
      hotspot: [0, 0.5, -0.42],
      description: "1.6L V6 turbo hybrid with MGU-K and MGU-H. Deployment mode drives ERS harvest and use.",
      sensorIds: ["rpm", "throttle", "water", "ers", "fuel"],
      setupIds: ["ersMode", "fuelLoad"],
    },
    {
      id: "gearbox",
      name: "Gearbox & differential",
      group: "Powertrain",
      hotspot: [0, 0.34, -0.95],
      description: "Eight-speed sequential with limited-slip differential. Final drive sets the speed ceiling.",
      sensorIds: ["gear", "rpm"],
      setupIds: ["finalDrive", "diff"],
    },
    {
      id: "tyre-rl",
      name: "Rear-left tyre",
      group: "Tyres",
      hotspot: [0.74, 0.34, -0.95],
      description: "Traction corner. Differential lock and deployment show up as wear here first.",
      sensorIds: ["tyre-temp-rl", "tyre-wear-rl", "brake-temp-rl"],
      setupIds: ["tyrePressure", "diff"],
    },
    {
      id: "tyre-rr",
      name: "Rear-right tyre",
      group: "Tyres",
      hotspot: [-0.74, 0.34, -0.95],
      description: "Rear-right contact patch, the usual limiter on traction-limited exits.",
      sensorIds: ["tyre-temp-rr", "tyre-wear-rr", "brake-temp-rr"],
      setupIds: ["tyrePressure", "diff"],
    },
    {
      id: "rear-wing",
      name: "Rear wing & DRS",
      group: "Aerodynamics",
      hotspot: [0, 0.78, -1.2],
      description: "Main plane and DRS flap. Stalls on the straights to shed drag when DRS is armed.",
      sensorIds: ["downforce", "speed"],
      setupIds: ["rearWing"],
    },
    {
      id: "diffuser",
      name: "Diffuser",
      group: "Aerodynamics",
      hotspot: [0, 0.12, -1.34],
      description: "Expands the floor's underbody flow. Sensitive to rear ride height and rake.",
      sensorIds: ["downforce"],
      setupIds: ["rideHeight", "rearWing"],
    },
  ],
  sensors: [...coreSensors, ...tyreSensors(90), ...tyreWearSensors(), ...brakeSensors(320, 950)],
};

/* ------------------------------------------------------------------ */
/* Haul truck                                                         */
/* ------------------------------------------------------------------ */

const truck: VehicleDef = {
  id: "truck",
  name: "Hauler 480",
  klass: "Heavy truck",
  blurb: "Rigid box truck, 12L diesel, laden mass profile with trailer brakes.",
  model: "/models/truck.glb",
  modelScale: 1,
  accent: "sky",
  physics: {
    dryMass: 9000,
    refMass: 9000,
    powerKW: 350,
    muMech: 0.72,
    muAero: 0.05,
    vRef: 25,
    dragK: 3.1,
    brakeScale: 0.75,
    rpmMax: 2400,
    rpmIdle: 600,
    gears: 12,
    wheelRadius: 0.52,
    fuelPerKm: 0.31,
    tyreBase: 45,
    brakeBase: 120,
  },
  setup: [
    { id: "tyrePressure", name: "Tyre pressure", unit: "psi", min: 70, max: 130, step: 1, default: 105, note: "High pressure lowers rolling resistance and grip." },
    { id: "brakeBias", name: "Brake bias", unit: "% front", min: 40, max: 65, step: 0.5, default: 52, note: "Load-sensitive valve split between steer and drive axles." },
    { id: "finalDrive", name: "Final drive", unit: ":1", min: 2.6, max: 5.2, step: 0.05, default: 3.9, note: "Highway ratio versus grade-climbing torque." },
    { id: "fuelLoad", name: "Fuel load", unit: "kg", min: 40, max: 500, step: 10, default: 260, note: "Diesel mass carried." },
    { id: "payload", name: "Payload", unit: "kg", min: 0, max: 14000, step: 250, default: 6000, note: "Cargo mass. Dominates braking distance and cornering limit." },
    { id: "rideHeight", name: "Suspension height", unit: "mm", min: 120, max: 260, step: 5, default: 190, note: "Air suspension height; affects roll and centre of gravity." },
    { id: "camber", name: "Steer axle camber", unit: "°", min: 0, max: 2, step: 0.1, default: 0.6, note: "Alignment on the steer axle." },
  ],
  parts: [
    { id: "cab", name: "Cab & driveline controls", group: "Chassis", hotspot: [0, 1.1, 1.1], description: "Driver station, telematics gateway and dash cluster feed.", sensorIds: ["speed", "gear", "steering"], setupIds: [] },
    { id: "engine", name: "Diesel engine", group: "Powertrain", hotspot: [0, 0.55, 1.5], description: "12L inline six with turbo and EGR. Watch coolant temp on long grades.", sensorIds: ["rpm", "throttle", "water", "oil", "fuel"], setupIds: ["fuelLoad"] },
    { id: "gearbox", name: "Automated gearbox", group: "Powertrain", hotspot: [0, 0.4, 0.6], description: "12-speed automated manual with retarder.", sensorIds: ["gear", "rpm"], setupIds: ["finalDrive"] },
    { id: "steer-axle", name: "Steer axle", group: "Mechanical", hotspot: [0.7, 0.4, 1.3], description: "Front axle, alignment and steering geometry.", sensorIds: ["lat-g", "steering", "tyre-temp-fl"], setupIds: ["camber", "tyrePressure"] },
    { id: "drive-axle", name: "Drive axle", group: "Mechanical", hotspot: [0.7, 0.4, -0.9], description: "Rear drive axle carrying the payload.", sensorIds: ["tyre-temp-rl", "tyre-wear-rl"], setupIds: ["payload", "tyrePressure"] },
    { id: "brakes", name: "Air brake system", group: "Braking", hotspot: [0.6, 0.3, 0.1], description: "Drum brakes with load-sensing valve and retarder assist.", sensorIds: ["brake", "brake-temp-fl", "brake-temp-rl"], setupIds: ["brakeBias"] },
    { id: "body", name: "Cargo body", group: "Chassis", hotspot: [0, 1.4, -0.6], description: "Box body carrying the payload; frontal area drives drag.", sensorIds: ["downforce", "speed"], setupIds: ["payload", "rideHeight"] },
  ],
  sensors: [...coreSensors, ...tyreSensors(45), ...tyreWearSensors(), ...brakeSensors(120, 420)],
};

/* ------------------------------------------------------------------ */
/* Road car                                                           */
/* ------------------------------------------------------------------ */

const road: VehicleDef = {
  id: "road",
  name: "Sedan GT",
  klass: "Road car",
  blurb: "Front-engine road saloon on street tyres, everyday performance baseline.",
  model: "/models/sedan.glb",
  modelScale: 1,
  accent: "emerald",
  physics: {
    dryMass: 1480,
    refMass: 1480,
    powerKW: 220,
    muMech: 1.05,
    muAero: 0.18,
    vRef: 55,
    dragK: 0.38,
    brakeScale: 0.95,
    rpmMax: 6800,
    rpmIdle: 800,
    gears: 6,
    wheelRadius: 0.34,
    fuelPerKm: 0.09,
    tyreBase: 40,
    brakeBase: 90,
  },
  setup: [
    { id: "tyrePressure", name: "Tyre pressure", unit: "psi", min: 26, max: 42, step: 0.5, default: 33, note: "Street tyre window; peak grip around 33 psi." },
    { id: "camber", name: "Front camber", unit: "°", min: 0, max: 3, step: 0.1, default: 1.2, note: "More camber for track days, more inner wear." },
    { id: "brakeBias", name: "Brake bias", unit: "% front", min: 55, max: 75, step: 0.5, default: 66, note: "Factory-biased forward for stability." },
    { id: "finalDrive", name: "Final drive", unit: ":1", min: 2.9, max: 4.4, step: 0.05, default: 3.4, note: "Cruising economy versus acceleration." },
    { id: "rideHeight", name: "Ride height", unit: "mm", min: 90, max: 160, step: 2, default: 130, note: "Lowering reduces roll and centre of gravity." },
    { id: "rearWing", name: "Rear spoiler", unit: "°", min: 0, max: 12, step: 0.5, default: 3, note: "Small aero aid at speed." },
    { id: "fuelLoad", name: "Fuel load", unit: "kg", min: 5, max: 60, step: 1, default: 40, note: "Tank content." },
  ],
  parts: [
    { id: "front-bumper", name: "Front bumper & splitter", group: "Aerodynamics", hotspot: [0, 0.35, 1.9], description: "Splitter and cooling apertures.", sensorIds: ["speed", "downforce"], setupIds: [] },
    { id: "engine", name: "Engine", group: "Powertrain", hotspot: [0, 0.6, 1.3], description: "Turbo four with direct injection.", sensorIds: ["rpm", "throttle", "water", "oil", "fuel"], setupIds: ["fuelLoad"] },
    { id: "gearbox", name: "Transmission", group: "Powertrain", hotspot: [0, 0.35, 0.5], description: "Six-speed automatic with torque converter.", sensorIds: ["gear", "rpm"], setupIds: ["finalDrive"] },
    { id: "front-suspension", name: "Front suspension", group: "Mechanical", hotspot: [0.65, 0.35, 1.35], description: "MacPherson struts with anti-roll bar.", sensorIds: ["lat-g", "steering"], setupIds: ["camber", "rideHeight"] },
    { id: "tyre-fl", name: "Front-left tyre", group: "Tyres", hotspot: [0.78, 0.32, 1.35], description: "Street compound; temperature window is much narrower than a slick.", sensorIds: ["tyre-temp-fl", "tyre-wear-fl", "brake-temp-fl"], setupIds: ["tyrePressure", "camber"] },
    { id: "tyre-rr", name: "Rear-right tyre", group: "Tyres", hotspot: [-0.78, 0.32, -1.3], description: "Rear contact patch under traction.", sensorIds: ["tyre-temp-rr", "tyre-wear-rr", "brake-temp-rr"], setupIds: ["tyrePressure"] },
    { id: "brakes", name: "Brake system", group: "Braking", hotspot: [0.6, 0.3, 1.1], description: "Vented steel discs; fade appears after repeated stops.", sensorIds: ["brake", "brake-temp-fl", "brake-temp-rr"], setupIds: ["brakeBias"] },
    { id: "cabin", name: "Cabin", group: "Chassis", hotspot: [0, 0.95, 0.2], description: "Occupant cell and instrument cluster.", sensorIds: ["speed", "lat-g"], setupIds: [] },
    { id: "rear-spoiler", name: "Rear spoiler", group: "Aerodynamics", hotspot: [0, 0.85, -1.6], description: "Lip spoiler trimming rear lift.", sensorIds: ["downforce"], setupIds: ["rearWing"] },
  ],
  sensors: [...coreSensors, ...tyreSensors(40), ...tyreWearSensors(), ...brakeSensors(90, 380)],
};

export const VEHICLES: VehicleDef[] = [f1, truck, road];

export function vehicleById(id: string): VehicleDef {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0]!;
}

export function defaultSetup(v: VehicleDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of v.setup) out[p.id] = p.default;
  return out;
}

export function sensorById(v: VehicleDef, id: string): SensorDef | undefined {
  return v.sensors.find((s) => s.id === id);
}

export function setupById(v: VehicleDef, id: string): SetupParamDef | undefined {
  return v.setup.find((s) => s.id === id);
}

export function formatSensor(def: SensorDef, value: number): string {
  const d = def.decimals ?? 0;
  return `${C(value * 10 ** d) / 10 ** d}`.padStart(1) + (def.unit ? ` ${def.unit}` : "");
}
