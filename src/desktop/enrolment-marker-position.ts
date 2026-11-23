export type EnrolmentMarkerPosition =
  | "centre"
  | "upper-left"
  | "lower-left"
  | "upper-right"
  | "lower-right";

export type DesktopWorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EnrolmentMarkerPlacement = {
  bounds: DesktopWorkArea;
  position: Exclude<EnrolmentMarkerPosition, "centre">;
};

const MARKER_WIDTH = 620;
const MARKER_HEIGHT = 340;

function overlapArea(first: DesktopWorkArea, second: DesktopWorkArea): number {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );
  return width * height;
}

function bestDisplayIndex(
  workAreas: readonly DesktopWorkArea[],
  bounds: DesktopWorkArea,
): number {
  let bestIndex = -1;
  let bestArea = 0;
  workAreas.forEach((workArea, index) => {
    const area = overlapArea(workArea, bounds);
    if (area > bestArea) {
      bestArea = area;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/** Only show the directional cue when the marker and FaceGuard window are on
 * different displays. An external transparent marker on the same display does
 * not need an "other screen" arrow. */
export function markerIsOnDifferentDisplay(
  workAreas: readonly DesktopWorkArea[],
  markerBounds: DesktopWorkArea,
  controlBounds: DesktopWorkArea | null,
): boolean {
  if (workAreas.length < 2 || !controlBounds) return false;
  const markerDisplay = bestDisplayIndex(workAreas, markerBounds);
  const controlDisplay = bestDisplayIndex(workAreas, controlBounds);
  return (
    markerDisplay >= 0 &&
    controlDisplay >= 0 &&
    markerDisplay !== controlDisplay
  );
}

/**
 * Place directional enrolment markers on the outer displays of a multi-screen
 * desktop. A single display (and the centre photo) deliberately falls back to
 * the existing in-window marker.
 */
export function enrolmentMarkerPlacement(
  workAreas: readonly DesktopWorkArea[],
  position: EnrolmentMarkerPosition,
): EnrolmentMarkerPlacement | null {
  if (workAreas.length < 2 || position === "centre") return null;

  const isLeft = position.endsWith("left");
  const isUpper = position.startsWith("upper");
  const target = [...workAreas].sort((first, second) => {
    const firstEdge = isLeft ? first.x : first.x + first.width;
    const secondEdge = isLeft ? second.x : second.x + second.width;
    return isLeft ? firstEdge - secondEdge : secondEdge - firstEdge;
  })[0];
  if (!target) return null;

  const horizontalInset = Math.max(20, Math.round(target.width * 0.06));
  const verticalInset = Math.max(20, Math.round(target.height * 0.07));
  const width = Math.min(MARKER_WIDTH, target.width - horizontalInset * 2);
  const height = Math.min(MARKER_HEIGHT, target.height - verticalInset * 2);
  if (width < 280 || height < 190) return null;

  return {
    position,
    bounds: {
      x: isLeft
        ? target.x + horizontalInset
        : target.x + target.width - horizontalInset - width,
      y: isUpper
        ? target.y + verticalInset
        : target.y + target.height - verticalInset - height,
      width,
      height,
    },
  };
}
