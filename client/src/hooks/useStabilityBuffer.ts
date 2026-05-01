/**
 * useStabilityBuffer.ts
 * Design: Warm Paper Studio — hook, no UI concerns.
 *
 * Debounces the raw per-frame classifier output into stable letter emissions.
 *
 * Rules:
 *   holdFrames=8    — emit a letter only after 8 consecutive frames agree
 *   cooldownFrames=15 — ignore new predictions for 15 frames after emission
 *   minConfidence=0.6 — discard predictions below this threshold
 *
 * Returns:
 *   emittedLetter — the most recently emitted letter (null if none yet)
 *   onPrediction  — call this with every frame's prediction
 *   reset         — clear all state
 */

import { useCallback, useRef, useState } from "react";
import type { Prediction } from "./useClassifier";

const HOLD_FRAMES = 8;
const COOLDOWN_FRAMES = 15;
const MIN_CONFIDENCE = 0.6;

export interface UseStabilityBufferReturn {
  emittedLetter: string | null;
  onPrediction: (prediction: Prediction | null) => void;
  reset: () => void;
}

export function useStabilityBuffer(
  onEmit: (letter: string) => void
): UseStabilityBufferReturn {
  const [emittedLetter, setEmittedLetter] = useState<string | null>(null);

  // Use refs for frame counters to avoid re-renders on every frame
  const consecutiveRef = useRef(0);
  const cooldownRef = useRef(0);
  const currentLabelRef = useRef<string | null>(null);

  const onEmitRef = useRef(onEmit);
  onEmitRef.current = onEmit;

  const onPrediction = useCallback((prediction: Prediction | null) => {
    // Decrement cooldown
    if (cooldownRef.current > 0) {
      cooldownRef.current--;
      return;
    }

    if (!prediction || prediction.confidence < MIN_CONFIDENCE) {
      // Reset consecutive counter on low-confidence or null prediction
      consecutiveRef.current = 0;
      currentLabelRef.current = null;
      return;
    }

    const { label } = prediction;

    if (label === currentLabelRef.current) {
      consecutiveRef.current++;
    } else {
      // New label — restart consecutive count
      currentLabelRef.current = label;
      consecutiveRef.current = 1;
    }

    if (consecutiveRef.current >= HOLD_FRAMES) {
      // Emit!
      setEmittedLetter(label);
      onEmitRef.current(label);

      // Reset for next emission
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
