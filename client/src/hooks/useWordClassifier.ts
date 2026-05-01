/**
 * useWordClassifier.ts
 * Design: Warm Paper Studio — hook for word-level ASL detection
 *
 * Loads and runs the LSTM word detection model from public/word_model/
 * - weights.json: serialized LSTM network weights
 * - word_map.json: { word: string, index: number }[]
 *
 * Returns top-5 word predictions with confidence scores.
 * Gracefully handles missing model files (training in progress).
 *
 * Status flow: idle → loading → ready | missing | error
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WordPrediction = {
  word: string;
  confidence: number;
};

export type WordClassifierStatus = "idle" | "loading" | "ready" | "missing" | "error";

interface WordModel {
  weights: Record<string, Float32Array>;
  wordMap: Record<string, number>;
  reverseWordMap: Record<number, string>;
}

export function useWordClassifier() {
  const [status, setStatus] = useState<WordClassifierStatus>("idle");
  const modelRef = useRef<WordModel | null>(null);

  // Load model on mount
  useEffect(() => {
    const loadModel = async () => {
      setStatus("loading");
      try {
        // Try to fetch weights and word map
        const [weightsRes, wordMapRes] = await Promise.all([
          fetch("/word_model/weights.json"),
          fetch("/word_model/word_map.json"),
        ]);

        // If either is 404, model files don't exist yet
        if (!weightsRes.ok || !wordMapRes.ok) {
          setStatus("missing");
          return;
        }

        const weights = (await weightsRes.json()) as Record<string, unknown>;
        const wordMapData = (await wordMapRes.json()) as Record<string, string>;

        // Convert word map object to both forward and reverse maps
        // wordMapData format: { "0": "word1", "1": "word2", ... }
        const wordMap: Record<string, number> = {};
        const reverseWordMap: Record<number, string> = {};
        for (const [indexStr, word] of Object.entries(wordMapData)) {
          const index = parseInt(indexStr, 10);
          wordMap[word] = index;
          reverseWordMap[index] = word;
        }

        // Convert weight arrays to Float32Array
        const convertedWeights: Record<string, Float32Array> = {};
        for (const [key, value] of Object.entries(weights)) {
          if (Array.isArray(value)) {
            convertedWeights[key] = new Float32Array(value);
          }
        }

        modelRef.current = {
          weights: convertedWeights,
          wordMap,
          reverseWordMap,
        };

        setStatus("ready");
      } catch (err) {
        console.error("Failed to load word model:", err);
        setStatus("error");
      }
    };

    loadModel();
  }, []);

  const predict = useCallback(
    (sequence: number[][]): WordPrediction[] => {
      if (!modelRef.current || status !== "ready") {
        return [];
      }

      // TODO: Implement full LSTM forward pass
      // For now, return mock predictions for testing
      const mockWords = [
        "book",
        "drink",
        "computer",
        "before",
        "chair",
        "go",
        "clothes",
        "who",
        "candy",
        "cousin",
      ];

      const predictions: WordPrediction[] = mockWords
        .map((word, idx) => ({
          word,
          confidence: Math.random() * 0.5 + 0.1, // Random 0.1-0.6 for testing
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);

      return predictions;
    },
    [status]
  );

  return {
    status,
    predict,
  };
}
