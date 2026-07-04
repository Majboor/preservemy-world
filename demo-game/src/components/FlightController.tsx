import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { clampThrottleSpeed, DEFAULT_THROTTLE_SPEED } from "../lib/flightTuning";
import { resolvePropCollisions } from "../lib/propCollision";
import { clampToSafeZone, isHardEscape } from "../lib/sceneData";
import type { CreativeProp, GameMode, PlayerSnapshot, SceneBundle } from "../types";
import { Jet } from "./Jet";

const TURN_RATE = 1.85;
const CLIMB_RATE = 0.95;
const BOOST_MULT = 2;
const PRECISION_MULT = 0.34;
const PRECISION_TURN_MULT = 0.58;
const MAX_BANK = 0.55;
const MAX_PITCH = 0.48;
const DEADZONE = 0.08;

function deadzoneCurve(value: number): number {
  const abs = Math.abs(value);
  if (abs < DEADZONE) return 0;
  const adjusted = (abs - DEADZONE) / (1 - DEADZONE);
  return Math.sign(value) * adjusted * adjusted;
}

function copyTupleToVector(tuple: [number, number, number], target: THREE.Vector3) {
  target.set(tuple[0], tuple[1], tuple[2]);
}

function snapshotFrom(
  position: THREE.Vector3,
  yaw: number,
  speed: number,
  boost: boolean,
  precision: boolean,
  floorId: string,
  status?: string,
): PlayerSnapshot {
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    yaw,
    speed,
    boost,
    precision,
    floorId,
    status,
  };
}

export function FlightController({
  bundle,
  mode,
  homeSignal,
  warpSignal,
  warpTarget,
  playerRef,
  boostHeld,
  precisionHeld,
  touchTurnAxis,
  touchForwardAxis,
  touchClimbAxis,
  throttleSpeed,
  creativeProps,
  onSnapshot,
  onRequestHome,
  onTogglePause,
  onTakeControl,
  onOpenConfig,
  onThrottleSpeedChange,
  onJetReady,
}: {
  bundle: SceneBundle;
  mode: GameMode;
  homeSignal: number;
  warpSignal: number;
  warpTarget?: PlayerSnapshot;
  playerRef: React.MutableRefObject<THREE.Vector3>;
  boostHeld: boolean;
  precisionHeld: boolean;
  touchTurnAxis: number;
  touchForwardAxis: number;
  touchClimbAxis: number;
  throttleSpeed: number;
  creativeProps: CreativeProp[];
  onSnapshot: (snapshot: PlayerSnapshot) => void;
  onRequestHome: (reason: string) => void;
  onTogglePause: () => void;
  onTakeControl: () => void;
  onOpenConfig: () => void;
  onThrottleSpeedChange: (speed: number) => void;
  onJetReady: () => void;
}) {
  const { camera, gl } = useThree();
  const shipRef = useRef<THREE.Group>(null);
  const trailGeomRef = useRef<THREE.BufferGeometry>(null);
  const modeRef = useRef(mode);
  const latestBundle = useRef(bundle);
  const latestCreativeProps = useRef(creativeProps);
  const position = useRef(new THREE.Vector3());
  const yaw = useRef(bundle.spawnRotation.yaw);
  const speed = useRef(DEFAULT_THROTTLE_SPEED);
  const bank = useRef(0);
  const pitch = useRef(0);
  const routeFrame = useRef(0);
  const escapeTimer = useRef(0);
  const hudTimer = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const pointerAxes = useRef({ x: 0, y: 0 });
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const camPos = useRef(new THREE.Vector3());
  const camLook = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const lastHomeSignal = useRef(homeSignal);
  const lastWarpSignal = useRef(warpSignal);

  const fwd = useMemo(() => new THREE.Vector3(), []);
  const nextPos = useMemo(() => new THREE.Vector3(), []);
  const visualEuler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const visualQ = useMemo(() => new THREE.Quaternion(), []);
  const camOffset = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const trail = useMemo(() => Array.from({ length: 80 }, () => new THREE.Vector3()), []);

  const placeAt = useCallback((target: PlayerSnapshot, status?: string) => {
    const currentBundle = latestBundle.current;
    const safe = clampToSafeZone([target.x, target.y, target.z], currentBundle.bounds, currentBundle.activeFloor, currentBundle.gameConfig?.editorZones);
    const collision = resolvePropCollisions(safe.position, latestCreativeProps.current, currentBundle.activeFloor.id);
    copyTupleToVector(collision.position, position.current);
    playerRef.current.copy(position.current);
    yaw.current = target.yaw;
    bank.current = 0;
    pitch.current = 0;
    speed.current = clampThrottleSpeed(throttleSpeed);
    escapeTimer.current = 0;
    routeFrame.current = 0;
    keys.current = {};
    pointerAxes.current = { x: 0, y: 0 };
    pointerStart.current = null;
    const back = new THREE.Vector3(
      Math.sin(yaw.current) * 0.8,
      0.22,
      Math.cos(yaw.current) * 0.8,
    );
    camPos.current.copy(position.current).add(back);
    camLook.current.copy(position.current);
    camera.position.copy(camPos.current);
    camera.lookAt(camLook.current);
    trail.forEach((point) => point.copy(position.current));
    onSnapshot(snapshotFrom(position.current, yaw.current, 0, false, false, currentBundle.activeFloor.id, status));
  }, [camera, onSnapshot, playerRef, throttleSpeed, trail]);

  const resetHome = useCallback(() => {
    const currentBundle = latestBundle.current;
    placeAt({
      x: currentBundle.spawn[0],
      y: currentBundle.spawn[1],
      z: currentBundle.spawn[2],
      yaw: currentBundle.spawnRotation.yaw,
      speed: 0,
      boost: false,
      precision: false,
      floorId: currentBundle.activeFloor.id,
    });
  }, [placeAt]);

  useEffect(() => {
    latestBundle.current = bundle;
  }, [bundle]);

  useEffect(() => {
    latestCreativeProps.current = creativeProps;
  }, [creativeProps]);

  useEffect(() => {
    speed.current = clampThrottleSpeed(throttleSpeed);
  }, [throttleSpeed]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      lastHomeSignal.current = homeSignal;
      lastWarpSignal.current = warpSignal;
      resetHome();
      return;
    }
    if (lastHomeSignal.current !== homeSignal) {
      lastHomeSignal.current = homeSignal;
      resetHome();
    }
    if (lastWarpSignal.current !== warpSignal) {
      lastWarpSignal.current = warpSignal;
      if (warpTarget) placeAt(warpTarget, "Checkpoint");
    }
  }, [homeSignal, placeAt, resetHome, warpSignal, warpTarget]);

  useEffect(() => {
    modeRef.current = mode;
    if (mode === "playing" || mode === "route") {
      document.body.classList.add("is-flight-active");
    } else {
      document.body.classList.remove("is-flight-active");
    }
  }, [mode]);

  useEffect(() => {
    const flightKeys = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
      "ShiftRight",
      "Space",
    ]);

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], .game-menu-overlay, .builder-overlay, .map-overlay, .config-overlay, .alignment-screen, .run-summary-overlay")) {
        return;
      }
      if (document.querySelector(".game-menu-overlay, .builder-overlay, .map-overlay, .config-overlay, .alignment-screen, .run-summary-overlay")) return;
      keys.current[event.code] = true;
      if (flightKeys.has(event.code) || event.code === "Space") event.preventDefault();
      if (event.code === "KeyP") {
        event.preventDefault();
        onRequestHome("Returned home");
      } else if (event.code === "KeyC") {
        event.preventDefault();
        onOpenConfig();
      } else if (event.code === "Escape") {
        event.preventDefault();
        onTogglePause();
      } else if (modeRef.current === "home" && flightKeys.has(event.code)) {
        onTakeControl();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
    };
    const onWheel = (event: WheelEvent) => {
      if (modeRef.current !== "playing") return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const nextSpeed = clampThrottleSpeed(speed.current - event.deltaY * 0.0012);
      if (nextSpeed !== speed.current) {
        speed.current = nextSpeed;
        onThrottleSpeedChange(nextSpeed);
      }
    };
    const updatePointerAxes = (event: PointerEvent) => {
      if (!pointerStart.current || pointerStart.current.id !== event.pointerId) return;
      event.preventDefault();
      const radius = 72;
      const rawDx = event.clientX - pointerStart.current.x;
      const rawDy = event.clientY - pointerStart.current.y;
      const dist = Math.hypot(rawDx, rawDy);
      if (dist > radius) {
        const angle = Math.atan2(rawDy, rawDx);
        pointerStart.current.x = event.clientX - Math.cos(angle) * radius;
        pointerStart.current.y = event.clientY - Math.sin(angle) * radius;
      }
      pointerAxes.current = {
        x: Math.max(-1, Math.min(1, (event.clientX - pointerStart.current.x) / radius)),
        y: Math.max(-1, Math.min(1, -(event.clientY - pointerStart.current.y) / radius)),
      };
    };
    const onPointerDown = (event: PointerEvent) => {
      if (modeRef.current !== "playing" || pointerStart.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".ui-panel, .touch-actions, .map-overlay")) return;
      event.preventDefault();
      pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      pointerAxes.current = { x: 0, y: 0 };
      gl.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => updatePointerAxes(event);
    const endPointer = (event: PointerEvent) => {
      if (pointerStart.current?.id !== event.pointerId) return;
      pointerStart.current = null;
      pointerAxes.current = { x: 0, y: 0 };
      try {
        gl.domElement.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may have already been released by the browser.
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("wheel", onWheel, { passive: false });
    gl.domElement.addEventListener("pointerdown", onPointerDown);
    gl.domElement.addEventListener("pointermove", onPointerMove);
    gl.domElement.addEventListener("pointerup", endPointer);
    gl.domElement.addEventListener("pointercancel", endPointer);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("wheel", onWheel);
      gl.domElement.removeEventListener("pointerdown", onPointerDown);
      gl.domElement.removeEventListener("pointermove", onPointerMove);
      gl.domElement.removeEventListener("pointerup", endPointer);
      gl.domElement.removeEventListener("pointercancel", endPointer);
    };
  }, [gl.domElement, onOpenConfig, onRequestHome, onTakeControl, onThrottleSpeedChange, onTogglePause]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const isInteractive = mode === "playing";
    const isRoute = mode === "route";
    const isAttract = mode === "home";
    const hasRoutePreview = bundle.trajectory.length > 1;

    let actualSpeed = 0;
    let boost = false;
    let precision = false;
    let status: string | undefined;

    if ((isRoute || isAttract) && hasRoutePreview) {
      routeFrame.current += (isAttract ? 1.35 : 4) * dt;
      if (routeFrame.current >= bundle.trajectory.length - 1) routeFrame.current = 0;
      const index = Math.floor(routeFrame.current);
      const frac = routeFrame.current - index;
      const current = bundle.trajectory[index].position;
      const next = bundle.trajectory[index + 1].position;
      position.current.set(
        current[0] + (next[0] - current[0]) * frac,
        current[1] + (next[1] - current[1]) * frac,
        current[2] + (next[2] - current[2]) * frac,
      );
      fwd.set(next[0] - current[0], next[1] - current[1], next[2] - current[2]).normalize();
      yaw.current = Math.atan2(-fwd.x, -fwd.z);
      const attractOrbit = isAttract ? Math.sin(routeFrame.current * 0.12) * 0.24 : 0;
      yaw.current += attractOrbit;
      pitch.current += (Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) - pitch.current) * 4 * dt;
      bank.current += ((isAttract ? Math.sin(routeFrame.current * 0.18) * 0.18 : 0) - bank.current) * 4 * dt;
      actualSpeed = DEFAULT_THROTTLE_SPEED * (isAttract ? 0.55 : 1);
      status = isAttract ? "Previewing arena" : "Watching route";
    } else if (isAttract) {
      routeFrame.current += 0.42 * dt;
      const spanX = Math.max(0.1, bundle.bounds.hi[0] - bundle.bounds.lo[0]);
      const spanY = Math.max(0.1, bundle.activeFloor.yMax - bundle.activeFloor.yMin);
      const spanZ = Math.max(0.1, bundle.bounds.hi[2] - bundle.bounds.lo[2]);
      const centerX = (bundle.bounds.lo[0] + bundle.bounds.hi[0]) / 2;
      const centerY = (bundle.activeFloor.yMin + bundle.activeFloor.yMax) / 2;
      const centerZ = (bundle.bounds.lo[2] + bundle.bounds.hi[2]) / 2;
      const angle = routeFrame.current;
      position.current.set(
        centerX + Math.sin(angle) * spanX * 0.28,
        centerY + Math.sin(angle * 0.7) * spanY * 0.18,
        centerZ + Math.cos(angle * 0.85) * spanZ * 0.28,
      );
      yaw.current = angle + Math.PI * 0.5;
      pitch.current += (Math.sin(angle * 0.5) * 0.18 - pitch.current) * 3.2 * dt;
      bank.current += (Math.sin(angle * 0.8) * 0.16 - bank.current) * 3.2 * dt;
      actualSpeed = DEFAULT_THROTTLE_SPEED * 0.35;
      status = "Previewing arena";
    } else if (isInteractive) {
      const k = keys.current;
      const pointerTurn = deadzoneCurve(pointerAxes.current.x);
      const touchTurn = deadzoneCurve(touchTurnAxis);
      let turnInput = Math.abs(pointerTurn) >= Math.abs(touchTurn) ? pointerTurn : touchTurn;
      if (k.KeyA || k.ArrowLeft) turnInput = -1;
      if (k.KeyD || k.ArrowRight) turnInput = 1;

      const pointerForward = deadzoneCurve(pointerAxes.current.y);
      const touchForward = deadzoneCurve(touchForwardAxis);
      let forwardInput = Math.abs(pointerForward) >= Math.abs(touchForward) ? pointerForward : touchForward;
      if (k.KeyW) forwardInput = 1;
      if (k.KeyS) forwardInput = -0.55;

      let altInput = touchClimbAxis;
      if (k.ArrowUp) altInput = 1;
      if (k.ArrowDown) altInput = -1;

      precision = Boolean(k.Space || precisionHeld);
      boost = !precision && Boolean(k.ShiftLeft || k.ShiftRight || boostHeld);
      const precisionScale = precision ? PRECISION_MULT : 1;
      const turnScale = precision ? PRECISION_TURN_MULT : 1;
      const moveSpeed = speed.current * forwardInput * (boost ? BOOST_MULT : 1) * precisionScale;
      actualSpeed = Math.abs(moveSpeed);
      yaw.current -= turnInput * TURN_RATE * turnScale * dt;

      const climbScale = (boost ? BOOST_MULT : 1) * precisionScale;
      fwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      nextPos.copy(position.current);
      nextPos.addScaledVector(fwd, moveSpeed * dt);
      nextPos.y += altInput * CLIMB_RATE * climbScale * dt;

      if (isHardEscape([nextPos.x, nextPos.y, nextPos.z], bundle.bounds, bundle.activeFloor, bundle.gameConfig?.editorZones)) {
        escapeTimer.current += dt;
      } else {
        escapeTimer.current = 0;
      }

      const safe = clampToSafeZone([nextPos.x, nextPos.y, nextPos.z], bundle.bounds, bundle.activeFloor, bundle.gameConfig?.editorZones);
      const collision = resolvePropCollisions(safe.position, creativeProps, bundle.activeFloor.id);
      const resolved = collision.collided
        ? clampToSafeZone(collision.position, bundle.bounds, bundle.activeFloor, bundle.gameConfig?.editorZones)
        : safe;
      position.current.set(resolved.position[0], resolved.position[1], resolved.position[2]);
      status = collision.collided
        ? `Blocked by ${collision.prop?.label ?? "object"}`
        : resolved.clamped ? resolved.reason : precision ? "Precision control" : undefined;

      if (escapeTimer.current > 1.1) {
        onRequestHome("Recovered from an invalid map layer");
        escapeTimer.current = 0;
      }

      const targetBank = -turnInput * MAX_BANK;
      const targetPitch = THREE.MathUtils.clamp(forwardInput * 0.24 + altInput * 0.34, -MAX_PITCH, MAX_PITCH);
      bank.current += (targetBank - bank.current) * 5 * dt;
      pitch.current += (targetPitch - pitch.current) * 6 * dt;
    } else {
      bank.current += (0 - bank.current) * 5 * dt;
      pitch.current += (0 - pitch.current) * 5 * dt;
    }

    playerRef.current.copy(position.current);
    visualEuler.set(pitch.current, yaw.current, bank.current);
    visualQ.setFromEuler(visualEuler);

    if (shipRef.current) {
      shipRef.current.position.copy(position.current);
      shipRef.current.quaternion.copy(visualQ);
    }

    const camDistance = isInteractive ? 0.82 + actualSpeed * 0.08 : isAttract ? 1.5 : 0.95;
    const camHeight = isAttract ? 0.46 + Math.sin(routeFrame.current * 0.2) * 0.12 : 0.22;
    camOffset.set(0, camHeight, camDistance).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current + (isAttract ? 0.28 : 0));
    const desiredCam = nextPos.copy(position.current).add(camOffset);
    lookTarget.copy(position.current).add(new THREE.Vector3(-Math.sin(yaw.current) * 0.45, 0.06, -Math.cos(yaw.current) * 0.45));
    const camEase = 1 - Math.exp(-10 * dt);
    camPos.current.lerp(desiredCam, camEase);
    camLook.current.lerp(lookTarget, 1 - Math.exp(-12 * dt));
    camera.position.copy(camPos.current);
    camera.lookAt(camLook.current);

    trail.pop();
    trail.unshift(position.current.clone().add(new THREE.Vector3(Math.sin(yaw.current) * 0.08, 0, Math.cos(yaw.current) * 0.08)));
    const geometry = trailGeomRef.current;
    if (geometry) {
      const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
      trail.forEach((point, index) => attr.setXYZ(index, point.x, point.y, point.z));
      attr.needsUpdate = true;
    }

    hudTimer.current += dt;
    if (hudTimer.current > 0.1) {
      hudTimer.current = 0;
      onSnapshot(snapshotFrom(
        position.current,
        yaw.current,
        actualSpeed,
        boost,
        precision,
        bundle.activeFloor.id,
        status,
      ));
    }
  });

  return (
    <>
      <line>
        <bufferGeometry ref={trailGeomRef}>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(80 * 3), 3]} count={80} />
        </bufferGeometry>
        <lineBasicMaterial color="#ff8a28" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </line>
      <group ref={shipRef}>
        <Jet onReady={onJetReady} />
      </group>
    </>
  );
}
