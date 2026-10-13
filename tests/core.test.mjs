import assert from "node:assert/strict";
import test from "node:test";

import { FACEGUARD_CONFIG } from "../src/core/configuration.ts";
import {
  averageDescriptors,
  clearDescriptor,
  clearDescriptorSamples,
} from "../src/core/descriptor.ts";
import { advanceProtection } from "../src/core/protection-state.ts";

test("central configuration retains the prototype defaults", () => {
  assert.equal(FACEGUARD_CONFIG.recognition.matchThreshold, 0.45);
  assert.equal(FACEGUARD_CONFIG.recognition.detectorConfidence, 0.6);
  assert.equal(FACEGUARD_CONFIG.enrolment.sampleCount, 5);
  assert.equal(FACEGUARD_CONFIG.monitoring.absencePersistence, 3);
  assert.equal(FACEGUARD_CONFIG.monitoring.additionalViewerPersistence, 1);
  assert.equal(FACEGUARD_CONFIG.monitoring.uncertainPersistence, 3);
  assert.equal(FACEGUARD_CONFIG.monitoring.recoverySafeObservations, 2);
});

test("unsafe observation persistence is independent", () => {
  let state = {
    protected: false,
    observation: "safe",
    safeHits: 2,
    unsafeHits: 0,
  };
  state = advanceProtection(state, "absent");
  state = advanceProtection(state, "uncertain");
  state = advanceProtection(state, "absent");
  assert.equal(state.protected, false);
  assert.equal(state.unsafeHits, 1);
  state = advanceProtection(state, "extra-viewer");
  assert.equal(state.protected, true);
});

test("descriptor helpers normalise and zero temporary values", () => {
  const samples = [
    [1, 0],
    [0, 1],
  ];
  const descriptor = averageDescriptors(samples);
  assert.ok(Math.abs(Math.hypot(...descriptor) - 1) < 1e-12);

  assert.equal(clearDescriptor(descriptor), null);
  assert.deepEqual(descriptor, [0, 0]);
  assert.deepEqual(clearDescriptorSamples(samples), []);
  assert.deepEqual(samples, [
    [0, 0],
    [0, 0],
  ]);
});
