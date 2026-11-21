import {
  BrowserWindow,
  protocol,
  screen,
  type Display,
} from "electron";
import decoyImage from "../../public/decoy-government.png?inline";
import { logTechnicalEvent } from "../core/logger.ts";
import type { ViewingState } from "../core/protection-state.ts";
import { decodeDecoyDataUrl, type DecoyPayload } from "./decoy-payload.ts";
import { shouldShowOverlay } from "./overlay-policy.ts";
import { overlayBounds, trayLocation } from "./platform.ts";

const DECOY_SCHEME = "faceguard-decoy";

protocol.registerSchemesAsPrivileged([
  {
    scheme: DECOY_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function overlayDocument(imageSource: string): string {
  const trayControl = trayLocation();
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><title>FaceGuard Protection</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: faceguard-decoy:; style-src 'unsafe-inline'">
<style>
html,body{height:100%;margin:0;overflow:hidden;background:#edf0f3;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
img{height:100%;width:100%;object-fit:cover;object-position:center top}
.status{position:fixed;left:18px;bottom:18px;padding:9px 12px;border-radius:999px;background:rgba(20,29,25,.88);color:#fff;font-size:11px;font-weight:700;letter-spacing:.02em;box-shadow:0 8px 30px rgba(0,0,0,.22)}
</style></head><body><img alt="Protected FaceGuard decoy" src="${imageSource}"><div class="status">FaceGuard protection active · use the ${trayControl} icon to end the session</div></body></html>`;
}

function dataUrl(html: string): string {
  return `data:text/html;base64,${Buffer.from(html).toString("base64")}`;
}

export class OverlayManager {
  private readonly windows = new Map<number, BrowserWindow>();
  private protectedBySession = false;
  private manualTest = false;
  private observation: ViewingState = "uncertain";
  private customDecoyImage: DecoyPayload | null = null;
  private customDecoyRevision = 0;

  initialise(): void {
    protocol.handle(DECOY_SCHEME, () => {
      if (!this.customDecoyImage) {
        return new Response(null, { status: 404 });
      }
      const body = Uint8Array.from(this.customDecoyImage.bytes).buffer;
      return new Response(body, {
        headers: {
          "Content-Type": this.customDecoyImage.mimeType,
          "Cache-Control": "no-store",
        },
      });
    });
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
    protocol.unhandle(DECOY_SCHEME);
    this.customDecoyImage = null;
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

  setDecoyImage(dataUrl: string | null): void {
    this.customDecoyImage = dataUrl ? decodeDecoyDataUrl(dataUrl) : null;
    this.customDecoyRevision += 1;
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) this.loadOverlay(window);
    }
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
        const target = overlayBounds(display);
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
      ...overlayBounds(display),
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

    if (process.platform === "darwin") {
      window.setAlwaysOnTop(true, "screen-saver");
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
      window.setHiddenInMissionControl(true);
    } else {
      window.setAlwaysOnTop(true);
    }
    window.setContentProtection(true);
    this.loadOverlay(window);
    return window;
  }

  private loadOverlay(window: BrowserWindow): void {
    const imageSource = this.customDecoyImage
      ? `${DECOY_SCHEME}://current/image?v=${this.customDecoyRevision}`
      : decoyImage;
    void window.loadURL(dataUrl(overlayDocument(imageSource)));
  }

  private applyVisibility(reason: string): void {
    const visible = shouldShowOverlay(this.protectedBySession, this.manualTest);
    for (const window of this.windows.values()) {
      if (window.isDestroyed()) continue;
      if (visible) {
        // Reassert Windows z-order on every unsafe observation. This is more
        // reliable than relying on the creation-time alwaysOnTop flag after a
        // foreground application changes its own window state.
        if (process.platform === "win32") window.setAlwaysOnTop(true);
        if (!window.isVisible()) window.showInactive();
        if (process.platform === "win32") window.moveTop();
      } else if (window.isVisible()) {
        window.hide();
      }
    }
    const visibleWindowCount = [...this.windows.values()].filter(
      (window) => !window.isDestroyed() && window.isVisible(),
    ).length;
    logTechnicalEvent("desktop", visible ? "protection-shown" : "protection-hidden", {
      observation: this.observation,
      protected: visible,
      displayCount: this.windows.size,
      visibleWindowCount,
      reason,
    });
  }
}
