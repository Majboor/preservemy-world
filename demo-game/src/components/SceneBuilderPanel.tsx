import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type {
  AmbientSoundEmitter,
  AmbientSoundKind,
  CombatConfig,
  CollectibleDef,
  CreativeProp,
  CreativePropKind,
  CreativeScript,
  CreativeScriptTrigger,
  EditorZone,
  EditorZoneType,
  GameConfig,
  GaussianLayer,
  PlayerSnapshot,
  RemotePlayerSnapshot,
  RespawnPoint,
  SceneBounds,
  SceneBundle,
  SceneFloor,
  StoryConfig,
  StoryPointType,
  StoryStep,
  TrajectoryPose,
  Vec3Tuple,
  WorldEntryPoint,
} from "../types";
import { defaultPropCollidable } from "../lib/propCollision";
import type { RoomState } from "../lib/roomClient";
import { downloadJson } from "../lib/shareConfig";
import { BuilderGaussianPreview } from "./BuilderGaussianPreview";

const VIEW = 620;
const PAD = 34;
const MIN_EDGE_MARGIN = 0.35;
const MIN_BOUNDS_SPAN = 0.25;
const PLAYER_FLOOR = "__player__";
const ALL_FLOORS = "__all__";

type BuilderTool =
  | "select"
  | "move"
  | "rotate"
  | "scale"
  | "spawn"
  | "bounds"
  | "floor"
  | "gaussian"
  | "prop"
  | "script"
  | "sound"
  | "trajectory"
  | "spot"
  | "entry"
  | "cleanup"
  | "area"
  | "story"
  | "combat"
  | "deploy";
type BuilderSelection =
  | { kind: "spawn" }
  | { kind: "observer" }
  | { kind: "respawn"; id: string }
  | { kind: "spot"; id: string }
  | { kind: "entry"; id: string }
  | { kind: "prop"; id: string }
  | { kind: "script"; id: string }
  | { kind: "sound"; id: string }
  | { kind: "gaussian"; id: string }
  | { kind: "story-step"; id: string }
  | { kind: "zone"; id: string }
  | { kind: "zone-point"; id: string; index: number }
  | { kind: "trajectory"; index: number };

type BuilderIssueTarget = BuilderSelection | { kind: "bounds" } | { kind: "floor"; id: string };

interface BuilderIssue {
  id: string;
  label: string;
  target?: BuilderIssueTarget;
  severity?: "error" | "warn" | "info";
  repairable?: boolean;
}

interface PropPrefab {
  id: string;
  label: string;
  kind: CreativePropKind;
  scale: Vec3Tuple;
  color: string;
  collidable: boolean;
  assetUrl?: string;
  gameplayTag?: string;
  script?: {
    label: string;
    trigger: CreativeScriptTrigger;
    source: string;
  };
}

interface BuilderViewport {
  zoom: number;
  panX: number;
  panY: number;
}

type FloorDragMode = "min" | "max" | "band";
type BuilderViewportMode = "split" | "preview" | "map";

const DEFAULT_VIEWPORT: BuilderViewport = { zoom: 1, panX: 0, panY: 0 };
const ZONE_TYPES: EditorZoneType[] = ["playable", "blocked", "warning", "cleanup", "respawn", "entry", "combat", "story"];
const PROP_KINDS: CreativePropKind[] = ["cube", "platform", "wall", "ramp", "light", "portal", "beacon"];
const SCRIPT_TRIGGERS: CreativeScriptTrigger[] = ["onStart", "onEnter", "onCollect", "onInteract", "onRespawn"];
const AMBIENT_SOUND_KINDS: AmbientSoundKind[] = ["bell", "bird", "electric", "beacon"];
const STORY_POINT_TYPES: StoryPointType[] = ["clue", "treasure", "checkpoint", "objective", "discovery", "start", "end"];
const ENTRY_KINDS: NonNullable<WorldEntryPoint["kind"]>[] = ["entry", "exit", "portal"];
const PROP_PREFABS: PropPrefab[] = [
  {
    id: "cover-wall",
    label: "Cover wall",
    kind: "wall",
    scale: [1.6, 1.15, 0.45],
    color: "#ff6f61",
    collidable: true,
  },
  {
    id: "flight-pad",
    label: "Flight pad",
    kind: "platform",
    scale: [2.25, 1, 2.25],
    color: "#4cff76",
    collidable: true,
  },
  {
    id: "jump-ramp",
    label: "Ramp",
    kind: "ramp",
    scale: [1.45, 1, 1.55],
    color: "#ffb15c",
    collidable: true,
  },
  {
    id: "portal-gate",
    label: "Portal gate",
    kind: "portal",
    scale: [1.35, 1.35, 1.35],
    color: "#ff5ec4",
    collidable: false,
    script: {
      label: "Portal prompt",
      trigger: "onInteract",
      source: "showMessage('Portal linked');\nsetObjective('Choose the next Gaussian entry');",
    },
  },
  {
    id: "story-beacon",
    label: "Story beacon",
    kind: "beacon",
    scale: [1, 1.2, 1],
    color: "#61cfff",
    collidable: false,
    script: {
      label: "Story clue",
      trigger: "onInteract",
      source: "showMessage('Clue discovered');\nsetObjective('Follow the next marker');",
    },
  },
  {
    id: "health-station",
    label: "Health station",
    kind: "beacon",
    scale: [1.15, 1.15, 1.15],
    color: "#7cff8b",
    collidable: false,
    script: {
      label: "Restore health",
      trigger: "onInteract",
      source: "setHealth(100);\nshowMessage('Health restored');",
    },
  },
  {
    id: "score-token",
    label: "Score token",
    kind: "cube",
    scale: [0.7, 0.7, 0.7],
    color: "#ffd15c",
    collidable: false,
    script: {
      label: "Award score",
      trigger: "onInteract",
      source: "addScore(1);\nshowMessage('Point scored');",
    },
  },
  {
    id: "scene-light",
    label: "Scene light",
    kind: "light",
    scale: [1, 1, 1],
    color: "#61cfff",
    collidable: false,
  },
];

const TOOL_ITEMS: Array<{ id: BuilderTool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "move", label: "Move" },
  { id: "rotate", label: "Rotate" },
  { id: "scale", label: "Scale" },
  { id: "bounds", label: "Bounds" },
  { id: "trajectory", label: "Trajectory" },
  { id: "gaussian", label: "Gaussian" },
  { id: "prop", label: "Props" },
  { id: "story", label: "Story" },
  { id: "cleanup", label: "Cleanup" },
  { id: "sound", label: "Sounds" },
  { id: "entry", label: "Spawn/Entries" },
  { id: "floor", label: "Floors" },
  { id: "area", label: "Areas" },
  { id: "spot", label: "Spots" },
  { id: "script", label: "Scripts" },
  { id: "combat", label: "Combat" },
  { id: "deploy", label: "Deploy" },
];

type RibbonIconId =
  | BuilderTool
  | "undo"
  | "redo"
  | "toolbox"
  | "part"
  | "portal"
  | "route"
  | "view-3d"
  | "view-map"
  | "view-split"
  | "frame"
  | "reset-camera"
  | "play"
  | "build"
  | "save"
  | "export"
  | "share";

function isBuilderToolIcon(id: RibbonIconId): id is BuilderTool {
  return TOOL_ITEMS.some((item) => item.id === id);
}

function ToolIcon({ id }: { id: BuilderTool }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  return (
    <svg className="builder-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      {id === "select" && <path {...common} d="M5 3l10 8-5 1.5L8 20 5 3z" />}
      {id === "move" && (
        <>
          <path {...common} d="M12 3v18M3 12h18" />
          <path {...common} d="M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
        </>
      )}
      {id === "rotate" && (
        <>
          <path {...common} d="M6.2 8.4A7 7 0 0 1 18 7l1.5 1.5" />
          <path {...common} d="M18 3.8V7h-3.2M17.8 15.6A7 7 0 0 1 6 17l-1.5-1.5" />
          <path {...common} d="M6 20.2V17h3.2" />
        </>
      )}
      {id === "scale" && (
        <>
          <rect {...common} x="5" y="5" width="14" height="14" rx="1" />
          <path {...common} d="M8 16l8-8M12.5 8H16v3.5M8 12.5V16h3.5" />
        </>
      )}
      {id === "bounds" && <rect {...common} x="4" y="5" width="16" height="14" rx="1" strokeDasharray="3 2" />}
      {id === "trajectory" && (
        <>
          <path {...common} d="M4 17c4-9 8 5 16-4" />
          <circle cx="4" cy="17" r="1.8" fill="currentColor" />
          <circle cx="12" cy="13" r="1.8" fill="currentColor" />
          <circle cx="20" cy="13" r="1.8" fill="currentColor" />
        </>
      )}
      {id === "gaussian" && (
        <>
          <circle {...common} cx="12" cy="12" r="7" />
          <circle cx="9" cy="10" r="1.4" fill="currentColor" />
          <circle cx="14" cy="8" r="1.2" fill="currentColor" />
          <circle cx="15" cy="15" r="1.5" fill="currentColor" />
          <circle cx="8" cy="15" r="1" fill="currentColor" />
        </>
      )}
      {id === "prop" && (
        <>
          <path {...common} d="M12 3l7 4v9l-7 5-7-5V7l7-4z" />
          <path {...common} d="M5 7l7 4 7-4M12 11v10" />
        </>
      )}
      {id === "story" && (
        <>
          <path {...common} d="M6 5h9a3 3 0 0 1 3 3v11H8a3 3 0 0 1-3-3V6a1 1 0 0 1 1-1z" />
          <path {...common} d="M9 9h5M9 13h6" />
        </>
      )}
      {id === "cleanup" && (
        <>
          <path {...common} d="M7 9l2-4h6l2 4M6 9h12l-1 10H7L6 9z" />
          <path {...common} d="M10 12v4M14 12v4" />
        </>
      )}
      {id === "sound" && (
        <>
          <path {...common} d="M5 10v4h4l5 4V6l-5 4H5z" />
          <path {...common} d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10" />
        </>
      )}
      {id === "entry" && (
        <>
          <path {...common} d="M5 20V5h10v15M15 12h5" />
          <path {...common} d="M18 9l3 3-3 3" />
        </>
      )}
      {id === "floor" && (
        <>
          <path {...common} d="M4 7h16M6 12h12M8 17h8" />
          <path {...common} d="M4 7l4-3h8l4 3M8 17l4 3 4-3" />
        </>
      )}
      {id === "area" && (
        <>
          <path {...common} d="M5 7l6-3 8 4-2 9-8 3-4-5V7z" />
          <path {...common} d="M9 10h6v5H9z" />
        </>
      )}
      {id === "spot" && (
        <>
          <path {...common} d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11z" />
          <circle {...common} cx="12" cy="10" r="2" />
        </>
      )}
      {id === "script" && (
        <>
          <path {...common} d="M8 4L4 12l4 8M16 4l4 8-4 8" />
          <path {...common} d="M13 6l-2 12" />
        </>
      )}
      {id === "combat" && (
        <>
          <path {...common} d="M12 3l7 3v5c0 4.6-2.8 7.8-7 10-4.2-2.2-7-5.4-7-10V6l7-3z" />
          <path {...common} d="M9 12h6M12 9v6" />
        </>
      )}
      {id === "deploy" && (
        <>
          <path {...common} d="M12 16V4M8 8l4-4 4 4" />
          <path {...common} d="M5 14v5h14v-5" />
        </>
      )}
    </svg>
  );
}

function RibbonIcon({ id }: { id: RibbonIconId }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  if (isBuilderToolIcon(id)) {
    return <ToolIcon id={id} />;
  }

  return (
    <svg className="builder-ribbon-icon" viewBox="0 0 24 24" aria-hidden="true">
      {id === "undo" && <path {...common} d="M9 7H4v5M4 12a8 8 0 0 1 13.7-5.7M4 12a8 8 0 0 0 13.4 5.9" />}
      {id === "redo" && <path {...common} d="M15 7h5v5M20 12A8 8 0 0 0 6.3 6.3M20 12A8 8 0 0 1 6.6 17.9" />}
      {id === "toolbox" && (
        <>
          <path {...common} d="M4 9h16v10H4V9zM9 9V6h6v3" />
          <path {...common} d="M4 13h16M10 13v2h4v-2" />
        </>
      )}
      {id === "part" && (
        <>
          <path {...common} d="M12 4l7 4-7 4-7-4 7-4z" />
          <path {...common} d="M5 8v8l7 4 7-4V8M12 12v8" />
        </>
      )}
      {id === "portal" && (
        <>
          <path {...common} d="M7 20V8a5 5 0 0 1 10 0v12" />
          <path {...common} d="M10 15h8M15 12l3 3-3 3" />
        </>
      )}
      {id === "route" && (
        <>
          <path {...common} d="M5 18c2-8 6 1 8-6 1.2-4 4-5 6-3" />
          <circle cx="5" cy="18" r="1.6" fill="currentColor" />
          <circle cx="13" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="9" r="1.6" fill="currentColor" />
        </>
      )}
      {id === "view-3d" && (
        <>
          <path {...common} d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path {...common} d="M4 7.5l8 4.5 8-4.5M12 12v9" />
        </>
      )}
      {id === "view-map" && (
        <>
          <path {...common} d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6z" />
          <path {...common} d="M9 4v14M15 6v14" />
        </>
      )}
      {id === "view-split" && <path {...common} d="M4 5h16v14H4V5zM12 5v14M4 12h8" />}
      {id === "frame" && (
        <>
          <path {...common} d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" />
          <circle {...common} cx="12" cy="12" r="3" />
        </>
      )}
      {id === "reset-camera" && (
        <>
          <path {...common} d="M5 9l2-3h10l2 3v8H5V9z" />
          <circle {...common} cx="12" cy="13" r="3" />
          <path {...common} d="M8 4h5a7 7 0 0 1 6 3" />
        </>
      )}
      {id === "play" && <path {...common} d="M7 5v14l12-7L7 5z" fill="currentColor" stroke="none" />}
      {id === "build" && (
        <>
          <path {...common} d="M14 5l5 5-9 9H5v-5l9-9z" />
          <path {...common} d="M12 7l5 5" />
        </>
      )}
      {id === "save" && (
        <>
          <path {...common} d="M5 4h12l2 2v14H5V4z" />
          <path {...common} d="M8 4v6h7V4M8 20v-6h8v6" />
        </>
      )}
      {id === "export" && (
        <>
          <path {...common} d="M12 4v10M8 10l4 4 4-4" />
          <path {...common} d="M5 16v4h14v-4" />
        </>
      )}
      {id === "share" && (
        <>
          <circle {...common} cx="7" cy="12" r="2" />
          <circle {...common} cx="17" cy="7" r="2" />
          <circle {...common} cx="17" cy="17" r="2" />
          <path {...common} d="M8.8 11.1l6.4-3.2M8.8 12.9l6.4 3.2" />
        </>
      )}
    </svg>
  );
}

function cloneTuple(tuple: Vec3Tuple): Vec3Tuple {
  return [tuple[0], tuple[1], tuple[2]];
}

function numberValue(value: string, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function roundFloorLimit(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeBounds(bounds: SceneBounds): SceneBounds {
  return {
    lo: [
      Math.min(bounds.lo[0], bounds.hi[0]),
      Math.min(bounds.lo[1], bounds.hi[1]),
      Math.min(bounds.lo[2], bounds.hi[2]),
    ],
    hi: [
      Math.max(bounds.lo[0], bounds.hi[0]),
      Math.max(bounds.lo[1], bounds.hi[1]),
      Math.max(bounds.lo[2], bounds.hi[2]),
    ],
  };
}

function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, value));
}

function worldToView(bounds: SceneBounds, x: number, z: number, viewport: BuilderViewport = DEFAULT_VIEWPORT) {
  const width = Math.max(0.001, bounds.hi[0] - bounds.lo[0]);
  const depth = Math.max(0.001, bounds.hi[2] - bounds.lo[2]);
  const draw = VIEW - PAD * 2;
  const scale = Math.min(draw / width, draw / depth);
  const ox = PAD + (draw - width * scale) / 2;
  const oy = PAD + (draw - depth * scale) / 2;
  const baseX = ox + (x - bounds.lo[0]) * scale;
  const baseY = oy + (z - bounds.lo[2]) * scale;
  return {
    x: (baseX - VIEW / 2) * viewport.zoom + VIEW / 2 + viewport.panX,
    y: (baseY - VIEW / 2) * viewport.zoom + VIEW / 2 + viewport.panY,
  };
}

function viewToWorld(bounds: SceneBounds, x: number, y: number, viewport: BuilderViewport = DEFAULT_VIEWPORT): Vec3Tuple {
  const width = Math.max(0.001, bounds.hi[0] - bounds.lo[0]);
  const depth = Math.max(0.001, bounds.hi[2] - bounds.lo[2]);
  const draw = VIEW - PAD * 2;
  const scale = Math.min(draw / width, draw / depth);
  const ox = PAD + (draw - width * scale) / 2;
  const oy = PAD + (draw - depth * scale) / 2;
  const baseX = (x - VIEW / 2 - viewport.panX) / viewport.zoom + VIEW / 2;
  const baseY = (y - VIEW / 2 - viewport.panY) / viewport.zoom + VIEW / 2;
  return [
    bounds.lo[0] + (baseX - ox) / scale,
    0,
    bounds.lo[2] + (baseY - oy) / scale,
  ];
}

function defaultGaussian(bundle: SceneBundle): GaussianLayer {
  return {
    id: "main",
    label: "Main Gaussian",
    plyUrl: bundle.manifest.plyUrl,
    position: [0, 0, 0],
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    enabled: true,
    active: true,
    locked: false,
  };
}

function defaultCombatConfig(player: PlayerSnapshot): CombatConfig {
  return {
    enabled: false,
    teams: false,
    health: 100,
    respawnDelay: 3,
    scoreLimit: 20,
    roundSeconds: 300,
    weapons: ["pulse-cannon"],
    observerSpawn: [player.x, player.y, player.z],
    respawnPoints: [],
  };
}

function defaultStoryConfig(): StoryConfig {
  return {
    enabled: false,
    title: "Story run",
    completionText: "Story complete",
    steps: [],
  };
}

function defaultScriptSource(trigger: CreativeScriptTrigger): string {
  if (trigger === "onEnter") return "showMessage('Entered the area');\nsetObjective('Explore the next marker');";
  if (trigger === "onCollect") return "addScore(1);\nshowMessage('Collected');";
  if (trigger === "onRespawn") return "giveLoadout('pulse-cannon');";
  if (trigger === "onStart") return "setObjective('Find the first clue');";
  return "showMessage('Interacted');";
}

function nextId(prefix: string, existing: Array<{ id: string }>): string {
  let index = existing.length + 1;
  while (existing.some((item) => item.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function normalizeZone(zone: EditorZone): EditorZone {
  return {
    ...zone,
    lo: [
      Math.min(zone.lo[0], zone.hi[0]),
      Math.min(zone.lo[1], zone.hi[1]),
      Math.min(zone.lo[2], zone.hi[2]),
    ],
    hi: [
      Math.max(zone.lo[0], zone.hi[0]),
      Math.max(zone.lo[1], zone.hi[1]),
      Math.max(zone.lo[2], zone.hi[2]),
    ],
    points: zone.points?.map(cloneTuple),
  };
}

function zoneCenter(zone: EditorZone): Vec3Tuple {
  return [
    (zone.lo[0] + zone.hi[0]) / 2,
    (zone.lo[1] + zone.hi[1]) / 2,
    (zone.lo[2] + zone.hi[2]) / 2,
  ];
}

function rectPointsForZone(zone: EditorZone): Vec3Tuple[] {
  const y = (zone.lo[1] + zone.hi[1]) / 2;
  return [
    [zone.lo[0], y, zone.lo[2]],
    [zone.hi[0], y, zone.lo[2]],
    [zone.hi[0], y, zone.hi[2]],
    [zone.lo[0], y, zone.hi[2]],
  ];
}

function zoneWithPoints(zone: EditorZone, points: Vec3Tuple[]): EditorZone {
  if (points.length < 3) return normalizeZone({ ...zone, points });
  const xValues = points.map((point) => point[0]);
  const zValues = points.map((point) => point[2]);
  return normalizeZone({
    ...zone,
    points: points.map(cloneTuple),
    lo: [Math.min(...xValues), zone.lo[1], Math.min(...zValues)],
    hi: [Math.max(...xValues), zone.hi[1], Math.max(...zValues)],
  });
}

function zoneWithCenter(zone: EditorZone, center: Vec3Tuple): EditorZone {
  const current = zoneCenter(zone);
  const dx = center[0] - current[0];
  const dy = center[1] - current[1];
  const dz = center[2] - current[2];
  return normalizeZone({
    ...zone,
    lo: [zone.lo[0] + dx, zone.lo[1] + dy, zone.lo[2] + dz],
    hi: [zone.hi[0] + dx, zone.hi[1] + dy, zone.hi[2] + dz],
    points: zone.points?.map((point) => [point[0] + dx, point[1] + dy, point[2] + dz]),
  });
}

function midpointFloor(floor: SceneFloor): number {
  return (floor.yMin + floor.yMax) / 2;
}

function activeY(player: PlayerSnapshot, floor: SceneFloor): number {
  return Math.min(floor.yMax, Math.max(floor.yMin, player.y || midpointFloor(floor)));
}

function pointInBounds(point: Vec3Tuple, bounds: SceneBounds): boolean {
  return point[0] >= bounds.lo[0] && point[0] <= bounds.hi[0]
    && point[1] >= bounds.lo[1] && point[1] <= bounds.hi[1]
    && point[2] >= bounds.lo[2] && point[2] <= bounds.hi[2];
}

function pointInFloor(point: Vec3Tuple, floor: SceneFloor): boolean {
  return point[1] >= floor.yMin && point[1] <= floor.yMax;
}

function pointInZone(point: Vec3Tuple, zone: EditorZone): boolean {
  if (!zone.enabled) return false;
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
    const current = polygon[index];
    const last = polygon[previous];
    const crosses = ((current[2] > z) !== (last[2] > z))
      && x < ((last[0] - current[0]) * (z - current[2])) / ((last[2] - current[2]) || Number.EPSILON) + current[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function blockedByZone(point: Vec3Tuple, zones: EditorZone[]): EditorZone | undefined {
  return zones.find((zone) => zone.type === "blocked" && pointInZone(point, zone));
}

function outsidePlayableZones(point: Vec3Tuple, zones: EditorZone[]): boolean {
  const playable = zones.filter((zone) => zone.enabled && zone.type === "playable");
  return Boolean(playable.length && !playable.some((zone) => pointInZone(point, zone)));
}

function containingFloor(floors: SceneFloor[], point: Vec3Tuple): SceneFloor | undefined {
  return floors.find((floor) => pointInFloor(point, floor));
}

function edgeMargin(point: Vec3Tuple, bounds: SceneBounds): number {
  return Math.min(
    point[0] - bounds.lo[0],
    bounds.hi[0] - point[0],
    point[2] - bounds.lo[2],
    bounds.hi[2] - point[2],
  );
}

function nearestFloor(floors: SceneFloor[], point: Vec3Tuple, preferredId?: string): SceneFloor | undefined {
  const preferred = floors.find((floor) => floor.id === preferredId);
  if (preferred) return preferred;
  return floors
    .slice()
    .sort((a, b) => Math.abs(midpointFloor(a) - point[1]) - Math.abs(midpointFloor(b) - point[1]))[0];
}

function pointForFloor(point: Vec3Tuple, bounds: SceneBounds, floors: SceneFloor[], preferredFloorId?: string): Vec3Tuple {
  const floor = containingFloor(floors, point) ?? nearestFloor(floors, point, preferredFloorId);
  const nextY = floor ? clamp(point[1], floor.yMin, floor.yMax) : clamp(point[1], bounds.lo[1], bounds.hi[1]);
  return [
    clamp(point[0], bounds.lo[0], bounds.hi[0]),
    clamp(nextY, bounds.lo[1], bounds.hi[1]),
    clamp(point[2], bounds.lo[2], bounds.hi[2]),
  ];
}

function filterPointForFloor(point: Vec3Tuple, floorFilter: string, activeFloor: SceneFloor, floors: SceneFloor[], explicitFloorId?: string): boolean {
  if (floorFilter === ALL_FLOORS) return true;
  const floor = floorFilter === PLAYER_FLOOR ? activeFloor : floors.find((item) => item.id === floorFilter) ?? activeFloor;
  return explicitFloorId ? explicitFloorId === floor.id : pointInFloor(point, floor);
}

function toDegrees(value: number): number {
  return Math.round((value * 180) / Math.PI);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function formatPoint(point: Vec3Tuple): string {
  return point.map((value) => value.toFixed(1)).join(", ");
}

function storyPointColor(type: StoryPointType | undefined): string {
  if (type === "treasure") return "#ffd15c";
  if (type === "checkpoint") return "#61cfff";
  if (type === "objective") return "#ff8232";
  if (type === "discovery") return "#4cff76";
  if (type === "start") return "#ffffff";
  if (type === "end") return "#ff5ec4";
  return "#d6c0ff";
}

function isLikelyGlbUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value.trim(), window.location.href);
    return /\.(glb|gltf)(\?|#|$)/i.test(url.pathname + url.search + url.hash);
  } catch {
    return false;
  }
}

function distanceBetween(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function smoothTrajectoryPoints(trajectory: TrajectoryPose[]): TrajectoryPose[] {
  if (trajectory.length < 4) return trajectory;
  return trajectory.map((pose, index) => {
    if (index === 0 || index === trajectory.length - 1) return pose;
    const previous = trajectory[index - 1].position;
    const current = pose.position;
    const next = trajectory[index + 1].position;
    return {
      ...pose,
      position: [
        previous[0] * 0.25 + current[0] * 0.5 + next[0] * 0.25,
        previous[1] * 0.25 + current[1] * 0.5 + next[1] * 0.25,
        previous[2] * 0.25 + current[2] * 0.5 + next[2] * 0.25,
      ],
    };
  });
}

function simplifyTrajectoryPoints(trajectory: TrajectoryPose[], minDistance: number): TrajectoryPose[] {
  if (trajectory.length < 4) return trajectory;
  const next: TrajectoryPose[] = [trajectory[0]];
  let lastKept = trajectory[0];
  trajectory.slice(1, -1).forEach((pose) => {
    if (distanceBetween(lastKept.position, pose.position) >= minDistance) {
      next.push(pose);
      lastKept = pose;
    }
  });
  const last = trajectory[trajectory.length - 1];
  if (next[next.length - 1] !== last) next.push(last);
  return next;
}

function polygonPointsAttribute(bounds: SceneBounds, points: Vec3Tuple[], viewport: BuilderViewport): string {
  return points.map((point) => {
    const view = worldToView(bounds, point[0], point[2], viewport);
    return `${view.x},${view.y}`;
  }).join(" ");
}

export function SceneBuilderPanel({
  visible,
  bundle,
  player,
  config,
  onChange,
  onClose,
  onExportConfig,
  onCopyShareLink,
  onDeployConfig,
  onSaveLocalDraft,
  onImportConfig,
  onUploadBundle,
  onCreateRoom,
  onJoinRoom,
  onObserverMode,
  onPreviewGaussian,
  onWatchRoute,
  onPlayStoryTest,
  onToggleRecording,
  onRecordRouteVideo,
  recording = false,
  videoRecording = false,
  videoUrl,
  deployStatus,
  localDraftStatus,
  room,
  remotePlayers = [],
}: {
  visible: boolean;
  bundle: SceneBundle;
  player: PlayerSnapshot;
  config?: GameConfig;
  onChange: (config: GameConfig) => void;
  onClose: () => void;
  onExportConfig?: () => void;
  onCopyShareLink?: () => void;
  onDeployConfig?: () => void;
  onSaveLocalDraft?: () => void;
  onImportConfig?: (files: FileList | null) => void;
  onUploadBundle?: (files: FileList) => void;
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
  onObserverMode?: () => void;
  onPreviewGaussian?: (id: string) => void;
  onWatchRoute?: () => void;
  onPlayStoryTest?: (stepId?: string) => void;
  onToggleRecording?: () => void;
  onRecordRouteVideo?: () => void;
  recording?: boolean;
  videoRecording?: boolean;
  videoUrl?: string;
  deployStatus?: string;
  localDraftStatus?: string;
  room?: RoomState;
  remotePlayers?: RemotePlayerSnapshot[];
}) {
  const [tool, setTool] = useState<BuilderTool>("select");
  const [selection, setSelection] = useState<BuilderSelection>({ kind: "spawn" });
  const [viewportMode, setViewportMode] = useState<BuilderViewportMode>("split");
  const [floorFilter, setFloorFilter] = useState<string>(ALL_FLOORS);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [floorSnapEnabled, setFloorSnapEnabled] = useState(false);
  const [angleSnapDegrees, setAngleSnapDegrees] = useState(15);
  const [gridStep, setGridStep] = useState(0.5);
  const [viewport, setViewport] = useState<BuilderViewport>(DEFAULT_VIEWPORT);
  const [frameSignal, setFrameSignal] = useState(0);
  const [resetCameraSignal, setResetCameraSignal] = useState(0);
  const [routePlayback, setRoutePlayback] = useState(false);
  const [routePlaybackIndex, setRoutePlaybackIndex] = useState(0);
  const [routePlaybackSpeed, setRoutePlaybackSpeed] = useState(1);
  const [transformPast, setTransformPast] = useState<GameConfig[]>([]);
  const [transformFuture, setTransformFuture] = useState<GameConfig[]>([]);
  const [transformActive, setTransformActive] = useState(false);
  const [dragging, setDragging] = useState<BuilderSelection | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [floorDrag, setFloorDrag] = useState<{ mode: FloorDragMode; startY: number; floor: SceneFloor } | null>(null);
  const [activePrefabId, setActivePrefabId] = useState(PROP_PREFABS[0].id);
  const [assetSearch, setAssetSearch] = useState("");
  const [customGlbUrl, setCustomGlbUrl] = useState("");
  const [customGlbName, setCustomGlbName] = useState("Custom GLB");
  const floorRailRef = useRef<HTMLDivElement>(null);
  const routeImportRef = useRef<HTMLInputElement>(null);
  const working = config ?? bundle.gameConfig ?? {};
  const bounds = normalizeBounds(working.bounds ?? bundle.bounds);
  const floors = working.floors?.length ? working.floors : bundle.floors;
  const collectibles = working.collectibles ?? bundle.gameConfig?.collectibles ?? [];
  const markers = working.markers ?? bundle.gameConfig?.markers ?? [];
  const entries = working.entryPoints ?? [];
  const gaussians = working.gaussians?.length ? working.gaussians : [defaultGaussian(bundle)];
  const creativeProps = working.creativeProps ?? [];
  const scripts = working.scripts ?? [];
  const ambientSounds = working.ambientSounds ?? [];
  const customGlbPrefab: PropPrefab = {
    id: "custom-glb",
    label: customGlbName.trim() || "Custom GLB",
    kind: "cube",
    scale: [1, 1, 1],
    color: "#d6c0ff",
    collidable: false,
    assetUrl: customGlbUrl.trim() || undefined,
    gameplayTag: "custom-asset",
  };
  const recentAssetPrefabs = useMemo<PropPrefab[]>(() => {
    const seen = new Set<string>();
    return creativeProps.flatMap((prop) => {
      if (!prop.assetUrl || seen.has(prop.assetUrl)) return [];
      seen.add(prop.assetUrl);
      return [{
        id: `recent-${seen.size}`,
        label: prop.label || `GLB ${seen.size}`,
        kind: prop.kind,
        scale: prop.scale,
        color: prop.color,
        collidable: prop.collidable ?? false,
        assetUrl: prop.assetUrl,
        gameplayTag: prop.gameplayTag,
      }];
    }).slice(-6);
  }, [creativeProps]);
  const assetLibrary = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    const assets = [...PROP_PREFABS, ...recentAssetPrefabs, ...(customGlbPrefab.assetUrl ? [customGlbPrefab] : [])];
    return query
      ? assets.filter((asset) => `${asset.label} ${asset.kind} ${asset.gameplayTag ?? ""}`.toLowerCase().includes(query))
      : assets;
  }, [assetSearch, customGlbPrefab, recentAssetPrefabs]);
  const activePrefab = activePrefabId === "custom-glb"
    ? customGlbPrefab
    : assetLibrary.find((prefab) => prefab.id === activePrefabId)
      ?? PROP_PREFABS.find((prefab) => prefab.id === activePrefabId)
      ?? PROP_PREFABS[0];
  const trajectory = working.trajectory?.length ? working.trajectory : bundle.trajectory;
  const editorZones = working.editorZones ?? [];
  const cleanupZones = editorZones.filter((zone) => zone.type === "cleanup");
  const combat = working.combat ?? defaultCombatConfig(player);
  const story = working.story ?? defaultStoryConfig();
  const spawn = working.spawn ?? bundle.spawn;
  const activeFloor = floors.find((floor) => player.y >= floor.yMin && player.y <= floor.yMax) ?? floors[0] ?? bundle.activeFloor;
  const editingFloor = floorFilter === ALL_FLOORS
    ? activeFloor
    : floorFilter === PLAYER_FLOOR
      ? activeFloor
      : floors.find((floor) => floor.id === floorFilter) ?? activeFloor;

  const trajectoryPoints = useMemo(() => (
    trajectory.map((pose) => worldToView(bounds, pose.position[0], pose.position[2], viewport))
  ), [bounds, trajectory, viewport]);

  const visibleCollectibles = useMemo(
    () => collectibles.filter((item) => filterPointForFloor(item.position, floorFilter, activeFloor, floors)),
    [activeFloor, collectibles, floorFilter, floors],
  );
  const visibleEntries = useMemo(
    () => entries.filter((entry) => filterPointForFloor(entry.position, floorFilter, activeFloor, floors, entry.floorId)),
    [activeFloor, entries, floorFilter, floors],
  );
  const visibleProps = useMemo(
    () => creativeProps.filter((prop) => filterPointForFloor(prop.position, floorFilter, activeFloor, floors, prop.floorId)),
    [activeFloor, creativeProps, floorFilter, floors],
  );
  const visibleSounds = useMemo(
    () => ambientSounds.filter((sound) => filterPointForFloor(sound.position, floorFilter, activeFloor, floors, sound.floorId)),
    [activeFloor, ambientSounds, floorFilter, floors],
  );
  const visibleStorySteps = useMemo(
    () => story.steps.filter((step) => step.position && filterPointForFloor(step.position, floorFilter, activeFloor, floors, step.floorId)),
    [activeFloor, floorFilter, floors, story.steps],
  );
  const visibleZones = useMemo(
    () => editorZones.filter((zone) => {
      if (floorFilter === ALL_FLOORS) return true;
      const floor = floorFilter === PLAYER_FLOOR ? activeFloor : floors.find((item) => item.id === floorFilter) ?? activeFloor;
      return !zone.floorId || zone.floorId === floor.id || (zone.lo[1] <= floor.yMax && zone.hi[1] >= floor.yMin);
    }),
    [activeFloor, editorZones, floorFilter, floors],
  );
  const visibleRespawns = useMemo(
    () => combat.respawnPoints.filter((point) => filterPointForFloor(point.position, floorFilter, activeFloor, floors)),
    [activeFloor, combat.respawnPoints, floorFilter, floors],
  );
  const observerSpawn = combat.observerSpawn;
  const observerVisible = Boolean(observerSpawn && filterPointForFloor(observerSpawn, floorFilter, activeFloor, floors));

  useEffect(() => {
    if (!routePlayback || trajectory.length < 2) return undefined;
    const interval = window.setInterval(() => {
      setRoutePlaybackIndex((index) => {
        const next = index + 1;
        if (next >= trajectory.length) {
          setRoutePlayback(false);
          return trajectory.length - 1;
        }
        return next;
      });
    }, Math.max(40, 260 / Math.max(0.2, routePlaybackSpeed)));
    return () => window.clearInterval(interval);
  }, [routePlayback, routePlaybackSpeed, trajectory.length]);

  useEffect(() => {
    setRoutePlaybackIndex((index) => Math.max(0, Math.min(index, Math.max(0, trajectory.length - 1))));
    if (trajectory.length < 2) setRoutePlayback(false);
  }, [trajectory.length]);

  const issues = useMemo<BuilderIssue[]>(() => {
    const next: BuilderIssue[] = [];
    const span = [
      bounds.hi[0] - bounds.lo[0],
      bounds.hi[1] - bounds.lo[1],
      bounds.hi[2] - bounds.lo[2],
    ];
    span.forEach((value, index) => {
      if (value < MIN_BOUNDS_SPAN) {
        next.push({
          id: `bounds-${index}`,
          label: `${["X", "Y", "Z"][index]} bounds are too tight`,
          target: { kind: "bounds" },
          severity: "error",
          repairable: true,
        });
      }
    });
    floors.forEach((floor) => {
      if (floor.yMin < bounds.lo[1] || floor.yMax > bounds.hi[1]) {
        next.push({ id: `floor-out-${floor.id}`, label: `${floor.label} is outside Y bounds`, target: { kind: "floor", id: floor.id }, severity: "error", repairable: true });
      }
      if (floor.yMax - floor.yMin < MIN_BOUNDS_SPAN) {
        next.push({ id: `floor-thin-${floor.id}`, label: `${floor.label} band is too thin`, target: { kind: "floor", id: floor.id }, severity: "error", repairable: true });
      }
    });
    floors.forEach((floor, index) => {
      floors.slice(index + 1).forEach((other) => {
        if (Math.max(floor.yMin, other.yMin) < Math.min(floor.yMax, other.yMax)) {
          next.push({ id: `floor-overlap-${floor.id}-${other.id}`, label: `${floor.label} overlaps ${other.label}`, target: { kind: "floor", id: floor.id }, severity: "warn" });
        }
      });
    });
    if (!pointInBounds(spawn, bounds)) {
      next.push({ id: "spawn-bounds", label: "Spawn is outside scene bounds", target: { kind: "spawn" }, severity: "error", repairable: true });
    }
    if (!containingFloor(floors, spawn)) {
      next.push({ id: "spawn-floor", label: "Spawn is not inside a floor band", target: { kind: "spawn" }, severity: "error", repairable: true });
    }
    if (blockedByZone(spawn, editorZones)) {
      next.push({ id: "spawn-blocked", label: "Spawn is inside a blocked area", target: { kind: "spawn" }, severity: "warn", repairable: true });
    }
    if (outsidePlayableZones(spawn, editorZones)) {
      next.push({ id: "spawn-playable", label: "Spawn is outside playable areas", target: { kind: "spawn" }, severity: "warn", repairable: true });
    }
    if (combat.observerSpawn) {
      if (!pointInBounds(combat.observerSpawn, bounds)) {
        next.push({ id: "observer-bounds", label: "Observer spawn is outside bounds", target: { kind: "observer" }, severity: "error", repairable: true });
      }
      if (!containingFloor(floors, combat.observerSpawn)) {
        next.push({ id: "observer-floor", label: "Observer spawn is not inside a floor band", target: { kind: "observer" }, severity: "error", repairable: true });
      }
      if (blockedByZone(combat.observerSpawn, editorZones)) {
        next.push({ id: "observer-blocked", label: "Observer spawn is inside a blocked area", target: { kind: "observer" }, severity: "warn", repairable: true });
      }
      if (outsidePlayableZones(combat.observerSpawn, editorZones)) {
        next.push({ id: "observer-playable", label: "Observer spawn is outside playable areas", target: { kind: "observer" }, severity: "warn", repairable: true });
      }
    }
    combat.respawnPoints.forEach((point) => {
      if (!pointInBounds(point.position, bounds)) {
        next.push({ id: `respawn-bounds-${point.id}`, label: `${point.label} is outside bounds`, target: { kind: "respawn", id: point.id }, severity: "error", repairable: true });
      }
      if (!containingFloor(floors, point.position)) {
        next.push({ id: `respawn-floor-${point.id}`, label: `${point.label} is not inside a floor band`, target: { kind: "respawn", id: point.id }, severity: "error", repairable: true });
      }
      if (blockedByZone(point.position, editorZones)) {
        next.push({ id: `respawn-blocked-${point.id}`, label: `${point.label} is inside a blocked area`, target: { kind: "respawn", id: point.id }, severity: "warn", repairable: true });
      }
      if (outsidePlayableZones(point.position, editorZones)) {
        next.push({ id: `respawn-playable-${point.id}`, label: `${point.label} is outside playable areas`, target: { kind: "respawn", id: point.id }, severity: "warn", repairable: true });
      }
    });
    collectibles.forEach((item) => {
      if (!pointInBounds(item.position, bounds)) {
        next.push({ id: `spot-bounds-${item.id}`, label: `${item.label ?? item.id} is outside bounds`, target: { kind: "spot", id: item.id }, severity: "error", repairable: true });
      } else if (edgeMargin(item.position, bounds) < MIN_EDGE_MARGIN) {
        next.push({ id: `spot-edge-${item.id}`, label: `${item.label ?? item.id} is too close to the map edge`, target: { kind: "spot", id: item.id }, severity: "warn", repairable: true });
      }
      if (!containingFloor(floors, item.position)) {
        next.push({ id: `spot-floor-${item.id}`, label: `${item.label ?? item.id} is between floor bands`, target: { kind: "spot", id: item.id }, severity: "error", repairable: true });
      }
      if (blockedByZone(item.position, editorZones)) {
        next.push({ id: `spot-blocked-${item.id}`, label: `${item.label ?? item.id} is inside a blocked area`, target: { kind: "spot", id: item.id }, severity: "warn", repairable: true });
      }
      if (outsidePlayableZones(item.position, editorZones)) {
        next.push({ id: `spot-playable-${item.id}`, label: `${item.label ?? item.id} is outside playable areas`, target: { kind: "spot", id: item.id }, severity: "warn", repairable: true });
      }
    });
    entries.forEach((entry) => {
      const floor = floors.find((item) => item.id === entry.floorId);
      if (!pointInBounds(entry.position, bounds)) {
        next.push({ id: `entry-bounds-${entry.id}`, label: `${entry.label} is outside bounds`, target: { kind: "entry", id: entry.id }, severity: "error", repairable: true });
      }
      if (!floor) {
        next.push({ id: `entry-missing-floor-${entry.id}`, label: `${entry.label} points at a missing floor`, target: { kind: "entry", id: entry.id }, severity: "error", repairable: true });
      } else if (!pointInFloor(entry.position, floor)) {
        next.push({ id: `entry-floor-${entry.id}`, label: `${entry.label} is outside its floor band`, target: { kind: "entry", id: entry.id }, severity: "error", repairable: true });
      }
      if (!entry.targetEntryId && !entry.targetGaussianId && !entry.targetPlyUrl) {
        next.push({ id: `entry-target-${entry.id}`, label: `${entry.label} has no destination`, target: { kind: "entry", id: entry.id }, severity: entry.kind === "exit" ? "info" : "warn" });
      }
      if (entry.enabled === false) {
        next.push({ id: `entry-disabled-${entry.id}`, label: `${entry.label} is disabled`, target: { kind: "entry", id: entry.id }, severity: "info" });
      }
      if (entry.targetEntryId && !entries.some((item) => item.id === entry.targetEntryId)) {
        next.push({ id: `entry-missing-destination-${entry.id}`, label: `${entry.label} points at a missing portal`, target: { kind: "entry", id: entry.id }, severity: "error", repairable: true });
      }
      if (entry.targetEntryId === entry.id) {
        next.push({ id: `entry-self-destination-${entry.id}`, label: `${entry.label} links to itself`, target: { kind: "entry", id: entry.id }, severity: "error", repairable: true });
      }
      if (blockedByZone(entry.position, editorZones)) {
        next.push({ id: `entry-blocked-${entry.id}`, label: `${entry.label} is inside a blocked area`, target: { kind: "entry", id: entry.id }, severity: "warn", repairable: true });
      }
      if (outsidePlayableZones(entry.position, editorZones)) {
        next.push({ id: `entry-playable-${entry.id}`, label: `${entry.label} is outside playable areas`, target: { kind: "entry", id: entry.id }, severity: "warn", repairable: true });
      }
    });
    creativeProps.forEach((prop) => {
      if (!pointInBounds(prop.position, bounds)) {
        next.push({ id: `prop-bounds-${prop.id}`, label: `${prop.label} is outside bounds`, target: { kind: "prop", id: prop.id }, severity: "error", repairable: true });
      }
      if (!containingFloor(floors, prop.position)) {
        next.push({ id: `prop-floor-${prop.id}`, label: `${prop.label} is not inside a floor band`, target: { kind: "prop", id: prop.id }, severity: "error", repairable: true });
      }
      const propFloor = prop.floorId ? floors.find((floor) => floor.id === prop.floorId) : undefined;
      if (propFloor && !pointInFloor(prop.position, propFloor)) {
        next.push({ id: `prop-floor-band-${prop.id}`, label: `${prop.label} is floating outside its assigned floor`, target: { kind: "prop", id: prop.id }, severity: "warn", repairable: true });
      }
      if (prop.scale.some((value) => value <= 0)) {
        next.push({ id: `prop-scale-${prop.id}`, label: `${prop.label} has invalid scale`, target: { kind: "prop", id: prop.id }, severity: "error", repairable: true });
      }
      if (prop.scriptId && !scripts.some((script) => script.id === prop.scriptId)) {
        next.push({ id: `prop-script-${prop.id}`, label: `${prop.label} points at a missing script`, target: { kind: "prop", id: prop.id } });
      }
    });
    ambientSounds.forEach((sound) => {
      if (!pointInBounds(sound.position, bounds)) {
        next.push({ id: `sound-bounds-${sound.id}`, label: `${sound.label} sound is outside bounds`, target: { kind: "sound", id: sound.id }, severity: "error", repairable: true });
      }
      if (sound.floorId && !floors.some((floor) => floor.id === sound.floorId)) {
        next.push({ id: `sound-floor-${sound.id}`, label: `${sound.label} points at a missing floor`, target: { kind: "sound", id: sound.id }, severity: "error", repairable: true });
      }
      if (sound.radius <= 0) {
        next.push({ id: `sound-radius-${sound.id}`, label: `${sound.label} needs a positive radius`, target: { kind: "sound", id: sound.id } });
      }
    });
    scripts.forEach((script) => {
      if (script.enabled && !script.source.trim()) {
        next.push({ id: `script-empty-${script.id}`, label: `${script.label} has no source`, target: { kind: "script", id: script.id } });
      }
    });
    trajectory.forEach((pose, index) => {
      if (!pointInBounds(pose.position, bounds)) {
        next.push({ id: `trajectory-bounds-${index}`, label: `Route point ${index + 1} is outside bounds`, target: { kind: "trajectory", index }, severity: "error", repairable: true });
      } else if (blockedByZone(pose.position, editorZones)) {
        next.push({ id: `trajectory-blocked-${index}`, label: `Route point ${index + 1} crosses a blocked area`, target: { kind: "trajectory", index }, severity: "warn", repairable: true });
      } else if (outsidePlayableZones(pose.position, editorZones)) {
        next.push({ id: `trajectory-playable-${index}`, label: `Route point ${index + 1} is outside playable areas`, target: { kind: "trajectory", index }, severity: "warn", repairable: true });
      }
    });
    story.steps.forEach((step) => {
      if (!step.position) return;
      const floor = step.floorId ? floors.find((item) => item.id === step.floorId) : undefined;
      if (!pointInBounds(step.position, bounds)) {
        next.push({ id: `story-bounds-${step.id}`, label: `${step.label} story point is outside bounds`, target: { kind: "story-step", id: step.id }, severity: "error", repairable: true });
      }
      if (step.floorId && !floor) {
        next.push({ id: `story-missing-floor-${step.id}`, label: `${step.label} points at a missing floor`, target: { kind: "story-step", id: step.id }, severity: "error", repairable: true });
      } else if (floor && !pointInFloor(step.position, floor)) {
        next.push({ id: `story-floor-${step.id}`, label: `${step.label} is outside its floor band`, target: { kind: "story-step", id: step.id }, severity: "error", repairable: true });
      } else if (!floor && !containingFloor(floors, step.position)) {
        next.push({ id: `story-between-floors-${step.id}`, label: `${step.label} is between floor bands`, target: { kind: "story-step", id: step.id }, severity: "error", repairable: true });
      }
      if (blockedByZone(step.position, editorZones)) {
        next.push({ id: `story-blocked-${step.id}`, label: `${step.label} is inside a blocked area`, target: { kind: "story-step", id: step.id }, severity: "warn", repairable: true });
      }
      if (outsidePlayableZones(step.position, editorZones)) {
        next.push({ id: `story-playable-${step.id}`, label: `${step.label} is outside playable areas`, target: { kind: "story-step", id: step.id }, severity: "warn", repairable: true });
      }
    });
    editorZones.forEach((zone) => {
      if (!zone.enabled) return;
      const normalized = normalizeZone(zone);
      const zoneSpan = [
        normalized.hi[0] - normalized.lo[0],
        normalized.hi[1] - normalized.lo[1],
        normalized.hi[2] - normalized.lo[2],
      ];
      if (zoneSpan[0] < MIN_BOUNDS_SPAN || zoneSpan[2] < MIN_BOUNDS_SPAN) {
        next.push({ id: `zone-thin-${zone.id}`, label: `${zone.label} area is too small`, target: { kind: "zone", id: zone.id } });
      }
      if (!pointInBounds(normalized.lo, bounds) || !pointInBounds(normalized.hi, bounds)) {
        next.push({ id: `zone-bounds-${zone.id}`, label: `${zone.label} is outside bounds`, target: { kind: "zone", id: zone.id }, severity: "error", repairable: true });
      }
      if (zone.floorId && !floors.some((floor) => floor.id === zone.floorId)) {
        next.push({ id: `zone-floor-${zone.id}`, label: `${zone.label} points at a missing floor`, target: { kind: "zone", id: zone.id }, severity: "error", repairable: true });
      }
    });
    gaussians.forEach((layer) => {
      if (!layer.plyUrl.trim()) {
        next.push({ id: `gaussian-url-${layer.id}`, label: `${layer.label} has no PLY URL`, target: { kind: "gaussian", id: layer.id } });
      }
      if (!Number.isFinite(layer.scale) || layer.scale <= 0) {
        next.push({ id: `gaussian-scale-${layer.id}`, label: `${layer.label} scale must be greater than 0`, target: { kind: "gaussian", id: layer.id } });
      } else if (layer.scale < 0.02 || layer.scale > 40) {
        next.push({ id: `gaussian-scale-weird-${layer.id}`, label: `${layer.label} has an unusual scale`, target: { kind: "gaussian", id: layer.id } });
      }
      if (layer.position.some((value) => !Number.isFinite(value)) || !Number.isFinite(layer.rotation.x) || !Number.isFinite(layer.rotation.y) || !Number.isFinite(layer.rotation.z)) {
        next.push({ id: `gaussian-transform-${layer.id}`, label: `${layer.label} has a broken transform`, target: { kind: "gaussian", id: layer.id } });
      }
      if (typeof layer.floorMin === "number" && typeof layer.floorMax === "number" && layer.floorMin > layer.floorMax) {
        next.push({ id: `gaussian-floor-range-${layer.id}`, label: `${layer.label} floor range is inverted`, target: { kind: "gaussian", id: layer.id } });
      }
    });
    return next;
  }, [ambientSounds, bounds, collectibles, combat, creativeProps, editorZones, entries, floors, gaussians, scripts, spawn, story.steps, trajectory]);

  if (!visible) return null;

  const patch = (next: Partial<GameConfig>) => {
    onChange({ ...working, ...next });
  };

  const beginTransformEdit = () => {
    if (transformActive) return;
    setTransformActive(true);
    setTransformPast((past) => [...past.slice(-19), working]);
    setTransformFuture([]);
  };

  const endTransformEdit = () => {
    setTransformActive(false);
  };

  const undoTransformEdit = () => {
    const previous = transformPast[transformPast.length - 1];
    if (!previous) return;
    setTransformPast((past) => past.slice(0, -1));
    setTransformFuture((future) => [working, ...future.slice(0, 19)]);
    onChange(previous);
  };

  const redoTransformEdit = () => {
    const next = transformFuture[0];
    if (!next) return;
    setTransformFuture((future) => future.slice(1));
    setTransformPast((past) => [...past.slice(-19), working]);
    onChange(next);
  };

  const snapPoint = (position: Vec3Tuple): Vec3Tuple => {
    if (!snapEnabled) return position;
    const step = Math.max(0.05, gridStep);
    return [
      Math.round(position[0] / step) * step,
      position[1],
      Math.round(position[2] / step) * step,
    ];
  };

  const convertSelectedZoneToPolygon = () => {
    if (!selectedZone) return;
    const points = selectedZone.points?.length ? selectedZone.points : rectPointsForZone(selectedZone);
    patch({
      editorZones: editorZones.map((zone) => (
        zone.id === selectedZone.id ? zoneWithPoints(zone, points) : zone
      )),
    });
  };

  const clearSelectedZonePolygon = () => {
    if (!selectedZone?.points?.length) return;
    patch({
      editorZones: editorZones.map((zone) => (
        zone.id === selectedZone.id ? normalizeZone({ ...zone, points: undefined }) : zone
      )),
    });
    setSelection({ kind: "zone", id: selectedZone.id });
  };

  const addSelectedZoneVertexAtPlayer = () => {
    if (!selectedZone) return;
    const points = selectedZone.points?.length ? selectedZone.points : rectPointsForZone(selectedZone);
    const position: Vec3Tuple = snapPoint([player.x, activeY(player, editingFloor), player.z]);
    const next = zoneWithPoints(selectedZone, [...points, position]);
    patch({
      editorZones: editorZones.map((zone) => (
        zone.id === selectedZone.id ? next : zone
      )),
    });
    setSelection({ kind: "zone-point", id: selectedZone.id, index: points.length });
  };

  const getSelectionPosition = (target: BuilderSelection = selection): Vec3Tuple | undefined => {
    if (target.kind === "spawn") return spawn;
    if (target.kind === "observer") return combat.observerSpawn;
    if (target.kind === "respawn") return combat.respawnPoints.find((point) => point.id === target.id)?.position;
    if (target.kind === "spot") return collectibles.find((item) => item.id === target.id)?.position;
    if (target.kind === "entry") return entries.find((entry) => entry.id === target.id)?.position;
    if (target.kind === "prop") return creativeProps.find((prop) => prop.id === target.id)?.position;
    if (target.kind === "script") return undefined;
    if (target.kind === "sound") return ambientSounds.find((sound) => sound.id === target.id)?.position;
    if (target.kind === "gaussian") return gaussians.find((layer) => layer.id === target.id)?.position;
    if (target.kind === "story-step") return story.steps.find((step) => step.id === target.id)?.position;
    if (target.kind === "zone-point") return editorZones.find((item) => item.id === target.id)?.points?.[target.index];
    if (target.kind === "zone") {
      const zone = editorZones.find((item) => item.id === target.id);
      return zone ? zoneCenter(zone) : undefined;
    }
    return trajectory[target.index]?.position;
  };

  const placeSelection = (target: BuilderSelection, position: Vec3Tuple) => {
    if (target.kind === "spawn") {
      patch({ spawn: position, spawnRotation: { yaw: player.yaw, pitch: 0 } });
    } else if (target.kind === "observer") {
      patch({ combat: { ...combat, observerSpawn: position } });
    } else if (target.kind === "respawn") {
      patch({
        combat: {
          ...combat,
          respawnPoints: combat.respawnPoints.map((point) => (
            point.id === target.id ? { ...point, position, yaw: player.yaw } : point
          )),
        },
      });
    } else if (target.kind === "spot") {
      patch({
        collectibles: collectibles.map((item) => (
          item.id === target.id ? { ...item, position } : item
        )),
      });
    } else if (target.kind === "entry") {
      patch({
        entryPoints: entries.map((entry) => (
          entry.id === target.id ? { ...entry, position, floorId: containingFloor(floors, position)?.id ?? entry.floorId } : entry
        )),
      });
    } else if (target.kind === "prop") {
      patch({
        creativeProps: creativeProps.map((prop) => (
          prop.id === target.id ? { ...prop, position, floorId: containingFloor(floors, position)?.id ?? prop.floorId } : prop
        )),
      });
    } else if (target.kind === "sound") {
      patch({
        ambientSounds: ambientSounds.map((sound) => (
          sound.id === target.id ? { ...sound, position, floorId: containingFloor(floors, position)?.id ?? sound.floorId } : sound
        )),
      });
    } else if (target.kind === "gaussian") {
      const gaussian = gaussians.find((layer) => layer.id === target.id);
      if (gaussian?.locked) return;
      patch({
        gaussians: gaussians.map((layer) => (
          layer.id === target.id ? { ...layer, position } : layer
        )),
      });
    } else if (target.kind === "story-step") {
      patch({
        story: {
          ...story,
          steps: story.steps.map((step) => (
            step.id === target.id
              ? { ...step, position, floorId: containingFloor(floors, position)?.id ?? step.floorId ?? editingFloor.id }
              : step
          )),
        },
      });
    } else if (target.kind === "zone-point") {
      patch({
        editorZones: editorZones.map((zone) => {
          if (zone.id !== target.id || !zone.points?.[target.index]) return zone;
          const points = zone.points.map((point, index) => (index === target.index ? position : point));
          return zoneWithPoints(zone, points);
        }),
      });
    } else if (target.kind === "zone") {
      patch({
        editorZones: editorZones.map((zone) => (
          zone.id === target.id ? zoneWithCenter(zone, position) : zone
        )),
      });
    } else if (target.kind === "trajectory") {
      patch({
        trajectory: trajectory.map((pose, index) => (
          index === target.index ? { ...pose, position } : pose
        )),
      });
    }
  };

  const placePoint = (position: Vec3Tuple) => {
    placeSelection(selection, position);
  };

  const moveSelectionFromPreview = (target: BuilderSelection, position: Vec3Tuple) => {
    const snapped = snapPoint(position);
    const next = floorSnapEnabled
      ? pointForFloor(snapped, bounds, floors, editingFloor.id)
      : [
        clamp(snapped[0], bounds.lo[0], bounds.hi[0]),
        clamp(snapped[1], bounds.lo[1], bounds.hi[1]),
        clamp(snapped[2], bounds.lo[2], bounds.hi[2]),
      ] as Vec3Tuple;
    placeSelection(target, next);
  };

  const applyPreviewTransform = (transform: {
    position: Vec3Tuple;
    rotation: { x: number; y: number; z: number };
    scale: Vec3Tuple;
  }) => {
    const position = floorSnapEnabled
      ? pointForFloor(snapPoint(transform.position), bounds, floors, editingFloor.id)
      : snapPoint(transform.position);
    if (selection.kind === "gaussian") {
      if (selectedGaussian?.locked) return;
      const uniformScale = Math.max(0.05, (transform.scale[0] + transform.scale[1] + transform.scale[2]) / 3);
      patch({
        gaussians: gaussians.map((layer) => (
          layer.id === selection.id
            ? { ...layer, position, rotation: transform.rotation, scale: uniformScale }
            : layer
        )),
      });
    } else if (selection.kind === "prop") {
      patch({
        creativeProps: creativeProps.map((prop) => (
          prop.id === selection.id
            ? {
              ...prop,
              position,
              rotation: transform.rotation,
              scale: transform.scale.map((value) => Math.max(0.05, value)) as Vec3Tuple,
              floorId: floorSnapEnabled ? containingFloor(floors, position)?.id ?? prop.floorId : prop.floorId,
            }
            : prop
        )),
      });
    } else {
      placeSelection(selection, position);
    }
  };

  const playTestFrom = (position?: Vec3Tuple) => {
    if (position) {
      patch({ spawn: pointForFloor(position, bounds, floors, editingFloor.id), spawnRotation: { yaw: player.yaw, pitch: 0 } });
    }
    onClose();
  };

  const addSpot = (position: Vec3Tuple) => {
    const id = nextId("spot", collectibles);
    patch({
      collectibles: [
        ...collectibles,
        { id, label: `Spot ${collectibles.length + 1}`, position, yaw: player.yaw, pitch: 0 },
      ],
    });
    setSelection({ kind: "spot", id });
    return id;
  };

  const addEntry = (position: Vec3Tuple, kind: NonNullable<WorldEntryPoint["kind"]> = "entry") => {
    const id = nextId("entry", entries);
    patch({
      entryPoints: [
        ...entries,
        {
          id,
          label: `${kind[0].toUpperCase()}${kind.slice(1)} ${entries.length + 1}`,
          kind,
          position,
          yaw: player.yaw,
          floorId: editingFloor.id,
          radius: kind === "portal" ? 1.25 : 1,
          enabled: true,
          targetGaussianId: kind === "entry" ? gaussians[0]?.id : undefined,
        },
      ],
    });
    setSelection({ kind: "entry", id });
    setTool("entry");
    return id;
  };

  const addObserverSpawn = (position: Vec3Tuple = [player.x, player.y, player.z]) => {
    patch({ combat: { ...combat, observerSpawn: position } });
    setSelection({ kind: "observer" });
    setTool("entry");
  };

  const addGaussian = (position: Vec3Tuple = [player.x, player.y, player.z]) => {
    const id = nextId("gaussian", gaussians);
    patch({
      gaussians: [
        ...gaussians,
        {
          id,
          label: `Gaussian ${gaussians.length + 1}`,
          plyUrl: bundle.manifest.plyUrl,
          position,
          rotation: { x: 0, y: 0, z: 0 },
          scale: 1,
          enabled: true,
          active: gaussians.length === 0,
          locked: false,
          opacity: 1,
        },
      ],
    });
    setSelection({ kind: "gaussian", id });
    return id;
  };

  const addGaussianFromUrl = () => {
    const plyUrl = window.prompt("PLY or Gaussian source URL", bundle.manifest.plyUrl);
    if (!plyUrl) return;
    const id = nextId("gaussian", gaussians);
    patch({
      gaussians: [
        ...gaussians,
        {
          id,
          label: `Gaussian ${gaussians.length + 1}`,
          plyUrl,
          position: [0, 0, 0],
          rotation: { x: 0, y: 0, z: 0 },
          scale: 1,
          enabled: true,
          active: false,
          locked: false,
          opacity: 1,
        },
      ],
    });
    setSelection({ kind: "gaussian", id });
  };

  const addProp = (position: Vec3Tuple = [player.x, player.y, player.z], kind: CreativePropKind = "cube") => {
    const id = nextId("prop", creativeProps);
    const prop: CreativeProp = {
      id,
      label: `${kind[0].toUpperCase()}${kind.slice(1)} ${creativeProps.length + 1}`,
      kind,
      position,
      rotation: { x: 0, y: player.yaw, z: 0 },
      scale: kind === "wall" ? [1, 1, 1] : kind === "platform" ? [1.5, 1, 1.5] : [1, 1, 1],
      color: kind === "light" ? "#61cfff" : kind === "portal" ? "#ff5ec4" : "#ffb15c",
      enabled: true,
      collidable: defaultPropCollidable(kind),
      floorId: containingFloor(floors, position)?.id ?? editingFloor.id,
    };
    patch({ creativeProps: [...creativeProps, prop] });
    setSelection({ kind: "prop", id });
    return id;
  };

  const addSound = (position: Vec3Tuple = [player.x, player.y, player.z], kind: AmbientSoundKind = "bell") => {
    const id = nextId("sound", ambientSounds);
    const sound: AmbientSoundEmitter = {
      id,
      label: `${kind[0].toUpperCase()}${kind.slice(1)} ${ambientSounds.length + 1}`,
      kind,
      position,
      radius: 8,
      volume: 0.5,
      intervalSeconds: kind === "bird" ? 5 : kind === "electric" ? 8 : 10,
      enabled: true,
      floorId: containingFloor(floors, position)?.id ?? editingFloor.id,
    };
    patch({ ambientSounds: [...ambientSounds, sound] });
    setSelection({ kind: "sound", id });
    return id;
  };

  const addPrefab = (prefab: PropPrefab, position: Vec3Tuple = [player.x, player.y, player.z]) => {
    const propId = nextId("prop", creativeProps);
    const scriptId = prefab.script ? nextId("script", scripts) : undefined;
    const nextScripts = prefab.script && scriptId
      ? [
        ...scripts,
        {
          id: scriptId,
          label: prefab.script.label,
          enabled: true,
          trigger: prefab.script.trigger,
          targetId: propId,
          source: prefab.script.source,
        },
      ]
      : scripts;
    const prop: CreativeProp = {
      id: propId,
      label: `${prefab.label} ${creativeProps.length + 1}`,
      kind: prefab.kind,
      assetUrl: prefab.assetUrl,
      position,
      rotation: { x: 0, y: player.yaw, z: 0 },
      scale: cloneTuple(prefab.scale),
      color: prefab.color,
      enabled: true,
      collidable: prefab.collidable,
      gameplayTag: prefab.gameplayTag,
      scriptId,
      floorId: containingFloor(floors, position)?.id ?? editingFloor.id,
    };
    patch({ creativeProps: [...creativeProps, prop], scripts: nextScripts });
    setActivePrefabId(prefab.id);
    setSelection({ kind: "prop", id: propId });
    setTool("select");
    return propId;
  };

  const addScript = (trigger: CreativeScriptTrigger = "onInteract", targetId?: string) => {
    const id = nextId("script", scripts);
    const script: CreativeScript = {
      id,
      label: `Script ${scripts.length + 1}`,
      enabled: true,
      trigger,
      targetId,
      source: defaultScriptSource(trigger),
    };
    patch({ scripts: [...scripts, script] });
    setSelection({ kind: "script", id });
    setTool("script");
    return id;
  };

  const addRespawn = (position: Vec3Tuple = [player.x, player.y, player.z]) => {
    const id = nextId("respawn", combat.respawnPoints);
    patch({
      combat: {
        ...combat,
        respawnPoints: [
          ...combat.respawnPoints,
          { id, label: `Respawn ${combat.respawnPoints.length + 1}`, position, yaw: player.yaw },
        ],
      },
    });
    setSelection({ kind: "respawn", id });
    return id;
  };

  const addZone = (position: Vec3Tuple, type: EditorZoneType) => {
    const id = nextId(type === "cleanup" ? "cleanup" : "zone", editorZones);
    const width = type === "cleanup" ? Math.max(1.2, gridStep * 4) : Math.max(1.8, gridStep * 5);
    const floorHeight = Math.max(MIN_BOUNDS_SPAN, editingFloor.yMax - editingFloor.yMin);
    const zone = normalizeZone({
      id,
      label: `${type[0].toUpperCase()}${type.slice(1)} ${editorZones.length + 1}`,
      type,
      lo: [position[0] - width / 2, type === "playable" ? editingFloor.yMin : position[1] - Math.min(0.5, floorHeight / 2), position[2] - width / 2],
      hi: [position[0] + width / 2, type === "playable" ? editingFloor.yMax : position[1] + Math.min(0.5, floorHeight / 2), position[2] + width / 2],
      floorId: editingFloor.id,
      enabled: true,
    });
    const nextZone = type === "cleanup" ? { ...zone, points: rectPointsForZone(zone) } : zone;
    patch({ editorZones: [...editorZones, nextZone] });
    setSelection({ kind: "zone", id });
    return id;
  };

  const addStoryStepAt = (position: Vec3Tuple, type: StoryPointType = "clue") => {
    const id = nextId("step", story.steps);
    const completion = "visit-marker";
    const step: StoryStep = {
      id,
      label: `${type[0].toUpperCase()}${type.slice(1)} ${story.steps.length + 1}`,
      clue: type === "treasure" ? "Find the treasure." : "Reach the marked story point.",
      completion,
      type,
      position,
      floorId: containingFloor(floors, position)?.id ?? editingFloor.id,
      radius: type === "checkpoint" ? 1.4 : 1,
      hidden: false,
    };
    patch({ story: { ...story, enabled: true, steps: [...story.steps, step] } });
    setSelection({ kind: "story-step", id });
    setTool("story");
    return id;
  };

  const addTrajectoryPoint = (position: Vec3Tuple) => {
    const next: TrajectoryPose = { name: `edited-${trajectory.length + 1}`, position };
    patch({ trajectory: [...trajectory, next] });
    setSelection({ kind: "trajectory", index: trajectory.length });
  };

  const addTrajectoryPointAtPlayer = () => {
    addTrajectoryPoint(snapPoint([player.x, player.y, player.z]));
    setTool("trajectory");
  };

  const moveTrajectoryPoint = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= trajectory.length) return;
    const next = trajectory.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    patch({ trajectory: next });
    setSelection({ kind: "trajectory", index: nextIndex });
  };

  const updateStoryStep = (id: string, nextStep: Partial<StoryStep>) => {
    patch({
      story: {
        ...story,
        steps: story.steps.map((step) => (step.id === id ? { ...step, ...nextStep } : step)),
      },
    });
  };

  const moveStoryStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= story.steps.length) return;
    const next = story.steps.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    patch({ story: { ...story, steps: next } });
    setSelection({ kind: "story-step", id: next[nextIndex].id });
  };

  const duplicateStoryStep = (step: StoryStep) => {
    const id = nextId("step", story.steps);
    const offset = Math.max(0.2, gridStep);
    const position = step.position
      ? [step.position[0] + offset, step.position[1], step.position[2] + offset] as Vec3Tuple
      : [player.x + offset, player.y, player.z + offset] as Vec3Tuple;
    patch({
      story: {
        ...story,
        steps: [
          ...story.steps,
          {
            ...step,
            id,
            label: `${step.label} copy`,
            position,
            floorId: containingFloor(floors, position)?.id ?? step.floorId ?? editingFloor.id,
          },
        ],
      },
    });
    setSelection({ kind: "story-step", id });
  };

  const smoothTrajectory = () => {
    patch({ trajectory: smoothTrajectoryPoints(trajectory) });
  };

  const simplifyTrajectory = () => {
    patch({ trajectory: simplifyTrajectoryPoints(trajectory, Math.max(0.25, gridStep * 2)) });
    setSelection({ kind: "spawn" });
  };

  const snapTrajectoryToFloor = () => {
    patch({
      trajectory: trajectory.map((pose) => ({
        ...pose,
        position: pointForFloor(pose.position, bounds, floors, editingFloor.id),
      })),
    });
  };

  const exportTrajectory = () => {
    downloadJson("trajectory.json", { trajectory });
  };

  const importTrajectory = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        const raw = Array.isArray(parsed)
          ? parsed
          : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { trajectory?: unknown }).trajectory)
            ? (parsed as { trajectory: unknown[] }).trajectory
            : [];
        const imported = raw.flatMap((item, index) => {
          if (typeof item !== "object" || item === null) return [];
          const pose = item as Partial<TrajectoryPose>;
          if (!Array.isArray(pose.position) || pose.position.length !== 3) return [];
          const position = pose.position.map(Number) as Vec3Tuple;
          if (!position.every(Number.isFinite)) return [];
          return [{
            name: String(pose.name ?? `imported-${index + 1}`),
            position,
            quaternion: pose.quaternion,
          }];
        });
        if (!imported.length) return;
        patch({ trajectory: imported });
        setSelection({ kind: "trajectory", index: 0 });
        setTool("trajectory");
      } finally {
        if (routeImportRef.current) routeImportRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>, y = activeY(player, editingFloor)): Vec3Tuple => {
    const rect = event.currentTarget.getBoundingClientRect();
    const world = viewToWorld(
      bounds,
      ((event.clientX - rect.left) / rect.width) * VIEW,
      ((event.clientY - rect.top) / rect.height) * VIEW,
      viewport,
    );
    return snapPoint([world[0], y, world[2]]);
  };

  const onMapPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (tool === "rotate" || tool === "scale") return;
    if (event.shiftKey || event.button === 1) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPanStart({ x: event.clientX, y: event.clientY, panX: viewport.panX, panY: viewport.panY });
      return;
    }
    const current = getSelectionPosition();
    const position = pointFromEvent(event, tool === "select" ? current?.[1] : undefined);
    if (tool === "spawn") {
      patch({ spawn: position, spawnRotation: { yaw: player.yaw, pitch: 0 } });
      setSelection({ kind: "spawn" });
      setDragging({ kind: "spawn" });
    } else if (tool === "spot") {
      const id = addSpot(position);
      setDragging({ kind: "spot", id });
    } else if (tool === "entry") {
      const id = addEntry(position);
      setDragging({ kind: "entry", id });
    } else if (tool === "gaussian") {
      const id = addGaussian(position);
      setDragging({ kind: "gaussian", id });
    } else if (tool === "prop") {
      const id = addPrefab(activePrefab, position);
      setDragging({ kind: "prop", id });
    } else if (tool === "script") {
      addScript("onInteract");
    } else if (tool === "sound") {
      const id = addSound(position, "bell");
      setDragging({ kind: "sound", id });
    } else if (tool === "trajectory") {
      addTrajectoryPoint(position);
      setDragging({ kind: "trajectory", index: trajectory.length });
    } else if (tool === "cleanup") {
      const id = addZone(position, "cleanup");
      setDragging({ kind: "zone", id });
    } else if (tool === "area" || tool === "bounds") {
      const id = addZone(position, tool === "bounds" ? "playable" : "blocked");
      setDragging({ kind: "zone", id });
    } else if (tool === "combat") {
      const id = addRespawn(position);
      setDragging({ kind: "respawn", id });
    } else if (tool === "story") {
      const id = addStoryStepAt(position);
      setDragging({ kind: "story-step", id });
    } else if (tool === "floor") {
      centerFloorOn(editingFloor.id, position[1]);
    } else {
      placePoint(position);
      setDragging(selection);
    }
  };

  const onMapPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (panStart) {
      setViewport((current) => ({
        ...current,
        panX: panStart.panX + event.clientX - panStart.x,
        panY: panStart.panY + event.clientY - panStart.y,
      }));
      return;
    }
    if (!dragging) return;
    const current = getSelectionPosition(dragging);
    const position = pointFromEvent(event, current?.[1]);
    placeSelection(dragging, position);
  };

  const onMapPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (panStart) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released on some browsers.
      }
    }
    setDragging(null);
    setPanStart(null);
  };

  const onMapWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    setViewport((current) => ({ ...current, zoom: clamp(current.zoom * factor, 0.55, 4) }));
  };

  const updateBounds = (key: "lo" | "hi", index: number, value: number) => {
    const next: SceneBounds = { lo: cloneTuple(bounds.lo), hi: cloneTuple(bounds.hi) };
    next[key][index] = value;
    patch({ bounds: normalizeBounds(next) });
  };

  const shiftBounds = (axis: 0 | 1 | 2, delta: number) => {
    const next: SceneBounds = { lo: cloneTuple(bounds.lo), hi: cloneTuple(bounds.hi) };
    next.lo[axis] += delta;
    next.hi[axis] += delta;
    patch({ bounds: normalizeBounds(next) });
  };

  const padBounds = (amount: number) => {
    const next: SceneBounds = { lo: cloneTuple(bounds.lo), hi: cloneTuple(bounds.hi) };
    ([0, 1, 2] as const).forEach((axis) => {
      next.lo[axis] -= amount;
      next.hi[axis] += amount;
    });
    patch({ bounds: normalizeBounds(next) });
  };

  const normalizeFloor = (floor: SceneFloor): SceneFloor => {
    const boundsLo = bounds.lo[1];
    const boundsHi = bounds.hi[1];
    const availableHeight = Math.max(0, boundsHi - boundsLo);
    const minHeight = Math.min(MIN_BOUNDS_SPAN, availableHeight);
    const requestedHeight = Math.abs(floor.yMax - floor.yMin);
    const height = clamp(requestedHeight, minHeight, availableHeight);
    const requestedCenter = (floor.yMin + floor.yMax) / 2;
    const center = clamp(requestedCenter, boundsLo + height / 2, boundsHi - height / 2);
    const yMin = roundFloorLimit(center - height / 2);
    const yMax = roundFloorLimit(center + height / 2);
    return { ...floor, yMin, yMax };
  };

  const updateFloor = (id: string, nextFloor: Partial<SceneFloor>) => {
    patch({
      floors: floors.map((floor) => (floor.id === id ? normalizeFloor({ ...floor, ...nextFloor }) : floor)),
    });
  };

  const addFloor = (center = player.y) => {
    const id = nextId("floor", floors);
    const height = clamp(editingFloor.yMax - editingFloor.yMin, MIN_BOUNDS_SPAN, Math.max(MIN_BOUNDS_SPAN, bounds.hi[1] - bounds.lo[1]));
    const floor = normalizeFloor({
      id,
      label: `Floor ${floors.length + 1}`,
      yMin: center - height / 2,
      yMax: center + height / 2,
    });
    patch({
      floors: [
        ...floors,
        floor,
      ],
    });
    setFloorFilter(id);
    setTool("floor");
  };

  const deleteFloor = (id: string) => {
    if (floors.length <= 1) return;
    const deleted = floors.find((floor) => floor.id === id);
    const remaining = floors.filter((floor) => floor.id !== id);
    const fallback = nearestFloor(remaining, [player.x, player.y, player.z], editingFloor.id) ?? remaining[0];
    if (!fallback) return;
    const wasOnDeletedFloor = (position: Vec3Tuple): boolean => Boolean(deleted && pointInFloor(position, deleted));
    const remapPosition = (position: Vec3Tuple): Vec3Tuple => pointForFloor(position, bounds, remaining, fallback.id);
    patch({
      floors: remaining,
      spawn: floorFilter === id || wasOnDeletedFloor(spawn) ? remapPosition(spawn) : spawn,
      collectibles: collectibles.map((item) => (
        wasOnDeletedFloor(item.position) ? { ...item, position: remapPosition(item.position) } : item
      )),
      entryPoints: entries.map((entry) => (
        entry.floorId === id
          ? { ...entry, floorId: fallback.id, position: remapPosition(entry.position) }
          : entry
      )),
      creativeProps: creativeProps.map((prop) => (
        prop.floorId === id
          ? { ...prop, floorId: fallback.id, position: remapPosition(prop.position) }
          : prop
      )),
      ambientSounds: ambientSounds.map((sound) => (
        sound.floorId === id
          ? { ...sound, floorId: fallback.id, position: remapPosition(sound.position) }
          : sound
      )),
      editorZones: editorZones.map((zone) => (
        zone.floorId === id
          ? normalizeZone({
            ...zone,
            floorId: fallback.id,
            lo: remapPosition(zone.lo),
            hi: remapPosition(zone.hi),
            points: zone.points?.map(remapPosition),
          })
          : zone
      )),
      story: {
        ...story,
        steps: story.steps.map((step) => (
          (step.floorId === id || (step.position && wasOnDeletedFloor(step.position))) && step.position
            ? { ...step, floorId: fallback.id, position: remapPosition(step.position) }
            : step.floorId === id
              ? { ...step, floorId: fallback.id }
              : step
        )),
      },
      trajectory: trajectory.map((pose) => (
        wasOnDeletedFloor(pose.position) ? { ...pose, position: remapPosition(pose.position) } : pose
      )),
      combat: {
        ...combat,
        observerSpawn: combat.observerSpawn && wasOnDeletedFloor(combat.observerSpawn)
          ? remapPosition(combat.observerSpawn)
          : combat.observerSpawn,
        respawnPoints: combat.respawnPoints.map((point) => (
          wasOnDeletedFloor(point.position) ? { ...point, position: remapPosition(point.position) } : point
        )),
      },
    });
    if (floorFilter === id) setFloorFilter(fallback.id);
    setTool("floor");
  };

  const fitBounds = () => {
    const points = [
      spawn,
      [player.x, player.y, player.z] as Vec3Tuple,
      ...trajectory.map((pose) => pose.position),
      ...collectibles.map((item) => item.position),
      ...entries.map((entry) => entry.position),
      ...gaussians.map((layer) => layer.position),
      ...creativeProps.map((prop) => prop.position),
      ...ambientSounds.map((sound) => sound.position),
      ...story.steps.flatMap((step) => (step.position ? [step.position] : [])),
      ...combat.respawnPoints.map((point) => point.position),
      ...(combat.observerSpawn ? [combat.observerSpawn] : []),
      ...editorZones.flatMap((zone) => [zone.lo, zone.hi]),
      ...editorZones.flatMap((zone) => zone.points ?? []),
    ];
    const margin = 1.25;
    patch({
      bounds: points.reduce<SceneBounds>((next, point) => ({
        lo: [
          Math.min(next.lo[0], point[0] - margin),
          Math.min(next.lo[1], point[1] - margin),
          Math.min(next.lo[2], point[2] - margin),
        ],
        hi: [
          Math.max(next.hi[0], point[0] + margin),
          Math.max(next.hi[1], point[1] + margin),
          Math.max(next.hi[2], point[2] + margin),
        ],
      }), {
        lo: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        hi: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      }),
    });
  };

  const selectedSpot = selection.kind === "spot" ? collectibles.find((item) => item.id === selection.id) : undefined;
  const selectedEntry = selection.kind === "entry" ? entries.find((entry) => entry.id === selection.id) : undefined;
  const selectedRespawn = selection.kind === "respawn" ? combat.respawnPoints.find((point) => point.id === selection.id) : undefined;
  const selectedProp = selection.kind === "prop" ? creativeProps.find((prop) => prop.id === selection.id) : undefined;
  const selectedScript = selection.kind === "script" ? scripts.find((script) => script.id === selection.id) : undefined;
  const selectedSound = selection.kind === "sound" ? ambientSounds.find((sound) => sound.id === selection.id) : undefined;
  const selectedGaussian = selection.kind === "gaussian" ? gaussians.find((layer) => layer.id === selection.id) : undefined;
  const selectedStoryStep = selection.kind === "story-step" ? story.steps.find((step) => step.id === selection.id) : undefined;
  const selectedZone = selection.kind === "zone" || selection.kind === "zone-point"
    ? editorZones.find((zone) => zone.id === selection.id)
    : undefined;
  const selectedTrajectory = selection.kind === "trajectory" ? trajectory[selection.index] : undefined;
  const selectedPosition = getSelectionPosition();
  const routePlaybackPose = trajectory[Math.min(routePlaybackIndex, Math.max(0, trajectory.length - 1))];
  const previewGaussian = selectedGaussian
    ?? gaussians.find((layer) => layer.active)
    ?? gaussians.find((layer) => layer.enabled)
    ?? gaussians[0]
    ?? defaultGaussian(bundle);
  const selectedId = "id" in selection ? selection.id : undefined;
  const selectedIndex = selection.kind === "trajectory" ? selection.index : undefined;
  const selectedRotation = selectedGaussian?.rotation ?? selectedProp?.rotation ?? { x: 0, y: 0, z: 0 };
  const selectedScale: Vec3Tuple = selectedGaussian
    ? [selectedGaussian.scale, selectedGaussian.scale, selectedGaussian.scale]
    : selectedProp?.scale ?? [1, 1, 1];
  const transformMode = tool === "rotate" ? "rotate" : tool === "scale" ? "scale" : "move";

  const updateSelectedPosition = (index: number, value: number) => {
    if (!selectedPosition) return;
    const next = cloneTuple(selectedPosition);
    next[index] = value;
    placePoint(next);
  };

  const nudgeSelected = (dx: number, dy: number, dz: number) => {
    if (!selectedPosition) return;
    placePoint([
      selectedPosition[0] + dx,
      selectedPosition[1] + dy,
      selectedPosition[2] + dz,
    ]);
  };

  const moveSelectedToFloor = (floor: SceneFloor) => {
    if (!selectedPosition) return;
    const next = cloneTuple(selectedPosition);
    next[1] = midpointFloor(floor);
    placePoint(next);
  };

  const moveGaussianLayer = (id: string, direction: -1 | 1) => {
    const index = gaussians.findIndex((layer) => layer.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= gaussians.length) return;
    const next = gaussians.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    patch({ gaussians: next });
  };

  const updateGaussianLayer = (id: string, nextLayer: Partial<GaussianLayer>) => {
    patch({
      gaussians: gaussians.map((layer) => (
        layer.id === id ? { ...layer, ...nextLayer } : layer
      )),
    });
  };

  const setActiveGaussianLayer = (id: string) => {
    patch({
      gaussians: gaussians.map((layer) => ({
        ...layer,
        active: layer.id === id,
        enabled: layer.id === id ? true : layer.enabled,
      })),
    });
    setSelection({ kind: "gaussian", id });
  };

  const toggleGaussianLayerLock = (id: string) => {
    patch({
      gaussians: gaussians.map((layer) => (
        layer.id === id ? { ...layer, locked: !layer.locked } : layer
      )),
    });
  };

  const resetGaussianTransform = () => {
    if (!selectedGaussian) return;
    if (selectedGaussian.locked) return;
    beginTransformEdit();
    patch({
      gaussians: gaussians.map((layer) => (
        layer.id === selectedGaussian.id
          ? { ...layer, position: [0, 0, 0], rotation: { x: 0, y: 0, z: 0 }, scale: 1 }
          : layer
      )),
    });
    endTransformEdit();
  };

  const resetPropTransform = () => {
    if (!selectedProp) return;
    beginTransformEdit();
    patch({
      creativeProps: creativeProps.map((prop) => (
        prop.id === selectedProp.id
          ? { ...prop, rotation: { x: 0, y: 0, z: 0 }, scale: [1, 1, 1] }
          : prop
      )),
    });
    endTransformEdit();
  };

  const setGaussianLayerEnabled = (id: string, enabled: boolean) => {
    patch({
      gaussians: gaussians.map((layer) => (
        layer.id === id ? { ...layer, enabled } : layer
      )),
    });
  };

  const soloGaussianLayer = (id: string) => {
    patch({
      gaussians: gaussians.map((layer) => ({
        ...layer,
        enabled: layer.id === id,
      })),
    });
    setSelection({ kind: "gaussian", id });
  };

  const selectIssueTarget = (target: BuilderIssueTarget | undefined) => {
    if (!target) return;
    if (target.kind === "bounds") return;
    if (target.kind === "floor") {
      setFloorFilter(target.id);
      setTool("floor");
      return;
    }
    setSelection(target);
    setTool("select");
  };

  const repairIssueTarget = (target: BuilderIssueTarget | undefined) => {
    if (!target) return;
    selectIssueTarget(target);
    if (target.kind === "bounds") {
      fitBounds();
      return;
    }
    if (target.kind === "floor") {
      const floor = floors.find((item) => item.id === target.id);
      if (floor) updateFloor(target.id, floor);
      return;
    }
    if (target.kind === "script") return;
    if (target.kind === "gaussian") {
      const layer = gaussians.find((item) => item.id === target.id);
      if (!layer || layer.locked) return;
      patch({
        gaussians: gaussians.map((item) => (
          item.id === target.id
            ? {
              ...item,
              position: pointForFloor(item.position, bounds, floors, editingFloor.id),
              scale: Number.isFinite(item.scale) && item.scale > 0 ? clamp(item.scale, 0.02, 40) : 1,
              rotation: {
                x: Number.isFinite(item.rotation.x) ? item.rotation.x : 0,
                y: Number.isFinite(item.rotation.y) ? item.rotation.y : 0,
                z: Number.isFinite(item.rotation.z) ? item.rotation.z : 0,
              },
              floorMin: typeof item.floorMin === "number" && typeof item.floorMax === "number"
                ? Math.min(item.floorMin, item.floorMax)
                : item.floorMin,
              floorMax: typeof item.floorMin === "number" && typeof item.floorMax === "number"
                ? Math.max(item.floorMin, item.floorMax)
                : item.floorMax,
            }
            : item
        )),
      });
      return;
    }
    if (target.kind === "prop") {
      const prop = creativeProps.find((item) => item.id === target.id);
      if (!prop) return;
      const position = pointForFloor(prop.position, bounds, floors, prop.floorId ?? editingFloor.id);
      patch({
        creativeProps: creativeProps.map((item) => (
          item.id === target.id
            ? {
              ...item,
              position,
              floorId: containingFloor(floors, position)?.id ?? item.floorId ?? editingFloor.id,
              scale: item.scale.map((value) => (Number.isFinite(value) && value > 0 ? value : 1)) as Vec3Tuple,
            }
            : item
        )),
      });
      return;
    }
    if (target.kind === "entry") {
      const entry = entries.find((item) => item.id === target.id);
      if (!entry) return;
      const position = pointForFloor(entry.position, bounds, floors, entry.floorId ?? editingFloor.id);
      const targetEntryId = entry.targetEntryId && entry.targetEntryId !== entry.id && entries.some((item) => item.id === entry.targetEntryId)
        ? entry.targetEntryId
        : undefined;
      patch({
        entryPoints: entries.map((item) => (
          item.id === target.id
            ? {
              ...item,
              position,
              floorId: containingFloor(floors, position)?.id ?? item.floorId ?? editingFloor.id,
              targetEntryId,
            }
            : item
        )),
      });
      return;
    }
    if (target.kind === "zone") {
      patch({
        editorZones: editorZones.map((zone) => (
          zone.id === target.id
            ? normalizeZone({
              ...zone,
              floorId: zone.floorId && floors.some((floor) => floor.id === zone.floorId) ? zone.floorId : editingFloor.id,
              lo: pointForFloor(zone.lo, bounds, floors, zone.floorId ?? editingFloor.id),
              hi: pointForFloor(zone.hi, bounds, floors, zone.floorId ?? editingFloor.id),
              points: zone.points?.map((point) => pointForFloor(point, bounds, floors, zone.floorId ?? editingFloor.id)),
            })
            : zone
        )),
      });
      return;
    }
    if (target.kind === "zone-point") {
      const point = getSelectionPosition(target);
      if (point) placeSelection(target, pointForFloor(point, bounds, floors, editingFloor.id));
      return;
    }
    const position = getSelectionPosition(target);
    if (position) {
      const preferredFloorId =
        target.kind === "sound"
          ? ambientSounds.find((sound) => sound.id === target.id)?.floorId
          : target.kind === "story-step"
            ? story.steps.find((step) => step.id === target.id)?.floorId
            : editingFloor.id;
      placeSelection(target, pointForFloor(position, bounds, floors, preferredFloorId ?? editingFloor.id));
    }
  };

  const duplicateSelected = () => {
    const offset: Vec3Tuple = [Math.max(0.2, gridStep), 0, Math.max(0.2, gridStep)];
    if (selectedSpot) {
      const id = nextId("spot", collectibles);
      patch({
        collectibles: [
          ...collectibles,
          {
            ...selectedSpot,
            id,
            label: `${selectedSpot.label ?? "Spot"} copy`,
            position: [selectedSpot.position[0] + offset[0], selectedSpot.position[1], selectedSpot.position[2] + offset[2]],
          },
        ],
      });
      setSelection({ kind: "spot", id });
    } else if (selectedEntry) {
      const id = nextId("entry", entries);
      patch({
        entryPoints: [
          ...entries,
          {
            ...selectedEntry,
            id,
            label: `${selectedEntry.label} copy`,
            position: [selectedEntry.position[0] + offset[0], selectedEntry.position[1], selectedEntry.position[2] + offset[2]],
          },
        ],
      });
      setSelection({ kind: "entry", id });
    } else if (selectedProp) {
      const id = nextId("prop", creativeProps);
      patch({
        creativeProps: [
          ...creativeProps,
          {
            ...selectedProp,
            id,
            label: `${selectedProp.label} copy`,
            position: [selectedProp.position[0] + offset[0], selectedProp.position[1], selectedProp.position[2] + offset[2]],
          },
        ],
      });
      setSelection({ kind: "prop", id });
    } else if (selectedSound) {
      const id = nextId("sound", ambientSounds);
      patch({
        ambientSounds: [
          ...ambientSounds,
          {
            ...selectedSound,
            id,
            label: `${selectedSound.label} copy`,
            position: [selectedSound.position[0] + offset[0], selectedSound.position[1], selectedSound.position[2] + offset[2]],
          },
        ],
      });
      setSelection({ kind: "sound", id });
    } else if (selectedScript) {
      const id = nextId("script", scripts);
      patch({
        scripts: [
          ...scripts,
          {
            ...selectedScript,
            id,
            label: `${selectedScript.label} copy`,
          },
        ],
      });
      setSelection({ kind: "script", id });
    } else if (selectedRespawn) {
      const id = nextId("respawn", combat.respawnPoints);
      patch({
        combat: {
          ...combat,
          respawnPoints: [
            ...combat.respawnPoints,
            {
              ...selectedRespawn,
              id,
              label: `${selectedRespawn.label} copy`,
              position: [selectedRespawn.position[0] + offset[0], selectedRespawn.position[1], selectedRespawn.position[2] + offset[2]],
            },
          ],
        },
      });
      setSelection({ kind: "respawn", id });
    } else if (selectedGaussian) {
      const id = nextId("gaussian", gaussians);
      patch({
        gaussians: [
          ...gaussians,
          {
            ...selectedGaussian,
            id,
            label: `${selectedGaussian.label} copy`,
            position: [selectedGaussian.position[0] + offset[0], selectedGaussian.position[1], selectedGaussian.position[2] + offset[2]],
            active: false,
            locked: false,
          },
        ],
      });
      setSelection({ kind: "gaussian", id });
    } else if (selectedStoryStep) {
      const id = nextId("step", story.steps);
      const position = selectedStoryStep.position
        ? [selectedStoryStep.position[0] + offset[0], selectedStoryStep.position[1], selectedStoryStep.position[2] + offset[2]] as Vec3Tuple
        : [player.x + offset[0], player.y, player.z + offset[2]] as Vec3Tuple;
      patch({
        story: {
          ...story,
          steps: [
            ...story.steps,
            {
              ...selectedStoryStep,
              id,
              label: `${selectedStoryStep.label} copy`,
              position,
              floorId: containingFloor(floors, position)?.id ?? selectedStoryStep.floorId ?? editingFloor.id,
            },
          ],
        },
      });
      setSelection({ kind: "story-step", id });
    } else if (selectedZone) {
      if (selection.kind === "zone-point" && selectedZone.points?.[selection.index]) {
        const id = selectedZone.id;
        const point = selectedZone.points[selection.index];
        const points = [
          ...selectedZone.points.slice(0, selection.index + 1),
          [point[0] + offset[0], point[1], point[2] + offset[2]] as Vec3Tuple,
          ...selectedZone.points.slice(selection.index + 1),
        ];
        patch({
          editorZones: editorZones.map((zone) => (
            zone.id === id ? zoneWithPoints(zone, points) : zone
          )),
        });
        setSelection({ kind: "zone-point", id, index: selection.index + 1 });
        return;
      }
      const id = nextId("zone", editorZones);
      patch({
        editorZones: [
          ...editorZones,
          {
            ...selectedZone,
            id,
            label: `${selectedZone.label} copy`,
            lo: [selectedZone.lo[0] + offset[0], selectedZone.lo[1], selectedZone.lo[2] + offset[2]],
            hi: [selectedZone.hi[0] + offset[0], selectedZone.hi[1], selectedZone.hi[2] + offset[2]],
            points: selectedZone.points?.map((point) => [point[0] + offset[0], point[1], point[2] + offset[2]]),
          },
        ],
      });
      setSelection({ kind: "zone", id });
    }
  };

  const deleteSelected = () => {
    if (selection.kind === "spot") {
      patch({ collectibles: collectibles.filter((item) => item.id !== selection.id) });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "entry") {
      patch({ entryPoints: entries.filter((entry) => entry.id !== selection.id) });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "prop") {
      patch({ creativeProps: creativeProps.filter((prop) => prop.id !== selection.id) });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "script") {
      patch({
        scripts: scripts.filter((script) => script.id !== selection.id),
        creativeProps: creativeProps.map((prop) => (
          prop.scriptId === selection.id ? { ...prop, scriptId: undefined } : prop
        )),
      });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "sound") {
      patch({ ambientSounds: ambientSounds.filter((sound) => sound.id !== selection.id) });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "respawn") {
      patch({
        combat: {
          ...combat,
          respawnPoints: combat.respawnPoints.filter((point) => point.id !== selection.id),
        },
      });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "observer") {
      patch({ combat: { ...combat, observerSpawn: undefined } });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "gaussian" && gaussians.length > 1) {
      if (selectedGaussian?.locked) return;
      const remaining = gaussians.filter((layer) => layer.id !== selection.id);
      patch({
        gaussians: selectedGaussian?.active && remaining.length
          ? remaining.map((layer, index) => ({ ...layer, active: index === 0 }))
          : remaining,
      });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "story-step") {
      patch({ story: { ...story, steps: story.steps.filter((step) => step.id !== selection.id) } });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "zone-point") {
      const zone = editorZones.find((item) => item.id === selection.id);
      if (!zone?.points || zone.points.length <= 3) return;
      const points = zone.points.filter((_, index) => index !== selection.index);
      patch({
        editorZones: editorZones.map((item) => (
          item.id === zone.id ? zoneWithPoints(item, points) : item
        )),
      });
      setSelection({ kind: "zone", id: zone.id });
    } else if (selection.kind === "zone") {
      patch({ editorZones: editorZones.filter((zone) => zone.id !== selection.id) });
      setSelection({ kind: "spawn" });
    } else if (selection.kind === "trajectory") {
      patch({ trajectory: trajectory.filter((_, index) => index !== selection.index) });
      setSelection({ kind: "spawn" });
    }
  };

  const clampObjectsToPlayableArea = () => {
    patch({
      spawn: pointForFloor(spawn, bounds, floors, editingFloor.id),
      collectibles: collectibles.map((item) => ({
        ...item,
        position: pointForFloor(item.position, bounds, floors, editingFloor.id),
      })),
      entryPoints: entries.map((entry) => {
        const floor = floors.find((item) => item.id === entry.floorId) ?? editingFloor;
        return {
          ...entry,
          floorId: floor.id,
          position: pointForFloor(entry.position, bounds, floors, floor.id),
        };
      }),
      creativeProps: creativeProps.map((prop) => ({
        ...prop,
        position: pointForFloor(prop.position, bounds, floors, prop.floorId ?? editingFloor.id),
        floorId: containingFloor(floors, pointForFloor(prop.position, bounds, floors, prop.floorId ?? editingFloor.id))?.id ?? prop.floorId ?? editingFloor.id,
      })),
      ambientSounds: ambientSounds.map((sound) => ({
        ...sound,
        position: pointForFloor(sound.position, bounds, floors, sound.floorId ?? editingFloor.id),
        floorId: containingFloor(floors, pointForFloor(sound.position, bounds, floors, sound.floorId ?? editingFloor.id))?.id ?? sound.floorId ?? editingFloor.id,
      })),
      trajectory: trajectory.map((pose) => ({
        ...pose,
        position: pointForFloor(pose.position, bounds, floors, editingFloor.id),
      })),
      story: {
        ...story,
        steps: story.steps.map((step) => {
          if (!step.position) return step;
          const position = pointForFloor(step.position, bounds, floors, step.floorId ?? editingFloor.id);
          return {
            ...step,
            position,
            floorId: containingFloor(floors, position)?.id ?? step.floorId ?? editingFloor.id,
          };
        }),
      },
      combat: {
        ...combat,
        observerSpawn: combat.observerSpawn ? pointForFloor(combat.observerSpawn, bounds, floors, editingFloor.id) : undefined,
        respawnPoints: combat.respawnPoints.map((point) => ({
          ...point,
          position: pointForFloor(point.position, bounds, floors, editingFloor.id),
        })),
      },
      editorZones: editorZones.map((zone) => normalizeZone({
        ...zone,
        lo: pointForFloor(zone.lo, bounds, floors, zone.floorId ?? editingFloor.id),
        hi: pointForFloor(zone.hi, bounds, floors, zone.floorId ?? editingFloor.id),
        points: zone.points?.map((point) => pointForFloor(point, bounds, floors, zone.floorId ?? editingFloor.id)),
      })),
    });
  };

  const repairTrajectory = () => {
    const repaired = trajectory.map((pose) => ({
      ...pose,
      position: pointForFloor(pose.position, bounds, floors, editingFloor.id),
    }));
    patch({ trajectory: repaired });
    if (selection.kind === "trajectory" && selection.index >= repaired.length) {
      setSelection({ kind: "spawn" });
    }
  };

  const isInvalidPoint = (position: Vec3Tuple, floorId?: string): boolean => {
    const floor = floorId ? floors.find((item) => item.id === floorId) : undefined;
    return !pointInBounds(position, bounds)
      || (floor ? !pointInFloor(position, floor) : !containingFloor(floors, position))
      || Boolean(blockedByZone(position, editorZones))
      || outsidePlayableZones(position, editorZones);
  };

  const floorSpan = Math.max(MIN_BOUNDS_SPAN, bounds.hi[1] - bounds.lo[1]);
  const floorPercent = (value: number) => clamp(100 - ((value - bounds.lo[1]) / floorSpan) * 100, 0, 100);
  const floorTop = floorPercent(editingFloor.yMax);
  const floorBottom = 100 - floorPercent(editingFloor.yMin);
  const playerFloorPercent = floorPercent(player.y);

  const valueFromFloorPointer = (event: PointerEvent<HTMLElement>): number => {
    const rect = floorRailRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return player.y;
    const ratio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    return bounds.hi[1] - ratio * floorSpan;
  };

  const shiftFloor = (id: string, delta: number, source: SceneFloor = editingFloor) => {
    const height = Math.min(Math.max(MIN_BOUNDS_SPAN, source.yMax - source.yMin), Math.max(0, bounds.hi[1] - bounds.lo[1]));
    const nextMin = clamp(source.yMin + delta, bounds.lo[1], bounds.hi[1] - height);
    updateFloor(id, { yMin: nextMin, yMax: nextMin + height });
  };

  const centerFloorOn = (id: string, center: number, source: SceneFloor = editingFloor) => {
    const height = Math.min(Math.max(MIN_BOUNDS_SPAN, source.yMax - source.yMin), Math.max(0, bounds.hi[1] - bounds.lo[1]));
    const nextCenter = clamp(center, bounds.lo[1] + height / 2, bounds.hi[1] - height / 2);
    updateFloor(id, { yMin: nextCenter - height / 2, yMax: nextCenter + height / 2 });
  };

  const fitFloorToObjects = () => {
    const points = [
      spawn,
      [player.x, player.y, player.z] as Vec3Tuple,
      ...visibleCollectibles.map((item) => item.position),
      ...visibleEntries.map((entry) => entry.position),
      ...visibleProps.map((prop) => prop.position),
      ...visibleSounds.map((sound) => sound.position),
      ...visibleRespawns.map((point) => point.position),
      ...(observerVisible && observerSpawn ? [observerSpawn] : []),
    ];
    const margin = Math.max(0.2, Math.min(0.8, floorSpan * 0.08));
    const yValues = points.map((point) => point[1]).filter(Number.isFinite);
    if (!yValues.length) return;
    updateFloor(editingFloor.id, {
      yMin: Math.min(...yValues) - margin,
      yMax: Math.max(...yValues) + margin,
    });
  };

  const beginFloorDrag = (mode: FloorDragMode, event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTool("floor");
    setFloorFilter(editingFloor.id);
    setFloorDrag({ mode, startY: valueFromFloorPointer(event), floor: { ...editingFloor } });
  };

  const dragFloorLimit = (event: PointerEvent<HTMLElement>) => {
    if (!floorDrag) return;
    event.preventDefault();
    const nextY = valueFromFloorPointer(event);
    if (floorDrag.mode === "min") {
      updateFloor(floorDrag.floor.id, { yMin: Math.min(nextY, editingFloor.yMax - MIN_BOUNDS_SPAN) });
    } else if (floorDrag.mode === "max") {
      updateFloor(floorDrag.floor.id, { yMax: Math.max(nextY, editingFloor.yMin + MIN_BOUNDS_SPAN) });
    } else {
      shiftFloor(floorDrag.floor.id, nextY - floorDrag.startY, floorDrag.floor);
    }
  };

  const endFloorDrag = (event: PointerEvent<HTMLElement>) => {
    if (!floorDrag) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released on touch browsers.
    }
    setFloorDrag(null);
  };

  const selectedLabel = selection.kind === "spawn"
    ? "Spawn"
    : selection.kind === "observer"
      ? "Observer spawn"
      : selectedRespawn?.label
        ?? selectedProp?.label
        ?? selectedScript?.label
        ?? selectedSound?.label
        ?? (selection.kind === "zone-point"
          ? `${selectedZone?.label ?? "Zone"} vertex ${selection.index + 1}`
          : selectedSpot?.label
            ?? selectedEntry?.label
            ?? selectedGaussian?.label
            ?? selectedStoryStep?.label
            ?? selectedZone?.label
            ?? (selectedTrajectory ? `Trajectory ${selection.kind === "trajectory" ? selection.index + 1 : ""}` : "None"));
  const boundsStart = worldToView(bounds, bounds.lo[0], bounds.lo[2], viewport);
  const boundsEnd = worldToView(bounds, bounds.hi[0], bounds.hi[2], viewport);
  const nudgeStep = Math.max(0.05, gridStep);
  const deployedAtMs = working.deploy?.deployedAt ? Date.parse(working.deploy.deployedAt) : 0;
  const updatedAtMs = working.updatedAt ? Date.parse(working.updatedAt) : 0;
  const hasDeployedVersion = Boolean(working.deploy?.mapId && working.deploy.version);
  const hasUnsavedChanges = !hasDeployedVersion || (Number.isFinite(updatedAtMs) && Number.isFinite(deployedAtMs) && updatedAtMs > deployedAtMs);
  const deployIssues = issues.filter((issue) => issue.severity === "error");
  const deployStateLabel = hasDeployedVersion
    ? hasUnsavedChanges
      ? "Local draft"
      : "Deployed version"
    : "Not deployed";
  const activateTool = (nextTool: BuilderTool) => {
    setTool(nextTool);
    if (nextTool === "bounds" || nextTool === "floor" || nextTool === "cleanup" || nextTool === "area") {
      setViewportMode("split");
    } else if (nextTool === "gaussian" || nextTool === "select" || nextTool === "move" || nextTool === "rotate" || nextTool === "scale") {
      setViewportMode("preview");
    }
  };

  return (
    <div className="builder-overlay" role="dialog" aria-modal="true">
      <div className="builder-shell">
        <header className="builder-topbar">
          <div className="builder-titlebar">
            <strong>Gorgon Studio - Gaussian Flight</strong>
            <span>{selectedLabel}</span>
            <button type="button" className="builder-titlebar__close" onClick={onClose}>Back to Menu</button>
          </div>
          <div className="builder-menubar" aria-label="Editor menu">
            {["File", "Home", "Model", "Avatar", "Test", "View", "Plugins"].map((item) => (
              <button key={item} type="button" className={item === "Home" ? "is-active" : ""}>{item}</button>
            ))}
          </div>
          <div className="builder-ribbon">
            <div className="builder-ribbon-group">
              <button type="button" onClick={() => activateTool("select")}><RibbonIcon id="select" /><span>Select</span></button>
              <button type="button" onClick={() => activateTool("move")}><RibbonIcon id="move" /><span>Move</span></button>
              <button type="button" onClick={() => activateTool("scale")}><RibbonIcon id="scale" /><span>Scale</span></button>
              <button type="button" onClick={() => activateTool("rotate")}><RibbonIcon id="rotate" /><span>Rotate</span></button>
              <button type="button" disabled={!transformPast.length} onClick={undoTransformEdit}><RibbonIcon id="undo" /><span>Undo</span></button>
              <button type="button" disabled={!transformFuture.length} onClick={redoTransformEdit}><RibbonIcon id="redo" /><span>Redo</span></button>
              <span>Tools</span>
            </div>
            <div className="builder-ribbon-group">
              <button type="button" onClick={() => addGaussian()}><RibbonIcon id="gaussian" /><span>Gaussian</span></button>
              <button type="button" onClick={() => activateTool("prop")}><RibbonIcon id="toolbox" /><span>Toolbox</span></button>
              <button type="button" onClick={() => addPrefab(activePrefab)}><RibbonIcon id="part" /><span>Part</span></button>
              <button type="button" onClick={() => addEntry([player.x, player.y, player.z])}><RibbonIcon id="entry" /><span>Entry</span></button>
              <button type="button" onClick={() => addEntry([player.x, player.y, player.z], "portal")}><RibbonIcon id="portal" /><span>Portal</span></button>
              <span>Insert</span>
            </div>
            <div className="builder-ribbon-group">
              <button type="button" onClick={() => activateTool("bounds")}><RibbonIcon id="bounds" /><span>Bounds</span></button>
              <button type="button" onClick={() => activateTool("floor")}><RibbonIcon id="floor" /><span>Floors</span></button>
              <button type="button" onClick={() => activateTool("cleanup")}><RibbonIcon id="cleanup" /><span>Cleanup</span></button>
              <button type="button" onClick={() => activateTool("trajectory")}><RibbonIcon id="route" /><span>Route</span></button>
              <span>World</span>
            </div>
            <div className="builder-ribbon-group builder-ribbon-group--wide">
              <div className="builder-viewport-tabs" aria-label="Viewport layout">
                {(["preview", "map", "split"] as BuilderViewportMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={viewportMode === mode ? "is-active" : ""}
                    onClick={() => setViewportMode(mode)}
                  >
                    <RibbonIcon id={mode === "preview" ? "view-3d" : mode === "map" ? "view-map" : "view-split"} />
                    {mode === "preview" ? "3D" : mode === "map" ? "Map" : "Split"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setFrameSignal((value) => value + 1)}><RibbonIcon id="frame" /><span>Frame Selected</span></button>
              <button
                type="button"
                onClick={() => {
                  setViewport(DEFAULT_VIEWPORT);
                  setResetCameraSignal((value) => value + 1);
                }}
              >
                <RibbonIcon id="reset-camera" />
                <span>Reset Camera</span>
              </button>
              <span>View</span>
            </div>
            <div className="builder-ribbon-group">
              <button type="button" className="builder-play-button" onClick={() => playTestFrom(spawn)}><RibbonIcon id="play" /><span>Play Spawn</span></button>
              <button type="button" onClick={() => playTestFrom(selectedPosition)}><RibbonIcon id="play" /><span>Play Selected</span></button>
              <button type="button" onClick={() => playTestFrom([player.x, player.y, player.z])}><RibbonIcon id="play" /><span>Play Player</span></button>
              <button type="button" className={tool === "select" ? "is-active" : ""} onClick={() => activateTool("select")}><RibbonIcon id="build" /><span>Build</span></button>
              <button type="button" onClick={onSaveLocalDraft ?? (() => patch({ updatedAt: new Date().toISOString() }))}><RibbonIcon id="save" /><span>Save</span></button>
              {onExportConfig && <button type="button" onClick={onExportConfig}><RibbonIcon id="export" /><span>Export</span></button>}
              {onCopyShareLink && <button type="button" onClick={onCopyShareLink}><RibbonIcon id="share" /><span>Share</span></button>}
              {onDeployConfig && <button type="button" onClick={onDeployConfig}><RibbonIcon id="deploy" /><span>Deploy</span></button>}
              <span>Test</span>
            </div>
          </div>
        </header>

        <nav className="builder-tool-rail" aria-label="Builder tools">
          {TOOL_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={tool === id ? "is-active" : ""}
              onClick={() => activateTool(id)}
              title={label}
            >
              <ToolIcon id={id} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <aside className="builder-sidebar builder-left-panel">
          <section className="builder-section builder-hierarchy-section">
            <strong>Outliner</strong>
            <div className="builder-hierarchy">
              <div>
                <b>Gaussians</b>
                {gaussians.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    className={selection.kind === "gaussian" && selection.id === layer.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "gaussian", id: layer.id })}
                  >
                    <span>{layer.label}</span>
                    <em>{layer.active ? "main" : layer.locked ? "locked" : layer.enabled ? "on" : "off"}</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Spawn points</b>
                <button
                  type="button"
                  className={selection.kind === "spawn" ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "spawn" })}
                >
                  <span>Player spawn</span>
                  <em>{formatPoint(spawn)}</em>
                </button>
                {observerSpawn && (
                  <button
                    type="button"
                    className={selection.kind === "observer" ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "observer" })}
                  >
                    <span>Observer spawn</span>
                    <em>{formatPoint(observerSpawn)}</em>
                  </button>
                )}
                {combat.respawnPoints.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    className={selection.kind === "respawn" && selection.id === point.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "respawn", id: point.id })}
                  >
                    <span>{point.label}</span>
                    <em>{point.team ?? "respawn"}</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Props</b>
                {creativeProps.length === 0 ? <span className="builder-empty-row">None</span> : creativeProps.map((prop) => (
                  <button
                    key={prop.id}
                    type="button"
                    className={selection.kind === "prop" && selection.id === prop.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "prop", id: prop.id })}
                  >
                    <span>{prop.label}</span>
                    <em>{prop.kind}</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Story spots</b>
                {collectibles.length === 0 ? <span className="builder-empty-row">None</span> : collectibles.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={selection.kind === "spot" && selection.id === item.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "spot", id: item.id })}
                  >
                    <span>{item.label ?? item.id}</span>
                    <em>spot</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Story flow</b>
                {story.steps.length === 0 ? <span className="builder-empty-row">None</span> : story.steps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    className={selection.kind === "story-step" && selection.id === step.id ? "is-active" : ""}
                    onClick={() => {
                      setSelection({ kind: "story-step", id: step.id });
                      setTool("story");
                    }}
                  >
                    <span>{index + 1}. {step.label}</span>
                    <em>{step.type ?? "clue"}</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Entries</b>
                {entries.length === 0 ? <span className="builder-empty-row">None</span> : entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={selection.kind === "entry" && selection.id === entry.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "entry", id: entry.id })}
                  >
                    <span>{entry.label}</span>
                    <em>{entry.kind ?? "entry"}{entry.enabled === false ? " off" : ""}</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Bounds/areas</b>
                {editorZones.length === 0 ? <span className="builder-empty-row">Scene bounds only</span> : editorZones.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    className={selection.kind === "zone" && selection.id === zone.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "zone", id: zone.id })}
                  >
                    <span>{zone.label}</span>
                    <em>{zone.type}</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Sounds</b>
                {ambientSounds.length === 0 ? <span className="builder-empty-row">None</span> : ambientSounds.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    className={selection.kind === "sound" && selection.id === sound.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "sound", id: sound.id })}
                  >
                    <span>{sound.label}</span>
                    <em>{sound.kind}</em>
                  </button>
                ))}
              </div>
              <div>
                <b>Trajectory</b>
                <button
                  type="button"
                  className={selection.kind === "trajectory" ? "is-active" : ""}
                  onClick={() => setTool("trajectory")}
                >
                  <span>{trajectory.length} route points</span>
                  <em>route</em>
                </button>
              </div>
            </div>
          </section>

          <section className="builder-section builder-toolbox-section">
            <strong>Toolbox</strong>
            <div className="builder-toolbox-tabs">
              <button type="button" className="is-active">Models</button>
              <button type="button">Images</button>
              <button type="button">Audio</button>
            </div>
            <div className="builder-toolbox-search">
              <input
                value={assetSearch}
                placeholder="Search local assets"
                aria-label="Search assets"
                onChange={(event) => setAssetSearch(event.currentTarget.value)}
              />
            </div>
            <div className="builder-asset-grid">
              {assetLibrary.map((prefab) => (
                <button
                  key={prefab.id}
                  type="button"
                  className={activePrefab.id === prefab.id ? "is-active" : ""}
                  onClick={() => {
                    setActivePrefabId(prefab.id);
                    setTool("prop");
                  }}
                >
                  <i style={{ background: prefab.color }} />
                  <span>{prefab.assetUrl ? `${prefab.label} GLB` : prefab.label}</span>
                </button>
              ))}
            </div>
            <div className="builder-glb-import">
              <input
                value={customGlbName}
                placeholder="Asset name"
                aria-label="Custom GLB asset name"
                onChange={(event) => setCustomGlbName(event.currentTarget.value)}
              />
              <input
                value={customGlbUrl}
                placeholder="Paste GLB/GLTF URL"
                aria-label="Custom GLB URL"
                onChange={(event) => setCustomGlbUrl(event.currentTarget.value)}
              />
              <div className="builder-actions">
                <button
                  type="button"
                  disabled={!isLikelyGlbUrl(customGlbUrl)}
                  onClick={() => {
                    setActivePrefabId("custom-glb");
                    setTool("prop");
                  }}
                >
                  Select GLB
                </button>
                <button
                  type="button"
                  disabled={!isLikelyGlbUrl(customGlbUrl)}
                  onClick={() => addPrefab(customGlbPrefab, [player.x, activeY(player, editingFloor), player.z])}
                >
                  Add at player
                </button>
              </div>
              <p>{customGlbUrl && !isLikelyGlbUrl(customGlbUrl) ? "Use a direct .glb or .gltf URL. User-provided assets only." : "Direct GLB/GLTF URLs are saved with the scene."}</p>
            </div>
          </section>

          <div className="builder-bar">
            <strong>Scene</strong>
            <div className="builder-bar-actions">
              {onCopyShareLink && <button type="button" onClick={onCopyShareLink}>Link</button>}
              {onExportConfig && <button type="button" onClick={onExportConfig}>JSON</button>}
            </div>
          </div>
          <div className="builder-tools" aria-hidden="true">
            {TOOL_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={tool === id ? "is-active" : ""}
                onClick={() => activateTool(id)}
              >
                <ToolIcon id={id} />
                {label}
              </button>
            ))}
          </div>

          <section className="builder-section">
            <strong>View</strong>
            <label>
              <span>Floor</span>
              <select value={floorFilter} onChange={(event) => setFloorFilter(event.currentTarget.value)}>
                <option value={ALL_FLOORS}>All floors</option>
                <option value={PLAYER_FLOOR}>Player floor</option>
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>{floor.label}</option>
                ))}
              </select>
            </label>
            <div className="builder-inline">
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={snapEnabled}
                  onChange={(event) => setSnapEnabled(event.currentTarget.checked)}
                />
                <span>Grid snap</span>
              </label>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={floorSnapEnabled}
                  onChange={(event) => setFloorSnapEnabled(event.currentTarget.checked)}
                />
                <span>Floor snap</span>
              </label>
              <label>
                <span>Grid</span>
                <input
                  type="number"
                  min="0.05"
                  step="0.05"
                  value={gridStep}
                  onChange={(event) => setGridStep(Math.max(0.05, numberValue(event.currentTarget.value, gridStep)))}
                />
              </label>
              <label>
                <span>Angle</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={angleSnapDegrees}
                  onChange={(event) => setAngleSnapDegrees(Math.max(1, numberValue(event.currentTarget.value, angleSnapDegrees)))}
                />
              </label>
            </div>
            <div className="builder-actions">
              <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 1.15, 0.55, 4) }))}>Zoom in</button>
              <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom / 1.15, 0.55, 4) }))}>Zoom out</button>
              <button type="button" onClick={() => setViewport(DEFAULT_VIEWPORT)}>Reset view</button>
            </div>
          </section>

          {tool === "entry" && (
            <section className="builder-section">
              <strong>Spawn/Entries</strong>
              <div className="builder-actions">
                <button type="button" onClick={() => patch({ spawn: [player.x, player.y, player.z], spawnRotation: { yaw: player.yaw, pitch: 0 } })}>Set spawn</button>
                <button type="button" onClick={() => addObserverSpawn()}>Observer</button>
                <button type="button" onClick={() => addRespawn([player.x, player.y, player.z])}>Respawn</button>
                <button type="button" onClick={() => addEntry([player.x, player.y, player.z], "entry")}>Entry</button>
                <button type="button" onClick={() => addEntry([player.x, player.y, player.z], "exit")}>Exit</button>
                <button type="button" onClick={() => addEntry([player.x, player.y, player.z], "portal")}>Portal</button>
              </div>
              <div className="builder-entry-summary">
                <span>Spawn {isInvalidPoint(spawn) ? "invalid" : "ready"}</span>
                <span>{entries.filter((entry) => entry.enabled !== false).length}/{entries.length} entries on</span>
                <span>{combat.respawnPoints.length} respawns</span>
              </div>
            </section>
          )}

          <section className="builder-section">
            <strong>Issues</strong>
            {issues.length === 0 ? (
              <p>No builder issues found.</p>
            ) : (
              <div className="builder-issue-list">
                {issues.slice(0, 14).map((issue) => (
                  <div key={issue.id} className={`builder-issue-row builder-issue-row--${issue.severity ?? "warn"}`}>
                    <button type="button" onClick={() => selectIssueTarget(issue.target)}>
                      <span>{issue.severity === "error" ? "!" : issue.severity === "info" ? "i" : "?"}</span>
                      <b>{issue.label}</b>
                    </button>
                    <button type="button" onClick={() => repairIssueTarget(issue.target)} disabled={!issue.repairable && issue.target?.kind !== "bounds" && issue.target?.kind !== "floor"}>
                      Fix
                    </button>
                  </div>
                ))}
                {issues.length > 14 && <p>{issues.length - 14} more issues not shown</p>}
              </div>
            )}
            <div className="builder-actions">
              <button type="button" onClick={clampObjectsToPlayableArea}>Repair all positions</button>
              <button type="button" onClick={repairTrajectory}>Repair route</button>
            </div>
          </section>

          <section className="builder-section builder-floor-limit-section">
            <strong>Floor limit</strong>
            <div className="builder-floor-readout">
              <span>{editingFloor.label}</span>
              <b>{editingFloor.yMin.toFixed(2)} to {editingFloor.yMax.toFixed(2)}</b>
            </div>
            <div className="builder-floor-editor">
              <div
                ref={floorRailRef}
                className={`builder-floor-ruler ${floorDrag ? "is-dragging" : ""}`}
                onPointerMove={dragFloorLimit}
                onPointerUp={endFloorDrag}
                onPointerCancel={endFloorDrag}
              >
                <span className="builder-floor-bound is-hi">{bounds.hi[1].toFixed(1)}</span>
                <button
                  type="button"
                  className="builder-floor-band"
                  style={{ top: `${floorTop}%`, bottom: `${floorBottom}%` }}
                  onPointerDown={(event) => beginFloorDrag("band", event)}
                  aria-label={`Shift ${editingFloor.label} floor band`}
                >
                  <i />
                </button>
                <button
                  type="button"
                  className="builder-floor-handle is-max"
                  style={{ top: `${floorTop}%` }}
                  onPointerDown={(event) => beginFloorDrag("max", event)}
                  aria-label={`Set ${editingFloor.label} max floor limit`}
                >
                  MAX
                </button>
                <button
                  type="button"
                  className="builder-floor-handle is-min"
                  style={{ top: `${100 - floorBottom}%` }}
                  onPointerDown={(event) => beginFloorDrag("min", event)}
                  aria-label={`Set ${editingFloor.label} min floor limit`}
                >
                  MIN
                </button>
                <span className="builder-floor-player-line" style={{ top: `${playerFloorPercent}%` }} />
                <span className="builder-floor-bound is-lo">{bounds.lo[1].toFixed(1)}</span>
              </div>
              <div className="builder-floor-controls">
                <div className="builder-fields">
                  <label>
                    <span>Min</span>
                    <input
                      type="number"
                      step="0.1"
                      value={editingFloor.yMin}
                      onChange={(event) => updateFloor(editingFloor.id, { yMin: numberValue(event.currentTarget.value, editingFloor.yMin) })}
                    />
                  </label>
                  <label>
                    <span>Max</span>
                    <input
                      type="number"
                      step="0.1"
                      value={editingFloor.yMax}
                      onChange={(event) => updateFloor(editingFloor.id, { yMax: numberValue(event.currentTarget.value, editingFloor.yMax) })}
                    />
                  </label>
                </div>
                <div className="builder-actions">
                  <button type="button" onClick={() => shiftFloor(editingFloor.id, -nudgeStep)}>Y-</button>
                  <button type="button" onClick={() => shiftFloor(editingFloor.id, nudgeStep)}>Y+</button>
                  <button type="button" onClick={() => centerFloorOn(editingFloor.id, player.y)}>Center on player</button>
                  <button type="button" onClick={fitFloorToObjects}>Fit objects</button>
                  <button type="button" onClick={() => addFloor(player.y)}>New at player</button>
                </div>
              </div>
            </div>
          </section>

          <section className="builder-section">
            <strong>Bounds</strong>
            <div className="builder-fields">
              {(["X", "Y", "Z"] as const).map((axis, index) => (
                <label key={axis}>
                  <span>{axis}</span>
                  <input
                    type="number"
                    step="0.1"
                    value={bounds.lo[index]}
                    onChange={(event) => updateBounds("lo", index, numberValue(event.currentTarget.value, bounds.lo[index]))}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={bounds.hi[index]}
                    onChange={(event) => updateBounds("hi", index, numberValue(event.currentTarget.value, bounds.hi[index]))}
                  />
                </label>
              ))}
            </div>
            <div className="builder-actions">
              <button type="button" onClick={fitBounds}>Fit all</button>
              <button type="button" onClick={() => padBounds(nudgeStep)}>Pad</button>
              <button type="button" onClick={() => padBounds(-nudgeStep)}>Tighten</button>
            </div>
            <div className="builder-actions">
              <button type="button" onClick={() => shiftBounds(0, -nudgeStep)}>X-</button>
              <button type="button" onClick={() => shiftBounds(0, nudgeStep)}>X+</button>
              <button type="button" onClick={() => shiftBounds(2, -nudgeStep)}>Z-</button>
              <button type="button" onClick={() => shiftBounds(2, nudgeStep)}>Z+</button>
            </div>
          </section>

          <section className="builder-section">
            <strong>Floors</strong>
            <div className="builder-floor-list">
              {floors.map((floor) => (
                <div key={floor.id}>
                  <input
                    value={floor.label}
                    aria-label={`${floor.label} label`}
                    onChange={(event) => updateFloor(floor.id, { label: event.currentTarget.value })}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={floor.yMin}
                    aria-label={`${floor.label} min y`}
                    onChange={(event) => updateFloor(floor.id, { yMin: numberValue(event.currentTarget.value, floor.yMin) })}
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={floor.yMax}
                    aria-label={`${floor.label} max y`}
                    onChange={(event) => updateFloor(floor.id, { yMax: numberValue(event.currentTarget.value, floor.yMax) })}
                  />
                  <button type="button" onClick={() => setFloorFilter(floor.id)}>View</button>
                  <button type="button" onClick={() => deleteFloor(floor.id)} disabled={floors.length <= 1}>Del</button>
                </div>
              ))}
            </div>
            <div className="builder-actions">
              <button type="button" onClick={() => addFloor(player.y)}>Add floor</button>
              <button type="button" onClick={() => setFloorFilter(ALL_FLOORS)}>Show all</button>
              <button type="button" onClick={() => setFloorFilter(PLAYER_FLOOR)}>Player floor</button>
            </div>
          </section>
        </aside>

        <main className="builder-map-panel builder-workspace">
          <div className="builder-map-toolbar">
            <div className="builder-workspace-view-switch" aria-label="Workspace view">
              {(["preview", "map", "split"] as BuilderViewportMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={viewportMode === mode ? "is-active" : ""}
                  onClick={() => setViewportMode(mode)}
                >
                  <RibbonIcon id={mode === "preview" ? "view-3d" : mode === "map" ? "view-map" : "view-split"} />
                  <span>{mode === "preview" ? "3D Gaussian" : mode === "map" ? "Map" : "Split"}</span>
                </button>
              ))}
            </div>
            <span>Tool: {tool}</span>
            <span>Floor: {floorFilter === ALL_FLOORS ? "all" : editingFloor.label}</span>
            <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>
            <span>{visibleCollectibles.length}/{collectibles.length} spots</span>
            <span>{visibleEntries.length}/{entries.length} entries</span>
            <span>{visibleProps.length}/{creativeProps.length} props</span>
            <span>{visibleSounds.length}/{ambientSounds.length} sounds</span>
            {tool === "prop" && <span>Prefab: {activePrefab.label}</span>}
            <span>{visibleZones.length}/{editorZones.length} zones</span>
            <span>{visibleRespawns.length}/{combat.respawnPoints.length} respawns</span>
            <span>{trajectory.length} route pts</span>
          </div>
          <div className={`builder-view-grid builder-view-grid--${viewportMode}`}>
            <BuilderGaussianPreview
              bundle={bundle}
              layer={previewGaussian}
              gaussianLayers={gaussians}
              bounds={bounds}
              floor={editingFloor}
              zones={visibleZones}
              trajectory={trajectory}
              spawn={spawn}
              player={player}
              collectibles={visibleCollectibles}
              entries={visibleEntries}
              observerSpawn={observerSpawn}
              respawns={visibleRespawns}
              creativeProps={visibleProps}
              ambientSounds={visibleSounds}
              storySteps={visibleStorySteps}
              selectedPosition={selectedPosition}
              selectedLabel={selectedLabel}
              selectedKind={selection.kind}
              selectedId={selectedId}
              selectedIndex={selectedIndex}
              selectedRotation={selectedRotation}
              selectedScale={selectedScale}
              playbackPosition={routePlaybackPose?.position}
              transformMode={transformMode}
              snapEnabled={snapEnabled}
              gridStep={gridStep}
              angleSnapDegrees={angleSnapDegrees}
              onSelect={(nextSelection) => {
                setSelection(nextSelection);
                setTool("select");
              }}
              onMoveSelected={moveSelectionFromPreview}
              onPlaceProp={tool === "prop" ? (position) => addPrefab(activePrefab, position) : undefined}
              onTransformChange={applyPreviewTransform}
              onTransformStart={beginTransformEdit}
              onTransformEnd={endTransformEdit}
              frameSignal={frameSignal}
              resetSignal={resetCameraSignal}
            />
            <div className="builder-map-frame">
              <div className="builder-map-frame__tag">Tactical edit map</div>
              <svg
                className={`builder-map ${panStart ? "is-panning" : ""}`}
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                role="img"
                aria-label="Top down scene builder"
                onPointerDown={onMapPointerDown}
                onPointerMove={onMapPointerMove}
                onPointerUp={onMapPointerUp}
                onPointerLeave={onMapPointerUp}
                onWheel={onMapWheel}
              >
                <rect x="0" y="0" width={VIEW} height={VIEW} />
                {Array.from({ length: 13 }).map((_, index) => (
                  <g key={index} className="builder-grid">
                    <line x1={PAD + index * ((VIEW - PAD * 2) / 12)} y1={PAD} x2={PAD + index * ((VIEW - PAD * 2) / 12)} y2={VIEW - PAD} />
                    <line x1={PAD} y1={PAD + index * ((VIEW - PAD * 2) / 12)} x2={VIEW - PAD} y2={PAD + index * ((VIEW - PAD * 2) / 12)} />
                  </g>
                ))}
                <rect
                  className="builder-bounds"
                  x={Math.min(boundsStart.x, boundsEnd.x)}
                  y={Math.min(boundsStart.y, boundsEnd.y)}
                  width={Math.abs(boundsEnd.x - boundsStart.x)}
                  height={Math.abs(boundsEnd.y - boundsStart.y)}
                />
                {trajectoryPoints.length > 1 && (
                  <polyline className="builder-route" points={trajectoryPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
                )}
                {visibleZones.map((zone) => {
                  const start = worldToView(bounds, zone.lo[0], zone.lo[2], viewport);
                  const end = worldToView(bounds, zone.hi[0], zone.hi[2], viewport);
                  const selected = (selection.kind === "zone" || selection.kind === "zone-point") && selection.id === zone.id;
                  const invalid = !pointInBounds(zone.lo, bounds)
                    || !pointInBounds(zone.hi, bounds)
                    || Boolean(zone.floorId && !floors.some((floor) => floor.id === zone.floorId));
                  const polygonPoints = zone.points && zone.points.length >= 3
                    ? polygonPointsAttribute(bounds, zone.points, viewport)
                    : undefined;
                  return (
                    <g key={zone.id} opacity={zone.enabled ? 1 : 0.38}>
                      {polygonPoints ? (
                        <polygon
                          className={`builder-zone builder-zone--${zone.type} ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                          points={polygonPoints}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelection({ kind: "zone", id: zone.id });
                            setTool("move");
                            setDragging({ kind: "zone", id: zone.id });
                          }}
                        />
                      ) : (
                        <rect
                          className={`builder-zone builder-zone--${zone.type} ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                          x={Math.min(start.x, end.x)}
                          y={Math.min(start.y, end.y)}
                          width={Math.abs(end.x - start.x)}
                          height={Math.abs(end.y - start.y)}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelection({ kind: "zone", id: zone.id });
                            setTool("move");
                            setDragging({ kind: "zone", id: zone.id });
                          }}
                        />
                      )}
                      <text className="builder-object-label" x={Math.min(start.x, end.x) + 8} y={Math.min(start.y, end.y) + 16}>{zone.label}</text>
                      {selected && zone.points?.map((point, pointIndex) => {
                        const view = worldToView(bounds, point[0], point[2], viewport);
                        const pointSelected = selection.kind === "zone-point" && selection.id === zone.id && selection.index === pointIndex;
                        return (
                          <circle
                            key={`${zone.id}-point-${pointIndex}`}
                            className={`builder-zone-vertex ${pointSelected ? "is-selected" : ""}`}
                            cx={view.x}
                            cy={view.y}
                            r={pointSelected ? 5.8 : 4.3}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setSelection({ kind: "zone-point", id: zone.id, index: pointIndex });
                              setTool("move");
                              setDragging({ kind: "zone-point", id: zone.id, index: pointIndex });
                            }}
                          />
                        );
                      })}
                    </g>
                  );
                })}
                {visibleEntries.map((entry) => {
                  const destination = entry.targetEntryId ? entries.find((item) => item.id === entry.targetEntryId) : undefined;
                  if (!destination) return null;
                  const start = worldToView(bounds, entry.position[0], entry.position[2], viewport);
                  const end = worldToView(bounds, destination.position[0], destination.position[2], viewport);
                  return (
                    <g key={`${entry.id}-portal-link`} className="builder-portal-link">
                      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                      <circle cx={end.x} cy={end.y} r="3" />
                    </g>
                  );
                })}
                {trajectoryPoints.map((point, index) => {
                  if (trajectoryPoints.length > 80 && index % Math.ceil(trajectoryPoints.length / 80) !== 0 && selection.kind !== "trajectory") return null;
                  const selected = selection.kind === "trajectory" && selection.index === index;
                  const invalid = trajectory[index] ? isInvalidPoint(trajectory[index].position) : false;
                  return (
                    <circle
                      key={`${trajectory[index]?.name ?? "pose"}-${index}`}
                      className={`builder-trajectory-point ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                      cx={point.x}
                      cy={point.y}
                      r={selected ? 5 : 2.8}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelection({ kind: "trajectory", index });
                        setTool("trajectory");
                        setDragging({ kind: "trajectory", index });
                      }}
                    />
                  );
                })}
                {routePlaybackPose && (() => {
                  const point = worldToView(bounds, routePlaybackPose.position[0], routePlaybackPose.position[2], viewport);
                  return (
                    <g>
                      <circle className="builder-route-playhead" cx={point.x} cy={point.y} r="7" />
                      <text className="builder-object-label" x={point.x + 11} y={point.y - 8}>Playback</text>
                    </g>
                  );
                })()}
                {visibleCollectibles.map((item) => {
                  const point = worldToView(bounds, item.position[0], item.position[2], viewport);
                  const selected = selection.kind === "spot" && selection.id === item.id;
                  const invalid = isInvalidPoint(item.position);
                  return (
                    <g key={item.id}>
                      <circle
                        className={`builder-spot ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                        cx={point.x}
                        cy={point.y}
                        r={selected ? 7 : 5}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelection({ kind: "spot", id: item.id });
                          setTool("select");
                          setDragging({ kind: "spot", id: item.id });
                        }}
                      />
                      {selected && <text className="builder-object-label" x={point.x + 10} y={point.y - 8}>{item.label ?? item.id}</text>}
                    </g>
                  );
                })}
                {visibleEntries.map((entry) => {
                  const point = worldToView(bounds, entry.position[0], entry.position[2], viewport);
                  const selected = selection.kind === "entry" && selection.id === entry.id;
                  const invalid = isInvalidPoint(entry.position, entry.floorId);
                  const yaw = entry.yaw ?? 0;
                  return (
                    <g key={entry.id} opacity={entry.enabled === false ? 0.42 : 1}>
                      <rect
                        className={`builder-entry builder-entry--${entry.kind ?? "entry"} ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                        x={point.x - 6}
                        y={point.y - 6}
                        width="12"
                        height="12"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelection({ kind: "entry", id: entry.id });
                          setTool("select");
                          setDragging({ kind: "entry", id: entry.id });
                        }}
                      />
                      <line
                        className={`builder-entry-heading builder-entry-heading--${entry.kind ?? "entry"}`}
                        x1={point.x}
                        y1={point.y}
                        x2={point.x + Math.sin(yaw) * 16}
                        y2={point.y - Math.cos(yaw) * 16}
                      />
                      <text className="builder-object-label" x={point.x + 10} y={point.y - 8}>{entry.label}</text>
                    </g>
                  );
                })}
                {observerVisible && observerSpawn && (() => {
                  const point = worldToView(bounds, observerSpawn[0], observerSpawn[2], viewport);
                  const selected = selection.kind === "observer";
                  const invalid = isInvalidPoint(observerSpawn);
                  return (
                    <g key="observer-spawn">
                      <path
                        className={`builder-observer ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                        d={`M ${point.x - 8} ${point.y} L ${point.x} ${point.y - 8} L ${point.x + 8} ${point.y} L ${point.x} ${point.y + 8} Z`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelection({ kind: "observer" });
                          setTool("select");
                          setDragging({ kind: "observer" });
                        }}
                      />
                      <text className="builder-object-label" x={point.x + 11} y={point.y + 4}>Observer</text>
                    </g>
                  );
                })()}
                {visibleRespawns.map((respawn) => {
                  const point = worldToView(bounds, respawn.position[0], respawn.position[2], viewport);
                  const selected = selection.kind === "respawn" && selection.id === respawn.id;
                  const invalid = isInvalidPoint(respawn.position);
                  return (
                    <g key={respawn.id}>
                      <rect
                        className={`builder-respawn ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                        x={point.x - 7}
                        y={point.y - 7}
                        width="14"
                        height="14"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelection({ kind: "respawn", id: respawn.id });
                          setTool("select");
                          setDragging({ kind: "respawn", id: respawn.id });
                        }}
                      />
                      <line
                        className="builder-respawn-heading"
                        x1={point.x}
                        y1={point.y}
                        x2={point.x + Math.sin(respawn.yaw) * 16}
                        y2={point.y - Math.cos(respawn.yaw) * 16}
                      />
                      <text className="builder-object-label" x={point.x + 11} y={point.y + 4}>{respawn.label}</text>
                    </g>
                  );
                })}
                {visibleProps.map((prop) => {
                  const point = worldToView(bounds, prop.position[0], prop.position[2], viewport);
                  const selected = selection.kind === "prop" && selection.id === prop.id;
                  const invalid = isInvalidPoint(prop.position, prop.floorId) || prop.scale.some((value) => value <= 0);
                  const size = selected ? 8 : 6;
                  return (
                    <g key={prop.id} opacity={prop.enabled ? 1 : 0.42}>
                      {prop.kind === "light" || prop.kind === "beacon" ? (
                        <circle
                          className={`builder-prop ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                          cx={point.x}
                          cy={point.y}
                          r={size}
                          style={{ color: prop.color }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelection({ kind: "prop", id: prop.id });
                            setTool("select");
                            setDragging({ kind: "prop", id: prop.id });
                          }}
                        />
                      ) : (
                        <rect
                          className={`builder-prop ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                          x={point.x - size}
                          y={point.y - size}
                          width={size * 2}
                          height={size * 2}
                          style={{ color: prop.color }}
                          transform={`rotate(${toDegrees(prop.rotation.y)} ${point.x} ${point.y})`}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelection({ kind: "prop", id: prop.id });
                            setTool("select");
                            setDragging({ kind: "prop", id: prop.id });
                          }}
                        />
                      )}
                      <text className="builder-object-label" x={point.x + 11} y={point.y + 4}>{prop.label}</text>
                    </g>
                  );
                })}
                {visibleSounds.map((sound) => {
                  const point = worldToView(bounds, sound.position[0], sound.position[2], viewport);
                  const edge = worldToView(bounds, sound.position[0] + sound.radius, sound.position[2], viewport);
                  const selected = selection.kind === "sound" && selection.id === sound.id;
                  const invalid = isInvalidPoint(sound.position, sound.floorId) || sound.radius <= 0;
                  const rangeRadius = Math.max(10, Math.min(90, Math.abs(edge.x - point.x)));
                  return (
                    <g key={sound.id} opacity={sound.enabled ? 1 : 0.42}>
                      <circle
                        className={`builder-sound-range ${selected ? "is-selected" : ""}`}
                        cx={point.x}
                        cy={point.y}
                        r={rangeRadius}
                      />
                      <path
                        className={`builder-sound ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                        d={`M ${point.x - 8} ${point.y + 6} L ${point.x - 2} ${point.y + 6} L ${point.x + 6} ${point.y + 12} L ${point.x + 6} ${point.y - 12} L ${point.x - 2} ${point.y - 6} L ${point.x - 8} ${point.y - 6} Z`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelection({ kind: "sound", id: sound.id });
                          setTool("select");
                          setDragging({ kind: "sound", id: sound.id });
                        }}
                      />
                      <text className="builder-object-label" x={point.x + 13} y={point.y + 4}>{sound.label}</text>
                    </g>
                  );
                })}
                {visibleStorySteps.length > 1 && (
                  <polyline
                    className="builder-story-path"
                    points={visibleStorySteps
                      .filter((step) => step.position && !step.hidden)
                      .map((step) => {
                        const point = worldToView(bounds, step.position![0], step.position![2], viewport);
                        return `${point.x},${point.y}`;
                      }).join(" ")}
                  />
                )}
                {visibleStorySteps.map((step, index) => {
                  if (!step.position) return null;
                  const point = worldToView(bounds, step.position[0], step.position[2], viewport);
                  const selected = selection.kind === "story-step" && selection.id === step.id;
                  const invalid = isInvalidPoint(step.position, step.floorId);
                  return (
                    <g key={step.id} opacity={step.hidden ? 0.42 : 1}>
                      <circle
                        className={`builder-story-point ${selected ? "is-selected" : ""} ${invalid ? "is-invalid" : ""}`}
                        cx={point.x}
                        cy={point.y}
                        r={selected ? 8 : 6}
                        style={{ color: storyPointColor(step.type) }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelection({ kind: "story-step", id: step.id });
                          setTool("story");
                          setDragging({ kind: "story-step", id: step.id });
                        }}
                      />
                      <text className="builder-story-index" x={point.x} y={point.y + 3}>{index + 1}</text>
                      <text className="builder-object-label" x={point.x + 12} y={point.y - 8}>{step.label}</text>
                    </g>
                  );
                })}
                {gaussians.map((layer) => {
                  const point = worldToView(bounds, layer.position[0], layer.position[2], viewport);
                  const selected = selection.kind === "gaussian" && selection.id === layer.id;
                  return (
                    <g key={layer.id} opacity={layer.enabled ? 1 : 0.42}>
                      <path
                        className={`builder-gaussian ${selected ? "is-selected" : ""} ${layer.active ? "is-active-layer" : ""} ${layer.locked ? "is-locked" : ""}`}
                        d={`M ${point.x} ${point.y - 8} L ${point.x + 7} ${point.y + 6} L ${point.x - 7} ${point.y + 6} Z`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelection({ kind: "gaussian", id: layer.id });
                          setTool("select");
                          if (!layer.locked) setDragging({ kind: "gaussian", id: layer.id });
                        }}
                      />
                      <text className="builder-object-label" x={point.x + 10} y={point.y + 3}>{layer.label}</text>
                    </g>
                  );
                })}
                <circle
                  className={`builder-spawn ${selection.kind === "spawn" ? "is-selected" : ""} ${isInvalidPoint(spawn) ? "is-invalid" : ""}`}
                  cx={worldToView(bounds, spawn[0], spawn[2], viewport).x}
                  cy={worldToView(bounds, spawn[0], spawn[2], viewport).y}
                  r="8"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelection({ kind: "spawn" });
                    setTool("select");
                    setDragging({ kind: "spawn" });
                  }}
                />
                <text
                  className="builder-object-label"
                  x={worldToView(bounds, spawn[0], spawn[2], viewport).x + 11}
                  y={worldToView(bounds, spawn[0], spawn[2], viewport).y + 4}
                >
                  Spawn
                </text>
                <circle className="builder-player" cx={worldToView(bounds, player.x, player.z, viewport).x} cy={worldToView(bounds, player.x, player.z, viewport).y} r="4" />
              </svg>
            </div>
          </div>
          <div className="builder-map-meta">
            <span>Drag objects to move. Click empty map to move selected. Shift-drag pans, wheel zooms.</span>
            <span>{editingFloor.label}: {editingFloor.yMin.toFixed(1)} to {editingFloor.yMax.toFixed(1)}</span>
          </div>
          <div className="builder-layer-strip" aria-label="Editor layers and timeline">
            <div>
              <strong>Gaussians</strong>
              <span>{gaussians.filter((layer) => layer.enabled).length}/{gaussians.length} active</span>
            </div>
            <div>
              <strong>Trajectory</strong>
              <span>{trajectory.length} points</span>
            </div>
            <div>
              <strong>Props</strong>
              <span>{creativeProps.length} objects</span>
            </div>
            <div>
              <strong>Scripts</strong>
              <span>{scripts.filter((script) => script.enabled).length}/{scripts.length} active</span>
            </div>
            <div>
              <strong>Sounds</strong>
              <span>{ambientSounds.filter((sound) => sound.enabled).length}/{ambientSounds.length} active</span>
            </div>
            <div>
              <strong>Story</strong>
              <span>{story.steps.length} steps</span>
            </div>
            <div>
              <strong>Cleanup</strong>
              <span>{editorZones.filter((zone) => zone.type === "cleanup").length} masks</span>
            </div>
            <div>
              <strong>FPV</strong>
              <span>{combat.enabled ? `${combat.respawnPoints.length} spawns` : "off"}</span>
            </div>
          </div>
        </main>

        <aside className="builder-sidebar builder-inspector">
          <section className="builder-section builder-inspector-outliner">
            <strong>Objects</strong>
            <div className="builder-object-list">
              <button
                type="button"
                className={selection.kind === "spawn" ? "is-active" : ""}
                onClick={() => setSelection({ kind: "spawn" })}
              >
                Spawn
              </button>
              {observerSpawn && (
                <button
                  type="button"
                  className={selection.kind === "observer" ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "observer" })}
                >
                  Observer spawn
                </button>
              )}
              {visibleRespawns.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  className={selection.kind === "respawn" && selection.id === point.id ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "respawn", id: point.id })}
                >
                  {point.label}
                </button>
              ))}
              {visibleCollectibles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={selection.kind === "spot" && selection.id === item.id ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "spot", id: item.id })}
                >
                  {item.label ?? item.id}
                </button>
              ))}
              {visibleEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={selection.kind === "entry" && selection.id === entry.id ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "entry", id: entry.id })}
                >
                  {entry.label}
                </button>
              ))}
              {visibleProps.map((prop) => (
                <button
                  key={prop.id}
                  type="button"
                  className={selection.kind === "prop" && selection.id === prop.id ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "prop", id: prop.id })}
                >
                  {prop.label}
                </button>
              ))}
              {visibleSounds.map((sound) => (
                <button
                  key={sound.id}
                  type="button"
                  className={selection.kind === "sound" && selection.id === sound.id ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "sound", id: sound.id })}
                >
                  {sound.label}
                </button>
              ))}
              {scripts.map((script) => (
                <button
                  key={script.id}
                  type="button"
                  className={selection.kind === "script" && selection.id === script.id ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "script", id: script.id })}
                >
                  {script.label}
                </button>
              ))}
              {visibleZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  className={selection.kind === "zone" && selection.id === zone.id ? "is-active" : ""}
                  onClick={() => setSelection({ kind: "zone", id: zone.id })}
                >
                  {zone.label}
                </button>
              ))}
            </div>
          </section>

          {tool === "prop" && (
            <section className="builder-section">
              <strong>Prefab library</strong>
              <div className="builder-prefab-grid">
                {assetLibrary.map((prefab) => (
                  <button
                    key={prefab.id}
                    type="button"
                    className={activePrefab.id === prefab.id ? "is-active" : ""}
                    onClick={() => {
                      setActivePrefabId(prefab.id);
                      setTool("prop");
                    }}
                  >
                    <b>{prefab.label}</b>
                    <span>{prefab.assetUrl ? "GLB URL" : prefab.kind}{prefab.script ? " + script" : ""}</span>
                  </button>
                ))}
              </div>
              <div className="builder-actions">
                <button type="button" onClick={() => addPrefab(activePrefab, [0, 0, 0])}>Add origin</button>
                <button type="button" onClick={() => addPrefab(activePrefab, [player.x, activeY(player, editingFloor), player.z])}>Add player</button>
              </div>
              <p>Choose a prefab or GLB, then click the map to place it precisely.</p>
            </section>
          )}

          {tool === "cleanup" && (
            <section className="builder-section builder-mode-section">
              <strong>Cleanup masks</strong>
              <div className="builder-route-readout">
                <span>{cleanupZones.length} masks</span>
                <span>{cleanupZones.filter((zone) => zone.enabled).length} enabled</span>
              </div>
              <div className="builder-actions">
                <button type="button" onClick={() => addZone([player.x, activeY(player, editingFloor), player.z], "cleanup")}>Add mask</button>
                <button type="button" onClick={convertSelectedZoneToPolygon} disabled={!selectedZone || selectedZone.type !== "cleanup"}>Polygon</button>
                <button type="button" onClick={clearSelectedZonePolygon} disabled={!selectedZone?.points?.length}>Box</button>
                <button type="button" onClick={clampObjectsToPlayableArea}>Repair positions</button>
              </div>
              <div className="builder-object-list">
                {cleanupZones.length === 0 ? <span className="builder-empty-row">No cleanup masks</span> : cleanupZones.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    className={selection.kind === "zone" && selection.id === zone.id ? "is-active" : ""}
                    onClick={() => {
                      setSelection({ kind: "zone", id: zone.id });
                      setTool("cleanup");
                    }}
                  >
                    {zone.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="builder-section">
            <strong>Properties</strong>
            <div className="builder-selected-title">{selectedLabel}</div>
            {selectedPosition && (
              <div className="builder-fields">
                {(["X", "Y", "Z"] as const).map((axis, index) => (
                  <label key={axis}>
                    <span>{axis}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={selectedPosition[index]}
                      onChange={(event) => updateSelectedPosition(index, numberValue(event.currentTarget.value, selectedPosition[index]))}
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="builder-nudge-grid">
              <button type="button" onClick={() => nudgeSelected(-nudgeStep, 0, 0)}>X-</button>
              <button type="button" onClick={() => nudgeSelected(nudgeStep, 0, 0)}>X+</button>
              <button type="button" onClick={() => nudgeSelected(0, -nudgeStep, 0)}>Y-</button>
              <button type="button" onClick={() => nudgeSelected(0, nudgeStep, 0)}>Y+</button>
              <button type="button" onClick={() => nudgeSelected(0, 0, -nudgeStep)}>Z-</button>
              <button type="button" onClick={() => nudgeSelected(0, 0, nudgeStep)}>Z+</button>
            </div>
            <div className="builder-actions">
              <button type="button" onClick={() => placePoint([player.x, player.y, player.z])}>Move to player</button>
              <button type="button" onClick={() => moveSelectedToFloor(editingFloor)}>Move to floor</button>
              <button type="button" disabled={!transformPast.length} onClick={undoTransformEdit}>Undo transform</button>
              <button type="button" disabled={!transformFuture.length} onClick={redoTransformEdit}>Redo transform</button>
              {selection.kind !== "spawn" && selection.kind !== "observer" && <button type="button" onClick={duplicateSelected}>Duplicate</button>}
              {selection.kind !== "spawn" && <button type="button" onClick={deleteSelected}>Delete</button>}
            </div>
          </section>

          {selection.kind === "observer" && (
            <section className="builder-section">
              <strong>Observer spawn</strong>
              <div className="builder-actions">
                <button type="button" onClick={() => patch({ combat: { ...combat, observerSpawn: [player.x, player.y, player.z] } })}>Set to player</button>
                <button type="button" onClick={() => patch({ combat: { ...combat, observerSpawn: spawn } })}>Set to home</button>
                <button type="button" onClick={() => playTestFrom(combat.observerSpawn)}>Play from here</button>
              </div>
              <p>Observer mode starts here for spectators and non-playing users.</p>
            </section>
          )}

          {selectedRespawn && (
            <section className="builder-section">
              <strong>Respawn point</strong>
              <label>
                <span>Label</span>
                <input
                  value={selectedRespawn.label}
                  onChange={(event) => patch({
                    combat: {
                      ...combat,
                      respawnPoints: combat.respawnPoints.map((point) => (
                        point.id === selectedRespawn.id ? { ...point, label: event.currentTarget.value } : point
                      )),
                    },
                  })}
                />
              </label>
              <label>
                <span>Team</span>
                <input
                  value={selectedRespawn.team ?? ""}
                  onChange={(event) => patch({
                    combat: {
                      ...combat,
                      respawnPoints: combat.respawnPoints.map((point) => (
                        point.id === selectedRespawn.id ? { ...point, team: event.currentTarget.value || undefined } : point
                      )),
                    },
                  })}
                />
              </label>
              <label>
                <span>Yaw</span>
                <input
                  type="number"
                  step="1"
                  value={toDegrees(selectedRespawn.yaw)}
                  onChange={(event) => patch({
                    combat: {
                      ...combat,
                      respawnPoints: combat.respawnPoints.map((point) => (
                        point.id === selectedRespawn.id ? { ...point, yaw: toRadians(numberValue(event.currentTarget.value, toDegrees(point.yaw))) } : point
                      )),
                    },
                  })}
                />
              </label>
              <div className="builder-actions">
                <button
                  type="button"
                  onClick={() => patch({
                    combat: {
                      ...combat,
                      respawnPoints: combat.respawnPoints.map((point) => (
                        point.id === selectedRespawn.id ? { ...point, position: [player.x, player.y, player.z], yaw: player.yaw } : point
                      )),
                    },
                  })}
                >
                  Set to player
                </button>
                <button type="button" onClick={() => playTestFrom(selectedRespawn.position)}>Play from here</button>
              </div>
            </section>
          )}

          {selectedProp && (
            <section className="builder-section">
              <strong>Creative prop</strong>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedProp.enabled}
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, enabled: event.currentTarget.checked } : prop
                    )),
                  })}
                />
                <span>Enabled</span>
              </label>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedProp.collidable ?? defaultPropCollidable(selectedProp.kind)}
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, collidable: event.currentTarget.checked } : prop
                    )),
                  })}
                />
                <span>Blocks flight</span>
              </label>
              <label>
                <span>Label</span>
                <input
                  value={selectedProp.label}
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, label: event.currentTarget.value } : prop
                    )),
                  })}
                />
              </label>
              <label>
                <span>Kind</span>
                <select
                  value={selectedProp.kind}
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, kind: event.currentTarget.value as CreativePropKind } : prop
                    )),
                  })}
                >
                  {PROP_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label>
                <span>Asset URL</span>
                <input
                  value={selectedProp.assetUrl ?? ""}
                  placeholder="https://.../model.glb"
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, assetUrl: event.currentTarget.value.trim() || undefined } : prop
                    )),
                  })}
                />
              </label>
              {selectedProp.assetUrl && !isLikelyGlbUrl(selectedProp.assetUrl) && (
                <p>Asset URL should point directly to a .glb or .gltf file. The viewport will show a red fallback if loading fails.</p>
              )}
              <label>
                <span>Tag</span>
                <input
                  value={selectedProp.gameplayTag ?? ""}
                  placeholder="cover, treasure, spawn-kit"
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, gameplayTag: event.currentTarget.value || undefined } : prop
                    )),
                  })}
                />
              </label>
              <label>
                <span>Color</span>
                <input
                  type="color"
                  value={selectedProp.color}
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, color: event.currentTarget.value } : prop
                    )),
                  })}
                />
              </label>
              <div className="builder-fields">
                {(["SX", "SY", "SZ"] as const).map((axis, index) => (
                  <label key={axis}>
                    <span>{axis}</span>
                    <input
                      type="number"
                      min="0.05"
                      step="0.05"
                      value={selectedProp.scale[index]}
                      onChange={(event) => patch({
                        creativeProps: creativeProps.map((prop) => {
                          if (prop.id !== selectedProp.id) return prop;
                          const scale = cloneTuple(prop.scale);
                          scale[index] = Math.max(0.05, numberValue(event.currentTarget.value, scale[index]));
                          return { ...prop, scale };
                        }),
                      })}
                    />
                  </label>
                ))}
              </div>
              <div className="builder-fields">
                {(["RX", "RY", "RZ"] as const).map((axis, index) => (
                  <label key={axis}>
                    <span>{axis}</span>
                    <input
                      type="number"
                      step="1"
                      value={toDegrees([selectedProp.rotation.x, selectedProp.rotation.y, selectedProp.rotation.z][index])}
                      onChange={(event) => patch({
                        creativeProps: creativeProps.map((prop) => {
                          if (prop.id !== selectedProp.id) return prop;
                          const rotation = { ...prop.rotation };
                          const key = ["x", "y", "z"][index] as "x" | "y" | "z";
                          rotation[key] = toRadians(numberValue(event.currentTarget.value, toDegrees(rotation[key])));
                          return { ...prop, rotation };
                        }),
                      })}
                    />
                  </label>
                ))}
              </div>
              <label>
                <span>Script</span>
                <select
                  value={selectedProp.scriptId ?? ""}
                  onChange={(event) => patch({
                    creativeProps: creativeProps.map((prop) => (
                      prop.id === selectedProp.id ? { ...prop, scriptId: event.currentTarget.value || undefined } : prop
                    )),
                  })}
                >
                  <option value="">None</option>
                  {scripts.map((script) => <option key={script.id} value={script.id}>{script.label}</option>)}
                </select>
              </label>
              <div className="builder-actions">
                <button type="button" onClick={() => addScript("onInteract", selectedProp.id)}>New script</button>
                <button type="button" onClick={() => placePoint(pointForFloor(selectedProp.position, bounds, floors, editingFloor.id))}>Snap floor</button>
                <button type="button" onClick={resetPropTransform}>Reset transform</button>
                <button type="button" onClick={duplicateSelected}>Duplicate</button>
                <button type="button" onClick={deleteSelected}>Delete</button>
              </div>
            </section>
          )}

          {selectedSound && (
            <section className="builder-section">
              <strong>Ambient sound</strong>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedSound.enabled}
                  onChange={(event) => patch({
                    ambientSounds: ambientSounds.map((sound) => (
                      sound.id === selectedSound.id ? { ...sound, enabled: event.currentTarget.checked } : sound
                    )),
                  })}
                />
                <span>Enabled</span>
              </label>
              <label>
                <span>Label</span>
                <input
                  value={selectedSound.label}
                  onChange={(event) => patch({
                    ambientSounds: ambientSounds.map((sound) => (
                      sound.id === selectedSound.id ? { ...sound, label: event.currentTarget.value } : sound
                    )),
                  })}
                />
              </label>
              <label>
                <span>Kind</span>
                <select
                  value={selectedSound.kind}
                  onChange={(event) => patch({
                    ambientSounds: ambientSounds.map((sound) => (
                      sound.id === selectedSound.id ? { ...sound, kind: event.currentTarget.value as AmbientSoundKind } : sound
                    )),
                  })}
                >
                  {AMBIENT_SOUND_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label>
                <span>Floor</span>
                <select
                  value={selectedSound.floorId ?? ""}
                  onChange={(event) => patch({
                    ambientSounds: ambientSounds.map((sound) => (
                      sound.id === selectedSound.id ? { ...sound, floorId: event.currentTarget.value || undefined } : sound
                    )),
                  })}
                >
                  <option value="">All floors</option>
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>{floor.label}</option>
                  ))}
                </select>
              </label>
              <div className="builder-fields">
                <label>
                  <span>Radius</span>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={selectedSound.radius}
                    onChange={(event) => patch({
                      ambientSounds: ambientSounds.map((sound) => (
                        sound.id === selectedSound.id ? { ...sound, radius: Math.max(1, numberValue(event.currentTarget.value, sound.radius)) } : sound
                      )),
                    })}
                  />
                </label>
                <label>
                  <span>Every sec</span>
                  <input
                    type="number"
                    min="1.2"
                    step="0.5"
                    value={selectedSound.intervalSeconds}
                    onChange={(event) => patch({
                      ambientSounds: ambientSounds.map((sound) => (
                        sound.id === selectedSound.id ? { ...sound, intervalSeconds: Math.max(1.2, numberValue(event.currentTarget.value, sound.intervalSeconds)) } : sound
                      )),
                    })}
                  />
                </label>
              </div>
              <label>
                <span>Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedSound.volume}
                  onChange={(event) => patch({
                    ambientSounds: ambientSounds.map((sound) => (
                      sound.id === selectedSound.id ? { ...sound, volume: clamp(numberValue(event.currentTarget.value, sound.volume), 0, 1) } : sound
                    )),
                  })}
                />
              </label>
            </section>
          )}

          {selectedScript && (
            <section className="builder-section">
              <strong>Script</strong>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedScript.enabled}
                  onChange={(event) => patch({
                    scripts: scripts.map((script) => (
                      script.id === selectedScript.id ? { ...script, enabled: event.currentTarget.checked } : script
                    )),
                  })}
                />
                <span>Enabled</span>
              </label>
              <label>
                <span>Label</span>
                <input
                  value={selectedScript.label}
                  onChange={(event) => patch({
                    scripts: scripts.map((script) => (
                      script.id === selectedScript.id ? { ...script, label: event.currentTarget.value } : script
                    )),
                  })}
                />
              </label>
              <label>
                <span>Trigger</span>
                <select
                  value={selectedScript.trigger}
                  onChange={(event) => {
                    const trigger = event.currentTarget.value as CreativeScriptTrigger;
                    patch({
                      scripts: scripts.map((script) => (
                        script.id === selectedScript.id ? { ...script, trigger, source: script.source || defaultScriptSource(trigger) } : script
                      )),
                    });
                  }}
                >
                  {SCRIPT_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{trigger}</option>)}
                </select>
              </label>
              <label>
                <span>Target</span>
                <select
                  value={selectedScript.targetId ?? ""}
                  onChange={(event) => patch({
                    scripts: scripts.map((script) => (
                      script.id === selectedScript.id ? { ...script, targetId: event.currentTarget.value || undefined } : script
                    )),
                  })}
                >
                  <option value="">Global</option>
                  {creativeProps.map((prop) => <option key={prop.id} value={prop.id}>{prop.label}</option>)}
                  {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  {collectibles.map((spot) => <option key={spot.id} value={spot.id}>{spot.label ?? spot.id}</option>)}
                </select>
              </label>
              <label>
                <span>Code</span>
                <textarea
                  className="builder-code"
                  value={selectedScript.source}
                  spellCheck={false}
                  onChange={(event) => patch({
                    scripts: scripts.map((script) => (
                      script.id === selectedScript.id ? { ...script, source: event.currentTarget.value } : script
                    )),
                  })}
                />
              </label>
              <div className="builder-script-help">
                <span>Commands</span>
                <code>showMessage('text')</code>
                <code>setObjective('text')</code>
                <code>addScore(1)</code>
                <code>setHealth(100)</code>
                <code>returnHome()</code>
                <code>completeStoryStep()</code>
              </div>
            </section>
          )}

          {selectedSpot && (
            <section className="builder-section">
              <strong>Green spot</strong>
              <label>
                <span>Label</span>
                <input
                  value={selectedSpot.label ?? ""}
                  onChange={(event) => patch({
                    collectibles: collectibles.map((item) => (
                      item.id === selectedSpot.id ? { ...item, label: event.currentTarget.value } : item
                    )),
                  })}
                />
              </label>
            </section>
          )}

          {tool === "trajectory" && (
            <section className="builder-section builder-mode-section">
              <strong>Trajectory editor</strong>
              <div className="builder-route-readout">
                <span>{trajectory.length} points</span>
                <b>{routePlayback ? `playing ${routePlaybackIndex + 1}` : routePlaybackPose ? `at ${routePlaybackIndex + 1}` : "ready"}</b>
              </div>
              <div className="builder-actions">
                <button type="button" onClick={addTrajectoryPointAtPlayer}>Add player point</button>
                <button type="button" onClick={() => addTrajectoryPoint([spawn[0], spawn[1], spawn[2]])}>Add spawn point</button>
                <button type="button" onClick={smoothTrajectory} disabled={trajectory.length < 4}>Smooth</button>
                <button type="button" onClick={simplifyTrajectory} disabled={trajectory.length < 4}>Simplify</button>
                <button type="button" onClick={snapTrajectoryToFloor} disabled={trajectory.length < 1}>Snap floor</button>
              </div>
              <div className="builder-route-playback">
                <button
                  type="button"
                  onClick={() => {
                    if (trajectory.length < 2) return;
                    setRoutePlaybackIndex((index) => Math.min(index, trajectory.length - 1));
                    setRoutePlayback((value) => !value);
                  }}
                  disabled={trajectory.length < 2}
                >
                  {routePlayback ? "Pause preview" : "Preview route"}
                </button>
                <button type="button" onClick={() => setRoutePlaybackIndex(0)} disabled={trajectory.length < 1}>Start</button>
                <button type="button" onClick={onWatchRoute} disabled={!onWatchRoute || trajectory.length < 2}>Play route</button>
                <label>
                  <span>Speed</span>
                  <input
                    type="number"
                    min="0.2"
                    max="4"
                    step="0.1"
                    value={routePlaybackSpeed}
                    onChange={(event) => setRoutePlaybackSpeed(clamp(numberValue(event.currentTarget.value, routePlaybackSpeed), 0.2, 4))}
                  />
                </label>
              </div>
              <div className="builder-actions">
                <button type="button" onClick={onToggleRecording} disabled={!onToggleRecording}>
                  {recording || videoRecording ? "Stop recording" : "Record route"}
                </button>
                <button type="button" onClick={onRecordRouteVideo} disabled={!onRecordRouteVideo || (trajectory.length < 2 && !videoRecording)}>
                  {videoRecording && !recording ? "Stop video" : "Route video"}
                </button>
                <button type="button" onClick={exportTrajectory} disabled={trajectory.length < 1}>Export JSON</button>
                <button type="button" onClick={() => routeImportRef.current?.click()}>Import JSON</button>
                {videoUrl && <a className="builder-download-link" href={videoUrl} download="scene-flight.webm">Download webm</a>}
              </div>
              <input
                ref={routeImportRef}
                type="file"
                accept="application/json,.json"
                className="builder-hidden-file"
                onChange={(event) => importTrajectory(event.currentTarget.files)}
              />
              <div className="builder-route-list">
                {trajectory.slice(0, 80).map((pose, index) => (
                  <button
                    key={`${pose.name ?? "route"}-${index}`}
                    type="button"
                    className={selection.kind === "trajectory" && selection.index === index ? "is-active" : ""}
                    onClick={() => {
                      setSelection({ kind: "trajectory", index });
                      setRoutePlaybackIndex(index);
                    }}
                  >
                    <span>{index + 1}</span>
                    <b>{pose.name ?? `point-${index + 1}`}</b>
                    <em>{formatPoint(pose.position)}</em>
                  </button>
                ))}
                {trajectory.length > 80 && <p>{trajectory.length - 80} more points hidden in list; map still shows sampled route.</p>}
              </div>
            </section>
          )}

          {selectedTrajectory && selection.kind === "trajectory" && (
            <section className="builder-section">
              <strong>Trajectory point</strong>
              <label>
                <span>Name</span>
                <input
                  value={selectedTrajectory.name ?? `point-${selection.index + 1}`}
                  onChange={(event) => patch({
                    trajectory: trajectory.map((pose, index) => (
                      index === selection.index ? { ...pose, name: event.currentTarget.value } : pose
                    )),
                  })}
                />
              </label>
              <div className="builder-actions">
                <button type="button" onClick={() => moveTrajectoryPoint(selection.index, -1)} disabled={selection.index === 0}>Move up</button>
                <button type="button" onClick={() => moveTrajectoryPoint(selection.index, 1)} disabled={selection.index >= trajectory.length - 1}>Move down</button>
                <button type="button" onClick={() => placePoint([player.x, player.y, player.z])}>Point to player</button>
                <button type="button" onClick={() => placePoint(pointForFloor(selectedTrajectory.position, bounds, floors, editingFloor.id))}>Snap floor</button>
                <button type="button" onClick={deleteSelected}>Delete point</button>
              </div>
            </section>
          )}

          {selectedZone && (
            <section className="builder-section">
              <strong>Map area</strong>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedZone.enabled}
                  onChange={(event) => patch({
                    editorZones: editorZones.map((zone) => (
                      zone.id === selectedZone.id ? { ...zone, enabled: event.currentTarget.checked } : zone
                    )),
                  })}
                />
                <span>Enabled</span>
              </label>
              <label>
                <span>Label</span>
                <input
                  value={selectedZone.label}
                  onChange={(event) => patch({
                    editorZones: editorZones.map((zone) => (
                      zone.id === selectedZone.id ? { ...zone, label: event.currentTarget.value } : zone
                    )),
                  })}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={selectedZone.type}
                  onChange={(event) => patch({
                    editorZones: editorZones.map((zone) => (
                      zone.id === selectedZone.id ? { ...zone, type: event.currentTarget.value as EditorZoneType } : zone
                    )),
                  })}
                >
                  {ZONE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>
                <span>Floor</span>
                <select
                  value={selectedZone.floorId ?? ""}
                  onChange={(event) => patch({
                    editorZones: editorZones.map((zone) => (
                      zone.id === selectedZone.id ? { ...zone, floorId: event.currentTarget.value || undefined } : zone
                    )),
                  })}
                >
                  <option value="">All floors</option>
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>{floor.label}</option>
                  ))}
                </select>
              </label>
              <div className="builder-fields">
                {(["X", "Y", "Z"] as const).map((axis, index) => (
                  <label key={axis}>
                    <span>{axis} min/max</span>
                    <input
                      type="number"
                      step="0.1"
                      value={selectedZone.lo[index]}
                      onChange={(event) => patch({
                        editorZones: editorZones.map((zone) => {
                          if (zone.id !== selectedZone.id) return zone;
                          const lo = cloneTuple(zone.lo);
                          lo[index] = numberValue(event.currentTarget.value, lo[index]);
                          return normalizeZone({ ...zone, lo });
                        }),
                      })}
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={selectedZone.hi[index]}
                      onChange={(event) => patch({
                        editorZones: editorZones.map((zone) => {
                          if (zone.id !== selectedZone.id) return zone;
                          const hi = cloneTuple(zone.hi);
                          hi[index] = numberValue(event.currentTarget.value, hi[index]);
                          return normalizeZone({ ...zone, hi });
                        }),
                      })}
                    />
                  </label>
                ))}
              </div>
              <div className="builder-actions">
                <button type="button" onClick={convertSelectedZoneToPolygon}>
                  {selectedZone.points?.length ? "Refresh polygon" : "Make polygon"}
                </button>
                <button type="button" onClick={addSelectedZoneVertexAtPlayer}>Add vertex at player</button>
                {selectedZone.points?.length ? <button type="button" onClick={clearSelectedZonePolygon}>Use rectangle</button> : null}
              </div>
              {selectedZone.points?.length ? (
                <div className="builder-zone-points">
                  {selectedZone.points.map((point, index) => (
                    <button
                      key={`${selectedZone.id}-inspector-point-${index}`}
                      type="button"
                      className={selection.kind === "zone-point" && selection.id === selectedZone.id && selection.index === index ? "is-active" : ""}
                      onClick={() => setSelection({ kind: "zone-point", id: selectedZone.id, index })}
                    >
                      <span>V{index + 1}</span>
                      <b>{point[0].toFixed(1)}, {point[2].toFixed(1)}</b>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          )}

          {selectedEntry && (
            <section className="builder-section">
              <strong>{selectedEntry.kind === "portal" ? "Portal" : selectedEntry.kind === "exit" ? "Exit point" : "Entry point"}</strong>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedEntry.enabled !== false}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id ? { ...entry, enabled: event.currentTarget.checked } : entry
                    )),
                  })}
                />
                <span>Enabled</span>
              </label>
              <label>
                <span>Label</span>
                <input
                  value={selectedEntry.label}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id ? { ...entry, label: event.currentTarget.value } : entry
                    )),
                  })}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={selectedEntry.kind ?? "entry"}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id
                        ? { ...entry, kind: event.currentTarget.value as NonNullable<WorldEntryPoint["kind"]> }
                        : entry
                    )),
                  })}
                >
                  {ENTRY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Floor</span>
                <select
                  value={selectedEntry.floorId}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id ? { ...entry, floorId: event.currentTarget.value } : entry
                    )),
                  })}
                >
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>{floor.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Heading</span>
                <input
                  type="number"
                  step="1"
                  value={toDegrees(selectedEntry.yaw ?? 0)}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id
                        ? { ...entry, yaw: toRadians(numberValue(event.currentTarget.value, toDegrees(entry.yaw ?? 0))) }
                        : entry
                    )),
                  })}
                />
              </label>
              <label>
                <span>Point link</span>
                <select
                  value={selectedEntry.targetEntryId ?? ""}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id ? { ...entry, targetEntryId: event.currentTarget.value || undefined } : entry
                    )),
                  })}
                >
                  <option value="">None</option>
                  {entries.filter((entry) => entry.id !== selectedEntry.id).map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Gaussian</span>
                <select
                  value={selectedEntry.targetGaussianId ?? ""}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id ? { ...entry, targetGaussianId: event.currentTarget.value || undefined } : entry
                    )),
                  })}
                >
                  <option value="">None</option>
                  {gaussians.map((layer) => (
                    <option key={layer.id} value={layer.id}>{layer.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Radius</span>
                <input
                  type="number"
                  min="0.3"
                  step="0.1"
                  value={selectedEntry.radius}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id ? { ...entry, radius: Math.max(0.3, numberValue(event.currentTarget.value, entry.radius)) } : entry
                    )),
                  })}
                />
              </label>
              <label>
                <span>PLY URL</span>
                <input
                  value={selectedEntry.targetPlyUrl ?? ""}
                  onChange={(event) => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id ? { ...entry, targetPlyUrl: event.currentTarget.value || undefined } : entry
                    )),
                  })}
                />
              </label>
              <div className="builder-actions">
                <button
                  type="button"
                  onClick={() => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id
                        ? { ...entry, position: [player.x, player.y, player.z], yaw: player.yaw, floorId: editingFloor.id }
                        : entry
                    )),
                  })}
                >
                  Move to player
                </button>
                <button
                  type="button"
                  onClick={() => patch({
                    entryPoints: entries.map((entry) => (
                      entry.id === selectedEntry.id
                        ? {
                          ...entry,
                          position: pointForFloor(entry.position, bounds, floors, editingFloor.id),
                          floorId: editingFloor.id,
                        }
                        : entry
                    )),
                  })}
                >
                  Move to floor
                </button>
                <button type="button" onClick={() => playTestFrom(selectedEntry.position)}>Play from here</button>
              </div>
            </section>
          )}

          <section className="builder-section">
            <strong>Gaussians</strong>
            <div className="builder-layer-list">
              {gaussians.map((layer, index) => (
                <div
                  key={layer.id}
                  className={`builder-layer-row ${selection.kind === "gaussian" && selection.id === layer.id ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="builder-layer-row__select"
                    onClick={() => setSelection({ kind: "gaussian", id: layer.id })}
                  >
                    <span>{layer.label}</span>
                    <b>{layer.active ? "main" : layer.locked ? "locked" : layer.enabled ? "visible" : "hidden"}</b>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGaussianLayerEnabled(layer.id, !layer.enabled)}
                    aria-label={`${layer.enabled ? "Hide" : "Show"} ${layer.label}`}
                  >
                    {layer.enabled ? "Hide" : "Show"}
                  </button>
                  <button type="button" onClick={() => toggleGaussianLayerLock(layer.id)}>{layer.locked ? "Unlock" : "Lock"}</button>
                  <button type="button" onClick={() => soloGaussianLayer(layer.id)}>Solo</button>
                  <button type="button" onClick={() => setActiveGaussianLayer(layer.id)}>Main</button>
                  <button type="button" disabled={index === 0} onClick={() => moveGaussianLayer(layer.id, -1)}>Up</button>
                  <button type="button" disabled={index === gaussians.length - 1} onClick={() => moveGaussianLayer(layer.id, 1)}>Down</button>
                </div>
              ))}
            </div>
            <div className="builder-actions">
              <button type="button" onClick={() => addGaussian([0, 0, 0])}>Add origin</button>
              <button type="button" onClick={() => addGaussian()}>Add at player</button>
              <button type="button" onClick={addGaussianFromUrl}>Add URL</button>
            </div>
          </section>

          {selectedGaussian && (
            <section className="builder-section">
              <strong>Gaussian layer</strong>
              <div className="builder-state-row">
                <button type="button" className={selectedGaussian.enabled ? "is-active" : ""} onClick={() => updateGaussianLayer(selectedGaussian.id, { enabled: !selectedGaussian.enabled })}>
                  {selectedGaussian.enabled ? "Visible" : "Hidden"}
                </button>
                <button type="button" className={selectedGaussian.locked ? "is-active" : ""} onClick={() => toggleGaussianLayerLock(selectedGaussian.id)}>
                  {selectedGaussian.locked ? "Locked" : "Unlocked"}
                </button>
                <button type="button" className={selectedGaussian.active ? "is-active" : ""} onClick={() => setActiveGaussianLayer(selectedGaussian.id)}>
                  Main
                </button>
              </div>
              <label>
                <span>Label</span>
                <input
                  value={selectedGaussian.label}
                  onChange={(event) => updateGaussianLayer(selectedGaussian.id, { label: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>PLY URL</span>
                <input
                  value={selectedGaussian.plyUrl}
                  onChange={(event) => updateGaussianLayer(selectedGaussian.id, { plyUrl: event.currentTarget.value })}
                />
              </label>
              <div className="builder-fields">
                {(["X", "Y", "Z"] as const).map((axis, index) => (
                  <label key={axis}>
                    <span>{axis}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={selectedGaussian.position[index]}
                      disabled={selectedGaussian.locked}
                      onChange={(event) => {
                        const nextPosition = cloneTuple(selectedGaussian.position);
                        nextPosition[index] = numberValue(event.currentTarget.value, nextPosition[index]);
                        updateGaussianLayer(selectedGaussian.id, { position: nextPosition });
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="builder-fields">
                {(["RX", "RY", "RZ"] as const).map((axis, index) => (
                  <label key={axis}>
                    <span>{axis}</span>
                    <input
                      type="number"
                      step="1"
                      value={toDegrees([selectedGaussian.rotation.x, selectedGaussian.rotation.y, selectedGaussian.rotation.z][index])}
                      disabled={selectedGaussian.locked}
                      onChange={(event) => {
                        const nextRotation = { ...selectedGaussian.rotation };
                        const key = ["x", "y", "z"][index] as "x" | "y" | "z";
                        nextRotation[key] = toRadians(numberValue(event.currentTarget.value, toDegrees(nextRotation[key])));
                        updateGaussianLayer(selectedGaussian.id, { rotation: nextRotation });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label>
                <span>Scale</span>
                <input
                  type="number"
                  min="0.05"
                  step="0.05"
                  value={selectedGaussian.scale}
                  disabled={selectedGaussian.locked}
                  onChange={(event) => updateGaussianLayer(selectedGaussian.id, { scale: Math.max(0.05, numberValue(event.currentTarget.value, selectedGaussian.scale)) })}
                />
              </label>
              <div className="builder-fields">
                <label>
                  <span>Opacity</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedGaussian.opacity ?? 1}
                    onChange={(event) => updateGaussianLayer(selectedGaussian.id, { opacity: clamp(numberValue(event.currentTarget.value, selectedGaussian.opacity ?? 1), 0, 1) })}
                  />
                </label>
                <label>
                  <span>Floor min</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedGaussian.floorMin ?? ""}
                    onChange={(event) => updateGaussianLayer(selectedGaussian.id, { floorMin: event.currentTarget.value === "" ? undefined : numberValue(event.currentTarget.value, selectedGaussian.floorMin ?? bounds.lo[1]) })}
                  />
                </label>
                <label>
                  <span>Floor max</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedGaussian.floorMax ?? ""}
                    onChange={(event) => updateGaussianLayer(selectedGaussian.id, { floorMax: event.currentTarget.value === "" ? undefined : numberValue(event.currentTarget.value, selectedGaussian.floorMax ?? bounds.hi[1]) })}
                  />
                </label>
              </div>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedGaussian.playable === true}
                  onChange={(event) => updateGaussianLayer(selectedGaussian.id, { playable: event.currentTarget.checked })}
                />
                <span>Use for playable/collision planning</span>
              </label>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={selectedGaussian.collidable === true}
                  onChange={(event) => updateGaussianLayer(selectedGaussian.id, { collidable: event.currentTarget.checked })}
                />
                <span>Collision source</span>
              </label>
              {onPreviewGaussian && (
                <button type="button" onClick={() => onPreviewGaussian(selectedGaussian.id)}>
                  Preview this Gaussian
                </button>
              )}
              <div className="builder-actions">
                <button type="button" disabled={selectedGaussian.locked} onClick={resetGaussianTransform}>Reset transform</button>
                <button type="button" onClick={duplicateSelected}>Duplicate</button>
                <button type="button" disabled={selectedGaussian.locked || gaussians.length <= 1} onClick={deleteSelected}>Delete</button>
              </div>
            </section>
          )}

          {(tool === "combat" || tool === "deploy") && (
            <section className="builder-section builder-mode-section">
              <strong>FPV mode</strong>
              <div className="builder-room-state">
                <span>{room?.roomId ? `Room ${room.roomId}` : "No room"}</span>
                <span>{room?.status ?? "idle"}</span>
                <span>{remotePlayers.length + (room?.roomId ? 1 : 0)} users</span>
              </div>
              <div className="builder-actions">
                {onCreateRoom && <button type="button" onClick={onCreateRoom}>Host room</button>}
                {onJoinRoom && <button type="button" onClick={onJoinRoom}>Join room</button>}
                {onCopyShareLink && <button type="button" onClick={onCopyShareLink}>Copy invite</button>}
                {onObserverMode && <button type="button" onClick={onObserverMode}>Observe</button>}
              </div>
              {remotePlayers.length > 0 && (
                <div className="builder-room-users">
                  {remotePlayers.slice(0, 6).map((remote) => (
                    <button key={remote.id} type="button">
                      <span>{remote.id.slice(0, 6)}</span>
                      <b>{remote.role ?? "pilot"}</b>
                      <em>{remote.score ?? 0}/{remote.deaths ?? 0}</em>
                    </button>
                  ))}
                </div>
              )}
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={combat.enabled}
                  onChange={(event) => patch({ combat: { ...combat, enabled: event.currentTarget.checked } })}
                />
                <span>Combat enabled</span>
              </label>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={combat.teams}
                  onChange={(event) => patch({ combat: { ...combat, teams: event.currentTarget.checked } })}
                />
                <span>Teams</span>
              </label>
              <div className="builder-fields">
                <label>
                  <span>Health</span>
                  <input type="number" min="1" value={combat.health} onChange={(event) => patch({ combat: { ...combat, health: Math.max(1, numberValue(event.currentTarget.value, combat.health)) } })} />
                </label>
                <label>
                  <span>Respawn</span>
                  <input type="number" min="0" value={combat.respawnDelay} onChange={(event) => patch({ combat: { ...combat, respawnDelay: Math.max(0, numberValue(event.currentTarget.value, combat.respawnDelay)) } })} />
                </label>
                <label>
                  <span>Score</span>
                  <input type="number" min="1" value={combat.scoreLimit} onChange={(event) => patch({ combat: { ...combat, scoreLimit: Math.max(1, numberValue(event.currentTarget.value, combat.scoreLimit)) } })} />
                </label>
                <label>
                  <span>Round sec</span>
                  <input type="number" min="30" value={combat.roundSeconds} onChange={(event) => patch({ combat: { ...combat, roundSeconds: Math.max(30, numberValue(event.currentTarget.value, combat.roundSeconds)) } })} />
                </label>
              </div>
              <label>
                <span>Weapons</span>
                <input
                  value={combat.weapons.join(", ")}
                  onChange={(event) => patch({ combat: { ...combat, weapons: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) } })}
                />
              </label>
              <div className="builder-actions">
                <button
                  type="button"
                  onClick={() => patch({
                    combat: {
                      ...combat,
                      observerSpawn: [player.x, player.y, player.z],
                    },
                  })}
                >
                  Observer here
                </button>
                <button
                  type="button"
                  onClick={() => addRespawn([player.x, player.y, player.z])}
                >
                  Add respawn
                </button>
                <button type="button" onClick={() => addZone([player.x, player.y, player.z], "combat")}>Combat bounds</button>
              </div>
              <div className="builder-object-list">
                {combat.respawnPoints.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    className={selection.kind === "respawn" && selection.id === point.id ? "is-active" : ""}
                    onClick={() => setSelection({ kind: "respawn", id: point.id })}
                  >
                    {point.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {(tool === "story" || tool === "deploy") && (
            <section className="builder-section builder-mode-section">
              <strong>Story mode</strong>
              <label className="builder-check">
                <input
                  type="checkbox"
                  checked={story.enabled}
                  onChange={(event) => patch({ story: { ...story, enabled: event.currentTarget.checked } })}
                />
                <span>Story enabled</span>
              </label>
              <label>
                <span>Title</span>
                <input value={story.title} onChange={(event) => patch({ story: { ...story, title: event.currentTarget.value } })} />
              </label>
              <label>
                <span>Finish text</span>
                <input value={story.completionText ?? ""} onChange={(event) => patch({ story: { ...story, completionText: event.currentTarget.value } })} />
              </label>
              <div className="builder-actions">
                {STORY_POINT_TYPES.map((type) => (
                  <button key={type} type="button" onClick={() => addStoryStepAt([player.x, activeY(player, editingFloor), player.z], type)}>
                    {type}
                  </button>
                ))}
                <button type="button" onClick={() => onPlayStoryTest?.()} disabled={!onPlayStoryTest || !story.steps.length}>Play Story Test</button>
              </div>
              <div className="builder-story-list">
                {story.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`builder-story-step ${selection.kind === "story-step" && selection.id === step.id ? "is-active" : ""}`}
                    onClick={() => setSelection({ kind: "story-step", id: step.id })}
                  >
                    <button type="button" className="builder-story-step__head" onClick={() => setSelection({ kind: "story-step", id: step.id })}>
                      <i style={{ background: storyPointColor(step.type) }} />
                      <span>Step {index + 1}</span>
                      <b>{step.label}</b>
                      <em>{step.hidden ? "hidden" : step.type ?? "clue"}</em>
                    </button>
                    <div className="builder-actions">
                      <button type="button" disabled={index === 0} onClick={() => moveStoryStep(index, -1)}>Up</button>
                      <button type="button" disabled={index === story.steps.length - 1} onClick={() => moveStoryStep(index, 1)}>Down</button>
                      <button type="button" onClick={() => duplicateStoryStep(step)}>Duplicate</button>
                      <button type="button" onClick={() => onPlayStoryTest?.(step.id)} disabled={!onPlayStoryTest}>Test</button>
                      <button type="button" onClick={() => {
                        patch({ story: { ...story, steps: story.steps.filter((item) => item.id !== step.id) } });
                        setSelection({ kind: "spawn" });
                      }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {selectedStoryStep && (
            <section className="builder-section">
              <strong>Story point</strong>
              <div className="builder-fields">
                <label>
                  <span>Label</span>
                  <input value={selectedStoryStep.label} onChange={(event) => updateStoryStep(selectedStoryStep.id, { label: event.currentTarget.value })} />
                </label>
                <label>
                  <span>Type</span>
                  <select value={selectedStoryStep.type ?? "clue"} onChange={(event) => updateStoryStep(selectedStoryStep.id, { type: event.currentTarget.value as StoryPointType })}>
                    {STORY_POINT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <span>Done</span>
                  <select value={selectedStoryStep.completion} onChange={(event) => updateStoryStep(selectedStoryStep.id, { completion: event.currentTarget.value as StoryConfig["steps"][number]["completion"] })}>
                    <option value="visit-marker">Visit point</option>
                    <option value="collect-spot">Collect spot</option>
                    <option value="reach-entry">Reach entry</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Description</span>
                <textarea
                  value={selectedStoryStep.clue}
                  onChange={(event) => updateStoryStep(selectedStoryStep.id, { clue: event.currentTarget.value })}
                />
              </label>
              <div className="builder-fields">
                {(["X", "Y", "Z"] as const).map((axis, index) => (
                  <label key={axis}>
                    <span>{axis}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={(selectedStoryStep.position ?? [player.x, player.y, player.z])[index]}
                      onChange={(event) => {
                        const position = cloneTuple(selectedStoryStep.position ?? [player.x, player.y, player.z]);
                        position[index] = numberValue(event.currentTarget.value, position[index]);
                        updateStoryStep(selectedStoryStep.id, { position, floorId: containingFloor(floors, position)?.id ?? selectedStoryStep.floorId ?? editingFloor.id });
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="builder-fields">
                <label>
                  <span>Floor</span>
                  <select value={selectedStoryStep.floorId ?? editingFloor.id} onChange={(event) => updateStoryStep(selectedStoryStep.id, { floorId: event.currentTarget.value })}>
                    {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Radius</span>
                  <input type="number" min="0.25" step="0.1" value={selectedStoryStep.radius ?? 1} onChange={(event) => updateStoryStep(selectedStoryStep.id, { radius: Math.max(0.25, numberValue(event.currentTarget.value, selectedStoryStep.radius ?? 1)) })} />
                </label>
                <label>
                  <span>Route</span>
                  <input type="number" min="0" max={Math.max(0, trajectory.length - 1)} value={selectedStoryStep.routeIndex ?? ""} onChange={(event) => updateStoryStep(selectedStoryStep.id, { routeIndex: event.currentTarget.value === "" ? undefined : Math.max(0, Math.min(trajectory.length - 1, numberValue(event.currentTarget.value, 0))) })} />
                </label>
              </div>
              <label className="builder-check">
                <input type="checkbox" checked={selectedStoryStep.hidden === true} onChange={(event) => updateStoryStep(selectedStoryStep.id, { hidden: event.currentTarget.checked })} />
                <span>Hidden until active</span>
              </label>
              <div className="builder-actions">
                <button type="button" onClick={() => updateStoryStep(selectedStoryStep.id, { position: [player.x, activeY(player, editingFloor), player.z], floorId: editingFloor.id })}>Move to player</button>
                <button type="button" onClick={() => selectedStoryStep.position && updateStoryStep(selectedStoryStep.id, { position: pointForFloor(selectedStoryStep.position, bounds, floors, editingFloor.id), floorId: editingFloor.id })}>Snap floor</button>
                <button type="button" onClick={duplicateSelected}>Duplicate</button>
                <button type="button" onClick={deleteSelected}>Delete</button>
              </div>
              <div className="builder-fields">
                {selectedStoryStep.completion === "visit-marker" && (
                  <label>
                    <span>Marker</span>
                    <select value={selectedStoryStep.markerId ?? ""} onChange={(event) => updateStoryStep(selectedStoryStep.id, { markerId: event.currentTarget.value || undefined })}>
                      <option value="">Use point position</option>
                      {markers.map((marker) => <option key={marker.id} value={marker.id}>{marker.label}</option>)}
                    </select>
                  </label>
                )}
                {selectedStoryStep.completion === "collect-spot" && (
                  <label>
                    <span>Spot</span>
                    <select value={selectedStoryStep.spotId ?? ""} onChange={(event) => updateStoryStep(selectedStoryStep.id, { spotId: event.currentTarget.value || undefined })}>
                      <option value="">Choose green spot</option>
                      {collectibles.map((spot) => <option key={spot.id} value={spot.id}>{spot.label ?? spot.id}</option>)}
                    </select>
                  </label>
                )}
                {selectedStoryStep.completion === "reach-entry" && (
                  <label>
                    <span>Entry</span>
                    <select value={selectedStoryStep.entryId ?? ""} onChange={(event) => updateStoryStep(selectedStoryStep.id, { entryId: event.currentTarget.value || undefined })}>
                      <option value="">Choose entry</option>
                      {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </section>
          )}

          {tool === "deploy" && (
            <section className="builder-section builder-deploy-section">
              <strong>Deploy</strong>
              <div className="builder-deploy-state">
                <span>{deployStateLabel}</span>
                <b>{working.deploy?.version ?? "draft"}</b>
              </div>
              <p>{deployStatus ?? localDraftStatus ?? "Draft edits are local until you deploy a new immutable version."}</p>
              {working.deploy?.shareUrl && (
                <input className="builder-share-url" readOnly value={working.deploy.shareUrl} aria-label="Deployed share link" />
              )}
              <div className="builder-deploy-meta">
                <span>Map {working.deploy?.mapId ?? "new"}</span>
                <span>{hasUnsavedChanges ? "local changes" : "published"}</span>
                <span>{deployIssues.length ? `${deployIssues.length} blocking issues` : "ready"}</span>
              </div>
              {deployIssues.length > 0 && (
                <div className="builder-deploy-checks">
                  {deployIssues.slice(0, 5).map((issue) => (
                    <button key={issue.id} type="button" onClick={() => selectIssueTarget(issue.target)}>
                      {issue.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="builder-actions">
                {onSaveLocalDraft && <button type="button" onClick={onSaveLocalDraft}>Save local</button>}
                {onDeployConfig && <button type="button" onClick={onDeployConfig} disabled={deployIssues.length > 0}>Deploy version</button>}
                {onCopyShareLink && <button type="button" onClick={onCopyShareLink}>Copy draft link</button>}
                {onExportConfig && <button type="button" onClick={onExportConfig}>Export JSON</button>}
              </div>
              {onImportConfig && (
                <label>
                  <span>Import JSON</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => {
                      onImportConfig(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
              {onUploadBundle && (
                <label>
                  <span>Upload bundle</span>
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      if (event.currentTarget.files?.length) onUploadBundle(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </section>
          )}

          <section className="builder-section">
            <strong>Quick add</strong>
            <div className="builder-actions">
              <button type="button" onClick={() => addSpot([player.x, player.y, player.z])}>Spot at player</button>
              <button type="button" onClick={() => addEntry([player.x, player.y, player.z])}>Entry at player</button>
              <button type="button" onClick={() => addEntry([player.x, player.y, player.z], "portal")}>Portal at player</button>
              <button type="button" onClick={() => addRespawn([player.x, player.y, player.z])}>Respawn at player</button>
              <button type="button" onClick={() => addZone([player.x, player.y, player.z], "cleanup")}>Cleanup here</button>
              <button type="button" onClick={() => addProp([player.x, player.y, player.z], "cube")}>Prop at player</button>
              <button type="button" onClick={() => addSound([player.x, player.y, player.z], "bell")}>Sound at player</button>
              <button type="button" onClick={() => addScript("onInteract")}>New script</button>
              <button type="button" onClick={() => addTrajectoryPoint([player.x, player.y, player.z])}>Route point</button>
              <button type="button" onClick={() => patch({ spawn: [player.x, player.y, player.z], spawnRotation: { yaw: player.yaw, pitch: 0 } })}>
                Spawn at player
              </button>
            </div>
            <p>{entries.length} entries, {collectibles.length} green spots, {gaussians.length} Gaussian layers, {creativeProps.length} props, {ambientSounds.length} sounds, {scripts.length} scripts, {editorZones.length} zones</p>
            <p>Selected position: {selectedPosition ? formatPoint(selectedPosition) : "None"}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
