import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { isSafeDecoyDataUrl } from "../core/decoy.ts";

export type SavedDecoyImage = {
  dataUrl: string;
  name: string;
};

function decoyPath(): string {
  return path.join(app.getPath("userData"), "custom-decoy.json");
}

function validSavedDecoy(value: unknown): value is SavedDecoyImage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isSafeDecoyDataUrl(candidate.dataUrl) &&
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    candidate.name.length <= 160
  );
}

export async function loadSavedDecoy(): Promise<SavedDecoyImage | null> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(decoyPath(), "utf8"));
    return validSavedDecoy(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveDecoy(
  dataUrl: string,
  name: string,
): Promise<boolean> {
  if (!isSafeDecoyDataUrl(dataUrl)) return false;
  const safeName = name.trim().slice(0, 160) || "Custom image";
  const target = decoyPath();
  const temporary = `${target}.tmp`;

  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      temporary,
      JSON.stringify({ dataUrl, name: safeName }),
      { encoding: "utf8", mode: 0o600 },
    );
    await fs.rename(temporary, target);
    return true;
  } catch {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    return false;
  }
}

export async function clearSavedDecoy(): Promise<boolean> {
  try {
    await fs.rm(decoyPath(), { force: true });
    return true;
  } catch {
    return false;
  }
}
