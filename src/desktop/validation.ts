import type {
  ProtectionStateMessage,
  RendererTechnicalLog,
} from "./ipc-contract.ts";

const VIEWING_STATES = new Set([
  "safe",
  "extra-viewer",
  "absent",
  "uncertain",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function isProtectionStateMessage(
  value: unknown,
): value is ProtectionStateMessage {
  const candidate = record(value);
  return Boolean(
    candidate &&
      typeof candidate.protected === "boolean" &&
      typeof candidate.observation === "string" &&
      VIEWING_STATES.has(candidate.observation),
  );
}

/** Keep desktop logs narrow even if a renderer is compromised. */
export function sanitiseRendererLog(value: unknown): RendererTechnicalLog | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.event !== "string") return null;

  const event = candidate.event.slice(0, 80);
  if (!event) return null;
  const result: RendererTechnicalLog = { event };

  if (
    typeof candidate.observation === "string" &&
    VIEWING_STATES.has(candidate.observation)
  ) {
    result.observation = candidate.observation as RendererTechnicalLog["observation"];
  }
  if (typeof candidate.protected === "boolean") {
    result.protected = candidate.protected;
  }
  if (
    typeof candidate.latencyMs === "number" &&
    Number.isFinite(candidate.latencyMs)
  ) {
    result.latencyMs = Math.max(0, Math.round(candidate.latencyMs));
  }
  if (typeof candidate.reason === "string") {
    result.reason = candidate.reason.slice(0, 160);
  }
  if (typeof candidate.phase === "string") {
    result.phase = candidate.phase.slice(0, 40);
  }
  return result;
}
