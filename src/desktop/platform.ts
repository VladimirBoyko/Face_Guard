export type DesktopPlatform = "macos" | "windows" | "linux";

export type DisplayGeometry = {
  bounds: Electron.Rectangle;
  workArea: Electron.Rectangle;
};

export function desktopPlatform(
  platform: NodeJS.Platform = process.platform,
): DesktopPlatform {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "linux";
}

export function overlayBounds(
  display: DisplayGeometry,
  platform: NodeJS.Platform = process.platform,
): Electron.Rectangle {
  // On Windows the overlay covers the complete display, including the taskbar,
  // so protected content and taskbar previews cannot remain visible.
  return platform === "win32" ? display.bounds : display.workArea;
}

export function trayLocation(
  platform: NodeJS.Platform = process.platform,
): "menu-bar" | "system-tray" {
  return platform === "darwin" ? "menu-bar" : "system-tray";
}
