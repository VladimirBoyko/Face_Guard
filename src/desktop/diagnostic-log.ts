import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app, shell } from "electron";
import type { TechnicalLogEntry } from "../core/logger.ts";

function logPath(): string {
  return path.join(app.getPath("userData"), "faceguard-diagnostic.log");
}

export function appendDiagnosticLog(entry: TechnicalLogEntry): void {
  try {
    mkdirSync(path.dirname(logPath()), { recursive: true });
    appendFileSync(logPath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Diagnostics must never interrupt privacy protection.
  }
}

export function showDiagnosticLog(): void {
  try {
    const target = logPath();
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "", { encoding: "utf8", flag: "a" });
    shell.showItemInFolder(target);
  } catch {
    // Keep the tray responsive if Explorer/Finder cannot open the location.
  }
}
