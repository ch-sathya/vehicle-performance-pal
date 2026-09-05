import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Suspense, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import type { TrackGeometry } from "@/lib/telemetry/track";
import type { VehicleDef } from "@/lib/telemetry/vehicles";

const SCALE = 0.06; // metres of track -> scene units
const WIDTH = 14; // track width in metres

function useRibbon(geom: TrackGeometry) {
  return useMemo(() => {
    const n = geom.x.length;
    const pos = new Float32Array(n * 2 * 3 + 6);
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = i % n;
      const b = (i + 1) % n;
      const dx = geom.x[b]! - geom.x[a]!;
      const dy = geom.y[b]! - geom.y[a]!;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * (WIDTH / 2);
      const ny = (dx / len) * (WIDTH / 2);
      const o = i * 6;
      pos[o] = (geom.x[a]! + nx) * SCALE;
      pos[o + 1] = 0;
      pos[o + 2] = -(geom.y[a]! + ny) * SCALE;
      pos[o + 3] = (geom.x[a]! - nx) * SCALE;
      pos[o + 4] = 0;
      pos[o + 5] = -(geom.y[a]! - ny) * SCALE;
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [geom]);
}

function asphaltTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#26292d";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = `rgba(${120 + Math.random() * 60},${120 + Math.random() * 60},${125 + Math.random() * 60},${Math.random() * 0.16})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Car({
  vehicle,
  poseRef,
  chase,
}: {
  vehicle: VehicleDef;
  poseRef: RefObject<{ x: number; y: number; heading: number }>;
  chase: boolean;
}) {
  const { scene } = useGLTF(vehicle.model);
  const model = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef<THREE.Group>(null);
  const camTarget = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const p = poseRef.current;
    if (!p || !ref.current) return;
    const x = p.x * SCALE;
    const z = -p.y * SCALE;
    ref.current.position.set(x, 0.05, z);
    ref.current.rotation.y = p.heading + Math.PI / 2;

    if (chase) {
      const back = 5.5;
      const cx = x - Math.cos(p.heading) * back;
      const cz = z + Math.sin(p.heading) * back;
      const k = 1 - Math.exp(-4 * dt);
      camera.position.lerp(new THREE.Vector3(cx, 2.4, cz), k);
      camTarget.current.lerp(new THREE.Vector3(x, 0.6, z), k);
      camera.lookAt(camTarget.current);
    }
  });

  return (
    <group ref={ref}>
      <primitive object={model} scale={vehicle.modelScale * 1.6} />
    </group>
  );
}

/** Keeps the orbit target glued to the car so free-look stays centred on it. */
function OrbitFollow({
  poseRef,
  controls,
}: {
  poseRef: RefObject<{ x: number; y: number; heading: number }>;
  controls: RefObject<{ target: THREE.Vector3; update: () => void } | null>;
}) {
  useFrame(() => {
    const p = poseRef.current;
    const c = controls.current;
    if (!p || !c) return;
    c.target.set(p.x * SCALE, 0.5, -p.y * SCALE);
    c.update();
  });
  return null;
}

export function Track3D({
  geom,
  vehicle,
  poseRef,
}: {
  geom: TrackGeometry;
  vehicle: VehicleDef;
  poseRef: RefObject<{ x: number; y: number; heading: number }>;
}) {
  const [mode, setMode] = useState<"chase" | "orbit">("chase");
  const controls = useRef<any>(null);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows camera={{ position: [0, 14, 18], fov: 55 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#0a0c0e"]} />
        <fog attach="fog" args={["#0a0c0e", 30, 130]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[20, 30, 10]} intensity={1.6} castShadow />
        <Suspense fallback={null}>
          <Environment>
            <Lightformer intensity={1.8} position={[0, 12, 0]} scale={[30, 30, 1]} />
            <Lightformer intensity={0.8} color="#ffb020" position={[-20, 4, 0]} rotation-y={Math.PI / 2} scale={[40, 3, 1]} />
          </Environment>
          <TrackSurface geom={geom} />
          <Car vehicle={vehicle} poseRef={poseRef} chase={mode === "chase"} />
        </Suspense>
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#141a16" roughness={1} />
        </mesh>
        {mode === "orbit" ? (
          <>
            <OrbitControls
              ref={controls}
              makeDefault
              enablePan={false}
              minDistance={3}
              maxDistance={60}
              maxPolarAngle={Math.PI / 2.05}
            />
            <OrbitFollow poseRef={poseRef} controls={controls} />
          </>
        ) : null}
      </Canvas>
      <div className="absolute right-2 top-2 flex gap-1">
        {(["chase", "orbit"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-sm border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${
              mode === m
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-background/80 text-muted-foreground"
            }`}
          >
            {m === "chase" ? "chase cam" : "360° orbit"}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {mode === "chase" ? "camera follows the car" : "drag to look around · scroll to zoom"}
      </div>
    </div>
  );
}

function TrackSurface({ geom }: { geom: TrackGeometry }) {
  const ribbon = useRibbon(geom);
  const tex = useMemo(() => asphaltTexture(), []);
  return (
    <mesh geometry={ribbon} receiveShadow>
      <meshStandardMaterial map={tex} color="#4a4f55" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}
