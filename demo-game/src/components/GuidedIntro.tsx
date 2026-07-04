import type { LoadFlags } from "../types";

const STEPS = [
  {
    title: "Scene loading",
    copy: "The point cloud preview stays visible while the Gaussian PLY and flight data finish loading.",
  },
  {
    title: "Route preview",
    copy: "The recorded trajectory is available as context, but collectibles are no longer locked to that path.",
  },
  {
    title: "Flight controls",
    copy: "Drag the throttle, use W/S for forward and reverse, A/D or left/right arrows to turn, up/down arrows for altitude, Space for precision, and Shift to boost.",
  },
  {
    title: "Recovery",
    copy: "Use Home if you feel lost. The game also returns home if it detects an invalid map layer.",
  },
];

export function GuidedIntro({
  visible,
  step,
  ready,
  sceneFallback,
  loadFlags,
  onNext,
  onBack,
  onSkip,
  onPlay,
  onWatchRoute,
}: {
  visible: boolean;
  step: number;
  ready: boolean;
  sceneFallback: boolean;
  loadFlags: LoadFlags;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onPlay: () => void;
  onWatchRoute: () => void;
}) {
  if (!visible) return null;
  const current = STEPS[step] ?? STEPS[0];
  const pending = [
    !loadFlags.manifest && "manifest",
    !loadFlags.trajectory && "trajectory",
    !loadFlags.splat && !sceneFallback && "3D scene",
    !loadFlags.jet && "jet",
  ].filter(Boolean).join(", ");
  const status = sceneFallback ? "Fallback flight ready" : ready ? "Scene ready" : `Loading ${pending || "assets"}…`;
  const isLast = step >= STEPS.length - 1;

  return (
    <div className="intro-panel ui-panel" role="dialog" aria-modal="true" aria-label="Pilot tutorial">
      <header className="intro-panel__head">
        <div>
          <span className="intro-panel__eyebrow">Tutorial</span>
          <strong>{current.title}</strong>
        </div>
        <div className="intro-panel__count" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {step + 1} / {STEPS.length}
        </div>
      </header>

      <div className="intro-panel__dots" aria-hidden="true">
        {STEPS.map((_, index) => (
          <span key={index} className={index === step ? "is-active" : index < step ? "is-done" : ""} />
        ))}
      </div>

      <p>{current.copy}</p>

      <div className={`intro-panel__status ${ready ? "is-ready" : "is-loading"}`} role="status" aria-live="polite">
        {status}
      </div>

      <div className="intro-panel__actions">
        <div className="intro-panel__actions-secondary">
          <button type="button" onClick={onBack} disabled={step === 0}>Back</button>
          <button type="button" onClick={onSkip}>Skip</button>
        </div>
        <div className="intro-panel__actions-primary">
          {!isLast ? (
            <button type="button" className="is-primary" onClick={onNext}>Next</button>
          ) : (
            <>
              <button type="button" onClick={onWatchRoute} disabled={!ready}>Watch route</button>
              <button type="button" className="is-primary" onClick={onPlay} disabled={!ready}>Play</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
