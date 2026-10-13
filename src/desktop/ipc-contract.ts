import type { ViewingState } from "../core/protection-state.ts";

export const IPC = {
  cameraPermission: "faceguard:camera-permission",
  sessionStarted: "faceguard:session-started",
  protectionState: "faceguard:protection-state",
  sessionEnded: "faceguard:session-ended",
  requestSessionEnd: "faceguard:request-session-end",
  hideControlWindow: "faceguard:hide-control-window",
  technicalLog: "faceguard:technical-log",
} as const;

export type ProtectionStateMessage = {
  protected: boolean;
  observation: ViewingState;
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
  requestCameraPermission: () => Promise<boolean>;
  sessionStarted: () => void;
  protectionStateChanged: (message: ProtectionStateMessage) => void;
  sessionEnded: () => void;
  hideControlWindow: () => void;
  technicalLog: (message: RendererTechnicalLog) => void;
  onSessionEndRequested: (callback: () => void) => () => void;
};
