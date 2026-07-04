import { useEffect, useMemo, useRef, useState } from "react";
import type { CollectibleDef, EditorZone, MapMarker, PlayerSnapshot, SceneBundle, WorldEntryPoint } from "../types";
import { EntryIcon, HomeScreenIcon, MarkerIcon, RingIcon, TargetIcon } from "./GameIcons";

const RES = 120;
const DISPLAY = 160;
const PAD = 8;

function worldToPixel(bundle: SceneBundle, x: number, z: number, size = RES) {
  const { bounds } = bundle;
  const width = bounds.hi[0] - bounds.lo[0];
  const depth = bounds.hi[2] - bounds.lo[2];
  const draw = size - PAD * 2;
  const scale = Math.min(draw / width, draw / depth);
  const ox = PAD + (draw - width * scale) / 2;
  const oy = PAD + (draw - depth * scale) / 2;
  return {
    x: ox + (x - bounds.lo[0]) * scale,
    y: oy + (z - bounds.lo[2]) * scale,
  };
}

function drawMiniRing(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean) {
  ctx.beginPath();
  ctx.arc(x, y, selected ? 3.7 : 3, 0, Math.PI * 2);
  ctx.strokeStyle = selected ? "#ffffff" : "#4cff76";
  ctx.lineWidth = selected ? 1.3 : 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 1.1, 0, Math.PI * 2);
  ctx.fillStyle = selected ? "#eaff6a" : "#4cff76";
  ctx.fill();
}

function drawMiniMarker(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean) {
  ctx.beginPath();
  ctx.moveTo(x, y + 4.4);
  ctx.lineTo(x - 3.4, y - 0.4);
  ctx.arc(x, y - 1.2, 3.2, Math.PI * 0.78, Math.PI * 2.22);
  ctx.closePath();
  ctx.fillStyle = selected ? "#ffffff" : "#4aa8ff";
  ctx.fill();
}

function drawMiniEntry(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x - 4, y);
  ctx.closePath();
  ctx.strokeStyle = "#ffb15c";
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

function drawMiniHome(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 0.5);
  ctx.lineTo(x, y - 4.2);
  ctx.lineTo(x + 4, y - 0.5);
  ctx.moveTo(x - 3, y - 0.5);
  ctx.lineTo(x - 3, y + 4);
  ctx.lineTo(x + 3, y + 4);
  ctx.lineTo(x + 3, y - 0.5);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

function zonePaint(zone: EditorZone): string {
  if (zone.type === "cleanup") return "rgba(170,170,170,0.22)";
  if (zone.type === "blocked") return "rgba(255,77,94,0.20)";
  if (zone.type === "warning") return "rgba(255,176,46,0.18)";
  if (zone.type === "respawn") return "rgba(124,109,255,0.18)";
  if (zone.type === "playable") return "rgba(76,255,118,0.12)";
  return "rgba(53,214,255,0.16)";
}

function drawZone(ctx: CanvasRenderingContext2D, bundle: SceneBundle, zone: EditorZone) {
  const color = zonePaint(zone);
  ctx.fillStyle = color;
  ctx.strokeStyle = color.replace(/0\.\d+\)$/, "0.7)");
  ctx.lineWidth = zone.type === "cleanup" ? 1.4 : 1;

  if (zone.points && zone.points.length >= 3) {
    ctx.beginPath();
    zone.points.forEach((point, index) => {
      const pixel = worldToPixel(bundle, point[0], point[2]);
      if (index === 0) ctx.moveTo(pixel.x, pixel.y);
      else ctx.lineTo(pixel.x, pixel.y);
    });
    ctx.closePath();
    ctx.fill();
    if (zone.type === "cleanup") ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const lo = worldToPixel(bundle, zone.lo[0], zone.lo[2]);
  const hi = worldToPixel(bundle, zone.hi[0], zone.hi[2]);
  const x = Math.min(lo.x, hi.x);
  const y = Math.min(lo.y, hi.y);
  const width = Math.abs(hi.x - lo.x);
  const height = Math.abs(hi.y - lo.y);
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
}

export function RadarMap({
  bundle,
  player,
  collectibles,
  collectedIds,
  target,
  targetDistance,
  markers,
  selectedMarkerId,
  entryPoints = [],
  editorZones = [],
  expanded,
  onExpandedChange,
  onHome,
  onSelectMarker,
  onGoToMarker,
  onRenameMarker,
  onDeleteMarker,
}: {
  bundle: SceneBundle;
  player: PlayerSnapshot;
  collectibles: CollectibleDef[];
  collectedIds: Set<string>;
  target?: CollectibleDef;
  targetDistance?: number;
  markers: MapMarker[];
  selectedMarkerId?: string;
  entryPoints?: WorldEntryPoint[];
  editorZones?: EditorZone[];
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  onHome: () => void;
  onSelectMarker: (id: string) => void;
  onGoToMarker: (id: string) => void;
  onRenameMarker: (id: string, label: string) => void;
  onDeleteMarker: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pulse, setPulse] = useState(false);
  const mapRotation = useMemo(() => -(player.yaw * 180) / Math.PI, [player.yaw]);
  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.id === selectedMarkerId),
    [markers, selectedMarkerId],
  );
  const markerPixels = useMemo(
    () => markers.map((marker) => ({
      marker,
      point: worldToPixel(bundle, marker.position[0], marker.position[2]),
    })),
    [bundle, markers],
  );
  const collectiblePixels = useMemo(
    () => collectibles
      .filter((item) => !collectedIds.has(item.id))
      .map((item) => ({
        item,
        point: worldToPixel(bundle, item.position[0], item.position[2]),
      })),
    [bundle, collectedIds, collectibles],
  );

  useEffect(() => {
    const id = window.setInterval(() => setPulse((value) => !value), 650);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      event.preventDefault();
      onExpandedChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, RES, RES);
    ctx.fillStyle = "#050507";
    ctx.fillRect(0, 0, RES, RES);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = PAD; i <= RES - PAD; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, PAD);
      ctx.lineTo(i, RES - PAD);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PAD, i);
      ctx.lineTo(RES - PAD, i);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(0,255,210,0.42)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD, PAD, RES - PAD * 2, RES - PAD * 2);

    for (const zone of editorZones) {
      if (!zone.enabled) continue;
      drawZone(ctx, bundle, zone);
    }

    if (bundle.trajectory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,130,50,0.42)";
      ctx.lineWidth = 1;
      bundle.trajectory.forEach((pose, index) => {
        const p = worldToPixel(bundle, pose.position[0], pose.position[2]);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    for (const item of collectibles) {
      if (collectedIds.has(item.id)) continue;
      const p = worldToPixel(bundle, item.position[0], item.position[2]);
      drawMiniRing(ctx, p.x, p.y, item.id === target?.id);
    }

    for (const marker of markers) {
      const p = worldToPixel(bundle, marker.position[0], marker.position[2]);
      drawMiniMarker(ctx, p.x, p.y, marker.id === selectedMarkerId);
    }

    for (const entry of entryPoints) {
      const p = worldToPixel(bundle, entry.position[0], entry.position[2]);
      drawMiniEntry(ctx, p.x, p.y);
    }

    const home = worldToPixel(bundle, bundle.spawn[0], bundle.spawn[2]);
    drawMiniHome(ctx, home.x, home.y);
  }, [bundle, collectedIds, collectibles, editorZones, entryPoints, markers, selectedMarkerId, target]);

  const playerPixel = worldToPixel(bundle, player.x, player.z, DISPLAY);
  const homePixel = worldToPixel(bundle, bundle.spawn[0], bundle.spawn[2]);
  const offMap = playerPixel.x < 0 || playerPixel.x > DISPLAY || playerPixel.y < 0 || playerPixel.y > DISPLAY;
  const outOfFloor = player.y < bundle.activeFloor.yMin || player.y > bundle.activeFloor.yMax;

  return (
    <>
      <button
        className={`radar ui-panel ${offMap || outOfFloor ? "is-alert" : ""}`}
        type="button"
        onClick={() => onExpandedChange(true)}
        aria-label="Open map"
      >
        <div className="radar-rotor" style={{ transform: `rotate(${mapRotation}deg)` }}>
          <canvas ref={canvasRef} width={RES} height={RES} />
          <svg viewBox={`0 0 ${DISPLAY} ${DISPLAY}`} aria-hidden="true">
            <circle
              cx={playerPixel.x}
              cy={playerPixel.y}
              r={pulse ? 10 : 6}
              fill="none"
              stroke="rgba(255,255,255,0.32)"
              strokeWidth="1"
            />
            <line
              x1={playerPixel.x}
              y1={playerPixel.y}
              x2={playerPixel.x - Math.sin(player.yaw) * 18}
              y2={playerPixel.y - Math.cos(player.yaw) * 18}
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx={playerPixel.x} cy={playerPixel.y} r="3.2" fill="#fff" />
          </svg>
        </div>
        <span>{outOfFloor ? "Layer" : offMap ? "Edge" : "Map"}</span>
      </button>

      {expanded && (
        <div
          className="map-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) onExpandedChange(false);
          }}
        >
          <div className="map-card ui-panel">
            <div className="map-card__bar">
              <strong>Scene map</strong>
              <div>
                <button type="button" onClick={onHome}>Home</button>
                <button type="button" onClick={() => onExpandedChange(false)}>Close</button>
              </div>
            </div>
            <div className="map-large">
              <canvas width={RES} height={RES} ref={(node) => {
                if (!node || !canvasRef.current) return;
                const ctx = node.getContext("2d");
                if (!ctx) return;
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, RES, RES);
                ctx.drawImage(canvasRef.current, 0, 0);
              }} />
              <span
                className="map-large__icon map-large__icon--home"
                style={{
                  left: `${(homePixel.x / RES) * 100}%`,
                  top: `${(homePixel.y / RES) * 100}%`,
                }}
                title="Home spawn"
              >
                <HomeScreenIcon />
              </span>
              {collectiblePixels.map(({ item, point }) => (
                <span
                  key={item.id}
                  className={`map-large__icon ${item.id === target?.id ? "map-large__icon--target" : "map-large__icon--ring"}`}
                  style={{
                    left: `${(point.x / RES) * 100}%`,
                    top: `${(point.y / RES) * 100}%`,
                  }}
                  title={item.id === target?.id ? "Current target" : item.label ?? item.id}
                >
                  {item.id === target?.id ? <TargetIcon /> : <RingIcon />}
                </span>
              ))}
              <div
                className="map-large__player"
                style={{
                  left: `${(worldToPixel(bundle, player.x, player.z).x / RES) * 100}%`,
                  top: `${(worldToPixel(bundle, player.x, player.z).y / RES) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${(-player.yaw * 180) / Math.PI}deg)`,
                }}
              />
              {markerPixels.map(({ marker, point }) => (
                <button
                  key={marker.id}
                  type="button"
                  className={`map-large__marker ${marker.id === selectedMarkerId ? "is-selected" : ""}`}
                  style={{
                    left: `${(point.x / RES) * 100}%`,
                    top: `${(point.y / RES) * 100}%`,
                  }}
                  onClick={() => onSelectMarker(marker.id)}
                >
                  <MarkerIcon />
                  <span>{marker.label}</span>
                </button>
              ))}
              {entryPoints.map((entry) => {
                const point = worldToPixel(bundle, entry.position[0], entry.position[2]);
                return (
                  <span
                    key={entry.id}
                    className="map-large__entry"
                    style={{
                      left: `${(point.x / RES) * 100}%`,
                      top: `${(point.y / RES) * 100}%`,
                    }}
                  >
                    <EntryIcon />
                    <span>{entry.label}</span>
                  </span>
                );
              })}
            </div>
            <div className="map-card__meta">
              <span>{bundle.activeFloor.label}</span>
              <span>
                {selectedMarker
                  ? `Mark ${selectedMarker.label}`
                  : target
                    ? `Target ${targetDistance?.toFixed(1) ?? "--"}m`
                    : `${collectibles.length - collectedIds.size} rings left`}
              </span>
              <span>{player.x.toFixed(1)}, {player.y.toFixed(1)}, {player.z.toFixed(1)}</span>
            </div>
            <div className="map-marker-list">
              <strong>Marked locations</strong>
              {markers.length === 0 ? (
                <p>No marks yet. Use Mark while flying to save this position.</p>
              ) : (
                <ul>
                  {markers.map((marker) => (
                    <li key={marker.id} className={marker.id === selectedMarkerId ? "is-selected" : ""}>
                      <input
                        value={marker.label}
                        aria-label={`${marker.label} label`}
                        onChange={(event) => onRenameMarker(marker.id, event.currentTarget.value)}
                      />
                      <span>{marker.position.map((value) => value.toFixed(1)).join(", ")}</span>
                      <button type="button" onClick={() => onSelectMarker(marker.id)}>Guide</button>
                      <button type="button" onClick={() => onGoToMarker(marker.id)}>Go</button>
                      <button type="button" onClick={() => onDeleteMarker(marker.id)}>Delete</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
