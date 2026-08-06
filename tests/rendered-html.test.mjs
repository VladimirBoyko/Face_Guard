import assert from "node:assert/strict";
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
  assert.match(html, /protects this FaceGuard workspace/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("viewing-state rules fail closed and recover conservatively", async () => {
  const { advanceProtection, classifyObservation } = await import(
    "../app/state.ts"
  );

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
  state = advanceProtection(state, "safe");
  assert.equal(state.protected, true);
  state = advanceProtection(state, "safe");
  assert.equal(state.protected, false);
  state = advanceProtection(state, "extra-viewer");
  assert.equal(state.protected, true);
});
