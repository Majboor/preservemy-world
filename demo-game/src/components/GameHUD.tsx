import { useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  MAX_THROTTLE_SPEED,
  MIN_THROTTLE_SPEED,
  THROTTLE_STEP,
  clampThrottleSpeed,
  throttlePercent,
} from "../lib/flightTuning";
import type { CollectionSplit, CollectibleDef, GameMode, PlayerSnapshot, SceneBundle } from "../types";

function normalizeAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function GameHUD({
  mode,
  player,
  bundle,
  collected,
  total,
  elapsedSeconds,
  bestSeconds,
  lastSplit,
  message,
  checkpoint,
  target,
  targetDistance,
  sceneFallback,
  sceneStatus,
  boostHeld,
  precisionHeld,
  throttleSpeed,
  onBoostChange,
  onPrecisionChange,
  onMoveChange,
  onClimbChange,
  onThrottleChange,
  onHome,
  onSaveCheckpoint,
  onReturnCheckpoint,
  onCycleTarget,
  onRetryScene,
  onPlay,
  onWatchRoute,
  onPauseToggle,
  onBackToMenu,
  onAlign,
  onConfig,
}: {
  mode: GameMode;
  player: PlayerSnapshot;
  bundle: SceneBundle;
  collected: number;
  total: number;
  elapsedSeconds: number;
  bestSeconds?: number;
  lastSplit?: CollectionSplit;
  message?: string;
  checkpoint?: PlayerSnapshot;
  target?: CollectibleDef;
  targetDistance?: number;
  sceneFallback: boolean;
  sceneStatus: string;
  boostHeld: boolean;
  precisionHeld: boolean;
  throttleSpeed: number;
  onBoostChange: (held: boolean) => void;
  onPrecisionChange: (held: boolean) => void;
  onMoveChange: (turn: number, forward: number) => void;
  onClimbChange: (axis: number) => void;
  onThrottleChange: (speed: number) => void;
  onHome: () => void;
  onSaveCheckpoint: () => void;
  onReturnCheckpoint: () => void;
  onCycleTarget: () => void;
  onRetryScene: () => void;
  onPlay: () => void;
  onWatchRoute: () => void;
  onPauseToggle: () => void;
  onBackToMenu: () => void;
  onAlign: () => void;
  onConfig: () => void;
}) {
  const heading = (((-player.yaw * 180 / Math.PI) % 360) + 360) % 360;
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const bestText = bestSeconds === undefined ? "--:--" : formatElapsed(bestSeconds);
  const throttlePct = Math.round(throttlePercent(throttleSpeed));
  const commitStickFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.max(34, Math.min(rect.width, rect.height) / 2 - 14);
    const rawX = event.clientX - (rect.left + rect.width / 2);
    const rawY = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > radius ? radius / distance : 1;
    const x = (rawX * scale) / radius;
    const y = -(rawY * scale) / radius;
    setStick({ x, y });
    onMoveChange(x, y);
  };
  const releaseStick = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setStick({ x: 0, y: 0 });
    onMoveChange(0, 0);
  };
  const commitThrottleFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const nextSpeed = MIN_THROTTLE_SPEED + ratio * (MAX_THROTTLE_SPEED - MIN_THROTTLE_SPEED);
    onThrottleChange(nextSpeed);
  };
  const handleThrottleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.code === "ArrowUp" || event.code === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      onThrottleChange(clampThrottleSpeed(throttleSpeed + THROTTLE_STEP));
    } else if (event.code === "ArrowDown" || event.code === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      onThrottleChange(clampThrottleSpeed(throttleSpeed - THROTTLE_STEP));
    } else if (event.code === "PageUp") {
      event.preventDefault();
      event.stopPropagation();
      onThrottleChange(clampThrottleSpeed(throttleSpeed + THROTTLE_STEP * 4));
    } else if (event.code === "PageDown") {
      event.preventDefault();
      event.stopPropagation();
      onThrottleChange(clampThrottleSpeed(throttleSpeed - THROTTLE_STEP * 4));
    } else if (event.code === "Home") {
      event.preventDefault();
      event.stopPropagation();
      onThrottleChange(MIN_THROTTLE_SPEED);
    } else if (event.code === "End") {
      event.preventDefault();
      event.stopPropagation();
      onThrottleChange(MAX_THROTTLE_SPEED);
    }
  };
  const targetOrdinal = target ? Math.max(1, Number(target.id.match(/\d+$/)?.[0] ?? 0)) : 0;
  const targetYaw = target
    ? Math.atan2(-(target.position[0] - player.x), -(target.position[2] - player.z))
    : 0;
  const targetDelta = normalizeAngle(targetYaw - player.yaw);
  const targetCue = !target
    ? "No rings"
    : Math.abs(targetDelta) < 0.24
      ? "Ahead"
      : targetDelta > 0
        ? "Left"
        : "Right";

  return (
    <div className="hud-layer">
      <button className="back-link ui-panel" type="button" onClick={onBackToMenu}>Back</button>

      <div className="top-controls ui-panel">
        <button type="button" onClick={onHome}>Home</button>
        <button type="button" onClick={onSaveCheckpoint}>Mark</button>
        <button type="button" onClick={onReturnCheckpoint} disabled={!checkpoint}>Return</button>
        <button type="button" onClick={onWatchRoute}>Route</button>
        <button type="button" onClick={onCycleTarget} disabled={!target}>Next</button>
        <button type="button" onClick={onAlign}>Align</button>
        <button type="button" onClick={onConfig}>Config</button>
        <button type="button" onClick={onPauseToggle}>{mode === "paused" ? "Resume" : "Pause"}</button>
        {mode !== "playing" && <button type="button" onClick={onPlay}>Take control</button>}
      </div>

      <div className="score-panel ui-panel">
        <span>Rings</span>
        <strong>{collected} / {total}</strong>
        <span>{formatElapsed(elapsedSeconds)}</span>
        <small>Best {bestText}</small>
        {lastSplit && <small>Last #{lastSplit.ordinal} +{formatElapsed(lastSplit.splitSeconds)}</small>}
      </div>

      <div className="speed-readout ui-panel">
        <strong>{player.speed.toFixed(1)} m/s{player.boost ? " BOOST" : player.precision ? " FINE" : ""}</strong>
        <span>ALT {player.y.toFixed(1)}</span>
      </div>

      <div className="throttle-panel ui-panel" onPointerDown={(event) => event.stopPropagation()}>
        <div className="throttle-panel__meta">
          <span>Throttle</span>
          <strong>{throttlePct}%</strong>
        </div>
        <div
          className="throttle-track"
          role="slider"
          tabIndex={0}
          aria-label="Throttle"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={throttlePct}
          aria-valuetext={`${throttlePct}%`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            commitThrottleFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.preventDefault();
            event.stopPropagation();
            commitThrottleFromPointer(event);
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onKeyDown={handleThrottleKey}
        >
          <i style={{ height: `${throttlePct}%` }} />
          <span aria-hidden="true" style={{ bottom: `calc(${throttlePct}% - 4px)` }} />
        </div>
      </div>

      <div className={`target-panel ui-panel ${target ? "" : "is-empty"}`}>
        <span>Target</span>
        <strong>{target ? `#${targetOrdinal} · ${targetDistance?.toFixed(1) ?? "--"}m` : "Clear"}</strong>
        <em>{targetCue}</em>
        <button type="button" onClick={onCycleTarget} disabled={!target}>Next</button>
      </div>

      {sceneFallback && (
        <div className="scene-health ui-panel">
          <span>3D scene</span>
          <strong>{sceneStatus}</strong>
          <button type="button" onClick={onRetryScene}>Retry</button>
        </div>
      )}

      <div className="compass ui-panel">
        <div className="compass__strip" style={{ transform: `translateX(${-heading * 1.2}px)` }}>
          {["N", "", "E", "", "S", "", "W", "", "N"].map((mark, index) => (
            <span key={`${mark}-${index}`}>{mark || "|"}</span>
          ))}
        </div>
        <div className="compass__needle" />
      </div>

      <div className="altitude ui-panel">
        <span>ALT</span>
        <div>
          <i
            style={{
              bottom: `${Math.max(0, Math.min(100, ((player.y - bundle.activeFloor.yMin) / (bundle.activeFloor.yMax - bundle.activeFloor.yMin)) * 100))}%`,
            }}
          />
        </div>
      </div>

      <div className="bottom-hint ui-panel">
        {message || player.status || "W/S move · A/D turn · ↑/↓ altitude · M mark · R return · N target · P home"}
      </div>

      <div className="mobile-stick ui-panel">
        <strong>Flight</strong>
        <div
          className="mobile-stick__pad"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            commitStickFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.preventDefault();
            event.stopPropagation();
            commitStickFromPointer(event);
          }}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
          onPointerLeave={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) releaseStick(event);
          }}
        >
          <i style={{ transform: `translate(${stick.x * 38}px, ${-stick.y * 38}px)` }} />
        </div>
        <span>Turn / move</span>
      </div>

      <div className="touch-actions">
        <button
          type="button"
          className={boostHeld ? "is-active" : ""}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onBoostChange(true);
          }}
          onPointerUp={() => onBoostChange(false)}
          onPointerCancel={() => onBoostChange(false)}
          onPointerLeave={() => onBoostChange(false)}
        >
          Boost
        </button>
        <button
          type="button"
          className={precisionHeld ? "is-active" : ""}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onPrecisionChange(true);
          }}
          onPointerUp={() => onPrecisionChange(false)}
          onPointerCancel={() => onPrecisionChange(false)}
          onPointerLeave={() => onPrecisionChange(false)}
        >
          Fine
        </button>
        <button
          type="button"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onClimbChange(1);
          }}
          onPointerUp={() => onClimbChange(0)}
          onPointerCancel={() => onClimbChange(0)}
          onPointerLeave={() => onClimbChange(0)}
        >
          Up
        </button>
        <button
          type="button"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onClimbChange(-1);
          }}
          onPointerUp={() => onClimbChange(0)}
          onPointerCancel={() => onClimbChange(0)}
          onPointerLeave={() => onClimbChange(0)}
        >
          Down
        </button>
        <button type="button" onClick={onHome}>Home</button>
        <button type="button" onClick={onSaveCheckpoint}>Mark</button>
        <button type="button" onClick={onReturnCheckpoint} disabled={!checkpoint}>Return</button>
        <button type="button" onClick={onCycleTarget} disabled={!target}>Next</button>
      </div>
    </div>
  );
}
