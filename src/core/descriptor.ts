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

/** Best-effort zeroing for temporary JavaScript arrays before references drop. */
export function clearDescriptor(descriptor: number[] | null): null {
  descriptor?.fill(0);
  return null;
}

export function clearDescriptorSamples(samples: number[][]): number[][] {
  samples.forEach((sample) => sample.fill(0));
  return [];
}
