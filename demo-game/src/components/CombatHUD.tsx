import type { CombatConfig } from "../types";

export function CombatHUD({
  combat,
  health,
  score,
  deaths,
  status,
  onRespawn,
}: {
  combat?: CombatConfig;
  health: number;
  score: number;
  deaths: number;
  status?: string;
  onRespawn: () => void;
}) {
  if (!combat?.enabled) return null;

  return (
    <div className="combat-hud ui-panel">
      <div>
        <span>FPV</span>
        <strong>{Math.max(0, Math.round(health))} HP</strong>
      </div>
      <div>
        <span>Score</span>
        <strong>{score} / {combat.scoreLimit}</strong>
      </div>
      <div>
        <span>Deaths</span>
        <strong>{deaths}</strong>
      </div>
      <button type="button" onClick={onRespawn}>Respawn</button>
      {status && <p>{status}</p>}
    </div>
  );
}
