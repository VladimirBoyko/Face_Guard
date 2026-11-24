"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  advanceProtection,
  classifyObservation,
  POST_ENROLMENT_PROTECTION,
  recognitionThresholdFor,
  shouldConfirmRecoveryImmediately,
  type ProtectionState,
  type ViewingState,
} from "./state";
import { FACEGUARD_CONFIG } from "../src/core/configuration";
import {
  cameraFailureMessage,
  classifyCameraStartFailure,
} from "../src/core/camera";
import { averageBestTemplateSimilarities } from "../src/core/descriptor";
import { evaluateEnrolmentFaces } from "../src/core/enrolment";
import {
  evaluateFrameQuality,
  hasMinimumFaceSize,
} from "../src/core/frame-quality";
import {
  isAllowedDecoyType,
  isSafeDecoyDataUrl,
  MAX_CUSTOM_DECOY_BYTES,
} from "../src/core/decoy";
import defaultDecoyImage from "../public/decoy-government.png?inline";
import { logTechnicalEvent } from "../src/core/logger";
import {
  clearSessionBiometricMemory,
  stopMediaStream,
} from "../src/core/session-cleanup";
import {
  effectiveProtectionState,
  isProtectionPaused,
  secondsUntilPauseEnds,
  TEN_MINUTE_PAUSE_MS,
  type ProtectionPauseMode,
} from "../src/core/protection-pause";

type Phase =
  | "intro"
  | "starting"
  | "enrolling"
  | "monitoring"
  | "ended";

type FaceResult = {
  boxScore: number;
  box?: number[];
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

function formatPauseCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function readVideoFrameQuality(
  video: HTMLVideoElement,
  canvasRef: { current: HTMLCanvasElement | null },
  faceBox?: readonly number[],
) {
  const { sampleWidth, sampleHeight } = FACEGUARD_CONFIG.quality;
  const canvas = canvasRef.current ?? document.createElement("canvas");
  canvasRef.current = canvas;
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return {
      acceptable: false as const,
      brightness: 0,
      contrast: 0,
      edgeStrength: 0,
      reason: "blurred" as const,
    };
  }
  if (faceBox && faceBox.length >= 4) {
    const sourceX = Math.max(0, faceBox[0]);
    const sourceY = Math.max(0, faceBox[1]);
    const sourceWidth = Math.min(faceBox[2], video.videoWidth - sourceX);
    const sourceHeight = Math.min(faceBox[3], video.videoHeight - sourceY);
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sampleWidth,
      sampleHeight,
    );
  } else {
    context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
  }
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  return evaluateFrameQuality(
    pixels,
    sampleWidth,
    sampleHeight,
    FACEGUARD_CONFIG.quality,
  );
}

const INITIAL_PROTECTION: ProtectionState = {
  protected: true,
  observation: "uncertain",
  safeHits: 0,
  unsafeHits: 0,
  extraViewerLatched: false,
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
  "unmatched-viewer": {
    label: "Unrecognised viewer detected",
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

export function FaceGuardApp() {
  const desktopBridge =
    typeof window === "undefined" ? undefined : window.faceGuardDesktop;
  const isDesktop = Boolean(desktopBridge);
  const desktopPlatform = desktopBridge?.platform;
  const [phase, setPhase] = useState<Phase>("intro");
  const [message, setMessage] = useState("");
  const [enrolmentError, setEnrolmentError] = useState("");
  const [sampleCount, setSampleCount] = useState(0);
  const [protection, setProtection] =
    useState<ProtectionState>(INITIAL_PROTECTION);
  const [pauseMode, setPauseMode] =
    useState<ProtectionPauseMode>("active");
  const [pauseEndsAt, setPauseEndsAt] = useState<number | null>(null);
  const [pauseSecondsRemaining, setPauseSecondsRemaining] = useState(0);
  const [lastCheckMs, setLastCheckMs] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [usesExternalEnrolmentMarker, setUsesExternalEnrolmentMarker] =
    useState(false);
  const [showsOtherScreenCue, setShowsOtherScreenCue] = useState(false);
  const [customDecoy, setCustomDecoy] = useState<{
    dataUrl: string;
    name: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<HumanEngine | null>(null);
  const samplesRef = useRef<number[][]>([]);
  const qualityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectionRunningRef = useRef(false);
  const cameraRecoveryRunningRef = useRef(false);
  const cameraOpenGenerationRef = useRef(0);
  const protectionRef = useRef<ProtectionState>(INITIAL_PROTECTION);
  const phaseRef = useRef<Phase>("intro");
  const observationStartedAtRef = useRef<number | null>(null);
  const desktopProtectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const decoyImageSrc = customDecoy?.dataUrl ?? defaultDecoyImage;
  const currentPhotoDirection =
    PHOTO_DIRECTIONS[Math.min(sampleCount, PHOTO_DIRECTIONS.length - 1)];
  const protectionPaused = isProtectionPaused(pauseMode);

  const restoreProtection = useCallback(() => {
    setPauseMode("active");
    setPauseEndsAt(null);
    setPauseSecondsRemaining(0);
  }, []);

  const pauseProtectionForTenMinutes = useCallback(() => {
    const endsAt = Date.now() + TEN_MINUTE_PAUSE_MS;
    setPauseMode("timed");
    setPauseEndsAt(endsAt);
    setPauseSecondsRemaining(TEN_MINUTE_PAUSE_MS / 1_000);
  }, []);

  const toggleManualProtectionPause = useCallback(() => {
    if (protectionPaused) {
      restoreProtection();
      return;
    }
    setPauseMode("manual");
    setPauseEndsAt(null);
    setPauseSecondsRemaining(0);
  }, [protectionPaused, restoreProtection]);

  useEffect(() => {
    if (pauseMode !== "timed" || pauseEndsAt === null) return;
    const updateCountdown = () => {
      const remaining = secondsUntilPauseEnds(pauseEndsAt);
      setPauseSecondsRemaining(remaining);
      if (remaining === 0) restoreProtection();
    };
    updateCountdown();
    const countdown = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(countdown);
  }, [pauseEndsAt, pauseMode, restoreProtection]);

  useEffect(() => {
    if (!desktopBridge) return;
    let active = true;
    void desktopBridge.loadSavedDecoyImage().then((saved) => {
      if (!active || !saved) return;
      setCustomDecoy(saved);
      void desktopBridge.decoyImageChanged(saved);
    });
    return () => {
      active = false;
    };
  }, [desktopBridge]);

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearBiometricMemory = useCallback(() => {
    const cleared = clearSessionBiometricMemory({
      descriptor: null,
      samples: samplesRef.current,
    });
    samplesRef.current = cleared.samples;
    logTechnicalEvent("renderer", "biometric-memory-cleared");
  }, []);

  const stopMonitoring = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    detectionRunningRef.current = false;
  }, []);

  const enterFullscreen = useCallback(async () => {
    if (isDesktop) return;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen remains optional when the browser or user declines it.
      }
    }
  }, [isDesktop]);

  const endSession = useCallback(() => {
    stopMonitoring();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearBiometricMemory();
    engineRef.current = null;
    protectionRef.current = INITIAL_PROTECTION;
    setProtection(INITIAL_PROTECTION);
    setSampleCount(0);
    setLastCheckMs(null);
    setMessage("");
    setEnrolmentError("");
    restoreProtection();
    updatePhase("ended");
    desktopBridge?.sessionEnded();
    if (!isDesktop && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [
    clearBiometricMemory,
    desktopBridge,
    isDesktop,
    restoreProtection,
    stopMonitoring,
    updatePhase,
  ]);

  useEffect(() => {
    const release = () => {
      stopMonitoring();
      stopMediaStream(streamRef.current);
      clearBiometricMemory();
    };

    window.addEventListener("pagehide", release);
    const handleFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    if (!isDesktop) {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
    }
    return () => {
      window.removeEventListener("pagehide", release);
      if (!isDesktop) {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      }
      release();
    };
  }, [clearBiometricMemory, isDesktop, stopMonitoring]);

  useEffect(() => {
    if (!desktopBridge) return;
    return desktopBridge.onSessionEndRequested(endSession);
  }, [desktopBridge, endSession]);

  const chooseDecoyImage = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!isAllowedDecoyType(file.type)) {
        setMessage("Choose a PNG, JPEG or WebP image for the decoy.");
        return;
      }
      if (file.size > MAX_CUSTOM_DECOY_BYTES) {
        setMessage("The custom decoy image must be 8 MB or smaller.");
        return;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Image could not be read"));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        if (!isSafeDecoyDataUrl(dataUrl)) {
          setMessage("FaceGuard could not use this image. Try another file.");
          return;
        }
        if (desktopBridge) {
          const saved = await desktopBridge.decoyImageChanged({
            dataUrl,
            name: file.name,
          });
          if (!saved) {
            setMessage("FaceGuard could not save this picture. Try another file.");
            return;
          }
        }
        setCustomDecoy({ dataUrl, name: file.name });
        setMessage("");
      } catch {
        setMessage("FaceGuard could not read this image. Try another file.");
      }
    },
    [desktopBridge],
  );

  const useDefaultDecoy = useCallback(() => {
    setCustomDecoy(null);
    void desktopBridge?.decoyImageChanged({ dataUrl: null });
    setMessage("");
  }, [desktopBridge]);

  useEffect(() => {
    if (!desktopBridge || phase !== "monitoring") return;
    if (desktopProtectionTimerRef.current) {
      clearTimeout(desktopProtectionTimerRef.current);
    }
    const effectiveProtected = effectiveProtectionState(
      protection.protected,
      pauseMode,
    );
    const delay = effectiveProtected
      ? FACEGUARD_CONFIG.monitoring.concealmentDelayMs
      : FACEGUARD_CONFIG.monitoring.recoveryDelayMs;
    desktopProtectionTimerRef.current = setTimeout(() => {
      desktopBridge.protectionStateChanged({
        protected: effectiveProtected,
        observation: protection.observation,
      });
      desktopProtectionTimerRef.current = null;
    }, delay);
    return () => {
      if (desktopProtectionTimerRef.current) {
        clearTimeout(desktopProtectionTimerRef.current);
        desktopProtectionTimerRef.current = null;
      }
    };
  }, [
    desktopBridge,
    pauseMode,
    phase,
    protection.observation,
    protection.protected,
  ]);

  const createEngine = useCallback(async (): Promise<HumanEngine> => {
    const { Human } = await import("@vladmandic/human");
    const engine = new Human({
      backend: "webgl",
      modelBasePath: isDesktop
        ? new URL("./models/", window.location.href).toString()
        : "/models/",
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
  }, [isDesktop]);

  const openCameraStream = useCallback(async (
    timeoutMs?: number,
  ): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is unavailable.");
    }

    const generation = ++cameraOpenGenerationRef.current;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;

    const streamRequest = navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 540 },
      },
      audio: false,
    });
    const guardedStreamRequest = streamRequest.then((stream) => {
      if (generation !== cameraOpenGenerationRef.current) {
        stopMediaStream(stream);
        throw new Error("Camera request was superseded.");
      }
      return stream;
    });
    let timeoutId: number | undefined;
    const stream = timeoutMs
      ? await Promise.race([
          guardedStreamRequest,
          new Promise<never>((_resolve, reject) => {
            timeoutId = window.setTimeout(() => {
              if (generation === cameraOpenGenerationRef.current) {
                cameraOpenGenerationRef.current += 1;
              }
              reject(new Error("Camera did not recover in time."));
            }, timeoutMs);
          }),
        ]).finally(() => {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        })
      : await guardedStreamRequest;

    try {
      if (!videoRef.current) throw new Error("Video preview is unavailable.");
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      return stream;
    } catch (error) {
      stopMediaStream(stream);
      if (streamRef.current === stream) streamRef.current = null;
      if (videoRef.current?.srcObject === stream) {
        videoRef.current.srcObject = null;
      }
      throw error;
    }
  }, []);

  const startSession = useCallback(async () => {
    setMessage("");
    setEnrolmentError("");
    updatePhase("starting");
    void enterFullscreen();
    if (desktopBridge && !(await desktopBridge.requestCameraPermission())) {
      setMessage(
        "Camera permission was not granted. Enable FaceGuard in System Settings → Privacy & Security → Camera.",
      );
      updatePhase("intro");
      return;
    }
    if ((!isDesktop && !window.isSecureContext) || !navigator.mediaDevices?.getUserMedia) {
      setMessage(
        "Camera access requires localhost or another secure browser context.",
      );
      updatePhase("intro");
      return;
    }

    try {
      await openCameraStream();
      engineRef.current = await createEngine();
      samplesRef.current = [];
      setSampleCount(0);
      updatePhase("enrolling");
    } catch (error) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      setMessage(cameraFailureMessage(classifyCameraStartFailure(error)));
      updatePhase("intro");
    }
  }, [
    createEngine,
    desktopBridge,
    enterFullscreen,
    isDesktop,
    openCameraStream,
    updatePhase,
  ]);

  const recoverCameraAfterResume = useCallback(async (
    reason: "resume" | "unlock-screen",
  ) => {
    const sessionIsActive =
      phaseRef.current === "enrolling" || phaseRef.current === "monitoring";
    if (!desktopBridge || !sessionIsActive || cameraRecoveryRunningRef.current) {
      return;
    }

    cameraRecoveryRunningRef.current = true;
    const unlockedByUser = reason === "unlock-screen";
    const interrupted = unlockedByUser
      ? { ...POST_ENROLMENT_PROTECTION }
      : {
          ...protectionRef.current,
          protected: true,
          observation: "uncertain" as const,
          safeHits: 0,
          unsafeHits: 0,
        };
    protectionRef.current = interrupted;
    setProtection(interrupted);
    desktopBridge.protectionStateChanged({
      protected: interrupted.protected,
      observation: interrupted.observation,
    });
    setMessage("Reconnecting the camera after the computer resumed…");

    let attempt = 0;
    try {
      if (desktopPlatform === "macos") {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      while (
        phaseRef.current === "enrolling" ||
        phaseRef.current === "monitoring"
      ) {
        attempt += 1;
        try {
          const stream = await openCameraStream(5_000);
          const stillActive =
            phaseRef.current === "enrolling" ||
            phaseRef.current === "monitoring";
          if (!stillActive) {
            stopMediaStream(stream);
            if (streamRef.current === stream) streamRef.current = null;
            if (videoRef.current?.srcObject === stream) {
              videoRef.current.srcObject = null;
            }
            return;
          }
          setMessage("");
          desktopBridge.technicalLog({
            event: "camera-recovered-after-resume",
            phase: phaseRef.current,
          });
          return;
        } catch {
          if (attempt === 1) {
            desktopBridge.technicalLog({
              event: "camera-recovery-retrying",
              phase: phaseRef.current,
              reason: "camera-not-ready-after-resume",
            });
          }
          await new Promise((resolve) =>
            window.setTimeout(resolve, Math.min(attempt * 500, 2_500)),
          );
        }
      }
    } finally {
      cameraRecoveryRunningRef.current = false;
    }
  }, [desktopBridge, desktopPlatform, openCameraStream]);

  useEffect(() => {
    if (!desktopBridge) return;
    return desktopBridge.onSystemResume((reason) => {
      void recoverCameraAfterResume(reason);
    });
  }, [desktopBridge, recoverCameraAfterResume]);

  const monitorOnce = useCallback(async () => {
    if (
      detectionRunningRef.current ||
      phaseRef.current !== "monitoring" ||
      !videoRef.current ||
      !engineRef.current ||
      samplesRef.current.length < ENROLMENT_SAMPLES
    ) {
      return;
    }

    detectionRunningRef.current = true;
    try {
      let confirmRecoveryImmediately = false;
      do {
        const startedAt = performance.now();
        const result = await engineRef.current.detect(videoRef.current);
        const embeddingsComplete = result.face.every(
          (face) => face.embedding && face.embedding.length > 0,
        );
        const similarities = result.face
          .filter((face) => face.embedding)
          .map((face) =>
            averageBestTemplateSimilarities(
              samplesRef.current,
              face.embedding!,
              (template, candidate) =>
                engineRef.current!.match.similarity(template, candidate),
              FACEGUARD_CONFIG.recognition.bestTemplateMatches,
            ),
          );
        const bestSimilarity = similarities.length
          ? Math.max(...similarities)
          : 0;
        const previous = protectionRef.current;
        const frameQuality = readVideoFrameQuality(
          videoRef.current,
          qualityCanvasRef,
          result.face[0]?.box,
        );
        const qualitySufficient =
          result.face.length !== 1 ||
          (frameQuality.acceptable &&
            hasMinimumFaceSize(
              result.face[0].box,
              FACEGUARD_CONFIG.quality.monitoringMinimumFaceSizePx,
            ));
        const observation = classifyObservation({
          faceCount: result.face.length,
          bestSimilarity,
          embeddingsComplete,
          qualitySufficient,
          threshold: recognitionThresholdFor(previous),
        });
        if (observation !== previous.observation) {
          observationStartedAtRef.current = startedAt;
        }
        const next = advanceProtection(previous, observation);
        if (
          next.observation !== previous.observation ||
          next.protected !== previous.protected
        ) {
          const details = {
            observation: next.observation,
            protected: next.protected,
            latencyMs: Math.round(performance.now() - startedAt),
            similarity: Math.round(bestSimilarity * 1_000) / 1_000,
            transitionMs:
              next.protected !== previous.protected &&
              observationStartedAtRef.current !== null
                ? Math.round(performance.now() - observationStartedAtRef.current)
                : undefined,
          };
          logTechnicalEvent("renderer", "state-transition", details);
          desktopBridge?.technicalLog({ event: "state-transition", ...details });
        }
        protectionRef.current = next;
        setProtection(next);
        setLastCheckMs(Math.round(performance.now() - startedAt));
        confirmRecoveryImmediately = shouldConfirmRecoveryImmediately(next);
      } while (
        confirmRecoveryImmediately &&
        phaseRef.current === "monitoring"
      );
    } catch {
      const next = advanceProtection(protectionRef.current, "uncertain");
      protectionRef.current = next;
      setProtection(next);
    } finally {
      detectionRunningRef.current = false;
    }
  }, [desktopBridge]);

  const beginMonitoring = useCallback(() => {
    const initial = { ...POST_ENROLMENT_PROTECTION };
    protectionRef.current = initial;
    setProtection(initial);
    updatePhase("monitoring");
    desktopBridge?.sessionStarted();
    window.setTimeout(() => void monitorOnce(), 0);
    timerRef.current = setInterval(
      () => void monitorOnce(),
      MONITOR_INTERVAL_MS,
    );
  }, [desktopBridge, monitorOnce, updatePhase]);

  const captureSample = useCallback(async () => {
    if (
      detectionRunningRef.current ||
      !videoRef.current ||
      !engineRef.current
    ) {
      return;
    }

    detectionRunningRef.current = true;
    setEnrolmentError("");
    try {
      const result = await engineRef.current.detect(videoRef.current);
      const decision = evaluateEnrolmentFaces(
        result.face,
        FACEGUARD_CONFIG.recognition.enrolmentBoxScore,
        FACEGUARD_CONFIG.enrolment.minimumFaceSizePx,
      );
      if (!decision.accepted) {
        setEnrolmentError(
          decision.reason === "no-face"
            ? "No clear face detected. Face the camera in even lighting and try again."
            : decision.reason === "multiple-faces"
              ? "More than one face detected. Enrolment requires the authorised user to be alone."
              : decision.reason === "face-too-small"
                ? "Your face is too small in the frame. Move closer to the camera and try again."
              : "The photo was not clear enough. Move slightly closer and try again.",
        );
        return;
      }

      const frameQuality = readVideoFrameQuality(
        videoRef.current,
        qualityCanvasRef,
        result.face[0]?.box,
      );
      if (!frameQuality.acceptable) {
        setEnrolmentError(
          frameQuality.reason === "blurred"
            ? "This photo looks blurred. Hold still, turn your head to the marker, and try again."
            : "The lighting is not clear enough. Use even front lighting and try again.",
        );
        return;
      }

      const duplicateSimilarity = samplesRef.current.length
        ? Math.max(
            ...samplesRef.current.map((sample) =>
              engineRef.current!.match.similarity(sample, decision.embedding),
            ),
          )
        : 0;
      if (
        duplicateSimilarity >=
        FACEGUARD_CONFIG.enrolment.maximumDuplicateSimilarity
      ) {
        setEnrolmentError(
          "This angle is too similar to an earlier photo. Turn your head—not only your eyes—towards the red marker and try again.",
        );
        return;
      }

      samplesRef.current.push(decision.embedding);
      setEnrolmentError("");
      const count = samplesRef.current.length;
      setSampleCount(count);

      if (count >= ENROLMENT_SAMPLES) {
        setMessage("");
        beginMonitoring();
      } else {
        setMessage("");
      }
    } catch {
      setEnrolmentError(
        "The local face check failed. Keep the camera clear and try again.",
      );
    } finally {
      detectionRunningRef.current = false;
    }
  }, [beginMonitoring]);

  useEffect(() => {
    if (!desktopBridge) return;
    return desktopBridge.onEnrolmentMarkerClicked(() => {
      void captureSample();
    });
  }, [captureSample, desktopBridge]);

  useEffect(() => {
    if (!desktopBridge) return;
    return desktopBridge.onEnrolmentMarkerModeChanged((mode) => {
      setUsesExternalEnrolmentMarker(mode.external);
      setShowsOtherScreenCue(mode.otherDisplay);
    });
  }, [desktopBridge]);

  useEffect(() => {
    if (!desktopBridge) return;
    if (phase !== "enrolling") {
      desktopBridge.hideEnrolmentMarker();
      return;
    }

    let active = true;
    void desktopBridge
      .showEnrolmentMarker({
        position: currentPhotoDirection.position,
        label: currentPhotoDirection.label,
        photoNumber: sampleCount + 1,
        error: enrolmentError || undefined,
      })
      .then((mode) => {
        if (!active) return;
        setUsesExternalEnrolmentMarker(mode.external);
        setShowsOtherScreenCue(mode.otherDisplay);
      });
    return () => {
      active = false;
    };
  }, [
    currentPhotoDirection.label,
    currentPhotoDirection.position,
    desktopBridge,
    enrolmentError,
    phase,
    sampleCount,
  ]);

  useEffect(() => {
    if (!desktopBridge) return;
    return () => desktopBridge.hideEnrolmentMarker();
  }, [desktopBridge]);

  const restart = useCallback(() => {
    updatePhase("intro");
    setMessage("");
    setEnrolmentError("");
  }, [updatePhase]);

  const stateCopy = STATE_COPY[protection.observation];
  const cameraStatusTone =
    protection.observation === "safe"
      ? "safe"
      : protection.observation === "extra-viewer" ||
          protection.observation === "unmatched-viewer"
        ? "danger"
        : "warning";
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
      </header>

      <section className="hero" id="top">
        <div className="hero-heading">
          <p className="eyebrow">Active-session privacy</p>
          <h1>Your screen should know when to look away.</h1>
        </div>
        <div className="hero-copy">
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
                processed locally and never saved. {isDesktop
                  ? "Your chosen decoy is stored only on this device."
                  : "Your custom decoy remains only in this browser session."}
              </p>
              <div className="decoy-picker">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={decoyImageSrc} alt="Selected decoy preview" />
                <div className="decoy-picker-copy">
                  <span>Protection image</span>
                  <strong>
                    {customDecoy ? customDecoy.name : "Default image"}
                  </strong>
                  <p>
                    {customDecoy
                      ? "Custom image saved locally for future sessions."
                      : "Use the supplied image or choose your own."}
                  </p>
                  <div className="decoy-picker-actions">
                    <label className="file-button" htmlFor="decoy-file">
                      Choose own picture
                    </label>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      id="decoy-file"
                      onChange={chooseDecoyImage}
                      type="file"
                    />
                    {customDecoy && (
                      <button className="text-button" onClick={useDefaultDecoy}>
                        Use default
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
                Be alone in frame and turn your head towards each red marker —
                do not follow it only with your eyes. Five different views
                remain as temporary session descriptors.
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
            <section className="protection-preferences" aria-live="polite">
              <header className="protection-preferences-titlebar">
                <strong>Control panel</strong>
              </header>

              <div className="protection-preference-row">
                <div className="preference-state-copy">
                  <span
                    className={`preference-state-icon ${protectionPaused ? "paused" : "active"}`}
                    aria-hidden="true"
                  >
                    {protectionPaused ? "Ⅱ" : "✓"}
                  </span>
                  <div>
                    <strong>
                      {protectionPaused ? "Protection paused" : "Active protection"}
                    </strong>
                    <p>
                      {pauseMode === "timed"
                        ? <>
                            Automatic restore in{" "}
                            <strong className="pause-countdown">
                              {formatPauseCountdown(pauseSecondsRemaining)}
                            </strong>
                          </>
                        : pauseMode === "manual"
                          ? "Paused until you restore protection"
                          : "Screen concealment is ready"}
                    </p>
                  </div>
                </div>
                <div className="preference-segmented-actions">
                  <button
                    className={protectionPaused ? "selected" : undefined}
                    onClick={toggleManualProtectionPause}
                  >
                    {protectionPaused ? "Restore now" : "Pause protection"}
                  </button>
                  <button onClick={pauseProtectionForTenMinutes}>
                    Pause for 10 mins
                  </button>
                </div>
              </div>

              <div className="protection-preference-row">
                <div className="preference-state-copy">
                  <span
                    className={`preference-state-icon camera ${cameraStatusTone}`}
                    aria-hidden="true"
                  >
                    ●
                  </span>
                  <div>
                    <strong>{stateCopy.label}</strong>
                    <p>
                      {protectionPaused
                        ? "Camera monitoring remains active"
                        : stateCopy.detail}
                    </p>
                  </div>
                </div>
                <div className="preference-segmented-actions session-actions">
                  {!isDesktop && !isFullscreen && (
                    <button onClick={enterFullscreen}>Full screen</button>
                  )}
                  {isDesktop && (
                    <button onClick={() => desktopBridge?.hideControlWindow()}>
                      {desktopPlatform === "windows"
                        ? "Hide to system tray"
                        : "Hide to menu bar"}
                    </button>
                  )}
                  <button onClick={endSession}>End session</button>
                </div>
              </div>
            </section>
          )}

          {phase === "ended" && (
            <div className="ended-card">
              <p className="eyebrow">Session cleared</p>
              <h2>Camera stopped. Enrolment removed.</h2>
              <p>
                The in-memory face descriptors have been discarded. Start again
                whenever you need a new private session.
              </p>
              <button className="primary-button" onClick={restart}>
                Return to start
              </button>
            </div>
          )}

          {message && phase !== "enrolling" && (
            <p className="inline-message" role="alert">{message}</p>
          )}
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
          <li><span>02</span><strong>Enrol</strong><p>Five guided photos remain as temporary session descriptors in memory.</p></li>
          <li><span>03</span><strong>Protect</strong><p>Unsafe or uncertain viewing conditions conceal the workspace.</p></li>
          <li><span>04</span><strong>Clear</strong><p>Ending the session stops the camera and removes all descriptors.</p></li>
        </ol>
      </section>

      <footer>
        <p>
          {isDesktop
            ? `Desktop prototype — protection is provided by native ${desktopPlatform === "windows" ? "Windows" : "macOS"} overlay windows.`
            : "Browser prototype — protects this FaceGuard workspace, not other applications or browser tabs."}
        </p>
        <span>No uploads · No database · No account</span>
      </footer>

      {phase === "enrolling" && !usesExternalEnrolmentMarker && (
        <div
          className={`gaze-target ${currentPhotoDirection.position}`}
          aria-live="polite"
        >
          <button
            aria-label={`Take photo ${sampleCount + 1} while looking ${currentPhotoDirection.label}`}
            className="gaze-trigger"
            onClick={captureSample}
            type="button"
          >
            <span className="gaze-dot" aria-hidden="true" />
          </button>
          <div
            className={`gaze-message${enrolmentError ? " gaze-feedback" : ""}`}
            role={enrolmentError ? "alert" : undefined}
          >
            <strong>
              {enrolmentError || "Turn your head toward the red spot and click"}
            </strong>
            <small>
              {enrolmentError ? "Please check · " : ""}
              Photo {sampleCount + 1} · {currentPhotoDirection.label}
            </small>
          </div>
        </div>
      )}

      {phase === "enrolling" && showsOtherScreenCue && (
        <div
          className={`external-marker-cue ${currentPhotoDirection.position.endsWith("left") ? "left" : "right"}`}
          aria-live="polite"
        >
          <svg
            aria-hidden="true"
            className="external-marker-arrow"
            viewBox="0 0 300 112"
          >
            <path
              className="external-marker-arrow-shape"
              d="M18 56L105 8L98 35H282V77H98L105 104Z"
            />
          </svg>
          <strong>Look to the other screen</strong>
          <span>The red marker is displayed there</span>
        </div>
      )}

      {!isDesktop &&
        phase === "monitoring" &&
        protection.protected &&
        !protectionPaused && (
        <div className="decoy-overlay" role="dialog" aria-modal="true" aria-label="Protected workspace">
          {/* The same static asset is used by the Vite/Electron renderer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="decoy-image"
            src={decoyImageSrc}
            alt="Selected FaceGuard decoy"
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
