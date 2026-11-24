import { BrowserWindow, screen } from "electron";
import type {
  EnrolmentMarkerMessage,
  EnrolmentMarkerMode,
} from "./ipc-contract.ts";
import {
  enrolmentMarkerPlacement,
  markerIsOnDifferentDisplay,
} from "./enrolment-marker-position.ts";

const CAPTURE_URL = "faceguard-marker://capture";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function markerDocument(message: EnrolmentMarkerMessage): string {
  const feedback = Boolean(message.error);
  const headline = escapeHtml(
    message.error || "Turn your head toward the red spot and click",
  );
  const detail = `${feedback ? "Please check · " : ""}Photo ${message.photoNumber} · ${escapeHtml(message.label)}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><title>FaceGuard enrolment marker</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; navigate-to faceguard-marker:">
<style>
html,body{height:100%;margin:0;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{position:relative;color:#fff}
.trigger{position:absolute;width:78px;height:78px;display:flex;align-items:center;justify-content:center;text-decoration:none}
.dot{display:block;width:48px;height:48px;border:6px solid rgba(255,255,255,.97);border-radius:50%;background:#ef2e1c;box-shadow:0 0 0 10px rgba(239,46,28,.4);animation:pulse 1.1s ease-out infinite}
.message{position:absolute;width:min(340px,calc(100% - 98px));box-sizing:border-box;padding:18px 20px;border:2px solid rgba(255,255,255,.94);border-radius:12px;background:#e52c1c;box-shadow:0 14px 34px rgba(71,14,8,.32)}
.message strong{display:block;font-size:21px;line-height:1.28}.message small{display:block;margin-top:10px;font-size:13px;font-weight:760;letter-spacing:.04em;opacity:.84;text-transform:uppercase}
body.feedback .message{width:min(520px,calc(100% - 98px));padding:22px 24px;border:3px solid #e52c1c;background:#fff4f1;color:#7d241c;box-shadow:0 18px 44px rgba(71,14,8,.38)}
body.feedback .message strong{font-size:23px;line-height:1.34}body.feedback .message small{font-size:13px;color:#a4362c;opacity:1}
body.upper-left .trigger{left:0;top:0}body.upper-left .message{left:88px;top:88px}
body.upper-right .trigger{right:0;top:0}body.upper-right .message{right:88px;top:88px}
body.lower-left .trigger{bottom:0;left:0}body.lower-left .message{bottom:88px;left:88px}
body.lower-right .trigger{bottom:0;right:0}body.lower-right .message{bottom:88px;right:88px}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(239,46,28,.72);transform:scale(1)}45%{transform:scale(1.14)}75%{box-shadow:0 0 0 24px rgba(239,46,28,0)}100%{box-shadow:0 0 0 0 rgba(239,46,28,0);transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.dot{animation:none}}
</style></head><body class="${message.position}${feedback ? " feedback" : ""}">
<a class="trigger" href="${CAPTURE_URL}" aria-label="Take photo ${message.photoNumber} while looking ${escapeHtml(message.label)}"><span class="dot" aria-hidden="true"></span></a>
<div class="message" ${feedback ? 'role="alert"' : ""}><strong>${headline}</strong><small>${detail}</small></div>
</body></html>`;
}

function dataUrl(html: string): string {
  return `data:text/html;base64,${Buffer.from(html).toString("base64")}`;
}

export class EnrolmentMarkerManager {
  private markerWindow: BrowserWindow | null = null;
  private message: EnrolmentMarkerMessage | null = null;
  private mode: EnrolmentMarkerMode = {
    external: false,
    otherDisplay: false,
  };

  constructor(
    private readonly onCapture: () => void,
    private readonly getControlWindow: () => BrowserWindow | null,
    private readonly onModeChanged: (mode: EnrolmentMarkerMode) => void,
  ) {}

  initialise(): void {
    screen.on("display-added", this.reconcileDisplays);
    screen.on("display-removed", this.reconcileDisplays);
    screen.on("display-metrics-changed", this.reconcileDisplays);
  }

  dispose(): void {
    screen.removeListener("display-added", this.reconcileDisplays);
    screen.removeListener("display-removed", this.reconcileDisplays);
    screen.removeListener("display-metrics-changed", this.reconcileDisplays);
    this.destroyWindow();
    this.message = null;
    this.setMode({ external: false, otherDisplay: false });
  }

  show(message: EnrolmentMarkerMessage): EnrolmentMarkerMode {
    this.message = message;
    return this.reconcile();
  }

  hide(): void {
    this.message = null;
    this.destroyWindow();
    this.setMode({ external: false, otherDisplay: false });
  }

  private readonly reconcileDisplays = (): void => {
    this.reconcile();
  };

  private reconcile(): EnrolmentMarkerMode {
    if (!this.message) {
      this.hide();
      return this.mode;
    }
    const displays = screen.getAllDisplays();
    const workAreas = displays.map((display) => display.workArea);
    const placement = enrolmentMarkerPlacement(
      workAreas,
      this.message.position,
    );
    if (!placement) {
      this.destroyWindow();
      this.setMode({ external: false, otherDisplay: false });
      return this.mode;
    }

    const markerWindow = this.ensureWindow();
    markerWindow.setBounds(placement.bounds);
    void markerWindow
      .loadURL(dataUrl(markerDocument(this.message)))
      .then(() => {
        if (!markerWindow.isDestroyed()) markerWindow.showInactive();
      })
      .catch(() => {
        // A new photo, display change, or session end may replace/destroy the
        // marker while its tiny data document is still loading.
      });
    const controlWindow = this.getControlWindow();
    this.setMode({
      external: true,
      otherDisplay: markerIsOnDifferentDisplay(
        workAreas,
        placement.bounds,
        controlWindow && !controlWindow.isDestroyed()
          ? controlWindow.getBounds()
          : null,
      ),
    });
    return this.mode;
  }

  private ensureWindow(): BrowserWindow {
    if (this.markerWindow && !this.markerWindow.isDestroyed()) {
      return this.markerWindow;
    }
    const markerWindow = new BrowserWindow({
      show: false,
      title: "FaceGuard enrolment marker",
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      focusable: false,
      fullscreenable: false,
      movable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    markerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    markerWindow.webContents.on("will-navigate", (event, url) => {
      if (url !== CAPTURE_URL) return;
      event.preventDefault();
      this.onCapture();
    });
    if (process.platform === "darwin") {
      markerWindow.setAlwaysOnTop(true, "screen-saver");
      markerWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
      markerWindow.setHiddenInMissionControl(true);
    } else {
      markerWindow.setAlwaysOnTop(true);
    }
    this.markerWindow = markerWindow;
    return markerWindow;
  }

  private destroyWindow(): void {
    if (this.markerWindow && !this.markerWindow.isDestroyed()) {
      this.markerWindow.destroy();
    }
    this.markerWindow = null;
  }

  private setMode(mode: EnrolmentMarkerMode): void {
    if (
      this.mode.external === mode.external &&
      this.mode.otherDisplay === mode.otherDisplay
    ) {
      return;
    }
    this.mode = mode;
    this.onModeChanged(mode);
  }
}
