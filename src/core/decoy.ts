export const MAX_CUSTOM_DECOY_BYTES = 8 * 1024 * 1024;

export const ALLOWED_DECOY_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export function isAllowedDecoyType(type: string): boolean {
  return (ALLOWED_DECOY_TYPES as readonly string[]).includes(type);
}

export function isSafeDecoyDataUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const maximumDataUrlLength = Math.ceil((MAX_CUSTOM_DECOY_BYTES * 4) / 3) + 64;
  if (value.length > maximumDataUrlLength) return false;
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(
    value,
  );
}
