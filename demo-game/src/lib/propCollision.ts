import type { CreativeProp, CreativePropKind, Vec3Tuple } from "../types";

export interface PropCollisionResult {
  position: Vec3Tuple;
  collided: boolean;
  prop?: CreativeProp;
}

const PLAYER_RADIUS = 0.22;

export function defaultPropCollidable(kind: CreativePropKind): boolean {
  return kind === "cube" || kind === "platform" || kind === "wall" || kind === "ramp";
}

function baseSize(kind: CreativePropKind): Vec3Tuple {
  if (kind === "platform") return [1.8, 0.18, 1.8];
  if (kind === "wall") return [1.8, 1.4, 0.18];
  if (kind === "ramp") return [1.5, 0.35, 1.4];
  if (kind === "portal") return [1.2, 1.2, 0.2];
  if (kind === "beacon") return [0.44, 1.05, 0.44];
  if (kind === "light") return [0.36, 0.36, 0.36];
  return [0.65, 0.65, 0.65];
}

function toLocal(point: Vec3Tuple, prop: CreativeProp): Vec3Tuple {
  const dx = point[0] - prop.position[0];
  const dy = point[1] - prop.position[1];
  const dz = point[2] - prop.position[2];
  const yaw = prop.rotation.y;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    dx * cos - dz * sin,
    dy,
    dx * sin + dz * cos,
  ];
}

function toWorld(local: Vec3Tuple, prop: CreativeProp): Vec3Tuple {
  const yaw = prop.rotation.y;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    prop.position[0] + local[0] * cos + local[2] * sin,
    prop.position[1] + local[1],
    prop.position[2] - local[0] * sin + local[2] * cos,
  ];
}

function propHalfExtents(prop: CreativeProp, radius: number): Vec3Tuple {
  const size = baseSize(prop.kind);
  return [
    (size[0] * prop.scale[0]) / 2 + radius,
    (size[1] * prop.scale[1]) / 2 + radius * 0.7,
    (size[2] * prop.scale[2]) / 2 + radius,
  ];
}

function propBlocksFlight(prop: CreativeProp): boolean {
  return prop.collidable ?? defaultPropCollidable(prop.kind);
}

function resolveOne(position: Vec3Tuple, prop: CreativeProp, radius: number): Vec3Tuple | undefined {
  const half = propHalfExtents(prop, radius);
  const local = toLocal(position, prop);
  const inside = Math.abs(local[0]) <= half[0]
    && Math.abs(local[1]) <= half[1]
    && Math.abs(local[2]) <= half[2];
  if (!inside) return undefined;

  const penetration = [
    half[0] - Math.abs(local[0]),
    half[1] - Math.abs(local[1]),
    half[2] - Math.abs(local[2]),
  ];
  let axis = 0;
  if (penetration[1] < penetration[axis]) axis = 1;
  if (penetration[2] < penetration[axis]) axis = 2;

  const resolved: Vec3Tuple = [local[0], local[1], local[2]];
  resolved[axis] = (local[axis] >= 0 ? 1 : -1) * (half[axis] + 0.002);
  return toWorld(resolved, prop);
}

export function resolvePropCollisions(
  position: Vec3Tuple,
  props: CreativeProp[] | undefined,
  floorId: string,
  radius = PLAYER_RADIUS,
): PropCollisionResult {
  let current: Vec3Tuple = [position[0], position[1], position[2]];
  let hit: CreativeProp | undefined;

  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const prop of props ?? []) {
      if (!prop.enabled || !propBlocksFlight(prop)) continue;
      if (prop.floorId && prop.floorId !== floorId) continue;
      const resolved = resolveOne(current, prop, radius);
      if (!resolved) continue;
      current = resolved;
      hit = prop;
      moved = true;
    }
    if (!moved) break;
  }

  return { position: current, collided: Boolean(hit), prop: hit };
}
