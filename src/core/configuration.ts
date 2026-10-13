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
