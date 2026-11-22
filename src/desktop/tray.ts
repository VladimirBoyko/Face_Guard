import path from "node:path";
import { app, Menu, Tray, nativeImage } from "electron";

type TrayActions = {
  showControlWindow: () => void;
  endSession: () => void;
  toggleTestOverlay: () => void;
  showDiagnosticLog: () => void;
  quit: () => void;
};

const MACOS_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
  <path fill="black" d="M9 1 16 4v5c0 4.2-2.6 6.7-7 8-4.4-1.3-7-3.8-7-8V4l7-3Zm0 3.1L4.7 6v3c0 2.8 1.5 4.5 4.3 5.5 2.8-1 4.3-2.7 4.3-5.5V6L9 4.1Zm0 2.1a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z"/>
</svg>`)}`;

// Electron's SVG data URLs can become empty tray images on Windows. Embed a
// real 32px PNG so Explorer always receives a raster FG icon, independently of
// ASAR paths and the current taskbar theme.
const WINDOWS_TRAY_ICON =
  "data:image/png;base64,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";

export class FaceGuardTray {
  private readonly tray: Tray;
  private sessionActive = false;
  private manualTest = false;
  private stateLabel = "Ready";

  constructor(private readonly actions: TrayActions) {
    const packagedIcon = path.join(
      app.getAppPath(),
      "assets",
      process.platform === "win32" ? "FaceGuard.ico" : "FaceGuard.icns",
    );
    const fileImage = nativeImage.createFromPath(packagedIcon);
    const iconSize = process.platform === "win32" ? 20 : 18;
    const sourceImage =
      process.platform === "win32"
        ? nativeImage.createFromDataURL(WINDOWS_TRAY_ICON)
        : fileImage.isEmpty()
          ? nativeImage.createFromDataURL(MACOS_ICON)
          : fileImage;
    const image =
      process.platform === "win32"
        ? sourceImage
        : sourceImage.resize({ width: iconSize, height: iconSize });
    if (process.platform === "darwin") image.setTemplateImage(true);
    this.tray = new Tray(image);
    // Keep the menu-bar control discoverable even when macOS fails to render
    // the template SVG (this can happen in development and after app updates).
    if (process.platform === "darwin") this.tray.setTitle("FG");
    this.tray.setToolTip("FaceGuard 2.0");
    this.tray.on("double-click", actions.showControlWindow);
    if (process.platform === "darwin") {
      this.tray.on("click", actions.showControlWindow);
    }
    this.rebuild();
  }

  update(sessionActive: boolean, stateLabel: string, manualTest: boolean): void {
    this.sessionActive = sessionActive;
    this.stateLabel = stateLabel;
    this.manualTest = manualTest;
    this.rebuild();
  }

  destroy(): void {
    this.tray.destroy();
  }

  private rebuild(): void {
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Show FaceGuard",
          click: () => this.actions.showControlWindow(),
        },
        { label: `Status: ${this.stateLabel}`, enabled: false },
        { type: "separator" },
        {
          label: "End session and clear memory",
          enabled: this.sessionActive,
          click: () => this.actions.endSession(),
        },
        {
          label: "Test desktop protection overlay",
          type: "checkbox",
          checked: this.manualTest,
          click: () => this.actions.toggleTestOverlay(),
        },
        {
          label: "Open diagnostic log",
          click: () => this.actions.showDiagnosticLog(),
        },
        { type: "separator" },
        { label: "Quit FaceGuard", click: () => this.actions.quit() },
      ]),
    );
  }
}
