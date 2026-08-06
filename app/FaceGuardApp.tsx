"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceProtection,
  classifyObservation,
  type ProtectionState,
  type ViewingState,
} from "./state";

type Phase =
  | "intro"
  | "starting"
  | "enrolling"
  | "monitoring"
  | "ended";

type FaceResult = {
  boxScore: number;
  embedding?: number[];
};

type DetectionResult = {
  face: FaceResult[];
};

type HumanEngine = {
  load: () => Promise<void>;
  detect: (input: HTMLVideoElement) => Promise<DetectionResult>;
  match: {
    similarity: (first: number[], second: number[]) => number;
  };
};

const ENROLMENT_SAMPLES = 3;
const MONITOR_INTERVAL_MS = 700;

const INITIAL_PROTECTION: ProtectionState = {
  protected: true,
  observation: "uncertain",
  safeHits: 0,
  unsafeHits: 0,
};

const STATE_COPY: Record<
  ViewingState,
  { label: string; detail: string; tone: string }
> = {
  safe: {
    label: "Private view confirmed",
    detail: "Only the enrolled user is visible.",
    tone: "safe",
  },
  "extra-viewer": {
    label: "Additional viewer detected",
    detail: "Protected content is concealed.",
    tone: "danger",
  },
  absent: {
    label: "Enrolled user not detected",
    detail: "Protected content is concealed.",
    tone: "danger",
  },
  uncertain: {
    label: "Checking viewing conditions",
    detail: "FaceGuard remains protected until the view is confirmed.",
    tone: "warning",
  },
};

function averageDescriptors(descriptors: number[][]): number[] {
  const length = descriptors[0]?.length ?? 0;
  if (!length) return [];

  const average = Array.from({ length }, (_, index) =>
    descriptors.reduce((sum, descriptor) => sum + descriptor[index], 0) /
    descriptors.length,
  );
  const magnitude = Math.sqrt(
    average.reduce((sum, value) => sum + value * value, 0),
  );
  return magnitude > 0 ? average.map((value) => value / magnitude) : average;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function FaceGuardApp() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [message, setMessage] = useState("");
  const [sampleCount, setSampleCount] = useState(0);
  const [protection, setProtection] =
    useState<ProtectionState>(INITIAL_PROTECTION);
  const [lastCheckMs, setLastCheckMs] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<HumanEngine | null>(null);
  const descriptorRef = useRef<number[] | null>(null);
  const samplesRef = useRef<number[][]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectionRunningRef = useRef(false);
  const protectionRef = useRef<ProtectionState>(INITIAL_PROTECTION);
  const phaseRef = useRef<Phase>("intro");

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearBiometricMemory = useCallback(() => {
    descriptorRef.current?.fill(0);
    descriptorRef.current = null;
    samplesRef.current.forEach((sample) => sample.fill(0));
    samplesRef.current = [];
  }, []);

  const stopMonitoring = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    detectionRunningRef.current = false;
  }, []);

  const endSession = useCallback(() => {
    stopMonitoring();
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearBiometricMemory();
    engineRef.current = null;
    protectionRef.current = INITIAL_PROTECTION;
    setProtection(INITIAL_PROTECTION);
    setSampleCount(0);
    setLastCheckMs(null);
    setMessage("");
    updatePhase("ended");
  }, [clearBiometricMemory, stopMonitoring, updatePhase]);

  useEffect(() => {
    const release = () => {
      stopMonitoring();
      stopStream(streamRef.current);
      clearBiometricMemory();
    };

    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [clearBiometricMemory, stopMonitoring]);

  const createEngine = useCallback(async (): Promise<HumanEngine> => {
    const { Human } = await import("@vladmandic/human");
    const engine = new Human({
      backend: "webgl",
      modelBasePath: "/models/",
      cacheSensitivity: 0,
      filter: { enabled: true, return: false, flip: true },
      face: {
        enabled: true,
        detector: {
          modelPath: "blazeface.json",
          maxDetected: 5,
          minConfidence: 0.45,
          minSize: 48,
          rotation: false,
        },
        mesh: { enabled: false },
        iris: { enabled: false },
        emotion: { enabled: false },
        description: {
          enabled: true,
          modelPath: "faceres.json",
          minConfidence: 0.45,
        },
        antispoof: { enabled: false },
        liveness: { enabled: false },
        attention: { enabled: false },
        gear: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
      segmentation: { enabled: false },
    });
    await engine.load();
    return engine as unknown as HumanEngine;
  }, []);

  const startSession = useCallback(async () => {
    setMessage("");
    updatePhase("starting");

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage(
        "Camera access requires localhost or another secure browser context.",
      );
      updatePhase("intro");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 540 },
        },
        audio: false,
      });
      streamRef.current = stream;

      if (!videoRef.current) throw new Error("Video preview is unavailable.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      engineRef.current = await createEngine();
      samplesRef.current = [];
      setSampleCount(0);
      updatePhase("enrolling");
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      const name = error instanceof DOMException ? error.name : "";
      setMessage(
        name === "NotAllowedError"
          ? "Camera permission was not granted. FaceGuard cannot start without it."
          : "FaceGuard could not start the camera or local face model. Please check the camera and try again.",
      );
      updatePhase("intro");
    }
  }, [createEngine, updatePhase]);

  const monitorOnce = useCallback(async () => {
    if (
      detectionRunningRef.current ||
      phaseRef.current !== "monitoring" ||
      !videoRef.current ||
      !engineRef.current ||
      !descriptorRef.current
    ) {
      return;
    }

    detectionRunningRef.current = true;
    const startedAt = performance.now();
    try {
      const result = await engineRef.current.detect(videoRef.current);
      const embeddingsComplete = result.face.every(
        (face) => face.embedding && face.embedding.length > 0,
      );
      const similarities = result.face
        .filter((face) => face.embedding)
        .map((face) =>
          engineRef.current!.match.similarity(
            descriptorRef.current!,
            face.embedding!,
          ),
        );
      const observation = classifyObservation({
        faceCount: result.face.length,
        bestSimilarity: similarities.length ? Math.max(...similarities) : 0,
        embeddingsComplete,
      });
      const next = advanceProtection(protectionRef.current, observation);
      protectionRef.current = next;
      setProtection(next);
      setLastCheckMs(Math.round(performance.now() - startedAt));
    } catch {
      const next = advanceProtection(protectionRef.current, "uncertain");
      protectionRef.current = next;
      setProtection(next);
    } finally {
      detectionRunningRef.current = false;
    }
  }, []);

  const beginMonitoring = useCallback(() => {
    const initial = { ...INITIAL_PROTECTION };
    protectionRef.current = initial;
    setProtection(initial);
    updatePhase("monitoring");
    window.setTimeout(() => void monitorOnce(), 0);
    timerRef.current = setInterval(
      () => void monitorOnce(),
      MONITOR_INTERVAL_MS,
    );
  }, [monitorOnce, updatePhase]);

  const captureSample = useCallback(async () => {
    if (
      detectionRunningRef.current ||
      !videoRef.current ||
      !engineRef.current
    ) {
      return;
    }

    detectionRunningRef.current = true;
    setMessage("Checking this sample…");
    try {
      const result = await engineRef.current.detect(videoRef.current);
      if (result.face.length !== 1) {
        setMessage(
          result.face.length === 0
            ? "No clear face detected. Face the camera in even lighting and try again."
            : "More than one face detected. Enrolment requires the authorised user to be alone.",
        );
        return;
      }

      const face = result.face[0];
      if (!face.embedding?.length || face.boxScore < 0.5) {
        setMessage(
          "The sample was not clear enough. Move slightly closer and try again.",
        );
        return;
      }

      samplesRef.current.push([...face.embedding]);
      const count = samplesRef.current.length;
      setSampleCount(count);

      if (count >= ENROLMENT_SAMPLES) {
        descriptorRef.current = averageDescriptors(samplesRef.current);
        samplesRef.current.forEach((sample) => sample.fill(0));
        samplesRef.current = [];
        setMessage("");
        beginMonitoring();
      } else {
        setMessage(
          `Sample ${count} accepted. Turn your head slightly, then capture the next sample.`,
        );
      }
    } catch {
      setMessage("The local face check failed. Keep the camera clear and try again.");
    } finally {
      detectionRunningRef.current = false;
    }
  }, [beginMonitoring]);

  const restart = useCallback(() => {
    updatePhase("intro");
    setMessage("");
  }, [updatePhase]);

  const stateCopy = STATE_COPY[protection.observation];
  const showVideo = phase === "enrolling" || phase === "monitoring";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FaceGuard home">
          <span className="brand-mark" aria-hidden="true">
            FG
          </span>
          <span>FaceGuard</span>
        </a>
        <div className="local-badge">
          <span aria-hidden="true" /> Local-only prototype
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Active-session privacy</p>
          <h1>Your screen should know when to look away.</h1>
          <p className="hero-lead">
            FaceGuard uses your webcam and on-device face analysis to conceal
            this workspace when you leave or another viewer appears.
          </p>

          <div className="privacy-strip" aria-label="Privacy commitments">
            <span>On-device analysis</span>
            <span>Memory-only enrolment</span>
            <span>No cloud or account</span>
          </div>

          {phase === "intro" && (
            <div className="action-block">
              <button className="primary-button" onClick={startSession}>
                Start private session
              </button>
              <p>
                Your browser will ask for camera permission. Face images are
                processed locally and are never saved by FaceGuard.
              </p>
            </div>
          )}

          {phase === "starting" && (
            <div className="loading-card" role="status">
              <span className="spinner" aria-hidden="true" />
              <div>
                <strong>Preparing the private session</strong>
                <p>Opening the camera and loading local models…</p>
              </div>
            </div>
          )}

          {phase === "enrolling" && (
            <div className="enrol-card">
              <div className="step-heading">
                <span>Enrolment</span>
                <strong>{sampleCount} / {ENROLMENT_SAMPLES} samples</strong>
              </div>
              <h2>Confirm the authorised user</h2>
              <p>
                Be alone in frame, face the camera, and capture three slightly
                different views. Samples become one temporary descriptor.
              </p>
              <div className="sample-progress" aria-hidden="true">
                {Array.from({ length: ENROLMENT_SAMPLES }, (_, index) => (
                  <span
                    className={index < sampleCount ? "complete" : ""}
                    key={index}
                  />
                ))}
              </div>
              <button className="primary-button" onClick={captureSample}>
                Capture sample {Math.min(sampleCount + 1, ENROLMENT_SAMPLES)}
              </button>
              <button className="text-button" onClick={endSession}>
                Cancel session
              </button>
            </div>
          )}

          {phase === "monitoring" && (
            <div className={`status-card ${stateCopy.tone}`} aria-live="polite">
              <span className="status-light" aria-hidden="true" />
              <div>
                <strong>{stateCopy.label}</strong>
                <p>{stateCopy.detail}</p>
              </div>
              <button className="text-button" onClick={endSession}>
                End session
              </button>
            </div>
          )}

          {phase === "ended" && (
            <div className="ended-card">
              <p className="eyebrow">Session cleared</p>
              <h2>Camera stopped. Enrolment removed.</h2>
              <p>
                The in-memory face descriptor has been discarded. Start again
                whenever you need a new private session.
              </p>
              <button className="primary-button" onClick={restart}>
                Return to start
              </button>
            </div>
          )}

          {message && <p className="inline-message" role="alert">{message}</p>}
        </div>

        <div className="workspace-card" aria-label="FaceGuard protected workspace">
          <div className="workspace-toolbar">
            <div className="traffic-lights" aria-hidden="true">
              <i /><i /><i />
            </div>
            <span>Confidential workspace</span>
            <span className="encrypted-label">LOCAL</span>
          </div>

          <div className="workspace-content">
            <div className="document-preview">
              <div className="document-heading">
                <p>Quarterly planning</p>
                <span>INTERNAL</span>
              </div>
              <h2>Client transition brief</h2>
              <div className="document-lines" aria-hidden="true">
                <span /><span /><span /><span className="short" />
              </div>
              <div className="metric-row">
                <div><small>Readiness</small><strong>84%</strong></div>
                <div><small>Open items</small><strong>07</strong></div>
                <div><small>Review</small><strong>12 Aug</strong></div>
              </div>
              <div className="document-lines lower" aria-hidden="true">
                <span /><span /><span className="medium" />
              </div>
            </div>

            <aside className="camera-panel">
              <div className="camera-frame">
                <video
                  ref={videoRef}
                  className={showVideo ? "visible" : ""}
                  muted
                  playsInline
                  aria-label="Live camera preview"
                />
                {!showVideo && (
                  <div className="camera-placeholder">
                    <span aria-hidden="true">●</span>
                    <p>Camera inactive</p>
                  </div>
                )}
                {showVideo && <div className="face-guide" aria-hidden="true" />}
              </div>
              <div className="camera-meta">
                <span>Session camera</span>
                <strong>{showVideo ? "Active" : "Off"}</strong>
              </div>
              {lastCheckMs !== null && (
                <p className="latency">Last local check: {lastCheckMs} ms</p>
              )}
            </aside>
          </div>
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="how-heading">
        <div>
          <p className="eyebrow">Privacy by design</p>
          <h2 id="how-heading">What stays on this device</h2>
        </div>
        <ol>
          <li><span>01</span><strong>Consent</strong><p>You intentionally grant camera access for each session.</p></li>
          <li><span>02</span><strong>Enrol</strong><p>Three samples form a temporary descriptor in page memory.</p></li>
          <li><span>03</span><strong>Protect</strong><p>Unsafe or uncertain viewing conditions conceal the workspace.</p></li>
          <li><span>04</span><strong>Clear</strong><p>Ending the session stops the camera and removes the descriptor.</p></li>
        </ol>
      </section>

      <footer>
        <p>
          Browser prototype — protects this FaceGuard workspace, not other
          applications or browser tabs.
        </p>
        <span>No uploads · No database · No account</span>
      </footer>

      {phase === "monitoring" && protection.protected && (
        <div className="decoy-overlay" role="dialog" aria-modal="true" aria-label="Protected workspace">
          <div className="decoy-topbar">
            <strong>Focus</strong>
            <button onClick={endSession}>End session</button>
          </div>
          <div className="decoy-content">
            <p className="decoy-date">Thursday · Deep work</p>
            <h2>Make space for one clear thought.</h2>
            <div className="focus-card">
              <span>Current focus</span>
              <strong>Review notes and prepare next actions</strong>
              <div className="focus-progress"><i /></div>
              <small>25 minutes remaining</small>
            </div>
            <p className="decoy-note">This view will close automatically when the private viewing condition returns.</p>
          </div>
          <p className="sr-only" aria-live="assertive">
            Protected content concealed because the viewing condition is unsafe or uncertain.
          </p>
        </div>
      )}
    </main>
  );
}
