// src/main/services/OmrEngine.ts
// The OMR engine: image alignment plus deterministic bubble detection.
// See design §5 (OmrEngine).
//
// Determinism boundary: the homography solver, `detect`, and every helper in this
// file are PURE functions of their inputs — no clock reads, no randomness, no I/O.
// The only impure edge is `loadImage` (jimp decode of a file from disk).
//
// Coordinate convention: `SheetLayout` geometry is sheet-normalized (0..1). The
// homography produced by `align` maps sheet-normalized coordinates -> image
// pixels, so the detector (task 5.3) can project each bubble center into the
// captured image.

import Jimp from 'jimp'
import type { SheetLayout, FiducialMarker, RowLayout } from '@shared/omr-layout'
import type { DetectedAnswer, SheetDetection, OmrConfig } from '@shared/omr-types'
import type { Point, RgbaImage } from './QrService'

// Re-export the shared pixel/point shapes so downstream modules (and the
// property tests) have a single import site for the engine's geometry types.
export type { Point, RgbaImage } from './QrService'

// ─── PUBLIC RESULT TYPES ───────────────────────────────────────────

/** Outcome of aligning a captured sheet image against its layout (Req 6). */
export interface AlignmentResult {
  ok: boolean
  /** 3x3 projective transform, row-major, mapping sheet-normalized -> image pixels. */
  homography?: number[]
  /** Number of usable point correspondences located (fiducials + QR corners). */
  markersFound: number
  /** 0..100 heuristic combining marker completeness and image contrast (Req 6.4). */
  quality: number
  /** Present when `ok` is false: why alignment could not be established (Req 6.3). */
  reason?: string
}

// ─── TUNING CONSTANTS ──────────────────────────────────────────────

/** Minimum correspondences required to solve a 4-point homography (Req 6.3). */
const MIN_CORRESPONDENCES = 4

/** Dark-square detection: a pixel counts as "dark" below this fraction of the mean luminance. */
const DARK_FRACTION = 0.5

/** Search-window half-size around a fiducial's nominal position, in fiducial-size multiples. */
const SEARCH_MULTIPLE = 3

/** Smallest connected dark region (in pixels) accepted as a fiducial square. */
const MIN_MARKER_AREA = 3

/** Luminance std-dev that maps to full contrast score (0..255 scale). */
const CONTRAST_FULL_SCALE = 64

/** Guard against singular/near-singular pivots in the linear solver. */
const PIVOT_EPSILON = 1e-12

// ─── DETECTION TUNING CONSTANTS ────────────────────────────────────

/** Luminance (0..255) at or below which a sampled pixel counts as "dark" (filled). */
const DARK_LUMINANCE_THRESHOLD = 128

/** Smallest sampling-disk radius, in pixels, so tiny projections still sample something. */
const MIN_SAMPLE_RADIUS_PX = 1

/** Tiny value to avoid divide-by-zero in confidence ratios. */
const CONFIDENCE_EPSILON = 1e-6

// ─── ENGINE ────────────────────────────────────────────────────────

export class OmrEngine {
  /**
   * Decode an image file into a flat RGBA buffer (Req 3.4).
   *
   * This is the engine's only impure edge: it reads a file from disk via `jimp`
   * (pure-JS decode of PNG/JPEG/BMP/TIFF). It THROWS when the file cannot be read
   * or decoded so the batch orchestrator can mark that sheet `failed` with a
   * reason and continue with the rest of the batch (Req 3.4).
   */
  async loadImage(filePath: string): Promise<RgbaImage> {
    let image: Jimp
    try {
      image = await Jimp.read(filePath)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(`Unreadable image file: ${detail}`)
    }

    const { data, width, height } = image.bitmap
    if (!width || !height) {
      throw new Error('Unreadable image file: decoded image has no pixels')
    }

    // jimp's bitmap.data is a Node Buffer of RGBA bytes; wrap it as the
    // Uint8ClampedArray shape the rest of the pipeline (and jsqr) expects.
    return {
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      width,
      height
    }
  }

  /**
   * Deterministically detect the filled bubbles of an aligned sheet (Req 7, 8).
   *
   * PURE over its inputs — no clock, no randomness, no I/O — so running it twice
   * on the same image + config yields deeply-equal results (Req 7.2). For every
   * layout row it projects each bubble center through the alignment homography,
   * samples a small grayscale disk around the projected center, and takes the
   * dark-pixel fraction (0..1) as that bubble's fill intensity. `classifyRow`
   * then applies the fixed `OmrConfig` thresholds, and per-answer / sheet
   * confidence are computed in the inclusive range 0..100 (Req 7.4, 7.5).
   *
   * Produces exactly one `DetectedAnswer` per layout row (Req 7.1). When no valid
   * homography is available the intensities collapse to zero, so every row reads
   * as `blank` and the sheet confidence reflects the (failed) alignment quality.
   */
  detect(
    img: RgbaImage,
    layout: SheetLayout,
    align: AlignmentResult,
    cfg: OmrConfig
  ): SheetDetection {
    const gray = toGrayscale(img)
    const homography = align.ok ? align.homography : undefined

    const answers: DetectedAnswer[] = layout.rows.map((row) =>
      detectRow(row, gray, img.width, img.height, homography, cfg)
    )

    return {
      answers,
      sheetConfidence: sheetConfidence(answers, align.quality)
    }
  }

  /**
   * Establish the sheet's orientation and boundaries (Req 6.1, 6.2).
   *
   * Locates the dark fiducial squares near their expected (nominal) positions and
   * combines them with the QR corner anchors supplied by the QR reader. With at
   * least four usable correspondences it solves a homography mapping
   * sheet-normalized coordinates -> image pixels and returns it alongside a
   * `quality` heuristic. With fewer than four (or a degenerate set that yields no
   * valid transform) it returns `{ ok: false, reason }` so the caller can mark
   * the sheet `alignment_failed` (Req 6.3).
   */
  align(img: RgbaImage, layout: SheetLayout, qrCorners: Point[] | null): AlignmentResult {
    const gray = toGrayscale(img)
    const { mean, std } = luminanceStats(gray)
    const darkThreshold = mean * DARK_FRACTION

    const src: Point[] = []
    const dst: Point[] = []

    // Fiducial squares: search near each marker's nominal image position.
    for (const f of layout.fiducials) {
      const located = locateDarkSquare(gray, img.width, img.height, f, darkThreshold)
      if (located) {
        src.push({ x: f.cx, y: f.cy })
        dst.push(located)
      }
    }

    // QR corners double as alignment anchors: pair the QR area's normalized
    // corners with the pixel corners jsqr returned (topLeft, topRight,
    // bottomRight, bottomLeft order).
    const hasQr = Array.isArray(qrCorners) && qrCorners.length === 4
    if (hasQr && qrCorners) {
      const a = layout.qrArea
      const qrSrc: Point[] = [
        { x: a.x, y: a.y },
        { x: a.x + a.w, y: a.y },
        { x: a.x + a.w, y: a.y + a.h },
        { x: a.x, y: a.y + a.h }
      ]
      for (let i = 0; i < 4; i++) {
        src.push(qrSrc[i])
        dst.push(qrCorners[i])
      }
    }

    const markersFound = src.length
    const expected = layout.fiducials.length + (hasQr ? 4 : 0)

    if (markersFound < MIN_CORRESPONDENCES) {
      return {
        ok: false,
        markersFound,
        quality: 0,
        reason: 'Could not locate enough reference markers'
      }
    }

    const homography = solveHomography(src, dst)
    if (!homography) {
      // Enough points were found but they were degenerate (e.g. collinear), so no
      // valid transform exists.
      return {
        ok: false,
        markersFound,
        quality: 0,
        reason: 'Could not locate enough reference markers'
      }
    }

    return {
      ok: true,
      homography,
      markersFound,
      quality: computeQuality(markersFound, expected, std)
    }
  }
}

// ─── HOMOGRAPHY (pure, exported for reuse/testing) ─────────────────

/**
 * Solve the 3x3 projective transform H such that, for each correspondence,
 * H * [x, y, 1]^T is proportional to [u, v, 1]^T (sheet-normalized `src` ->
 * image-pixel `dst`).
 *
 * Uses the Direct Linear Transform: fixing h33 = 1 gives two linear equations per
 * correspondence in eight unknowns. For four points this is exact; for more it is
 * a least-squares fit via the normal equations (AᵀA)h = Aᵀb. Deterministic and
 * pure. Returns null for fewer than four points or a singular/degenerate system.
 */
export function solveHomography(src: Point[], dst: Point[]): number[] | null {
  const n = Math.min(src.length, dst.length)
  if (n < MIN_CORRESPONDENCES) return null

  // Accumulate the 8x8 normal-equations matrix AtA and the 8-vector Atb.
  const AtA: number[][] = Array.from({ length: 8 }, () => new Array<number>(8).fill(0))
  const Atb: number[] = new Array<number>(8).fill(0)

  const accumulate = (row: number[], rhs: number): void => {
    for (let i = 0; i < 8; i++) {
      const ri = row[i]
      for (let j = 0; j < 8; j++) AtA[i][j] += ri * row[j]
      Atb[i] += ri * rhs
    }
  }

  for (let k = 0; k < n; k++) {
    const { x, y } = src[k]
    const { x: u, y: v } = dst[k]
    // u = h0*x + h1*y + h2 - h6*u*x - h7*u*y
    accumulate([x, y, 1, 0, 0, 0, -u * x, -u * y], u)
    // v = h3*x + h4*y + h5 - h6*v*x - h7*v*y
    accumulate([0, 0, 0, x, y, 1, -v * x, -v * y], v)
  }

  const h = solveLinearSystem(AtA, Atb)
  if (!h) return null

  const homography = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
  if (homography.some((value) => !Number.isFinite(value))) return null
  return homography
}

/**
 * Apply a row-major 3x3 homography to a point, returning the projected point in
 * the target space. Pure; the inverse-projection helper the detector (task 5.3)
 * will rely on.
 */
export function applyHomography(homography: number[], p: Point): Point {
  const u = homography[0] * p.x + homography[1] * p.y + homography[2]
  const v = homography[3] * p.x + homography[4] * p.y + homography[5]
  const w = homography[6] * p.x + homography[7] * p.y + homography[8]
  return { x: u / w, y: v / w }
}

// ─── LINEAR ALGEBRA (pure) ─────────────────────────────────────────

/**
 * Solve a square linear system `A x = b` via Gaussian elimination with partial
 * pivoting. Returns null when the matrix is singular (near-zero pivot). Operates
 * on copies, so the inputs are not mutated.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length
  // Build an augmented matrix [A | b] from copies of the inputs.
  const M: number[][] = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Partial pivot: pick the row with the largest magnitude in this column.
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < PIVOT_EPSILON) return null

    if (pivot !== col) {
      const tmp = M[col]
      M[col] = M[pivot]
      M[pivot] = tmp
    }

    // Eliminate this column from every other row.
    const pivotRow = M[col]
    const pivotVal = pivotRow[col]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col] / pivotVal
      if (factor === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= factor * pivotRow[c]
    }
  }

  const x = new Array<number>(n)
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i]
  return x
}

// ─── IMAGE HELPERS (pure) ──────────────────────────────────────────

/** Convert an RGBA buffer to a per-pixel luminance array (Rec. 601 weights). */
function toGrayscale(img: RgbaImage): Float32Array {
  const { data, width, height } = img
  const gray = new Float32Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return gray
}

/** Mean and population standard deviation of a luminance array (0..255 scale). */
function luminanceStats(gray: Float32Array): { mean: number; std: number } {
  const n = gray.length
  if (n === 0) return { mean: 0, std: 0 }
  let sum = 0
  for (let i = 0; i < n; i++) sum += gray[i]
  const mean = sum / n
  let variance = 0
  for (let i = 0; i < n; i++) {
    const d = gray[i] - mean
    variance += d * d
  }
  variance /= n
  return { mean, std: Math.sqrt(variance) }
}

/**
 * Locate the centroid of the largest connected dark region within a search
 * window around a fiducial's nominal image position. Returns null when no
 * sufficiently large dark region is present. Uses 4-connectivity flood fill over
 * a local visited map; deterministic and window-bounded.
 */
function locateDarkSquare(
  gray: Float32Array,
  width: number,
  height: number,
  f: FiducialMarker,
  darkThreshold: number
): Point | null {
  const nomX = Math.round(f.cx * width)
  const nomY = Math.round(f.cy * height)
  const halfW = Math.max(4, Math.round(f.size * width * SEARCH_MULTIPLE))
  const halfH = Math.max(4, Math.round(f.size * height * SEARCH_MULTIPLE))

  const x0 = Math.max(0, nomX - halfW)
  const x1 = Math.min(width - 1, nomX + halfW)
  const y0 = Math.max(0, nomY - halfH)
  const y1 = Math.min(height - 1, nomY + halfH)

  const winW = x1 - x0 + 1
  const winH = y1 - y0 + 1
  if (winW <= 0 || winH <= 0) return null

  const visited = new Uint8Array(winW * winH)
  const stack = new Int32Array(winW * winH) // reusable index stack (window-local indices)

  let bestArea = 0
  let bestSumX = 0
  let bestSumY = 0

  for (let sy = 0; sy < winH; sy++) {
    for (let sx = 0; sx < winW; sx++) {
      const local = sy * winW + sx
      if (visited[local]) continue
      const global = (sy + y0) * width + (sx + x0)
      if (gray[global] >= darkThreshold) {
        visited[local] = 1
        continue
      }

      // Flood-fill this connected dark region (4-connectivity).
      let area = 0
      let sumX = 0
      let sumY = 0
      let top = 0
      stack[top++] = local
      visited[local] = 1

      while (top > 0) {
        const cur = stack[--top]
        const cx = cur % winW
        const cy = (cur - cx) / winW
        area++
        sumX += cx + x0
        sumY += cy + y0

        // Candidate neighbours bounded to the window.
        const neighbours: number[] = []
        if (cx > 0) neighbours.push(cur - 1)
        if (cx < winW - 1) neighbours.push(cur + 1)
        if (cy > 0) neighbours.push(cur - winW)
        if (cy < winH - 1) neighbours.push(cur + winW)

        for (const nLocal of neighbours) {
          if (visited[nLocal]) continue
          visited[nLocal] = 1
          const nsx = nLocal % winW
          const nsy = (nLocal - nsx) / winW
          const nGlobal = (nsy + y0) * width + (nsx + x0)
          if (gray[nGlobal] < darkThreshold) stack[top++] = nLocal
        }
      }

      if (area > bestArea) {
        bestArea = area
        bestSumX = sumX
        bestSumY = sumY
      }
    }
  }

  if (bestArea < MIN_MARKER_AREA) return null
  return { x: bestSumX / bestArea, y: bestSumY / bestArea }
}

/**
 * Quality heuristic (0..100, Req 6.4): half from how many expected markers were
 * located, half from image contrast (luminance std dev). A blurry / low-contrast
 * or partially-detected sheet scores low so the caller can flag it for review.
 */
function computeQuality(markersFound: number, expected: number, std: number): number {
  const completeness = expected > 0 ? Math.min(1, markersFound / expected) : 0
  const contrast = Math.min(1, std / CONTRAST_FULL_SCALE)
  const quality = 100 * (0.5 * completeness + 0.5 * contrast)
  return Math.max(0, Math.min(100, Math.round(quality)))
}

// ─── DETECTION HELPERS (pure) ──────────────────────────────────────

/** Clamp a value into the inclusive 0..1 range. */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

/** Clamp to 0..100 and round to an integer confidence score. */
function toConfidence(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(100, Math.round(x)))
}

/**
 * Measure a single bubble's fill intensity: project its sheet-normalized center
 * through the homography, sample a small disk around the projected pixel, and
 * return the fraction of dark pixels (0..1). Returns 0 when no homography is
 * available or the projection falls entirely outside the image. Pure.
 */
function sampleBubbleIntensity(
  cx: number,
  cy: number,
  r: number,
  gray: Float32Array,
  width: number,
  height: number,
  homography: number[] | undefined
): number {
  if (!homography) return 0

  const center = applyHomography(homography, { x: cx, y: cy })
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return 0

  // Derive the sampling radius in pixels by projecting a point offset by the
  // normalized radius along each axis and averaging the two pixel distances.
  const edgeX = applyHomography(homography, { x: cx + r, y: cy })
  const edgeY = applyHomography(homography, { x: cx, y: cy + r })
  const rx = Math.hypot(edgeX.x - center.x, edgeX.y - center.y)
  const ry = Math.hypot(edgeY.x - center.x, edgeY.y - center.y)
  const radius = Math.max(MIN_SAMPLE_RADIUS_PX, (rx + ry) / 2)

  const x0 = Math.max(0, Math.floor(center.x - radius))
  const x1 = Math.min(width - 1, Math.ceil(center.x + radius))
  const y0 = Math.max(0, Math.floor(center.y - radius))
  const y1 = Math.min(height - 1, Math.ceil(center.y + radius))
  if (x1 < x0 || y1 < y0) return 0

  const r2 = radius * radius
  let dark = 0
  let total = 0
  for (let py = y0; py <= y1; py++) {
    const dy = py - center.y
    for (let px = x0; px <= x1; px++) {
      const dx = px - center.x
      if (dx * dx + dy * dy > r2) continue
      total++
      if (gray[py * width + px] <= DARK_LUMINANCE_THRESHOLD) dark++
    }
  }

  return total > 0 ? dark / total : 0
}

/**
 * Classify one row from its per-option intensities and the config thresholds
 * (Req 8.1, 8.2, 8.3). Pure. Returns the status, the selected option label(s),
 * and whether the row is flagged for teacher review.
 *
 * - No bubble over `fillThreshold` -> `blank` (Req 8.1), nothing selected.
 * - More than one over `fillThreshold` -> `multiple`, flagged (Req 8.2).
 * - Exactly one over threshold but `(top1 - top2) < ambiguityMargin` ->
 *   `ambiguous`, flagged (Req 8.3).
 * - Otherwise `ok`, the single top label selected.
 */
export function classifyRow(
  optionLabels: string[],
  intensities: Record<string, number>,
  cfg: OmrConfig
): { status: DetectedAnswer['status']; selected: string[]; flagged: boolean } {
  // Pair each label with its intensity, preserving option order for stable ties.
  const entries = optionLabels.map((label, index) => ({
    label,
    index,
    intensity: intensities[label] ?? 0
  }))

  const over = entries.filter((e) => e.intensity > cfg.fillThreshold)

  // Sort a copy by descending intensity; break ties by original option order so
  // the result is fully deterministic (Req 7.2).
  const sorted = [...entries].sort((a, b) =>
    b.intensity !== a.intensity ? b.intensity - a.intensity : a.index - b.index
  )

  if (over.length === 0) {
    return { status: 'blank', selected: [], flagged: false }
  }

  if (over.length > 1) {
    // Report the over-threshold labels in stable option order (Req 8.2).
    const selected = entries.filter((e) => e.intensity > cfg.fillThreshold).map((e) => e.label)
    return { status: 'multiple', selected, flagged: true }
  }

  // Exactly one bubble is over the fill threshold -> it is the top-ranked entry.
  const topLabel = sorted[0].label
  const top1 = sorted[0].intensity
  const top2 = sorted.length > 1 ? sorted[1].intensity : 0

  if (top1 - top2 < cfg.ambiguityMargin) {
    return { status: 'ambiguous', selected: [topLabel], flagged: true }
  }

  return { status: 'ok', selected: [topLabel], flagged: false }
}

/**
 * Per-answer confidence in 0..100 (Req 7.4). Pure function of the row's sorted
 * intensities, status, and config. A clean single mark that sits well clear of
 * the runner-up scores high; ambiguous/multiple rows and marginal blanks score
 * low so they surface for review.
 */
export function answerConfidence(
  status: DetectedAnswer['status'],
  top1: number,
  top2: number,
  cfg: OmrConfig
): number {
  const separation = clamp01(top1 - top2)
  const margin = Math.max(cfg.ambiguityMargin, CONFIDENCE_EPSILON)
  const fill = Math.max(cfg.fillThreshold, CONFIDENCE_EPSILON)

  switch (status) {
    case 'ok':
      // >= 60, climbing to 100 as the winner clears the ambiguity margin.
      return toConfidence(60 + 40 * clamp01(separation / margin))
    case 'ambiguous':
      // < 40: the smaller the gap relative to the margin, the lower the score.
      return toConfidence(40 * clamp01(separation / margin))
    case 'multiple':
      // Two similarly-filled bubbles -> low confidence in a single reading.
      return toConfidence(30 * clamp01(1 - separation))
    case 'blank':
    default:
      // Confident blank when the strongest bubble sits well below the threshold.
      return toConfidence(60 + 40 * clamp01((fill - top1) / fill))
  }
}

/**
 * Detect a single row: sample every bubble, classify, and assemble the
 * `DetectedAnswer` with per-answer confidence. Pure.
 */
function detectRow(
  row: RowLayout,
  gray: Float32Array,
  width: number,
  height: number,
  homography: number[] | undefined,
  cfg: OmrConfig
): DetectedAnswer {
  const intensities: Record<string, number> = {}
  for (const bubble of row.bubbles) {
    intensities[bubble.optionLabel] = sampleBubbleIntensity(
      bubble.cx,
      bubble.cy,
      bubble.r,
      gray,
      width,
      height,
      homography
    )
  }

  const { status, selected, flagged } = classifyRow(row.optionLabels, intensities, cfg)

  // Recover top-1 / top-2 intensities in the same deterministic order used by
  // classifyRow so the confidence matches the classification.
  const ranked = row.optionLabels
    .map((label, index) => ({ index, intensity: intensities[label] ?? 0 }))
    .sort((a, b) => (b.intensity !== a.intensity ? b.intensity - a.intensity : a.index - b.index))
  const top1 = ranked.length > 0 ? ranked[0].intensity : 0
  const top2 = ranked.length > 1 ? ranked[1].intensity : 0

  return {
    questionId: row.questionId,
    number: row.number,
    optionLabels: row.optionLabels,
    intensities,
    selected,
    status,
    confidence: answerConfidence(status, top1, top2, cfg),
    flagged
  }
}

/**
 * Whole-sheet confidence in 0..100 (Req 7.5). Pure blend of the alignment
 * quality (already 0..100) and the mean per-answer confidence, so a well-aligned
 * sheet whose rows all read cleanly scores high, while a poorly-aligned or
 * mostly-ambiguous sheet scores low.
 */
export function sheetConfidence(answers: DetectedAnswer[], alignQuality: number): number {
  const quality = Number.isFinite(alignQuality) ? Math.max(0, Math.min(100, alignQuality)) : 0
  if (answers.length === 0) return toConfidence(quality)

  const meanAnswer = answers.reduce((sum, a) => sum + a.confidence, 0) / answers.length
  return toConfidence(0.5 * quality + 0.5 * meanAnswer)
}
