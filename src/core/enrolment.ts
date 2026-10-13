export type EnrolmentFace = {
  boxScore: number;
  embedding?: number[];
};

export type EnrolmentDecision =
  | { accepted: true; embedding: number[] }
  | {
      accepted: false;
      reason: "no-face" | "multiple-faces" | "unclear-face";
    };

export function evaluateEnrolmentFaces(
  faces: readonly EnrolmentFace[],
  minimumBoxScore: number,
): EnrolmentDecision {
  if (faces.length === 0) return { accepted: false, reason: "no-face" };
  if (faces.length > 1) {
    return { accepted: false, reason: "multiple-faces" };
  }

  const face = faces[0];
  if (!face.embedding?.length || face.boxScore < minimumBoxScore) {
    return { accepted: false, reason: "unclear-face" };
  }
  return { accepted: true, embedding: [...face.embedding] };
}
