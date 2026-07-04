import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { AlignmentGuide } from "./components/AlignmentGuide";
import { CombatHUD } from "./components/CombatHUD";
import { Collectibles } from "./components/Collectibles";
import { CreativeProps } from "./components/CreativeProps";
import { EditorZones } from "./components/EditorZones";
import { FlightController } from "./components/FlightController";
import { GameAudio } from "./components/GameAudio";
import { GameMenuOverlay } from "./components/GameMenuOverlay";
import { GameHUD } from "./components/GameHUD";
import { GaussianScene } from "./components/GaussianScene";
import { GuidedIntro } from "./components/GuidedIntro";
import { LandscapeGuard } from "./components/LandscapeGuard";
import { MapMarkers } from "./components/MapMarkers";
import { RadarMap } from "./components/RadarMap";
import { RemotePlayers } from "./components/RemotePlayers";
import { RunSummary, type RunResult } from "./components/RunSummary";
import { SceneAlignmentPanel } from "./components/SceneAlignmentPanel";
import { SceneBuilderPanel } from "./components/SceneBuilderPanel";
import { SceneConfigPanel } from "./components/SceneConfigPanel";
import { StartOverlay } from "./components/StartOverlay";
import { StoryHUD } from "./components/StoryHUD";
import { TargetGuide } from "./components/TargetGuide";
import { WorldEntryPoints } from "./components/WorldEntryPoints";
import { DEFAULT_THROTTLE_SPEED, clampThrottleSpeed } from "./lib/flightTuning";
import { runCreativeScripts } from "./lib/creativeRuntime";
import { applyGameConfig, alignSceneBundle, generateCollectibles, loadSceneBundle } from "./lib/sceneData";
import { canUseWebGL } from "./lib/webgl";
import {
  applySceneConfigToUrl,
  decodeSceneConfigFromHash,
  downloadJson,
  makeSpotFromPlayer,
  makeMarkerFromPlayer,
  makeTrajectoryPose,
} from "./lib/shareConfig";
import {
  createRoom,
  currentRoomFromUrl,
  defaultRoomServer,
  deployMapVersion,
  buildManifestShareUrl,
  getPlayers,
  openRoomSocket,
  sendPlayer,
  uploadMapBundle,
  type RoomState,
} from "./lib/roomClient";
import type {
  GameConfig,
  GameMode,
  GaussianLayer,
  CollectionSplit,
  CollectibleDef,
  CreativeScriptTrigger,
  LoadFlags,
  MapMarker,
  PlayerSnapshot,
  RemotePlayerSnapshot,
  SceneAlignment,
  SceneBundle,
  SpotAuditSummary,
  Vec3Tuple,
  WorldEntryPoint,
  StoryStep,
} from "./types";

const FALLBACK_PREVIEW_URL = "./loader-point-cloud.json";
const TUTORIAL_KEY = "myworld-flight-tutorial-complete";
const ALIGNMENT_KEY_PREFIX = "myworld-scene-alignment-v4";
const CHECKPOINT_KEY_PREFIX = "myworld-flight-checkpoint-v1";
const MARKERS_KEY_PREFIX = "myworld-flight-markers-v1";
const LOCAL_DRAFT_KEY_PREFIX = "myworld-scene-draft-v1";
const BEST_RUN_KEY_PREFIX = "myworld-flight-best-v1";
const CLIENT_ID_KEY = "myworld-flight-client-id";
const SPOT_EDGE_MARGIN = 0.35;
const ZERO_ALIGNMENT: SceneAlignment = { x: 0, y: 0, z: 0 };

function hasSearchFlag(...names: string[]): boolean {
  const params = new URLSearchParams(window.location.search);
  return names.some((name) => {
    const value = params.get(name);
    return value === "" || value === "1" || value === "true" || value === "yes";
  });
}

function initialPlayer(): PlayerSnapshot {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    boost: false,
    precision: false,
    floorId: "unknown",
  };
}

function TrajectoryPath({ bundle }: { bundle: SceneBundle }) {
  const line = useMemo(() => {
    const points = bundle.trajectory.map((pose) => new THREE.Vector3(...pose.position));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: "#ff7a28", transparent: true, opacity: 0.42 });
    return new THREE.Line(geometry, material);
  }, [bundle.trajectory]);

  if (bundle.trajectory.length < 2) return null;
  return <primitive object={line} />;
}

function normalizeAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function normalizeSceneAlignment(alignment: Partial<SceneAlignment>): SceneAlignment {
  return {
    x: normalizeAngle(Number(alignment.x ?? 0)),
    y: normalizeAngle(Number(alignment.y ?? 0)),
    z: normalizeAngle(Number(alignment.z ?? 0)),
  };
}

function alignmentFingerprint(alignment: SceneAlignment): string {
  const normalized = normalizeSceneAlignment(alignment);
  return [normalized.x, normalized.y, normalized.z].map((value) => value.toFixed(5)).join(":");
}

function alignmentKey(bundle: SceneBundle): string {
  return [
    ALIGNMENT_KEY_PREFIX,
    bundle.manifest.collectibleSeed ?? bundle.manifest.plyUrl,
    alignmentFingerprint(bundle.alignment),
  ].join(":");
}

function checkpointKey(bundle: SceneBundle): string {
  return [
    CHECKPOINT_KEY_PREFIX,
    bundle.manifest.collectibleSeed ?? bundle.manifest.plyUrl,
    alignmentFingerprint(bundle.alignment),
  ].join(":");
}

function markersKey(bundle: SceneBundle): string {
  return [
    MARKERS_KEY_PREFIX,
    bundle.manifest.collectibleSeed ?? bundle.manifest.plyUrl,
    alignmentFingerprint(bundle.alignment),
  ].join(":");
}

function collectibleFingerprint(collectibles: CollectibleDef[]): string {
  return collectibles
    .map((item) => [
      item.id,
      item.position.map((value) => value.toFixed(2)).join(","),
    ].join("@"))
    .join("|");
}

function bestRunKey(bundle: SceneBundle, collectibles: CollectibleDef[]): string {
  return [
    BEST_RUN_KEY_PREFIX,
    bundle.manifest.collectibleSeed ?? bundle.manifest.plyUrl,
    alignmentFingerprint(bundle.alignment),
    collectibleFingerprint(collectibles),
  ].join(":");
}

function parseBestSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function checkpointFromPlayer(player: PlayerSnapshot): PlayerSnapshot {
  return {
    ...player,
    speed: 0,
    boost: false,
    precision: false,
    status: undefined,
  };
}

function parseCheckpoint(value: string | null): PlayerSnapshot | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<PlayerSnapshot>;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    const z = Number(parsed.z);
    const yaw = Number(parsed.yaw);
    if (![x, y, z, yaw].every(Number.isFinite)) return undefined;
    return {
      ...initialPlayer(),
      x,
      y,
      z,
      yaw: normalizeAngle(yaw),
      floorId: String(parsed.floorId ?? "unknown"),
    };
  } catch {
    return undefined;
  }
}

function markerToPlayer(marker: MapMarker): PlayerSnapshot {
  return {
    ...initialPlayer(),
    x: marker.position[0],
    y: marker.position[1],
    z: marker.position[2],
    yaw: normalizeAngle(marker.yaw),
    floorId: marker.floorId,
    status: marker.label,
  };
}

function parseMarkers(value: string | null): MapMarker[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Partial<MapMarker>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((marker, index) => {
      const position = marker.position;
      const yaw = Number(marker.yaw);
      if (!Array.isArray(position) || position.length !== 3) return [];
      const cleanPosition = position.map(Number);
      if (![...cleanPosition, yaw].every(Number.isFinite)) return [];
      return [{
        id: String(marker.id ?? `mark-${index + 1}`),
        label: String(marker.label ?? `Mark ${index + 1}`).trim() || `Mark ${index + 1}`,
        position: cleanPosition as Vec3Tuple,
        yaw: normalizeAngle(yaw),
        floorId: String(marker.floorId ?? "unknown"),
        createdAt: String(marker.createdAt ?? new Date().toISOString()),
      }];
    });
  } catch {
    return [];
  }
}

function collectibleDistance(player: PlayerSnapshot, item: CollectibleDef): number {
  const dx = player.x - item.position[0];
  const dy = player.y - item.position[1];
  const dz = player.z - item.position[2];
  return Math.hypot(dx, dy, dz);
}

function markerDistance(player: PlayerSnapshot, marker: MapMarker): number {
  const dx = player.x - marker.position[0];
  const dy = player.y - marker.position[1];
  const dz = player.z - marker.position[2];
  return Math.hypot(dx, dy, dz);
}

function pointDistance(player: PlayerSnapshot, position: Vec3Tuple): number {
  return Math.hypot(player.x - position[0], player.y - position[1], player.z - position[2]);
}

function nextSpotIndex(items: CollectibleDef[]): number {
  return items.reduce((next, item) => {
    const match = /^spot-(\d+)$/.exec(item.id);
    return match ? Math.max(next, Number(match[1])) : next;
  }, items.length);
}

function nextMarkerIndex(items: MapMarker[]): number {
  return items.reduce((next, item) => {
    const match = /^mark-(\d+)$/.exec(item.id);
    return match ? Math.max(next, Number(match[1])) : next;
  }, items.length);
}

function clampValue(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function safeBand(lo: number, hi: number, margin: number): [number, number] {
  if (hi - lo <= margin * 2) {
    const midpoint = (lo + hi) / 2;
    return [midpoint, midpoint];
  }
  return [lo + margin, hi - margin];
}

function floorMargin(bundle: SceneBundle): number {
  return Math.min(SPOT_EDGE_MARGIN, Math.max(0.08, (bundle.activeFloor.yMax - bundle.activeFloor.yMin) * 0.12));
}

function auditSpot(item: CollectibleDef, bundle: SceneBundle) {
  const [x, y, z] = item.position;
  const boundsIssue = x < bundle.bounds.lo[0] || x > bundle.bounds.hi[0]
    || y < bundle.bounds.lo[1] || y > bundle.bounds.hi[1]
    || z < bundle.bounds.lo[2] || z > bundle.bounds.hi[2];
  const floorIssue = y < bundle.activeFloor.yMin || y > bundle.activeFloor.yMax;
  const yMargin = floorMargin(bundle);
  const edgeIssue = x < bundle.bounds.lo[0] + SPOT_EDGE_MARGIN || x > bundle.bounds.hi[0] - SPOT_EDGE_MARGIN
    || z < bundle.bounds.lo[2] + SPOT_EDGE_MARGIN || z > bundle.bounds.hi[2] - SPOT_EDGE_MARGIN
    || y < bundle.activeFloor.yMin + yMargin || y > bundle.activeFloor.yMax - yMargin;

  return {
    id: item.id,
    boundsIssue,
    floorIssue,
    edgeIssue,
    invalid: boundsIssue || floorIssue || edgeIssue,
  };
}

function summarizeSpotAudit(items: CollectibleDef[], bundle?: SceneBundle | null): SpotAuditSummary {
  if (!bundle) return { total: items.length, invalid: 0, bounds: 0, floor: 0, edge: 0 };
  return items.reduce<SpotAuditSummary>((summary, item) => {
    const result = auditSpot(item, bundle);
    return {
      total: summary.total + 1,
      invalid: summary.invalid + (result.invalid ? 1 : 0),
      bounds: summary.bounds + (result.boundsIssue ? 1 : 0),
      floor: summary.floor + (result.floorIssue ? 1 : 0),
      edge: summary.edge + (result.edgeIssue ? 1 : 0),
    };
  }, { total: 0, invalid: 0, bounds: 0, floor: 0, edge: 0 });
}

function repairSpotPosition(item: CollectibleDef, bundle: SceneBundle): Vec3Tuple {
  const [xLo, xHi] = safeBand(bundle.bounds.lo[0], bundle.bounds.hi[0], SPOT_EDGE_MARGIN);
  const [zLo, zHi] = safeBand(bundle.bounds.lo[2], bundle.bounds.hi[2], SPOT_EDGE_MARGIN);
  const [yLo, yHi] = safeBand(bundle.activeFloor.yMin, bundle.activeFloor.yMax, floorMargin(bundle));
  return [
    clampValue(item.position[0], xLo, xHi),
    clampValue(item.position[1], yLo, yHi),
    clampValue(item.position[2], zLo, zHi),
  ];
}

function readAlignment(bundle: SceneBundle): { alignment: SceneAlignment; done: boolean; hasLocalOverride: boolean } {
  const fallback = bundle.alignment;
  try {
    const raw = localStorage.getItem(alignmentKey(bundle));
    if (!raw) return { alignment: fallback, done: bundle.hasAdminAlignment, hasLocalOverride: false };
    const parsed = JSON.parse(raw) as Partial<SceneAlignment> & { done?: unknown };
    return {
      alignment: normalizeSceneAlignment({
        x: parsed.x ?? fallback.x,
        y: parsed.y ?? fallback.y,
        z: parsed.z ?? fallback.z,
      }),
      done: parsed.done === true || bundle.hasAdminAlignment,
      hasLocalOverride: true,
    };
  } catch {
    return { alignment: fallback, done: bundle.hasAdminAlignment, hasLocalOverride: false };
  }
}

function createClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID?.() ?? `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function stampConfig(config: GameConfig): GameConfig {
  return {
    ...config,
    updatedAt: new Date().toISOString(),
  };
}

function manifestWithGameConfig(bundle: SceneBundle, config: GameConfig) {
  return {
    ...bundle.manifest,
    gameConfig: stampConfig(config),
  };
}

function draftKey(bundle: SceneBundle): string {
  return `${LOCAL_DRAFT_KEY_PREFIX}:${bundle.manifest.plyUrl}`;
}

function pointInsideBounds(point: Vec3Tuple, bundle: SceneBundle, config: GameConfig): boolean {
  const bounds = config.bounds ?? bundle.bounds;
  return point[0] >= bounds.lo[0] && point[0] <= bounds.hi[0]
    && point[1] >= bounds.lo[1] && point[1] <= bounds.hi[1]
    && point[2] >= bounds.lo[2] && point[2] <= bounds.hi[2];
}

function validBounds(bundle: SceneBundle, config: GameConfig): boolean {
  const bounds = config.bounds ?? bundle.bounds;
  return bounds.hi[0] > bounds.lo[0] && bounds.hi[1] > bounds.lo[1] && bounds.hi[2] > bounds.lo[2];
}

function validateDeployConfig(bundle: SceneBundle, config: GameConfig): string[] {
  const issues: string[] = [];
  const spawn = config.spawn ?? bundle.spawn;
  if (!spawn || spawn.length !== 3 || !spawn.every(Number.isFinite)) {
    issues.push("Spawn is missing or invalid.");
  } else if (!pointInsideBounds(spawn, bundle, config)) {
    issues.push("Spawn is outside bounds.");
  }
  if (!validBounds(bundle, config)) {
    issues.push("Bounds are invalid.");
  }
  const gaussians = config.gaussians?.length ? config.gaussians : [defaultGaussianLayer(bundle)];
  gaussians.forEach((layer) => {
    if (layer.enabled !== false && !layer.plyUrl.trim()) {
      issues.push(`${layer.label || layer.id} has no Gaussian source.`);
    }
  });
  config.trajectory?.forEach((pose, index) => {
    if (!pointInsideBounds(pose.position, bundle, config)) {
      issues.push(`Route point ${index + 1} is outside bounds.`);
    }
  });
  config.story?.steps.forEach((step) => {
    if (step.position && !pointInsideBounds(step.position, bundle, config)) {
      issues.push(`${step.label} story point is outside bounds.`);
    }
  });
  config.entryPoints?.forEach((entry) => {
    if (entry.targetEntryId && !config.entryPoints?.some((item) => item.id === entry.targetEntryId)) {
      issues.push(`${entry.label} portal destination is missing.`);
    }
  });
  return issues;
}

function writeMarkers(bundle: SceneBundle, markers: MapMarker[]) {
  localStorage.setItem(markersKey(bundle), JSON.stringify(markers));
}

function defaultGaussianLayer(bundle: SceneBundle): GaussianLayer {
  return {
    id: "main",
    label: "Main Gaussian",
    plyUrl: bundle.manifest.plyUrl,
    position: [0, 0, 0],
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    enabled: true,
  };
}

function SceneContent({
  bundle,
  mode,
  homeSignal,
  warpSignal,
  warpTarget,
  splatRetry,
  player,
  boostHeld,
  precisionHeld,
  touchTurnAxis,
  touchForwardAxis,
  touchClimbAxis,
  throttleSpeed,
  playerRef,
  collectedIds,
  collectibles,
  target,
  markers,
  selectedMarkerId,
  entryPoints,
  editorZones,
  creativeProps,
  activeGaussian,
  remotePlayers,
  onSnapshot,
  onSplatReady,
  onSplatError,
  onJetReady,
  onCollect,
  onRequestHome,
  onEnterEntry,
  onTogglePause,
  onTakeControl,
  onOpenConfig,
  onThrottleChange,
  showAlignmentGuide,
}: {
  bundle: SceneBundle;
  mode: GameMode;
  homeSignal: number;
  warpSignal: number;
  warpTarget?: PlayerSnapshot;
  splatRetry: number;
  player: PlayerSnapshot;
  boostHeld: boolean;
  precisionHeld: boolean;
  touchTurnAxis: number;
  touchForwardAxis: number;
  touchClimbAxis: number;
  throttleSpeed: number;
  playerRef: React.MutableRefObject<THREE.Vector3>;
  collectedIds: Set<string>;
  collectibles: ReturnType<typeof generateCollectibles>;
  target?: { position: Vec3Tuple };
  markers: MapMarker[];
  selectedMarkerId?: string;
  entryPoints: WorldEntryPoint[];
  editorZones: NonNullable<GameConfig["editorZones"]>;
  creativeProps: NonNullable<GameConfig["creativeProps"]>;
  activeGaussian: GaussianLayer;
  remotePlayers: RemotePlayerSnapshot[];
  onSnapshot: (snapshot: PlayerSnapshot) => void;
  onSplatReady: () => void;
  onSplatError: (error: unknown) => void;
  onJetReady: () => void;
  onCollect: (id: string) => void;
  onRequestHome: (reason: string) => void;
  onEnterEntry: (entry: WorldEntryPoint) => void;
  onTogglePause: () => void;
  onTakeControl: () => void;
  onOpenConfig: () => void;
  onThrottleChange: (speed: number) => void;
  showAlignmentGuide: boolean;
}) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 10, 5]} intensity={2} color="#ffeedd" />
      <directionalLight position={[-5, -3, -5]} intensity={1} color="#8899cc" />
      <GaussianScene
        key={`${activeGaussian.id}:${activeGaussian.plyUrl}:${splatRetry}`}
        url={activeGaussian.plyUrl}
        alignment={bundle.alignment}
        position={activeGaussian.position}
        rotation={activeGaussian.rotation}
        scale={activeGaussian.scale}
        onReady={onSplatReady}
        onError={onSplatError}
      />
      <TrajectoryPath bundle={bundle} />
      <AlignmentGuide bundle={bundle} player={player} visible={showAlignmentGuide} />
      <TargetGuide playerRef={playerRef} target={target} visible={mode === "playing"} />
      <MapMarkers markers={markers} selectedId={selectedMarkerId} />
      <EditorZones zones={editorZones} />
      <CreativeProps props={creativeProps} />
      <FlightController
        bundle={bundle}
        mode={mode}
        homeSignal={homeSignal}
        warpSignal={warpSignal}
        warpTarget={warpTarget}
        boostHeld={boostHeld}
        precisionHeld={precisionHeld}
        touchTurnAxis={touchTurnAxis}
        touchForwardAxis={touchForwardAxis}
        touchClimbAxis={touchClimbAxis}
        throttleSpeed={throttleSpeed}
        creativeProps={creativeProps}
        playerRef={playerRef}
        onSnapshot={onSnapshot}
        onRequestHome={onRequestHome}
        onTogglePause={onTogglePause}
        onTakeControl={onTakeControl}
        onOpenConfig={onOpenConfig}
        onThrottleSpeedChange={onThrottleChange}
        onJetReady={onJetReady}
      />
      <Collectibles
        collectibles={collectibles}
        collectedIds={collectedIds}
        playerRef={playerRef}
        mode={mode}
        onCollect={onCollect}
      />
      <WorldEntryPoints entries={entryPoints} playerRef={playerRef} mode={mode} onEnter={onEnterEntry} />
      <RemotePlayers players={remotePlayers} />
    </>
  );
}

export default function App() {
  const [rawBundle, setRawBundle] = useState<SceneBundle | null>(null);
  const [loadFlags, setLoadFlags] = useState<LoadFlags>({
    manifest: false,
    trajectory: false,
    splat: false,
    jet: false,
  });
  const [mode, setMode] = useState<GameMode>("home");
  const [homeSignal, setHomeSignal] = useState(0);
  const [warpSignal, setWarpSignal] = useState(0);
  const [warpTarget, setWarpTarget] = useState<PlayerSnapshot>();
  const [player, setPlayer] = useState<PlayerSnapshot>(initialPlayer);
  const [boostHeld, setBoostHeld] = useState(false);
  const [precisionHeld, setPrecisionHeld] = useState(false);
  const [touchTurnAxis, setTouchTurnAxis] = useState(0);
  const [touchForwardAxis, setTouchForwardAxis] = useState(0);
  const [touchClimbAxis, setTouchClimbAxis] = useState(0);
  const [throttleSpeed, setThrottleSpeed] = useState(DEFAULT_THROTTLE_SPEED);
  const [sceneAlignment, setSceneAlignment] = useState<SceneAlignment>(ZERO_ALIGNMENT);
  const [alignmentDone, setAlignmentDone] = useState(false);
  const [alignmentPanelOpen, setAlignmentPanelOpen] = useState(false);
  const [hasLocalAlignmentOverride, setHasLocalAlignmentOverride] = useState(false);
  const [configOpen, setConfigOpen] = useState(() => hasSearchFlag("config"));
  const [builderOpen, setBuilderOpen] = useState(() => hasSearchFlag("builder", "studio"));
  const [activeGaussianId, setActiveGaussianId] = useState<string>();
  const [entryGaussian, setEntryGaussian] = useState<GaussianLayer>();
  const [adminDraft, setAdminDraft] = useState<GameConfig | undefined>(() => decodeSceneConfigFromHash(window.location.hash));
  const [recording, setRecording] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>();
  const [deployStatus, setDeployStatus] = useState<string>();
  const [localDraftStatus, setLocalDraftStatus] = useState<string>();
  const [storyStepIndex, setStoryStepIndex] = useState(0);
  const [storyComplete, setStoryComplete] = useState(false);
  const [combatHealth, setCombatHealth] = useState(100);
  const [combatScore, setCombatScore] = useState(0);
  const [combatDeaths, setCombatDeaths] = useState(0);
  const [combatStatus, setCombatStatus] = useState<string>();
  const [scriptObjective, setScriptObjective] = useState<string>();
  const [room, setRoom] = useState<RoomState>(() => {
    const initialRoom = currentRoomFromUrl();
    return {
      roomId: initialRoom?.roomId ?? "",
      serverUrl: initialRoom?.serverUrl ?? defaultRoomServer(),
      status: initialRoom ? "connecting" : "idle",
    };
  });
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayerSnapshot[]>([]);
  const [message, setMessage] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [splatRetry, setSplatRetry] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [collectedIds, setCollectedIds] = useState<Set<string>>(() => new Set());
  const [collectionSplits, setCollectionSplits] = useState<CollectionSplit[]>([]);
  const [checkpoint, setCheckpoint] = useState<PlayerSnapshot>();
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [bestSeconds, setBestSeconds] = useState<number>();
  const [runResult, setRunResult] = useState<RunResult>();
  const [completedRunSignature, setCompletedRunSignature] = useState<string>();
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>();
  const [mapExpanded, setMapExpanded] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [introOpen, setIntroOpen] = useState(() => !hasSearchFlag("qa", "screenshot", "visualqa") && localStorage.getItem(TUTORIAL_KEY) !== "1");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [adminMode] = useState(() => hasSearchFlag("admin"));
  const [qaScreenshotMode] = useState(() => hasSearchFlag("qa", "screenshot", "visualqa"));
  const [webglAvailable] = useState(canUseWebGL);
  const playerRef = useRef(new THREE.Vector3());
  const playerSnapshotRef = useRef<PlayerSnapshot>(initialPlayer());
  const combatHealthRef = useRef(100);
  const combatScoreRef = useRef(0);
  const combatDeathsRef = useRef(0);
  const clientId = useMemo(createClientId, []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const routeVideoTimerRef = useRef<number>();
  const recordedTrajectoryRef = useRef<GameConfig["trajectory"]>([]);
  const lastRecordedRef = useRef<PlayerSnapshot | null>(null);
  const lastEntryRef = useRef<{ id: string; time: number }>();
  const alignmentResumeModeRef = useRef<GameMode>("home");
  const roomSocketRef = useRef<WebSocket | null>(null);
  const startScriptRanRef = useRef(false);

  useEffect(() => {
    if (!webglAvailable) {
      setLoadError("WebGL unavailable; fallback flight ready.");
    }
  }, [webglAvailable]);

  useEffect(() => {
    let cancelled = false;
    loadSceneBundle()
      .then((nextBundle) => {
        if (cancelled) return;
        const storedAlignment = readAlignment(nextBundle);
        setSceneAlignment(storedAlignment.alignment);
        setAlignmentDone(storedAlignment.done);
        setHasLocalAlignmentOverride(storedAlignment.hasLocalOverride);
        setAlignmentPanelOpen(adminMode || !storedAlignment.done);
        setAdminDraft((current) => current ?? nextBundle.gameConfig);
        setRawBundle(nextBundle);
        playerRef.current.set(...nextBundle.spawn);
        setPlayer({
          ...initialPlayer(),
          x: nextBundle.spawn[0],
          y: nextBundle.spawn[1],
          z: nextBundle.spawn[2],
          yaw: nextBundle.spawnRotation.yaw,
          precision: false,
          floorId: nextBundle.activeFloor.id,
        });
        setLoadFlags((flags) => ({ ...flags, manifest: true, trajectory: true, jet: true }));
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError("Scene manifest or trajectory failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, [adminMode]);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setIsIOS(/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const bundle = useMemo(
    () => (rawBundle ? applyGameConfig(alignSceneBundle(rawBundle, sceneAlignment), adminDraft) : null),
    [adminDraft, rawBundle, sceneAlignment],
  );
  const collectibles = useMemo(() => (bundle ? generateCollectibles(bundle, 12) : []), [bundle]);
  const currentBestRunKey = useMemo(
    () => (bundle ? bestRunKey(bundle, collectibles) : undefined),
    [bundle, collectibles],
  );
  const availableTargets = useMemo(
    () => collectibles.filter((item) => !collectedIds.has(item.id)),
    [collectedIds, collectibles],
  );
  const activeTarget = useMemo(() => {
    if (!availableTargets.length) return undefined;
    const selected = selectedTargetId
      ? availableTargets.find((item) => item.id === selectedTargetId)
      : undefined;
    if (selected) return selected;
    return availableTargets.reduce((nearest, item) => (
      collectibleDistance(player, item) < collectibleDistance(player, nearest) ? item : nearest
    ));
  }, [availableTargets, player, selectedTargetId]);
  const activeTargetDistance = activeTarget ? collectibleDistance(player, activeTarget) : undefined;
  const activeMarker = useMemo(
    () => selectedMarkerId ? mapMarkers.find((marker) => marker.id === selectedMarkerId) : undefined,
    [mapMarkers, selectedMarkerId],
  );
  const activeMarkerDistance = activeMarker ? markerDistance(player, activeMarker) : undefined;
  const lastSplit = collectionSplits.length ? collectionSplits[collectionSplits.length - 1] : undefined;
  const fastestSplit = useMemo(
    () => collectionSplits.reduce<CollectionSplit | undefined>((fastest, split) => (
      !fastest || split.splitSeconds < fastest.splitSeconds ? split : fastest
    ), undefined),
    [collectionSplits],
  );
  const authoredSpots = useMemo(
    () => adminDraft?.collectibles ?? bundle?.gameConfig?.collectibles ?? [],
    [adminDraft?.collectibles, bundle?.gameConfig?.collectibles],
  );
  const gaussianLayers = useMemo(() => {
    if (!bundle) return [];
    const configured = bundle.gameConfig?.gaussians?.filter((layer) => layer.enabled) ?? [];
    return configured.length ? configured : [defaultGaussianLayer(bundle)];
  }, [bundle]);
  const entryPoints = useMemo(
    () => bundle?.gameConfig?.entryPoints ?? [],
    [bundle?.gameConfig?.entryPoints],
  );
  const editorZones = useMemo(
    () => bundle?.gameConfig?.editorZones ?? [],
    [bundle?.gameConfig?.editorZones],
  );
  const creativeProps = useMemo(
    () => bundle?.gameConfig?.creativeProps ?? [],
    [bundle?.gameConfig?.creativeProps],
  );
  const creativeScripts = useMemo(
    () => bundle?.gameConfig?.scripts ?? [],
    [bundle?.gameConfig?.scripts],
  );
  const combatConfig = bundle?.gameConfig?.combat;
  const storyConfig = bundle?.gameConfig?.story;
  const activeStoryStep = useMemo<StoryStep | undefined>(() => {
    if (!storyConfig?.enabled || storyComplete) return undefined;
    return storyConfig.steps[storyStepIndex];
  }, [storyComplete, storyConfig, storyStepIndex]);
  const activeStoryTarget = useMemo(() => {
    if (!bundle || !activeStoryStep) return undefined;
    if (activeStoryStep.position) return { position: activeStoryStep.position };
    if (activeStoryStep.markerId) return mapMarkers.find((marker) => marker.id === activeStoryStep.markerId);
    if (activeStoryStep.spotId) return collectibles.find((spot) => spot.id === activeStoryStep.spotId);
    if (activeStoryStep.entryId) return entryPoints.find((entry) => entry.id === activeStoryStep.entryId);
    if (activeStoryStep.routeIndex !== undefined) {
      const pose = bundle.trajectory[activeStoryStep.routeIndex];
      return pose ? { position: pose.position } : undefined;
    }
    return undefined;
  }, [activeStoryStep, bundle, collectibles, entryPoints, mapMarkers]);
  const activeGaussian = useMemo(() => {
    if (entryGaussian) return entryGaussian;
    return gaussianLayers.find((layer) => layer.id === activeGaussianId) ?? gaussianLayers[0];
  }, [activeGaussianId, entryGaussian, gaussianLayers]);
  const routePointCount = adminDraft?.trajectory?.length ?? bundle?.gameConfig?.trajectory?.length ?? bundle?.trajectory.length ?? 0;
  const spotAuditSummary = useMemo(() => summarizeSpotAudit(authoredSpots, bundle), [authoredSpots, bundle]);
  const nearestAuthoredSpotDistance = useMemo(() => {
    if (!authoredSpots.length) return undefined;
    return authoredSpots.reduce((nearest, item) => Math.min(nearest, collectibleDistance(player, item)), Number.POSITIVE_INFINITY);
  }, [authoredSpots, player]);
  const sceneFallback = Boolean(bundle && (loadError || !webglAvailable) && !loadFlags.splat && loadFlags.manifest && loadFlags.trajectory && loadFlags.jet);
  const ready = Boolean(bundle && loadFlags.manifest && loadFlags.trajectory && loadFlags.jet && (loadFlags.splat || sceneFallback));
  const sceneStatus = loadFlags.splat ? "Ready" : sceneFallback ? "Fallback" : loadError ? "Unavailable" : "Loading";
  const canConfigureScene = Boolean(bundle && loadFlags.manifest && loadFlags.trajectory);
  const previewUrl = bundle?.manifest.loaderPreviewUrl ?? FALLBACK_PREVIEW_URL;
  const alignmentPanelVisible = Boolean(bundle && canConfigureScene && (alignmentPanelOpen || !alignmentDone));

  useEffect(() => {
    if (!bundle) {
      setCheckpoint(undefined);
      setMapMarkers([]);
      setSelectedMarkerId(undefined);
      return;
    }
    try {
      setCheckpoint(parseCheckpoint(localStorage.getItem(checkpointKey(bundle))));
      const storedMarkers = parseMarkers(localStorage.getItem(markersKey(bundle)));
      const bundledMarkers = bundle.gameConfig?.markers ?? [];
      const nextMarkers = storedMarkers.length ? storedMarkers : bundledMarkers;
      setMapMarkers(nextMarkers);
      setSelectedMarkerId((current) => (
        current && nextMarkers.some((marker) => marker.id === current)
          ? current
          : nextMarkers[nextMarkers.length - 1]?.id
      ));
    } catch {
      setCheckpoint(undefined);
      setMapMarkers(bundle.gameConfig?.markers ?? []);
      setSelectedMarkerId(bundle.gameConfig?.markers?.[0]?.id);
    }
  }, [bundle]);

  useEffect(() => {
    if (!currentBestRunKey) {
      setBestSeconds(undefined);
      return;
    }
    try {
      setBestSeconds(parseBestSeconds(localStorage.getItem(currentBestRunKey)));
    } catch {
      setBestSeconds(undefined);
    }
  }, [currentBestRunKey]);

  useEffect(() => {
    if (mode !== "playing" || collectedIds.size === collectibles.length) return undefined;
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [collectedIds.size, collectibles.length, mode]);

  useEffect(() => {
    playerSnapshotRef.current = player;
  }, [player]);

  useEffect(() => {
    combatHealthRef.current = combatHealth;
  }, [combatHealth]);

  useEffect(() => {
    combatScoreRef.current = combatScore;
  }, [combatScore]);

  useEffect(() => {
    combatDeathsRef.current = combatDeaths;
  }, [combatDeaths]);

  useEffect(() => {
    setCollectedIds(new Set());
    setCollectionSplits([]);
    setSelectedTargetId(undefined);
    setRunResult(undefined);
    setCompletedRunSignature(undefined);
    setElapsed(0);
  }, [currentBestRunKey]);

  useEffect(() => {
    if (selectedTargetId && !availableTargets.some((item) => item.id === selectedTargetId)) {
      setSelectedTargetId(undefined);
    }
  }, [availableTargets, selectedTargetId]);

  useEffect(() => {
    setStoryStepIndex(0);
    setStoryComplete(false);
  }, [storyConfig?.title, storyConfig?.steps.length]);

  useEffect(() => {
    setCombatHealth(combatConfig?.health ?? 100);
    setCombatScore(0);
    setCombatDeaths(0);
    setCombatStatus(undefined);
  }, [combatConfig?.enabled, combatConfig?.health, combatConfig?.scoreLimit]);

  useEffect(() => {
    if (selectedMarkerId && !mapMarkers.some((marker) => marker.id === selectedMarkerId)) {
      setSelectedMarkerId(undefined);
    }
  }, [mapMarkers, selectedMarkerId]);

  useEffect(() => {
    if (!recording || mode !== "playing") return;
    const last = lastRecordedRef.current;
    const moved = !last
      || Math.hypot(player.x - last.x, player.y - last.y, player.z - last.z) > 0.08
      || Math.abs(player.yaw - last.yaw) > 0.08;
    if (!moved) return;
    lastRecordedRef.current = player;
    const trajectory = [
      ...(recordedTrajectoryRef.current ?? []),
      makeTrajectoryPose(player, recordedTrajectoryRef.current?.length ?? 0),
    ];
    recordedTrajectoryRef.current = trajectory;
    setAdminDraft((current) => stampConfig({
      ...(current ?? {}),
      trajectory,
    }));
  }, [mode, player, recording]);

  useEffect(() => {
    if (!room.roomId || room.status === "idle" || room.status === "offline") return undefined;
    let stopped = false;
    const publish = window.setInterval(() => {
      sendPlayer(room.serverUrl, room.roomId, clientId, playerSnapshotRef.current)
        .then(() => {
          if (!stopped) setRoom((current) => current.roomId === room.roomId ? { ...current, status: "connected" } : current);
        })
        .catch(() => {
          if (!stopped) setRoom((current) => current.roomId === room.roomId ? { ...current, status: "offline" } : current);
        });
    }, 300);
    const pull = window.setInterval(() => {
      getPlayers(room.serverUrl, room.roomId, clientId)
        .then((players) => {
          if (!stopped) setRemotePlayers(players);
        })
        .catch(() => {
          if (!stopped) setRoom((current) => current.roomId === room.roomId ? { ...current, status: "offline" } : current);
        });
    }, 700);
    return () => {
      stopped = true;
      window.clearInterval(publish);
      window.clearInterval(pull);
    };
  }, [clientId, room.roomId, room.serverUrl, room.status]);

  useEffect(() => {
    if (!room.roomId || room.status === "idle" || room.status === "offline") return undefined;
    const socket = openRoomSocket(room.serverUrl, room.roomId, clientId);
    if (!socket) return undefined;
    roomSocketRef.current = socket;
    let stopped = false;
    const publish = window.setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: "player",
        player: {
          ...playerSnapshotRef.current,
          role: mode === "paused" ? "observer" : "pilot",
          health: combatConfig?.enabled ? combatHealthRef.current : undefined,
          alive: combatConfig?.enabled ? combatHealthRef.current > 0 : true,
          score: combatConfig?.enabled ? combatScoreRef.current : undefined,
          deaths: combatConfig?.enabled ? combatDeathsRef.current : undefined,
        },
      }));
    }, 120);

    socket.onopen = () => {
      if (!stopped) setRoom((current) => current.roomId === room.roomId ? { ...current, status: "connected" } : current);
      socket.send(JSON.stringify({ type: "join", clientId }));
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; players?: RemotePlayerSnapshot[]; targetId?: string; damage?: number; playerId?: string; delta?: number };
        if (message.type === "players" && message.players && !stopped) {
          setRemotePlayers(message.players.filter((remote) => remote.id !== clientId));
        } else if (message.type === "hit" && message.targetId === clientId) {
          const damage = Number(message.damage ?? 25);
          setCombatHealth((current) => {
            const next = current - damage;
            if (next > 0) {
              setCombatStatus(`Hit -${damage}`);
              return next;
            }
            setCombatDeaths((deaths) => deaths + 1);
            setCombatStatus("Destroyed");
            const respawn = combatConfig?.respawnPoints?.[combatDeathsRef.current % Math.max(1, combatConfig.respawnPoints.length)];
            if (respawn) {
              setWarpTarget({
                ...initialPlayer(),
                x: respawn.position[0],
                y: respawn.position[1],
                z: respawn.position[2],
                yaw: respawn.yaw,
                floorId: bundle?.activeFloor.id ?? "unknown",
                status: "Respawned",
              });
              setWarpSignal((value) => value + 1);
            } else {
              setHomeSignal((value) => value + 1);
            }
            return combatConfig?.health ?? 100;
          });
        } else if (message.type === "score" && message.playerId && message.playerId !== clientId) {
          setCombatStatus(`${message.playerId.slice(0, 5)} scored`);
        }
      } catch {
        // Ignore malformed room packets; the HTTP polling fallback still works.
      }
    };
    socket.onclose = () => {
      if (!stopped) setRoom((current) => current.roomId === room.roomId ? { ...current, status: "offline" } : current);
    };
    socket.onerror = () => {
      if (!stopped) setRoom((current) => current.roomId === room.roomId ? { ...current, status: "offline" } : current);
    };

    return () => {
      stopped = true;
      window.clearInterval(publish);
      socket.close();
      if (roomSocketRef.current === socket) roomSocketRef.current = null;
    };
  }, [bundle?.activeFloor.id, clientId, combatConfig, mode, room.roomId, room.serverUrl, room.status]);

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage((current) => (current === text ? undefined : current)), 1800);
  }, []);

  const handleThrottleChange = useCallback((speed: number) => {
    setThrottleSpeed(clampThrottleSpeed(speed));
  }, []);

  const completeStoryStep = useCallback(() => {
    if (!storyConfig?.enabled || !storyConfig.steps.length) return;
    setStoryStepIndex((current) => {
      const next = current + 1;
      if (next >= storyConfig.steps.length) {
        setStoryComplete(true);
        flash(storyConfig.completionText ?? "Story complete");
        return current;
      }
      flash(`Story step ${next + 1}`);
      return next;
    });
  }, [flash, storyConfig]);

  const resetStory = useCallback(() => {
    setStoryStepIndex(0);
    setStoryComplete(false);
    flash("Story reset");
  }, [flash]);

  useEffect(() => {
    if (!currentBestRunKey || collectibles.length === 0 || collectedIds.size !== collectibles.length) return;
    const signature = `${currentBestRunKey}:${elapsed}:${collectibles.length}`;
    if (completedRunSignature === signature) return;
    const isBest = bestSeconds === undefined || elapsed < bestSeconds;
    const nextResult: RunResult = {
      key: currentBestRunKey,
      seconds: elapsed,
      collected: collectibles.length,
      best: isBest,
      splits: collectionSplits,
    };
    setCompletedRunSignature(signature);
    setRunResult(nextResult);
    setMode("paused");
    setBoostHeld(false);
    setPrecisionHeld(false);
    setTouchTurnAxis(0);
    setTouchForwardAxis(0);
    setTouchClimbAxis(0);
    if (isBest) {
      setBestSeconds(elapsed);
      try {
        localStorage.setItem(currentBestRunKey, String(elapsed));
      } catch {
        // The result is still shown even if private browsing blocks storage.
      }
    }
    flash(isBest ? "Run complete; new best" : "Run complete");
  }, [bestSeconds, collectedIds.size, collectionSplits, collectibles.length, completedRunSignature, currentBestRunKey, elapsed, flash]);

  const completeIntro = useCallback(() => {
    localStorage.setItem(TUTORIAL_KEY, "1");
    setIntroOpen(false);
  }, []);

  useEffect(() => {
    if (!activeStoryStep || storyComplete || mode !== "playing") return;
    if (activeStoryStep.completion !== "visit-marker") return;
    if (activeStoryStep.position) {
      const radius = activeStoryStep.radius ?? 1;
      if (pointDistance(player, activeStoryStep.position) < radius) completeStoryStep();
      return;
    }
    const marker = activeStoryStep.markerId ? mapMarkers.find((item) => item.id === activeStoryStep.markerId) : undefined;
    if (marker && markerDistance(player, marker) < (activeStoryStep.radius ?? 0.75)) completeStoryStep();
  }, [activeStoryStep, completeStoryStep, mapMarkers, mode, player, storyComplete]);

  const returnHome = useCallback((reason = "Returned home") => {
    setMode("home");
    setBoostHeld(false);
    setPrecisionHeld(false);
    setTouchTurnAxis(0);
    setTouchForwardAxis(0);
    setTouchClimbAxis(0);
    setMapExpanded(false);
    setBuilderOpen(false);
    setHomeSignal((value) => value + 1);
    flash(reason);
  }, [flash]);

  const runCreativeTrigger = useCallback((trigger: CreativeScriptTrigger, targetId?: string, scriptId?: string) => {
    const result = runCreativeScripts(creativeScripts, { trigger, targetId, scriptId }, {
      showMessage: flash,
      setObjective: (objective) => {
        const next = objective.trim();
        setScriptObjective(next || undefined);
        if (next) flash(`Objective: ${next}`);
      },
      addScore: (delta) => setCombatScore((score) => Math.max(0, score + delta)),
      setHealth: (health) => setCombatHealth(Math.max(0, Math.round(health))),
      returnHome: () => returnHome("Script returned home"),
      completeStoryStep,
      giveLoadout: (weapon) => setCombatStatus(`Loadout: ${weapon}`),
    });
    if (result.warnings.length) {
      console.warn("Creative script warnings:", result.warnings);
      flash(result.warnings[0]);
    }
    return result.ran;
  }, [completeStoryStep, creativeScripts, flash, returnHome]);

  const handleEnterEntry = useCallback((entry: WorldEntryPoint) => {
    const now = performance.now();
    if (lastEntryRef.current?.id === entry.id && now - lastEntryRef.current.time < 1800) return;
    lastEntryRef.current = { id: entry.id, time: now };
    runCreativeTrigger("onEnter", entry.id);
    if (activeStoryStep?.completion === "reach-entry" && activeStoryStep.entryId === entry.id) {
      completeStoryStep();
    }
    if (entry.targetEntryId) {
      const destination = entryPoints.find((item) => item.id === entry.targetEntryId);
      if (destination) {
        const yaw = destination.yaw ?? entry.yaw ?? 0;
        playerRef.current.set(...destination.position);
        setPlayer({
          x: destination.position[0],
          y: destination.position[1],
          z: destination.position[2],
          yaw,
          speed: 0,
          boost: false,
          precision: false,
          floorId: destination.floorId,
          status: `Entered ${destination.label}`,
        });
        flash(`Entered ${destination.label}`);
        return;
      }
      flash(`${entry.label} destination is missing`);
      return;
    }
    const target = gaussianLayers.find((layer) => layer.id === entry.targetGaussianId);
    if (target) {
      setEntryGaussian(undefined);
      setActiveGaussianId(target.id);
      flash(`Entered ${target.label}`);
      return;
    }
    if (entry.targetPlyUrl) {
      setEntryGaussian({
        id: `entry-${entry.id}`,
        label: entry.label,
        plyUrl: entry.targetPlyUrl,
        position: [0, 0, 0],
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1,
        enabled: true,
      });
      flash(`Entered ${entry.label}`);
      return;
    }
    flash(`${entry.label} has no target Gaussian`);
  }, [activeStoryStep, completeStoryStep, entryPoints, flash, gaussianLayers, runCreativeTrigger]);

  useEffect(() => {
    if (mode === "home") {
      startScriptRanRef.current = false;
      return;
    }
    if (mode !== "playing" || startScriptRanRef.current) return;
    startScriptRanRef.current = true;
    runCreativeTrigger("onStart");
  }, [mode, runCreativeTrigger]);

  const completeAlignment = useCallback(() => {
    if (rawBundle) {
      try {
        localStorage.setItem(alignmentKey(rawBundle), JSON.stringify({
          ...normalizeSceneAlignment(sceneAlignment),
          done: true,
        }));
      } catch {
        // Local storage can fail in private browsing; calibration still works for the session.
      }
    }
    setAlignmentDone(true);
    setAlignmentPanelOpen(false);
    setHasLocalAlignmentOverride(Boolean(rawBundle));
    const resumeMode = alignmentResumeModeRef.current;
    if (resumeMode === "playing" || resumeMode === "route") {
      setMode(resumeMode);
      flash(resumeMode === "playing" ? "Alignment saved; resumed flight" : "Alignment saved; resumed route");
    } else {
      flash("User alignment saved");
    }
  }, [flash, rawBundle, sceneAlignment]);

  const resetPersonalAlignment = useCallback(() => {
    if (!rawBundle) return;
    try {
      localStorage.removeItem(alignmentKey(rawBundle));
    } catch {
      // Local storage can fail in private browsing; reset still works for the session.
    }
    setSceneAlignment(rawBundle.alignment);
    setHasLocalAlignmentOverride(false);
    setAlignmentDone(rawBundle.hasAdminAlignment);
    setAlignmentPanelOpen(!rawBundle.hasAdminAlignment);
    flash(rawBundle.hasAdminAlignment ? "Using admin preset" : "Personal alignment cleared");
  }, [flash, rawBundle]);

  const resetAlignment = useCallback(() => {
    setSceneAlignment(rawBundle?.alignment ?? ZERO_ALIGNMENT);
  }, [rawBundle]);

  const reopenAlignment = useCallback(() => {
    setMode((current) => {
      alignmentResumeModeRef.current = current;
      return current === "playing" || current === "route" ? "paused" : current;
    });
    setAlignmentPanelOpen(true);
    setBoostHeld(false);
    setPrecisionHeld(false);
    setTouchTurnAxis(0);
    setTouchForwardAxis(0);
    setTouchClimbAxis(0);
    setMapExpanded(false);
    setConfigOpen(false);
    setBuilderOpen(false);
    flash("Alignment paused at current position");
  }, [flash]);

  const copyAdminAlignment = useCallback(() => {
    const adminConfig = JSON.stringify({ alignment: normalizeSceneAlignment(sceneAlignment) }, null, 2);
    navigator.clipboard?.writeText(adminConfig)
      .then(() => flash("Admin config copied"))
      .catch(() => flash("Could not copy admin config"));
  }, [flash, sceneAlignment]);

  const takeControl = useCallback(() => {
    if (!ready) return;
    if (!alignmentDone || alignmentPanelOpen) {
      flash(bundle?.hasAdminAlignment ? "Save or close alignment first" : "Align the scene first");
      return;
    }
    completeIntro();
    setConfigOpen(false);
    setBuilderOpen(false);
    setMode("playing");
    flash("Control handed over");
  }, [alignmentDone, alignmentPanelOpen, bundle?.hasAdminAlignment, completeIntro, flash, ready]);

  const watchRoute = useCallback(() => {
    if (!ready) return;
    if (!alignmentDone || alignmentPanelOpen) {
      flash(bundle?.hasAdminAlignment ? "Save or close alignment first" : "Align the scene first");
      return;
    }
    completeIntro();
    setConfigOpen(false);
    setBuilderOpen(false);
    setMode("route");
    flash("Watching recorded route");
  }, [alignmentDone, alignmentPanelOpen, bundle?.hasAdminAlignment, completeIntro, flash, ready]);

  const playStoryTest = useCallback((stepId?: string) => {
    if (!ready) return;
    if (!alignmentDone || alignmentPanelOpen) {
      flash(bundle?.hasAdminAlignment ? "Save or close alignment first" : "Align the scene first");
      return;
    }
    const steps = bundle?.gameConfig?.story?.steps ?? [];
    const stepIndex = stepId ? steps.findIndex((step) => step.id === stepId) : 0;
    setStoryStepIndex(stepIndex >= 0 ? stepIndex : 0);
    setStoryComplete(false);
    completeIntro();
    setConfigOpen(false);
    setBuilderOpen(false);
    setMode("playing");
    flash("Story test started");
  }, [alignmentDone, alignmentPanelOpen, bundle?.gameConfig?.story?.steps, bundle?.hasAdminAlignment, completeIntro, flash, ready]);

  const togglePause = useCallback(() => {
    setMode((current) => {
      if (current === "playing" || current === "route") return "paused";
      if (current === "paused") return "playing";
      return current;
    });
  }, []);

  const openPlayableMenu = useCallback(() => {
    setMode((current) => (current === "playing" || current === "route" || current === "home" ? "paused" : current));
    setBoostHeld(false);
    setPrecisionHeld(false);
    setTouchTurnAxis(0);
    setTouchForwardAxis(0);
    setTouchClimbAxis(0);
    setMapExpanded(false);
    setConfigOpen(false);
    setBuilderOpen(false);
    setAlignmentPanelOpen(false);
    flash("Menu opened");
  }, [flash]);

  const handleInstall = useCallback(() => {
    const prompt = installPrompt as Event & { prompt?: () => Promise<void>; userChoice?: Promise<unknown> };
    if (!prompt?.prompt) return;
    prompt.prompt();
    prompt.userChoice?.finally(() => setInstallPrompt(null));
  }, [installPrompt]);

  const handleCollect = useCallback((id: string) => {
    if (collectedIds.has(id)) return;
    const displaySplit = Math.max(0, elapsed - (collectionSplits[collectionSplits.length - 1]?.seconds ?? 0));
    setCollectedIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setCollectionSplits((currentSplits) => {
      if (currentSplits.some((split) => split.id === id)) return currentSplits;
      const previousSeconds = currentSplits[currentSplits.length - 1]?.seconds ?? 0;
      return [
        ...currentSplits,
        {
          id,
          ordinal: currentSplits.length + 1,
          seconds: elapsed,
          splitSeconds: Math.max(0, elapsed - previousSeconds),
        },
      ];
    });
    const nextCount = collectedIds.size + 1;
    flash(nextCount === collectibles.length ? "All rings collected" : `Ring ${nextCount}/${collectibles.length} +${displaySplit}s`);
    runCreativeTrigger("onCollect", id);
    if (activeStoryStep?.completion === "collect-spot" && activeStoryStep.spotId === id) {
      completeStoryStep();
    }
  }, [activeStoryStep, collectedIds, collectionSplits, collectibles.length, completeStoryStep, elapsed, flash, runCreativeTrigger]);

  const resetRun = useCallback(() => {
    setCollectedIds(new Set());
    setCollectionSplits([]);
    setRunResult(undefined);
    setCompletedRunSignature(undefined);
    setElapsed(0);
    returnHome("Run reset");
  }, [returnHome]);

  const saveCheckpoint = useCallback(() => {
    if (!bundle) return;
    const next = checkpointFromPlayer(player);
    const nextMarker = makeMarkerFromPlayer(next, nextMarkerIndex(mapMarkers));
    setCheckpoint(next);
    setMapMarkers((current) => {
      const nextMarkers = [...current, nextMarker];
      try {
        writeMarkers(bundle, nextMarkers);
      } catch {
        // The marker still works for this session when storage is blocked.
      }
      return nextMarkers;
    });
    setSelectedMarkerId(nextMarker.id);
    try {
      localStorage.setItem(checkpointKey(bundle), JSON.stringify(next));
    } catch {
      // Checkpoint still works for this session when storage is blocked.
    }
    flash(`${nextMarker.label} saved`);
  }, [bundle, flash, mapMarkers, player]);

  const returnToCheckpoint = useCallback(() => {
    const destination = activeMarker ? markerToPlayer(activeMarker) : checkpoint;
    if (!destination) {
      flash("No mark saved");
      return;
    }
    setMode("paused");
    setBoostHeld(false);
    setPrecisionHeld(false);
    setTouchClimbAxis(0);
    setMapExpanded(false);
    setWarpTarget(destination);
    setWarpSignal((value) => value + 1);
    flash(activeMarker ? `Moved to ${activeMarker.label}` : "Checkpoint restored");
  }, [activeMarker, checkpoint, flash]);

  const clearCheckpoint = useCallback(() => {
    if (bundle) {
      try {
        localStorage.removeItem(checkpointKey(bundle));
      } catch {
        // Local storage can fail; clearing the session state is still useful.
      }
    }
    setCheckpoint(undefined);
    flash("Checkpoint cleared");
  }, [bundle, flash]);

  const selectMarker = useCallback((id: string) => {
    const marker = mapMarkers.find((item) => item.id === id);
    if (!marker) return;
    setSelectedMarkerId(marker.id);
    flash(`${marker.label} selected`);
  }, [flash, mapMarkers]);

  const goToMarker = useCallback((id: string) => {
    const marker = mapMarkers.find((item) => item.id === id);
    if (!marker) {
      flash("Mark not found");
      return;
    }
    setSelectedMarkerId(marker.id);
    setMode("paused");
    setBoostHeld(false);
    setPrecisionHeld(false);
    setTouchClimbAxis(0);
    setMapExpanded(false);
    setWarpTarget(markerToPlayer(marker));
    setWarpSignal((value) => value + 1);
    flash(`Moved to ${marker.label}`);
  }, [flash, mapMarkers]);

  const renameMarker = useCallback((id: string, label: string) => {
    if (!bundle) return;
    const cleanLabel = label.slice(0, 28);
    setMapMarkers((current) => {
      const nextMarkers = current.map((marker) => (
        marker.id === id ? { ...marker, label: cleanLabel } : marker
      ));
      try {
        writeMarkers(bundle, nextMarkers);
      } catch {
        // The edit still applies in memory.
      }
      return nextMarkers;
    });
  }, [bundle]);

  const deleteMarker = useCallback((id: string) => {
    if (!bundle) return;
    setMapMarkers((current) => {
      const nextMarkers = current.filter((marker) => marker.id !== id);
      try {
        writeMarkers(bundle, nextMarkers);
      } catch {
        // The edit still applies in memory.
      }
      return nextMarkers;
    });
    setSelectedMarkerId((current) => (current === id ? undefined : current));
    flash("Mark deleted");
  }, [bundle, flash]);

  const cycleTarget = useCallback(() => {
    if (!availableTargets.length) {
      setSelectedTargetId(undefined);
      flash("No rings left");
      return;
    }
    const currentId = selectedTargetId ?? activeTarget?.id;
    const currentIndex = availableTargets.findIndex((item) => item.id === currentId);
    const next = availableTargets[(currentIndex + 1) % availableTargets.length];
    setSelectedTargetId(next.id);
    const ordinal = collectibles.findIndex((item) => item.id === next.id) + 1;
    flash(`Target ${Math.max(1, ordinal)}/${collectibles.length}`);
  }, [activeTarget?.id, availableTargets, collectibles, flash, selectedTargetId]);

  const sendRoomEvent = useCallback((payload: Record<string, unknown>) => {
    const socket = roomSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  const respawnCombat = useCallback((reason = "Respawned") => {
    const respawns = combatConfig?.respawnPoints ?? [];
    const respawn = respawns.length ? respawns[combatDeaths % respawns.length] : undefined;
    if (respawn) {
      setWarpTarget({
        ...initialPlayer(),
        x: respawn.position[0],
        y: respawn.position[1],
        z: respawn.position[2],
        yaw: respawn.yaw,
        floorId: bundle?.activeFloor.id ?? "unknown",
        status: reason,
      });
      setWarpSignal((value) => value + 1);
    } else {
      setHomeSignal((value) => value + 1);
    }
    setCombatHealth(combatConfig?.health ?? 100);
    setMode("playing");
    setCombatStatus(reason);
    sendRoomEvent({ type: "respawn", reason });
    runCreativeTrigger("onRespawn", respawn?.id);
    flash(reason);
  }, [bundle?.activeFloor.id, combatConfig, combatDeaths, flash, runCreativeTrigger, sendRoomEvent]);

  const fireCombatShot = useCallback(() => {
    if (!combatConfig?.enabled || mode !== "playing") return;
    const origin: Vec3Tuple = [player.x, player.y, player.z];
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).normalize();
    const candidates = remotePlayers
      .filter((remote) => remote.alive !== false)
      .map((remote) => {
        const toTarget = new THREE.Vector3(remote.x - player.x, remote.y - player.y, remote.z - player.z);
        const distance = toTarget.length();
        const vertical = Math.abs(remote.y - player.y);
        const dot = distance > 0 ? forward.dot(toTarget.clone().normalize()) : 0;
        return { remote, distance, vertical, dot };
      })
      .filter((item) => item.distance < 10 && item.vertical < 2.4 && item.dot > 0.965)
      .sort((a, b) => b.dot - a.dot || a.distance - b.distance);
    const target = candidates[0]?.remote;
    sendRoomEvent({
      type: "shot",
      origin,
      yaw: player.yaw,
      weapon: combatConfig.weapons[0] ?? "pulse-cannon",
      targetId: target?.id,
    });
    if (target) {
      sendRoomEvent({ type: "hit", targetId: target.id, damage: 34, weapon: combatConfig.weapons[0] ?? "pulse-cannon" });
      sendRoomEvent({ type: "score", playerId: clientId, delta: 1 });
      setCombatScore((score) => {
        const next = score + 1;
        if (next >= combatConfig.scoreLimit) {
          setMode("paused");
          setCombatStatus("Score limit reached");
          flash("Score limit reached");
        } else {
          setCombatStatus(`Hit ${target.id.slice(0, 5)}`);
        }
        return next;
      });
    } else {
      setCombatStatus("Shot fired");
    }
  }, [clientId, combatConfig, flash, mode, player, remotePlayers, sendRoomEvent]);

  const interactWithNearestProp = useCallback(() => {
    if (mode !== "playing") return;
    const currentPlayer = playerSnapshotRef.current;
    const nearest = creativeProps
      .filter((prop) => prop.enabled && (!prop.floorId || prop.floorId === currentPlayer.floorId))
      .map((prop) => {
        const radius = Math.max(1.2, prop.scale[0], prop.scale[1], prop.scale[2]);
        const distance = Math.hypot(prop.position[0] - currentPlayer.x, prop.position[1] - currentPlayer.y, prop.position[2] - currentPlayer.z);
        return { prop, distance, radius };
      })
      .filter((item) => item.distance <= item.radius + 0.9)
      .sort((a, b) => a.distance - b.distance)[0]?.prop;
    if (!nearest) {
      flash("No object nearby");
      return;
    }
    const ran = runCreativeTrigger("onInteract", nearest.id, nearest.scriptId);
    if (!ran) flash(`${nearest.label} has no interaction`);
  }, [creativeProps, flash, mode, runCreativeTrigger]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (builderOpen) {
        if (event.code === "Escape") {
          event.preventDefault();
          setBuilderOpen(false);
        }
        return;
      }
      if (mapExpanded) {
        if (event.code === "Escape") {
          event.preventDefault();
          setMapExpanded(false);
        }
        return;
      }
      if (configOpen) {
        if (event.code === "Escape") {
          event.preventDefault();
          setConfigOpen(false);
        }
        return;
      }
      if (alignmentPanelOpen) return;
      if (runResult && event.code === "Enter") {
        event.preventDefault();
        resetRun();
      } else if (runResult && event.code === "Escape") {
        event.preventDefault();
        setRunResult(undefined);
      } else if (mode === "paused" && event.code === "Escape") {
        event.preventDefault();
        takeControl();
      } else if (event.code === "KeyM") {
        event.preventDefault();
        saveCheckpoint();
      } else if (event.code === "KeyR") {
        event.preventDefault();
        returnToCheckpoint();
      } else if (event.code === "KeyN") {
        event.preventDefault();
        cycleTarget();
      } else if (event.code === "KeyF") {
        event.preventDefault();
        fireCombatShot();
      } else if (event.code === "KeyE") {
        event.preventDefault();
        interactWithNearestProp();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [alignmentPanelOpen, builderOpen, configOpen, cycleTarget, fireCombatShot, interactWithNearestProp, mapExpanded, mode, resetRun, returnToCheckpoint, runResult, saveCheckpoint, takeControl]);

  const currentAuthorConfig = useCallback((): GameConfig => stampConfig(adminDraft ?? bundle?.gameConfig ?? {}), [adminDraft, bundle?.gameConfig]);

  const updateBuilderConfig = useCallback((config: GameConfig) => {
    setAdminDraft(stampConfig(config));
  }, []);

  const setSpawnHere = useCallback(() => {
    setAdminDraft((current) => stampConfig({
      ...(current ?? {}),
      spawn: [player.x, player.y, player.z],
      spawnRotation: { yaw: player.yaw, pitch: 0 },
    }));
    flash("Spawn saved for this scene");
  }, [flash, player]);

  const addSpotHere = useCallback(() => {
    const config = currentAuthorConfig();
    const collectibles = config.collectibles ?? [];
    setAdminDraft(stampConfig({
      ...config,
      collectibles: [...collectibles, makeSpotFromPlayer(player, nextSpotIndex(collectibles))],
    }));
    flash("Green spot added");
  }, [currentAuthorConfig, flash, player]);

  const removeNearestSpot = useCallback(() => {
    const config = currentAuthorConfig();
    const collectibles = config.collectibles ?? [];
    if (!collectibles.length) {
      flash("No green spots to remove");
      return;
    }
    const firstSpot = collectibles[0];
    const nearest = collectibles.reduce((best, item, index) => {
      const distance = collectibleDistance(player, item);
      return distance < best.distance ? { index, distance, item } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY, item: firstSpot });
    setAdminDraft(stampConfig({
      ...config,
      collectibles: collectibles.filter((_, index) => index !== nearest.index),
    }));
    flash(`Removed ${nearest.item.id}`);
  }, [currentAuthorConfig, flash, player]);

  const repairInvalidSpots = useCallback(() => {
    if (!bundle) return;
    const config = currentAuthorConfig();
    const collectibles = config.collectibles ?? [];
    const invalidCount = collectibles.filter((item) => auditSpot(item, bundle).invalid).length;
    if (!invalidCount) {
      flash("All green spots are safe");
      return;
    }
    setAdminDraft(stampConfig({
      ...config,
      collectibles: collectibles.map((item) => (
        auditSpot(item, bundle).invalid
          ? { ...item, position: repairSpotPosition(item, bundle) }
          : item
      )),
    }));
    flash(`Repaired ${invalidCount} green spot${invalidCount === 1 ? "" : "s"}`);
  }, [bundle, currentAuthorConfig, flash]);

  const deleteInvalidSpots = useCallback(() => {
    if (!bundle) return;
    const config = currentAuthorConfig();
    const collectibles = config.collectibles ?? [];
    const nextCollectibles = collectibles.filter((item) => !auditSpot(item, bundle).invalid);
    const removedCount = collectibles.length - nextCollectibles.length;
    if (!removedCount) {
      flash("No invalid green spots");
      return;
    }
    setAdminDraft(stampConfig({
      ...config,
      collectibles: nextCollectibles,
    }));
    flash(`Deleted ${removedCount} invalid spot${removedCount === 1 ? "" : "s"}`);
  }, [bundle, currentAuthorConfig, flash]);

  const undoSpot = useCallback(() => {
    const config = currentAuthorConfig();
    const collectibles = config.collectibles ?? [];
    setAdminDraft(stampConfig({
      ...config,
      collectibles: collectibles.slice(0, -1),
    }));
    flash("Last green spot removed");
  }, [currentAuthorConfig, flash]);

  const clearSpots = useCallback(() => {
    const config = currentAuthorConfig();
    setAdminDraft(stampConfig({
      ...config,
      collectibles: [],
    }));
    flash("Green spots cleared");
  }, [currentAuthorConfig, flash]);

  const stopRecording = useCallback(() => {
    setRecording(false);
    lastRecordedRef.current = null;
    if (routeVideoTimerRef.current) {
      window.clearTimeout(routeVideoTimerRef.current);
      routeVideoTimerRef.current = undefined;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    mediaRecorderRef.current = null;
    setVideoRecording(false);
    flash("Recording stopped");
  }, [flash]);

  const startRecording = useCallback(() => {
    if (!ready) {
      flash("Scene is still loading");
      return;
    }
    if (!alignmentDone || alignmentPanelOpen) {
      flash(bundle?.hasAdminAlignment ? "Save or close alignment first" : "Align the scene first");
      return;
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(undefined);
    }
    recordedTrajectoryRef.current = [];
    lastRecordedRef.current = null;
    setAdminDraft((current) => stampConfig({ ...(current ?? {}), trajectory: [] }));
    completeIntro();
    setConfigOpen(false);
    setBuilderOpen(false);
    setMode("playing");
    setRecording(true);
    const canvas = document.querySelector<HTMLCanvasElement>(".app-shell canvas");
    const canCapture = canvas && "captureStream" in canvas && "MediaRecorder" in window;
    if (!canCapture) {
      flash("Recording route only");
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      videoChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) videoChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
        setVideoUrl(URL.createObjectURL(blob));
        setVideoRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setVideoRecording(true);
      flash("Recording route and video");
    } catch {
      setVideoRecording(false);
      flash("Recording route only");
    }
  }, [alignmentDone, alignmentPanelOpen, bundle?.hasAdminAlignment, completeIntro, flash, ready, videoUrl]);

  const toggleRecording = useCallback(() => {
    if (recording || videoRecording) stopRecording();
    else startRecording();
  }, [recording, startRecording, stopRecording, videoRecording]);

  const recordRouteVideo = useCallback(() => {
    if (!bundle || bundle.trajectory.length < 2) {
      flash("No route to record");
      return;
    }
    if (recording || videoRecording) {
      stopRecording();
      return;
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(undefined);
    }
    const canvas = document.querySelector<HTMLCanvasElement>(".app-shell canvas");
    const canCapture = canvas && "captureStream" in canvas && "MediaRecorder" in window;
    if (!canCapture) {
      flash("Video capture unavailable");
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      videoChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) videoChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
        setVideoUrl(URL.createObjectURL(blob));
        setVideoRecording(false);
        flash("Route video ready");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setVideoRecording(true);
      setMode("route");
      setConfigOpen(false);
      setBuilderOpen(false);
      const durationMs = Math.max(2200, Math.min(120000, ((bundle.trajectory.length - 1) / 4 + 0.8) * 1000));
      routeVideoTimerRef.current = window.setTimeout(() => {
        routeVideoTimerRef.current = undefined;
        const currentRecorder = mediaRecorderRef.current;
        if (currentRecorder && currentRecorder.state !== "inactive") currentRecorder.stop();
        mediaRecorderRef.current = null;
        setVideoRecording(false);
        setMode("paused");
      }, durationMs);
      flash("Recording route replay");
    } catch {
      setVideoRecording(false);
      flash("Video capture unavailable");
    }
  }, [bundle, flash, recording, stopRecording, videoRecording, videoUrl]);

  const exportConfig = useCallback(() => {
    const source = rawBundle ?? bundle;
    if (!source) return;
    const config = currentAuthorConfig();
    downloadJson("scene-manifest.admin.json", manifestWithGameConfig(source, {
      ...config,
      markers: mapMarkers,
    }));
    flash("Scene JSON exported");
  }, [bundle, currentAuthorConfig, flash, mapMarkers, rawBundle]);

  const saveLocalDraft = useCallback(() => {
    const source = rawBundle ?? bundle;
    if (!source) return;
    const config = stampConfig({ ...currentAuthorConfig(), markers: mapMarkers });
    try {
      localStorage.setItem(draftKey(source), JSON.stringify(config));
      setAdminDraft(config);
      setLocalDraftStatus(`Local draft saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      flash("Local draft saved");
    } catch {
      setLocalDraftStatus("Local draft save failed");
      flash("Could not save local draft");
    }
  }, [bundle, currentAuthorConfig, flash, mapMarkers, rawBundle]);

  const importConfig = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { gameConfig?: GameConfig } | GameConfig;
        const nextConfig = "gameConfig" in parsed && parsed.gameConfig ? parsed.gameConfig : parsed as GameConfig;
        setAdminDraft(stampConfig(nextConfig));
        setDeployStatus("Imported JSON as local draft. Deploy to create a new shared version.");
        flash("Scene JSON imported");
      } catch {
        setDeployStatus("Import failed. JSON was not a scene config or manifest.");
        flash("Import failed");
      }
    };
    reader.readAsText(file);
  }, [flash]);

  const buildShareUrl = useCallback((config: GameConfig, nextRoom?: Pick<RoomState, "roomId" | "serverUrl">) => {
    const url = new URL(window.location.href);
    if (nextRoom?.roomId) {
      url.searchParams.set("room", nextRoom.roomId);
      url.searchParams.set("server", nextRoom.serverUrl);
    }
    return applySceneConfigToUrl(url, config);
  }, []);

  const copyShareLink = useCallback(() => {
    const config = currentAuthorConfig();
    const link = buildShareUrl({ ...config, markers: mapMarkers }, room.roomId ? room : undefined);
    navigator.clipboard?.writeText(link)
      .then(() => {
        setDeployStatus("Draft link copied. It is local-editable and does not mutate deployed versions.");
        flash("Share link copied");
      })
      .catch(() => flash("Could not copy link"));
  }, [buildShareUrl, currentAuthorConfig, flash, mapMarkers, room]);

  const createShareRoom = useCallback(() => {
    const gameConfig = { ...currentAuthorConfig(), markers: mapMarkers };
    setRoom((current) => ({ ...current, status: "connecting" }));
    createRoom(room.serverUrl, gameConfig, {
      mapId: gameConfig.deploy?.mapId,
      version: gameConfig.deploy?.version,
    })
      .then(({ roomId }) => {
        const nextRoom = { roomId, serverUrl: room.serverUrl };
        const shareLink = buildShareUrl(gameConfig, nextRoom);
        setRoom({ ...nextRoom, shareLink, status: "connected" });
        navigator.clipboard?.writeText(shareLink).catch(() => undefined);
        flash("Room link copied");
      })
      .catch(() => {
        setRoom((current) => ({ ...current, status: "offline" }));
        flash("Start the room server first");
      });
  }, [buildShareUrl, currentAuthorConfig, flash, mapMarkers, room.serverUrl]);

  const joinShareRoom = useCallback(() => {
    const roomId = window.prompt("Room id", room.roomId || "");
    if (!roomId?.trim()) return;
    const serverUrl = window.prompt("Room server", room.serverUrl) || room.serverUrl;
    setRoom({
      roomId: roomId.trim(),
      serverUrl,
      status: "connecting",
      shareLink: buildShareUrl({ ...currentAuthorConfig(), markers: mapMarkers }, { roomId: roomId.trim(), serverUrl }),
    });
    flash("Joining room");
  }, [buildShareUrl, currentAuthorConfig, flash, mapMarkers, room.roomId, room.serverUrl]);

  const enterObserverMode = useCallback(() => {
    const observerSpawn = combatConfig?.observerSpawn;
    if (observerSpawn) {
      setWarpTarget({
        ...initialPlayer(),
        x: observerSpawn[0],
        y: observerSpawn[1],
        z: observerSpawn[2],
        yaw: player.yaw,
        floorId: bundle?.activeFloor.id ?? "observer",
        status: "Observer",
      });
      setWarpSignal((value) => value + 1);
    }
    setMode("paused");
    setBoostHeld(false);
    setPrecisionHeld(false);
    setTouchTurnAxis(0);
    setTouchForwardAxis(0);
    setTouchClimbAxis(0);
    flash("Observer mode");
  }, [bundle?.activeFloor.id, combatConfig?.observerSpawn, flash, player.yaw]);

  const deployCurrentMap = useCallback(() => {
    const source = rawBundle ?? bundle;
    if (!source) return;
    const config = { ...currentAuthorConfig(), markers: mapMarkers };
    const validationIssues = validateDeployConfig(source, config);
    if (validationIssues.length) {
      setDeployStatus(`Deploy blocked: ${validationIssues.slice(0, 3).join(" ")}`);
      flash("Fix validation before deploy");
      return;
    }
    const manifest = manifestWithGameConfig(source, config);
    setDeployStatus("Deploying map version...");
    deployMapVersion(room.serverUrl, manifest, config.deploy?.mapId)
      .then((result) => {
        const shareLink = buildManifestShareUrl(result.manifestUrl, room.roomId ? room : undefined);
        const deploy = {
          mapId: result.mapId,
          version: result.version,
          serverUrl: room.serverUrl,
          manifestUrl: result.manifestUrl,
          shareUrl: shareLink,
          deployedAt: new Date().toISOString(),
        };
        setAdminDraft(stampConfig({ ...config, deploy }));
        setDeployStatus(`Deployed ${result.mapId} / ${result.version}`);
        navigator.clipboard?.writeText(shareLink).catch(() => undefined);
        flash("Deployed map link copied");
      })
      .catch(() => {
        setDeployStatus("Deploy failed. Start the local map server first.");
        flash("Deploy server unavailable");
      });
  }, [bundle, currentAuthorConfig, flash, mapMarkers, rawBundle, room]);

  const uploadBundleFiles = useCallback((files: FileList) => {
    setDeployStatus("Uploading bundle...");
    uploadMapBundle(room.serverUrl, files)
      .then((result) => {
        const shareLink = buildManifestShareUrl(result.manifestUrl);
        setAdminDraft((current) => stampConfig({
          ...(current ?? {}),
          deploy: {
            mapId: result.mapId,
            version: result.version,
            serverUrl: room.serverUrl,
            manifestUrl: result.manifestUrl,
            shareUrl: shareLink,
            deployedAt: new Date().toISOString(),
          },
        }));
        setDeployStatus(`Uploaded ${result.mapId} / ${result.version}`);
        navigator.clipboard?.writeText(shareLink).catch(() => undefined);
        flash("Uploaded map link copied");
      })
      .catch(() => {
        setDeployStatus("Upload failed. Start the local map server first.");
        flash("Upload server unavailable");
      });
  }, [flash, room.serverUrl]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (routeVideoTimerRef.current) window.clearTimeout(routeVideoTimerRef.current);
  }, [videoUrl]);

  const markSplatReady = useCallback(() => {
    setLoadFlags((flags) => ({ ...flags, splat: true }));
    setLoadError(undefined);
  }, []);

  const markJetReady = useCallback(() => {
    setLoadFlags((flags) => ({ ...flags, jet: true }));
  }, []);

  const handleSplatError = useCallback((error: unknown) => {
    console.error("Failed to load Gaussian scene", error);
    setLoadFlags((flags) => ({ ...flags, splat: false }));
    setLoadError("3D scene unavailable; fallback flight ready when the jet loads.");
  }, []);

  const retryScene = useCallback(() => {
    setLoadFlags((flags) => ({ ...flags, splat: false }));
    setLoadError(undefined);
    setSplatRetry((value) => value + 1);
    flash("Retrying 3D scene");
  }, [flash]);

  return (
    <div className={`app-shell ${qaScreenshotMode ? "is-qa-screenshot" : ""}`}>
      {webglAvailable ? (
        <Canvas
          camera={{ position: [0, 0.2, 1.1], fov: 70, near: 0.01, far: 10000 }}
          dpr={[1, 2]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
        >
          {bundle && (
            <SceneContent
              bundle={bundle}
              mode={mode}
              homeSignal={homeSignal}
              warpSignal={warpSignal}
              warpTarget={warpTarget}
              splatRetry={splatRetry}
              player={player}
              boostHeld={boostHeld}
              precisionHeld={precisionHeld}
              touchTurnAxis={touchTurnAxis}
              touchForwardAxis={touchForwardAxis}
              touchClimbAxis={touchClimbAxis}
              throttleSpeed={throttleSpeed}
              playerRef={playerRef}
              collectedIds={collectedIds}
              collectibles={collectibles}
              target={activeStoryTarget ?? activeMarker ?? activeTarget}
              markers={mapMarkers}
              selectedMarkerId={selectedMarkerId}
              entryPoints={entryPoints}
              editorZones={editorZones}
              creativeProps={creativeProps}
              activeGaussian={activeGaussian ?? defaultGaussianLayer(bundle)}
              remotePlayers={remotePlayers}
              onSnapshot={setPlayer}
              onSplatReady={markSplatReady}
              onSplatError={handleSplatError}
              onJetReady={markJetReady}
              onCollect={handleCollect}
              onRequestHome={returnHome}
              onEnterEntry={handleEnterEntry}
              onTogglePause={togglePause}
              onTakeControl={takeControl}
              onOpenConfig={() => setConfigOpen(true)}
              onThrottleChange={handleThrottleChange}
              showAlignmentGuide={alignmentPanelVisible}
            />
          )}
        </Canvas>
      ) : (
        <div className="scene-canvas-fallback" aria-hidden="true" />
      )}

      {bundle && (
        <>
          <GameAudio
            mode={mode}
            bundle={bundle}
            player={player}
            collected={collectedIds.size}
            total={collectibles.length}
            throttleSpeed={throttleSpeed}
            message={message}
          />
          <GameHUD
            mode={mode}
            player={player}
            bundle={bundle}
            collected={collectedIds.size}
            total={collectibles.length}
            elapsedSeconds={elapsed}
            bestSeconds={bestSeconds}
            lastSplit={lastSplit}
            message={message ?? scriptObjective}
            checkpoint={activeMarker ? markerToPlayer(activeMarker) : checkpoint}
            target={activeTarget}
            targetDistance={activeTargetDistance}
            sceneFallback={sceneFallback}
            sceneStatus={sceneStatus}
            boostHeld={boostHeld}
            precisionHeld={precisionHeld}
            throttleSpeed={throttleSpeed}
            onBoostChange={setBoostHeld}
            onPrecisionChange={setPrecisionHeld}
            onMoveChange={(turn, forward) => {
              setTouchTurnAxis(turn);
              setTouchForwardAxis(forward);
            }}
            onClimbChange={setTouchClimbAxis}
            onThrottleChange={handleThrottleChange}
            onHome={() => returnHome()}
            onSaveCheckpoint={saveCheckpoint}
            onReturnCheckpoint={returnToCheckpoint}
            onCycleTarget={cycleTarget}
            onRetryScene={retryScene}
            onPlay={takeControl}
            onWatchRoute={watchRoute}
            onPauseToggle={togglePause}
            onBackToMenu={openPlayableMenu}
            onAlign={reopenAlignment}
            onConfig={() => setConfigOpen(true)}
          />
          <StoryHUD
            story={storyConfig}
            step={activeStoryStep}
            stepIndex={storyStepIndex}
            complete={storyComplete}
            onComplete={completeStoryStep}
            onReset={resetStory}
          />
          <CombatHUD
            combat={combatConfig}
            health={combatHealth}
            score={combatScore}
            deaths={combatDeaths}
            status={combatStatus}
            onRespawn={() => respawnCombat()}
          />
          <RadarMap
            bundle={bundle}
            player={player}
            collectibles={collectibles}
            collectedIds={collectedIds}
            target={activeTarget}
            targetDistance={activeTargetDistance}
            markers={mapMarkers}
            selectedMarkerId={selectedMarkerId}
            entryPoints={entryPoints}
            editorZones={editorZones}
            expanded={mapExpanded}
            onExpandedChange={setMapExpanded}
            onHome={() => returnHome()}
            onSelectMarker={selectMarker}
            onGoToMarker={goToMarker}
            onRenameMarker={renameMarker}
            onDeleteMarker={deleteMarker}
          />
          <GameMenuOverlay
            visible={(mode === "paused" || (mode === "home" && ready && alignmentDone && !introOpen)) && !alignmentPanelVisible && !configOpen && !builderOpen && !mapExpanded && !runResult}
            adminMode={adminMode}
            collected={collectedIds.size}
            total={collectibles.length}
            elapsedSeconds={elapsed}
            bestSeconds={bestSeconds}
            target={activeTarget}
            targetDistance={activeTargetDistance}
            selectedMarker={activeMarker}
            selectedMarkerDistance={activeMarkerDistance}
            spotCount={authoredSpots.length}
            routeCount={routePointCount}
            recording={recording}
            videoRecording={videoRecording}
            videoUrl={videoUrl}
            sceneStatus={sceneStatus}
            sceneFallback={sceneFallback}
            room={room}
            spotAudit={spotAuditSummary}
            onPlay={takeControl}
            onHome={() => returnHome()}
            onOpenMap={() => setMapExpanded(true)}
            onConfig={() => setConfigOpen(true)}
            onBuilder={() => {
              setConfigOpen(false);
              setBuilderOpen(true);
            }}
            onAlign={reopenAlignment}
            onWatchRoute={watchRoute}
            onResetRun={resetRun}
            onToggleRecording={toggleRecording}
            onRecordRouteVideo={recordRouteVideo}
            onExportConfig={exportConfig}
            onCopyShareLink={copyShareLink}
            onCreateRoom={createShareRoom}
            onJoinRoom={joinShareRoom}
            onObserverMode={enterObserverMode}
          />
        </>
      )}

      <StartOverlay
        previewUrl={previewUrl}
        visible={mode === "home" && !alignmentPanelVisible && !ready}
        ready={ready}
        sceneFallback={sceneFallback}
        canConfigure={canConfigureScene}
        loadFlags={loadFlags}
        error={loadError}
        canInstall={Boolean(installPrompt)}
        isIOS={isIOS}
        onInstall={handleInstall}
        onAlign={reopenAlignment}
        onConfig={() => setConfigOpen(true)}
        onRetryScene={retryScene}
        onPlay={takeControl}
        onWatchRoute={watchRoute}
      />

      <GuidedIntro
        visible={mode === "home" && ready && alignmentDone && !alignmentPanelVisible && introOpen}
        step={introStep}
        ready={ready}
        sceneFallback={sceneFallback}
        loadFlags={loadFlags}
        onNext={() => setIntroStep((value) => Math.min(3, value + 1))}
        onBack={() => setIntroStep((value) => Math.max(0, value - 1))}
        onSkip={completeIntro}
        onPlay={takeControl}
        onWatchRoute={watchRoute}
      />
      {bundle && (
        <SceneAlignmentPanel
          visible={alignmentPanelVisible}
          bundle={bundle}
          player={player}
          alignment={sceneAlignment}
          adminMode={adminMode}
          hasAdminPreset={bundle.hasAdminAlignment}
          onAlignmentChange={(alignment) => setSceneAlignment(normalizeSceneAlignment(alignment))}
          onReset={resetAlignment}
          onConfirm={completeAlignment}
          onCopyAdminConfig={copyAdminAlignment}
        />
      )}
      {bundle && (
        <SceneConfigPanel
          visible={configOpen}
          bundle={bundle}
          player={player}
          alignment={sceneAlignment}
          adminMode={adminMode}
          hasLocalAlignmentOverride={hasLocalAlignmentOverride}
          collected={collectedIds.size}
          total={collectibles.length}
          elapsedSeconds={elapsed}
          bestSeconds={bestSeconds}
          lastSplit={lastSplit}
          fastestSplit={fastestSplit}
          adminDraft={adminDraft}
          recording={recording}
          videoRecording={videoRecording}
          videoUrl={videoUrl}
          room={room}
          checkpoint={checkpoint}
          markers={mapMarkers}
          selectedMarker={activeMarker}
          selectedMarkerDistance={activeMarkerDistance}
          target={activeTarget}
          targetDistance={activeTargetDistance}
          sceneStatus={sceneStatus}
          sceneFallback={sceneFallback}
          nearestSpotDistance={nearestAuthoredSpotDistance}
          spotAudit={spotAuditSummary}
          onClose={() => setConfigOpen(false)}
          onAlign={reopenAlignment}
          onSaveCheckpoint={saveCheckpoint}
          onReturnCheckpoint={returnToCheckpoint}
          onClearCheckpoint={clearCheckpoint}
          onCycleTarget={cycleTarget}
          onRetryScene={retryScene}
          onBuilder={() => {
            setConfigOpen(false);
            setBuilderOpen(true);
          }}
          onSetSpawn={setSpawnHere}
          onAddSpot={addSpotHere}
          onUndoSpot={undoSpot}
          onRemoveNearestSpot={removeNearestSpot}
          onRepairInvalidSpots={repairInvalidSpots}
          onDeleteInvalidSpots={deleteInvalidSpots}
          onClearSpots={clearSpots}
          onToggleRecording={toggleRecording}
          onRecordRouteVideo={recordRouteVideo}
          onExportConfig={exportConfig}
          onCopyShareLink={copyShareLink}
          onCreateRoom={createShareRoom}
          onResetPersonalAlignment={resetPersonalAlignment}
          onResetRun={() => {
            setConfigOpen(false);
            resetRun();
          }}
          onHome={() => {
            setConfigOpen(false);
            returnHome();
          }}
        />
      )}
      {bundle && (
        <SceneBuilderPanel
          visible={builderOpen}
          bundle={bundle}
          player={player}
          config={adminDraft ?? bundle.gameConfig}
          onChange={updateBuilderConfig}
          onExportConfig={exportConfig}
          onCopyShareLink={copyShareLink}
          onDeployConfig={deployCurrentMap}
          onSaveLocalDraft={saveLocalDraft}
          onImportConfig={importConfig}
          onUploadBundle={uploadBundleFiles}
          onCreateRoom={createShareRoom}
          onJoinRoom={joinShareRoom}
          onObserverMode={enterObserverMode}
          room={room}
          remotePlayers={remotePlayers}
          onPreviewGaussian={(id) => {
            setEntryGaussian(undefined);
            setActiveGaussianId(id);
            flash("Previewing Gaussian layer");
          }}
          onWatchRoute={watchRoute}
          onPlayStoryTest={playStoryTest}
          onToggleRecording={toggleRecording}
          onRecordRouteVideo={recordRouteVideo}
          recording={recording}
          videoRecording={videoRecording}
          videoUrl={videoUrl}
          deployStatus={deployStatus}
          localDraftStatus={localDraftStatus}
          onClose={() => setBuilderOpen(false)}
        />
      )}
      <RunSummary
        result={runResult}
        bestSeconds={bestSeconds}
        onReset={resetRun}
        onHome={() => {
          setRunResult(undefined);
          returnHome();
        }}
        onClose={() => setRunResult(undefined)}
      />
      {!qaScreenshotMode && <LandscapeGuard />}
    </div>
  );
}
