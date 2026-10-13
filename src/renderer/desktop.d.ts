import type { FaceGuardDesktopBridge } from "../desktop/ipc-contract.ts";

declare global {
  interface Window {
    faceGuardDesktop?: FaceGuardDesktopBridge;
  }
}

export {};
