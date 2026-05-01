/**
 * useCharBuffer.ts
 * Uses Google Gemini Flash — free tier, 1500 requests/day, no credit card.
 * Get key at aistudio.google.com
 * Add VITE_GEMINI_API_KEY to .env.local
 */

import { Groq } from 'groq-sdk';
import { useCallback, useEffect, useRef, useState } from "react";

const SILENCE_MS = 600;
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY ?? "";

const groq = new Groq({ 
  apiKey: GROQ_KEY,
  dangerouslyAllowBrowser: true
});

async function callAutocorrect(chars: string, onChunk: (text: string) => void): Promise<void> {
  if (!GROQ_KEY) {
    console.warn("No VITE_GROQ_API_KEY set — showing raw chars");
    onChunk(chars.toLowerCase());
    return;
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You correct ASL fingerspelling output. Input is raw uppercase letters with no spaces. Common misreads: A/E/S, U/V, M/N. Add word boundaries and fix obvious errors. Output ONLY the corrected lowercase text. Nothing else."
        },
        {
          role: "user",
          content: chars.trim()
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 150,
      top_p: 1,
      stream: true,
      stop: null,
    });

    for await (const chunk of chatCompletion) {
      onChunk(chunk.choices[0]?.delta?.content || '');
    }
  } catch (err: any) {
    console.warn("Groq API error:", err);
    onChunk(chars.toLowerCase());
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
    setCorrectedText(""); // Clear text before streaming
    
    try {
      let fullText = "";
      await callAutocorrect(chars, (chunk) => {
        fullText += chunk;
        setCorrectedText(fullText.toLowerCase());
      });
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
    return () => { clearSilenceTimer(); };
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