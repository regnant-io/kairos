// src/shared/omr-layout.ts
// Shared, pure, deterministic answer-sheet geometry.
//
// This module is the single source of truth for bubble/fiducial/QR coordinates.
// Both the Sheet_Generator (which prints the sheet) and the OMR_Engine (which reads
// it back) derive geometry from here, keyed by (exam, layout version), so a sheet
// generated with a given version is always readable by an engine sharing that version.
//
// All coordinates are SHEET-NORMALIZED in the inclusive range 0..1 (origin at the
// top-left of the sheet). Nothing here reads the clock, uses randomness, or performs
// I/O — the same (exam, version) input always yields byte-identical geometry.

import type { Exam, Question } from './db-types'

/** Current layout version. Bump when geometry changes in an incompatible way. */
export const OMR_LAYOUT_VERSION = 1

// ─── PUBLIC TYPES ──────────────────────────────────────────────────

/** One fillable bubble, positioned in sheet-normalized coordinates. */
export interface BubbleLayout {
  questionId: string
  optionLabel: string // 'A'..'E' for multiple_choice | 'T' | 'F' for true_or_false
  cx: number // center X, sheet-normalized 0..1
  cy: number // center Y, sheet-normalized 0..1
  r: number // radius, sheet-normalized
}

/** One bubble-grid row, corresponding to a single objective question. */
export interface RowLayout {
  questionId: string
  number: number // exam question number shown to student (Req 1.6)
  type: 'multiple_choice' | 'true_or_false'
  optionLabels: string[] // MC option labels; ['T','F'] for true/false (Req 1.3, 1.4)
  bubbles: BubbleLayout[]
}

/** A corner registration mark used by the engine to establish orientation. */
export interface FiducialMarker {
  cx: number
  cy: number
  size: number
}

/** The full deterministic geometry of one answer sheet. */
export interface SheetLayout {
  version: number
  examId: string
  fiducials: FiducialMarker[] // >= 4 corner markers (Req 6.1)
  qrArea: { x: number; y: number; w: number; h: number }
  rows: RowLayout[]
}

// ─── GEOMETRY CONSTANTS (sheet-normalized) ─────────────────────────

const MARGIN = 0.05 // distance of fiducial centers from each sheet edge
const FIDUCIAL_SIZE = 0.03 // side length of a corner marker

// QR code sits in the top-right region, clear of the corner fiducials.
const QR_AREA = { x: 0.7, y: 0.09, w: 0.22, h: 0.22 }

// Vertical band the bubble grid occupies (below the header/QR band).
const GRID_TOP = 0.36
const GRID_BOTTOM = 0.92

// Horizontal band the bubbles occupy (left gutter reserved for the question number).
const BUBBLE_LEFT = 0.2
const BUBBLE_RIGHT = 0.9

// Bubble radius sizing.
const RADIUS_FACTOR = 0.32 // fraction of the smaller pitch used for the radius
const MAX_RADIUS = 0.02
const MIN_RADIUS = 0.006

// ─── OBJECTIVE-QUESTION SCOPE (Req 14.1) ───────────────────────────

/**
 * The objective-only question list, in stable exam order, used everywhere.
 * Keeps only `multiple_choice` and `true_or_false` questions (Req 14.1),
 * preserving the exam's original question order (Req 1.1, 1.2).
 */
export function objectiveQuestions(exam: Exam): Question[] {
  return exam.questions.filter(
    (q) => q.type === 'multiple_choice' || q.type === 'true_or_false'
  )
}

// ─── LAYOUT BUILDER ────────────────────────────────────────────────

/**
 * Deterministic: same (exam, version) always yields identical geometry.
 * Produces one RowLayout per objective question (Req 1.1, 1.2), one bubble per
 * multiple-choice option label (Req 1.3), exactly two bubbles ['T','F'] for
 * true/false (Req 1.4), numbered rows (Req 1.6), plus >= 4 corner fiducials
 * (Req 6.1) and a QR area.
 */
export function buildLayout(exam: Exam, version: number = OMR_LAYOUT_VERSION): SheetLayout {
  const questions = objectiveQuestions(exam)
  const rows = buildRows(questions)

  return {
    version,
    examId: exam.id,
    fiducials: buildFiducials(),
    qrArea: { ...QR_AREA },
    rows
  }
}

// ─── INTERNAL HELPERS ──────────────────────────────────────────────

/** Four corner registration marks (Req 6.1). */
function buildFiducials(): FiducialMarker[] {
  const lo = MARGIN
  const hi = 1 - MARGIN
  return [
    { cx: lo, cy: lo, size: FIDUCIAL_SIZE }, // top-left
    { cx: hi, cy: lo, size: FIDUCIAL_SIZE }, // top-right
    { cx: lo, cy: hi, size: FIDUCIAL_SIZE }, // bottom-left
    { cx: hi, cy: hi, size: FIDUCIAL_SIZE } // bottom-right
  ]
}

/** Resolve the option labels for a single objective question. */
function optionLabelsFor(q: Question): string[] {
  if (q.type === 'true_or_false') {
    return ['T', 'F'] // exactly two bubbles (Req 1.4)
  }
  // multiple_choice: one bubble per defined option label (Req 1.3)
  return (q.options ?? []).map((o) => o.label)
}

/** Build every numbered bubble-grid row with its bubbles. */
function buildRows(questions: Question[]): RowLayout[] {
  const count = questions.length
  // Guard against divide-by-zero; when count is 0 the loop below never runs.
  const rowPitch = count > 0 ? (GRID_BOTTOM - GRID_TOP) / count : 0

  return questions.map((q, i) => {
    const type = q.type as 'multiple_choice' | 'true_or_false'
    const optionLabels = optionLabelsFor(q)
    const cy = GRID_TOP + (i + 0.5) * rowPitch

    const n = optionLabels.length
    const bubblePitch = n > 0 ? (BUBBLE_RIGHT - BUBBLE_LEFT) / n : 0
    const r = bubbleRadius(rowPitch, bubblePitch)

    const bubbles: BubbleLayout[] = optionLabels.map((label, j) => ({
      questionId: q.id,
      optionLabel: label,
      cx: BUBBLE_LEFT + (j + 0.5) * bubblePitch,
      cy,
      r
    }))

    return {
      questionId: q.id,
      number: q.number, // exam question number shown to student (Req 1.6)
      type,
      optionLabels,
      bubbles
    }
  })
}

/** Deterministic bubble radius derived from the row/column pitch, clamped. */
function bubbleRadius(rowPitch: number, bubblePitch: number): number {
  const candidates = [rowPitch, bubblePitch].filter((p) => p > 0)
  if (candidates.length === 0) return MIN_RADIUS
  const smallest = Math.min(...candidates)
  const r = smallest * RADIUS_FACTOR
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, r))
}
