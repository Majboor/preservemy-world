import { useMemo } from "react";
import * as THREE from "three";
import type { EditorZone } from "../types";

const ZONE_COLORS: Record<EditorZone["type"], string> = {
  playable: "#48ff6a",
  blocked: "#ff4d5e",
  warning: "#ffb02e",
  cleanup: "#7a7a7a",
  respawn: "#7c6dff",
  entry: "#ffb15c",
  combat: "#ff5ec4",
  story: "#35d6ff",
};

function PolygonZone({ zone, color, opacity }: { zone: EditorZone; color: string; opacity: number }) {
  const y = (zone.lo[1] + zone.hi[1]) / 2;
  const points = zone.points ?? [];
  const shapeGeometry = useMemo(() => {
    if (points.length < 3) return undefined;
    const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point[0], point[2])));
    return new THREE.ShapeGeometry(shape);
  }, [points]);
  const lineGeometry = useMemo(() => {
    if (points.length < 3) return undefined;
    const closed = [...points, points[0]].map((point) => new THREE.Vector3(point[0], y + 0.01, point[2]));
    return new THREE.BufferGeometry().setFromPoints(closed);
  }, [points, y]);

  if (!shapeGeometry || !lineGeometry) return null;

  return (
    <group>
      <mesh geometry={shapeGeometry} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <line>
        <primitive attach="geometry" object={lineGeometry} />
        <lineBasicMaterial color={color} transparent opacity={0.86} />
      </line>
    </group>
  );
}

export function EditorZones({ zones }: { zones: EditorZone[] }) {
  const visible = zones.filter((zone) => zone.enabled && ["blocked", "warning", "cleanup", "respawn", "entry", "combat", "story"].includes(zone.type));
  if (!visible.length) return null;

  return (
    <group>
      {visible.map((zone) => {
        const size: [number, number, number] = [
          Math.max(0.05, zone.hi[0] - zone.lo[0]),
          Math.max(0.05, zone.hi[1] - zone.lo[1]),
          Math.max(0.05, zone.hi[2] - zone.lo[2]),
        ];
        const position: [number, number, number] = [
          (zone.lo[0] + zone.hi[0]) / 2,
          (zone.lo[1] + zone.hi[1]) / 2,
          (zone.lo[2] + zone.hi[2]) / 2,
        ];
        const color = ZONE_COLORS[zone.type];
        const opacity = zone.type === "cleanup" ? 0.22 : zone.type === "blocked" ? 0.26 : 0.16;

        if (zone.points && zone.points.length >= 3) {
          return <PolygonZone key={zone.id} zone={zone} color={color} opacity={opacity} />;
        }

        return (
          <group key={zone.id} position={position}>
            <mesh>
              <boxGeometry args={size} />
              <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
              <lineBasicMaterial color={color} transparent opacity={0.72} />
            </lineSegments>
          </group>
        );
      })}
    </group>
  );
}
