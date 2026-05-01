/**
 * useClassifier.ts
 * Design: Warm Paper Studio — hook, no UI concerns.
 *
 * Loads the custom JSON model from /public/model/ using the TypeScript
 * inference engine (lib/inference.ts). Exposes a predict() function that
 * returns the predicted class label, confidence score, and top-3 predictions.
 *
 * Model architecture (24 classes, A-Y excl. J/Z):
 *   Input(63) → Dense(256, relu) → BN → Dense(128, relu) → BN → Dense(64, relu) → Dense(24, softmax)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { predict as inferencePredict, preloadModel } from "@/lib/inference";

export interface Prediction {
  label: string;
  confidence: number;
  top3: Array<{ label: string; confidence: number }>;
}

export type ClassifierStatus = "loading" | "ready" | "error";

// 24 output classes: A-Y (no J, Z)
export const ASL_CLASSES: string[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y",
];

export function useClassifier() {
  const [status, setStatus] = useState<ClassifierStatus>("loading");
  const modelReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await preloadModel();
        if (cancelled) return;
        modelReadyRef.current = true;
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          console.error("Model load failed:", err);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const predict = useCallback(
    async (vector: Float32Array): Promise<Prediction | null> => {
      if (!modelReadyRef.current) return null;

      try {
        const result = await inferencePredict(vector, 3);
        return {
          label: result.label,
          confidence: result.confidence,
          top3: result.topK,
        };
      } catch (err) {
        console.error("Predict error:", err);
        return null;
      }
    },
    []
  );

  return { status, predict };
}
