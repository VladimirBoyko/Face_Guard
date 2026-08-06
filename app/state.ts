export const MATCH_THRESHOLD = 0.45;
export const RECOVERY_SAFE_HITS = 2;

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

/** The five accepted enrolment photos establish a safe initial session. */
export const POST_ENROLMENT_PROTECTION: ProtectionState = {
  protected: false,
  observation: "safe",
  safeHits: RECOVERY_SAFE_HITS,
  unsafeHits: 0,
};

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

/**
 * Ignore brief missed/uncertain frames, but protect immediately when a second
 * face appears. Require stable safe checks before revealing again.
 */
export function advanceProtection(
  previous: ProtectionState,
  observation: ViewingState,
): ProtectionState {
  const next = { ...previous, observation };

  if (observation === "safe") {
    next.safeHits += 1;
    next.unsafeHits = 0;
    if (next.safeHits >= RECOVERY_SAFE_HITS) next.protected = false;
    return next;
  }

  next.safeHits = 0;
  next.unsafeHits += 1;
  if (observation === "extra-viewer" || next.unsafeHits >= 3) {
    next.protected = true;
  }
  return next;
}
