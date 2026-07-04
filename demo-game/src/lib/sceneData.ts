import type {
  AmbientSoundEmitter,
  AmbientSoundKind,
  CollisionFile,
  CollectibleDef,
  CombatConfig,
  CreativeProp,
  CreativePropKind,
  CreativeScript,
  CreativeScriptTrigger,
  EditorZone,
  GameConfig,
  GaussianLayer,
  SceneAlignmentConfig,
  SceneAlignment,
  SceneBounds,
  SceneBundle,
  SceneFloor,
  SceneManifest,
  StoryConfig,
  StoryPointType,
  TrajectoryFile,
  Vec3Tuple,
  WorldEntryPoint,
} from "../types";
import * as THREE from "three";
import { defaultPropCollidable } from "./propCollision";

const FALLBACK_PLY_URL = "https://dev.heyharoon.io/share_it/scene.ply";
const FALLBACK_PREVIEW_URL = "./loader-point-cloud.json";
const FALLBACK_TRAJECTORY_URL = "./trajectory.json";

const DEFAULT_BOUNDS: SceneBounds = {
  lo: [-6, -4, -26],
  hi: [10, 4, 11],
};

const PROP_KINDS: CreativePropKind[] = ["cube", "platform", "wall", "ramp", "light", "portal", "beacon"];
const SCRIPT_TRIGGERS: CreativeScriptTrigger[] = ["onStart", "onEnter", "onCollect", "onInteract", "onRespawn"];
const AMBIENT_SOUND_KINDS: AmbientSoundKind[] = ["bell", "bird", "electric", "beacon"];
const STORY_POINT_TYPES: StoryPointType[] = ["clue", "treasure", "checkpoint", "objective", "discovery", "start", "end"];

function asTuple(value: unknown, fallback: Vec3Tuple): Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const tuple = value.map(Number) as Vec3Tuple;
  return tuple.every(Number.isFinite) ? tuple : fallback;
}

function cloneTuple(tuple: Vec3Tuple): Vec3Tuple {
  return [tuple[0], tuple[1], tuple[2]];
}

function normalizeBounds(bounds: SceneBounds | undefined): SceneBounds | undefined {
  if (!bounds) return undefined;
  const lo = asTuple(bounds.lo, DEFAULT_BOUNDS.lo);
  const hi = asTuple(bounds.hi, DEFAULT_BOUNDS.hi);
  return {
    lo: [
      Math.min(lo[0], hi[0]),
      Math.min(lo[1], hi[1]),
      Math.min(lo[2], hi[2]),
    ],
    hi: [
      Math.max(lo[0], hi[0]),
      Math.max(lo[1], hi[1]),
      Math.max(lo[2], hi[2]),
    ],
  };
}

function normalizeFloors(floors: SceneFloor[] | undefined): SceneFloor[] | undefined {
  if (!floors?.length) return undefined;
  return floors.flatMap((floor, index) => {
    const yMin = Number(floor.yMin);
    const yMax = Number(floor.yMax);
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return [];
    return [{
      id: floor.id || `floor-${index + 1}`,
      label: floor.label || `Floor ${index + 1}`,
      yMin: Math.min(yMin, yMax),
      yMax: Math.max(yMin, yMax),
    }];
  });
}

function normalizeGaussianLayers(gaussians: GaussianLayer[] | undefined): GaussianLayer[] | undefined {
  if (!gaussians?.length) return undefined;
  const ids = gaussians.map((layer, index) => layer.id || `gaussian-${index + 1}`);
  const activeLayerId = ids[gaussians.findIndex((layer) => layer.active)] ?? ids[0];
  return gaussians.map((layer, index) => ({
    id: ids[index],
    label: layer.label || `Gaussian ${index + 1}`,
    plyUrl: layer.plyUrl || FALLBACK_PLY_URL,
    position: asTuple(layer.position, [0, 0, 0]),
    rotation: normalizeAlignment(layer.rotation),
    scale: Number.isFinite(layer.scale) && layer.scale > 0 ? layer.scale : 1,
    enabled: layer.enabled !== false,
    locked: layer.locked === true,
    active: ids[index] === activeLayerId,
    opacity: Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity ?? 1)) : undefined,
    floorMin: Number.isFinite(layer.floorMin) ? layer.floorMin : undefined,
    floorMax: Number.isFinite(layer.floorMax) ? layer.floorMax : undefined,
    collidable: layer.collidable === true,
    playable: layer.playable === true,
  }));
}

function normalizeEntryPoints(entryPoints: WorldEntryPoint[] | undefined): WorldEntryPoint[] | undefined {
  if (!entryPoints?.length) return undefined;
  return entryPoints.map((entry, index) => ({
    id: entry.id || `entry-${index + 1}`,
    label: entry.label || `Entry ${index + 1}`,
    kind: entry.kind === "exit" || entry.kind === "portal" ? entry.kind : "entry",
    position: asTuple(entry.position, [0, 0, 0]),
    yaw: normalizeAngle(Number(entry.yaw ?? 0)),
    floorId: entry.floorId || "unknown",
    radius: Number.isFinite(entry.radius) && entry.radius > 0 ? entry.radius : 1,
    enabled: entry.enabled !== false,
    targetEntryId: entry.targetEntryId,
    targetGaussianId: entry.targetGaussianId,
    targetPlyUrl: entry.targetPlyUrl,
  }));
}

function normalizeCreativeProps(creativeProps: CreativeProp[] | undefined): CreativeProp[] | undefined {
  if (!creativeProps?.length) return undefined;
  return creativeProps.map((prop, index) => ({
    id: prop.id || `prop-${index + 1}`,
    label: prop.label || `Prop ${index + 1}`,
    kind: PROP_KINDS.includes(prop.kind) ? prop.kind : "cube",
    assetUrl: typeof prop.assetUrl === "string" && prop.assetUrl.trim() ? prop.assetUrl.trim() : undefined,
    position: asTuple(prop.position, [0, 0, 0]),
    rotation: normalizeAlignment(prop.rotation),
    scale: asTuple(prop.scale, [1, 1, 1]).map((value) => Math.max(0.05, Math.abs(value))) as Vec3Tuple,
    color: /^#[0-9a-f]{6}$/i.test(prop.color) ? prop.color : "#ffb15c",
    enabled: prop.enabled !== false,
    collidable: prop.collidable ?? defaultPropCollidable(prop.kind),
    gameplayTag: typeof prop.gameplayTag === "string" && prop.gameplayTag.trim() ? prop.gameplayTag.trim() : undefined,
    scriptId: prop.scriptId,
    floorId: prop.floorId,
  }));
}

function normalizeCreativeScripts(scripts: CreativeScript[] | undefined): CreativeScript[] | undefined {
  if (!scripts?.length) return undefined;
  return scripts.map((script, index) => ({
    id: script.id || `script-${index + 1}`,
    label: script.label || `Script ${index + 1}`,
    enabled: script.enabled !== false,
    trigger: SCRIPT_TRIGGERS.includes(script.trigger) ? script.trigger : "onInteract",
    targetId: script.targetId,
    source: String(script.source ?? ""),
  }));
}

function normalizeAmbientSounds(ambientSounds: AmbientSoundEmitter[] | undefined): AmbientSoundEmitter[] | undefined {
  if (!ambientSounds?.length) return undefined;
  return ambientSounds.map((sound, index) => ({
    id: sound.id || `sound-${index + 1}`,
    label: sound.label || `Sound ${index + 1}`,
    kind: AMBIENT_SOUND_KINDS.includes(sound.kind) ? sound.kind : "bell",
    position: asTuple(sound.position, [0, 0, 0]),
    radius: Number.isFinite(sound.radius) && sound.radius > 0 ? sound.radius : 8,
    volume: Math.min(1, Math.max(0, Number.isFinite(sound.volume) ? sound.volume : 0.45)),
    intervalSeconds: Math.min(45, Math.max(1.2, Number.isFinite(sound.intervalSeconds) ? sound.intervalSeconds : 7)),
    enabled: sound.enabled !== false,
    floorId: sound.floorId,
  }));
}

function normalizeEditorZones(editorZones: EditorZone[] | undefined): EditorZone[] | undefined {
  if (!editorZones?.length) return undefined;
  return editorZones.flatMap((zone, index) => {
    const lo = asTuple(zone.lo, [0, 0, 0]);
    const hi = asTuple(zone.hi, [0, 0, 0]);
    const points = zone.points?.map((point) => asTuple(point, [0, 0, 0]));
    const xValues = points?.length ? points.map((point) => point[0]) : [lo[0], hi[0]];
    const zValues = points?.length ? points.map((point) => point[2]) : [lo[2], hi[2]];
    return [{
      id: zone.id || `zone-${index + 1}`,
      label: zone.label || `Zone ${index + 1}`,
      type: zone.type || "playable",
      lo: [
        Math.min(...xValues, lo[0], hi[0]),
        Math.min(lo[1], hi[1]),
        Math.min(...zValues, lo[2], hi[2]),
      ],
      hi: [
        Math.max(...xValues, lo[0], hi[0]),
        Math.max(lo[1], hi[1]),
        Math.max(...zValues, lo[2], hi[2]),
      ],
      points,
      floorId: zone.floorId,
      enabled: zone.enabled !== false,
    }];
  });
}

function normalizeCombatConfig(combat: CombatConfig | undefined): CombatConfig | undefined {
  if (!combat) return undefined;
  return {
    enabled: combat.enabled === true,
    teams: combat.teams === true,
    health: Number.isFinite(combat.health) && combat.health > 0 ? combat.health : 100,
    respawnDelay: Number.isFinite(combat.respawnDelay) && combat.respawnDelay >= 0 ? combat.respawnDelay : 3,
    scoreLimit: Number.isFinite(combat.scoreLimit) && combat.scoreLimit > 0 ? combat.scoreLimit : 20,
    roundSeconds: Number.isFinite(combat.roundSeconds) && combat.roundSeconds > 0 ? combat.roundSeconds : 300,
    weapons: combat.weapons?.length ? combat.weapons.map(String) : ["pulse-cannon"],
    observerSpawn: combat.observerSpawn ? asTuple(combat.observerSpawn, combat.observerSpawn) : undefined,
    respawnPoints: (combat.respawnPoints ?? []).map((point, index) => ({
      id: point.id || `respawn-${index + 1}`,
      label: point.label || `Respawn ${index + 1}`,
      position: asTuple(point.position, [0, 0, 0]),
      yaw: normalizeAngle(Number(point.yaw ?? 0)),
      team: point.team,
    })),
  };
}

function normalizeStoryConfig(story: StoryConfig | undefined): StoryConfig | undefined {
  if (!story) return undefined;
  return {
    enabled: story.enabled === true,
    title: story.title || "Story run",
    completionText: story.completionText,
    steps: (story.steps ?? []).map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      label: step.label || `Step ${index + 1}`,
      clue: step.clue || "",
      completion: step.completion || "manual",
      type: step.type && STORY_POINT_TYPES.includes(step.type) ? step.type : "clue",
      position: step.position ? asTuple(step.position, [0, 0, 0]) : undefined,
      floorId: step.floorId,
      radius: typeof step.radius === "number" && Number.isFinite(step.radius) && step.radius > 0 ? step.radius : undefined,
      hidden: step.hidden === true,
      markerId: step.markerId,
      spotId: step.spotId,
      entryId: step.entryId,
      routeIndex: Number.isFinite(step.routeIndex) ? step.routeIndex : undefined,
    })),
  };
}

function normalizeGameConfig(config: GameConfig | undefined): GameConfig | undefined {
  if (!config) return undefined;
  return {
    bounds: normalizeBounds(config.bounds),
    floors: normalizeFloors(config.floors),
    spawn: config.spawn ? asTuple(config.spawn, config.spawn) : undefined,
    spawnRotation: config.spawnRotation ? {
      yaw: normalizeAngle(Number(config.spawnRotation.yaw)),
      pitch: Number(config.spawnRotation.pitch ?? 0),
    } : undefined,
    collectibles: config.collectibles?.map((item, index) => ({
      id: item.id || `spot-${index + 1}`,
      label: item.label || `Spot ${index + 1}`,
      position: asTuple(item.position, [0, 0, 0]),
      yaw: Number.isFinite(item.yaw) ? item.yaw : 0,
      pitch: Number.isFinite(item.pitch) ? item.pitch : 0,
    })),
    markers: config.markers?.map((marker, index) => ({
      id: marker.id || `mark-${index + 1}`,
      label: marker.label || `Mark ${index + 1}`,
      position: asTuple(marker.position, [0, 0, 0]),
      yaw: Number.isFinite(marker.yaw) ? marker.yaw : 0,
      floorId: marker.floorId || "unknown",
      createdAt: marker.createdAt || new Date().toISOString(),
    })),
    trajectory: config.trajectory?.map((pose, index) => ({
      name: pose.name ?? `recorded-${index + 1}`,
      position: asTuple(pose.position, [0, 0, 0]),
      quaternion: pose.quaternion,
    })),
    gaussians: normalizeGaussianLayers(config.gaussians),
    entryPoints: normalizeEntryPoints(config.entryPoints),
    creativeProps: normalizeCreativeProps(config.creativeProps),
    scripts: normalizeCreativeScripts(config.scripts),
    ambientSounds: normalizeAmbientSounds(config.ambientSounds),
    editorZones: normalizeEditorZones(config.editorZones),
    combat: normalizeCombatConfig(config.combat),
    story: normalizeStoryConfig(config.story),
    deploy: config.deploy ? { ...config.deploy } : undefined,
    updatedAt: config.updatedAt,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

function resolveUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return value;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return new URL(value, baseUrl).toString();
}

function resolveManifestUrls(manifest: SceneManifest, baseUrl: string): SceneManifest {
  return {
    ...manifest,
    plyUrl: resolveUrl(manifest.plyUrl, baseUrl) ?? manifest.plyUrl,
    loaderPreviewUrl: resolveUrl(manifest.loaderPreviewUrl, baseUrl) ?? manifest.loaderPreviewUrl,
    trajectoryUrl: resolveUrl(manifest.trajectoryUrl, baseUrl) ?? manifest.trajectoryUrl,
    collisionUrl: resolveUrl(manifest.collisionUrl, baseUrl),
    gameConfig: manifest.gameConfig ? {
      ...manifest.gameConfig,
      gaussians: manifest.gameConfig.gaussians?.map((layer) => ({
        ...layer,
        plyUrl: resolveUrl(layer.plyUrl, baseUrl) ?? layer.plyUrl,
      })),
      entryPoints: manifest.gameConfig.entryPoints?.map((entry) => ({
        ...entry,
        targetPlyUrl: resolveUrl(entry.targetPlyUrl, baseUrl),
      })),
    } : undefined,
  };
}

async function loadManifest(): Promise<SceneManifest | null> {
  const manifestUrl = new URLSearchParams(window.location.search).get("manifest");
  if (manifestUrl) {
    try {
      const manifest = await fetchJson<SceneManifest>(manifestUrl);
      return resolveManifestUrls(manifest, manifestUrl);
    } catch (error) {
      console.warn("Remote scene manifest unavailable; falling back to local manifest.", error);
    }
  }
  try {
    return await fetchJson<SceneManifest>("./scene-manifest.json");
  } catch {
    return null;
  }
}

function deriveYawFromTrajectory(trajectory: TrajectoryFile["trajectory"]): number {
  if (!trajectory || trajectory.length < 2) return 0;
  const first = trajectory[0].position;
  const next = trajectory[Math.min(8, trajectory.length - 1)].position;
  const dx = next[0] - first[0];
  const dz = next[2] - first[2];
  return Math.atan2(-dx, -dz);
}

function createFallbackFloor(bounds: SceneBounds, spawn: Vec3Tuple): SceneFloor {
  const span = Math.max(0.1, bounds.hi[1] - bounds.lo[1]);
  const halfWindow = Math.min(Math.max(span * 0.18, 2.0), 4.5);
  const yMin = Math.max(bounds.lo[1], spawn[1] - halfWindow);
  const yMax = Math.min(bounds.hi[1], spawn[1] + halfWindow);
  return {
    id: "spawn-floor",
    label: "Current floor",
    yMin,
    yMax,
  };
}

function chooseActiveFloor(floors: SceneFloor[], spawn: Vec3Tuple, bounds: SceneBounds): SceneFloor {
  const containing = floors.find((floor) => spawn[1] >= floor.yMin && spawn[1] <= floor.yMax);
  return containing ?? floors[0] ?? createFallbackFloor(bounds, spawn);
}

function normalizeAngle(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function normalizeAlignment(alignment: SceneAlignmentConfig | undefined): SceneAlignment {
  const x = Number(alignment?.x ?? alignment?.pitch ?? 0);
  const y = Number(alignment?.y ?? alignment?.yaw ?? 0);
  const z = Number(alignment?.z ?? alignment?.roll ?? 0);
  return {
    x: normalizeAngle(x),
    y: normalizeAngle(y),
    z: normalizeAngle(z),
  };
}

function isIdentityAlignment(alignment: SceneAlignment): boolean {
  return Math.abs(alignment.x) < 0.00001
    && Math.abs(alignment.y) < 0.00001
    && Math.abs(alignment.z) < 0.00001;
}

function transformTuple(tuple: Vec3Tuple, alignment: SceneAlignment): Vec3Tuple {
  if (isIdentityAlignment(alignment)) return [...tuple];
  const vector = new THREE.Vector3(tuple[0], tuple[1], tuple[2]);
  vector.applyEuler(new THREE.Euler(alignment.x, alignment.y, alignment.z, "XYZ"));
  return [vector.x, vector.y, vector.z];
}

function transformYaw(rawYaw: number, alignment: SceneAlignment): number {
  const forward = transformTuple([-Math.sin(rawYaw), 0, -Math.cos(rawYaw)], alignment);
  return normalizeAngle(Math.atan2(-forward[0], -forward[2]));
}

function transformBounds(bounds: SceneBounds, alignment: SceneAlignment): SceneBounds {
  if (isIdentityAlignment(alignment)) {
    return { lo: [...bounds.lo], hi: [...bounds.hi] };
  }
  const rawCorners: Vec3Tuple[] = [
    [bounds.lo[0], bounds.lo[1], bounds.lo[2]],
    [bounds.lo[0], bounds.lo[1], bounds.hi[2]],
    [bounds.lo[0], bounds.hi[1], bounds.lo[2]],
    [bounds.lo[0], bounds.hi[1], bounds.hi[2]],
    [bounds.hi[0], bounds.lo[1], bounds.lo[2]],
    [bounds.hi[0], bounds.lo[1], bounds.hi[2]],
    [bounds.hi[0], bounds.hi[1], bounds.lo[2]],
    [bounds.hi[0], bounds.hi[1], bounds.hi[2]],
  ];
  const corners = rawCorners.map((corner) => transformTuple(corner, alignment));

  return corners.reduce<SceneBounds>((next, corner) => ({
    lo: [
      Math.min(next.lo[0], corner[0]),
      Math.min(next.lo[1], corner[1]),
      Math.min(next.lo[2], corner[2]),
    ],
    hi: [
      Math.max(next.hi[0], corner[0]),
      Math.max(next.hi[1], corner[1]),
      Math.max(next.hi[2], corner[2]),
    ],
  }), {
    lo: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    hi: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  });
}

function mergeAlignment(manifest?: SceneManifest | null): SceneAlignment {
  return normalizeAlignment(manifest?.alignment);
}

function alignFloors(
  floors: SceneFloor[],
  rawSpawn: Vec3Tuple,
  alignedSpawn: Vec3Tuple,
  alignment: SceneAlignment,
): SceneFloor[] {
  if (Math.abs(alignment.x) < 0.00001 && Math.abs(alignment.z) < 0.00001) {
    return floors.map((floor) => ({ ...floor }));
  }
  return floors.map((floor) => {
    const half = Math.max(0.1, (floor.yMax - floor.yMin) / 2);
    const rawCenter = (floor.yMin + floor.yMax) / 2;
    const center = alignedSpawn[1] + rawCenter - rawSpawn[1];
    return {
      ...floor,
      yMin: center - half,
      yMax: center + half,
    };
  });
}

export async function loadSceneBundle(): Promise<SceneBundle> {
  const manifest = await loadManifest();
  const hasAdminAlignment = Boolean(manifest?.alignment);
  const trajectoryUrl = manifest?.trajectoryUrl ?? FALLBACK_TRAJECTORY_URL;
  const trajectoryFile = await fetchJson<TrajectoryFile>(trajectoryUrl);

  const bounds = manifest?.bounds ?? trajectoryFile.bounds ?? DEFAULT_BOUNDS;
  const spawn = asTuple(
    manifest?.spawn ?? trajectoryFile.spawn,
    trajectoryFile.trajectory?.[0]?.position ?? [
      (bounds.lo[0] + bounds.hi[0]) / 2,
      (bounds.lo[1] + bounds.hi[1]) / 2,
      (bounds.lo[2] + bounds.hi[2]) / 2,
    ],
  );

  let collision: CollisionFile | undefined;
  if (manifest?.collisionUrl) {
    try {
      collision = await fetchJson<CollisionFile>(manifest.collisionUrl);
    } catch (error) {
      console.warn("Collision file unavailable; using fallback zones.", error);
    }
  }

  const floors = collision?.floors ?? manifest?.floors ?? [createFallbackFloor(bounds, spawn)];
  const activeFloor = chooseActiveFloor(floors, spawn, bounds);
  const yaw = manifest?.spawnRotation?.yaw
    ?? trajectoryFile.spawnRotation?.yaw
    ?? deriveYawFromTrajectory(trajectoryFile.trajectory);

  return {
    manifest: {
      plyUrl: manifest?.plyUrl ?? FALLBACK_PLY_URL,
      loaderPreviewUrl: manifest?.loaderPreviewUrl ?? FALLBACK_PREVIEW_URL,
      trajectoryUrl,
      bounds,
      spawn,
      spawnRotation: {
        yaw,
        pitch: manifest?.spawnRotation?.pitch ?? trajectoryFile.spawnRotation?.pitch ?? 0,
      },
      floors,
      collisionUrl: manifest?.collisionUrl,
      collectibleSeed: manifest?.collectibleSeed ?? "default-scene",
      alignment: mergeAlignment(manifest),
      gameConfig: normalizeGameConfig(manifest?.gameConfig),
    },
    trajectory: trajectoryFile.trajectory ?? [],
    bounds,
    spawn,
    spawnRotation: {
      yaw,
      pitch: manifest?.spawnRotation?.pitch ?? trajectoryFile.spawnRotation?.pitch ?? 0,
    },
    floors,
    activeFloor,
    collision,
    alignment: mergeAlignment(manifest),
    hasAdminAlignment,
    gameConfig: normalizeGameConfig(manifest?.gameConfig),
  };
}

export function alignSceneBundle(bundle: SceneBundle, alignment: SceneAlignment): SceneBundle {
  const effectiveAlignment = normalizeAlignment(alignment);
  if (isIdentityAlignment(effectiveAlignment)) {
    return {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        bounds: { lo: [...bundle.bounds.lo], hi: [...bundle.bounds.hi] },
        spawn: [...bundle.spawn],
        spawnRotation: {
          ...bundle.spawnRotation,
          yaw: normalizeAngle(bundle.spawnRotation.yaw),
        },
        floors: bundle.floors.map((floor) => ({ ...floor })),
        alignment: { x: 0, y: 0, z: 0 },
        gameConfig: bundle.gameConfig,
      },
      bounds: { lo: [...bundle.bounds.lo], hi: [...bundle.bounds.hi] },
      spawn: [...bundle.spawn],
      spawnRotation: {
        ...bundle.spawnRotation,
        yaw: normalizeAngle(bundle.spawnRotation.yaw),
      },
      trajectory: bundle.trajectory.map((pose) => ({
        ...pose,
        position: [...pose.position],
      })),
      floors: bundle.floors.map((floor) => ({ ...floor })),
      activeFloor: { ...bundle.activeFloor },
      alignment: { x: 0, y: 0, z: 0 },
      gameConfig: bundle.gameConfig,
    };
  }

  const bounds = transformBounds(bundle.bounds, effectiveAlignment);
  const spawn = transformTuple(bundle.spawn, effectiveAlignment);
  const floors = alignFloors(bundle.floors, bundle.spawn, spawn, effectiveAlignment);
  const activeFloor = chooseActiveFloor(floors, spawn, bounds);
  const trajectory = bundle.trajectory.map((pose) => ({
    ...pose,
    position: transformTuple(pose.position, effectiveAlignment),
  }));
  const collision = bundle.collision ? {
    ...bundle.collision,
    bounds: bundle.collision.bounds ? transformBounds(bundle.collision.bounds, effectiveAlignment) : undefined,
    floors,
    safeZones: bundle.collision.safeZones?.map((zone) => ({
      ...zone,
      ...transformBounds({ lo: zone.lo, hi: zone.hi }, effectiveAlignment),
    })),
  } : undefined;

  return {
    ...bundle,
    manifest: {
      ...bundle.manifest,
      bounds,
      spawn,
      spawnRotation: {
        ...bundle.spawnRotation,
        yaw: transformYaw(bundle.spawnRotation.yaw, effectiveAlignment),
      },
      floors,
      alignment: effectiveAlignment,
      gameConfig: bundle.gameConfig,
    },
    trajectory,
    bounds,
    spawn,
    spawnRotation: {
      ...bundle.spawnRotation,
      yaw: transformYaw(bundle.spawnRotation.yaw, effectiveAlignment),
    },
    floors,
    activeFloor,
    collision,
    alignment: effectiveAlignment,
    gameConfig: bundle.gameConfig,
  };
}

export function applyGameConfig(bundle: SceneBundle, config: GameConfig | undefined): SceneBundle {
  const normalized = normalizeGameConfig(config);
  if (!normalized) return bundle;
  const bounds = normalized.bounds ? {
    lo: cloneTuple(normalized.bounds.lo),
    hi: cloneTuple(normalized.bounds.hi),
  } : {
    lo: cloneTuple(bundle.bounds.lo),
    hi: cloneTuple(bundle.bounds.hi),
  };
  const floors = normalized.floors?.length
    ? normalized.floors.map((floor) => ({ ...floor }))
    : bundle.floors.map((floor) => ({ ...floor }));
  const spawn = normalized.spawn ? cloneTuple(normalized.spawn) : cloneTuple(bundle.spawn);
  const spawnRotation = normalized.spawnRotation ? {
    yaw: normalized.spawnRotation.yaw,
    pitch: normalized.spawnRotation.pitch ?? bundle.spawnRotation.pitch,
  } : { ...bundle.spawnRotation };
  const trajectory = normalized.trajectory?.length ? normalized.trajectory : bundle.trajectory;
  const activeFloor = chooseActiveFloor(floors, spawn, bounds);

  return {
    ...bundle,
    manifest: {
      ...bundle.manifest,
      bounds,
      spawn,
      spawnRotation,
      floors,
      gameConfig: normalized,
    },
    bounds,
    floors,
    spawn,
    spawnRotation,
    trajectory,
    activeFloor,
    gameConfig: normalized,
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distanceSq(a: Vec3Tuple, b: Vec3Tuple): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

export function generateCollectibles(bundle: SceneBundle, count = 12): CollectibleDef[] {
  if (bundle.gameConfig?.collectibles?.length) {
    return bundle.gameConfig.collectibles.map((item) => ({
      ...item,
      position: cloneTuple(item.position),
    }));
  }
  const seed = `${bundle.manifest.collectibleSeed ?? "scene"}:${bundle.bounds.lo.join(",")}:${bundle.bounds.hi.join(",")}`;
  const random = mulberry32(hashSeed(seed));
  const { bounds, activeFloor, spawn } = bundle;
  const insetX = Math.max(0.4, (bounds.hi[0] - bounds.lo[0]) * 0.08);
  const insetZ = Math.max(0.4, (bounds.hi[2] - bounds.lo[2]) * 0.08);
  const yMin = activeFloor.yMin + Math.min(0.45, Math.max(0, (activeFloor.yMax - activeFloor.yMin) * 0.15));
  const yMax = activeFloor.yMax - Math.min(0.45, Math.max(0, (activeFloor.yMax - activeFloor.yMin) * 0.15));
  const minSpacingSq = 1.0;
  const minSpawnSq = 1.6;
  const items: CollectibleDef[] = [];

  for (let attempts = 0; attempts < 800 && items.length < count; attempts += 1) {
    const position: Vec3Tuple = [
      lerp(bounds.lo[0] + insetX, bounds.hi[0] - insetX, random()),
      lerp(yMin, Math.max(yMin, yMax), random()),
      lerp(bounds.lo[2] + insetZ, bounds.hi[2] - insetZ, random()),
    ];

    if (distanceSq(position, spawn) < minSpawnSq) continue;
    if (items.some((item) => distanceSq(item.position, position) < minSpacingSq)) continue;

    items.push({
      id: `ring-${items.length + 1}`,
      position,
      yaw: random() * Math.PI * 2,
      pitch: (random() - 0.5) * 0.5,
    });
  }

  return items;
}

export function clampToSafeZone(
  position: Vec3Tuple,
  bounds: SceneBounds,
  activeFloor: SceneFloor,
  editorZones: EditorZone[] = [],
): { position: Vec3Tuple; clamped: boolean; reason?: string } {
  const next: Vec3Tuple = [...position];
  let clamped = false;
  let reason: string | undefined;

  if (next[0] < bounds.lo[0]) { next[0] = bounds.lo[0]; clamped = true; reason = "Boundary"; }
  if (next[0] > bounds.hi[0]) { next[0] = bounds.hi[0]; clamped = true; reason = "Boundary"; }
  if (next[2] < bounds.lo[2]) { next[2] = bounds.lo[2]; clamped = true; reason = "Boundary"; }
  if (next[2] > bounds.hi[2]) { next[2] = bounds.hi[2]; clamped = true; reason = "Boundary"; }
  if (next[1] < activeFloor.yMin) { next[1] = activeFloor.yMin; clamped = true; reason = "Floor limit"; }
  if (next[1] > activeFloor.yMax) { next[1] = activeFloor.yMax; clamped = true; reason = "Floor limit"; }

  const zones = editorZones.filter((zone) => zone.enabled);
  const playableZones = zones.filter((zone) => zone.type === "playable");
  const blockedZones = zones.filter((zone) => zone.type === "blocked");

  if (playableZones.length && !playableZones.some((zone) => pointInEditorZone(next, zone))) {
    const nearest = playableZones
      .map((zone) => {
        const clampedPosition = clampToEditorZone(next, zone);
        return { position: clampedPosition, distance: distanceSq(next, clampedPosition) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest) {
      next[0] = nearest.position[0];
      next[1] = nearest.position[1];
      next[2] = nearest.position[2];
      clamped = true;
      reason = "Playable area";
    }
  }

  for (const zone of blockedZones) {
    if (!pointInEditorZone(next, zone)) continue;
    const pushed = pushOutOfEditorZone(next, zone);
    next[0] = pushed[0];
    next[1] = pushed[1];
    next[2] = pushed[2];
    clamped = true;
    reason = "Blocked area";
    break;
  }

  return { position: next, clamped, reason };
}

export function isHardEscape(position: Vec3Tuple, bounds: SceneBounds, activeFloor: SceneFloor, editorZones: EditorZone[] = []): boolean {
  const margin = 1.2;
  const outsideBounds = position[0] < bounds.lo[0] - margin
    || position[0] > bounds.hi[0] + margin
    || position[2] < bounds.lo[2] - margin
    || position[2] > bounds.hi[2] + margin
    || position[1] < activeFloor.yMin - margin
    || position[1] > activeFloor.yMax + margin;
  if (outsideBounds) return true;

  const playableZones = editorZones.filter((zone) => zone.enabled && zone.type === "playable");
  if (!playableZones.length) return false;
  return !playableZones.some((zone) => pointInEditorZone(position, expandEditorZone(zone, margin)));
}

function pointInEditorZone(point: Vec3Tuple, zone: EditorZone): boolean {
  const insideY = point[1] >= zone.lo[1] && point[1] <= zone.hi[1];
  if (!insideY) return false;
  if (zone.points && zone.points.length >= 3) {
    return pointInPolygonXZ(point, zone.points);
  }
  return point[0] >= zone.lo[0]
    && point[0] <= zone.hi[0]
    && point[2] >= zone.lo[2]
    && point[2] <= zone.hi[2];
}

function pointInPolygonXZ(point: Vec3Tuple, polygon: Vec3Tuple[]): boolean {
  let inside = false;
  const x = point[0];
  const z = point[2];
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const xi = currentPoint[0];
    const zi = currentPoint[2];
    const xj = previousPoint[0];
    const zj = previousPoint[2];
    const intersects = ((zi > z) !== (zj > z))
      && x < ((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function clampToEditorZone(point: Vec3Tuple, zone: EditorZone): Vec3Tuple {
  return [
    Math.min(zone.hi[0], Math.max(zone.lo[0], point[0])),
    Math.min(zone.hi[1], Math.max(zone.lo[1], point[1])),
    Math.min(zone.hi[2], Math.max(zone.lo[2], point[2])),
  ];
}

function pushOutOfEditorZone(point: Vec3Tuple, zone: EditorZone): Vec3Tuple {
  const epsilon = 0.06;
  const faces = [
    { axis: 0 as const, value: zone.lo[0] - epsilon, distance: Math.abs(point[0] - zone.lo[0]) },
    { axis: 0 as const, value: zone.hi[0] + epsilon, distance: Math.abs(zone.hi[0] - point[0]) },
    { axis: 1 as const, value: zone.lo[1] - epsilon, distance: Math.abs(point[1] - zone.lo[1]) },
    { axis: 1 as const, value: zone.hi[1] + epsilon, distance: Math.abs(zone.hi[1] - point[1]) },
    { axis: 2 as const, value: zone.lo[2] - epsilon, distance: Math.abs(point[2] - zone.lo[2]) },
    { axis: 2 as const, value: zone.hi[2] + epsilon, distance: Math.abs(zone.hi[2] - point[2]) },
  ].sort((a, b) => a.distance - b.distance);
  const next: Vec3Tuple = [...point];
  next[faces[0].axis] = faces[0].value;
  return next;
}

function expandEditorZone(zone: EditorZone, margin: number): EditorZone {
  return {
    ...zone,
    lo: [zone.lo[0] - margin, zone.lo[1] - margin, zone.lo[2] - margin],
    hi: [zone.hi[0] + margin, zone.hi[1] + margin, zone.hi[2] + margin],
  };
}
