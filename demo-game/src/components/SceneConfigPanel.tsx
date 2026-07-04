import { useEffect, useState } from "react";
import type { CollectionSplit, CollectibleDef, GameConfig, MapMarker, PlayerSnapshot, SceneAlignment, SceneBundle, SpotAuditSummary } from "../types";
import type { RoomState } from "../lib/roomClient";

function deg(value: number): number {
  return Math.round((value * 180) / Math.PI);
}

function formatAlignment(alignment: SceneAlignment): string {
  return `X ${deg(alignment.x)} / Y ${deg(alignment.y)} / Z ${deg(alignment.z)}`;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTuple(tuple: [number, number, number]): string {
  return tuple.map((value) => value.toFixed(1)).join(", ");
}

type ConfigTab = "status" | "map" | "run" | "admin";

export function SceneConfigPanel({
  visible,
  bundle,
  player,
  alignment,
  adminMode,
  hasLocalAlignmentOverride,
  collected,
  total,
  elapsedSeconds,
  bestSeconds,
  lastSplit,
  fastestSplit,
  adminDraft,
  recording,
  videoRecording,
  videoUrl,
  room,
  checkpoint,
  markers,
  selectedMarker,
  selectedMarkerDistance,
  target,
  targetDistance,
  sceneStatus,
  sceneFallback,
  nearestSpotDistance,
  spotAudit,
  onClose,
  onAlign,
  onSaveCheckpoint,
  onReturnCheckpoint,
  onClearCheckpoint,
  onCycleTarget,
  onRetryScene,
  onBuilder,
  onSetSpawn,
  onAddSpot,
  onUndoSpot,
  onRemoveNearestSpot,
  onRepairInvalidSpots,
  onDeleteInvalidSpots,
  onClearSpots,
  onToggleRecording,
  onRecordRouteVideo,
  onExportConfig,
  onCopyShareLink,
  onCreateRoom,
  onResetPersonalAlignment,
  onResetRun,
  onHome,
}: {
  visible: boolean;
  bundle: SceneBundle;
  player: PlayerSnapshot;
  alignment: SceneAlignment;
  adminMode: boolean;
  hasLocalAlignmentOverride: boolean;
  collected: number;
  total: number;
  elapsedSeconds: number;
  bestSeconds?: number;
  lastSplit?: CollectionSplit;
  fastestSplit?: CollectionSplit;
  adminDraft?: GameConfig;
  recording: boolean;
  videoRecording: boolean;
  videoUrl?: string;
  room: RoomState;
  checkpoint?: PlayerSnapshot;
  markers: MapMarker[];
  selectedMarker?: MapMarker;
  selectedMarkerDistance?: number;
  target?: CollectibleDef;
  targetDistance?: number;
  sceneStatus: string;
  sceneFallback: boolean;
  nearestSpotDistance?: number;
  spotAudit: SpotAuditSummary;
  onClose: () => void;
  onAlign: () => void;
  onSaveCheckpoint: () => void;
  onReturnCheckpoint: () => void;
  onClearCheckpoint: () => void;
  onCycleTarget: () => void;
  onRetryScene: () => void;
  onBuilder: () => void;
  onSetSpawn: () => void;
  onAddSpot: () => void;
  onUndoSpot: () => void;
  onRemoveNearestSpot: () => void;
  onRepairInvalidSpots: () => void;
  onDeleteInvalidSpots: () => void;
  onClearSpots: () => void;
  onToggleRecording: () => void;
  onRecordRouteVideo: () => void;
  onExportConfig: () => void;
  onCopyShareLink: () => void;
  onCreateRoom: () => void;
  onResetPersonalAlignment: () => void;
  onResetRun: () => void;
  onHome: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("status");

  useEffect(() => {
    if (!visible) return;
    if (!adminMode && activeTab === "admin") setActiveTab("status");
  }, [activeTab, adminMode, visible]);

  const remaining = Math.max(0, total - collected);
  const adminState = bundle.hasAdminAlignment ? "Loaded" : "Missing";
  const spotCount = adminDraft?.collectibles?.length ?? bundle.gameConfig?.collectibles?.length ?? 0;
  const routeCount = adminDraft?.trajectory?.length ?? bundle.gameConfig?.trajectory?.length ?? 0;
  const spotHealth = spotAudit.total === 0
    ? "None"
    : spotAudit.invalid === 0
      ? `${spotAudit.total} safe`
      : `${spotAudit.invalid}/${spotAudit.total} need review`;
  const deviceState = hasLocalAlignmentOverride
    ? "Saved override"
    : bundle.hasAdminAlignment
      ? "Admin preset"
      : "Needs alignment";
  const tabs: Array<{ id: ConfigTab; label: string; code: string; hidden?: boolean }> = [
    { id: "status", label: "Status", code: "SYS" },
    { id: "map", label: "Map", code: "MAP" },
    { id: "run", label: "Run", code: "RUN" },
    { id: "admin", label: "Admin", code: "ADM", hidden: !adminMode },
  ];

  if (!visible) return null;

  return (
    <div className="config-overlay" role="dialog" aria-modal="true">
      <div className="config-panel ui-panel">
        <div className="config-panel__bar">
          <strong>Game options</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="config-tabs" role="tablist" aria-label="Scene config sections">
          {tabs.filter((tab) => !tab.hidden).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.code}</span>
              <b>{tab.label}</b>
            </button>
          ))}
        </div>

        <div className="config-tab-body">
          {activeTab === "status" && (
            <div className="config-grid">
              <section className="config-section">
                <strong>Calibration</strong>
                <dl>
                  <div><dt>Admin preset</dt><dd>{adminState}</dd></div>
                  <div><dt>Device view</dt><dd>{deviceState}</dd></div>
                  <div><dt>Mode</dt><dd>{adminMode ? "Admin editor" : "Player"}</dd></div>
                  <div><dt>Rotation</dt><dd>{formatAlignment(alignment)}</dd></div>
                  <div><dt>3D scene</dt><dd>{sceneFallback ? "Fallback mode" : sceneStatus}</dd></div>
                </dl>
              </section>

              <section className="config-section">
                <strong>Controls</strong>
                <dl>
                  <div><dt>Move</dt><dd>W / S</dd></div>
                  <div><dt>Turn</dt><dd>A / D or arrows</dd></div>
                  <div><dt>Altitude</dt><dd>Up / Down</dd></div>
                  <div><dt>Precision</dt><dd>Space</dd></div>
                  <div><dt>Pause menu</dt><dd>Esc</dd></div>
                </dl>
              </section>
            </div>
          )}

          {activeTab === "map" && (
            <div className="config-grid">
              <section className="config-section">
                <strong>Map</strong>
                <dl>
                  <div><dt>Floor</dt><dd>{bundle.activeFloor.label}</dd></div>
                  <div><dt>Y band</dt><dd>{bundle.activeFloor.yMin.toFixed(1)} to {bundle.activeFloor.yMax.toFixed(1)}</dd></div>
                  <div><dt>Bounds lo</dt><dd>{formatTuple(bundle.bounds.lo)}</dd></div>
                  <div><dt>Bounds hi</dt><dd>{formatTuple(bundle.bounds.hi)}</dd></div>
                  <div><dt>Marked places</dt><dd>{markers.length}</dd></div>
                </dl>
              </section>

              <section className="config-section">
                <strong>Spots</strong>
                <dl>
                  <div><dt>Authored spots</dt><dd>{spotCount}</dd></div>
                  <div><dt>Nearest spot</dt><dd>{nearestSpotDistance === undefined ? "None" : `${nearestSpotDistance.toFixed(1)}m`}</dd></div>
                  <div><dt>Spot health</dt><dd className={spotAudit.invalid ? "is-warning" : "is-ok"}>{spotHealth}</dd></div>
                  <div><dt>Spot bounds</dt><dd className={spotAudit.bounds ? "is-warning" : undefined}>{spotAudit.bounds}</dd></div>
                  <div><dt>Spot floor</dt><dd className={spotAudit.floor ? "is-warning" : undefined}>{spotAudit.floor}</dd></div>
                  <div><dt>Spot edge</dt><dd className={spotAudit.edge ? "is-warning" : undefined}>{spotAudit.edge}</dd></div>
                </dl>
              </section>
            </div>
          )}

          {activeTab === "run" && (
            <div className="config-grid">
              <section className="config-section">
                <strong>Run</strong>
                <dl>
                  <div><dt>Rings</dt><dd>{collected} / {total}</dd></div>
                  <div><dt>Remaining</dt><dd>{remaining}</dd></div>
                  <div><dt>Time</dt><dd>{formatElapsed(elapsedSeconds)}</dd></div>
                  <div><dt>Best</dt><dd>{bestSeconds === undefined ? "--:--" : formatElapsed(bestSeconds)}</dd></div>
                  <div><dt>Last ring</dt><dd>{lastSplit ? `#${lastSplit.ordinal} +${formatElapsed(lastSplit.splitSeconds)}` : "None"}</dd></div>
                  <div><dt>Fastest</dt><dd>{fastestSplit ? `#${fastestSplit.ordinal} +${formatElapsed(fastestSplit.splitSeconds)}` : "None"}</dd></div>
                </dl>
              </section>

              <section className="config-section">
                <strong>Position</strong>
                <dl>
                  <div><dt>Current</dt><dd>{player.x.toFixed(1)}, {player.y.toFixed(1)}, {player.z.toFixed(1)}</dd></div>
                  <div><dt>Checkpoint</dt><dd>{checkpoint ? `${checkpoint.x.toFixed(1)}, ${checkpoint.y.toFixed(1)}, ${checkpoint.z.toFixed(1)}` : "None"}</dd></div>
                  <div><dt>Map mark</dt><dd>{selectedMarker ? `${selectedMarker.label} · ${selectedMarkerDistance?.toFixed(1) ?? "--"}m` : "None"}</dd></div>
                  <div><dt>Target</dt><dd>{target ? `${target.id} · ${targetDistance?.toFixed(1) ?? "--"}m` : "None"}</dd></div>
                  <div><dt>Recording</dt><dd>{recording || videoRecording ? "On" : "Off"}</dd></div>
                </dl>
              </section>
            </div>
          )}

          {activeTab === "admin" && adminMode && (
            <div className="config-authoring">
              <strong>Admin authoring</strong>
              {room.shareLink && (
                <input className="config-share-link" readOnly value={room.shareLink} aria-label="Share link" />
              )}
              <div className="config-actions config-actions--grid">
                <button type="button" className="is-primary" onClick={onSetSpawn}>Set spawn here</button>
                <button type="button" className="is-primary" onClick={onBuilder}>Open builder</button>
                <button type="button" className="is-primary" onClick={onAddSpot}>Add green spot</button>
                <button type="button" onClick={onUndoSpot} disabled={spotCount === 0}>Undo spot</button>
                <button type="button" onClick={onRemoveNearestSpot} disabled={spotCount === 0}>Remove nearest</button>
                <button type="button" onClick={onRepairInvalidSpots} disabled={spotAudit.invalid === 0}>Repair invalid</button>
                <button type="button" className="is-danger" onClick={onDeleteInvalidSpots} disabled={spotAudit.invalid === 0}>Delete invalid</button>
                <button type="button" className="is-danger" onClick={onClearSpots} disabled={spotCount === 0}>Clear spots</button>
                <button type="button" onClick={onToggleRecording}>
                  {recording || videoRecording ? "Stop recording" : "Record route"}
                </button>
                <button type="button" onClick={onRecordRouteVideo} disabled={routeCount < 2 && !videoRecording}>
                  {videoRecording && !recording ? "Stop video" : "Record route video"}
                </button>
                {videoUrl && (
                  <a className="config-download" href={videoUrl} download="scene-flight.webm">Download video</a>
                )}
                <button type="button" className="is-export" onClick={onExportConfig}>Export JSON</button>
                <button type="button" className="is-export" onClick={onCopyShareLink}>Copy link</button>
                <button type="button" className="is-export" onClick={onCreateRoom}>Create room</button>
              </div>
              <dl className="config-admin-summary">
                <div><dt>Route points</dt><dd>{routeCount}</dd></div>
                <div><dt>Share room</dt><dd>{room.roomId ? `${room.roomId} (${room.status})` : room.status}</dd></div>
              </dl>
            </div>
          )}
        </div>

        <div className="config-actions config-actions--footer">
          <button type="button" onClick={onHome}>Home</button>
          <button type="button" onClick={onSaveCheckpoint}>Set checkpoint</button>
          <button type="button" onClick={onReturnCheckpoint} disabled={!checkpoint}>Return checkpoint</button>
          <button type="button" onClick={onClearCheckpoint} disabled={!checkpoint}>Clear checkpoint</button>
          <button type="button" onClick={onCycleTarget} disabled={!target}>Next target</button>
          <button type="button" onClick={onRetryScene}>Retry 3D</button>
          {adminMode && <button type="button" onClick={onBuilder}>Builder</button>}
          <button type="button" className="is-primary" onClick={onAlign}>Align</button>
          <button type="button" onClick={onResetPersonalAlignment} disabled={!hasLocalAlignmentOverride}>
            Reset to admin preset
          </button>
          <button type="button" className="is-danger" onClick={onResetRun}>Reset run</button>
        </div>
      </div>
    </div>
  );
}
