import type { ViewingState } from "../core/protection-state.ts";
import type { DesktopPlatform } from "./platform.ts";

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
};
