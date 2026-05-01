/**
 * lib/normalize.ts
 * Bounding-box normalization for MediaPipe hand landmarks.
 *
 * Steps:
 * 1. Translate so wrist (landmark 0) is at origin
 * 2. Compute bounding box: dx = max(x) - min(x), dy = max(y) - min(y)
 * 3. scale = max(dx, dy) — use the LARGER dimension
 * 4. Divide all 63 values by scale (handle scale === 0 → use 1.0)
 * 5. Return Float32Array(63)
 *
 * This MUST match the normalization used in extract_landmarks.py so that
 * inference results are consistent between training and runtime.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Normalize 21 MediaPipe hand landmarks into a Float32Array of 63 floats.
 * Uses bounding-box scaling for stability across different hand sizes.
 */
export function normalizeLandmarks(landmarks: Landmark[]): Float32Array {
  if (landmarks.length < 21) {
    return new Float32Array(63);
  }

  // Step 1: Translate so wrist (landmark 0) is at origin
  const wrist = landmarks[0];
  const translated: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < 21; i++) {
    translated.push({
      x: landmarks[i].x - wrist.x,
      y: landmarks[i].y - wrist.y,
      z: landmarks[i].z - wrist.z,
    });
  }

  // Step 2: Compute bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < 21; i++) {
    if (translated[i].x < minX) minX = translated[i].x;
    if (translated[i].x > maxX) maxX = translated[i].x;
    if (translated[i].y < minY) minY = translated[i].y;
    if (translated[i].y > maxY) maxY = translated[i].y;
  }

  const dx = maxX - minX;
  const dy = maxY - minY;

  // Step 3: scale = max(dx, dy) — use the LARGER dimension
  let scale = Math.max(dx, dy);

  // Step 4: Handle scale === 0 case (all landmarks at same point)
  if (scale === 0) scale = 1.0;

  // Step 5: Flatten and divide by scale
  const result = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    result[i * 3] = translated[i].x / scale;
    result[i * 3 + 1] = translated[i].y / scale;
    result[i * 3 + 2] = translated[i].z / scale;
  }

  return result;
}
