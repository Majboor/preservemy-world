import { useEffect, useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import type { CreativeProp } from "../types";

function GlbPropModel({ prop }: { prop: CreativeProp }) {
  const [scene, setScene] = useState<THREE.Group | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!prop.assetUrl) return undefined;
    let cancelled = false;
    setScene(undefined);
    setFailed(false);
    new GLTFLoader().load(
      prop.assetUrl,
      (gltf) => {
        if (cancelled) return;
        setScene(gltf.scene);
      },
      undefined,
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [prop.assetUrl]);

  const cloned = useMemo(() => scene?.clone(true), [scene]);

  if (cloned) return <primitive object={cloned} />;

  return (
    <mesh>
      <boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshStandardMaterial color={failed ? "#ff4d5e" : prop.color} wireframe={failed} roughness={0.7} />
    </mesh>
  );
}

type PropPointerHandler = (prop: CreativeProp, event: ThreeEvent<PointerEvent>) => void;

function PropMesh({ prop, onPointerDown }: { prop: CreativeProp; onPointerDown?: PropPointerHandler }) {
  const rotation: [number, number, number] = [prop.rotation.x, prop.rotation.y, prop.rotation.z];
  const scale: [number, number, number] = [prop.scale[0], prop.scale[1], prop.scale[2]];
  const handlePointerDown = onPointerDown
    ? (event: ThreeEvent<PointerEvent>) => onPointerDown(prop, event)
    : undefined;

  if (!prop.enabled) return null;

  if (prop.assetUrl) {
    return (
      <group position={prop.position} rotation={rotation} scale={scale} onPointerDown={handlePointerDown}>
        <GlbPropModel prop={prop} />
      </group>
    );
  }

  if (prop.kind === "light") {
    return (
      <group position={prop.position} rotation={rotation} scale={scale} onPointerDown={handlePointerDown}>
        <pointLight color={prop.color} intensity={2.2} distance={5} />
        <mesh>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshBasicMaterial color={prop.color} toneMapped={false} />
        </mesh>
      </group>
    );
  }

  if (prop.kind === "portal") {
    return (
      <group position={prop.position} rotation={rotation} scale={scale} onPointerDown={handlePointerDown}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.045, 12, 36]} />
          <meshBasicMaterial color={prop.color} toneMapped={false} />
        </mesh>
        <pointLight color={prop.color} intensity={1.2} distance={3} />
      </group>
    );
  }

  if (prop.kind === "beacon") {
    return (
      <group position={prop.position} rotation={rotation} scale={scale} onPointerDown={handlePointerDown}>
        <mesh>
          <cylinderGeometry args={[0.14, 0.22, 0.85, 14]} />
          <meshStandardMaterial color={prop.color} metalness={0.35} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.52, 0]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial color={prop.color} toneMapped={false} />
        </mesh>
      </group>
    );
  }

  if (prop.kind === "ramp") {
    return (
      <mesh position={prop.position} rotation={[rotation[0] - 0.45, rotation[1], rotation[2]]} scale={scale} onPointerDown={handlePointerDown}>
        <boxGeometry args={[1.5, 0.18, 1.4]} />
        <meshStandardMaterial color={prop.color} roughness={0.68} metalness={0.08} />
      </mesh>
    );
  }

  const args: [number, number, number] = prop.kind === "platform"
    ? [1.8, 0.18, 1.8]
    : prop.kind === "wall"
      ? [1.8, 1.4, 0.18]
      : [0.65, 0.65, 0.65];

  return (
    <mesh position={prop.position} rotation={rotation} scale={scale} onPointerDown={handlePointerDown}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={prop.color} roughness={0.72} metalness={0.04} />
    </mesh>
  );
}

export function CreativeProps({ props = [], onPropPointerDown }: { props?: CreativeProp[]; onPropPointerDown?: PropPointerHandler }) {
  if (!props.length) return null;
  return (
    <group>
      {props.map((prop) => <PropMesh key={prop.id} prop={prop} onPointerDown={onPropPointerDown} />)}
    </group>
  );
}
