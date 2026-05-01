/**
 * Signia.tsx
 * Design: Warm Paper Studio
 * - Proportionate layout that scales with screen width
 * - Max-width container centered, responsive padding
 * - Camera capped at sensible height so it never dominates
 * - Letter model only updates in Letter mode
 */

"use client";

import { useCallback, useState } from "react";
import { WebcamPanel } from "./WebcamPanel";
import { OutputPanel } from "./OutputPanel";
import { ConfidenceDisplay } from "./ConfidenceDisplay";
import { WordDetectionPanel } from "./WordDetectionPanel";
import { normalizeLandmarks, type Landmark } from "@/lib/normalize";
import { useClassifier, type Prediction } from "@/hooks/useClassifier";
import { useStabilityBuffer } from "@/hooks/useStabilityBuffer";
import { useCharBuffer } from "@/hooks/useCharBuffer";

type AppTab = "letter" | "word";

export function Signia() {
  const [activeTab, setActiveTab] = useState<AppTab>("letter");
  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null);

  const { status: classifierStatus, predict } = useClassifier();

  const {
    rawChars,
    correctedText,
    isCorrecting,
    addLetter,
    clearAll,
    deleteLastChar,
    manualTrigger,
  } = useCharBuffer();

  const { emittedLetter, onPrediction } = useStabilityBuffer(addLetter);

  const handleLandmarks = useCallback(
    async (landmarks: Landmark[], _handedness: string) => {
      if (activeTab !== "letter") return;
      try {
        const vector = normalizeLandmarks(landmarks);
        const prediction = await predict(vector);
        setCurrentPrediction(prediction);
        onPrediction(prediction);
      } catch (err) {
        console.error("Prediction error:", err);
      }
    },
    [predict, onPrediction, activeTab]
  );

  const handleNoHand = useCallback(() => {
    if (activeTab === "letter") {
      setCurrentPrediction(null);
      onPrediction(null);
    }
  }, [onPrediction, activeTab]);

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-stone-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold leading-none text-black">Signia</h1>
            <p className="text-[11px] text-stone-400 mt-0.5">ASL to text</p>
          </div>

          <nav className="flex bg-stone-100 rounded-xl p-1 gap-1" aria-label="App mode" role="tablist">
            {(["letter", "word"] as AppTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 flex items-center gap-1.5",
                  activeTab === tab
                    ? "bg-white text-teal-600 shadow-sm"
                    : "text-stone-500 hover:text-stone-700",
                ].join(" ")}
              >
                {tab === "letter" ? "Letter" : "Word"}
                {tab === "word" && (
                  <span className="px-1 py-0.5 bg-teal-100 text-teal-700 text-[9px] font-bold rounded border border-teal-200 leading-none">
                    BETA
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-7">
        {/* Letter Detection mode */}
        {activeTab === "letter" && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr] lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.4fr_0.6fr] gap-6 lg:gap-8 items-start">
            {/* Left: webcam — capped height so it doesn't dominate */}
            <section aria-label="Webcam panel">
              <WebcamPanel
                aspectRatio="standard"
                onLandmarks={handleLandmarks}
                onNoHand={handleNoHand}
              />
            </section>

            {/* Right: confidence + output */}
            <section className="flex flex-col gap-4" aria-label="Prediction and output">
              <ConfidenceDisplay
                prediction={currentPrediction}
                classifierStatus={classifierStatus}
                emittedLetter={emittedLetter}
              />
              <OutputPanel
                rawChars={rawChars}
                correctedText={correctedText}
                isCorrecting={isCorrecting}
                onDeleteLast={deleteLastChar}
                onClear={clearAll}
                onTranslateNow={manualTrigger}
              />
            </section>
          </div>
        )}

        {/* Word Detection mode */}
        {activeTab === "word" && (
          <WordDetectionPanel />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 bg-gradient-to-r from-stone-50 to-teal-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-stone-600 font-semibold tracking-tight">
            © 2026 Signia <span className="mx-1 text-stone-300">|</span>
            <span className="text-stone-400 font-normal">Advanced Communication Platform</span>
          </p>
          <p className="text-xs text-stone-400">Powered by MediaPipe Hands + custom ML model</p>
        </div>
      </footer>
    </div>
  );
}
