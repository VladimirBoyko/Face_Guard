/** Average and L2-normalise enrolment embeddings into one session descriptor. */
export function averageDescriptors(descriptors: number[][]): number[] {
  const length = descriptors[0]?.length ?? 0;
  if (!length || descriptors.some((descriptor) => descriptor.length !== length)) {
    return [];
  }

  const average = Array.from({ length }, (_, index) =>
    descriptors.reduce((sum, descriptor) => sum + descriptor[index], 0) /
    descriptors.length,
  );
  const magnitude = Math.sqrt(
    average.reduce((sum, value) => sum + value * value, 0),
  );
  return magnitude > 0 ? average.map((value) => value / magnitude) : average;
}

/**
 * Compare one detected face against every session-only enrolment template and
 * average the strongest matches. Using two templates is less sensitive to one
 * unusually favourable or unfavourable head angle than a single comparison.
 */
export function averageBestTemplateSimilarities(
  templates: readonly number[][],
  candidate: readonly number[],
  similarity: (template: number[], candidate: number[]) => number,
  bestMatchCount = 2,
): number {
  if (!templates.length || !candidate.length || bestMatchCount < 1) return 0;

  const scores = templates
    .filter((template) => template.length === candidate.length)
    .map((template) => similarity(template, [...candidate]))
    .filter(Number.isFinite)
    .sort((first, second) => second - first)
    .slice(0, bestMatchCount);

  return scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0;
}

/** Best-effort zeroing for temporary JavaScript arrays before references drop. */
export function clearDescriptor(descriptor: number[] | null): null {
  descriptor?.fill(0);
  return null;
}

export function clearDescriptorSamples(samples: number[][]): number[][] {
  samples.forEach((sample) => sample.fill(0));
  return [];
}
