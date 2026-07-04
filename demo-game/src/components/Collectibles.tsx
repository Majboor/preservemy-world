import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CollectibleDef, GameMode } from "../types";

export function Collectibles({
  collectibles,
  collectedIds,
  playerRef,
  mode,
  onCollect,
}: {
  collectibles: CollectibleDef[];
  collectedIds: Set<string>;
  playerRef: React.MutableRefObject<THREE.Vector3>;
  mode: GameMode;
  onCollect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hitRadius = 0.48;

  const visibleCollectibles = useMemo(
    () => collectibles.filter((item) => !collectedIds.has(item.id)),
    [collectibles, collectedIds],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((child, index) => {
      const item = visibleCollectibles[index];
      if (!item) return;
      const bob = Math.sin(state.clock.elapsedTime * 2.4 + index) * 0.035;
      child.position.set(item.position[0], item.position[1] + bob, item.position[2]);
      child.rotation.z += delta * 1.6;
    });

    if (mode !== "playing") return;
    for (const item of visibleCollectibles) {
      const dx = playerRef.current.x - item.position[0];
      const dy = playerRef.current.y - item.position[1];
      const dz = playerRef.current.z - item.position[2];
      if (dx * dx + dy * dy + dz * dz <= hitRadius * hitRadius) {
        onCollect(item.id);
        break;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {visibleCollectibles.map((item) => (
        <mesh
          key={item.id}
          position={item.position}
          rotation={[item.pitch, item.yaw, 0]}
        >
          <torusGeometry args={[0.28, 0.018, 8, 28]} />
          <meshBasicMaterial color="#4cff76" transparent opacity={0.82} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
