import { LoaderPreview } from "./LoaderPreview";
import type { LoadFlags } from "../types";

export function StartOverlay({
  previewUrl,
  visible,
  ready,
  sceneFallback,
  canConfigure,
  loadFlags,
  error,
  canInstall,
  isIOS,
  onInstall,
  onAlign,
  onConfig,
  onRetryScene,
  onPlay,
  onWatchRoute,
}: {
  previewUrl: string;
  visible: boolean;
  ready: boolean;
  sceneFallback: boolean;
  canConfigure: boolean;
  loadFlags: LoadFlags;
  error?: string;
  canInstall: boolean;
  isIOS: boolean;
  onInstall: () => void;
  onAlign: () => void;
  onConfig: () => void;
  onRetryScene: () => void;
  onPlay: () => void;
  onWatchRoute: () => void;
}) {
  if (!visible) return null;
  const checklist: Array<{ key: keyof LoadFlags | "splat"; label: string; done: boolean }> = [
    { key: "manifest", label: "Scene manifest", done: loadFlags.manifest },
    { key: "trajectory", label: "Recorded route", done: loadFlags.trajectory },
    { key: "splat", label: sceneFallback ? "3D scene (fallback)" : "3D scene", done: loadFlags.splat || sceneFallback },
    { key: "jet", label: "Jet model", done: loadFlags.jet },
  ];
  const completed = checklist.filter((item) => item.done).length;
  const progress = Math.max(8, Math.round((completed / checklist.length) * 100));
  const pendingLabel = checklist
    .filter((item) => !item.done)
    .map((item) => item.label.toLowerCase())
    .join(", ");
  const statusText = error
    ? error
    : sceneFallback
      ? "3D scene offline. Fallback flight is ready."
      : ready
        ? "All systems online. Ready to fly."
        : `Loading ${pendingLabel || "assets"}…`;
  const statusTone = error ? "is-error" : ready ? "is-ready" : "is-loading";

  return (
    <div className={`startup ${ready ? "is-ready" : ""} ${error ? "is-error" : ""}`}>
      <LoaderPreview url={previewUrl} />
      <div className="startup-card ui-panel" role="dialog" aria-modal="true">
        <header className="startup-card__head">
          <span className="startup-card__eyebrow">Pre-flight check</span>
          <strong>Experimental 3D reconstruction demo</strong>
          <p>Explore the Gaussian scene while the game keeps you inside the safe playable layer.</p>
        </header>

        <div className={`startup-card__status ${statusTone}`} role="status" aria-live="polite">
          <b>{ready ? "Ready" : error ? "Issue" : "Loading"}</b>
          <span>{statusText}</span>
        </div>

        <ul className="startup-checklist" aria-label="Asset load status">
          {checklist.map((item) => (
            <li key={item.key} className={item.done ? "is-done" : "is-pending"}>
              <span className="startup-checklist__dot" aria-hidden="true">{item.done ? "✓" : ""}</span>
              <span className="startup-checklist__label">{item.label}</span>
              <span className="startup-checklist__state">{item.done ? "ready" : "loading"}</span>
            </li>
          ))}
        </ul>

        <div className="startup-progress" aria-hidden="true">
          <i style={{ width: ready ? "100%" : `${progress}%` }} />
        </div>
        <div className="startup-progress__label">
          <span>{completed} / {checklist.length} assets</span>
          <span>{ready ? "100%" : `${progress}%`}</span>
        </div>

        <div className="startup-card__primary">
          <button type="button" className="is-primary" onClick={onPlay} disabled={!ready}>
            {ready ? (sceneFallback ? "Play fallback flight" : "Play") : "Loading…"}
          </button>
        </div>

        <div className="startup-card__secondary" aria-label="Setup actions">
          <button type="button" onClick={onAlign} disabled={!canConfigure}>Align scene</button>
          <button type="button" onClick={onWatchRoute} disabled={!ready}>Watch route</button>
          <button type="button" onClick={onConfig} disabled={!canConfigure}>Config</button>
          {error && <button type="button" onClick={onRetryScene} className="is-retry">Retry 3D</button>}
        </div>

        <p className="startup-card__hint">Next step: align the jet to the scene for accurate flight controls.</p>

        {canInstall && <button className="install-button" type="button" onClick={onInstall}>Install app</button>}
        {isIOS && <span className="ios-note">Safari: Share, then Add to Home Screen.</span>}
      </div>
    </div>
  );
}
