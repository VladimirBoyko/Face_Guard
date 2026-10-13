export function shouldShowOverlay(
  protectedBySession: boolean,
  manualTest: boolean,
): boolean {
  return protectedBySession || manualTest;
}
