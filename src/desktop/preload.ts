import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type FaceGuardDesktopBridge,
  type ProtectionStateMessage,
  type RendererTechnicalLog,
} from "./ipc-contract.ts";

const bridge: FaceGuardDesktopBridge = {
  isDesktop: true,
  requestCameraPermission: () => ipcRenderer.invoke(IPC.cameraPermission),
  sessionStarted: () => ipcRenderer.send(IPC.sessionStarted),
  protectionStateChanged: (message: ProtectionStateMessage) =>
    ipcRenderer.send(IPC.protectionState, message),
  sessionEnded: () => ipcRenderer.send(IPC.sessionEnded),
  hideControlWindow: () => ipcRenderer.send(IPC.hideControlWindow),
  technicalLog: (message: RendererTechnicalLog) =>
    ipcRenderer.send(IPC.technicalLog, message),
  onSessionEndRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.requestSessionEnd, listener);
    return () => ipcRenderer.removeListener(IPC.requestSessionEnd, listener);
  },
};

contextBridge.exposeInMainWorld("faceGuardDesktop", bridge);
