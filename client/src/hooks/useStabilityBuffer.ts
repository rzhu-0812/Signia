/**
 * useStabilityBuffer.ts
 * Design: Warm Paper Studio — hook, no UI concerns.
 *
 * Debounces raw per-frame classifier output into stable letter emissions.
 *
 * Fix for open-palm "B" spam:
 *   - Require top prediction to beat #2 by MIN_GAP (15%)
 *   - If top and #2 are close, hand pose is ambiguous — don't emit
 *   - holdFrames=5: need 5 consecutive clear frames
 *   - cooldownFrames=20: ~0.67s gap between letters at 30fps
 *   - minConfidence=0.65: reasonable threshold
 */

import { useCallback, useRef, useState } from "react";
import type { Prediction } from "./useClassifier";

const HOLD_FRAMES = 5;
const COOLDOWN_FRAMES = 20;
const MIN_CONFIDENCE = 0.65;
const MIN_GAP = 0.15; // top prediction must beat #2 by this margin

export interface UseStabilityBufferReturn {
  emittedLetter: string | null;
  onPrediction: (prediction: Prediction | null) => void;
  reset: () => void;
}

export function useStabilityBuffer(
  onEmit: (letter: string) => void
): UseStabilityBufferReturn {
  const [emittedLetter, setEmittedLetter] = useState<string | null>(null);

  const consecutiveRef = useRef(0);
  const cooldownRef = useRef(0);
  const currentLabelRef = useRef<string | null>(null);

  const onEmitRef = useRef(onEmit);
  onEmitRef.current = onEmit;

  const onPrediction = useCallback((prediction: Prediction | null) => {
    if (cooldownRef.current > 0) {
      cooldownRef.current--;
      return;
    }

    if (!prediction || prediction.confidence < MIN_CONFIDENCE) {
      consecutiveRef.current = 0;
      currentLabelRef.current = null;
      return;
    }

    // Check confidence gap — if top and #2 are close, pose is ambiguous
    const top2 = prediction.top3?.[1];
    if (top2) {
      const gap = prediction.confidence - top2.confidence;
      if (gap < MIN_GAP) {
        // Too close to call — reset and wait for clearer pose
        consecutiveRef.current = 0;
        currentLabelRef.current = null;
        return;
      }
    }

    const { label } = prediction;

    if (label === currentLabelRef.current) {
      consecutiveRef.current++;
    } else {
      currentLabelRef.current = label;
      consecutiveRef.current = 1;
    }

    if (consecutiveRef.current >= HOLD_FRAMES) {
      setEmittedLetter(label);
      onEmitRef.current(label);
      consecutiveRef.current = 0;
      currentLabelRef.current = null;
      cooldownRef.current = COOLDOWN_FRAMES;
    }
  }, []);

  const reset = useCallback(() => {
    consecutiveRef.current = 0;
    cooldownRef.current = 0;
    currentLabelRef.current = null;
    setEmittedLetter(null);
  }, []);

  return { emittedLetter, onPrediction, reset };
}