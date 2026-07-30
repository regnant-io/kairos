// src/main/services/omr-resolve.ts
// Pure, deterministic identity-resolution and finalization-precondition logic
// for the offline OMR + QR auto-marking pipeline.
//
// This module has no I/O, no clock reads, and no randomness: every function is a
// pure mapping from its inputs to its output, which is what makes the resolution
// (Property 5) and finalization-precondition (Property 13) behaviour testable.

import { UNASSIGNED } from '@shared/omr-types'
import type { QrPayload, OmrSheet, SheetStatus } from '@shared/omr-types'

/**
 * Resolve the exam/student identity encoded in a decoded QR payload against the
 * existence of the referenced records, returning the resulting sheet status.
 *
 * Rules (Req 4.2–4.6, design Property 5):
 * - exam id with no matching exam            -> 'exam_not_found'      (Req 4.3)
 * - matched exam + unassigned sentinel        -> 'needs_student'       (Req 4.5)
 * - matched exam + student id with no match   -> 'needs_student'       (Req 4.6)
 * - matched exam + matching student           -> 'detected'            (Req 4.2, 4.4)
 *
 * @param payload       the decoded QR payload
 * @param examExists    whether the payload's examId matches an existing exam
 * @param studentExists whether the payload's studentId matches an existing student
 *                      (ignored when the payload carries the unassigned sentinel)
 */
export function resolveIdentity(
  payload: QrPayload,
  examExists: boolean,
  studentExists: boolean
): SheetStatus {
  // The exam must resolve first: without a matching exam there is nothing to
  // score the sheet against (Req 4.3).
  if (!examExists) {
    return 'exam_not_found'
  }

  // Unassigned sentinel: the teacher never bound a student to this sheet, so it
  // needs manual assignment regardless of any student lookup (Req 4.5).
  if (payload.studentId === UNASSIGNED) {
    return 'needs_student'
  }

  // A concrete student id was encoded but does not match any existing student:
  // the sheet still needs manual assignment (Req 4.6).
  if (!studentExists) {
    return 'needs_student'
  }

  // Exam matched and the encoded student matched an existing student (Req 4.2,
  // 4.4): the sheet is resolved and ready for detection/scoring/review.
  return 'detected'
}

/**
 * Whether a sheet currently has a real student associated (not missing and not
 * the unassigned sentinel). Used by the finalization guards (Req 11.4).
 */
function hasStudent(sheet: OmrSheet): boolean {
  const id = sheet.studentId
  return typeof id === 'string' && id.length > 0 && id !== UNASSIGNED
}

/**
 * Whether a sheet still carries unresolved review flags. A detected answer that
 * is flagged for review is considered resolved once the teacher has recorded an
 * override for that question; otherwise the flag remains unresolved (Req 11.6).
 */
function hasUnresolvedFlags(sheet: OmrSheet): boolean {
  return sheet.detectedAnswers.some(
    (answer) =>
      answer.flagged &&
      !Object.prototype.hasOwnProperty.call(sheet.overrides, answer.questionId)
  )
}

/**
 * Guard for finalizing a single sheet (Req 11.4, 12.4 precondition).
 *
 * A sheet may be finalized only when it has a real student associated AND has no
 * unresolved review flags. A sheet with no student (Req 11.4) or with any
 * flagged, un-overridden answer cannot be finalized.
 */
export function canFinalize(sheet: OmrSheet): boolean {
  return hasStudent(sheet) && !hasUnresolvedFlags(sheet)
}

/**
 * Partition a batch of sheets into those that can be finalized together and
 * those that cannot (Req 11.6). A sheet is eligible for batch finalization under
 * exactly the same precondition as single finalization: an associated student
 * and no unresolved review flags.
 *
 * @returns `finalizable` — sheets that satisfy {@link canFinalize};
 *          `blocked`     — the remaining sheets, preserving input order.
 */
export function canFinalizeBatch(sheets: OmrSheet[]): {
  finalizable: OmrSheet[]
  blocked: OmrSheet[]
} {
  const finalizable: OmrSheet[] = []
  const blocked: OmrSheet[] = []

  for (const sheet of sheets) {
    if (canFinalize(sheet)) {
      finalizable.push(sheet)
    } else {
      blocked.push(sheet)
    }
  }

  return { finalizable, blocked }
}
