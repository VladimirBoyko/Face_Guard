export type EnrolmentFace = {
  boxScore: number;
  box?: number[];
  embedding?: number[];
};

export type EnrolmentDecision =
  | { accepted: true; embedding: number[] }
  | {
      accepted: false;
      reason: "no-face" | "multiple-faces" | "unclear-face" | "face-too-small";
    };

export function evaluateEnrolmentFaces(
  faces: readonly EnrolmentFace[],
  minimumBoxScore: number,
  minimumFaceSizePx = 0,
): EnrolmentDecision {
  if (faces.length === 0) return { accepted: false, reason: "no-face" };
  if (faces.length > 1) {
    return { accepted: false, reason: "multiple-faces" };
  }

  const face = faces[0];
  if (!face.embedding?.length || face.boxScore < minimumBoxScore) {
    return { accepted: false, reason: "unclear-face" };
  }
  if (
    minimumFaceSizePx > 0 &&
    (!face.box || face.box[2] < minimumFaceSizePx || face.box[3] < minimumFaceSizePx)
  ) {
    return { accepted: false, reason: "face-too-small" };
  }
  return { accepted: true, embedding: [...face.embedding] };
}
