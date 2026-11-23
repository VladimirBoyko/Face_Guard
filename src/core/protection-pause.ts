export const TEN_MINUTE_PAUSE_MS = 10 * 60 * 1_000;

export type ProtectionPauseMode = "active" | "timed" | "manual";

export function isProtectionPaused(mode: ProtectionPauseMode) {
  return mode !== "active";
}

export function effectiveProtectionState(
  protectedByRecognition: boolean,
  mode: ProtectionPauseMode,
) {
  return mode === "active" && protectedByRecognition;
}

export function secondsUntilPauseEnds(endsAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((endsAt - now) / 1_000));
}
