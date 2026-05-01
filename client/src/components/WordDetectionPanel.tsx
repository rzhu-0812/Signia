/**
 * WordDetectionPanel.tsx
 * Design: Warm Paper Studio
 * - Word-level ASL recognition using full-body (Holistic) tracking
 * - Captures 30-frame sequences of hand + pose + face landmarks
 * - Runs LSTM inference on sequences to predict ~2000 ASL words
 * - Shows top-5 predictions with confidence scores
 * - Thumbs up/down feedback stored in Supabase
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaPipeHolistic } from "@/hooks/useMediaPipeHolistic";
import { useWordClassifier } from "@/hooks/useWordClassifier";
import { submitVote } from "@/lib/supabase";
import { ThumbsUp, ThumbsDown, CheckCircle2, Loader2 } from "lucide-react";
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
  const [voted, setVoted] = useState<boolean | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  const sequenceRef = useRef<number[][]>([]);
  const MAX_FRAMES = 30;

  const { predict: predictWord, status: modelStatus } = useWordClassifier();

  const handleFrameFeatures = useCallback((features: number[]) => {
    if (sequenceRef.current.length < MAX_FRAMES) {
      sequenceRef.current.push(features);
      setFrameCount(sequenceRef.current.length);
      if (sequenceRef.current.length === MAX_FRAMES) {
        setSequenceReady(true);
      }
    }
  }, []);

  const handleNoBody = useCallback(() => {
    sequenceRef.current = [];
    setSequenceReady(false);
    setFrameCount(0);
    setPredictions([]);
    setVoted(null);
  }, []);

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
        const topPredictions = predictWord(sequence);

        const formatted: Prediction[] = topPredictions.map((pred, idx) => ({
          word: pred.word,
          confidence: pred.confidence,
          rank: idx + 1,
        }));

        setPredictions(formatted);
        setVoted(null); // Reset vote state for new prediction
      } catch (err) {
        console.error("Word prediction error:", err);
      } finally {
        // Reset for next sequence
        sequenceRef.current = [];
        setFrameCount(0);
        setSequenceReady(false);
        setIsProcessing(false);
      }
    };

    runInference();
  }, [sequenceReady, isProcessing, modelStatus, predictWord]);

  const handleVote = async (isCorrect: boolean) => {
    if (voted !== null || predictions.length === 0) return;
    setVoted(isCorrect);
    try {
      await submitVote(predictions[0].word, isCorrect);
      toast.success(
        isCorrect ? "Thanks! Marked as correct." : "Feedback recorded — we'll improve!",
        { icon: <CheckCircle2 className="w-4 h-4 text-teal-500" /> }
      );
    } catch {
      toast.error("Failed to submit feedback");
      setVoted(null); // Allow retry
    }
  };

  const progressPct = Math.round((frameCount / MAX_FRAMES) * 100);

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 lg:gap-8 items-start"
      aria-label="Word detection panel"
      role="region"
    >
      {/* ── Left: Camera ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 w-full">
        <div className="relative bg-black rounded-3xl overflow-hidden shadow-lg w-full aspect-[4/5] max-h-[80vh]">
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

          {/* Loading overlay */}
          {holisticStatus !== "ready" && holisticStatus !== "no_body" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
              <p className="text-white text-sm capitalize">{holisticStatus}…</p>
            </div>
          )}

          {/* No body detected */}
          {holisticStatus === "no_body" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="text-4xl opacity-40">🧍</div>
              <p className="text-white/60 text-sm">Show your full body</p>
            </div>
          )}

          {/* Frame capture progress bar */}
          {holisticStatus === "ready" && frameCount > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div
                className="h-full bg-teal-400 transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {/* Status pill */}
          <div className="absolute bottom-3 left-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${holisticStatus === "ready"
                  ? "bg-black/40 text-teal-300"
                  : "bg-black/40 text-white/50"
                }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${holisticStatus === "ready"
                    ? "bg-teal-400 animate-pulse"
                    : "bg-white/30"
                  }`}
              />
              {holisticStatus === "ready" ? "Body detected" : holisticStatus}
            </span>
          </div>
        </div>

        {/* Capture progress text */}
        <p className="text-xs text-stone-400 px-1">
          Capturing:{" "}
          <span className="font-medium text-stone-600">
            {frameCount}/{MAX_FRAMES} frames
          </span>
          {sequenceReady && (
            <span className="text-teal-600 font-medium"> — analysing…</span>
          )}
        </p>
      </section>

      {/* ── Right: Predictions ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 w-full">
        {/* Header */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
            Word Detection
          </h2>
          <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded border border-teal-200">
            BETA
          </span>
        </div>

        {/* Model status */}
        <p className="text-xs text-stone-400">
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

        {/* Processing indicator */}
        {isProcessing && (
          <div className="bg-teal-50 rounded-2xl border border-teal-100 p-4 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-teal-500 animate-spin flex-shrink-0" />
            <p className="text-sm text-teal-700">Analysing sequence…</p>
          </div>
        )}

        {/* Predictions */}
        {predictions.length > 0 && !isProcessing && (
          <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-5 flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              Top Predictions
            </h3>

            <div className="space-y-3">
              {predictions.map((pred, i) => (
                <div key={pred.rank}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-stone-300 w-5 flex-shrink-0">
                      #{pred.rank}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`font-medium ${i === 0
                              ? "text-base text-stone-800"
                              : "text-sm text-stone-600"
                            }`}
                        >
                          {pred.word}
                        </span>
                        <span className="text-xs text-stone-400 tabular-nums">
                          {(pred.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${i === 0 ? "bg-teal-500" : "bg-stone-300"
                            }`}
                          style={{ width: `${pred.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Voting — only shows for top prediction */}
            <div className="border-t border-stone-50 pt-4">
              {voted === null ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-400">
                    Was "{predictions[0].word}" correct?
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleVote(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 text-xs font-medium hover:bg-teal-100 transition-colors border border-teal-100"
                    >
                      <ThumbsUp size={12} />
                      Yes
                    </button>
                    <button
                      onClick={() => handleVote(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 text-stone-600 text-xs font-medium hover:bg-stone-100 transition-colors border border-stone-100"
                    >
                      <ThumbsDown size={12} />
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <CheckCircle2 size={13} className="text-teal-500" />
                  Feedback recorded — thank you!
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state — model ready but no predictions yet */}
        {predictions.length === 0 && !isProcessing && modelStatus === "ready" && (
          <div className="bg-stone-50 rounded-3xl border border-stone-100 p-8 text-center">
            <div className="text-3xl mb-3">🤟</div>
            <p className="text-sm text-stone-600 font-medium">Sign a word</p>
            <p className="text-xs text-stone-400 mt-1">
              Stand back so your full body is visible
            </p>
          </div>
        )}

        {/* Model not ready */}
        {modelStatus !== "ready" && (
          <div className="bg-stone-50 rounded-3xl border border-stone-100 p-6 text-center">
            <Loader2 className="w-5 h-5 text-stone-300 animate-spin mx-auto mb-2" />
            <p className="text-sm text-stone-500">
              {modelStatus === "missing"
                ? "Word model not deployed yet"
                : `Loading word model…`}
            </p>
            {modelStatus === "missing" && (
              <p className="text-xs text-stone-400 mt-1">
                Drop trained weights into public/word_model/
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-stone-400 text-center leading-relaxed">
          ✦ Full-body tracking · ~2000 ASL words · BiLSTM model
        </p>
      </section>
    </div>
  );
}