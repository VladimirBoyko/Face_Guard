import {
  FACEGUARD_CONFIG,
  type FaceGuardConfiguration,
} from "./configuration.ts";

export const MATCH_THRESHOLD = FACEGUARD_CONFIG.recognition.matchThreshold;
export const RECOVERY_SAFE_HITS =
  FACEGUARD_CONFIG.monitoring.recoverySafeObservations;

export type ViewingState = "safe" | "extra-viewer" | "absent" | "uncertain";

export interface ObservationInput {
  faceCount: number;
  bestSimilarity: number;
  embeddingsComplete: boolean;
  qualitySufficient?: boolean;
  threshold?: number;
}

export interface ProtectionState {
  protected: boolean;
  observation: ViewingState;
  safeHits: number;
  unsafeHits: number;
  extraViewerLatched: boolean;
}

/**
 * Protection recovery deliberately requires stronger biometric evidence than
 * ordinary monitoring. This prevents the one remaining unauthorised viewer
 * from clearing an overlay after the authorised user leaves the camera view.
 */
export function recognitionThresholdFor(
  state: Pick<ProtectionState, "extraViewerLatched">,
  config: FaceGuardConfiguration = FACEGUARD_CONFIG,
): number {
  return state.extraViewerLatched
    ? config.recognition.extraViewerRecoveryThreshold
    : config.recognition.matchThreshold;
}

/** Run recovery confirmation scans back-to-back instead of waiting for the
 * normal monitoring interval. Any unsafe result still resets safeHits. */
export function shouldConfirmRecoveryImmediately(
  state: ProtectionState,
  config: FaceGuardConfiguration = FACEGUARD_CONFIG,
): boolean {
  return (
    state.protected &&
    state.observation === "safe" &&
    state.safeHits > 0 &&
    state.safeHits < config.monitoring.recoverySafeObservations
  );
}

export const POST_ENROLMENT_PROTECTION: ProtectionState = {
  protected: false,
  observation: "safe",
  safeHits: RECOVERY_SAFE_HITS,
  unsafeHits: 0,
  extraViewerLatched: false,
};

export function classifyObservation(
  {
    faceCount,
    bestSimilarity,
    embeddingsComplete,
    qualitySufficient = true,
    threshold,
  }: ObservationInput,
  config: FaceGuardConfiguration = FACEGUARD_CONFIG,
): ViewingState {
  if (faceCount === 0) return "absent";
  if (faceCount > 1) return "extra-viewer";
  if (!embeddingsComplete || !qualitySufficient) return "uncertain";
  return bestSimilarity >= (threshold ?? config.recognition.matchThreshold)
    ? "safe"
    : "absent";
}

function persistenceFor(
  observation: Exclude<ViewingState, "safe">,
  config: FaceGuardConfiguration,
): number {
  if (observation === "extra-viewer") {
    return config.monitoring.additionalViewerPersistence;
  }
  if (observation === "uncertain") {
    return config.monitoring.uncertainPersistence;
  }
  return config.monitoring.absencePersistence;
}

/**
 * Apply independently configurable persistence for each unsafe observation.
 * A change between unsafe observation types starts a fresh persistence count.
 */
export function advanceProtection(
  previous: ProtectionState,
  observation: ViewingState,
  config: FaceGuardConfiguration = FACEGUARD_CONFIG,
): ProtectionState {
  const next = { ...previous, observation };

  if (observation === "safe") {
    next.safeHits = previous.observation === "safe" ? previous.safeHits + 1 : 1;
    next.unsafeHits = 0;
    if (next.safeHits >= config.monitoring.recoverySafeObservations) {
      next.protected = false;
      next.extraViewerLatched = false;
    }
    return next;
  }

  next.safeHits = 0;
  if (observation === "extra-viewer") {
    next.extraViewerLatched = true;
  }
  next.unsafeHits =
    previous.observation === observation ? previous.unsafeHits + 1 : 1;
  if (next.unsafeHits >= persistenceFor(observation, config)) {
    next.protected = true;
  }
  return next;
}
