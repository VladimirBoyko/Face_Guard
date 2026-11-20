import { Buffer } from "node:buffer";
import {
  MAX_CUSTOM_DECOY_BYTES,
  isSafeDecoyDataUrl,
} from "../core/decoy.ts";

export type DecoyPayload = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

/** Decode an already validated local image without writing it to disk. */
export function decodeDecoyDataUrl(value: unknown): DecoyPayload | null {
  if (!isSafeDecoyDataUrl(value)) return null;

  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(value);
  if (!match) return null;

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_CUSTOM_DECOY_BYTES) return null;

  return {
    bytes: new Uint8Array(bytes),
    mimeType: match[1].toLowerCase() as DecoyPayload["mimeType"],
  };
}
