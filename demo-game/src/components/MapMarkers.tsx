import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { MapMarker } from "../types";

export function MapMarkers({
  markers,
  selectedId,
}: {
  markers: MapMarker[];
  selectedId?: string;
}) {
  if (!markers.length) return null;

  return (
    <group>
      {markers.map((marker) => {
        const selected = marker.id === selectedId;
        return (
          <group key={marker.id} position={marker.position}>
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array([0, -0.42, 0, 0, 0.42, 0]), 3]}
                  count={2}
                />
              </bufferGeometry>
              <lineBasicMaterial
                color={selected ? "#ffffff" : "#4aa8ff"}
                transparent
                opacity={selected ? 0.9 : 0.64}
                depthWrite={false}
              />
            </line>
            <mesh renderOrder={17}>
              <sphereGeometry args={[selected ? 0.095 : 0.07, 14, 14]} />
              <meshBasicMaterial
                color={selected ? "#ffffff" : "#4aa8ff"}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <Html
              center
              distanceFactor={7}
              position={[0, 0.62, 0]}
              className={`marker-label ${selected ? "is-selected" : ""}`}
            >
              {marker.label}
            </Html>
          </group>
        );
      })}
    </group>
  );
}
