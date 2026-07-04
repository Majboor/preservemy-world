import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3Tuple } from "../types";

interface GuideTarget {
  position: Vec3Tuple;
}

export function TargetGuide({
  playerRef,
  target,
  visible,
}: {
  playerRef: React.MutableRefObject<THREE.Vector3>;
  target?: GuideTarget;
  visible: boolean;
}) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    return next;
  }, []);

  const material = useMemo(() => new THREE.LineBasicMaterial({
    color: "#4cff76",
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  }), []);

  const line = useMemo(() => {
    const next = new THREE.Line(geometry, material);
    next.frustumCulled = false;
    return next;
  }, [geometry, material]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(() => {
    line.visible = Boolean(visible && target);
    if (!target || !visible) return;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const player = playerRef.current;
    attr.setXYZ(0, player.x, player.y, player.z);
    attr.setXYZ(1, target.position[0], target.position[1], target.position[2]);
    attr.needsUpdate = true;
  });

  if (!target || !visible) return null;

  return (
    <>
      <primitive object={line} renderOrder={18} />
      <group position={[target.position[0], target.position[1], target.position[2]]}>
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, -0.48, 0, 0, 0.48, 0]), 3]}
              count={2}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#4cff76" transparent opacity={0.86} depthWrite={false} />
        </line>
        <mesh position={[0, 0.58, 0]} renderOrder={20}>
          <sphereGeometry args={[0.075, 12, 12]} />
          <meshBasicMaterial color="#f5fff8" depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
