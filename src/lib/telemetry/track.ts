export interface TrackControlPoint {
  x: number;
  y: number;
}

export interface TrackDef {
  id: string;
  name: string;
  location: string;
  /** Closed-loop control points in metres (top-down, x east / y north). */
  control: TrackControlPoint[];
  /** Sector boundaries as fractions of lap distance (2 values -> 3 sectors). */
  sectorSplits: [number, number];
  /** Optional straight-line DRS zones as [startFrac, endFrac]. */
  drsZones: [number, number][];
}

export interface TrackGeometry {
  def: TrackDef;
  /** Sampled centreline points. */
  x: Float64Array;
  y: Float64Array;
  /** Cumulative distance at each sample (m). */
  s: Float64Array;
  /** Segment length between i and i+1 (m). */
  ds: Float64Array;
  /** Curvature magnitude at each sample (1/m). */
  k: Float64Array;
  /** Signed heading (radians) at each sample. */
  heading: Float64Array;
  length: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

function catmullRom(
  p0: TrackControlPoint,
  p1: TrackControlPoint,
  p2: TrackControlPoint,
  p3: TrackControlPoint,
  t: number,
): TrackControlPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

const SAMPLES_PER_SEGMENT = 14;

export function buildTrackGeometry(def: TrackDef): TrackGeometry {
  const cps = def.control;
  const n = cps.length;
  const pts: TrackControlPoint[] = [];

  for (let i = 0; i < n; i++) {
    const p0 = cps[(i - 1 + n) % n];
    const p1 = cps[i];
    const p2 = cps[(i + 1) % n];
    const p3 = cps[(i + 2) % n];
    for (let j = 0; j < SAMPLES_PER_SEGMENT; j++) {
      pts.push(catmullRom(p0, p1, p2, p3, j / SAMPLES_PER_SEGMENT));
    }
  }

  const m = pts.length;
  const x = new Float64Array(m);
  const y = new Float64Array(m);
  const s = new Float64Array(m);
  const ds = new Float64Array(m);
  const k = new Float64Array(m);
  const heading = new Float64Array(m);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < m; i++) {
    x[i] = pts[i].x;
    y[i] = pts[i].y;
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }

  let acc = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    ds[i] = Math.hypot(dx, dy);
    heading[i] = Math.atan2(dy, dx);
    s[i] = acc;
    acc += ds[i];
  }

  // Curvature via circumradius of three consecutive samples.
  for (let i = 0; i < m; i++) {
    const a = (i - 1 + m) % m;
    const c = (i + 1) % m;
    const ax = x[a];
    const ay = y[a];
    const bx = x[i];
    const by = y[i];
    const cx = x[c];
    const cy = y[c];
    const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5;
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const l3 = Math.hypot(cx - ax, cy - ay);
    const denom = l1 * l2 * l3;
    k[i] = denom > 1e-6 ? (4 * area) / denom : 0;
  }

  // Light smoothing so the profile does not chatter.
  const ks = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let o = -3; o <= 3; o++) sum += k[(i + o + m) % m];
    ks[i] = sum / 7;
  }

  return {
    def,
    x,
    y,
    s,
    ds,
    k: ks,
    heading,
    length: acc,
    bounds: { minX, maxX, minY, maxY },
  };
}

export const TRACKS: TrackDef[] = [
  {
    id: "aurora",
    name: "Aurora Ring",
    location: "Reference circuit · 5.1 km",
    sectorSplits: [0.34, 0.68],
    drsZones: [
      [0.9, 0.08],
      [0.42, 0.5],
    ],
    control: [
      { x: 0, y: 0 },
      { x: 380, y: 10 },
      { x: 700, y: 60 },
      { x: 880, y: 220 },
      { x: 820, y: 420 },
      { x: 610, y: 470 },
      { x: 470, y: 380 },
      { x: 520, y: 240 },
      { x: 400, y: 200 },
      { x: 250, y: 300 },
      { x: 260, y: 520 },
      { x: 430, y: 680 },
      { x: 720, y: 760 },
      { x: 940, y: 700 },
      { x: 1050, y: 520 },
      { x: 1120, y: 300 },
      { x: 1260, y: 260 },
      { x: 1360, y: 420 },
      { x: 1300, y: 640 },
      { x: 1080, y: 860 },
      { x: 740, y: 980 },
      { x: 380, y: 980 },
      { x: 90, y: 860 },
      { x: -120, y: 620 },
      { x: -180, y: 340 },
      { x: -110, y: 120 },
    ],
  },
  {
    id: "sprint",
    name: "Vector Sprint",
    location: "Short technical · 2.6 km",
    sectorSplits: [0.36, 0.7],
    drsZones: [[0.86, 0.1]],
    control: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 520, y: 90 },
      { x: 560, y: 300 },
      { x: 400, y: 400 },
      { x: 220, y: 330 },
      { x: 160, y: 470 },
      { x: 320, y: 600 },
      { x: 560, y: 600 },
      { x: 700, y: 440 },
      { x: 700, y: 200 },
      { x: 560, y: -120 },
      { x: 240, y: -200 },
      { x: -60, y: -120 },
    ],
  },
];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
