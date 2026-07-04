import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomState } from "../lib/roomClient";
import type { CollectibleDef, MapMarker, SpotAuditSummary } from "../types";
import { Jet } from "./Jet";
import { canUseWebGL } from "../lib/webgl";
import {
  CfgScreenIcon,
  HomeScreenIcon,
  MapScreenIcon,
  MoreScreenIcon,
  RoutesScreenIcon,
  RunsScreenIcon,
  SocialScreenIcon,
} from "./GameIcons";

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function MenuJetModel() {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const time = clock.elapsedTime;
    group.current.rotation.set(
      0.24 + Math.sin(time * 0.7) * 0.035,
      -0.82 + Math.sin(time * 0.45) * 0.07,
      -0.14 + Math.sin(time * 0.9) * 0.035,
    );
    group.current.position.y = Math.sin(time * 1.3) * 0.012;
  });

  return (
    <group ref={group} scale={3.25}>
      <Jet />
    </group>
  );
}

function MenuJetPreview() {
  const [webglAvailable] = useState(canUseWebGL);

  if (!webglAvailable) {
    return (
      <div className="game-menu__jet-preview game-menu__jet-preview--fallback" aria-hidden="true">
        <span className="game-menu__fallback-jet" />
        <div className="game-menu__jet-shadow" />
      </div>
    );
  }

  return (
    <div className="game-menu__jet-preview" aria-hidden="true">
      <Canvas dpr={[1, 1.75]} camera={{ position: [0.32, 0.16, 0.44], fov: 31 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={1.9} />
        <directionalLight position={[2, 4, 3]} intensity={2.6} />
        <directionalLight position={[-3, 1.5, -2]} color="#6ee7ff" intensity={1.4} />
        <MenuJetModel />
      </Canvas>
      <div className="game-menu__jet-shadow" />
    </div>
  );
}

export function GameMenuOverlay({
  visible,
  adminMode,
  collected,
  total,
  elapsedSeconds,
  bestSeconds,
  target,
  targetDistance,
  selectedMarker,
  selectedMarkerDistance,
  spotCount,
  routeCount,
  recording,
  videoRecording,
  videoUrl,
  sceneStatus,
  sceneFallback,
  room,
  spotAudit,
  onPlay,
  onHome,
  onOpenMap,
  onConfig,
  onBuilder,
  onAlign,
  onWatchRoute,
  onResetRun,
  onToggleRecording,
  onRecordRouteVideo,
  onExportConfig,
  onCopyShareLink,
  onCreateRoom,
  onJoinRoom,
  onObserverMode,
}: {
  visible: boolean;
  adminMode: boolean;
  collected: number;
  total: number;
  elapsedSeconds: number;
  bestSeconds?: number;
  target?: CollectibleDef;
  targetDistance?: number;
  selectedMarker?: MapMarker;
  selectedMarkerDistance?: number;
  spotCount: number;
  routeCount: number;
  recording: boolean;
  videoRecording: boolean;
  videoUrl?: string;
  sceneStatus: string;
  sceneFallback: boolean;
  room: RoomState;
  spotAudit: SpotAuditSummary;
  onPlay: () => void;
  onHome: () => void;
  onOpenMap: () => void;
  onConfig: () => void;
  onBuilder: () => void;
  onAlign: () => void;
  onWatchRoute: () => void;
  onResetRun: () => void;
  onToggleRecording: () => void;
  onRecordRouteVideo: () => void;
  onExportConfig: () => void;
  onCopyShareLink: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onObserverMode: () => void;
}) {
  if (!visible) return null;
  const roomLabel = room.roomId ? `${room.roomId} / ${room.status}` : room.status;
  const targetLabel = target ? `${target.id} / ${targetDistance?.toFixed(1) ?? "--"}m` : "No target";
  const markerLabel = selectedMarker ? `${selectedMarker.label} / ${selectedMarkerDistance?.toFixed(1) ?? "--"}m` : "No marker";
  const sceneLabel = sceneFallback ? "Fallback scene" : sceneStatus;
  const spotLabel = spotAudit.invalid ? `${spotAudit.invalid} broken / ${spotCount}` : `${spotCount} ready`;
  const navItems = [
    { label: "Map", Icon: MapScreenIcon, action: onOpenMap, tone: "orange" },
    { label: "Routes", Icon: RoutesScreenIcon, action: onWatchRoute, tone: "yellow" },
    { label: "Social", Icon: SocialScreenIcon, action: onCreateRoom, tone: "cyan" },
    { label: "Home", Icon: HomeScreenIcon, action: onHome, tone: "violet" },
    { label: "Runs", Icon: RunsScreenIcon, action: onResetRun, tone: "red" },
    { label: "More", Icon: MoreScreenIcon, action: onCopyShareLink, tone: "green" },
    { label: "CFG", Icon: CfgScreenIcon, action: onConfig, tone: "purple" },
  ];

  return (
    <div className="game-menu-overlay" role="dialog" aria-modal="true">
      <aside className="game-menu__rail" aria-label="Menu sections">
        {navItems.map((item) => {
          const Icon = item.Icon;
          return (
            <button key={item.label} type="button" className={`game-menu__rail-item is-${item.tone}`} onClick={item.action}>
              <b><Icon /></b>
              <span>{item.label}</span>
            </button>
          );
        })}
      </aside>

      <main className="game-menu__stage">
        <div className="game-menu__topbar">
          <button type="button" className="game-menu__account" onClick={onConfig}>Pilot Profile</button>
          <button type="button" className="game-menu__reward" onClick={onCopyShareLink}>Copy Share Link</button>
        </div>

        <div className="game-menu__stage-body">
          <div className="game-menu__stage-left">
            <section className="game-menu__guide" aria-label="Guide">
              <div className="game-menu__guide-thumb"><span className="game-menu__mini-jet" aria-hidden="true" /></div>
              <div>
                <strong>New to Gorgon?</strong>
                <p>Check route, align scene, then fly.</p>
              </div>
            </section>

            <section className="game-menu__notice" aria-label="Notifications">
              <div className="game-menu__notice-bar">Notifications</div>
              <button type="button" onClick={onCreateRoom}>Enable shared room</button>
              <button type="button" onClick={onJoinRoom}>Join room</button>
              <p>Share links, route exports, and authoring changes live here.</p>
            </section>
          </div>

          <div className="game-menu__stage-center">
            <div className="game-menu__brand" aria-label="Game title">
              <strong>GORGON</strong>
              <b>FLIGHT</b>
              <span>season 1.0</span>
            </div>

            <button className="game-menu__play" type="button" onClick={onPlay}>
              Click to play
            </button>

            <div className="game-menu__mode-line">
              <strong>Now flying: Gaussian Arena</strong>
              <span>{sceneLabel}</span>
            </div>

            <div className="game-menu__actions">
              <button type="button" className="is-quick" onClick={onPlay}>Quick Flight</button>
              <button type="button" className="is-align" onClick={onAlign}>Align</button>
              <button type="button" className="is-route" onClick={onWatchRoute}>Route</button>
              <button type="button" className="is-build" onClick={onBuilder}>Build</button>
              <button type="button" className="is-host" onClick={onCreateRoom}>Host Room</button>
              <button type="button" className="is-find" onClick={onOpenMap}>Find Spots</button>
              <button type="button" className="is-invite" onClick={onCopyShareLink}>Invite</button>
              <button type="button" className="is-join" onClick={onJoinRoom}>Join</button>
              <button type="button" className="is-join" onClick={onObserverMode}>Observe</button>
            </div>
          </div>

          <div className="game-menu__stage-right">
            <section className="game-menu__live" aria-label="Scene status">
              <div className="game-menu__live-bar">
                <strong>Arena Feed</strong>
                <button type="button" onClick={onOpenMap}>Hide</button>
              </div>
              <div className="game-menu__live-grid">
                <div><b>{collected}/{total}</b><span>rings</span></div>
                <div><b>{formatElapsed(elapsedSeconds)}</b><span>time</span></div>
                <div><b>{bestSeconds === undefined ? "--:--" : formatElapsed(bestSeconds)}</b><span>best</span></div>
              </div>
              <p>{targetLabel}</p>
            </section>
          </div>
        </div>
      </main>

      <aside className="game-menu__loadout" aria-label="Loadout and settings">
        <div className="game-menu__sponsor-board">
          <span>Live Gaussian</span>
          <strong>{sceneFallback ? "Fallback" : "Loaded"}</strong>
        </div>
        <div className="game-menu__scene-card">
          <dl>
            <div><dt>Target</dt><dd>{targetLabel}</dd></div>
            <div><dt>Marker</dt><dd>{markerLabel}</dd></div>
            <div><dt>Spots</dt><dd>{spotLabel}</dd></div>
            <div><dt>Route</dt><dd>{routeCount} points</dd></div>
            <div><dt>Room</dt><dd>{roomLabel}</dd></div>
          </dl>
        </div>
        <MenuJetPreview />
        <div className="game-menu__weapon">
          <span>Pilot</span>
          <strong>F-16 Jet</strong>
        </div>
        <button type="button" className="game-menu__loadout-button" onClick={onAlign}>Align Jet</button>
        <button type="button" className="game-menu__customize-button" onClick={onConfig}>Customize</button>
        <div className="game-menu__admin-actions">
          <button type="button" onClick={onBuilder}>{adminMode ? "Builder" : "Build"}</button>
          <button type="button" onClick={onExportConfig}>Export</button>
          <button type="button" onClick={onToggleRecording}>
            {recording || videoRecording ? "Stop rec" : "Record"}
          </button>
          <button type="button" onClick={onRecordRouteVideo} disabled={routeCount < 2 && !videoRecording}>
            {videoRecording && !recording ? "Stop video" : "Route video"}
          </button>
          {videoUrl && <a href={videoUrl} download="scene-flight.webm">Download</a>}
        </div>
        <div className="game-menu__footer">
          <button type="button" onClick={onHome}>Home</button>
          <button type="button" onClick={onResetRun}>Reset</button>
          <button type="button" onClick={onConfig}>Settings</button>
        </div>
      </aside>
    </div>
  );
}
