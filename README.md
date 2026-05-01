# FingerSpell

**Real-time ASL fingerspelling to text translator.**  
Bridging the gap, one letter at a time.

Built for deaf and mute users. Reads individual ASL letters from a webcam, accumulates them into a character stream, and uses Gemini 1.5 Flash to add word spacing and fix misread letters.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | TailwindCSS |
| Language | TypeScript |
| Hand tracking | MediaPipe Hands (CDN, client-side) |
| Classifier | TensorFlow.js (browser) + KNN fallback |
| Training | Python + TensorFlow (GPU) |
| Autocorrect | Google Cloud Vertex AI — Gemini 1.5 Flash |
| Deployment | Vercel |

---

## Architecture

```
MediaPipe Hands (CDN)
  └─ 21 landmarks/frame at 30fps
       └─ normalizeLandmarks() → Float32Array(63)
            └─ TF.js MLP model (or KNN fallback)
                 └─ StabilityBuffer (8 frames hold, 15 frame cooldown)
                      └─ CharBuffer (accumulate letters)
                           └─ /api/autocorrect (Vertex AI Gemini 1.5 Flash)
                                └─ Corrected text displayed to user
```

### Classifier Architecture

**Small MLP** — Input(63) → Dense(128, relu) → Dropout(0.3) → Dense(64, relu) → Dropout(0.2) → Dense(34, softmax)

**Why MLP?** The input is already a compact, normalised feature vector. A CNN would add no value — there are no spatial correlations beyond what the landmarks encode. This MLP achieves ~95% validation accuracy on the Kaggle ASL Alphabet dataset, trains in minutes on an RTX 5070 Ti, and runs at 30fps in the browser with <1ms inference latency.

**34 output classes:** A–Z (excluding J and Z, which require motion) + 0–9.

---

## Quick Start (Next.js app)

```bash
# 1. Install dependencies
npm install
# or: pnpm install

# 2. Copy environment variables
cp .env.local.example .env.local
# Fill in GOOGLE_CLOUD_PROJECT and optionally GOOGLE_APPLICATION_CREDENTIALS_JSON

# 3. (Optional) Place your trained TF.js model
# Copy model.json + weight shards to public/model/
# Without the model, the app falls back to KNN automatically.

# 4. Run development server
npm run dev
# Open http://localhost:3000
```

---

## Training Pipeline

### Step 1 — Extract landmarks from the Kaggle dataset

```bash
# Download: https://www.kaggle.com/datasets/grassknoted/asl-alphabet
pip install mediapipe opencv-python numpy tqdm

python scripts/extract_landmarks.py \
  --dataset /path/to/asl_alphabet_train \
  --output asl_landmarks.json
```

### Step 2 — Train the classifier

```bash
pip install tensorflow numpy scikit-learn

python scripts/train.py \
  --landmarks asl_landmarks.json \
  --output saved_model/
```

Trains on GPU (RTX 5070 Ti) with mixed precision. Targets >90% validation accuracy.

### Step 3 — Export to TF.js format

```bash
pip install tensorflowjs

python scripts/export_model.py \
  --saved-model saved_model/ \
  --output public/model/
```

Or run the converter directly:
```bash
tensorflowjs_converter \
  --input_format=tf_saved_model \
  --output_format=tfjs_graph_model \
  --signature_name=serving_default \
  --saved_model_tags=serve \
  saved_model/ \
  public/model/
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Service account JSON as a single-line string (optional — falls back to ADC) |

**Local dev:** Run `gcloud auth application-default login` and omit `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

---

## Project Structure

```
app/
  page.tsx                    — Root page (dynamic import, ssr: false)
  layout.tsx                  — Root layout (fonts, MediaPipe CDN scripts)
  api/
    autocorrect/
      route.ts                — POST /api/autocorrect → Vertex AI Gemini
client/src/
  components/
    FingerSpell.tsx            — Top-level state owner
    WebcamPanel.tsx            — Canvas, MediaPipe, landmark drawing
    OutputPanel.tsx            — Raw chars + corrected text
    ConversationMode.tsx       — Deaf ↔ hearing chat UI
    ConfidenceDisplay.tsx      — Live letter, confidence bar, top-3
  hooks/
    useMediaPipe.ts            — MediaPipe Hands init + camera
    useClassifier.ts           — TF model loader + KNN fallback
    useStabilityBuffer.ts      — Debounce (8 frames hold, 15 cooldown)
    useCharBuffer.ts           — Letter accumulation + autocorrect trigger
  lib/
    normalize.ts               — normalizeLandmarks()
    knn.ts                     — KNN fallback classifier
    trainingData.ts            — Seed data for KNN cold-start
public/
  model/                       — model.json + weight shards (after export)
scripts/
  extract_landmarks.py         — MediaPipe → asl_landmarks.json
  train.py                     — Train MLP on RTX 5070 Ti
  export_model.py              — Keras → TF.js format
```

---

## Accessibility

- All interactive elements are keyboard accessible
- ARIA labels on canvas and output regions
- Color contrast meets WCAG AA throughout
- All animations wrapped in `@media (prefers-reduced-motion: no-preference)`
- Minimum 16px body text, 18px+ for key outputs

---

## Known Limitations

- **J and Z** are excluded — they require motion gestures (not static poses). "Full alphabet coming soon" is shown in the UI.
- The **KNN fallback** uses synthetic seed data. Replace `client/src/lib/trainingData.ts` with real extracted landmarks for better cold-start accuracy.
- The **TF model** must be trained and exported separately (see Training Pipeline above). The app works without it via KNN.
