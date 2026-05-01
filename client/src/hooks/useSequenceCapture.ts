/**
 * useSequenceCapture.ts
 * Design: Warm Paper Studio — hook for word detection
 *
 * Accumulates incoming holistic landmarks (255 floats per frame)
 * into a rolling buffer of 30 frames. When buffer hits 30 frames,
 * fires onSequenceReady(sequence) callback. Then resets and starts
 * collecting again.
 *
 * Returns: { addFrame, reset, bufferProgress (0-30) }
 */

import { useCallback, useRef, useState } from "react";

const SEQUENCE_LENGTH = 30;

export interface UseSequenceCaptureReturn {
  addFrame: (landmarks: number[]) => void;
  reset: () => void;
  bufferProgress: number;
}

interface UseSequenceCaptureOptions {
  onSequenceReady: (sequence: number[][]) => void;
}

export function useSequenceCapture({
  onSequenceReady,
}: UseSequenceCaptureOptions): UseSequenceCaptureReturn {
  const [bufferProgress, setBufferProgress] = useState(0);
  const sequenceRef = useRef<number[][]>([]);

  const addFrame = useCallback(
    (landmarks: number[]) => {
      // Add frame to sequence
      sequenceRef.current.push([...landmarks]);

      // Check if we've reached the target length
      if (sequenceRef.current.length >= SEQUENCE_LENGTH) {
        // Fire callback with the complete sequence
        onSequenceReady(sequenceRef.current);

        // Reset for next sequence
        sequenceRef.current = [];
        setBufferProgress(0);
      } else {
        // Update progress
        setBufferProgress(sequenceRef.current.length);
      }
    },
    [onSequenceReady]
  );

  const reset = useCallback(() => {
    sequenceRef.current = [];
    setBufferProgress(0);
  }, []);

  return {
    addFrame,
    reset,
    bufferProgress,
  };
}
