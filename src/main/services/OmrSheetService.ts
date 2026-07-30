// src/main/services/OmrSheetService.ts
// Sheet_Generator: turns an existing exam into a printable OMR answer sheet.
//
// Flow (design §3, Requirements 1.5, 1.7, 2.1-2.5):
//   load exam -> derive objectiveQuestions
//     -> if none, decline with a message (Req 1.5)
//     -> else build the deterministic layout, build + encode the QR payload
//        (studentId ?? UNASSIGNED), and export the sheet via ExportService (Req 1.7).
//
// The deterministic core (layout + QR payload) lives in the shared modules; this
// service is the impure orchestrator that reads the DB and drives PDF export.

import { buildLayout, objectiveQuestions, OMR_LAYOUT_VERSION } from '@shared/omr-layout'
import { UNASSIGNED } from '@shared/omr-types'
import type { QrPayload, GenerateSheetRequest, GenerateSheetResult } from '@shared/omr-types'
import type { AnswerSheetContent, ExportPayload } from '@shared/ai-types'
import type { DatabaseService } from './DatabaseService'
import type { QrService } from './QrService'
import type { ExportService } from './ExportService'

// Re-export the generation contract types (now defined in @shared/omr-types)
// so existing importers of this module continue to resolve them.
export type { GenerateSheetRequest, GenerateSheetResult } from '@shared/omr-types'

// ─── SERVICE ───────────────────────────────────────────────────────

export class OmrSheetService {
  constructor(
    private readonly db: DatabaseService,
    private readonly qr: QrService,
    private readonly exporter: ExportService
  ) {}

  /**
   * Generate a printable answer sheet for an exam.
   *
   * Returns `{ ok: false, message }` when the exam is missing or has no objective
   * questions (Req 1.5); otherwise builds the layout + QR, exports the sheet, and
   * returns `{ ok: true, filePath }` (Req 1.7).
   */
  async generate(req: GenerateSheetRequest): Promise<GenerateSheetResult> {
    const exam = this.db.getExam(req.examId)
    if (!exam) {
      return { ok: false, message: 'Exam not found.' }
    }

    // Req 1.5 / 14.1: no objective questions eligible for OMR -> decline.
    const objectives = objectiveQuestions(exam)
    if (objectives.length === 0) {
      return {
        ok: false,
        message: 'This exam has no objective questions eligible for OMR.'
      }
    }

    // Deterministic geometry shared with the OMR engine.
    const layout = buildLayout(exam, OMR_LAYOUT_VERSION)

    // Build + encode the QR payload. An assigned student id is encoded when
    // present (Req 2.3); otherwise the UNASSIGNED sentinel marks the sheet
    // unassigned (Req 2.4). The layout version is carried for the reader (Req 2.5).
    const payload: QrPayload = {
      v: OMR_LAYOUT_VERSION,
      examId: exam.id,
      studentId: req.studentId ?? UNASSIGNED
    }
    const qrDataUrl = await this.qr.encode(payload)

    // Resolve the optional student name for the printed header.
    const studentName = req.studentId
      ? this.db.getStudent(req.studentId)?.name
      : undefined

    const content: AnswerSheetContent = {
      layout,
      qrDataUrl,
      exam: {
        title: exam.title,
        subject: exam.subject,
        classLevel: exam.classLevel
      },
      studentName
    }

    const exportPayload: ExportPayload = {
      type: 'answer_sheet',
      title: `${exam.title} - Answer Sheet`,
      content,
      template: 'plain'
    }

    const filePath = await this.exporter.exportToPDF(exportPayload)
    return { ok: true, filePath }
  }
}
