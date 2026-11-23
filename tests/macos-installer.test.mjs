import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("macOS workflow builds and uploads the ARM64 PKG", async () => {
  const [workflow, buildScript, packageJson] = await Promise.all([
    readFile(
      new URL("../.github/workflows/macos-pkg.yml", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../installer/build-macos-pkg.sh", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(workflow, /runs-on: macos-latest/);
  assert.match(workflow, /pnpm run desktop:package:mac/);
  assert.match(workflow, /FaceGuard-macOS-arm64-PKG/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(buildScript, /electron-forge package --platform=darwin/);
  assert.match(buildScript, /pkgbuild/);
  assert.match(buildScript, /--install-location \/Applications/);
  assert.match(packageJson, /"version": "0\.1\.2"/);
});
