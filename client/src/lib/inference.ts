/**
 * lib/inference.ts
 * Lightweight MLP forward pass in pure TypeScript (no external dependencies)
 *
 * Architecture (matches trained model):
 *   GaussianNoise (skip)
 *   Dense(256, relu) → BatchNorm → Dropout (skip)
 *   Dense(128, relu) → BatchNorm → Dropout (skip)
 *   Dense(64, relu) → Dropout (skip)
 *   Dense(24, softmax)
 *
 * 24 output classes: A-Y (no J, Z — they require motion gestures)
 */

export interface InferenceResult {
  label: string;
  confidence: number;
  topK: Array<{ label: string; confidence: number }>;
}

// ── Weight structures ────────────────────────────────────────────────────────

interface DenseWeights {
  kernel: number[][]; // [input_units, output_units]
  bias: number[];     // [output_units]
}

interface BatchNormWeights {
  gamma: number[];        // scale
  beta: number[];         // offset
  movingMean: number[];   // running mean
  movingVar: number[];    // running variance
}

interface ModelWeights {
  dense_1: DenseWeights;
  bn_1: BatchNormWeights;
  dense_2: DenseWeights;
  bn_2: BatchNormWeights;
  dense_3: DenseWeights;
  output: DenseWeights;
}

// ── State ────────────────────────────────────────────────────────────────────

let modelWeights: ModelWeights | null = null;
let labelMap: string[] = [];
let loadingPromise: Promise<void> | null = null;

// ── Loading ──────────────────────────────────────────────────────────────────

async function loadModel(): Promise<void> {
  if (modelWeights) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Load weights and label map in parallel
    const [weightsResp, labelResp] = await Promise.all([
      fetch("/model/weights.json"),
      fetch("/model/label_map.json"),
    ]);

    if (!weightsResp.ok) throw new Error(`weights.json: ${weightsResp.status}`);
    if (!labelResp.ok) throw new Error(`label_map.json: ${labelResp.status}`);

    const weightsData = (await weightsResp.json()) as Array<{
      name: string;
      weights: number[][] | number[];
    }>;
    const labelData = (await labelResp.json()) as Record<string, string>;

    // Build label array from map {0: "A", 1: "B", ...}
    const maxIdx = Math.max(...Object.keys(labelData).map(Number));
    labelMap = new Array(maxIdx + 1);
    for (const [idx, letter] of Object.entries(labelData)) {
      labelMap[Number(idx)] = letter;
    }

    // Parse weights by layer name
    const layerMap = new Map<string, any>();
    for (const layer of weightsData) {
      layerMap.set(layer.name, layer.weights);
    }

    const getDense = (name: string): DenseWeights => {
      const w = layerMap.get(name);
      if (!w || w.length < 2) throw new Error(`Missing dense layer: ${name}`);
      return { kernel: w[0] as number[][], bias: w[1] as number[] };
    };

    const getBatchNorm = (name: string): BatchNormWeights => {
      const w = layerMap.get(name);
      if (!w || w.length < 4) throw new Error(`Missing batchnorm layer: ${name}`);
      return {
        gamma: w[0] as number[],
        beta: w[1] as number[],
        movingMean: w[2] as number[],
        movingVar: w[3] as number[],
      };
    };

    modelWeights = {
      dense_1: getDense("dense_1"),
      bn_1: getBatchNorm("bn_1"),
      dense_2: getDense("dense_2"),
      bn_2: getBatchNorm("bn_2"),
      dense_3: getDense("dense_3"),
      output: getDense("output"),
    };

    console.log(`Model loaded: ${labelMap.length} classes, weights ready`);
  })();

  return loadingPromise;
}

// ── Math operations ──────────────────────────────────────────────────────────

/**
 * Dense layer: output[j] = activation(sum_i(input[i] * kernel[i][j]) + bias[j])
 * kernel shape: [input_units, output_units]
 */
function denseForward(
  input: number[],
  kernel: number[][],
  bias: number[],
  activation: "relu" | "softmax" | "none" = "none"
): number[] {
  const outputSize = bias.length;
  const output = new Array<number>(outputSize);

  for (let j = 0; j < outputSize; j++) {
    let sum = bias[j];
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * kernel[i][j];
    }
    output[j] = sum;
  }

  if (activation === "relu") {
    for (let j = 0; j < outputSize; j++) {
      if (output[j] < 0) output[j] = 0;
    }
  } else if (activation === "softmax") {
    const maxVal = Math.max(...output);
    let sumExp = 0;
    for (let j = 0; j < outputSize; j++) {
      output[j] = Math.exp(output[j] - maxVal);
      sumExp += output[j];
    }
    for (let j = 0; j < outputSize; j++) {
      output[j] /= sumExp;
    }
  }

  return output;
}

/**
 * BatchNormalization at inference time:
 *   y = gamma * (x - movingMean) / sqrt(movingVar + epsilon) + beta
 * epsilon = 0.001 (from model_config)
 */
function batchNormForward(
  input: number[],
  bn: BatchNormWeights,
  epsilon: number = 0.001
): number[] {
  const output = new Array<number>(input.length);
  for (let i = 0; i < input.length; i++) {
    const normalized = (input[i] - bn.movingMean[i]) / Math.sqrt(bn.movingVar[i] + epsilon);
    output[i] = bn.gamma[i] * normalized + bn.beta[i];
  }
  return output;
}

// ── Forward pass ─────────────────────────────────────────────────────────────

function forward(input: number[]): number[] {
  const w = modelWeights!;

  // Dense(256, relu) → BatchNorm
  let x = denseForward(input, w.dense_1.kernel, w.dense_1.bias, "relu");
  x = batchNormForward(x, w.bn_1);

  // Dense(128, relu) → BatchNorm
  x = denseForward(x, w.dense_2.kernel, w.dense_2.bias, "relu");
  x = batchNormForward(x, w.bn_2);

  // Dense(64, relu)
  x = denseForward(x, w.dense_3.kernel, w.dense_3.bias, "relu");

  // Dense(24, softmax)
  x = denseForward(x, w.output.kernel, w.output.bias, "softmax");

  return x;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Preload model weights on app startup
 */
export async function preloadModel(): Promise<void> {
  await loadModel();
}

/**
 * Predict the ASL letter from a normalized landmark vector (Float32Array(63))
 */
export async function predict(
  landmarks: Float32Array,
  topK: number = 3
): Promise<InferenceResult> {
  await loadModel();

  const input = Array.from(landmarks);
  const probs = forward(input);

  // Find top prediction
  let maxIdx = 0;
  let maxProb = probs[0];
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > maxProb) {
      maxProb = probs[i];
      maxIdx = i;
    }
  }

  // Get top-K
  const indexed = probs.map((p, i) => ({ label: labelMap[i] ?? String(i), confidence: p }));
  indexed.sort((a, b) => b.confidence - a.confidence);

  return {
    label: labelMap[maxIdx] ?? String(maxIdx),
    confidence: maxProb,
    topK: indexed.slice(0, topK),
  };
}
