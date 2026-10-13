import type { ViewingState } from "./protection-state.ts";

export type TechnicalLogDetails = {
  observation?: ViewingState;
  protected?: boolean;
  latencyMs?: number;
  reason?: string;
  displayCount?: number;
  phase?: string;
};

/** The narrow payload excludes frames, embeddings and biometric templates. */
export function logTechnicalEvent(
  scope: "renderer" | "desktop",
  event: string,
  details: TechnicalLogDetails = {},
): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      scope,
      event,
      ...details,
    }),
  );
}
