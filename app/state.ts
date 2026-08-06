export const MATCH_THRESHOLD = 0.55;

export type ViewingState = "safe" | "extra-viewer" | "absent" | "uncertain";

export interface ObservationInput {
  faceCount: number;
  bestSimilarity: number;
  embeddingsComplete: boolean;
  threshold?: number;
}

export interface ProtectionState {
  protected: boolean;
  observation: ViewingState;
  safeHits: number;
  unsafeHits: number;
}

/** Convert one model observation into a privacy state. */
export function classifyObservation({
  faceCount,
  bestSimilarity,
  embeddingsComplete,
  threshold = MATCH_THRESHOLD,
}: ObservationInput): ViewingState {
  if (faceCount === 0) return "absent";
  if (faceCount > 1) return "extra-viewer";
  if (!embeddingsComplete) return "uncertain";
  return bestSimilarity >= threshold ? "safe" : "absent";
}

/** Protect quickly, but require three stable safe checks before revealing. */
export function advanceProtection(
  previous: ProtectionState,
  observation: ViewingState,
): ProtectionState {
  const next = { ...previous, observation };

  if (observation === "safe") {
    next.safeHits += 1;
    next.unsafeHits = 0;
    if (next.safeHits >= 3) next.protected = false;
    return next;
  }

  next.safeHits = 0;
  next.unsafeHits += 1;
  if (
    observation === "extra-viewer" ||
    observation === "uncertain" ||
    next.unsafeHits >= 2
  ) {
    next.protected = true;
  }
  return next;
}
