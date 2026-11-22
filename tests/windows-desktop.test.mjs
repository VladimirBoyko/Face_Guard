import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  desktopPlatform,
  overlayBounds,
  trayLocation,
} from "../src/desktop/platform.ts";

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
  assert.match(main, /electron-squirrel-startup/);
  assert.match(main, /setAppUserModelId/);
  assert.match(main, /appendDiagnosticLog/);
  await access(new URL("../assets/FaceGuard.ico", import.meta.url));
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

test("Windows sleep and unlock fail closed and restart the session camera", async () => {
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
  assert.match(contract, /systemResume: "faceguard:system-resume"/);
  assert.match(preload, /onSystemResume/);
  assert.match(renderer, /recoverCameraAfterResume/);
  assert.match(renderer, /Reconnecting the camera after Windows resumed/);
});
