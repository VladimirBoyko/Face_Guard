import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type DecoyImageMessage,
  type EnrolmentMarkerMessage,
  type EnrolmentMarkerMode,
  type FaceGuardDesktopBridge,
  type ProtectionStateMessage,
  type RendererTechnicalLog,
  type SystemRecoveryReason,
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
  onSystemResume: (callback: (reason: SystemRecoveryReason) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      reason: SystemRecoveryReason,
    ) => callback(reason);
    ipcRenderer.on(IPC.systemResume, listener);
    return () => ipcRenderer.removeListener(IPC.systemResume, listener);
  },
  showEnrolmentMarker: (message: EnrolmentMarkerMessage) =>
    ipcRenderer.invoke(IPC.enrolmentMarker, message),
  hideEnrolmentMarker: () => ipcRenderer.send(IPC.hideEnrolmentMarker),
  onEnrolmentMarkerClicked: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.enrolmentMarkerClicked, listener);
    return () => ipcRenderer.removeListener(IPC.enrolmentMarkerClicked, listener);
  },
  onEnrolmentMarkerModeChanged: (callback: (mode: EnrolmentMarkerMode) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode: EnrolmentMarkerMode) =>
      callback(mode);
    ipcRenderer.on(IPC.enrolmentMarkerMode, listener);
    return () => ipcRenderer.removeListener(IPC.enrolmentMarkerMode, listener);
  },
};

contextBridge.exposeInMainWorld("faceGuardDesktop", bridge);
