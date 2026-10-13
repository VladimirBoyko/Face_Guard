import { BrowserWindow, screen, type Display } from "electron";
import decoyImage from "../../public/decoy-government.png?inline";
import { logTechnicalEvent } from "../core/logger.ts";
import type { ViewingState } from "../core/protection-state.ts";

function overlayDocument(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><title>FaceGuard Protection</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>
html,body{height:100%;margin:0;overflow:hidden;background:#edf0f3;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
img{height:100%;width:100%;object-fit:cover;object-position:center top}
.status{position:fixed;left:18px;bottom:18px;padding:9px 12px;border-radius:999px;background:rgba(20,29,25,.88);color:#fff;font-size:11px;font-weight:700;letter-spacing:.02em;box-shadow:0 8px 30px rgba(0,0,0,.22)}
</style></head><body><img alt="Protected FaceGuard decoy" src="${decoyImage}"><div class="status">FaceGuard protection active · use the menu-bar icon to end the session</div></body></html>`;
}

function dataUrl(html: string): string {
  return `data:text/html;base64,${Buffer.from(html).toString("base64")}`;
}

export class OverlayManager {
  private readonly windows = new Map<number, BrowserWindow>();
  private protectedBySession = false;
  private manualTest = false;
  private observation: ViewingState = "uncertain";

  initialise(): void {
    this.reconcileDisplays();
    screen.on("display-added", this.reconcileDisplays);
    screen.on("display-removed", this.reconcileDisplays);
    screen.on("display-metrics-changed", this.reconcileDisplays);
  }

  dispose(): void {
    screen.removeListener("display-added", this.reconcileDisplays);
    screen.removeListener("display-removed", this.reconcileDisplays);
    screen.removeListener("display-metrics-changed", this.reconcileDisplays);
    for (const window of this.windows.values()) window.destroy();
    this.windows.clear();
  }

  setProtection(protectedState: boolean, observation: ViewingState): void {
    this.protectedBySession = protectedState;
    this.observation = observation;
    this.applyVisibility("session-state");
  }

  setManualTest(enabled: boolean): void {
    this.manualTest = enabled;
    this.applyVisibility("manual-test");
  }

  isManualTestActive(): boolean {
    return this.manualTest;
  }

  displayCount(): number {
    return this.windows.size;
  }

  endSession(): void {
    this.protectedBySession = false;
    this.observation = "uncertain";
    this.applyVisibility("session-ended");
  }

  hideAll(): void {
    this.protectedBySession = false;
    this.manualTest = false;
    this.applyVisibility("app-shutdown");
  }

  private readonly reconcileDisplays = (): void => {
    const displays = screen.getAllDisplays();
    const currentIds = new Set(displays.map((display) => display.id));

    for (const [id, window] of this.windows) {
      if (!currentIds.has(id)) {
        window.destroy();
        this.windows.delete(id);
      }
    }

    for (const display of displays) {
      const existing = this.windows.get(display.id);
      if (existing && !existing.isDestroyed()) {
        const current = existing.getBounds();
        const target = display.workArea;
        if (
          current.x !== target.x ||
          current.y !== target.y ||
          current.width !== target.width ||
          current.height !== target.height
        ) {
          existing.setBounds(target);
        }
      } else {
        this.windows.set(display.id, this.createWindow(display));
      }
    }

    this.applyVisibility("display-change");
  };

  private createWindow(display: Display): BrowserWindow {
    const window = new BrowserWindow({
      ...display.workArea,
      show: false,
      title: "FaceGuard Protection",
      frame: false,
      transparent: false,
      backgroundColor: "#edf0f3",
      alwaysOnTop: true,
      focusable: false,
      fullscreenable: false,
      movable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    window.setAlwaysOnTop(true, "screen-saver");
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.setHiddenInMissionControl(true);
    window.setContentProtection(true);
    void window.loadURL(dataUrl(overlayDocument()));
    return window;
  }

  private applyVisibility(reason: string): void {
    const visible = this.protectedBySession || this.manualTest;
    for (const window of this.windows.values()) {
      if (window.isDestroyed()) continue;
      if (visible && !window.isVisible()) window.showInactive();
      else if (!visible && window.isVisible()) window.hide();
    }
    logTechnicalEvent("desktop", visible ? "protection-shown" : "protection-hidden", {
      observation: this.observation,
      protected: visible,
      displayCount: this.windows.size,
      reason,
    });
  }
}
