// src/shared/omr-types.ts
// Domain types for the offline OMR + QR auto-marking pipeline.
// Shared between the main process (services/IPC) and the renderer (Review Interface).

// ─── SHEET STATUS ──────────────────────────────────────────────────

/** Lifecycle/outcome status of a single processed answer sheet. */
export type SheetStatus =
  | 'failed'            // unreadable file (Req 3.4)
  | 'qr_unreadable'     // QR not decodable (Req 5.1)
  | 'exam_not_found'    // QR examId has no match (Req 4.3)
  | 'needs_student'     // unassigned / unknown student (Req 4.5, 4.6)
  | 'alignment_failed'  // too few markers (Req 6.3)
  | 'low_quality'       // detection unreliable (Req 6.4)
  | 'detected'          // scored, ready for review
  | 'finalized'         // written to scores (Req 12)

// ─── QR PAYLOAD ────────────────────────────────────────────────────

/** Sentinel encoded in the QR when no student is assigned (Req 2.4). */
export const UNASSIGNED = 'UNASSIGNED'

/** Data encoded in an answer sheet's QR code. */
export interface QrPayload {
  v: number          // layout version (Req 2.5)
  examId: string     // (Req 2.2)
  studentId: string  // real id or UNASSIGNED sentinel (Req 2.3, 2.4)
}

// ─── DETECTION ─────────────────────────────────────────────────────

/** The engine's read of a single bubble-grid row. */
export interface DetectedAnswer {
  questionId: string
  number: number
  optionLabels: string[]
  intensities: Record<string, number>   // per-option fill fraction 0..1
  selected: string[]                     // options over fill threshold
  status: 'ok' | 'blank' | 'multiple' | 'ambiguous'
  confidence: number                     // 0..100 (Req 7.4)
  flagged: boolean                       // needs review (Req 8.2, 8.3, 10.2)
}

/** The engine's read of a whole sheet. */
export interface SheetDetection {
  answers: DetectedAnswer[]
  sheetConfidence: number                // 0..100 (Req 7.5)
}

/** Fixed thresholds driving deterministic classification and flagging. */
export interface OmrConfig {
  fillThreshold: number          // intensity above which a bubble counts as filled (Req 8.1, 8.2)
  ambiguityMargin: number        // min gap between top-1 and top-2 intensity (Req 8.3)
  lowConfidenceThreshold: number // sheet/answer confidence <= this is flagged (Req 10)
}

// ─── OVERRIDES ─────────────────────────────────────────────────────

/** A teacher override of a detected answer, capturing original vs overridden (Req 13.3). */
export interface AnswerOverride {
  questionId: string
  original: string[]
  overridden: string[]
}

// ─── BATCH & SHEET ─────────────────────────────────────────────────

/** A set of sheet images submitted for processing in one operation. */
export interface OmrBatch {
  id: string
  teacherId: string
  examId?: string
  total: number
  processed: number
  createdAt: number
}

/** A single processed answer sheet and its scoring/review state. */
export interface OmrSheet {
  id: string
  batchId: string
  examId?: string
  studentId?: string
  status: SheetStatus
  reason?: string
  qrPayload?: QrPayload
  sheetConfidence: number
  detectedAnswers: DetectedAnswer[]
  overrides: Record<string, string[]>   // questionId -> option labels
  rawScore: number
  maxScore: number
  percentage: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  imagePath: string
  createdAt: number
  finalizedAt?: number
}

// ─── SHEET GENERATION (IPC contract) ───────────────────────────────

/** Request to generate a printable answer sheet for an exam (Req 1, 2). */
export interface GenerateSheetRequest {
  examId: string
  studentId?: string
}

/** Result of sheet generation; `ok=false` carries a decline reason (Req 1.5). */
export interface GenerateSheetResult {
  ok: boolean
  filePath?: string
  message?: string // decline reason when ok=false (Req 1.5)
}

// ─── FINALIZATION (IPC contract) ───────────────────────────────────

/**
 * Result of finalizing a sheet into the scores table (Req 12).
 * On success `ok=true` with the written `scoreId`. Otherwise a flag field
 * signals what the caller must resolve first:
 *   - `needsStudent`     -> sheet has no assigned student yet (Req 11.4)
 *   - `needsConfirmReplace` (+ `existingScoreId`) -> a score already exists for
 *     this student+exam and the teacher must confirm replacement (Req 12.4).
 */
export interface FinalizeResult {
  ok: boolean
  scoreId?: string
  needsStudent?: boolean
  needsConfirmReplace?: boolean
  existingScoreId?: string
  message?: string
}

// ─── AUDIT ─────────────────────────────────────────────────────────

/** Provenance data stored for an auto-recorded score (Req 13). */
export interface OmrAuditRecord {
  id: string
  scoreId: string
  sheetId: string
  examId: string
  studentId: string
  detectedAnswers: DetectedAnswer[]      // includes per-answer confidence (Req 13.2)
  sheetConfidence: number                // (Req 13.2)
  overrides: AnswerOverride[]            // original vs overridden (Req 13.3)
  imagePath: string                      // source image reference (Req 13.4)
  createdAt: number
}
