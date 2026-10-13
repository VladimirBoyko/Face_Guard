import {
  clearDescriptor,
  clearDescriptorSamples,
} from "./descriptor.ts";

export type StoppableMediaStream = {
  getTracks(): Array<{ stop(): void }>;
};

export type SessionBiometricMemory = {
  descriptor: number[] | null;
  samples: number[][];
};

export function stopMediaStream(stream: StoppableMediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function clearSessionBiometricMemory(
  memory: SessionBiometricMemory,
): SessionBiometricMemory {
  return {
    descriptor: clearDescriptor(memory.descriptor),
    samples: clearDescriptorSamples(memory.samples),
  };
}
