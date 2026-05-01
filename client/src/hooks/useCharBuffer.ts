/**
 * useCharBuffer.ts
 * Design: Warm Paper Studio — hook, no UI concerns.
 *
 * Accumulates emitted letters into a raw character stream and triggers
 * the /api/autocorrect endpoint after:
 *   - 2 seconds of silence (no new letter emitted), OR
 *   - User manually clicks "Translate now" button
 *
 * Raw stream NEVER auto-clears — it only clears when user presses Clear button
 * or sends a message. This allows the user to see their full fingerspelling
 * stream and correct it incrementally.
 *
 * Returns:
 *   rawChars       — the current raw character stream
 *   correctedText  — the latest autocorrected text (empty string if none)
 *   isCorrecting   — true while waiting for the API response
 *   addLetter      — call with each emitted letter
 *   clearAll       — reset everything
 *   deleteLastChar — remove last character
 *   manualTrigger  — manually trigger autocorrect immediately
 */

import { useCallback, useEffect, useRef, useState } from "react";

const SILENCE_MS = 2000;

export interface UseCharBufferReturn {
  rawChars: string;
  correctedText: string;
  isCorrecting: boolean;
  addLetter: (letter: string) => void;
  clearAll: () => void;
  deleteLastChar: () => void;
  manualTrigger: () => void;
}

export function useCharBuffer(): UseCharBufferReturn {
  const [rawChars, setRawChars] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [isCorrecting, setIsCorrecting] = useState(false);

  const rawCharsRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  const triggerAutocorrect = useCallback(async (chars: string) => {
    if (!chars.trim() || pendingRef.current) return;
    pendingRef.current = true;
    setIsCorrecting(true);

    try {
      const res = await fetch("/api/autocorrect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chars }),
      });

      if (res.ok) {
        const data = (await res.json()) as { corrected: string };
        setCorrectedText(data.corrected);
      } else {
        // Graceful degradation: show raw chars lowercased
        setCorrectedText(chars.toLowerCase());
      }
    } catch {
      setCorrectedText(chars.toLowerCase());
    } finally {
      pendingRef.current = false;
      setIsCorrecting(false);
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(
    (chars: string) => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        if (rawCharsRef.current.trim()) {
          triggerAutocorrect(rawCharsRef.current);
        }
      }, SILENCE_MS);
    },
    [clearSilenceTimer, triggerAutocorrect]
  );

  const addLetter = useCallback(
    (letter: string) => {
      const next = rawCharsRef.current + letter;
      rawCharsRef.current = next;
      setRawChars(next);
      resetSilenceTimer(next);
    },
    [resetSilenceTimer]
  );

  const clearAll = useCallback(() => {
    clearSilenceTimer();
    rawCharsRef.current = "";
    setRawChars("");
    setCorrectedText("");
    setIsCorrecting(false);
    pendingRef.current = false;
  }, [clearSilenceTimer]);

  const deleteLastChar = useCallback(() => {
    const next = rawCharsRef.current.slice(0, -1);
    rawCharsRef.current = next;
    setRawChars(next);
    clearSilenceTimer();
    if (next.length > 0) {
      resetSilenceTimer(next);
    }
  }, [clearSilenceTimer, resetSilenceTimer]);

  const manualTrigger = useCallback(() => {
    clearSilenceTimer();
    if (rawCharsRef.current.trim()) {
      triggerAutocorrect(rawCharsRef.current);
    }
  }, [clearSilenceTimer, triggerAutocorrect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
    };
  }, [clearSilenceTimer]);

  return {
    rawChars,
    correctedText,
    isCorrecting,
    addLetter,
    clearAll,
    deleteLastChar,
    manualTrigger,
  };
}
