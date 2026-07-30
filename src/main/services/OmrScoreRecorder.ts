// src/main/services/OmrScoreRecorder.ts
//
// Pure builders that turn a reviewed OMR sheet + its scoring result into the
// records persisted on finalization: the existing `Score` shape written to the
// `scores` table (Req 12) and the `OmrAuditRecord` that preserves provenance
// (Req 13). These functions perform no I/O and no clock reads of their own — the
// impure edges (id generation, timestamps, DB writes) are supplied by the caller
// (or defaulted for convenience), so the mapping logic stays deterministic and
// testable in isolation. Objective-only scope is recorded on the score itself
// (Req 14.3).

import { v4 as uuid } from 'uuid'
import type { Score } from '@shared/db-types'
import type { OmrSheet, OmrAuditRecord, AnswerOverride } from '@shared/omr-types'
import type { ScoreResult } from './OmrScoringService'

// ─── PUBLIC TYPES ──────────────────────────────────────────────────

/**
 * The resolved identity a finalized sheet is recorded under. `studentId` and
 * `examId` are the sheet's confirmed identity (post student-assignment), and
 * `teacherId` is the authenticated owner of the record — none of which are
 * optional at finalization time (Req 12.1).
 */
export interface ScoreIdentity {
  studentId: string
  examId: string
  teacherId: string
}

/**
 * Marker stored on the score's `teacherComment` indicating the recorded score
 * covers objective questions only (Req 14.3).
 */
export const OMR_OBJECTIVE_ONLY_COMMENT =
  'Auto-marked by OMR (objective questions only).'

// ─── SCORE MAPPING (Req 12) ────────────────────────────────────────

/**
 * Map a finalized sheet + scoring result to the existing `Score` shape written
 * to the `scores` table (Req 12.1). The returned value omits `id` and
 * `createdAt`, which the persistence layer assigns on insert (mirroring
 * `DatabaseService.saveScore`).
 *
 * - `studentId`, `examId`, `teacherId` come from the resolved identity.
 * - `rawScore`, `maxScore`, `percentage`, `grade` come from the scoring result.
 * - `questionScores` are the per-objective-question `{ questionId, score,
 *   maxScore }` entries produced by scoring (Req 12.2).
 * - `markedAt` is the finalization time, supplied by the caller so the mapping
 *   stays pure and testable (Req 12.3).
 * - `teacherComment` is tagged to indicate an objective-only OMR result
 *   (Req 14.3).
 *
 * @param sheet       the reviewed sheet being finalized (identity is taken from
 *                    `identity`, not the sheet, so it is required to be resolved)
 * @param scoreResult the pure scoring result for the sheet
 * @param identity    the resolved student/exam/teacher identity
 * @param markedAt    finalization timestamp (Req 12.3); defaults to now
 */
export function mapToScore(
  sheet: OmrSheet,
  scoreResult: ScoreResult,
  identity: ScoreIdentity,
  markedAt: number = Date.now()
): Omit<Score, 'id' | 'createdAt'> {
  void sheet // identity is authoritative at finalization; the sheet is part of the documented API shape (Req 12.1)
  return {
    studentId: identity.studentId,
    examId: identity.examId,
    teacherId: identity.teacherId,
    rawScore: scoreResult.rawScore,
    maxScore: scoreResult.maxScore,
    percentage: scoreResult.percentage,
    grade: scoreResult.grade,
    questionScores: scoreResult.perQuestion, // { questionId, score, maxScore } (Req 12.2)
    teacherComment: OMR_OBJECTIVE_ONLY_COMMENT, // objective-only marker (Req 14.3)
    markedAt // finalization time (Req 12.3)
  }
}

// ─── AUDIT RECORD (Req 13) ─────────────────────────────────────────

/**
 * Build the overrides audit list for a sheet, capturing for each overridden
 * question both the original detected value and the overridden value (Req 13.3).
 * The original value is the engine's detected `selected` options for that
 * question (an empty array when there was no matching detected answer).
 */
function buildOverrideAudit(sheet: OmrSheet): AnswerOverride[] {
  const detectedByQuestion = new Map<string, string[]>()
  for (const answer of sheet.detectedAnswers) {
    detectedByQuestion.set(answer.questionId, answer.selected)
  }

  return Object.keys(sheet.overrides).map((questionId) => ({
    questionId,
    original: detectedByQuestion.get(questionId) ?? [],
    overridden: sheet.overrides[questionId]
  }))
}

/**
 * Build the audit record stored alongside a finalized score (Req 13.1). It is a
 * pure snapshot of everything needed to explain and defend the recorded score:
 *
 * - `detectedAnswers` — the engine's reads, each carrying its per-answer
 *   confidence (Req 13.2).
 * - `sheetConfidence` — the whole-sheet confidence used to produce the result
 *   (Req 13.2).
 * - `overrides` — each teacher override as original-detected vs overridden value
 *   (Req 13.3).
 * - `imagePath` — a reference to the source sheet image (Req 13.4).
 *
 * `id` and `createdAt` are the impure edges; they default to a fresh uuid and the
 * current time for convenience but can be supplied to keep the builder pure for
 * testing.
 *
 * @param sheet       the finalized sheet
 * @param scoreId     id of the `scores` row this audit record belongs to
 * @param scoreResult the scoring result (reserved for provenance; the audit's
 *                    figures are drawn from the sheet's detection)
 * @param id          audit record id (defaults to a fresh uuid)
 * @param createdAt   creation timestamp (defaults to now)
 */
export function buildAuditRecord(
  sheet: OmrSheet,
  scoreId: string,
  scoreResult: ScoreResult,
  id: string = uuid(),
  createdAt: number = Date.now()
): OmrAuditRecord {
  void scoreResult // provenance is captured via the sheet's detection/overrides
  return {
    id,
    scoreId,
    sheetId: sheet.id,
    examId: sheet.examId ?? '',
    studentId: sheet.studentId ?? '',
    detectedAnswers: sheet.detectedAnswers, // per-answer confidence included (Req 13.2)
    sheetConfidence: sheet.sheetConfidence, // sheet confidence (Req 13.2)
    overrides: buildOverrideAudit(sheet), // original vs overridden (Req 13.3)
    imagePath: sheet.imagePath, // source image reference (Req 13.4)
    createdAt
  }
}
