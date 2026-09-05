import { Canvas } from "@react-three/fiber";
import {
  Environment,
  Grid,
  Html,
  Lightformer,
  OrbitControls,
  ContactShadows,
  useGLTF,
} from "@react-three/drei";
import { Suspense, useMemo, useState } from "react";
import * as THREE from "three";

import { cn } from "@/lib/utils";
import type { PartDef, VehicleDef } from "@/lib/telemetry/vehicles";

const BODY_COLORS: Record<string, string> = {
  amber: "#c2410c",
  sky: "#1e4d6b",
  emerald: "#1f4d3d",
};

function CarModel({ vehicle, setup }: { vehicle: VehicleDef; setup: Record<string, number> }) {
  const { scene } = useGLTF(vehicle.model);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    const body = new THREE.MeshStandardMaterial({
      color: BODY_COLORS[vehicle.accent] ?? "#2b3138",
      metalness: 0.55,
      roughness: 0.35,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: "#15181b",
      metalness: 0.05,
      roughness: 0.85,
    });
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const isWheel = /wheel|tyre|tire/i.test(m.name) || /wheel/i.test(m.parent?.name ?? "");
        m.material = isWheel ? rubber : body;
      }
    });
    return c;
  }, [scene, vehicle.accent]);

  const rideDefault = vehicle.setup.find((s) => s.id === "rideHeight")?.default ?? 40;
  const ride = setup["rideHeight"] ?? rideDefault;
  const dy = (ride - rideDefault) / 900;
  const camber = setup["camber"] ?? 0;

  return (
    <primitive
      object={cloned}
      rotation={[0, 0, THREE.MathUtils.degToRad(camber * 0.15)]}
      position={[0, dy, 0]}
      scale={vehicle.modelScale}
    />
  );
}


function WingPlate({
  position,
  angle,
  width,
  chord,
  color,
}: {
  position: [number, number, number];
  angle: number;
  width: number;
  chord: number;
  color: string;
}) {
  return (
    <mesh position={position} rotation={[THREE.MathUtils.degToRad(-angle), 0, 0]} castShadow>
      <boxGeometry args={[width, 0.02, chord]} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.45} />
    </mesh>
  );
}

function Hotspot({
  part,
  active,
  onSelect,
}: {
  part: PartDef;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const show = active || hover;
  return (
    <group position={part.hotspot}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(part.id);
        }}
      >
        <sphereGeometry args={[show ? 0.065 : 0.045, 16, 16]} />
        <meshBasicMaterial
          color={active ? "#ffb020" : hover ? "#ffd98a" : "#ffb020"}
          transparent
          opacity={show ? 1 : 0.6}
        />

      </mesh>
      {show ? (
        <Html center distanceFactor={4.5} zIndexRange={[20, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-sm border border-primary/60 bg-background/90 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
            {part.name}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

export function CarViewer({
  vehicle,
  setup,
  selectedPart,
  onSelectPart,
  className,
}: {
  vehicle: VehicleDef;
  setup: Record<string, number>;
  selectedPart: string | null;
  onSelectPart: (id: string) => void;
  className?: string;
}) {
  const front = setup["frontWing"];
  const rear = setup["rearWing"];

  return (
    <div className={cn("relative h-full w-full", className)}>
      <Canvas shadows camera={{ position: [3.2, 1.9, 3.4], fov: 42 }} dpr={[1, 1.75]}>
        <color attach="background" args={["#0b0d0f"]} />
        <fog attach="fog" args={["#0b0d0f", 12, 34]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[5, 8, 4]}
          intensity={2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <spotLight position={[-4, 5, -3]} angle={0.8} intensity={40} color="#ff9a3c" />
        <Suspense fallback={null}>
          <Environment>
            <Lightformer intensity={2.2} position={[0, 5, 1]} scale={[9, 9, 1]} />
            <Lightformer intensity={1.1} color="#7f8fa0" position={[-5, 2, -2]} rotation-y={Math.PI / 2} scale={[16, 2, 1]} />
            <Lightformer intensity={0.9} color="#ffb020" position={[5, 2, 2]} rotation-y={-Math.PI / 2} scale={[16, 2, 1]} />
          </Environment>
          <group position={[0, 0, 0]}>
            <CarModel vehicle={vehicle} setup={setup} />
            {front !== undefined ? (
              <WingPlate position={[0, 0.16, 1.45]} angle={front} width={1.5} chord={0.34} color="#1c1f23" />
            ) : null}
            {rear !== undefined ? (
              <WingPlate position={[0, 0.82, -1.2]} angle={rear} width={1.1} chord={0.3} color="#22262b" />
            ) : null}
            {vehicle.parts.map((p) => (
              <Hotspot key={p.id} part={p} active={selectedPart === p.id} onSelect={onSelectPart} />
            ))}
          </group>
        </Suspense>
        <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={14} blur={2.4} far={4} />
        <Grid
          position={[0, 0, 0]}
          args={[30, 30]}
          cellSize={0.5}
          cellColor="#20262c"
          sectionSize={2.5}
          sectionColor="#3a4550"
          fadeDistance={22}
          infiniteGrid
        />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={2.4}
          maxDistance={9}
          maxPolarAngle={Math.PI / 2.15}
          target={[0, 0.4, 0]}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        drag to orbit · click a marker for part detail
      </div>
    </div>
  );
}
