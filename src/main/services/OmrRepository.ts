// src/main/services/OmrRepository.ts
// Persistence layer for the offline OMR + QR auto-marking pipeline.
//
// Wraps DatabaseService's better-sqlite3 handle to read/write the three
// `005_omr` tables (omr_batches, omr_sheets, omr_audit). All JSON columns
// (qr_payload, detected_answers, overrides) are serialized on write and
// parsed defensively on read, so a malformed persisted value degrades to a
// sensible empty default instead of throwing.

import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { DatabaseService } from './DatabaseService'
import type {
  OmrBatch,
  OmrSheet,
  OmrAuditRecord,
  DetectedAnswer,
  QrPayload,
  SheetStatus,
  AnswerOverride,
} from '../../shared/omr-types'

export class OmrRepository {
  private db: Database.Database

  constructor(dbService: DatabaseService) {
    this.db = dbService.getRawDb()
  }

  // ── Defensive JSON helpers ─────────────────────────────────────────

  /** Parse a persisted JSON column, falling back to `fallback` on any error. */
  private parseJson<T>(raw: unknown, fallback: T): T {
    if (raw === null || raw === undefined || raw === '') return fallback
    if (typeof raw !== 'string') return fallback
    try {
      const parsed = JSON.parse(raw)
      return (parsed ?? fallback) as T
    } catch {
      return fallback
    }
  }

  // ── Batches ────────────────────────────────────────────────────────

  createBatch(teacherId: string, examId?: string): OmrBatch {
    const batch: OmrBatch = {
      id: uuid(),
      teacherId,
      examId,
      total: 0,
      processed: 0,
      createdAt: Date.now(),
    }
    this.db.prepare(`
      INSERT INTO omr_batches (id, teacher_id, exam_id, total, processed, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(batch.id, batch.teacherId, batch.examId ?? null, batch.total, batch.processed, batch.createdAt)
    return batch
  }

  // ── Sheets ─────────────────────────────────────────────────────────

  saveSheet(sheet: OmrSheet): OmrSheet {
    const saved: OmrSheet = {
      ...sheet,
      id: sheet.id || uuid(),
      createdAt: sheet.createdAt || Date.now(),
    }
    this.db.prepare(`
      INSERT OR REPLACE INTO omr_sheets
        (id, batch_id, exam_id, student_id, status, reason, qr_payload, sheet_confidence,
         detected_answers, overrides, raw_score, max_score, percentage, grade, image_path,
         created_at, finalized_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saved.id,
      saved.batchId,
      saved.examId ?? null,
      saved.studentId ?? null,
      saved.status,
      saved.reason ?? null,
      saved.qrPayload ? JSON.stringify(saved.qrPayload) : null,
      saved.sheetConfidence,
      JSON.stringify(saved.detectedAnswers ?? []),
      JSON.stringify(saved.overrides ?? {}),
      saved.rawScore,
      saved.maxScore,
      saved.percentage,
      saved.grade ?? null,
      saved.imagePath,
      saved.createdAt,
      saved.finalizedAt ?? null,
    )
    return saved
  }

  getSheet(id: string): OmrSheet | null {
    const row = this.db.prepare('SELECT * FROM omr_sheets WHERE id = ?').get(id) as any
    return row ? this.rowToSheet(row) : null
  }

  getBatchSheets(batchId: string): OmrSheet[] {
    return (this.db.prepare('SELECT * FROM omr_sheets WHERE batch_id = ? ORDER BY created_at')
      .all(batchId) as any[]).map((r) => this.rowToSheet(r))
  }

  /**
   * Apply a partial update to a sheet. Only the fields present in `patch` are
   * written, so review-time edits (status, student assignment, overrides,
   * re-scored values, finalization time) can be persisted without re-sending
   * the whole sheet. JSON columns are serialized here.
   */
  updateSheet(id: string, patch: Partial<OmrSheet>): void {
    const sets: string[] = []
    const params: any[] = []

    const push = (column: string, value: any): void => {
      sets.push(`${column} = ?`)
      params.push(value)
    }

    if ('batchId' in patch) push('batch_id', patch.batchId)
    if ('examId' in patch) push('exam_id', patch.examId ?? null)
    if ('studentId' in patch) push('student_id', patch.studentId ?? null)
    if ('status' in patch) push('status', patch.status)
    if ('reason' in patch) push('reason', patch.reason ?? null)
    if ('qrPayload' in patch) push('qr_payload', patch.qrPayload ? JSON.stringify(patch.qrPayload) : null)
    if ('sheetConfidence' in patch) push('sheet_confidence', patch.sheetConfidence)
    if ('detectedAnswers' in patch) push('detected_answers', JSON.stringify(patch.detectedAnswers ?? []))
    if ('overrides' in patch) push('overrides', JSON.stringify(patch.overrides ?? {}))
    if ('rawScore' in patch) push('raw_score', patch.rawScore)
    if ('maxScore' in patch) push('max_score', patch.maxScore)
    if ('percentage' in patch) push('percentage', patch.percentage)
    if ('grade' in patch) push('grade', patch.grade ?? null)
    if ('imagePath' in patch) push('image_path', patch.imagePath)
    if ('createdAt' in patch) push('created_at', patch.createdAt)
    if ('finalizedAt' in patch) push('finalized_at', patch.finalizedAt ?? null)

    if (sets.length === 0) return

    params.push(id)
    this.db.prepare(`UPDATE omr_sheets SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }

  private rowToSheet(row: any): OmrSheet {
    return {
      id: row.id,
      batchId: row.batch_id,
      examId: row.exam_id ?? undefined,
      studentId: row.student_id ?? undefined,
      status: row.status as SheetStatus,
      reason: row.reason ?? undefined,
      qrPayload: this.parseJson<QrPayload | undefined>(row.qr_payload, undefined),
      sheetConfidence: row.sheet_confidence,
      detectedAnswers: this.parseJson<DetectedAnswer[]>(row.detected_answers, []),
      overrides: this.parseJson<Record<string, string[]>>(row.overrides, {}),
      rawScore: row.raw_score,
      maxScore: row.max_score,
      percentage: row.percentage,
      grade: row.grade,
      imagePath: row.image_path,
      createdAt: row.created_at,
      finalizedAt: row.finalized_at ?? undefined,
    }
  }

  // ── Audit ──────────────────────────────────────────────────────────

  saveAudit(a: OmrAuditRecord): OmrAuditRecord {
    const saved: OmrAuditRecord = {
      ...a,
      id: a.id || uuid(),
      createdAt: a.createdAt || Date.now(),
    }
    this.db.prepare(`
      INSERT OR REPLACE INTO omr_audit
        (id, score_id, sheet_id, exam_id, student_id, detected_answers, sheet_confidence,
         overrides, image_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saved.id,
      saved.scoreId,
      saved.sheetId,
      saved.examId,
      saved.studentId,
      JSON.stringify(saved.detectedAnswers ?? []),
      saved.sheetConfidence,
      JSON.stringify(saved.overrides ?? []),
      saved.imagePath,
      saved.createdAt,
    )
    return saved
  }

  getAuditByScore(scoreId: string): OmrAuditRecord | null {
    const row = this.db.prepare('SELECT * FROM omr_audit WHERE score_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(scoreId) as any
    return row ? this.rowToAudit(row) : null
  }

  private rowToAudit(row: any): OmrAuditRecord {
    return {
      id: row.id,
      scoreId: row.score_id,
      sheetId: row.sheet_id,
      examId: row.exam_id,
      studentId: row.student_id,
      detectedAnswers: this.parseJson<DetectedAnswer[]>(row.detected_answers, []),
      sheetConfidence: row.sheet_confidence,
      overrides: this.parseJson<AnswerOverride[]>(row.overrides, []),
      imagePath: row.image_path,
      createdAt: row.created_at,
    }
  }
}
