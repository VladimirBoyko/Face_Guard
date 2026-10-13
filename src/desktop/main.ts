import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  systemPreferences,
} from "electron";
import { logTechnicalEvent } from "../core/logger.ts";
import type { ViewingState } from "../core/protection-state.ts";
import {
  IPC,
  type ProtectionStateMessage,
  type RendererTechnicalLog,
} from "./ipc-contract.ts";
import { OverlayManager } from "./overlay-manager.ts";
import { shouldGrantMediaPermission } from "./permissions.ts";
import { FaceGuardTray } from "./tray.ts";
import {
  isProtectionStateMessage,
  sanitiseRendererLog,
} from "./validation.ts";

let controlWindow: BrowserWindow | null = null;
let overlayManager: OverlayManager | null = null;
let tray: FaceGuardTray | null = null;
let sessionActive = false;
let currentObservation: ViewingState = "uncertain";
let isQuitting = false;
let quitFallback: ReturnType<typeof setTimeout> | null = null;

function isControlSender(senderId: number): boolean {
  return controlWindow?.webContents.id === senderId;
}

function stateLabel(): string {
  if (!sessionActive) return "Ready";
  if (currentObservation === "safe") return "Monitoring · Safe";
  if (currentObservation === "extra-viewer") return "Protected · Extra viewer";
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
  updateTray();
  logTechnicalEvent("desktop", "session-ended");
  if (isQuitting) {
    if (quitFallback) clearTimeout(quitFallback);
    app.quit();
  }
}

function requestQuit(): void {
  if (isQuitting) return;
  isQuitting = true;
  overlayManager?.hideAll();
  if (sessionActive && controlWindow && !controlWindow.isDestroyed()) {
    requestSessionEnd();
    quitFallback = setTimeout(() => app.quit(), 1_000);
  } else {
    app.quit();
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
  window.once("ready-to-show", () => window.show());
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

  ipcMain.on(IPC.sessionEnded, (event) => {
    if (!isControlSender(event.sender.id)) return;
    finishSession();
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
  if (process.platform === "darwin") app.dock?.hide();
  controlWindow = createControlWindow();
  configurePermissions();
  registerIpc();
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
    quit: requestQuit,
  });
  updateTray();
  logTechnicalEvent("desktop", "app-ready", {
    displayCount: overlayManager.displayCount(),
  });
});

app.on("activate", showControlWindow);
app.on("window-all-closed", () => {
  // FaceGuard remains available from the macOS menu bar.
});
app.on("before-quit", () => {
  isQuitting = true;
  overlayManager?.hideAll();
});
app.on("will-quit", () => {
  tray?.destroy();
  overlayManager?.dispose();
});
