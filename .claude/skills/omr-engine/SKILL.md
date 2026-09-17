---
name: omr-engine
description: Design and implementation rules for e-proshno's OMR module — template JSON, printable sheet generation with ArUco markers and QR, the Python/OpenCV evaluation pipeline, multiple-touch/blank/ambiguous detection, negative-mark scoring, token credits, review UI and the accuracy test harness. Use for anything under OMR.
---

# OMR engine

## Components
- **Template** (`OmrTemplate.Layout`, jsonb): single source of geometry used by both the sheet generator and the reader.
  Units are millimetres. C# model in `backend/src/EProshno.Core/Omr/OmrLayout.cs`; the Python service loads the same JSON.
- **Sheet generator**: React component in `frontend/src/paper/omr/` rendered at `/print/omr/:templateId` → PDF through the
  Worker's Playwright renderer (same path as papers).
- **Reader**: `services/omr` FastAPI, stateless, no DB access. `POST /v1/evaluate` with a presigned image URL + template → JSON.
  Called only by the Worker through a typed `OmrServiceClient` (bearer `Omr:Token`, 30 s timeout, retries on 5xx only — the call is idempotent).
- **Orchestrator**: Hangfire job `EvaluateOmrScanJob` in `backend/src/EProshno.Worker/Jobs/` calls the reader, scores with
  `OmrScoring` (Core), writes `OmrScan`, deducts tokens, and publishes batch progress for SignalR.
- Why Python rather than OpenCvSharp: a richer CV ecosystem and fast threshold experiments. Revisit only via an ADR.

## Template JSON
```json
{
  "id": "mcq-60-4opt-v1",
  "page": { "widthMm": 210, "heightMm": 297 },
  "markers": { "type": "aruco4x4_50", "sizeMm": 10, "ids": [0, 1, 2, 3],
               "centersMm": [[12, 12], [198, 12], [12, 285], [198, 285]] },
  "qr": { "xMm": 165, "yMm": 22, "sizeMm": 24 },
  "bubble": { "diameterMm": 4.2 },
  "fields": [
    { "key": "roll", "kind": "digits", "digits": 6, "originMm": [22, 48], "pitchMm": [6.0, 5.4] },
    { "key": "setCode", "kind": "choice", "choices": ["ক", "খ", "গ", "ঘ"], "originMm": [72, 48], "pitchMm": [6.0, 0] },
    { "key": "answers", "kind": "grid", "questions": 60, "options": 4, "perColumn": 20,
      "originMm": [22, 110], "pitchMm": [6.0, 8.0], "columnOffsetMm": 62 }
  ]
}
```
QR payload: `{ t: templateId, b: omrBatchId, v: 1 }` (short, signed with HMAC suffix).
Print sheets in black only; bubbles with a light outline so fills contrast strongly.

## Reader pipeline (`services/omr/app/pipeline.py`)
1. **Load**: JPEG/PNG directly; PDF pages rasterised at 200–300 DPI with pypdfium2. Fix EXIF orientation.
2. **Markers**: `cv2.aruco` detect the 4 ids; if < 4 found, return `status: "MARKERS_NOT_FOUND"` (don't guess).
3. **Warp**: perspective transform to canonical resolution 10 px/mm (2100 × 2970).
4. **QR**: decode; verify template and batch match the request; mismatch → `status: "WRONG_SHEET"`.
5. **Binarise**: grayscale → Gaussian blur → adaptive threshold (or Otsu on a locally normalised image).
6. **Sample**: for each bubble, circular mask at 80 % diameter; `fill = dark_pixels / mask_pixels`.
7. **Classify per question** (thresholds from template config, calibrated on fixtures, never inline magic numbers):
   - `FILLED` if fill ≥ `fill_min` (start ≈ 0.45)
   - `MULTIPLE` if 2+ options are FILLED  ← multiple-touch detection
   - `BLANK` if max fill < `blank_max` (start ≈ 0.20)
   - `AMBIGUOUS` if max is between thresholds, or top − second < `margin_min` (start ≈ 0.15)
8. **Roll / set code**: same classification per digit/choice; any non-single result → flag field.
9. **Output**:
```json
{ "status": "OK", "templateId": "...", "roll": "012345", "setCode": 1,
  "answers": [0, 2, null, "MULTIPLE", ...], "flags": [{ "q": 4, "type": "AMBIGUOUS", "fills": [0.31, 0.12, 0.05, 0.02] }],
  "overlayPng": "<uploaded key>" }
```
   The overlay image draws detected bubbles (green = read, red = flagged) for the review UI.

## Scoring (`EProshno.Core/Omr/OmrScoring.cs`, xUnit-tested)
- Answer key per set code from `OmrBatch.answerKey`.
- correct → `+marks`; wrong → `−negativeMark`; BLANK / MULTIPLE → 0 (configurable per batch); AMBIGUOUS → hold for review.
- A scan with any AMBIGUOUS answer or flagged roll/set code goes to `NEEDS_REVIEW`; the teacher fixes it on the
  overlay view and the scan is re-scored without re-running CV.

## Tokens
- `OmrTokenLedger` rows (+purchase, −evaluation, +refund). Balance = sum.
- Deduct 1 token in the same DB transaction that stores a successful first evaluation. Re-evaluating the same scan
  or failed scans (markers not found, wrong sheet) cost nothing.

## Accuracy harness (required before release)
- Fixtures: `services/omr/tests/fixtures/{scanner,phone}/<name>.jpg` + `<name>.expected.json`, from 100+ real filled
  sheets including light pencil marks, erasures, crossed-out bubbles, shadows, skew and crumpled paper.
- `pytest -m accuracy` reports bubble-level accuracy and flag rate per folder. Gates: scanner ≥ 99.5 %,
  phone ≥ 98 %, false "FILLED" on blank bubbles ≤ 0.1 %. CI fails on regression.
- Never tune thresholds on the same fixtures you report on: keep a held-out set.

## Performance
≤ 3 s per sheet on 1 vCPU; batch uploads processed with concurrency limited per institution.
