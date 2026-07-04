import type { CollectionSplit } from "../types";

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export interface RunResult {
  key: string;
  seconds: number;
  collected: number;
  best: boolean;
  splits: CollectionSplit[];
}

export function RunSummary({
  result,
  bestSeconds,
  onReset,
  onHome,
  onClose,
}: {
  result?: RunResult;
  bestSeconds?: number;
  onReset: () => void;
  onHome: () => void;
  onClose: () => void;
}) {
  if (!result) return null;

  const fastestSplit = result.splits.reduce<CollectionSplit | undefined>((fastest, split) => (
    !fastest || split.splitSeconds < fastest.splitSeconds ? split : fastest
  ), undefined);
  const recentSplits = result.splits.slice(-5).reverse();

  return (
    <div className="run-summary-overlay" role="dialog" aria-modal="true">
      <div className="run-summary-panel ui-panel">
        <div className="run-summary-panel__bar">
          <strong>Run complete</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <dl className="run-summary-grid">
          <div><dt>Time</dt><dd>{formatElapsed(result.seconds)}</dd></div>
          <div><dt>Best</dt><dd>{bestSeconds === undefined ? "--:--" : formatElapsed(bestSeconds)}</dd></div>
          <div><dt>Rings</dt><dd>{result.collected}</dd></div>
          <div><dt>Status</dt><dd>{result.best ? "New best" : "Saved"}</dd></div>
          <div><dt>Fastest</dt><dd>{fastestSplit ? `#${fastestSplit.ordinal} +${formatElapsed(fastestSplit.splitSeconds)}` : "--"}</dd></div>
        </dl>
        {recentSplits.length > 0 && (
          <ol className="run-summary-splits" aria-label="Recent ring splits">
            {recentSplits.map((split) => (
              <li key={`${split.id}-${split.ordinal}`}>
                <span>#{split.ordinal}</span>
                <strong>{formatElapsed(split.seconds)}</strong>
                <em>+{formatElapsed(split.splitSeconds)}</em>
              </li>
            ))}
          </ol>
        )}
        <div className="run-summary-actions">
          <button type="button" onClick={onReset}>New run</button>
          <button type="button" onClick={onHome}>Home</button>
        </div>
      </div>
    </div>
  );
}
