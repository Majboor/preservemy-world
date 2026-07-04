import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { RemotePlayerSnapshot } from "../types";

export function RemotePlayers({ players }: { players: RemotePlayerSnapshot[] }) {
  return (
    <group>
      {players.map((player) => {
        const color = player.role === "observer" ? "#9d7cd8" : player.alive === false ? "#ff4d5e" : player.color ?? "#00ffd2";
        const opacity = player.alive === false ? 0.38 : player.role === "observer" ? 0.58 : 0.84;
        return (
          <group
            key={player.id}
            position={[player.x, player.y, player.z]}
            rotation={[0, player.yaw, 0]}
          >
            <mesh position={[0, 0.06, 0]}>
              <coneGeometry args={[0.16, 0.36, 3]} />
              <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, -0.16, 0]}>
              <ringGeometry args={[0.18, 0.2, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0.34} side={THREE.DoubleSide} />
            </mesh>
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array([0, 0.02, 0, 0, 0.02, -0.55]), 3]}
                  count={2}
                />
              </bufferGeometry>
              <lineBasicMaterial color={color} transparent opacity={opacity} />
            </line>
            <Html center distanceFactor={8} position={[0, 0.48, 0]} className="remote-player-label">
              {player.role === "observer" ? "Observer" : player.id.slice(0, 5)}
            </Html>
          </group>
        );
      })}
    </group>
  );
}
