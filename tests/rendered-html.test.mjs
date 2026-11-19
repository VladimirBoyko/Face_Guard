import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the FaceGuard local-only experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /FaceGuard/);
  assert.match(html, /Start private session/);
  assert.match(html, /On-device analysis/);
  assert.match(html, /No cloud or account/);
  assert.match(html, /Choose own picture/);
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /protects this FaceGuard workspace/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("viewing-state rules fail closed and recover on configured safe evidence", async () => {
  const {
    advanceProtection,
    classifyObservation,
    POST_ENROLMENT_PROTECTION,
    RECOVERY_SAFE_HITS,
  } = await import(
    "../app/state.ts"
  );

  assert.deepEqual(POST_ENROLMENT_PROTECTION, {
    protected: false,
    observation: "safe",
    safeHits: RECOVERY_SAFE_HITS,
    unsafeHits: 0,
  });

  assert.equal(
    classifyObservation({
      faceCount: 1,
      bestSimilarity: 0.8,
      embeddingsComplete: true,
    }),
    "safe",
  );
  assert.equal(
    classifyObservation({
      faceCount: 2,
      bestSimilarity: 0.9,
      embeddingsComplete: false,
    }),
    "extra-viewer",
  );
  assert.equal(
    classifyObservation({
      faceCount: 1,
      bestSimilarity: 0.2,
      embeddingsComplete: true,
    }),
    "absent",
  );
  assert.equal(
    classifyObservation({
      faceCount: 1,
      bestSimilarity: 0,
      embeddingsComplete: false,
    }),
    "uncertain",
  );

  let state = {
    protected: true,
    observation: "uncertain",
    safeHits: 0,
    unsafeHits: 0,
  };
  state = advanceProtection(state, "safe");
  assert.equal(state.protected, false);
  state = advanceProtection(state, "extra-viewer");
  assert.equal(state.protected, true);

  state = { ...POST_ENROLMENT_PROTECTION };
  for (let observation = 0; observation < 5; observation += 1) {
    state = advanceProtection(state, "absent");
  }
  assert.equal(state.protected, false);
  state = advanceProtection(state, "absent");
  assert.equal(state.protected, true);
});

test("uses six guided enrolment photos and a selectable local decoy", async () => {
  const source = await readFile(
    new URL("../app/FaceGuardApp.tsx", import.meta.url),
    "utf8",
  );
  const configuration = await readFile(
    new URL("../src/core/configuration.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /FACEGUARD_CONFIG\.enrolment\.sampleCount/);
  assert.match(source, /decoy-government\.png\?inline/);
  assert.match(source, /customDecoy\?\.dataUrl \?\? defaultDecoyImage/);
  assert.match(source, /Choose own picture/);
  assert.match(source, /className="gaze-trigger"/);
  assert.match(source, /onClick=\{captureSample\}/);
  assert.match(source, /do not follow it only with your eyes/);
  assert.match(source, /Turn your head towards your keyboard for the best result/);
  assert.match(configuration, /position: "centre"/);
  assert.match(configuration, /position: "upper-left"/);
  assert.match(configuration, /position: "lower-left"/);
  assert.match(configuration, /position: "upper-right"/);
  assert.match(configuration, /position: "lower-right"/);
  assert.match(configuration, /position: "lower-centre"/);
  assert.match(configuration, /sampleCount: 6/);
});

test("desktop quit is explicit and prevents duplicate background instances", async () => {
  const source = await readFile(
    new URL("../src/desktop/main.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /app\.requestSingleInstanceLock\(\)/);
  assert.match(source, /tray\?\.destroy\(\)/);
  assert.match(source, /overlayManager\?\.dispose\(\)/);
  assert.match(source, /controlWindow\.destroy\(\)/);
  assert.match(source, /app\.exit\(0\)/);
  assert.match(source, /setTimeout\(exitApplication, 1_000\)/);
});

test("macOS package opens FaceGuard once after successful installation", async () => {
  const script = await readFile(
    new URL("../installer/scripts/postinstall", import.meta.url),
    "utf8",
  );

  assert.match(script, /launchctl asuser/);
  assert.match(script, /open \/Applications\/FaceGuard\.app/);
  assert.doesNotMatch(script, /setLoginItemSettings|LaunchAgent/);
});

test("desktop control window launches maximized and remains maximized", async () => {
  const main = await readFile(
    new URL("../src/desktop/main.ts", import.meta.url),
    "utf8",
  );

  assert.match(main, /window\.maximize\(\)/);
  assert.doesNotMatch(main, /unmaximize\(\)|restoreAfterEnrolment/);
});
