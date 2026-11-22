export type FrameQualityThresholds = {
  minimumBrightness: number;
  maximumBrightness: number;
  minimumContrast: number;
  minimumEdgeStrength: number;
};

export type FrameQuality = {
  acceptable: boolean;
  brightness: number;
  contrast: number;
  edgeStrength: number;
  reason?: "too-dark" | "too-bright" | "low-contrast" | "blurred";
};

/** Evaluate a short-lived downsampled RGBA frame without retaining any pixels. */
export function evaluateFrameQuality(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  thresholds: FrameQualityThresholds,
): FrameQuality {
  const pixelCount = width * height;
  if (pixelCount < 2 || rgba.length < pixelCount * 4) {
    return { acceptable: false, brightness: 0, contrast: 0, edgeStrength: 0, reason: "blurred" };
  }

  const luminance = new Float32Array(pixelCount);
  let sum = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const value =
      0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2];
    luminance[pixel] = value;
    sum += value;
  }

  const brightness = sum / pixelCount;
  let squaredDifference = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const difference = luminance[index] - brightness;
      squaredDifference += difference * difference;
      if (x > 0) {
        edgeTotal += Math.abs(luminance[index] - luminance[index - 1]);
        edgeCount += 1;
      }
      if (y > 0) {
        edgeTotal += Math.abs(luminance[index] - luminance[index - width]);
        edgeCount += 1;
      }
    }
  }

  const contrast = Math.sqrt(squaredDifference / pixelCount);
  const edgeStrength = edgeCount ? edgeTotal / edgeCount : 0;
  const base = { brightness, contrast, edgeStrength };
  if (brightness < thresholds.minimumBrightness) {
    return { ...base, acceptable: false, reason: "too-dark" };
  }
  if (brightness > thresholds.maximumBrightness) {
    return { ...base, acceptable: false, reason: "too-bright" };
  }
  if (contrast < thresholds.minimumContrast) {
    return { ...base, acceptable: false, reason: "low-contrast" };
  }
  if (edgeStrength < thresholds.minimumEdgeStrength) {
    return { ...base, acceptable: false, reason: "blurred" };
  }
  return { ...base, acceptable: true };
}

export function hasMinimumFaceSize(
  box: readonly number[] | undefined,
  minimumSizePx: number,
): boolean {
  return Boolean(box && box.length >= 4 && box[2] >= minimumSizePx && box[3] >= minimumSizePx);
}
