import path from "node:path";
import { app, Menu, Tray, nativeImage } from "electron";

type TrayActions = {
  showControlWindow: () => void;
  endSession: () => void;
  toggleTestOverlay: () => void;
  showDiagnosticLog: () => void;
  quit: () => void;
};

const ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
  <path fill="black" d="M9 1 16 4v5c0 4.2-2.6 6.7-7 8-4.4-1.3-7-3.8-7-8V4l7-3Zm0 3.1L4.7 6v3c0 2.8 1.5 4.5 4.3 5.5 2.8-1 4.3-2.7 4.3-5.5V6L9 4.1Zm0 2.1a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z"/>
</svg>`)}`;

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
    const image = (fileImage.isEmpty()
      ? nativeImage.createFromDataURL(ICON)
      : fileImage
    ).resize({ width: iconSize, height: iconSize });
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
