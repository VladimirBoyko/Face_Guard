import type { ViewingState } from "../core/protection-state.ts";
import type { DesktopPlatform } from "./platform.ts";
import type { EnrolmentMarkerPosition } from "./enrolment-marker-position.ts";

export const IPC = {
  cameraPermission: "faceguard:camera-permission",
  sessionStarted: "faceguard:session-started",
  protectionState: "faceguard:protection-state",
  decoyImage: "faceguard:decoy-image",
  loadDecoyImage: "faceguard:load-decoy-image",
  sessionEnded: "faceguard:session-ended",
  requestSessionEnd: "faceguard:request-session-end",
  hideControlWindow: "faceguard:hide-control-window",
  technicalLog: "faceguard:technical-log",
  systemResume: "faceguard:system-resume",
  enrolmentMarker: "faceguard:enrolment-marker",
  hideEnrolmentMarker: "faceguard:hide-enrolment-marker",
  enrolmentMarkerClicked: "faceguard:enrolment-marker-clicked",
  enrolmentMarkerMode: "faceguard:enrolment-marker-mode",
} as const;

export type ProtectionStateMessage = {
  protected: boolean;
  observation: ViewingState;
};

export type DecoyImageMessage = {
  dataUrl: string | null;
  name?: string;
};

export type SavedDecoyImage = {
  dataUrl: string;
  name: string;
};

export type EnrolmentMarkerMessage = {
  position: EnrolmentMarkerPosition;
  label: string;
  photoNumber: number;
  error?: string;
};

export type EnrolmentMarkerMode = {
  external: boolean;
  otherDisplay: boolean;
};

export type RendererTechnicalLog = {
  event: string;
  observation?: ViewingState;
  protected?: boolean;
  latencyMs?: number;
  similarity?: number;
  transitionMs?: number;
  reason?: string;
  phase?: string;
};

export type FaceGuardDesktopBridge = {
  isDesktop: true;
  platform: DesktopPlatform;
  requestCameraPermission: () => Promise<boolean>;
  sessionStarted: () => void;
  protectionStateChanged: (message: ProtectionStateMessage) => void;
  decoyImageChanged: (message: DecoyImageMessage) => Promise<boolean>;
  loadSavedDecoyImage: () => Promise<SavedDecoyImage | null>;
  sessionEnded: () => void;
  hideControlWindow: () => void;
  technicalLog: (message: RendererTechnicalLog) => void;
  onSessionEndRequested: (callback: () => void) => () => void;
  onSystemResume: (callback: () => void) => () => void;
  showEnrolmentMarker: (
    message: EnrolmentMarkerMessage,
  ) => Promise<EnrolmentMarkerMode>;
  hideEnrolmentMarker: () => void;
  onEnrolmentMarkerClicked: (callback: () => void) => () => void;
  onEnrolmentMarkerModeChanged: (
    callback: (mode: EnrolmentMarkerMode) => void,
  ) => () => void;
};
