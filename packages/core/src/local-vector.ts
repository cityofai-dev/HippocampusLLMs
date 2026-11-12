import { createHash } from "node:crypto";

export const LOCAL_VECTOR_MODEL = "token-hash-v1";
export const LOCAL_VECTOR_DIMENSIONS = 256;

/** Deterministic local token features, not a semantic language-model embedding. */
export function localVector(text: string): number[] {
  const vector = Array<number>(LOCAL_VECTOR_DIMENSIONS).fill(0);
  const terms = text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [];
  for (const term of terms) {
    const digest = createHash("sha256").update(term).digest();
    const index = digest.readUInt16BE(0) % LOCAL_VECTOR_DIMENSIONS;
    vector[index]! += 1;
  }
  const length = Math.hypot(...vector);
  return length ? vector.map((value) => value / length) : vector;
}
export function similarity(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}
