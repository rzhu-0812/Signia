/**
 * useCharBuffer.ts
 * Design: Warm Paper Studio — hook, no UI concerns.
 *
 * Accumulates emitted letters and triggers autocorrect after:
 *   - 2 seconds of silence, OR
 *   - User manually clicks "Translate now"
 *
 * Uses Google Flan-T5 via HuggingFace free API in production.
 * On localhost, HuggingFace blocks CORS so autocorrect falls back
 * to simple lowercase — works fine for local testing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const SILENCE_MS = 2000;

const HF_API_URL =
  "https://api-inference.huggingface.co/models/google/flan-t5-large";

const HF_TOKEN = import.meta.env.VITE_HF_TOKEN ?? "";

// HuggingFace blocks CORS from localhost — only call in production
const IS_PROD = !window.location.hostname.includes("localhost") &&
  !window.location.hostname.includes("127.0.0.1");

async function callAutocorrect(chars: string): Promise<string> {
  // On localhost just return lowercased — HF blocks CORS from localhost
  if (!IS_PROD) {
    return chars.toLowerCase();
  }

  const prompt = `Add spaces between words and fix spelling in this ASL fingerspelling output: ${chars.trim()}. Output only the corrected lowercase text.`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (HF_TOKEN) {
      headers["Authorization"] = `Bearer ${HF_TOKEN}`;
    }

    const res = await fetch(HF_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 80,
          temperature: 0.1,
        },
      }),
    });

    if (res.status === 503) {
      console.warn("HF model warming up");
      return chars.toLowerCase();
    }

    if (!res.ok) {
      console.warn("HF API error:", res.status);
      return chars.toLowerCase();
    }

    const data = await res.json();

    const generated: string = Array.isArray(data)
      ? (data[0]?.generated_text ?? "")
      : (data?.generated_text ?? "");

    const cleaned = generated.trim().toLowerCase();
    return cleaned || chars.toLowerCase();
  } catch (err) {
    console.warn("Autocorrect failed:", err);
    return chars.toLowerCase();
  }
}

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
      const corrected = await callAutocorrect(chars);
      setCorrectedText(corrected);
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
    (_chars: string) => {
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