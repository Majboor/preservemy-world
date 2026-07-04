export const MIN_THROTTLE_SPEED = 0.2;
export const MAX_THROTTLE_SPEED = 2.4;
export const DEFAULT_THROTTLE_SPEED = 1.05;
export const THROTTLE_STEP = 0.05;

export function clampThrottleSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THROTTLE_SPEED;
  return Math.max(MIN_THROTTLE_SPEED, Math.min(MAX_THROTTLE_SPEED, value));
}

export function throttlePercent(value: number): number {
  return ((clampThrottleSpeed(value) - MIN_THROTTLE_SPEED) / (MAX_THROTTLE_SPEED - MIN_THROTTLE_SPEED)) * 100;
}
