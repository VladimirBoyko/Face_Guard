"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceProtection,
  classifyObservation,
  POST_ENROLMENT_PROTECTION,
  type ProtectionState,
  type ViewingState,
} from "./state";
import { FACEGUARD_CONFIG } from "../src/core/configuration";
import {
  averageDescriptors,
  clearDescriptor,
  clearDescriptorSamples,
} from "../src/core/descriptor";
import { logTechnicalEvent } from "../src/core/logger";

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

const ENROLMENT_SAMPLES = FACEGUARD_CONFIG.enrolment.sampleCount;
const MONITOR_INTERVAL_MS = FACEGUARD_CONFIG.monitoring.intervalMs;
const PHOTO_DIRECTIONS = FACEGUARD_CONFIG.enrolment.directions;

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
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    descriptorRef.current = clearDescriptor(descriptorRef.current);
    samplesRef.current = clearDescriptorSamples(samplesRef.current);
    logTechnicalEvent("renderer", "biometric-memory-cleared");
  }, []);

  const stopMonitoring = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    detectionRunningRef.current = false;
  }, []);

  const enterFullscreen = useCallback(async () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen remains optional when the browser or user declines it.
      }
    }
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
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [clearBiometricMemory, stopMonitoring, updatePhase]);

  useEffect(() => {
    const release = () => {
      stopMonitoring();
      stopStream(streamRef.current);
      clearBiometricMemory();
    };

    window.addEventListener("pagehide", release);
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("pagehide", release);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
          maxDetected: FACEGUARD_CONFIG.recognition.maxDetectedFaces,
          minConfidence: FACEGUARD_CONFIG.recognition.detectorConfidence,
          minSize: 48,
          rotation: false,
        },
        mesh: { enabled: false },
        iris: { enabled: false },
        emotion: { enabled: false },
        description: {
          enabled: true,
          modelPath: "faceres.json",
          minConfidence: FACEGUARD_CONFIG.recognition.matchThreshold,
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
    void enterFullscreen();
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
  }, [createEngine, enterFullscreen, updatePhase]);

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
      if (
        next.observation !== protectionRef.current.observation ||
        next.protected !== protectionRef.current.protected
      ) {
        logTechnicalEvent("renderer", "state-transition", {
          observation: next.observation,
          protected: next.protected,
          latencyMs: Math.round(performance.now() - startedAt),
        });
      }
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
    const initial = { ...POST_ENROLMENT_PROTECTION };
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
    setMessage("Checking this photo…");
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
      if (
        !face.embedding?.length ||
        face.boxScore < FACEGUARD_CONFIG.recognition.enrolmentBoxScore
      ) {
        setMessage(
          "The photo was not clear enough. Move slightly closer and try again.",
        );
        return;
      }

      samplesRef.current.push([...face.embedding]);
      const count = samplesRef.current.length;
      setSampleCount(count);

      if (count >= ENROLMENT_SAMPLES) {
        descriptorRef.current = averageDescriptors(samplesRef.current);
        samplesRef.current = clearDescriptorSamples(samplesRef.current);
        setMessage("");
        beginMonitoring();
      } else {
        setMessage(
          `Photo ${count} accepted. Follow the red marker for the next photo.`,
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
  const currentPhotoDirection =
    PHOTO_DIRECTIONS[Math.min(sampleCount, PHOTO_DIRECTIONS.length - 1)];

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
                <strong>{sampleCount} / {ENROLMENT_SAMPLES} photos</strong>
              </div>
              <h2>Confirm the authorised user</h2>
              <p>
                Be alone in frame and follow the red marker for each photo.
                Five different views become one temporary descriptor.
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
                Take photo {Math.min(sampleCount + 1, ENROLMENT_SAMPLES)}
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
              <div className="status-actions">
                {!isFullscreen && (
                  <button className="text-button" onClick={enterFullscreen}>
                    Full screen
                  </button>
                )}
                <button className="text-button" onClick={endSession}>
                  End session
                </button>
              </div>
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
                    <span className="ready-mark" aria-hidden="true">FG</span>
                    <strong>Ready to a new session</strong>
                    <p>Your camera preview will appear here.</p>
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
          <li><span>02</span><strong>Enrol</strong><p>Five guided photos form a temporary descriptor in page memory.</p></li>
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

      {phase === "enrolling" && (
        <div
          className={`gaze-target ${currentPhotoDirection.position}`}
          aria-live="polite"
        >
          <span className="gaze-dot" aria-hidden="true" />
          <div className="gaze-message">
            <strong>Look here and press the button to take photo</strong>
            <small>
              Photo {sampleCount + 1} · {currentPhotoDirection.label}
            </small>
          </div>
        </div>
      )}

      {phase === "monitoring" && protection.protected && (
        <div className="decoy-overlay" role="dialog" aria-modal="true" aria-label="Protected workspace">
          <Image
            className="decoy-image"
            src="/decoy-government.png"
            alt="Australian Government Department of Finance confidentiality guidance"
            fill
            priority
            sizes="100vw"
            unoptimized
          />
          <div className="decoy-actions">
            {!isFullscreen && (
              <button onClick={enterFullscreen}>Full screen</button>
            )}
            <button onClick={endSession}>End session</button>
          </div>
          <p className="sr-only" aria-live="assertive">
            Protected content concealed because the viewing condition is unsafe or uncertain.
          </p>
        </div>
      )}
    </main>
  );
}
