/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { MakerSquirrel } = require("@electron-forge/maker-squirrel");
const { MakerZIP } = require("@electron-forge/maker-zip");
const { VitePlugin } = require("@electron-forge/plugin-vite");

module.exports = {
  packagerConfig: {
    asar: true,
    name: "FaceGuard",
    // Electron Packager selects FaceGuard.icns on macOS and FaceGuard.ico on
    // Windows when the extension is omitted.
    icon: "assets/FaceGuard",
    appBundleId: "au.edu.torrens.faceguard.prototype",
    appCategoryType: "public.app-category.utilities",
    extendInfo: {
      NSCameraUsageDescription:
        "FaceGuard uses the camera to confirm that the enrolled user is present and alone during an active privacy session.",
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "FaceGuard",
      setupExe: "FaceGuard-Setup.exe",
      setupIcon: path.resolve(__dirname, "assets/FaceGuard.ico"),
      noMsi: true,
    }),
    new MakerZIP({}, ["darwin"]),
  ],
  plugins: [
    new VitePlugin({
      hotRestart: true,
      build: [
        {
          entry: "src/desktop/main.ts",
          config: "vite.main.config.ts",
        },
        {
          entry: "src/desktop/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};
