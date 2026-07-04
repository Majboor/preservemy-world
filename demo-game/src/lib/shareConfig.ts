import type { GameConfig, MapMarker, PlayerSnapshot, TrajectoryPose, Vec3Tuple } from "../types";

const HASH_KEY = "scene=";

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function tupleFromPlayer(player: PlayerSnapshot): Vec3Tuple {
  return [player.x, player.y, player.z];
}

function cleanConfig(config: GameConfig): GameConfig {
  return {
    bounds: config.bounds ? {
      lo: [...config.bounds.lo],
      hi: [...config.bounds.hi],
    } : undefined,
    floors: config.floors?.map((floor) => ({
      id: floor.id,
      label: floor.label,
      yMin: floor.yMin,
      yMax: floor.yMax,
    })),
    spawn: config.spawn ? [...config.spawn] : undefined,
    spawnRotation: config.spawnRotation ? { ...config.spawnRotation } : undefined,
    collectibles: config.collectibles?.map((item) => ({
      id: item.id,
      label: item.label,
      position: [...item.position],
      yaw: item.yaw,
      pitch: item.pitch,
    })),
    markers: config.markers?.map((marker) => ({
      id: marker.id,
      label: marker.label,
      position: [...marker.position],
      yaw: marker.yaw,
      floorId: marker.floorId,
      createdAt: marker.createdAt,
    })),
    trajectory: config.trajectory?.map((pose) => ({
      name: pose.name,
      position: [...pose.position],
      quaternion: pose.quaternion,
    })),
    gaussians: config.gaussians?.map((layer) => ({
      id: layer.id,
      label: layer.label,
      plyUrl: layer.plyUrl,
      position: [...layer.position],
      rotation: { ...layer.rotation },
      scale: layer.scale,
      enabled: layer.enabled,
      locked: layer.locked,
      active: layer.active,
      opacity: layer.opacity,
      floorMin: layer.floorMin,
      floorMax: layer.floorMax,
      collidable: layer.collidable,
      playable: layer.playable,
    })),
    entryPoints: config.entryPoints?.map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      position: [...entry.position],
      yaw: entry.yaw,
      floorId: entry.floorId,
      radius: entry.radius,
      enabled: entry.enabled,
      targetEntryId: entry.targetEntryId,
      targetGaussianId: entry.targetGaussianId,
      targetPlyUrl: entry.targetPlyUrl,
    })),
    creativeProps: config.creativeProps?.map((prop) => ({
      id: prop.id,
      label: prop.label,
      kind: prop.kind,
      assetUrl: prop.assetUrl,
      position: [...prop.position],
      rotation: { ...prop.rotation },
      scale: [...prop.scale],
      color: prop.color,
      enabled: prop.enabled,
      collidable: prop.collidable,
      gameplayTag: prop.gameplayTag,
      scriptId: prop.scriptId,
      floorId: prop.floorId,
    })),
    scripts: config.scripts?.map((script) => ({
      id: script.id,
      label: script.label,
      enabled: script.enabled,
      trigger: script.trigger,
      targetId: script.targetId,
      source: script.source,
    })),
    ambientSounds: config.ambientSounds?.map((sound) => ({
      id: sound.id,
      label: sound.label,
      kind: sound.kind,
      position: [...sound.position],
      radius: sound.radius,
      volume: sound.volume,
      intervalSeconds: sound.intervalSeconds,
      enabled: sound.enabled,
      floorId: sound.floorId,
    })),
    editorZones: config.editorZones?.map((zone) => ({
      id: zone.id,
      label: zone.label,
      type: zone.type,
      lo: [...zone.lo],
      hi: [...zone.hi],
      points: zone.points?.map((point) => [...point]),
      floorId: zone.floorId,
      enabled: zone.enabled,
    })),
    combat: config.combat ? {
      enabled: config.combat.enabled,
      teams: config.combat.teams,
      health: config.combat.health,
      respawnDelay: config.combat.respawnDelay,
      scoreLimit: config.combat.scoreLimit,
      roundSeconds: config.combat.roundSeconds,
      weapons: [...config.combat.weapons],
      observerSpawn: config.combat.observerSpawn ? [...config.combat.observerSpawn] : undefined,
      respawnPoints: config.combat.respawnPoints.map((point) => ({
        id: point.id,
        label: point.label,
        position: [...point.position],
        yaw: point.yaw,
        team: point.team,
      })),
    } : undefined,
    story: config.story ? {
      enabled: config.story.enabled,
      title: config.story.title,
      completionText: config.story.completionText,
      steps: config.story.steps.map((step) => ({
        id: step.id,
        label: step.label,
        clue: step.clue,
        completion: step.completion,
        type: step.type,
        position: step.position ? [...step.position] : undefined,
        floorId: step.floorId,
        radius: step.radius,
        hidden: step.hidden,
        markerId: step.markerId,
        spotId: step.spotId,
        entryId: step.entryId,
        routeIndex: step.routeIndex,
      })),
    } : undefined,
    deploy: config.deploy ? { ...config.deploy } : undefined,
    updatedAt: config.updatedAt,
  };
}

export function makeSpotFromPlayer(player: PlayerSnapshot, index: number) {
  return {
    id: `spot-${index + 1}`,
    label: `Spot ${index + 1}`,
    position: tupleFromPlayer(player),
    yaw: player.yaw,
    pitch: 0,
  };
}

export function makeMarkerFromPlayer(player: PlayerSnapshot, index: number): MapMarker {
  return {
    id: `mark-${index + 1}`,
    label: `Mark ${index + 1}`,
    position: tupleFromPlayer(player),
    yaw: player.yaw,
    floorId: player.floorId,
    createdAt: new Date().toISOString(),
  };
}

export function makeTrajectoryPose(player: PlayerSnapshot, index: number): TrajectoryPose {
  return {
    name: `recorded-${index + 1}`,
    position: tupleFromPlayer(player),
  };
}

export function encodeSceneConfig(config: GameConfig): string {
  return base64UrlEncode(JSON.stringify(cleanConfig(config)));
}

export function decodeSceneConfigFromHash(hash: string): GameConfig | undefined {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const encoded = params.get("scene") ?? (raw.startsWith(HASH_KEY) ? raw.slice(HASH_KEY.length) : "");
  if (!encoded) return undefined;
  try {
    return cleanConfig(JSON.parse(base64UrlDecode(encoded)) as GameConfig);
  } catch {
    return undefined;
  }
}

export function applySceneConfigToUrl(url: URL, config: GameConfig): string {
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  hashParams.set("scene", encodeSceneConfig(config));
  url.hash = hashParams.toString();
  return url.toString();
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
