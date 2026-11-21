import type { ViewingState } from "./protection-state.ts";

export type TechnicalLogDetails = {
  observation?: ViewingState;
  protected?: boolean;
  latencyMs?: number;
  similarity?: number;
  transitionMs?: number;
  reason?: string;
  displayCount?: number;
  visibleWindowCount?: number;
  phase?: string;
};

export type TechnicalLogEntry = TechnicalLogDetails & {
  timestamp: string;
  scope: "renderer" | "desktop";
  event: string;
};

let technicalLogSink: ((entry: TechnicalLogEntry) => void) | null = null;

export function setTechnicalLogSink(
  sink: ((entry: TechnicalLogEntry) => void) | null,
): void {
  technicalLogSink = sink;
}

/** The narrow payload excludes frames, embeddings and biometric templates. */
export function logTechnicalEvent(
  scope: "renderer" | "desktop",
  event: string,
  details: TechnicalLogDetails = {},
): void {
  const entry: TechnicalLogEntry = {
    timestamp: new Date().toISOString(),
    scope,
    event,
    ...details,
  };
  console.info(JSON.stringify(entry));
  technicalLogSink?.(entry);
}
