export type EnrolmentDirection = {
  label: string;
  position:
    | "centre"
    | "upper-left"
    | "lower-left"
    | "upper-right"
    | "lower-right";
};

export type FaceGuardConfiguration = {
  recognition: {
    matchThreshold: number;
    extraViewerRecoveryThreshold: number;
    detectorConfidence: number;
    enrolmentBoxScore: number;
    maxDetectedFaces: number;
    bestTemplateMatches: number;
  };
  enrolment: {
    sampleCount: number;
    minimumFaceSizePx: number;
    maximumDuplicateSimilarity: number;
    directions: readonly EnrolmentDirection[];
  };
  quality: {
    sampleWidth: number;
    sampleHeight: number;
    minimumBrightness: number;
    maximumBrightness: number;
    minimumContrast: number;
    minimumEdgeStrength: number;
    monitoringMinimumFaceSizePx: number;
  };
  monitoring: {
    intervalMs: number;
    absencePersistence: number;
    additionalViewerPersistence: number;
    uncertainPersistence: number;
    concealmentDelayMs: number;
    recoverySafeObservations: number;
    recoveryDelayMs: number;
  };
};

/**
 * Prototype defaults carried forward from FaceGuard 1.0.
 * These values must be tuned from recorded test evidence, not treated as
 * validated biometric or security guarantees.
 */
export const FACEGUARD_CONFIG: FaceGuardConfiguration = {
  recognition: {
    matchThreshold: 0.45,
    extraViewerRecoveryThreshold: 0.55,
    detectorConfidence: 0.6,
    enrolmentBoxScore: 0.5,
    maxDetectedFaces: 5,
    bestTemplateMatches: 2,
  },
  enrolment: {
    sampleCount: 5,
    minimumFaceSizePx: 72,
    maximumDuplicateSimilarity: 0.995,
    directions: [
      { label: "centre", position: "centre" },
      { label: "upper-left corner", position: "upper-left" },
      { label: "lower-left corner", position: "lower-left" },
      { label: "upper-right corner", position: "upper-right" },
      { label: "lower-right corner", position: "lower-right" },
    ],
  },
  quality: {
    sampleWidth: 64,
    sampleHeight: 36,
    minimumBrightness: 25,
    maximumBrightness: 235,
    minimumContrast: 12,
    minimumEdgeStrength: 4,
    monitoringMinimumFaceSizePx: 56,
  },
  monitoring: {
    intervalMs: 650,
    absencePersistence: 6,
    additionalViewerPersistence: 1,
    uncertainPersistence: 3,
    concealmentDelayMs: 0,
    recoverySafeObservations: 2,
    recoveryDelayMs: 0,
  },
};

export function validateFaceGuardConfiguration(
  config: FaceGuardConfiguration,
): string[] {
  const errors: string[] = [];
  const probabilityValues = [
    ["recognition.matchThreshold", config.recognition.matchThreshold],
    [
      "recognition.extraViewerRecoveryThreshold",
      config.recognition.extraViewerRecoveryThreshold,
    ],
    ["recognition.detectorConfidence", config.recognition.detectorConfidence],
    ["recognition.enrolmentBoxScore", config.recognition.enrolmentBoxScore],
  ] as const;
  for (const [name, value] of probabilityValues) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      errors.push(`${name} must be between 0 and 1`);
    }
  }

  if (
    config.recognition.extraViewerRecoveryThreshold <
    config.recognition.matchThreshold
  ) {
    errors.push(
      "recognition.extraViewerRecoveryThreshold must be at least recognition.matchThreshold",
    );
  }

  const positiveIntegers = [
    ["recognition.maxDetectedFaces", config.recognition.maxDetectedFaces],
    ["recognition.bestTemplateMatches", config.recognition.bestTemplateMatches],
    ["enrolment.sampleCount", config.enrolment.sampleCount],
    ["enrolment.minimumFaceSizePx", config.enrolment.minimumFaceSizePx],
    ["quality.sampleWidth", config.quality.sampleWidth],
    ["quality.sampleHeight", config.quality.sampleHeight],
    [
      "quality.monitoringMinimumFaceSizePx",
      config.quality.monitoringMinimumFaceSizePx,
    ],
    ["monitoring.intervalMs", config.monitoring.intervalMs],
    ["monitoring.absencePersistence", config.monitoring.absencePersistence],
    [
      "monitoring.additionalViewerPersistence",
      config.monitoring.additionalViewerPersistence,
    ],
    ["monitoring.uncertainPersistence", config.monitoring.uncertainPersistence],
    [
      "monitoring.recoverySafeObservations",
      config.monitoring.recoverySafeObservations,
    ],
  ] as const;
  for (const [name, value] of positiveIntegers) {
    if (!Number.isInteger(value) || value < 1) {
      errors.push(`${name} must be a positive integer`);
    }
  }

  for (const [name, value] of [
    [
      "enrolment.maximumDuplicateSimilarity",
      config.enrolment.maximumDuplicateSimilarity,
    ],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      errors.push(`${name} must be between 0 and 1`);
    }
  }

  if (config.recognition.bestTemplateMatches > config.enrolment.sampleCount) {
    errors.push(
      "recognition.bestTemplateMatches cannot exceed enrolment.sampleCount",
    );
  }

  for (const [name, value] of [
    ["quality.minimumBrightness", config.quality.minimumBrightness],
    ["quality.maximumBrightness", config.quality.maximumBrightness],
    ["quality.minimumContrast", config.quality.minimumContrast],
    ["quality.minimumEdgeStrength", config.quality.minimumEdgeStrength],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      errors.push(`${name} must be between 0 and 255`);
    }
  }

  if (config.quality.minimumBrightness >= config.quality.maximumBrightness) {
    errors.push("quality.minimumBrightness must be below maximumBrightness");
  }

  for (const [name, value] of [
    ["monitoring.concealmentDelayMs", config.monitoring.concealmentDelayMs],
    ["monitoring.recoveryDelayMs", config.monitoring.recoveryDelayMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${name} must be zero or greater`);
    }
  }

  if (config.enrolment.directions.length !== config.enrolment.sampleCount) {
    errors.push("enrolment directions must match enrolment.sampleCount");
  }
  return errors;
}
