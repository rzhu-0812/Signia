/**
 * WordDetectionPanel.tsx
 * Design: Warm Paper Studio
 * - Word-level ASL recognition using full-body (Holistic) tracking
 * - Captures 30-frame sequences of hand + pose + face landmarks
 * - Runs LSTM inference on sequences to predict ~2000 ASL words
 * - Shows top-5 predictions with confidence scores
 * - Full-body skeleton visualization on canvas
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaPipeHolistic } from "@/hooks/useMediaPipeHolistic";
import { useWordClassifier } from "@/hooks/useWordClassifier";
import { submitVote } from "@/lib/supabase";
import { ThumbsUp, ThumbsDown, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Prediction {
  word: string;
  confidence: number;
  rank: number;
}

export function WordDetectionPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [sequenceReady, setSequenceReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Accumulate 30-frame sequences
  const sequenceRef = useRef<number[][]>([]);
  const MAX_FRAMES = 30;

  // Load word model
  const { predict: predictWord, status: modelStatus } = useWordClassifier();

  // Handle incoming frame features from Holistic
  const handleFrameFeatures = useCallback(
    (features: number[]) => {
      if (sequenceRef.current.length < MAX_FRAMES) {
        sequenceRef.current.push(features);

        if (sequenceRef.current.length === MAX_FRAMES) {
          setSequenceReady(true);
        }
      }
    },
    []
  );

  const handleNoBody = useCallback(() => {
    // Reset sequence if body is lost
    sequenceRef.current = [];
    setSequenceReady(false);
    setPredictions([]);
  }, []);

  // Initialize Holistic
  const { status: holisticStatus } = useMediaPipeHolistic({
    videoRef,
    canvasRef,
    onFrameFeatures: handleFrameFeatures,
    onNoBody: handleNoBody,
    drawLandmarks: true,
  });

  // Run inference when sequence is ready
  useEffect(() => {
    if (!sequenceReady || isProcessing || modelStatus !== "ready") return;

    const runInference = async () => {
      setIsProcessing(true);
      try {
        const sequence = sequenceRef.current;
        const topPredictions = await predictWord(sequence);

        // Format predictions with confidence
        const formatted: Prediction[] = topPredictions.map((pred, idx) => ({
          word: pred.word,
          confidence: pred.confidence,
          rank: idx + 1,
        }));

        setPredictions(formatted);

        // Reset for next sequence
        sequenceRef.current = [];
        setSequenceReady(false);
      } catch (err) {
        console.error("Word prediction error:", err);
      } finally {
        setIsProcessing(false);
      }
    };

    runInference();
  }, [sequenceReady, isProcessing, modelStatus, predictWord]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr] lg:grid-cols-[1.2fr_0.8fr] gap-6 lg:gap-8 items-start" aria-label="Word detection panel" role="region">
      {/* Left: Camera with full-body skeleton */}
      <section className="flex flex-col gap-4 w-full">
        {/* Webcam canvas - tall aspect ratio for full body */}
        <div className="relative bg-black rounded-3xl overflow-hidden shadow-lg max-h-[80vh] w-full aspect-[4/5]">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover opacity-0"
            autoPlay
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {holisticStatus !== "ready" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <p className="text-white text-sm">{holisticStatus}...</p>
            </div>
          )}
        </div>

        {/* Status indicators */}
        <div className="text-xs text-stone-500 space-y-1 px-2">
          <p>
            Holistic:{" "}
            <span
              className={
                holisticStatus === "ready"
                  ? "text-teal-600 font-medium"
                  : "text-stone-400"
              }
            >
              {holisticStatus}
            </span>
          </p>
          <p>
            Sequence: {sequenceRef.current.length}/{MAX_FRAMES}
            {sequenceReady && <span className="text-teal-600 font-medium"> ✓ Ready</span>}
          </p>
        </div>
      </section>

      {/* Right: Predictions and info */}
      <section className="flex flex-col gap-4 w-full">
        {/* Title */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
            Word Detection
          </h2>
          <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded border border-teal-200">
            BETA
          </span>
        </div>

        {/* Model status */}
        <div className="text-xs text-stone-500">
          <p>
            Model:{" "}
            <span
              className={
                modelStatus === "ready"
                  ? "text-teal-600 font-medium"
                  : "text-stone-400"
              }
            >
              {modelStatus}
            </span>
          </p>
        </div>

        {/* Predictions */}
        {predictions.length > 0 && (
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-stone-700">Top Predictions</h3>

            <div className="space-y-3">
              {predictions.map((pred, i) => (
                <div key={pred.rank} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-stone-400 w-6">
                      #{pred.rank}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-stone-700">
                          {pred.word}
                        </span>
                        <span className="text-xs text-stone-500">
                          {(pred.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 transition-all duration-300"
                          style={{ width: `${pred.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Feedback buttons for the top prediction */}
                  {i === 0 && (
                    <div className="flex items-center justify-end gap-3 mt-1 pr-1">
                      <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">
                        Accurate?
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            await submitVote(pred.word, true);
                            toast.success("Thanks for the feedback!", {
                              icon: <CheckCircle2 className="w-4 h-4 text-teal-500" />,
                            });
                          } catch {
                            toast.error("Failed to submit feedback");
                          }
                        }}
                        className="p-1.5 rounded-lg bg-stone-50 text-stone-400 hover:text-teal-600 hover:bg-teal-50 transition-colors border border-stone-100"
                        title="Correct"
                      >
                        <ThumbsUp size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await submitVote(pred.word, false);
                            toast.success("Feedback recorded. We'll improve!", {
                              icon: <CheckCircle2 className="w-4 h-4 text-orange-500" />,
                            });
                          } catch {
                            toast.error("Failed to submit feedback");
                          }
                        }}
                        className="p-1.5 rounded-lg bg-stone-50 text-stone-400 hover:text-orange-600 hover:bg-orange-50 transition-colors border border-stone-100"
                        title="Incorrect"
                      >
                        <ThumbsDown size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No predictions yet */}
        {predictions.length === 0 && modelStatus === "ready" && (
          <div className="bg-stone-50 rounded-3xl border border-stone-100 p-6 text-center">
            <p className="text-sm text-stone-600">
              {isProcessing
                ? "Processing sequence..."
                : "Sign a word to see predictions"}
            </p>
          </div>
        )}

        {/* Model loading */}
        {modelStatus !== "ready" && (
          <div className="bg-stone-50 rounded-3xl border border-stone-100 p-6 text-center">
            <p className="text-sm text-stone-600">
              Loading word model ({modelStatus})...
            </p>
          </div>
        )}

        {/* Info note */}
        <p className="text-xs text-stone-400 text-center px-2 leading-relaxed">
          ✦ Full-body signing • ~2000 words • LSTM model
        </p>
      </section>
    </div>
  );
}
