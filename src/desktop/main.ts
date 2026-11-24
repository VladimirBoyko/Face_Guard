import path from "node:path";
import squirrelStartup from "electron-squirrel-startup";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerMonitor,
  session,
  systemPreferences,
} from "electron";
import { logTechnicalEvent, setTechnicalLogSink } from "../core/logger.ts";
import type { ViewingState } from "../core/protection-state.ts";
import {
  IPC,
  type DecoyImageMessage,
  type ProtectionStateMessage,
  type RendererTechnicalLog,
} from "./ipc-contract.ts";
import { OverlayManager } from "./overlay-manager.ts";
import { EnrolmentMarkerManager } from "./enrolment-marker-manager.ts";
import { appendDiagnosticLog, showDiagnosticLog } from "./diagnostic-log.ts";
import { shouldGrantMediaPermission } from "./permissions.ts";
import { FaceGuardTray } from "./tray.ts";
import {
  clearSavedDecoy,
  loadSavedDecoy,
  saveDecoy,
} from "./decoy-store.ts";
import {
  isDecoyImageMessage,
  isEnrolmentMarkerMessage,
  isProtectionStateMessage,
  sanitiseRendererLog,
} from "./validation.ts";

let controlWindow: BrowserWindow | null = null;
let overlayManager: OverlayManager | null = null;
let enrolmentMarkerManager: EnrolmentMarkerManager | null = null;
let tray: FaceGuardTray | null = null;
let sessionActive = false;
let currentObservation: ViewingState = "uncertain";
let isQuitting = false;
let quitFallback: ReturnType<typeof setTimeout> | null = null;
const isSquirrelStartup = process.platform === "win32" && squirrelStartup;
const isSquirrelFirstRun =
  process.platform === "win32" &&
  process.argv.includes("--squirrel-firstrun");
if (isSquirrelStartup) app.quit();
const hasSingleInstanceLock =
  !isSquirrelStartup && app.requestSingleInstanceLock();

function isControlSender(senderId: number): boolean {
  return controlWindow?.webContents.id === senderId;
}

function stateLabel(): string {
  if (!sessionActive) return "Ready";
  if (currentObservation === "safe") return "Monitoring · Safe";
  if (currentObservation === "extra-viewer") return "Protected · Extra viewer";
  if (currentObservation === "unmatched-viewer") {
    return "Protected · Unrecognised viewer";
  }
  if (currentObservation === "absent") return "Protected · User absent";
  return "Protected · Uncertain";
}

function updateTray(): void {
  tray?.update(
    sessionActive,
    stateLabel(),
    overlayManager?.isManualTestActive() ?? false,
  );
}

function protectForSystemInterruption(reason: "suspend" | "lock-screen"): void {
  if (!sessionActive) return;
  currentObservation = "uncertain";
  overlayManager?.setProtection(true, "uncertain");
  updateTray();
  logTechnicalEvent("desktop", "system-interruption-fail-closed", {
    observation: "uncertain",
    protected: true,
    reason,
  });
}

function recoverAfterSystemResume(reason: "resume" | "unlock-screen"): void {
  if (!sessionActive) return;
  const unlockedByUser = reason === "unlock-screen";
  currentObservation = unlockedByUser ? "safe" : "uncertain";
  overlayManager?.setProtection(!unlockedByUser, currentObservation);
  updateTray();
  controlWindow?.webContents.send(IPC.systemResume, reason);
  logTechnicalEvent("desktop", "camera-recovery-requested", {
    observation: currentObservation,
    protected: !unlockedByUser,
    reason,
  });
}

function showControlWindow(): void {
  if (!controlWindow || controlWindow.isDestroyed()) return;
  controlWindow.show();
  controlWindow.focus();
}

function requestSessionEnd(): void {
  if (!controlWindow || controlWindow.isDestroyed()) {
    finishSession();
    return;
  }
  controlWindow.webContents.send(IPC.requestSessionEnd);
}

function finishSession(): void {
  sessionActive = false;
  currentObservation = "uncertain";
  overlayManager?.endSession();
  enrolmentMarkerManager?.hide();
  updateTray();
  logTechnicalEvent("desktop", "session-ended");
  if (isQuitting) {
    exitApplication();
  }
}

function exitApplication(): void {
  if (quitFallback) {
    clearTimeout(quitFallback);
    quitFallback = null;
  }

  try {
    tray?.destroy();
  } catch {
    // Continue to process termination even if macOS has already removed it.
  } finally {
    tray = null;
  }
  try {
    overlayManager?.dispose();
  } catch {
    // Continue so a damaged overlay cannot keep FaceGuard alive.
  } finally {
    overlayManager = null;
  }
  try {
    enrolmentMarkerManager?.dispose();
  } catch {
    // Continue so an enrolment marker cannot keep FaceGuard alive.
  } finally {
    enrolmentMarkerManager = null;
  }
  try {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.destroy();
    }
  } catch {
    // Continue so a damaged hidden window cannot keep FaceGuard alive.
  } finally {
    controlWindow = null;
    // app.exit is intentionally placed in the final cleanup block so a
    // failure in tray, overlay, or hidden-window disposal cannot leave a
    // background FaceGuard process running.
    app.exit(0);
  }
}

function requestQuit(): void {
  if (isQuitting) return;
  isQuitting = true;
  overlayManager?.hideAll();
  enrolmentMarkerManager?.hide();
  if (sessionActive && controlWindow && !controlWindow.isDestroyed()) {
    requestSessionEnd();
    quitFallback = setTimeout(exitApplication, 1_000);
  } else {
    exitApplication();
  }
}

function createControlWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 880,
    minHeight: 680,
    show: false,
    title: "FaceGuard 2.0",
    backgroundColor: "#f5f7f3",
    icon:
      process.platform === "win32"
        ? path.join(app.getAppPath(), "assets", "FaceGuard.ico")
        : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("render-process-gone", (_event, details) => {
    if (sessionActive) {
      currentObservation = "uncertain";
      overlayManager?.setProtection(true, "uncertain");
      updateTray();
      logTechnicalEvent("desktop", "renderer-lost-fail-closed", {
        observation: "uncertain",
        protected: true,
        reason: details.reason,
      });
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
    if (isSquirrelFirstRun) {
      void dialog.showMessageBox(window, {
        type: "info",
        title: "FaceGuard installed",
        message: "FaceGuard installed successfully",
        detail:
          "FaceGuard is ready to use and is available from the Windows Start menu.",
        buttons: ["Start FaceGuard"],
        defaultId: 0,
        noLink: true,
      });
    }
  });
  return window;
}

function configurePermissions(): void {
  const isTrusted = (webContentsId: number) => isControlSender(webContentsId);
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) =>
      Boolean(webContents && isTrusted(webContents.id) && permission === "media"),
  );
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details ? details.mediaTypes : [];
      callback(
        shouldGrantMediaPermission(
          isTrusted(webContents.id),
          permission,
          mediaTypes,
        ),
      );
    },
  );
}

function registerIpc(): void {
  ipcMain.handle(IPC.cameraPermission, async (event) => {
    if (!isControlSender(event.sender.id)) return false;
    if (process.platform !== "darwin") return true;
    const status = systemPreferences.getMediaAccessStatus("camera");
    if (status === "granted") return true;
    if (status === "denied" || status === "restricted") return false;
    return systemPreferences.askForMediaAccess("camera");
  });

  ipcMain.on(IPC.sessionStarted, (event) => {
    if (!isControlSender(event.sender.id)) return;
    sessionActive = true;
    currentObservation = "safe";
    overlayManager?.setProtection(false, "safe");
    updateTray();
    logTechnicalEvent("desktop", "session-started", {
      observation: "safe",
      protected: false,
    });
  });

  ipcMain.on(IPC.protectionState, (event, message: ProtectionStateMessage) => {
    if (!isControlSender(event.sender.id)) return;
    if (!isProtectionStateMessage(message)) return;
    currentObservation = message.observation;
    overlayManager?.setProtection(message.protected, message.observation);
    updateTray();
  });

  ipcMain.handle(IPC.decoyImage, async (event, message: DecoyImageMessage) => {
    if (!isControlSender(event.sender.id)) return false;
    if (!isDecoyImageMessage(message)) return false;
    overlayManager?.setDecoyImage(message.dataUrl);
    if (message.dataUrl === null) return clearSavedDecoy();
    return saveDecoy(message.dataUrl, message.name ?? "Custom image");
  });
  ipcMain.handle(IPC.loadDecoyImage, (event) =>
    isControlSender(event.sender.id) ? loadSavedDecoy() : null,
  );

  ipcMain.on(IPC.sessionEnded, (event) => {
    if (!isControlSender(event.sender.id)) return;
    finishSession();
  });
  ipcMain.handle(IPC.enrolmentMarker, (event, message: unknown) => {
    if (!isControlSender(event.sender.id)) return false;
    if (!isEnrolmentMarkerMessage(message)) return false;
    return enrolmentMarkerManager?.show(message) ?? false;
  });
  ipcMain.on(IPC.hideEnrolmentMarker, (event) => {
    if (isControlSender(event.sender.id)) enrolmentMarkerManager?.hide();
  });
  ipcMain.on(IPC.hideControlWindow, (event) => {
    if (isControlSender(event.sender.id)) controlWindow?.hide();
  });
  ipcMain.on(IPC.technicalLog, (event, message: RendererTechnicalLog) => {
    if (!isControlSender(event.sender.id)) return;
    const safeMessage = sanitiseRendererLog(message);
    if (!safeMessage) return;
    const { event: rendererEvent, ...details } = safeMessage;
    logTechnicalEvent("renderer", rendererEvent, details);
  });
}

app.whenReady().then(() => {
  if (isSquirrelStartup) {
    app.quit();
    return;
  }
  if (!hasSingleInstanceLock) {
    app.exit(0);
    return;
  }
  setTechnicalLogSink(appendDiagnosticLog);
  if (process.platform === "darwin") app.dock?.hide();
  if (process.platform === "win32") {
    app.setAppUserModelId("au.edu.torrens.faceguard.prototype");
  }
  controlWindow = createControlWindow();
  enrolmentMarkerManager = new EnrolmentMarkerManager(
    () => controlWindow?.webContents.send(IPC.enrolmentMarkerClicked),
    () => controlWindow,
    (mode) =>
      controlWindow?.webContents.send(IPC.enrolmentMarkerMode, mode),
  );
  enrolmentMarkerManager.initialise();
  configurePermissions();
  registerIpc();
  powerMonitor.on("suspend", () => protectForSystemInterruption("suspend"));
  powerMonitor.on("lock-screen", () =>
    protectForSystemInterruption("lock-screen"),
  );
  powerMonitor.on("resume", () => recoverAfterSystemResume("resume"));
  powerMonitor.on("unlock-screen", () =>
    recoverAfterSystemResume("unlock-screen"),
  );
  overlayManager = new OverlayManager();
  overlayManager.initialise();
  if (process.argv.includes("--faceguard-test-overlay")) {
    overlayManager.setManualTest(true);
    logTechnicalEvent("desktop", "manual-overlay-test-enabled", {
      protected: true,
    });
  }
  tray = new FaceGuardTray({
    showControlWindow,
    endSession: requestSessionEnd,
    toggleTestOverlay: () => {
      const next = !(overlayManager?.isManualTestActive() ?? false);
      overlayManager?.setManualTest(next);
      updateTray();
    },
    showDiagnosticLog,
    quit: requestQuit,
  });
  updateTray();
  logTechnicalEvent("desktop", "app-ready", {
    displayCount: overlayManager.displayCount(),
  });
});

app.on("second-instance", showControlWindow);
app.on("activate", showControlWindow);
app.on("window-all-closed", () => {
  // FaceGuard remains available from the macOS menu bar or Windows tray.
});
app.on("before-quit", () => {
  isQuitting = true;
  overlayManager?.hideAll();
  enrolmentMarkerManager?.hide();
});
app.on("will-quit", () => {
  setTechnicalLogSink(null);
  tray?.destroy();
  overlayManager?.dispose();
  enrolmentMarkerManager?.dispose();
});
