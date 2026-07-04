import { useMemo } from "react";
import * as THREE from "three";
import type { PlayerSnapshot, SceneBundle, Vec3Tuple } from "../types";

function vector(tuple: Vec3Tuple): THREE.Vector3 {
  return new THREE.Vector3(tuple[0], tuple[1], tuple[2]);
}

function GuideLine({
  points,
  color,
  opacity = 0.72,
}: {
  points: THREE.Vector3[];
  color: string;
  opacity?: number;
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Line(geometry, material);
  }, [color, opacity, points]);

  return <primitive object={line} />;
}

export function AlignmentGuide({
  bundle,
  player,
  visible,
}: {
  bundle: SceneBundle;
  player: PlayerSnapshot;
  visible: boolean;
}) {
  const guide = useMemo(() => {
    const floorY = (bundle.activeFloor.yMin + bundle.activeFloor.yMax) / 2;
    const jet = new THREE.Vector3(player.x, player.y, player.z);
    const center = new THREE.Vector3(
      (bundle.bounds.lo[0] + bundle.bounds.hi[0]) / 2,
      floorY,
      (bundle.bounds.lo[2] + bundle.bounds.hi[2]) / 2,
    );
    const forward = new THREE.Vector3(
      -Math.sin(player.yaw),
      0,
      -Math.cos(player.yaw),
    );
    const headingEnd = jet.clone().addScaledVector(forward, 3.2);
    const edgeY = player.y;
    const frame = [
      new THREE.Vector3(bundle.bounds.lo[0], edgeY, bundle.bounds.lo[2]),
      new THREE.Vector3(bundle.bounds.hi[0], edgeY, bundle.bounds.lo[2]),
      new THREE.Vector3(bundle.bounds.hi[0], edgeY, bundle.bounds.hi[2]),
      new THREE.Vector3(bundle.bounds.lo[0], edgeY, bundle.bounds.hi[2]),
      new THREE.Vector3(bundle.bounds.lo[0], edgeY, bundle.bounds.lo[2]),
    ];
    const route = bundle.trajectory.map((pose) => vector(pose.position));

    return { center, connector: [jet, center], frame, heading: [jet, headingEnd], jet, route };
  }, [bundle, player.x, player.y, player.yaw, player.z]);

  if (!visible) return null;

  return (
    <group renderOrder={20}>
      <GuideLine points={guide.frame} color="#4cff76" opacity={0.5} />
      <GuideLine points={guide.connector} color="#ffffff" opacity={0.86} />
      <GuideLine points={guide.heading} color="#4aa8ff" opacity={0.95} />
      {guide.route.length > 1 && <GuideLine points={guide.route} color="#ff8a28" opacity={0.72} />}
      <mesh position={guide.center}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshBasicMaterial color="#4cff76" depthWrite={false} />
      </mesh>
      <mesh position={guide.jet}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshBasicMaterial color="#ffffff" depthWrite={false} />
      </mesh>
    </group>
  );
}
