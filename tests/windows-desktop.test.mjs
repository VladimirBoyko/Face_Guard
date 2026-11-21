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
