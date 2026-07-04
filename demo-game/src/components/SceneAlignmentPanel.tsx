import { useEffect, useRef } from "react";
import type { PlayerSnapshot, SceneAlignment, SceneBundle } from "../types";

const STEP = Math.PI / 12;
const QUARTER_TURN = Math.PI / 2;
const PAD = 12;
const PREVIEW_SIZE = 220;

type Axis = "x" | "y" | "z";

const AXES: Array<{ axis: Axis; label: string; hint: string }> = [
  { axis: "x", label: "X", hint: "Pitch" },
  { axis: "y", label: "Y", hint: "Yaw" },
  { axis: "z", label: "Z", hint: "Roll" },
];

function normalizeAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function deg(rad: number): number {
  return Math.round((rad * 180) / Math.PI);
}

function rad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function drawPreview(canvas: HTMLCanvasElement, bundle: SceneBundle, player: PlayerSnapshot) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = PREVIEW_SIZE * dpr;
  canvas.height = PREVIEW_SIZE * dpr;
  canvas.style.width = `${PREVIEW_SIZE}px`;
  canvas.style.height = `${PREVIEW_SIZE}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

  const width = Math.max(0.001, bundle.bounds.hi[0] - bundle.bounds.lo[0]);
  const depth = Math.max(0.001, bundle.bounds.hi[2] - bundle.bounds.lo[2]);
  const draw = PREVIEW_SIZE - PAD * 2;
  const scale = Math.min(draw / width, draw / depth);
  const ox = PAD + (draw - width * scale) / 2;
  const oy = PAD + (draw - depth * scale) / 2;
  const toPixel = (x: number, z: number) => ({
    x: ox + (x - bundle.bounds.lo[0]) * scale,
    y: oy + (z - bundle.bounds.lo[2]) * scale,
  });

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = PAD; i <= PREVIEW_SIZE - PAD; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, PAD);
    ctx.lineTo(i, PREVIEW_SIZE - PAD);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(PAD, i);
    ctx.lineTo(PREVIEW_SIZE - PAD, i);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(76,255,118,0.62)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, width * scale, depth * scale);

  if (bundle.trajectory.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,138,40,0.72)";
    ctx.lineWidth = 1.5;
    bundle.trajectory.forEach((pose, index) => {
      const p = toPixel(pose.position[0], pose.position[2]);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  const jet = toPixel(player.x, player.z);
  const center = toPixel(
    (bundle.bounds.lo[0] + bundle.bounds.hi[0]) / 2,
    (bundle.bounds.lo[2] + bundle.bounds.hi[2]) / 2,
  );

  ctx.beginPath();
  ctx.moveTo(jet.x, jet.y);
  ctx.lineTo(center.x, center.y);
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#4cff76";
  ctx.fillRect(center.x - 4, center.y - 4, 8, 8);

  ctx.save();
  ctx.translate(jet.x, jet.y);
  ctx.rotate(-player.yaw);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 8);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

export function SceneAlignmentPanel({
  visible,
  bundle,
  player,
  alignment,
  adminMode,
  hasAdminPreset,
  onAlignmentChange,
  onReset,
  onConfirm,
  onCopyAdminConfig,
}: {
  visible: boolean;
  bundle: SceneBundle;
  player: PlayerSnapshot;
  alignment: SceneAlignment;
  adminMode: boolean;
  hasAdminPreset: boolean;
  onAlignmentChange: (alignment: SceneAlignment) => void;
  onReset: () => void;
  onConfirm: () => void;
  onCopyAdminConfig: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    drawPreview(canvasRef.current, bundle, player);
  }, [bundle, player, visible]);

  if (!visible) return null;

  const setAxis = (axis: Axis, value: number) => {
    onAlignmentChange({
      ...alignment,
      [axis]: normalizeAngle(value),
    });
  };
  const nudge = (axis: Axis, amount: number) => setAxis(axis, alignment[axis] + amount);
  const description = adminMode
    ? "Tune the shared preset once, then copy it into the scene manifest. Players will load that preset first."
    : hasAdminPreset
      ? "This starts from the admin preset. Save only if this device needs its own adjustment."
      : "Match the jet marker from your current position. The white line connects the jet to the map center.";

  return (
    <div className="alignment-screen" role="dialog" aria-modal="true" aria-label="Scene alignment">
      <div className="alignment-panel ui-panel">
        <header className="alignment-panel__head">
          <div>
            <span className="alignment-panel__eyebrow">Pre-flight · Align</span>
            <strong>Align scene</strong>
          </div>
          <div className="alignment-panel__floor">{bundle.activeFloor.label}</div>
        </header>

        <div className="alignment-layout">
          <div className="alignment-preview">
            <canvas ref={canvasRef} aria-label="Scene alignment map" />
            <div className="alignment-preview__legend">
              <span><i className="alignment-legend-dot is-jet" />Jet</span>
              <span><i className="alignment-legend-dot is-map" />Map</span>
              <span><i className="alignment-legend-dot is-route" />Route</span>
            </div>
          </div>
          <div className="alignment-controls">
            <p>{description}</p>
            <div className="alignment-readout">
              <span>Current rotation</span>
              <strong>X {deg(alignment.x)}° · Y {deg(alignment.y)}° · Z {deg(alignment.z)}°</strong>
            </div>
            <div className="alignment-axis-list">
              {AXES.map(({ axis, label, hint }) => (
                <div className="alignment-axis" key={axis}>
                  <label htmlFor={`align-${axis}`}>
                    <b>{label}</b>
                    <em>{hint}</em>
                  </label>
                  <input
                    id={`align-${axis}`}
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={deg(alignment[axis])}
                    onChange={(event) => setAxis(axis, rad(Number(event.currentTarget.value)))}
                  />
                  <output>{deg(alignment[axis])}°</output>
                  <div className="alignment-axis__nudge">
                    <button type="button" onClick={() => nudge(axis, -QUARTER_TURN)}>-90</button>
                    <button type="button" onClick={() => nudge(axis, -STEP)}>-15</button>
                    <button type="button" onClick={() => nudge(axis, STEP)}>+15</button>
                    <button type="button" onClick={() => nudge(axis, QUARTER_TURN)}>+90</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="alignment-actions">
          <div className="alignment-actions__secondary">
            <button type="button" onClick={() => onAlignmentChange({ x: 0, y: 0, z: 0 })}>Zero</button>
            <button type="button" onClick={onReset}>{hasAdminPreset ? "Admin preset" : "Reset"}</button>
            {adminMode && <button type="button" onClick={onCopyAdminConfig}>Copy admin JSON</button>}
          </div>
          <button type="button" className="alignment-actions__confirm" onClick={onConfirm}>
            {hasAdminPreset ? "Save my view" : "Looks aligned"}
          </button>
        </footer>
      </div>
    </div>
  );
}
