/* eslint-disable @typescript-eslint/no-require-imports */
const { MakerZIP } = require("@electron-forge/maker-zip");
const { VitePlugin } = require("@electron-forge/plugin-vite");

module.exports = {
  packagerConfig: {
    asar: true,
    name: "FaceGuard",
    appBundleId: "au.edu.torrens.faceguard.prototype",
    appCategoryType: "public.app-category.utilities",
    extendInfo: {
      NSCameraUsageDescription:
        "FaceGuard uses the camera to confirm that the enrolled user is present and alone during an active privacy session.",
    },
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ["darwin"])],
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
