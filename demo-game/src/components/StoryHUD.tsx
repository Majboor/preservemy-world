import type { StoryConfig, StoryStep } from "../types";

export function StoryHUD({
  story,
  step,
  stepIndex,
  complete,
  onComplete,
  onReset,
}: {
  story?: StoryConfig;
  step?: StoryStep;
  stepIndex: number;
  complete: boolean;
  onComplete: () => void;
  onReset: () => void;
}) {
  if (!story?.enabled || !story.steps.length) return null;

  return (
    <div className={`story-hud ui-panel ${complete ? "is-complete" : ""}`}>
      <div>
        <span>{story.title}</span>
        <strong>{complete ? story.completionText ?? "Story complete" : step?.label ?? "Complete"}</strong>
      </div>
      {!complete && step && <p>{step.clue || "Follow the active story target."}</p>}
      <div className="story-hud__actions">
        <span>{Math.min(stepIndex + 1, story.steps.length)} / {story.steps.length}</span>
        {!complete && <button type="button" onClick={onComplete}>Complete step</button>}
        <button type="button" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}
