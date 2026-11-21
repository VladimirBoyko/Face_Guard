import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraFailureMessage,
  classifyCameraStartFailure,
} from "../src/core/camera.ts";
import {
  FACEGUARD_CONFIG,
  validateFaceGuardConfiguration,
} from "../src/core/configuration.ts";
import { averageDescriptors } from "../src/core/descriptor.ts";
import { evaluateEnrolmentFaces } from "../src/core/enrolment.ts";
import {
  advanceProtection,
  classifyObservation,
  POST_ENROLMENT_PROTECTION,
  recognitionThresholdFor,
  shouldConfirmRecoveryImmediately,
} from "../src/core/protection-state.ts";
import {
  clearSessionBiometricMemory,
  stopMediaStream,
} from "../src/core/session-cleanup.ts";
import { shouldShowOverlay } from "../src/desktop/overlay-policy.ts";
import { shouldGrantMediaPermission } from "../src/desktop/permissions.ts";

function applySequence(sequence, initial = POST_ENROLMENT_PROTECTION, config) {
  return sequence.reduce(
    (state, observation) => advanceProtection(state, observation, config),
    { ...initial },
  );
}

test("six valid enrolment samples produce one normalised descriptor", () => {
  const samples = [];
  for (let index = 0; index < 6; index += 1) {
    const decision = evaluateEnrolmentFaces(
      [{ boxScore: 0.9, embedding: [1, index + 1, 0.5] }],
      0.5,
    );
    assert.equal(decision.accepted, true);
    samples.push(decision.embedding);
  }
  const descriptor = averageDescriptors(samples);
  assert.equal(samples.length, FACEGUARD_CONFIG.enrolment.sampleCount);
  assert.ok(Math.abs(Math.hypot(...descriptor) - 1) < 1e-12);
});

test("enrolment rejects missing, multiple and unclear faces", () => {
  assert.deepEqual(evaluateEnrolmentFaces([], 0.5), {
    accepted: false,
    reason: "no-face",
  });
  assert.deepEqual(
    evaluateEnrolmentFaces(
      [
        { boxScore: 0.9, embedding: [1] },
        { boxScore: 0.9, embedding: [1] },
      ],
      0.5,
    ),
    { accepted: false, reason: "multiple-faces" },
  );
  assert.deepEqual(
    evaluateEnrolmentFaces([{ boxScore: 0.4, embedding: [1] }], 0.5),
    { accepted: false, reason: "unclear-face" },
  );
  assert.deepEqual(
    evaluateEnrolmentFaces([{ boxScore: 0.9 }], 0.5),
    { accepted: false, reason: "unclear-face" },
  );
});

test("temporary recognition loss does not conceal before persistence", () => {
  const state = applySequence(["absent", "absent", "safe"]);
  assert.equal(state.protected, false);
  assert.equal(state.observation, "safe");
  assert.equal(state.extraViewerLatched, false);
});

test("absence waits twice as many checks and conceals on the sixth observation", () => {
  const before = applySequence([
    "absent",
    "absent",
    "absent",
    "absent",
    "absent",
  ]);
  const after = advanceProtection(before, "absent");
  assert.equal(before.protected, false);
  assert.equal(after.protected, true);
});

test("additional viewer fails closed immediately and two safe checks recover", () => {
  const concealed = applySequence(["extra-viewer"]);
  assert.equal(concealed.protected, true);
  assert.equal(concealed.extraViewerLatched, true);
  const firstSafeCheck = advanceProtection(concealed, "safe");
  assert.equal(firstSafeCheck.protected, true);
  const recovered = advanceProtection(firstSafeCheck, "safe");
  assert.equal(recovered.protected, false);
  assert.equal(recovered.extraViewerLatched, false);
});

test("extra-viewer protection remains latched through absence and uncertainty", () => {
  let state = applySequence(["extra-viewer"]);
  state = advanceProtection(state, "absent");
  state = advanceProtection(state, "uncertain");

  assert.equal(state.protected, true);
  assert.equal(state.extraViewerLatched, true);
  assert.equal(
    recognitionThresholdFor(state),
    FACEGUARD_CONFIG.recognition.extraViewerRecoveryThreshold,
  );
});

test("only an unauthorised viewer cannot clear an active overlay", () => {
  let state = applySequence(["extra-viewer"]);
  assert.equal(state.protected, true);

  const remainingUnknownViewer = classifyObservation({
    faceCount: 1,
    bestSimilarity: 0.42,
    embeddingsComplete: true,
    threshold: recognitionThresholdFor(state),
  });
  assert.equal(remainingUnknownViewer, "absent");

  state = advanceProtection(state, remainingUnknownViewer);
  assert.equal(state.protected, true);
  assert.equal(state.extraViewerLatched, true);

  const authorisedUserAlone = classifyObservation({
    faceCount: 1,
    bestSimilarity: 0.62,
    embeddingsComplete: true,
    threshold: recognitionThresholdFor(state),
  });
  assert.equal(authorisedUserAlone, "safe");
  state = advanceProtection(state, authorisedUserAlone);
  assert.equal(state.protected, true);
  state = advanceProtection(state, authorisedUserAlone);
  assert.equal(state.protected, false);
});

test("an isolated false authorised match cannot flicker the overlay off", () => {
  let state = applySequence(["extra-viewer"]);

  state = advanceProtection(state, "safe");
  assert.equal(state.protected, true);
  assert.equal(state.safeHits, 1);

  state = advanceProtection(state, "absent");
  assert.equal(state.protected, true);
  assert.equal(state.safeHits, 0);

  state = advanceProtection(state, "safe");
  assert.equal(state.protected, true);
  assert.equal(shouldConfirmRecoveryImmediately(state), true);
});

test("recovery confirmation runs immediately only between consecutive safe checks", () => {
  let state = applySequence(["extra-viewer"]);
  assert.equal(shouldConfirmRecoveryImmediately(state), false);

  state = advanceProtection(state, "safe");
  assert.equal(shouldConfirmRecoveryImmediately(state), true);

  state = advanceProtection(state, "safe");
  assert.equal(state.protected, false);
  assert.equal(shouldConfirmRecoveryImmediately(state), false);
});

test("uncertain observations conceal and a returning user recovers", () => {
  const concealed = applySequence(["uncertain", "uncertain", "uncertain"]);
  assert.equal(concealed.protected, true);
  const recovered = applySequence(["safe", "safe"], concealed);
  assert.equal(recovered.protected, false);
});

test("overlay policy follows session protection and independent manual test", () => {
  assert.equal(shouldShowOverlay(false, false), false);
  assert.equal(shouldShowOverlay(true, false), true);
  assert.equal(shouldShowOverlay(false, true), true);
  assert.equal(shouldShowOverlay(false, false), false);
});

test("permission policy allows trusted video-only requests", () => {
  assert.equal(shouldGrantMediaPermission(true, "media", ["video"]), true);
  assert.equal(shouldGrantMediaPermission(false, "media", ["video"]), false);
  assert.equal(
    shouldGrantMediaPermission(true, "media", ["video", "audio"]),
    false,
  );
  assert.equal(shouldGrantMediaPermission(true, "geolocation", ["video"]), false);
});

test("permission denial and camera unavailability have distinct outcomes", () => {
  const denied = classifyCameraStartFailure({ name: "NotAllowedError" });
  assert.equal(denied, "permission-denied");
  assert.match(cameraFailureMessage(denied), /permission was not granted/i);

  const unavailable = classifyCameraStartFailure({ name: "NotFoundError" });
  assert.equal(unavailable, "unavailable");
  assert.match(cameraFailureMessage(unavailable), /could not start the camera/i);
});

test("session cleanup stops every camera track and zeroes biometric arrays", () => {
  let stoppedTracks = 0;
  const stream = {
    getTracks: () => [
      { stop: () => (stoppedTracks += 1) },
      { stop: () => (stoppedTracks += 1) },
    ],
  };
  stopMediaStream(stream);
  assert.equal(stoppedTracks, 2);

  const descriptor = [0.2, 0.8];
  const samples = [
    [0.1, 0.9],
    [0.3, 0.7],
  ];
  const cleared = clearSessionBiometricMemory({ descriptor, samples });
  assert.equal(cleared.descriptor, null);
  assert.deepEqual(cleared.samples, []);
  assert.deepEqual(descriptor, [0, 0]);
  assert.deepEqual(samples, [
    [0, 0],
    [0, 0],
  ]);
});

test("a fresh application session does not inherit cleared biometric state", () => {
  const previous = { descriptor: [1, 2], samples: [[3, 4]] };
  const cleared = clearSessionBiometricMemory(previous);
  const restarted = { descriptor: null, samples: [] };
  assert.deepEqual(cleared, restarted);
  assert.notStrictEqual(cleared.samples, previous.samples);
});

test("configuration validation rejects unsafe ranges and accepts defaults", () => {
  assert.deepEqual(validateFaceGuardConfiguration(FACEGUARD_CONFIG), []);
  const invalid = structuredClone(FACEGUARD_CONFIG);
  invalid.recognition.matchThreshold = 1.2;
  invalid.recognition.extraViewerRecoveryThreshold = 0.2;
  invalid.monitoring.absencePersistence = 0;
  invalid.monitoring.recoveryDelayMs = -1;
  invalid.enrolment.sampleCount = 4;
  assert.deepEqual(validateFaceGuardConfiguration(invalid), [
    "recognition.matchThreshold must be between 0 and 1",
    "recognition.extraViewerRecoveryThreshold must be at least recognition.matchThreshold",
    "monitoring.absencePersistence must be a positive integer",
    "monitoring.recoveryDelayMs must be zero or greater",
    "enrolment directions must match enrolment.sampleCount",
  ]);
});

test("custom persistence configuration is applied without scattered constants", () => {
  const tuned = structuredClone(FACEGUARD_CONFIG);
  tuned.monitoring.absencePersistence = 2;
  const concealed = applySequence(
    ["absent", "absent"],
    POST_ENROLMENT_PROTECTION,
    tuned,
  );
  assert.equal(concealed.protected, true);
});

test("transition timing remains derived from central configuration", () => {
  const interval = FACEGUARD_CONFIG.monitoring.intervalMs;
  const observedSpan = (observations) => (observations - 1) * interval;
  assert.equal(
    observedSpan(FACEGUARD_CONFIG.monitoring.additionalViewerPersistence),
    0,
  );
  assert.equal(
    observedSpan(FACEGUARD_CONFIG.monitoring.absencePersistence),
    3_250,
  );
  assert.equal(
    observedSpan(FACEGUARD_CONFIG.monitoring.uncertainPersistence),
    1_300,
  );
  assert.equal(
    observedSpan(FACEGUARD_CONFIG.monitoring.recoverySafeObservations),
    650,
  );
  // Add at most one interval for an event occurring just after a check.
  assert.equal(
    observedSpan(FACEGUARD_CONFIG.monitoring.absencePersistence) + interval,
    3_900,
  );
});
