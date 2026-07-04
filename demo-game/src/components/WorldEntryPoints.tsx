import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GameMode, WorldEntryPoint } from "../types";

export function WorldEntryPoints({
  entries,
  playerRef,
  mode,
  onEnter,
}: {
  entries: WorldEntryPoint[];
  playerRef: React.MutableRefObject<THREE.Vector3>;
  mode: GameMode;
  onEnter: (entry: WorldEntryPoint) => void;
}) {
  useFrame(() => {
    if (mode !== "playing" || entries.length === 0) return;
    for (const entry of entries) {
      if (entry.enabled === false) continue;
      const dx = playerRef.current.x - entry.position[0];
      const dy = playerRef.current.y - entry.position[1];
      const dz = playerRef.current.z - entry.position[2];
      const radius = Math.max(0.3, entry.radius);
      if (dx * dx + dy * dy + dz * dz <= radius * radius) {
        onEnter(entry);
        break;
      }
    }
  });

  if (!entries.length) return null;

  return (
    <group>
      {entries.filter((entry) => entry.enabled !== false).map((entry) => (
        <group key={entry.id} position={entry.position}>
          <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={16}>
            <torusGeometry args={[Math.max(0.18, entry.radius * 0.42), 0.012, 8, 36]} />
            <meshBasicMaterial color={entry.kind === "portal" ? "#61cfff" : entry.kind === "exit" ? "#ff5ec4" : "#ffb15c"} transparent opacity={0.74} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([0, -0.5, 0, 0, 0.7, 0]), 3]}
                count={2}
              />
            </bufferGeometry>
            <lineBasicMaterial color={entry.kind === "portal" ? "#61cfff" : entry.kind === "exit" ? "#ff5ec4" : "#ffb15c"} transparent opacity={0.72} depthWrite={false} />
          </line>
          <Html center distanceFactor={7} position={[0, 0.86, 0]} className="entry-label">
            {entry.label}
          </Html>
        </group>
      ))}
    </group>
  );
}
