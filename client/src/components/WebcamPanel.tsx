/**
 * WebcamPanel.tsx
 * Design: Warm Paper Studio
 * - Teal glow ring on canvas when hand is detected
 * - Friendly hand SVG + "Show your hand to the camera" when no hand
 * - "Loading model..." subtle state while MediaPipe initialises
 * - Canvas is mirrored so user sees their hand naturally
 * - Supports two aspect ratios: standard (16:9) for letters, tall (3:4) for words
 */

"use client";

import { useRef } from "react";
import { Hand } from "lucide-react";
import { useMediaPipe, type MediaPipeStatus } from "@/hooks/useMediaPipe";
import type { Landmark } from "@/lib/normalize";

interface WebcamPanelProps {
  aspectRatio?: "standard" | "tall";
  onLandmarks: (landmarks: Landmark[], handedness: string) => void;
  onNoHand: () => void;
}

export function WebcamPanel({
  aspectRatio = "standard",
  onLandmarks,
  onNoHand,
}: WebcamPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { status } = useMediaPipe({
    videoRef,
    canvasRef,
    onLandmarks,
    onNoHand,
    drawLandmarks: true,
  });

  const containerClass =
    aspectRatio === "tall"
      ? "aspect-[3/4] max-h-[60vh]"
      : "aspect-[4/3] max-h-[55vh]";

  return (
    <div className="relative flex flex-col gap-3">
      {/* Camera container */}
      <div
        className={[
          "relative rounded-3xl overflow-hidden bg-stone-100 w-full",
          containerClass,
          "transition-all duration-300",
          status === "ready"
            ? "ring-2 ring-teal-400 shadow-lg shadow-teal-100"
            : "ring-1 ring-stone-200",
        ].join(" ")}
        aria-label="Webcam feed with hand landmark overlay"
        role="img"
      >
        {/* Hidden video element — MediaPipe reads from this */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover opacity-0"
          autoPlay
          playsInline
          muted
          aria-hidden="true"
        />

        {/* Visible canvas — MediaPipe draws onto this */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden="true"
        />

        {/* Overlay states */}
        {(status === "idle" || status === "loading") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-50/90">
            <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
            <p className="text-sm text-stone-500 font-medium">
              Starting camera…
            </p>
          </div>
        )}

        {status === "no_hand" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-stone-50/80">
            <Hand size={80} className="text-teal-400 opacity-60 animate-pulse" />
            <p className="text-base text-stone-600 font-medium text-center px-4">
              Show your hand to the camera
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-red-50/90 px-6">
            <p className="text-sm text-red-600 font-medium text-center">
              Camera unavailable. Please allow camera access and reload.
            </p>
          </div>
        )}
      </div>

      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-block w-2 h-2 rounded-full",
            status === "ready" ? "bg-teal-500 animate-pulse" : "bg-stone-300",
          ].join(" ")}
        />
        <span className="text-xs text-stone-400 font-medium tracking-wide uppercase">
          {statusLabel(status)}
        </span>
      </div>
    </div>
  );
}

function statusLabel(status: MediaPipeStatus): string {
  switch (status) {
    case "idle":
    case "loading":
      return "Initialising…";
    case "ready":
      return "Hand detected";
    case "no_hand":
      return "No hand detected";
    case "error":
      return "Camera error";
  }
}


