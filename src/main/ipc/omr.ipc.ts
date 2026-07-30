// src/main/ipc/omr.ipc.ts
// All OMR + QR auto-marking IPC handlers: sheet generation, batch image
// processing, review-time assign/recompute, finalization, and audit retrieval.
//
// Style mirrors ai.ipc.ts: a `broadcast(event, data)` helper fans events out to
// every live BrowserWindow, and each channel is wired with `ipc.handle`. The
// deterministic OMR core lives in the shared/pure modules; this file is the
// impure orchestrator that reads/writes the DB, decodes images, and streams
// batch progress (`omr:batch-progress`, mirroring `ai:batch-progress`).

import type { IpcMain } from 'electron'
import { BrowserWindow as BW, app } from 'electron'
import { join, basename } from 'path'
import { mkdirSync, copyFileSync, existsSync } from 'fs'
import { v4 as uuid } from 'uuid'

import type { DatabaseService } from '../services/DatabaseService'
import { QrService } from '../services/QrService'
import { OmrEngine } from '../services/OmrEngine'
import { OmrScoringService } from '../services/OmrScoringService'
import { OmrSheetService } from '../services/OmrSheetService'
import { OmrRepository } from '../services/OmrRepository'
import { ExportService } from '../services/ExportService'
import { resolveIdentity, canFinalize, canFinalizeBatch } from '../services/omr-resolve'
import {
  mapToScore,
  buildAuditRecord,
  type ScoreIdentity
} from '../services/OmrScoreRecorder'

import { buildLayout, OMR_LAYOUT_VERSION } from '@shared/omr-layout'
import { UNASSIGNED } from '@shared/omr-types'
import type {
  OmrConfig,
  OmrSheet,
  OmrAuditRecord,
  GenerateSheetRequest,
  GenerateSheetResult,
  FinalizeResult
} from '@shared/omr-types'

// ─── DEFAULT DETECTION CONFIG ──────────────────────────────────────
//
// Centralized deterministic thresholds shared by every processing/re-scoring
// path. Kept here (the single OMR orchestration site) so tuning is one edit.
//   - fillThreshold:         a bubble's dark-fraction above this counts as filled (Req 8.1, 8.2)
//   - ambiguityMargin:       min gap between the top two intensities before a row is flagged (Req 8.3)
//   - lowConfidenceThreshold: sheet/answer confidence at or below this is flagged (Req 10)
export const DEFAULT_OMR_CONFIG: OmrConfig = {
  fillThreshold: 0.35,
  ambiguityMargin: 0.15,
  lowConfidenceThreshold: 50
}

// ─── HELPERS ───────────────────────────────────────────────────────

/** Fan an event out to every live renderer window (mirrors ai.ipc broadcast). */
function broadcast(event: string, data: unknown): void {
  BW.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(event, data)
  })
}

/** Copy a source image into the app's `omr/` folder so the audit reference
 *  survives the original file being moved/deleted (Req 13.4). Returns the copied
 *  path, or the original path when the copy could not be made. */
function persistSourceImage(sheetId: string, filePath: string): string {
  try {
    const omrDir = join(app.getPath('userData'), 'omr')
    mkdirSync(omrDir, { recursive: true })
    const dest = join(omrDir, `${sheetId}-${basename(filePath)}`)
    if (existsSync(filePath)) {
      copyFileSync(filePath, dest)
      return dest
    }
  } catch {
    /* fall through to the original path */
  }
  return filePath
}

/** A blank sheet skeleton with safe defaults; per-file processing fills it in. */
function baseSheet(id: string, batchId: string, imagePath: string): OmrSheet {
  return {
    id,
    batchId,
    status: 'failed',
    sheetConfidence: 0,
    detectedAnswers: [],
    overrides: {},
    rawScore: 0,
    maxScore: 0,
    percentage: 0,
    grade: 'F',
    imagePath,
    createdAt: Date.now()
  }
}

// ─── REGISTRATION ──────────────────────────────────────────────────

export function registerOMRHandlers(ipc: IpcMain, db: DatabaseService): void {
  const qr = new QrService()
  const engine = new OmrEngine()
  const scoring = new OmrScoringService()
  const exporter = new ExportService()
  const sheetService = new OmrSheetService(db, qr, exporter)
  const repo = new OmrRepository(db)

  // ── Generate answer sheet (Req 1, 2) ─────────────────────────────
  ipc.handle('omr:generate-sheet', async (_e, req: GenerateSheetRequest): Promise<GenerateSheetResult> => {
    return sheetService.generate(req)
  })

  // ── Process images (async batch, Req 3, 4, 5, 6, 7, 8, 9) ─────────
  ipc.handle('omr:process-images', async (_e, req: { examHint?: string; filePaths: string[] }): Promise<{ batchId: string }> => {
    const teacher = db.getTeacher()
    const batch = repo.createBatch(teacher?.id ?? '', req.examHint)
    const filePaths = Array.isArray(req.filePaths) ? req.filePaths : []
    const total = filePaths.length

    // Run the batch asynchronously so the caller gets its batchId immediately,
    // then progress streams over `omr:batch-progress` (Req 3.2, 3.3).
    ;(async () => {
      let done = 0
      for (const filePath of filePaths) {
        const label = basename(filePath)
        try {
          await processFile(filePath, batch.id)
        } catch (err) {
          // A truly unexpected failure still must not abort the batch (Req 3.4).
          console.error('[OMR] Unexpected processing failure for', filePath, err)
          const id = uuid()
          const sheet = baseSheet(id, batch.id, persistSourceImage(id, filePath))
          sheet.status = 'failed'
          sheet.reason = err instanceof Error ? err.message : String(err)
          repo.saveSheet(sheet)
        }
        done++
        broadcast('omr:batch-progress', { batchId: batch.id, done, total, current: label })
      }
      broadcast('omr:batch-progress', { batchId: batch.id, done: total, total, current: 'Complete' })
    })()

    return { batchId: batch.id }
  })

  /**
   * Process a single sheet image end-to-end: decode -> QR -> resolve -> align ->
   * detect -> score -> persist. Per-sheet errors become `failed`/`qr_unreadable`
   * results rather than throwing, so the batch continues (Req 3.4, 5.1, 5.3).
   */
  async function processFile(filePath: string, batchId: string): Promise<void> {
    const id = uuid()
    const imagePath = persistSourceImage(id, filePath)
    const sheet = baseSheet(id, batchId, imagePath)

    // 1. Decode file. Unreadable -> `failed` with a reason, continue (Req 3.4).
    let img
    try {
      img = await engine.loadImage(filePath)
    } catch (err) {
      sheet.status = 'failed'
      sheet.reason = err instanceof Error ? err.message : String(err)
      repo.saveSheet(sheet)
      return
    }

    // 2. Read QR. Undecodable -> `qr_unreadable`, retain the image (Req 5.1).
    const { payload, corners } = qr.decode(img)
    if (!payload) {
      sheet.status = 'qr_unreadable'
      sheet.reason = 'QR code could not be read'
      repo.saveSheet(sheet)
      return
    }
    sheet.qrPayload = payload

    // 3. Resolve identity against existing records (Req 4).
    const exam = db.getExam(payload.examId)
    const examExists = !!exam
    const studentExists =
      payload.studentId !== UNASSIGNED && !!db.getStudent(payload.studentId)
    const resolved = resolveIdentity(payload, examExists, studentExists)

    sheet.examId = examExists ? payload.examId : undefined
    sheet.studentId = studentExists ? payload.studentId : undefined

    if (!examExists || !exam) {
      sheet.status = 'exam_not_found'
      sheet.reason = 'No matching exam for the scanned QR code'
      repo.saveSheet(sheet)
      return
    }

    // 4. Align (Req 6) then 5. detect (Req 7, 8) then 6. score (Req 9).
    const layout = buildLayout(exam, OMR_LAYOUT_VERSION)
    const align = engine.align(img, layout, corners)
    const detection = engine.detect(img, layout, align, DEFAULT_OMR_CONFIG)
    const key = scoring.buildKey(exam)
    const scoreResult = scoring.score(key, detection.answers, {})

    sheet.detectedAnswers = detection.answers
    sheet.sheetConfidence = detection.sheetConfidence
    sheet.rawScore = scoreResult.rawScore
    sheet.maxScore = scoreResult.maxScore
    sheet.percentage = scoreResult.percentage
    sheet.grade = scoreResult.grade

    // Status precedence: alignment failure blocks reliable detection (Req 6.3);
    // otherwise an unassigned/unknown student still needs the teacher (Req 4.5,
    // 4.6); a poorly-aligned-but-solved sheet is flagged low-quality (Req 6.4);
    // otherwise it is ready for review.
    if (!align.ok) {
      sheet.status = 'alignment_failed'
      sheet.reason = align.reason ?? 'Could not align the sheet'
    } else if (resolved === 'needs_student') {
      sheet.status = 'needs_student'
    } else if (align.quality <= DEFAULT_OMR_CONFIG.lowConfidenceThreshold) {
      sheet.status = 'low_quality'
      sheet.reason = 'Image quality may prevent reliable detection'
    } else {
      sheet.status = 'detected'
    }

    repo.saveSheet(sheet)
  }

  // ── Get batch sheets (Req 3.2) ───────────────────────────────────
  ipc.handle('omr:get-batch', async (_e, batchId: string): Promise<OmrSheet[]> => {
    return repo.getBatchSheets(batchId)
  })

  // ── Assign exam/student, re-run detection+scoring (Req 5.2, 5.4) ──
  ipc.handle('omr:assign', async (_e, req: { sheetId: string; examId?: string; studentId?: string }): Promise<OmrSheet> => {
    const sheet = repo.getSheet(req.sheetId)
    if (!sheet) throw new Error(`Sheet not found: ${req.sheetId}`)

    if (req.examId !== undefined) sheet.examId = req.examId
    if (req.studentId !== undefined) sheet.studentId = req.studentId

    const exam = sheet.examId ? db.getExam(sheet.examId) : null

    if (sheet.examId && !exam) {
      sheet.status = 'exam_not_found'
      sheet.reason = 'No matching exam for the assigned id'
    } else if (exam) {
      // Re-run detection + scoring against the (now) assigned exam using the
      // retained source image (Req 5.4). Manual assignment has no QR corners, so
      // alignment relies on the fiducial markers alone.
      try {
        const img = await engine.loadImage(sheet.imagePath)
        const layout = buildLayout(exam, OMR_LAYOUT_VERSION)
        const align = engine.align(img, layout, null)
        const detection = engine.detect(img, layout, align, DEFAULT_OMR_CONFIG)
        const key = scoring.buildKey(exam)
        const scoreResult = scoring.score(key, detection.answers, sheet.overrides)

        sheet.detectedAnswers = detection.answers
        sheet.sheetConfidence = detection.sheetConfidence
        sheet.rawScore = scoreResult.rawScore
        sheet.maxScore = scoreResult.maxScore
        sheet.percentage = scoreResult.percentage
        sheet.grade = scoreResult.grade

        const studentAssigned =
          !!sheet.studentId && sheet.studentId !== UNASSIGNED
        if (!align.ok) {
          sheet.status = 'alignment_failed'
          sheet.reason = align.reason ?? 'Could not align the sheet'
        } else if (!studentAssigned || !db.getStudent(sheet.studentId as string)) {
          sheet.status = 'needs_student'
        } else {
          sheet.status = 'detected'
          sheet.reason = undefined
        }
      } catch (err) {
        sheet.status = 'failed'
        sheet.reason = err instanceof Error ? err.message : String(err)
      }
    } else {
      // No exam assigned yet: reflect whether a student is present.
      const studentAssigned =
        !!sheet.studentId && sheet.studentId !== UNASSIGNED
      sheet.status = studentAssigned ? sheet.status : 'needs_student'
    }

    repo.saveSheet(sheet)
    return sheet
  })

  // ── Recompute score from overrides (Req 11.2) ────────────────────
  ipc.handle('omr:recompute', async (_e, req: { sheetId: string; overrides: Record<string, string[]> }): Promise<OmrSheet> => {
    const sheet = repo.getSheet(req.sheetId)
    if (!sheet) throw new Error(`Sheet not found: ${req.sheetId}`)

    const exam = sheet.examId ? db.getExam(sheet.examId) : null
    if (!exam) throw new Error('Cannot recompute a sheet without a resolved exam')

    const overrides = req.overrides ?? {}
    const key = scoring.buildKey(exam)
    const scoreResult = scoring.score(key, sheet.detectedAnswers, overrides)

    sheet.overrides = overrides
    sheet.rawScore = scoreResult.rawScore
    sheet.maxScore = scoreResult.maxScore
    sheet.percentage = scoreResult.percentage
    sheet.grade = scoreResult.grade

    repo.saveSheet(sheet)
    return sheet
  })

  // ── Finalize a single sheet (Req 11.4, 12, 13) ───────────────────
  ipc.handle('omr:finalize', async (_e, req: { sheetId: string; confirmReplace?: boolean }): Promise<FinalizeResult> => {
    const sheet = repo.getSheet(req.sheetId)
    if (!sheet) throw new Error(`Sheet not found: ${req.sheetId}`)
    return finalizeSheet(sheet, req.confirmReplace)
  })

  // ── Finalize a batch of eligible sheets (Req 11.6) ───────────────
  ipc.handle('omr:finalize-batch', async (_e, req: { sheetIds: string[]; confirmReplace?: boolean }): Promise<FinalizeResult[]> => {
    const ids = Array.isArray(req.sheetIds) ? req.sheetIds : []
    const sheets = ids
      .map((id) => repo.getSheet(id))
      .filter((s): s is OmrSheet => s !== null)

    // Only finalize sheets that satisfy the finalization preconditions (Req 11.6).
    const { finalizable } = canFinalizeBatch(sheets)

    const results: FinalizeResult[] = []
    for (const sheet of finalizable) {
      results.push(await finalizeSheet(sheet, req.confirmReplace))
    }
    return results
  })

  /**
   * Shared finalize logic (Req 12, 13). Guards on student assignment (Req 11.4)
   * and existing-score replacement (Req 12.4/12.5), writes the score, stores the
   * audit record (Req 13.1), and marks the sheet finalized.
   */
  async function finalizeSheet(sheet: OmrSheet, confirmReplace?: boolean): Promise<FinalizeResult> {
    // Req 11.4: a sheet with no associated student cannot be finalized.
    if (!canFinalize(sheet)) {
      if (!sheet.studentId || sheet.studentId === UNASSIGNED) {
        return { ok: false, needsStudent: true }
      }
      // Remaining block reason is unresolved review flags (Req 11.6).
      return { ok: false, message: 'Sheet has unresolved review flags' }
    }
    if (!sheet.examId) {
      return { ok: false, message: 'Sheet has no resolved exam' }
    }

    const exam = db.getExam(sheet.examId)
    if (!exam) return { ok: false, message: 'Resolved exam no longer exists' }

    const studentId = sheet.studentId as string
    const examId = sheet.examId

    // Req 12.4: if a score already exists for this student+exam, require the
    // teacher to confirm replacement before overwriting.
    const existing = db.getScoreByStudentExam(studentId, examId)
    if (existing && !confirmReplace) {
      return { ok: false, needsConfirmReplace: true, existingScoreId: existing.id }
    }

    const teacher = db.getTeacher()
    const identity: ScoreIdentity = {
      studentId,
      examId,
      teacherId: teacher?.id ?? ''
    }

    const key = scoring.buildKey(exam)
    const scoreResult = scoring.score(key, sheet.detectedAnswers, sheet.overrides)
    const finalizedAt = Date.now()
    const scoreRecord = mapToScore(sheet, scoreResult, identity, finalizedAt)

    // Req 12.5: overwrite the existing record in place when replacing; otherwise
    // insert a fresh score.
    const saved = existing
      ? db.replaceScore(existing.id, scoreRecord)
      : db.saveScore(scoreRecord)

    // Req 13.1: store the audit trail for the finalized result.
    const audit: OmrAuditRecord = buildAuditRecord(sheet, saved.id, scoreResult)
    repo.saveAudit(audit)

    // Mark the sheet finalized (Req 12.3 timestamp mirrored on the sheet).
    sheet.status = 'finalized'
    sheet.finalizedAt = finalizedAt
    repo.updateSheet(sheet.id, { status: 'finalized', finalizedAt })

    return { ok: true, scoreId: saved.id }
  }

  // ── Retrieve an audit record by score id (Req 13.5) ──────────────
  ipc.handle('omr:get-audit', async (_e, scoreId: string): Promise<OmrAuditRecord | null> => {
    return repo.getAuditByScore(scoreId)
  })
}
