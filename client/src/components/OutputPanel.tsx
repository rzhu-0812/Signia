/**
 * OutputPanel.tsx
 * Design: Warm Paper Studio
 * - DM Mono for raw character stream — typewriter feel
 * - Shimmer animation on corrected text area while loading
 * - Text fades in after autocorrect completes
 * - Backspace and Clear buttons for user control
 * - Manual "Translate now" button to trigger autocorrect on demand
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Delete, Trash2, ArrowRight } from "lucide-react";

interface OutputPanelProps {
  rawChars: string;
  correctedText: string;
  isCorrecting: boolean;
  onDeleteLast: () => void;
  onClear: () => void;
  onTranslateNow: () => void;
}

export function OutputPanel({
  rawChars,
  correctedText,
  isCorrecting,
  onDeleteLast,
  onClear,
  onTranslateNow,
}: OutputPanelProps) {
  const [fadeIn, setFadeIn] = useState(false);
  const prevCorrectedRef = useRef("");

  // Trigger fade-in when corrected text updates
  useEffect(() => {
    if (correctedText && correctedText !== prevCorrectedRef.current) {
      prevCorrectedRef.current = correctedText;
      setFadeIn(false);
      const t = setTimeout(() => setFadeIn(true), 50);
      return () => clearTimeout(t);
    }
  }, [correctedText]);

  return (
    <div className="flex flex-col gap-4" aria-label="Output panel" role="region">
      {/* Raw character stream */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
            Raw stream
          </label>
          <div className="flex gap-1">
            <button
              onClick={onDeleteLast}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              aria-label="Delete last character"
              title="Backspace"
            >
              <Delete size={14} />
            </button>
            <button
              onClick={onClear}
              className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              aria-label="Clear all text"
              title="Clear all"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div
          className="min-h-[56px] px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100"
          aria-label="Raw character stream"
          aria-live="polite"
        >
          {rawChars ? (
            <span
              className="text-lg lg:text-xl text-stone-700 tracking-widest break-all"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              {rawChars}
              <span className="inline-block w-0.5 h-5 bg-teal-400 ml-0.5 animate-pulse align-middle" />
            </span>
          ) : (
            <span className="text-stone-300 text-sm">
              Start signing to see letters appear here…
            </span>
          )}
        </div>
      </div>

      {/* Manual translate button */}
      {rawChars.length > 0 && !isCorrecting && (
        <button
          onClick={onTranslateNow}
          className="w-full px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 flex items-center justify-center gap-2"
          aria-label="Translate now"
        >
          Translate now
          <ArrowRight size={14} />
        </button>
      )}

      {/* Corrected text */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
          Corrected text
        </label>

        <div
          className={[
            "min-h-[80px] px-4 py-3 rounded-2xl border transition-all duration-300",
            isCorrecting
              ? "border-teal-200 bg-gradient-to-r from-teal-50 via-white to-teal-50 bg-[length:200%_100%] animate-shimmer"
              : "border-stone-100 bg-white",
          ].join(" ")}
          aria-label="Autocorrected text"
          aria-live="polite"
          aria-busy={isCorrecting}
        >
          {isCorrecting ? (
            <div className="flex items-center gap-2 text-sm text-teal-500">
              <div className="w-3 h-3 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
              Correcting…
            </div>
          ) : correctedText ? (
            <p
              className={[
                "text-xl lg:text-2xl text-stone-800 leading-relaxed transition-opacity duration-500",
                fadeIn ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              {correctedText}
            </p>
          ) : (
            <span className="text-stone-300 text-sm">
              Autocorrected text will appear here…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
