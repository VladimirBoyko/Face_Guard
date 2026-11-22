import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type DecoyImageMessage,
  type FaceGuardDesktopBridge,
  type ProtectionStateMessage,
  type RendererTechnicalLog,
} from "./ipc-contract.ts";
import { desktopPlatform } from "./platform.ts";

const bridge: FaceGuardDesktopBridge = {
  isDesktop: true,
  platform: desktopPlatform(),
  requestCameraPermission: () => ipcRenderer.invoke(IPC.cameraPermission),
  sessionStarted: () => ipcRenderer.send(IPC.sessionStarted),
  protectionStateChanged: (message: ProtectionStateMessage) =>
    ipcRenderer.send(IPC.protectionState, message),
  decoyImageChanged: (message: DecoyImageMessage) =>
    ipcRenderer.invoke(IPC.decoyImage, message),
  loadSavedDecoyImage: () => ipcRenderer.invoke(IPC.loadDecoyImage),
  sessionEnded: () => ipcRenderer.send(IPC.sessionEnded),
  hideControlWindow: () => ipcRenderer.send(IPC.hideControlWindow),
  technicalLog: (message: RendererTechnicalLog) =>
    ipcRenderer.send(IPC.technicalLog, message),
  onSessionEndRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.requestSessionEnd, listener);
    return () => ipcRenderer.removeListener(IPC.requestSessionEnd, listener);
  },
  onSystemResume: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.systemResume, listener);
    return () => ipcRenderer.removeListener(IPC.systemResume, listener);
  },
};

contextBridge.exposeInMainWorld("faceGuardDesktop", bridge);
