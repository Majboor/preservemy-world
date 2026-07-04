import { useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type {
  AmbientSoundEmitter,
  CollectibleDef,
  EditorZone,
  GaussianLayer,
  CreativeProp,
  PlayerSnapshot,
  RespawnPoint,
  SceneBounds,
  SceneBundle,
  SceneFloor,
  StoryStep,
  TrajectoryPose,
  Vec3Tuple,
  WorldEntryPoint,
} from "../types";
import { CreativeProps } from "./CreativeProps";
import { GaussianScene } from "./GaussianScene";

type PreviewSelectionKind =
  | "spawn"
  | "observer"
  | "respawn"
  | "spot"
  | "entry"
  | "prop"
  | "script"
  | "sound"
  | "gaussian"
  | "story-step"
  | "zone"
  | "zone-point"
  | "trajectory";

type PreviewSelection =
  | { kind: "spawn" }
  | { kind: "observer" }
  | { kind: "respawn"; id: string }
  | { kind: "spot"; id: string }
  | { kind: "entry"; id: string }
  | { kind: "prop"; id: string }
  | { kind: "sound"; id: string }
  | { kind: "gaussian"; id: string }
  | { kind: "story-step"; id: string }
  | { kind: "zone"; id: string }
  | { kind: "trajectory"; index: number };

type PreviewTransformMode = "move" | "rotate" | "scale";

interface PreviewTransform {
  position: Vec3Tuple;
  rotation: { x: number; y: number; z: number };
  scale: Vec3Tuple;
}

function boundsCenter(bounds: SceneBounds): Vec3Tuple {
  return [
    (bounds.lo[0] + bounds.hi[0]) / 2,
    (bounds.lo[1] + bounds.hi[1]) / 2,
    (bounds.lo[2] + bounds.hi[2]) / 2,
  ];
}

function boundsSize(bounds: SceneBounds): Vec3Tuple {
  return [
    Math.max(0.01, bounds.hi[0] - bounds.lo[0]),
    Math.max(0.01, bounds.hi[1] - bounds.lo[1]),
    Math.max(0.01, bounds.hi[2] - bounds.lo[2]),
  ];
}

function zoneColor(zone: EditorZone): string {
  if (zone.type === "blocked") return "#ff4d5e";
  if (zone.type === "warning") return "#ffb15c";
  if (zone.type === "cleanup") return "#b8b8b8";
  if (zone.type === "story") return "#35d6ff";
  if (zone.type === "playable") return "#4cff76";
  return "#ff5ec4";
}

function Marker({
  position,
  color,
  radius = 0.12,
  selected = false,
  onPointerDown,
}: {
  position: Vec3Tuple;
  color: string;
  radius?: number;
  selected?: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <mesh position={position} onPointerDown={onPointerDown}>
      <sphereGeometry args={[selected ? radius * 1.45 : radius, 16, 16]} />
      <meshBasicMaterial color={selected ? "#ffffff" : color} toneMapped={false} />
      {selected && (
        <mesh>
          <sphereGeometry args={[radius * 2.1, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </mesh>
  );
}

function selectionColor(kind?: PreviewSelectionKind): string {
  if (kind === "spot") return "#4cff76";
  if (kind === "entry") return "#ffb15c";
  if (kind === "sound") return "#ffd15c";
  if (kind === "gaussian") return "#d6c0ff";
  if (kind === "story-step") return "#ffd15c";
  if (kind === "prop") return "#ff9a58";
  if (kind === "respawn" || kind === "observer") return "#ff5ec4";
  if (kind === "zone" || kind === "zone-point") return "#61cfff";
  if (kind === "trajectory") return "#ff8232";
  return "#ffffff";
}

function AxisLine({ points, color }: { points: [Vec3Tuple, Vec3Tuple]; color: string }) {
  const positions = useMemo(() => new Float32Array(points.flat()), [points]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
    </line>
  );
}

function SelectionGizmo({
  position,
  kind,
  radius,
}: {
  position: Vec3Tuple;
  kind?: PreviewSelectionKind;
  radius: number;
}) {
  const color = selectionColor(kind);
  const axisLength = Math.max(radius * 0.08, 0.8);
  const ringRadius = Math.max(radius * 0.022, 0.22);
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ringRadius, Math.max(ringRadius * 0.035, 0.01), 8, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[Math.max(ringRadius * 0.18, 0.055), 16, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <AxisLine points={[[0, 0, 0], [axisLength, 0, 0]]} color="#ff5b66" />
      <AxisLine points={[[0, 0, 0], [0, axisLength, 0]]} color="#4cff76" />
      <AxisLine points={[[0, 0, 0], [0, 0, axisLength]]} color="#61cfff" />
      <mesh position={[axisLength, 0, 0]}>
        <boxGeometry args={[ringRadius * 0.22, ringRadius * 0.22, ringRadius * 0.22]} />
        <meshBasicMaterial color="#ff5b66" toneMapped={false} />
      </mesh>
      <mesh position={[0, axisLength, 0]}>
        <boxGeometry args={[ringRadius * 0.22, ringRadius * 0.22, ringRadius * 0.22]} />
        <meshBasicMaterial color="#4cff76" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, axisLength]}>
        <boxGeometry args={[ringRadius * 0.22, ringRadius * 0.22, ringRadius * 0.22]} />
        <meshBasicMaterial color="#61cfff" toneMapped={false} />
      </mesh>
    </group>
  );
}

function TransformHandle({
  position,
  rotation,
  scale,
  mode,
  snapEnabled,
  gridStep,
  angleSnapDegrees,
  onChange,
  onStart,
  onEnd,
}: {
  position: Vec3Tuple;
  rotation: { x: number; y: number; z: number };
  scale: Vec3Tuple;
  mode: PreviewTransformMode;
  snapEnabled: boolean;
  gridStep: number;
  angleSnapDegrees: number;
  onChange: (transform: PreviewTransform) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const controlMode = mode === "move" ? "translate" : mode;

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(...position);
    groupRef.current.rotation.set(rotation.x, rotation.y, rotation.z);
    groupRef.current.scale.set(...scale);
  }, [position[0], position[1], position[2], rotation.x, rotation.y, rotation.z, scale[0], scale[1], scale[2]]);

  const emitChange = () => {
    const object = groupRef.current;
    if (!object) return;
    onChange({
      position: [object.position.x, object.position.y, object.position.z],
      rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
      scale: [object.scale.x, object.scale.y, object.scale.z],
    });
  };

  return (
    <TransformControls
      mode={controlMode}
      translationSnap={snapEnabled ? Math.max(0.05, gridStep) : undefined}
      rotationSnap={snapEnabled ? THREE.MathUtils.degToRad(Math.max(1, angleSnapDegrees)) : undefined}
      scaleSnap={snapEnabled ? 0.05 : undefined}
      onMouseDown={onStart}
      onMouseUp={onEnd}
      onObjectChange={emitChange}
    >
      <group ref={groupRef} position={position} rotation={[rotation.x, rotation.y, rotation.z]} scale={scale}>
        <mesh visible={false}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
    </TransformControls>
  );
}

function CameraRig({
  center,
  radius,
  selectedPosition,
  frameSignal,
  resetSignal,
  controlsEnabled,
}: {
  center: Vec3Tuple;
  radius: number;
  selectedPosition?: Vec3Tuple;
  frameSignal: number;
  resetSignal: number;
  controlsEnabled: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const didInitializeCamera = useRef(false);

  useEffect(() => {
    if (didInitializeCamera.current && resetSignal === 0) return;
    didInitializeCamera.current = true;
    const target = new THREE.Vector3(...center);
    camera.position.set(center[0] + radius * 0.78, center[1] + radius * 0.5, center[2] + radius * 0.78);
    camera.lookAt(target);
    controlsRef.current?.target.copy(target);
    controlsRef.current?.update();
  }, [camera, resetSignal]);

  useEffect(() => {
    if (!selectedPosition) return;
    const target = new THREE.Vector3(...selectedPosition);
    const distance = Math.max(radius * 0.16, 1.2);
    camera.position.set(target.x + distance, target.y + distance * 0.62, target.z + distance);
    camera.lookAt(target);
    controlsRef.current?.target.copy(target);
    controlsRef.current?.update();
  }, [camera, frameSignal, radius]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={controlsEnabled}
      enableDamping
      dampingFactor={0.09}
      target={center}
      minDistance={Math.max(0.4, radius * 0.12)}
      maxDistance={Math.max(4, radius * 3)}
    />
  );
}

function BoundsBox({ bounds }: { bounds: SceneBounds }) {
  const center = boundsCenter(bounds);
  const size = boundsSize(bounds);
  return (
    <mesh position={center}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#4cff76" wireframe transparent opacity={0.42} toneMapped={false} />
    </mesh>
  );
}

function GaussianLayerBounds({
  layer,
  radius,
  selected,
  onPointerDown,
}: {
  layer: GaussianLayer;
  radius: number;
  selected: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const size = Math.max(0.45, radius * 0.22) * Math.max(0.05, layer.scale);
  const height = Math.max(0.35, radius * 0.13) * Math.max(0.05, layer.scale);
  const color = selected ? "#ffffff" : layer.active ? "#61cfff" : "#d6c0ff";

  return (
    <group position={layer.position} rotation={[layer.rotation.x, layer.rotation.y, layer.rotation.z]}>
      <mesh>
        <boxGeometry args={[size, height, size]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={selected ? 0.82 : layer.enabled ? 0.34 : 0.18}
          toneMapped={false}
        />
      </mesh>
      <mesh onPointerDown={onPointerDown}>
        <boxGeometry args={[size, height, size]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function FloorBand({ bounds, floor }: { bounds: SceneBounds; floor: SceneFloor }) {
  const size = boundsSize(bounds);
  const height = Math.max(0.03, floor.yMax - floor.yMin);
  const center: Vec3Tuple = [
    (bounds.lo[0] + bounds.hi[0]) / 2,
    (floor.yMin + floor.yMax) / 2,
    (bounds.lo[2] + bounds.hi[2]) / 2,
  ];
  return (
    <mesh position={center}>
      <boxGeometry args={[size[0], height, size[2]]} />
      <meshBasicMaterial color="#61cfff" transparent opacity={0.07} wireframe toneMapped={false} />
    </mesh>
  );
}

function ZoneBoxes({ zones }: { zones: EditorZone[] }) {
  return (
    <>
      {zones.filter((zone) => zone.enabled).map((zone) => {
        if (zone.points && zone.points.length >= 3) {
          return <PolygonZonePreview key={zone.id} zone={zone} />;
        }
        const center: Vec3Tuple = [
          (zone.lo[0] + zone.hi[0]) / 2,
          (zone.lo[1] + zone.hi[1]) / 2,
          (zone.lo[2] + zone.hi[2]) / 2,
        ];
        const size: Vec3Tuple = [
          Math.max(0.02, zone.hi[0] - zone.lo[0]),
          Math.max(0.02, zone.hi[1] - zone.lo[1]),
          Math.max(0.02, zone.hi[2] - zone.lo[2]),
        ];
        const color = zoneColor(zone);
        return (
          <mesh key={zone.id} position={center}>
            <boxGeometry args={size} />
            <meshBasicMaterial color={color} wireframe transparent opacity={zone.type === "cleanup" ? 0.52 : 0.38} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

function PolygonZonePreview({ zone }: { zone: EditorZone }) {
  const y = (zone.lo[1] + zone.hi[1]) / 2;
  const color = zoneColor(zone);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape((zone.points ?? []).map((point) => new THREE.Vector2(point[0], point[2])));
    return new THREE.ShapeGeometry(shape);
  }, [zone.points]);
  const lineGeometry = useMemo(() => {
    const points = zone.points ?? [];
    return new THREE.BufferGeometry().setFromPoints([
      ...points,
      points[0],
    ].map((point) => new THREE.Vector3(point[0], y + 0.01, point[2])));
  }, [zone.points, y]);

  return (
    <group>
      <mesh geometry={geometry} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color={color} wireframe={zone.type !== "cleanup"} transparent opacity={zone.type === "cleanup" ? 0.24 : 0.12} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <line>
        <primitive attach="geometry" object={lineGeometry} />
        <lineBasicMaterial color={color} transparent opacity={0.82} toneMapped={false} />
      </line>
    </group>
  );
}

function RouteLine({ trajectory }: { trajectory: TrajectoryPose[] }) {
  const positions = useMemo(() => {
    const sampled = trajectory.length > 260
      ? trajectory.filter((_, index) => index % Math.ceil(trajectory.length / 260) === 0)
      : trajectory;
    return new Float32Array(sampled.flatMap((pose) => pose.position));
  }, [trajectory]);

  if (positions.length < 6) return null;

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ff8232" linewidth={2} transparent opacity={0.78} toneMapped={false} />
    </line>
  );
}

export function BuilderGaussianPreview({
  bundle,
  layer,
  gaussianLayers,
  bounds,
  floor,
  zones,
  trajectory,
  spawn,
  player,
  collectibles,
  entries,
  observerSpawn,
  respawns,
  creativeProps,
  ambientSounds,
  storySteps,
  selectedPosition,
  selectedLabel,
  selectedKind,
  selectedId,
  selectedIndex,
  selectedRotation,
  selectedScale,
  playbackPosition,
  transformMode = "move",
  snapEnabled = true,
  gridStep = 0.5,
  angleSnapDegrees = 15,
  onSelect,
  onMoveSelected,
  onPlaceProp,
  onTransformChange,
  onTransformStart,
  onTransformEnd,
  frameSignal = 0,
  resetSignal = 0,
}: {
  bundle: SceneBundle;
  layer: GaussianLayer;
  gaussianLayers?: GaussianLayer[];
  bounds: SceneBounds;
  floor: SceneFloor;
  zones: EditorZone[];
  trajectory: TrajectoryPose[];
  spawn: Vec3Tuple;
  player: PlayerSnapshot;
  collectibles?: CollectibleDef[];
  entries?: WorldEntryPoint[];
  observerSpawn?: Vec3Tuple;
  respawns?: RespawnPoint[];
  creativeProps?: CreativeProp[];
  ambientSounds?: AmbientSoundEmitter[];
  storySteps?: StoryStep[];
  selectedPosition?: Vec3Tuple;
  selectedLabel?: string;
  selectedKind?: PreviewSelectionKind;
  selectedId?: string;
  selectedIndex?: number;
  selectedRotation?: { x: number; y: number; z: number };
  selectedScale?: Vec3Tuple;
  playbackPosition?: Vec3Tuple;
  transformMode?: PreviewTransformMode;
  snapEnabled?: boolean;
  gridStep?: number;
  angleSnapDegrees?: number;
  onSelect?: (selection: PreviewSelection) => void;
  onMoveSelected?: (selection: PreviewSelection, position: Vec3Tuple) => void;
  onPlaceProp?: (position: Vec3Tuple) => void;
  onTransformChange?: (transform: PreviewTransform) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  frameSignal?: number;
  resetSignal?: number;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dragging, setDragging] = useState<PreviewSelection | null>(null);
  const center = useMemo(() => boundsCenter(bounds), [bounds]);
  const size = useMemo(() => boundsSize(bounds), [bounds]);
  const radius = Math.max(size[0], size[1], size[2], 3);
  const cameraPosition: Vec3Tuple = [
    center[0] + radius * 0.78,
    center[1] + radius * 0.5,
    center[2] + radius * 0.78,
  ];
  const playerPosition: Vec3Tuple = [player.x, player.y, player.z];
  const renderedGaussianLayers = useMemo(() => {
    const layers = gaussianLayers?.length ? gaussianLayers : [layer];
    return layers.filter((item) => item.enabled && item.plyUrl.trim());
  }, [gaussianLayers, layer]);

  const getPreviewSelectionPosition = (selection: PreviewSelection): Vec3Tuple | undefined => {
    if (selection.kind === "spawn") return spawn;
    if (selection.kind === "observer") return observerSpawn;
    if (selection.kind === "respawn") return respawns?.find((point) => point.id === selection.id)?.position;
    if (selection.kind === "spot") return collectibles?.find((item) => item.id === selection.id)?.position;
    if (selection.kind === "entry") return entries?.find((entry) => entry.id === selection.id)?.position;
    if (selection.kind === "sound") return ambientSounds?.find((sound) => sound.id === selection.id)?.position;
    if (selection.kind === "story-step") return storySteps?.find((step) => step.id === selection.id)?.position as Vec3Tuple | undefined;
    if (selection.kind === "prop") return creativeProps?.find((prop) => prop.id === selection.id)?.position;
    if (selection.kind === "gaussian") return (gaussianLayers?.length ? gaussianLayers : [layer]).find((item) => item.id === selection.id)?.position;
    if (selection.kind === "trajectory") return trajectory[selection.index]?.position;
    return undefined;
  };

  useEffect(() => {
    setStatus(layer.enabled && layer.plyUrl.trim() ? "loading" : "ready");
  }, [layer.id, layer.plyUrl, layer.enabled, layer.position, layer.rotation.x, layer.rotation.y, layer.rotation.z, layer.scale]);

  const selectAndDrag = (selection: PreviewSelection) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelect?.(selection);
    setDragging(selection);
  };

  const moveOnPlane = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    const dragPosition = getPreviewSelectionPosition(dragging) ?? selectedPosition;
    if (!dragPosition) return;
    event.stopPropagation();
    onMoveSelected?.(dragging, [event.point.x, dragPosition[1], event.point.z]);
  };
  const placeOnPlane = (event: ThreeEvent<PointerEvent>) => {
    if (!onPlaceProp || dragging) return;
    event.stopPropagation();
    onPlaceProp([event.point.x, floor.yMax, event.point.z]);
  };
  const supportsFullTransform = selectedKind === "gaussian" || selectedKind === "prop";
  const activeTransformMode = supportsFullTransform ? transformMode : "move";

  return (
    <div className={`builder-preview ${dragging ? "is-dragging" : ""}`}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{
          position: cameraPosition,
          fov: 48,
          near: 0.01,
          far: Math.max(1000, radius * 22),
        }}
      >
        <color attach="background" args={["#050507"]} />
        <ambientLight intensity={1.15} />
        <directionalLight position={[center[0] + radius, center[1] + radius, center[2] + radius]} intensity={1.2} />
        {renderedGaussianLayers.map((gaussianLayer) => (
          <GaussianScene
            key={`${gaussianLayer.id}-${gaussianLayer.plyUrl}`}
            url={gaussianLayer.plyUrl}
            alignment={bundle.alignment}
            position={gaussianLayer.position}
            rotation={gaussianLayer.rotation}
            scale={gaussianLayer.scale}
            onReady={() => {
              if (gaussianLayer.id === layer.id) setStatus("ready");
            }}
            onError={() => {
              if (gaussianLayer.id === layer.id) setStatus("error");
            }}
          />
        ))}
        <BoundsBox bounds={bounds} />
        {(gaussianLayers?.length ? gaussianLayers : [layer]).map((gaussianLayer) => (
          <GaussianLayerBounds
            key={`gaussian-bounds-${gaussianLayer.id}`}
            layer={gaussianLayer}
            radius={radius}
            selected={selectedKind === "gaussian" && selectedId === gaussianLayer.id}
            onPointerDown={selectAndDrag({ kind: "gaussian", id: gaussianLayer.id })}
          />
        ))}
        <FloorBand bounds={bounds} floor={floor} />
        <RouteLine trajectory={trajectory} />
        <ZoneBoxes zones={zones} />
        <CreativeProps
          props={creativeProps ?? []}
          onPropPointerDown={(prop, event) => selectAndDrag({ kind: "prop", id: prop.id })(event)}
        />
        {(selectedPosition || onPlaceProp) && (
          <mesh
            position={[center[0], selectedPosition?.[1] ?? floor.yMax, center[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={placeOnPlane}
            onPointerMove={moveOnPlane}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            <planeGeometry args={[Math.max(size[0], size[2], radius) * 3, Math.max(size[0], size[2], radius) * 3]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <Marker
          position={spawn}
          color="#ffffff"
          radius={Math.max(radius * 0.01, 0.08)}
          selected={selectedKind === "spawn"}
          onPointerDown={selectAndDrag({ kind: "spawn" })}
        />
        {observerSpawn && (
          <Marker
            position={observerSpawn}
            color="#7c6dff"
            radius={Math.max(radius * 0.011, 0.085)}
            selected={selectedKind === "observer"}
            onPointerDown={selectAndDrag({ kind: "observer" })}
          />
        )}
        {respawns?.map((respawn) => (
          <Marker
            key={respawn.id}
            position={respawn.position}
            color="#ff5ec4"
            radius={Math.max(radius * 0.011, 0.085)}
            selected={selectedKind === "respawn" && selectedId === respawn.id}
            onPointerDown={selectAndDrag({ kind: "respawn", id: respawn.id })}
          />
        ))}
        {collectibles?.map((item) => (
          <Marker
            key={item.id}
            position={item.position}
            color="#4cff76"
            radius={Math.max(radius * 0.01, 0.08)}
            selected={selectedKind === "spot" && selectedId === item.id}
            onPointerDown={selectAndDrag({ kind: "spot", id: item.id })}
          />
        ))}
        {entries?.map((entry) => (
          <Marker
            key={entry.id}
            position={entry.position}
            color={entry.kind === "portal" ? "#61cfff" : entry.kind === "exit" ? "#ff5ec4" : "#ffb15c"}
            radius={Math.max(radius * 0.011, 0.085)}
            selected={selectedKind === "entry" && selectedId === entry.id}
            onPointerDown={selectAndDrag({ kind: "entry", id: entry.id })}
          />
        ))}
        {ambientSounds?.map((sound) => (
          <Marker
            key={sound.id}
            position={sound.position}
            color="#ffd15c"
            radius={Math.max(radius * 0.011, 0.085)}
            selected={selectedKind === "sound" && selectedId === sound.id}
            onPointerDown={selectAndDrag({ kind: "sound", id: sound.id })}
          />
        ))}
        {storySteps?.filter((step) => step.position && !step.hidden).map((step) => (
          <Marker
            key={step.id}
            position={step.position as Vec3Tuple}
            color={step.type === "treasure" ? "#ffd15c" : step.type === "checkpoint" ? "#61cfff" : step.type === "discovery" ? "#4cff76" : step.type === "end" ? "#ff5ec4" : "#d6c0ff"}
            radius={Math.max(radius * 0.012, 0.09)}
            selected={selectedKind === "story-step" && selectedId === step.id}
            onPointerDown={selectAndDrag({ kind: "story-step", id: step.id })}
          />
        ))}
        {creativeProps?.map((prop) => (
          <Marker
            key={`prop-marker-${prop.id}`}
            position={prop.position}
            color={prop.color}
            radius={Math.max(radius * 0.01, 0.08)}
            selected={selectedKind === "prop" && selectedId === prop.id}
            onPointerDown={selectAndDrag({ kind: "prop", id: prop.id })}
          />
        ))}
        {trajectory.map((pose, index) => {
          if (trajectory.length > 90 && index % Math.ceil(trajectory.length / 90) !== 0) return null;
          return (
            <Marker
              key={`trajectory-marker-${pose.name ?? index}`}
              position={pose.position}
              color="#ff8232"
              radius={Math.max(radius * 0.006, 0.045)}
              selected={selectedKind === "trajectory" && selectedIndex === index}
              onPointerDown={selectAndDrag({ kind: "trajectory", index })}
            />
          );
        })}
        <Marker position={playerPosition} color="#61cfff" radius={Math.max(radius * 0.012, 0.09)} />
        {playbackPosition && (
          <Marker
            position={playbackPosition}
            color="#00f0ff"
            radius={Math.max(radius * 0.013, 0.095)}
          />
        )}
        <Marker
          position={layer.position}
          color="#d6c0ff"
          radius={Math.max(radius * 0.014, 0.1)}
          selected={selectedKind === "gaussian" && selectedId === layer.id}
          onPointerDown={selectAndDrag({ kind: "gaussian", id: layer.id })}
        />
        {selectedPosition && (
          <SelectionGizmo position={selectedPosition} kind={selectedKind} radius={radius} />
        )}
        {selectedPosition && onTransformChange && (
          <TransformHandle
            position={selectedPosition}
            rotation={selectedRotation ?? { x: 0, y: 0, z: 0 }}
            scale={selectedScale ?? [1, 1, 1]}
            mode={activeTransformMode}
            snapEnabled={snapEnabled}
            gridStep={gridStep}
            angleSnapDegrees={angleSnapDegrees}
            onChange={onTransformChange}
            onStart={onTransformStart}
            onEnd={onTransformEnd}
          />
        )}
        <gridHelper args={[Math.max(size[0], size[2]), 12, new THREE.Color("#1b3340"), new THREE.Color("#102027")]} position={[center[0], bounds.lo[1], center[2]]} />
        <CameraRig
          center={center}
          radius={radius}
          selectedPosition={selectedPosition}
          frameSignal={frameSignal}
          resetSignal={resetSignal}
          controlsEnabled={!dragging}
        />
      </Canvas>
      <div className="builder-preview__hud">
        <strong>{layer.label}</strong>
        <span>{selectedLabel ? `Selected: ${selectedLabel}` : status === "ready" ? "Gaussian live" : status === "error" ? "Preview failed" : "Loading Gaussian"}</span>
      </div>
      <div className="builder-preview__legend" aria-hidden="true">
        <span><i className="is-bounds" /> bounds</span>
        <span><i className="is-route" /> route</span>
        <span><i className="is-player" /> player</span>
      </div>
      <div className="builder-preview__hint">Orbit: drag empty view. Move: drag selected marker. Frame/Reset: View ribbon.</div>
    </div>
  );
}
