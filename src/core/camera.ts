export type CameraStartFailure = "permission-denied" | "unavailable";

export function classifyCameraStartFailure(error: unknown): CameraStartFailure {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
    ? "permission-denied"
    : "unavailable";
}

export function cameraFailureMessage(failure: CameraStartFailure): string {
  return failure === "permission-denied"
    ? "Camera permission was not granted. FaceGuard cannot start without it."
    : "FaceGuard could not start the camera or local face model. Please check the camera and try again.";
}
