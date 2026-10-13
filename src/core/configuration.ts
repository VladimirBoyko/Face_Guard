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
    detectorConfidence: number;
    enrolmentBoxScore: number;
    maxDetectedFaces: number;
  };
  enrolment: {
    sampleCount: number;
    directions: readonly EnrolmentDirection[];
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
    detectorConfidence: 0.6,
    enrolmentBoxScore: 0.5,
    maxDetectedFaces: 5,
  },
  enrolment: {
    sampleCount: 5,
    directions: [
      { label: "centre", position: "centre" },
      { label: "upper-left corner", position: "upper-left" },
      { label: "lower-left corner", position: "lower-left" },
      { label: "upper-right corner", position: "upper-right" },
      { label: "lower-right corner", position: "lower-right" },
    ],
  },
  monitoring: {
    intervalMs: 650,
    absencePersistence: 3,
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
    ["recognition.detectorConfidence", config.recognition.detectorConfidence],
    ["recognition.enrolmentBoxScore", config.recognition.enrolmentBoxScore],
  ] as const;
  for (const [name, value] of probabilityValues) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      errors.push(`${name} must be between 0 and 1`);
    }
  }

  const positiveIntegers = [
    ["recognition.maxDetectedFaces", config.recognition.maxDetectedFaces],
    ["enrolment.sampleCount", config.enrolment.sampleCount],
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
