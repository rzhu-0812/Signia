/**
 * useMediaPipeHolistic.ts
 * Design: Warm Paper Studio — hook for word detection with full-body tracking.
 *
 * Initializes MediaPipe Holistic (hands + pose + face) from CDN.
 * Extracts and normalizes landmarks in the same format as the training data:
 *   - Left hand: 21 landmarks × 3 = 63 floats
 *   - Right hand: 21 landmarks × 3 = 63 floats
 *   - Body pose: 33 landmarks × 3 = 99 floats
 *   - Face (10 key points): 10 landmarks × 3 = 30 floats
 *   Total: 255 floats per frame
 *
 * Dependencies (CDN, loaded in index.html):
 *   @mediapipe/holistic — window.Holistic
 *   @mediapipe/camera_utils — window.Camera
 *   @mediapipe/drawing_utils — window.drawConnectors / window.drawLandmarks
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── MediaPipe Holistic type stubs (CDN globals) ─────────────────────────────
interface MPLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface MPHolisticResults {
  leftHandLandmarks?: MPLandmark[];
  rightHandLandmarks?: MPLandmark[];
  poseLandmarks?: MPLandmark[];
  faceLandmarks?: MPLandmark[];
  image: HTMLVideoElement | HTMLCanvasElement;
}

interface MPHolistic {
  setOptions(opts: {
    staticImageMode?: boolean;
    modelComplexity?: number;
    smoothLandmarks?: boolean;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }): void;
  onResults(cb: (results: MPHolisticResults) => void): void;
  send(inputs: { image: HTMLVideoElement }): Promise<void>;
  close(): void;
}

interface MPCamera {
  start(): Promise<void>;
  stop(): void;
}

declare global {
  interface Window {
    Holistic: new (config: { locateFile: (f: string) => string }) => MPHolistic;
    Camera: new (
      video: HTMLVideoElement,
      opts: {
        onFrame: () => Promise<void>;
        width?: number;
        height?: number;
      }
    ) => MPCamera;
  }
}

// ── Constants ───────────────────────────────────────────────────────────────
const HAND_LANDMARKS = 21;
const POSE_LANDMARKS = 33;
const FACE_KEY_INDICES = [1, 33, 263, 61, 291, 17, 0, 70, 300, 152]; // 10 key points
const FACE_LANDMARKS = FACE_KEY_INDICES.length;
const FEATURES_PER_FRAME = (HAND_LANDMARKS * 2 + POSE_LANDMARKS + FACE_LANDMARKS) * 3; // 255

// ── Normalization (same as training) ────────────────────────────────────────
function normalizeGroup(landmarks: MPLandmark[] | undefined): number[] {
  if (!landmarks || landmarks.length === 0) {
    return new Array(landmarks?.length ? landmarks.length * 3 : HAND_LANDMARKS * 3).fill(0);
  }

  const xs = landmarks.map((p) => p.x);
  const ys = landmarks.map((p) => p.y);
  const zs = landmarks.map((p) => p.z);

  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const cz = zs.reduce((a, b) => a + b, 0) / zs.length;

  const translated = landmarks.map((p) => ({
    x: p.x - cx,
    y: p.y - cy,
    z: p.z - cz,
  }));

  const xs_t = translated.map((p) => p.x);
  const ys_t = translated.map((p) => p.y);

  let scale = Math.max(
    Math.max(...xs_t) - Math.min(...xs_t),
    Math.max(...ys_t) - Math.min(...ys_t)
  );
  if (scale === 0) scale = 1.0;

  const out: number[] = [];
  for (const p of translated) {
    out.push(p.x / scale, p.y / scale, p.z / scale);
  }
  return out;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export type MediaPipeHolisticStatus = "idle" | "loading" | "ready" | "no_body" | "error";

export interface UseMediaPipeHolisticOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onFrameFeatures: (features: number[]) => void;
  onNoBody: () => void;
  drawLandmarks?: boolean;
}

export function useMediaPipeHolistic({
  videoRef,
  canvasRef,
  onFrameFeatures,
  onNoBody,
  drawLandmarks = true,
}: UseMediaPipeHolisticOptions) {
  const [status, setStatus] = useState<MediaPipeHolisticStatus>("idle");
  const holisticRef = useRef<MPHolistic | null>(null);
  const cameraRef = useRef<MPCamera | null>(null);

  const onFrameFeaturesRef = useRef(onFrameFeatures);
  const onNoBodyRef = useRef(onNoBody);
  onFrameFeaturesRef.current = onFrameFeatures;
  onNoBodyRef.current = onNoBody;

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setStatus("loading");

    try {
      // Wait for MediaPipe CDN scripts to load
      let attempts = 0;
      while (!window.Holistic && attempts < 50) {
        await new Promise((r) => setTimeout(r, 200));
        attempts++;
      }
      if (!window.Holistic) {
        setStatus("error");
        return;
      }

      const holistic = new window.Holistic({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
      });

      holistic.setOptions({
        staticImageMode: false,
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      holistic.onResults((results: MPHolisticResults) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas size
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        // Draw video frame
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Draw full body skeleton (pose connections)
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
          const pose = results.poseLandmarks;
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);

          // Draw pose connections (skeleton)
          const poseConnections = [
            // Head
            [0, 1], [1, 2], [2, 3], [3, 7],
            [0, 4], [4, 5], [5, 6], [6, 8],
            // Torso
            [9, 10],
            [11, 12],
            [11, 13], [13, 15],
            [12, 14], [14, 16],
            [11, 23],
            [12, 24],
            [23, 24],
            // Left arm
            [11, 13], [13, 15], [15, 17], [17, 19], [19, 21],
            // Right arm
            [12, 14], [14, 16], [16, 18], [18, 20], [20, 22],
            // Hips and legs (upper body only)
            [23, 25], [25, 27],
            [24, 26], [26, 28],
          ];

          // Draw connections
          ctx.strokeStyle = "#14b8a6";
          ctx.lineWidth = 2;
          for (const [start, end] of poseConnections) {
            const p1 = pose[start];
            const p2 = pose[end];
            if (p1 && p2 && p1.visibility! > 0.5 && p2.visibility! > 0.5) {
              ctx.beginPath();
              ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
              ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
              ctx.stroke();
            }
          }

          // Draw pose landmarks as circles
          ctx.fillStyle = "#0f766e";
          for (const lm of pose) {
            if (lm.visibility! > 0.5) {
              ctx.beginPath();
              ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
              ctx.fill();
            }
          }

          ctx.restore();
        }

        // Draw hand landmarks
        if (results.leftHandLandmarks && results.leftHandLandmarks.length > 0) {
          const hand = results.leftHandLandmarks;
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);

          // Draw hand connections
          const handConnections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12],
            [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20],
          ];

          ctx.strokeStyle = "#06b6d4";
          ctx.lineWidth = 1.5;
          for (const [start, end] of handConnections) {
            const p1 = hand[start];
            const p2 = hand[end];
            if (p1 && p2) {
              ctx.beginPath();
              ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
              ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
              ctx.stroke();
            }
          }

          ctx.fillStyle = "#0891b2";
          for (const lm of hand) {
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 2, 0, 2 * Math.PI);
            ctx.fill();
          }

          ctx.restore();
        }

        if (results.rightHandLandmarks && results.rightHandLandmarks.length > 0) {
          const hand = results.rightHandLandmarks;
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);

          // Draw hand connections
          const handConnections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12],
            [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20],
          ];

          ctx.strokeStyle = "#06b6d4";
          ctx.lineWidth = 1.5;
          for (const [start, end] of handConnections) {
            const p1 = hand[start];
            const p2 = hand[end];
            if (p1 && p2) {
              ctx.beginPath();
              ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
              ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
              ctx.stroke();
            }
          }

          ctx.fillStyle = "#0891b2";
          for (const lm of hand) {
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 2, 0, 2 * Math.PI);
            ctx.fill();
          }

          ctx.restore();
        }

        // Check if we have body landmarks
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
          // Extract features in training format
          const features: number[] = [];

          // Left hand (21 landmarks × 3)
          if (results.leftHandLandmarks && results.leftHandLandmarks.length === HAND_LANDMARKS) {
            features.push(...normalizeGroup(results.leftHandLandmarks));
          } else {
            features.push(...new Array(HAND_LANDMARKS * 3).fill(0));
          }

          // Right hand (21 landmarks × 3)
          if (results.rightHandLandmarks && results.rightHandLandmarks.length === HAND_LANDMARKS) {
            features.push(...normalizeGroup(results.rightHandLandmarks));
          } else {
            features.push(...new Array(HAND_LANDMARKS * 3).fill(0));
          }

          // Pose (33 landmarks × 3)
          features.push(...normalizeGroup(results.poseLandmarks));

          // Face (10 key points × 3)
          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const faceKeyPoints = FACE_KEY_INDICES
              .map((i) => results.faceLandmarks![i])
              .filter((p) => p);
            features.push(...normalizeGroup(faceKeyPoints));
          } else {
            features.push(...new Array(FACE_LANDMARKS * 3).fill(0));
          }

          onFrameFeaturesRef.current(features);
          setStatus("ready");
        } else {
          onNoBodyRef.current();
          setStatus("no_body");
        }
      });

      holisticRef.current = holistic;

      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && holisticRef.current) {
            await holisticRef.current.send({ image: videoRef.current });
          }
        },
        width: 1280,
        height: 720,
      });

      await camera.start();
      cameraRef.current = camera;
      setStatus("ready");
    } catch (err) {
      console.error("MediaPipe Holistic init error:", err);
      setStatus("error");
    }
  }, [videoRef, canvasRef, drawLandmarks]);

  const stop = useCallback(() => {
    cameraRef.current?.stop();
    holisticRef.current?.close();
    holisticRef.current = null;
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
