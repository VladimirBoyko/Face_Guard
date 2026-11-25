import { execFile } from "node:child_process";
import { win32 as path } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
export const WINDOWS_APP_ID = "com.squirrel.FaceGuard.FaceGuard";

export function windowsInstallerEvent(
  platform: NodeJS.Platform,
  packaged: boolean,
  argv: readonly string[],
) {
  if (platform !== "win32" || !packaged) return null;
  switch (argv[1]) {
    case "--squirrel-install":
    case "--squirrel-updated":
      return "create";
    case "--squirrel-uninstall":
      return "remove";
    case "--squirrel-obsolete":
      return "obsolete";
    case "--squirrel-firstrun":
      return "first-run";
    default:
      return null;
  }
}

export function windowsShortcutCommand(
  action: "create" | "remove",
  executable: string,
) {
  const directory = path.dirname(executable);
  return {
    updater: path.resolve(directory, "..", "Update.exe"),
    args: [`--${action}Shortcut=${path.basename(executable)}`],
  };
}

export async function updateWindowsShortcuts(action: "create" | "remove") {
  const { updater, args } = windowsShortcutCommand(action, process.execPath);
  await run(updater, args, { windowsHide: true, timeout: 8_000 });
}
