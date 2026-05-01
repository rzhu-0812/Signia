/**
 * useMediaPipe.ts
 * Design: Warm Paper Studio — hook, no UI concerns.
 *
 * Initialises MediaPipe Hands (loaded from CDN) and attaches it to a
 * <video> element. Calls onResults with the raw landmark array on every
 * processed frame. Must only run in the browser (ssr: false / useEffect).
 *
 * Dependencies (CDN, loaded in index.html):
 *   @mediapipe/hands  — window.Hands
 *   @mediapipe/camera_utils — window.Camera
 *   @mediapipe/drawing_utils — window.drawConnectors / window.drawLandmarks
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Landmark } from "@/lib/normalize";

// ── MediaPipe type stubs (CDN globals) ──────────────────────────────────────
interface MPResults {
  multiHandLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
  multiHandedness?: Array<{ label: string; score: number }>;
  image: HTMLVideoElement | HTMLCanvasElement;
}

interface MPHands {
  setOptions(opts: {
    maxNumHands?: number;
    modelComplexity?: number;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }): void;
  onResults(cb: (results: MPResults) => void): void;
  send(inputs: { image: HTMLVideoElement }): Promise<void>;
  close(): void;
}

interface MPCamera {
  start(): Promise<void>;
  stop(): void;
}

declare global {
  interface Window {
    Hands: new (config: { locateFile: (f: string) => string }) => MPHands;
    Camera: new (
      video: HTMLVideoElement,
      opts: {
        onFrame: () => Promise<void>;
        width?: number;
        height?: number;
        facingMode?: "user" | "environment";
      }
    ) => MPCamera;
    drawConnectors: (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      connections: unknown[],
      style: { color: string; lineWidth: number }
    ) => void;
    drawLandmarks: (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      style: { color: string; lineWidth: number; radius: number }
    ) => void;
    HAND_CONNECTIONS: unknown[];
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export type MediaPipeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "no_hand"
  | "error";

export interface UseMediaPipeOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onLandmarks: (landmarks: Landmark[], handedness: string) => void;
  onNoHand: () => void;
  drawLandmarks?: boolean;
  facingMode?: "user" | "environment";
}

export function useMediaPipe({
  videoRef,
  canvasRef,
  onLandmarks,
  onNoHand,
  drawLandmarks = true,
  facingMode = "user",
}: UseMediaPipeOptions) {
  const [status, setStatus] = useState<MediaPipeStatus>("idle");
  const handsRef = useRef<MPHands | null>(null);
  const cameraRef = useRef<MPCamera | null>(null);

  const onLandmarksRef = useRef(onLandmarks);
  const onNoHandRef = useRef(onNoHand);
  onLandmarksRef.current = onLandmarks;
  onNoHandRef.current = onNoHand;

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setStatus("loading");

    try {
      // Wait for MediaPipe CDN scripts to load
      let attempts = 0;
      while (!window.Hands && attempts < 50) {
        await new Promise((r) => setTimeout(r, 200));
        attempts++;
      }
      if (!window.Hands) {
        setStatus("error");
        return;
      }

      const hands = new window.Hands({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });

      hands.onResults((results: MPResults) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Mirror the canvas if facing user
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        ctx.save();
        if (facingMode === "user") {
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);
        }
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        if (
          results.multiHandLandmarks &&
          results.multiHandLandmarks.length > 0
        ) {
          const lms = results.multiHandLandmarks[0];

          if (drawLandmarks && window.drawConnectors && window.drawLandmarks) {
            // Draw on canvas, applying mirror if needed
            ctx.save();
            if (facingMode === "user") {
              ctx.scale(-1, 1);
              ctx.translate(-canvas.width, 0);
            }
            window.drawConnectors(ctx, lms, window.HAND_CONNECTIONS, {
              color: "#14b8a6",
              lineWidth: 2,
            });
            window.drawLandmarks(ctx, lms, {
              color: "#0f766e",
              lineWidth: 1,
              radius: 3,
            });
            ctx.restore();
          }

          // Check handedness — MediaPipe reports from camera's perspective
          // "Left" from camera = user's right hand, "Right" from camera = user's left hand
          const handedness = results.multiHandedness?.[0]?.label ?? "Right";

          // Mirror left-hand landmarks (user's left hand = "Right" from camera)
          let processedLms: Landmark[];
          if (handedness === "Right") {
            // User's left hand — flip x coordinates
            processedLms = (lms as Landmark[]).map(lm => ({ ...lm, x: 1 - lm.x }));
          } else {
            processedLms = lms as Landmark[];
          }

          onLandmarksRef.current(processedLms, handedness);
          setStatus("ready");
        } else {
          onNoHandRef.current();
          setStatus("no_hand");
        }
      });

      handsRef.current = hands;

      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && handsRef.current) {
            await handsRef.current.send({ image: videoRef.current });
          }
        },
        width: 1280,
        height: 720,
        facingMode,
      });

      await camera.start();
      cameraRef.current = camera;
      setStatus("ready");
    } catch (err) {
      console.error("MediaPipe init error:", err);
      setStatus("error");
    }
  }, [videoRef, canvasRef, drawLandmarks, facingMode]);

  const stop = useCallback(() => {
    cameraRef.current?.stop();
    handsRef.current?.close();
    handsRef.current = null;
    cameraRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    start();
    return () => {
      stop();
    };
  }, [start, stop]);

  return { status, stop, restart: start };
}
