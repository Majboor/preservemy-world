export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export interface SceneBounds {
  lo: Vec3Tuple;
  hi: Vec3Tuple;
}

export interface SceneFloor {
  id: string;
  label: string;
  yMin: number;
  yMax: number;
}

export interface SceneAlignment {
  x: number;
  y: number;
  z: number;
}

export interface SceneAlignmentConfig extends Partial<SceneAlignment> {
  pitch?: number;
  yaw?: number;
  roll?: number;
}

export interface SceneManifest {
  plyUrl: string;
  loaderPreviewUrl: string;
  trajectoryUrl: string;
  bounds: SceneBounds;
  spawn?: Vec3Tuple;
  spawnRotation?: {
    yaw: number;
    pitch?: number;
  };
  floors?: SceneFloor[];
  collisionUrl?: string;
  collectibleSeed?: string;
  alignment?: SceneAlignmentConfig;
  gameConfig?: GameConfig;
}

export interface TrajectoryPose {
  name?: string;
  position: Vec3Tuple;
  quaternion?: QuatTuple;
}

export interface TrajectoryFile {
  trajectory?: TrajectoryPose[];
  bounds?: SceneBounds;
  spawn?: Vec3Tuple;
  spawnRotation?: {
    yaw: number;
    pitch?: number;
  };
}

export interface CollisionFile {
  bounds?: SceneBounds;
  floors?: SceneFloor[];
  safeZones?: Array<{
    id?: string;
    lo: Vec3Tuple;
    hi: Vec3Tuple;
  }>;
}

export interface SceneBundle {
  manifest: SceneManifest;
  trajectory: TrajectoryPose[];
  bounds: SceneBounds;
  spawn: Vec3Tuple;
  spawnRotation: {
    yaw: number;
    pitch: number;
  };
  activeFloor: SceneFloor;
  floors: SceneFloor[];
  collision?: CollisionFile;
  alignment: SceneAlignment;
  hasAdminAlignment: boolean;
  gameConfig?: GameConfig;
}

export type GameMode = "home" | "route" | "playing" | "paused";

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  boost: boolean;
  precision: boolean;
  floorId: string;
  status?: string;
}

export interface CollectibleDef {
  id: string;
  label?: string;
  position: Vec3Tuple;
  yaw: number;
  pitch: number;
}

export interface MapMarker {
  id: string;
  label: string;
  position: Vec3Tuple;
  yaw: number;
  floorId: string;
  createdAt: string;
}

export interface GaussianLayer {
  id: string;
  label: string;
  plyUrl: string;
  position: Vec3Tuple;
  rotation: SceneAlignment;
  scale: number;
  enabled: boolean;
  locked?: boolean;
  active?: boolean;
  opacity?: number;
  floorMin?: number;
  floorMax?: number;
  collidable?: boolean;
  playable?: boolean;
}

export interface WorldEntryPoint {
  id: string;
  label: string;
  kind?: "entry" | "exit" | "portal";
  position: Vec3Tuple;
  yaw?: number;
  floorId: string;
  radius: number;
  enabled?: boolean;
  targetEntryId?: string;
  targetGaussianId?: string;
  targetPlyUrl?: string;
}

export type CreativePropKind = "cube" | "platform" | "wall" | "ramp" | "light" | "portal" | "beacon";

export interface CreativeProp {
  id: string;
  label: string;
  kind: CreativePropKind;
  assetUrl?: string;
  position: Vec3Tuple;
  rotation: SceneAlignment;
  scale: Vec3Tuple;
  color: string;
  enabled: boolean;
  collidable?: boolean;
  gameplayTag?: string;
  scriptId?: string;
  floorId?: string;
}

export type CreativeScriptTrigger = "onStart" | "onEnter" | "onCollect" | "onInteract" | "onRespawn";

export interface CreativeScript {
  id: string;
  label: string;
  enabled: boolean;
  trigger: CreativeScriptTrigger;
  targetId?: string;
  source: string;
}

export type AmbientSoundKind = "bell" | "bird" | "electric" | "beacon";

export interface AmbientSoundEmitter {
  id: string;
  label: string;
  kind: AmbientSoundKind;
  position: Vec3Tuple;
  radius: number;
  volume: number;
  intervalSeconds: number;
  enabled: boolean;
  floorId?: string;
}

export type EditorZoneType = "playable" | "blocked" | "warning" | "cleanup" | "respawn" | "entry" | "combat" | "story";

export interface EditorZone {
  id: string;
  label: string;
  type: EditorZoneType;
  lo: Vec3Tuple;
  hi: Vec3Tuple;
  points?: Vec3Tuple[];
  floorId?: string;
  enabled: boolean;
}

export interface RespawnPoint {
  id: string;
  label: string;
  position: Vec3Tuple;
  yaw: number;
  team?: string;
}

export interface CombatConfig {
  enabled: boolean;
  teams: boolean;
  health: number;
  respawnDelay: number;
  scoreLimit: number;
  roundSeconds: number;
  weapons: string[];
  observerSpawn?: Vec3Tuple;
  respawnPoints: RespawnPoint[];
}

export type StoryCompletion = "visit-marker" | "collect-spot" | "reach-entry" | "manual";
export type StoryPointType = "clue" | "treasure" | "checkpoint" | "objective" | "discovery" | "start" | "end";

export interface StoryStep {
  id: string;
  label: string;
  clue: string;
  completion: StoryCompletion;
  type?: StoryPointType;
  position?: Vec3Tuple;
  floorId?: string;
  radius?: number;
  hidden?: boolean;
  markerId?: string;
  spotId?: string;
  entryId?: string;
  routeIndex?: number;
}

export interface StoryConfig {
  enabled: boolean;
  title: string;
  completionText?: string;
  steps: StoryStep[];
}

export interface DeployMetadata {
  mapId?: string;
  version?: string;
  serverUrl?: string;
  manifestUrl?: string;
  shareUrl?: string;
  deployedAt?: string;
}

export interface CollectionSplit {
  id: string;
  ordinal: number;
  seconds: number;
  splitSeconds: number;
}

export interface SpotAuditSummary {
  total: number;
  invalid: number;
  bounds: number;
  floor: number;
  edge: number;
}

export interface GameConfig {
  bounds?: SceneBounds;
  floors?: SceneFloor[];
  spawn?: Vec3Tuple;
  spawnRotation?: {
    yaw: number;
    pitch?: number;
  };
  collectibles?: CollectibleDef[];
  markers?: MapMarker[];
  trajectory?: TrajectoryPose[];
  gaussians?: GaussianLayer[];
  entryPoints?: WorldEntryPoint[];
  creativeProps?: CreativeProp[];
  scripts?: CreativeScript[];
  ambientSounds?: AmbientSoundEmitter[];
  editorZones?: EditorZone[];
  combat?: CombatConfig;
  story?: StoryConfig;
  deploy?: DeployMetadata;
  updatedAt?: string;
}

export interface RemotePlayerSnapshot extends PlayerSnapshot {
  id: string;
  color?: string;
  role?: "pilot" | "observer";
  team?: string;
  health?: number;
  alive?: boolean;
  score?: number;
  deaths?: number;
  updatedAt?: number;
}

export interface LoadFlags {
  manifest: boolean;
  trajectory: boolean;
  splat: boolean;
  jet: boolean;
}
