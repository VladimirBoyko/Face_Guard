import assert from "node:assert/strict";
import test from "node:test";

import { FACEGUARD_CONFIG } from "../src/core/configuration.ts";
import {
  isAllowedDecoyType,
  isSafeDecoyDataUrl,
  MAX_CUSTOM_DECOY_BYTES,
} from "../src/core/decoy.ts";
import { decodeDecoyDataUrl } from "../src/desktop/decoy-payload.ts";
import {
  averageDescriptors,
  clearDescriptor,
  clearDescriptorSamples,
} from "../src/core/descriptor.ts";
import { advanceProtection } from "../src/core/protection-state.ts";
import {
  isDecoyImageMessage,
  isProtectionStateMessage,
  sanitiseRendererLog,
} from "../src/desktop/validation.ts";

test("central configuration retains the prototype defaults", () => {
  assert.equal(FACEGUARD_CONFIG.recognition.matchThreshold, 0.45);
  assert.equal(FACEGUARD_CONFIG.recognition.detectorConfidence, 0.6);
  assert.equal(FACEGUARD_CONFIG.enrolment.sampleCount, 6);
  assert.equal(FACEGUARD_CONFIG.monitoring.absencePersistence, 6);
  assert.equal(FACEGUARD_CONFIG.monitoring.additionalViewerPersistence, 1);
  assert.equal(FACEGUARD_CONFIG.monitoring.uncertainPersistence, 3);
  assert.equal(FACEGUARD_CONFIG.monitoring.recoverySafeObservations, 1);
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

test("desktop IPC accepts only known protection states", () => {
  assert.equal(
    isProtectionStateMessage({ protected: true, observation: "absent" }),
    true,
  );
  assert.equal(
    isProtectionStateMessage({ protected: true, observation: "unknown" }),
    false,
  );
  assert.equal(isProtectionStateMessage({ observation: "safe" }), false);
});

test("desktop logging drops biometric-shaped and unknown renderer fields", () => {
  assert.deepEqual(
    sanitiseRendererLog({
      event: "state-transition",
      observation: "safe",
      latencyMs: 10.4,
      embedding: [0.1, 0.2],
      frame: "raw-image",
    }),
    {
      event: "state-transition",
      observation: "safe",
      latencyMs: 10,
    },
  );
});

test("custom decoy images are limited to safe local image data", () => {
  const pngDataUrl = "data:image/png;base64,aGVsbG8=";

  assert.equal(isAllowedDecoyType("image/png"), true);
  assert.equal(isAllowedDecoyType("image/jpeg"), true);
  assert.equal(isAllowedDecoyType("image/webp"), true);
  assert.equal(isAllowedDecoyType("image/svg+xml"), false);
  assert.equal(MAX_CUSTOM_DECOY_BYTES, 8 * 1024 * 1024);
  assert.equal(isSafeDecoyDataUrl(pngDataUrl), true);
  assert.equal(isSafeDecoyDataUrl("data:image/svg+xml,<svg/>"), false);
  assert.equal(isDecoyImageMessage({ dataUrl: pngDataUrl }), true);
  assert.equal(isDecoyImageMessage({ dataUrl: null }), true);
  assert.equal(
    isDecoyImageMessage({ dataUrl: "https://example.com/decoy.png" }),
    false,
  );
});

test("custom decoy data is decoded for the native overlay without disk storage", () => {
  const dataUrl = `data:image/png;base64,${Buffer.from("local-image").toString("base64")}`;
  const payload = decodeDecoyDataUrl(dataUrl);

  assert.equal(payload?.mimeType, "image/png");
  assert.deepEqual(Buffer.from(payload?.bytes ?? []), Buffer.from("local-image"));
  assert.equal(decodeDecoyDataUrl("https://example.com/image.png"), null);
});
