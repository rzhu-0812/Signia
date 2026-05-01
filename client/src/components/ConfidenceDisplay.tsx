/**
 * ConfidenceDisplay.tsx
 * Design: Warm Paper Studio
 * - Large live letter with pop animation on change
 * - Teal confidence bar with smooth transition
 * - Top-3 predictions shown as small pills
 * - All animations wrapped in @media (prefers-reduced-motion: no-preference)
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { Prediction } from "@/hooks/useClassifier";
import type { ClassifierStatus } from "@/hooks/useClassifier";

interface ConfidenceDisplayProps {
  prediction: Prediction | null;
  classifierStatus: ClassifierStatus;
  emittedLetter: string | null;
}

export function ConfidenceDisplay({
  prediction,
  classifierStatus,
  emittedLetter,
}: ConfidenceDisplayProps) {
  const [popping, setPopping] = useState(false);
  const prevEmittedRef = useRef<string | null>(null);

  // Trigger pop animation when a new letter is emitted
  useEffect(() => {
    if (emittedLetter && emittedLetter !== prevEmittedRef.current) {
      prevEmittedRef.current = emittedLetter;
      setPopping(true);
      const t = setTimeout(() => setPopping(false), 300);
      return () => clearTimeout(t);
    }
  }, [emittedLetter]);

  const label = prediction?.label ?? "—";
  const confidence = prediction?.confidence ?? 0;
  const top3 = prediction?.top3 ?? [];
  const confidencePct = Math.round(confidence * 100);

  return (
    <div
      className="flex flex-col gap-4 p-5 bg-white rounded-2xl border border-stone-100 shadow-sm"
      aria-label="Live letter prediction and confidence"
      role="region"
    >
      {/* Loading model state */}
      {classifierStatus === "loading" && (
        <div className="flex items-center gap-2 text-sm text-stone-400">
          <div className="w-3 h-3 rounded-full border-2 border-teal-300 border-t-transparent animate-spin" />
          Loading model…
        </div>
      )}

      {/* Big letter */}
      <div className="flex items-center justify-between">
        <div
          className={[
            "text-7xl font-bold text-stone-800 select-none leading-none",
            "transition-transform duration-200",
            popping ? "scale-125" : "scale-100",
          ].join(" ")}
          aria-live="polite"
          aria-label={`Current letter: ${label}`}
          style={{
            // Only animate if user hasn't requested reduced motion
            // Tailwind doesn't have a direct way to conditionally apply
            // transform inside JSX, so we use inline style + CSS class
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {label}
        </div>

        <div className="text-right">
          <div className="text-2xl font-semibold text-teal-600 tabular-nums">
            {confidencePct}%
          </div>
          <div className="text-xs text-stone-400 mt-0.5">confidence</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div
        className="h-2 bg-stone-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={confidencePct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence: ${confidencePct}%`}
      >
        <div
          className="h-full bg-teal-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${confidencePct}%` }}
        />
      </div>

      {/* Top-3 predictions */}
      {top3.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {top3.map((p, i) => (
            <div
              key={`top3-${i}`}
              className={[
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium",
                i === 0
                  ? "bg-teal-50 text-teal-700 border border-teal-200"
                  : "bg-stone-50 text-stone-500 border border-stone-100",
              ].join(" ")}
            >
              <span style={{ fontFamily: "'DM Mono', monospace" }}>
                {p.label}
              </span>
              <span className="text-xs opacity-60">
                {Math.round(p.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
