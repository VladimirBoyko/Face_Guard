export function shouldGrantMediaPermission(
  trustedSender: boolean,
  permission: string,
  mediaTypes: readonly string[] | undefined,
): boolean {
  return Boolean(
    trustedSender &&
      permission === "media" &&
      mediaTypes?.includes("video") &&
      !mediaTypes.includes("audio"),
  );
}
