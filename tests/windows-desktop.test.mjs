import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  desktopPlatform,
  overlayBounds,
  trayLocation,
} from "../src/desktop/platform.ts";
import {
  WINDOWS_APP_ID,
  windowsInstallerEvent,
  windowsShortcutCommand,
} from "../src/desktop/windows-installer.ts";

test("Windows uses complete-display overlays and system-tray language", () => {
  const display = {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  };

  assert.equal(desktopPlatform("win32"), "windows");
  assert.equal(trayLocation("win32"), "system-tray");
  assert.deepEqual(overlayBounds(display, "win32"), display.bounds);
  assert.deepEqual(overlayBounds(display, "darwin"), display.workArea);
});

test("Windows packaging includes Squirrel installer and a native icon", async () => {
  const forge = await readFile(
    new URL("../forge.config.cjs", import.meta.url),
    "utf8",
  );
  const main = await readFile(
    new URL("../src/desktop/main.ts", import.meta.url),
    "utf8",
  );

  assert.match(forge, /MakerSquirrel/);
  assert.match(forge, /FaceGuard-Setup\.exe/);
  assert.match(forge, /name: "FaceGuard"/);
  assert.equal(WINDOWS_APP_ID, "com.squirrel.FaceGuard.FaceGuard");
  assert.match(main, /setAppUserModelId\(WINDOWS_APP_ID\)/);
  assert.match(main, /appendDiagnosticLog/);
  await access(new URL("../assets/FaceGuard.ico", import.meta.url));
});

test("only an installed Windows build handles Squirrel shortcuts", () => {
  const args = (flag) => ["FaceGuard.exe", flag, "0.1.2"];
  assert.equal(windowsInstallerEvent("win32", true, args("--squirrel-install")), "create");
  assert.equal(windowsInstallerEvent("win32", true, args("--squirrel-updated")), "create");
  assert.equal(windowsInstallerEvent("win32", true, args("--squirrel-uninstall")), "remove");
  assert.equal(windowsInstallerEvent("win32", true, args("--squirrel-obsolete")), "obsolete");
  assert.equal(windowsInstallerEvent("win32", true, args("--squirrel-firstrun")), "first-run");
  assert.equal(windowsInstallerEvent("win32", true, ["FaceGuard.exe"]), null);
  assert.equal(windowsInstallerEvent("win32", false, args("--squirrel-install")), null);
  assert.equal(windowsInstallerEvent("darwin", true, args("--squirrel-install")), null);
});

test("shortcut commands use the installed updater and app, not Setup.exe", () => {
  const root = String.raw`C:\Users\Test User\AppData\Local\FaceGuard`;
  const app = root + String.raw`\app-0.1.2\FaceGuard.exe`;
  assert.deepEqual(windowsShortcutCommand("create", app), {
    updater: root + String.raw`\Update.exe`,
    args: ["--createShortcut=FaceGuard.exe"],
  });
  assert.deepEqual(windowsShortcutCommand("remove", app).args, [
    "--removeShortcut=FaceGuard.exe",
  ]);
});

test("Windows tray uses a visible high-contrast FG icon", async () => {
  const tray = await readFile(
    new URL("../src/desktop/tray.ts", import.meta.url),
    "utf8",
  );

  assert.match(tray, /const WINDOWS_TRAY_ICON/);
  assert.match(tray, /data:image\/png;base64/);
  assert.match(tray, /process\.platform === "win32"[\s\S]*WINDOWS_TRAY_ICON/);
  assert.match(
    tray,
    /process\.platform === "win32"[\s\S]*\? sourceImage[\s\S]*: sourceImage\.resize/,
  );
});

test("Windows workflow uses Node.js 24-compatible action runtimes", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/windows-build.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /pnpm\/action-setup@v6/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.doesNotMatch(workflow, /uses: .+@v4/);
});

test("Windows protection reasserts always-on-top z-order when shown", async () => {
  const overlay = await readFile(
    new URL("../src/desktop/overlay-manager.ts", import.meta.url),
    "utf8",
  );

  assert.match(overlay, /window\.setAlwaysOnTop\(true\)/);
  assert.match(overlay, /window\.showInactive\(\)/);
  assert.match(overlay, /window\.moveTop\(\)/);
  assert.match(overlay, /visibleWindowCount/);
});

test("sleep fails closed while explicit unlock safely restarts monitoring on macOS and Windows", async () => {
  const [main, preload, renderer, contract] = await Promise.all([
    readFile(new URL("../src/desktop/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/preload.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FaceGuardApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/ipc-contract.ts", import.meta.url), "utf8"),
  ]);

  assert.match(main, /powerMonitor\.on\("suspend"/);
  assert.match(main, /powerMonitor\.on\("lock-screen"/);
  assert.match(main, /powerMonitor\.on\("resume"/);
  assert.match(main, /powerMonitor\.on\("unlock-screen"/);
  assert.match(main, /overlayManager\?\.setProtection\(true, "uncertain"\)/);
  assert.match(main, /const unlockedByUser = reason === "unlock-screen"/);
  assert.match(main, /setProtection\(!unlockedByUser, currentObservation\)/);
  assert.match(main, /webContents\.send\(IPC\.systemResume, reason\)/);
  assert.match(contract, /systemResume: "faceguard:system-resume"/);
  assert.match(contract, /SystemRecoveryReason = "resume" \| "unlock-screen"/);
  assert.match(preload, /onSystemResume/);
  assert.match(renderer, /recoverCameraAfterResume/);
  assert.match(renderer, /reason === "unlock-screen"/);
  assert.match(renderer, /POST_ENROLMENT_PROTECTION/);
  assert.match(renderer, /openCameraStream\(5_000\)/);
  assert.match(renderer, /Camera request was superseded/);
  assert.match(renderer, /Reconnecting the camera after the computer resumed/);
});
