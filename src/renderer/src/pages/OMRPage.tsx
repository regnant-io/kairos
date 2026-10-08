// src/renderer/src/pages/OMRPage.tsx
import React, { useState, useEffect, useMemo } from 'react'
import {
  ScanLine, FileDown, AlertTriangle, Upload, CheckCircle2, ClipboardList, FileClock
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../hooks/useIPC'
import { useOmrStore, useUIStore } from '../stores'
import {
  PageHeader, Field, Select, EmptyState, Spinner, Tabs, Badge, ProgressBar, Section
} from '../components/ui/Primitives'
import { cn, gradeBg } from '../components/ui/utils'
import type { Exam, Student, Question } from '@shared/db-types'
import type { OmrSheet, DetectedAnswer, OmrAuditRecord, SheetStatus } from '@shared/omr-types'

type OmrMode = 'generate' | 'review'

export function OMRPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<OmrMode>('generate')

  return (
    <div className="operator-workflow-page operator-omr-page flex flex-col h-screen overflow-hidden">
      <div className="px-6 pt-6">
        <PageHeader
          title={t('nav.omr')}
          subtitle="Generate printable answer sheets and auto-mark objective questions"
          className="mb-4"
        />
        <Tabs
          tabs={[
            { id: 'generate', label: 'Generate', icon: <FileDown size={14} /> },
            { id: 'review', label: 'Review Interface', icon: <ScanLine size={14} /> }
          ]}
          activeTab={mode}
          onTabChange={(id) => setMode(id as OmrMode)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {mode === 'generate' ? <GenerateMode /> : <ReviewMode />}
      </div>
    </div>
  )
}

// ── Generate mode (Task 11.2, Req 1.5, 1.7) ───────────────────────
// Exam picker + optional student assignment + "Generate Answer Sheet".
// On { ok: true, filePath } opens the PDF and toasts success.
// On { ok: false, message } surfaces the decline message (Req 1.5).

function GenerateMode() {
  const { addToast } = useUIStore()
  const generateSheet = useOmrStore((s) => s.generateSheet)

  const [exams, setExams] = useState<Exam[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [declineMessage, setDeclineMessage] = useState<string | null>(null)

  const selectedExam = exams.find((e) => e.id === selectedExamId) ?? null

  // Load exams once.
  useEffect(() => {
    ipc('db:get-exams').then((es) => setExams(es ?? []))
  }, [])

  // Load students scoped to the selected exam's class level (Req 2.3);
  // reset any prior student choice/decline when the exam changes.
  useEffect(() => {
    setSelectedStudentId('')
    setDeclineMessage(null)
    if (!selectedExam) {
      setStudents([])
      return
    }
    ipc('db:get-students', selectedExam.classLevel).then((ss) => setStudents(ss ?? []))
  }, [selectedExamId])

  async function handleGenerate() {
    if (!selectedExamId) return
    setGenerating(true)
    setDeclineMessage(null)
    try {
      const result = await generateSheet({
        examId: selectedExamId,
        studentId: selectedStudentId || undefined
      })

      if (result.ok && result.filePath) {
        await ipc('file:open-path', result.filePath)
        addToast({
          type: 'success',
          title: 'Answer sheet generated',
          message: 'The printable answer sheet has been opened.'
        })
      } else {
        // Exam has no objective questions eligible for OMR (Req 1.5).
        const message = result.message ?? 'This exam has no objective questions eligible for OMR.'
        setDeclineMessage(message)
        addToast({ type: 'warning', title: 'Cannot generate answer sheet', message })
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Generation failed', message: String(err) })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto py-4 space-y-5">
      <div className="card p-5 space-y-4">
        <Field label="Exam" required>
          <Select
            value={selectedExamId}
            onChange={setSelectedExamId}
            options={exams.map((e) => ({ value: e.id, label: `${e.subject}: ${e.title}` }))}
            placeholder="Choose an exam…"
          />
        </Field>

        <Field
          label="Assign Student (optional)"
          hint={
            selectedExam
              ? 'Leave unassigned to print a generic sheet the student can be matched to later.'
              : 'Select an exam first to choose a student.'
          }
        >
          <Select
            value={selectedStudentId}
            onChange={setSelectedStudentId}
            options={students.map((s) => ({
              value: s.id,
              label: s.regNumber ? `${s.name} (${s.regNumber})` : s.name
            }))}
            placeholder="Unassigned"
            disabled={!selectedExam || students.length === 0}
          />
        </Field>

        {selectedExam && (
          <div className="flex items-center gap-2">
            <Badge label={selectedExam.classLevel} color="blue" />
            <Badge label={`${selectedExam.totalMarks} marks`} color="amber" />
            {selectedStudentId ? (
              <Badge label="Assigned" color="green" />
            ) : (
              <Badge label="Unassigned" color="slate" />
            )}
          </div>
        )}

        {declineMessage && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">{declineMessage}</p>
          </div>
        )}

        <button
          className="btn-primary w-full"
          onClick={handleGenerate}
          disabled={!selectedExamId || generating}
        >
          {generating ? (
            <><Spinner size={16} className="text-white" /> Generating…</>
          ) : (
            <><FileDown size={16} /> Generate Answer Sheet</>
          )}
        </button>
      </div>

      {exams.length === 0 && (
        <EmptyState
          icon={<ScanLine size={22} />}
          title="No exams available"
          description="Create an exam in the Exam Generator first, then come back to print an answer sheet."
        />
      )}
    </div>
  )
}

// ── Review Interface mode (Task 11.3) ─────────────────────────────
// Import scanned sheets -> omr:process-images (Req 3.2); review per-sheet
// Confidence_Score with low-confidence/attention flags (Req 10.1-10.4);
// list each Detected_Answer beside its Expected_Answer with editable overrides
// (omr:recompute, Req 11.1, 11.2, 5.2); assign students/exams (Req 5.2, 11.3);
// Finalize single / Finalize All with confirm-replace (Req 11.4-11.6, 12.4);
// and view the audit record for a finalized sheet (omr:get-audit, Req 13.5).

// The backend flags sheets/answers with confidence <= 50 as low-confidence
// (Req 10.1, 10.2).
const LOW_CONFIDENCE = 50

// Statuses that need teacher attention before a sheet can be finalized —
// visually distinguished from the clean 'detected'/'finalized' states (Req 10.4).
const ATTENTION_STATUSES: SheetStatus[] = [
  'failed', 'qr_unreadable', 'exam_not_found', 'needs_student',
  'alignment_failed', 'low_quality'
]

const STATUS_META: Record<SheetStatus, { label: string; color: string }> = {
  failed: { label: 'File failed', color: 'red' },
  qr_unreadable: { label: 'QR unreadable', color: 'red' },
  exam_not_found: { label: 'Exam not found', color: 'red' },
  needs_student: { label: 'Needs student', color: 'amber' },
  alignment_failed: { label: 'Alignment failed', color: 'red' },
  low_quality: { label: 'Low quality', color: 'amber' },
  detected: { label: 'Detected', color: 'blue' },
  finalized: { label: 'Finalized', color: 'green' }
}

function isAttention(status: SheetStatus): boolean {
  return ATTENTION_STATUSES.includes(status)
}

// Confidence colour ramp: low-confidence (<=50) red, mid amber, high green.
function confidenceColor(v: number): string {
  if (v <= LOW_CONFIDENCE) return 'text-danger'
  if (v <= 75) return 'text-amber-500'
  return 'text-success'
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function ReviewMode() {
  const { addToast } = useUIStore()
  const {
    sheets, progress, isProcessing, selectedSheetId, isFinalizing,
    processImages, setSelectedSheet, finalizeBatch
  } = useOmrStore()

  // Batch confirm-replace prompt (Req 12.4): when finalizing all, if any sheet
  // already has a recorded score, ask before overwriting.
  const [confirmBatch, setConfirmBatch] = useState(false)

  const selectedSheet = sheets.find((s) => s.id === selectedSheetId) ?? null

  // Sheets eligible for batch finalize: scored + assigned + no unresolved flags (Req 11.6).
  const finalizable = sheets.filter((s) => s.status === 'detected' && !!s.studentId)

  async function handleImport() {
    try {
      const paths = await ipc('file:open-dialog', {
        title: 'Import scanned answer sheets',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif'] }],
        multiSelections: true
      })
      if (!paths || paths.length === 0) return
      await processImages({ filePaths: paths })
    } catch (err) {
      addToast({ type: 'error', title: 'Import failed', message: String(err) })
    }
  }

  async function runFinalizeBatch(confirmReplace = false) {
    const ids = finalizable.map((s) => s.id)
    if (ids.length === 0) return
    try {
      const results = await finalizeBatch({ sheetIds: ids, confirmReplace })
      // If any sheet needs replace-confirmation and we haven't confirmed yet,
      // surface the confirm dialog and re-run with confirmReplace: true (Req 12.4).
      if (!confirmReplace && results.some((r) => r.needsConfirmReplace)) {
        setConfirmBatch(true)
        return
      }
      setConfirmBatch(false)
      const ok = results.filter((r) => r.ok).length
      const needStudent = results.filter((r) => r.needsStudent).length
      if (ok > 0) {
        addToast({
          type: 'success',
          title: 'Sheets finalized',
          message: `${ok} sheet${ok !== 1 ? 's' : ''} recorded to scores.`
        })
      }
      if (needStudent > 0) {
        addToast({
          type: 'warning',
          title: 'Some sheets skipped',
          message: `${needStudent} sheet${needStudent !== 1 ? 's' : ''} still need a student.`
        })
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Finalize failed', message: String(err) })
    }
  }

  return (
    <div className="py-4">
      {/* Toolbar: import + batch finalize */}
      <div className="flex items-center gap-2 mb-4">
        <button className="btn-primary" onClick={handleImport} disabled={isProcessing}>
          {isProcessing ? (
            <><Spinner size={16} className="text-white" /> Processing…</>
          ) : (
            <><Upload size={16} /> Import Sheets</>
          )}
        </button>
        {finalizable.length > 0 && (
          <button
            className="btn-secondary"
            onClick={() => runFinalizeBatch(false)}
            disabled={isFinalizing}
          >
            <CheckCircle2 size={16} /> Finalize All ({finalizable.length})
          </button>
        )}
      </div>

      {/* Batch progress ({done}/{total}) while processing (Req 3.2, 3.3) */}
      {isProcessing && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
            <span>Processing sheets…</span>
            <span className="font-medium">{progress.done}/{progress.total}</span>
          </div>
          <ProgressBar value={progress.done} max={Math.max(progress.total, 1)} />
        </div>
      )}

      {sheets.length === 0 && !isProcessing ? (
        <EmptyState
          icon={<ScanLine size={22} />}
          title="No sheets imported yet"
          description="Import photos or scans of filled answer sheets to auto-mark them and review the results here."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          {/* Sheet list */}
          <div className="space-y-2">
            {sheets.map((sheet) => (
              <SheetListItem
                key={sheet.id}
                sheet={sheet}
                selected={sheet.id === selectedSheetId}
                onSelect={() => setSelectedSheet(sheet.id)}
              />
            ))}
          </div>

          {/* Detail view */}
          <div>
            {selectedSheet ? (
              <SheetDetail key={selectedSheet.id} sheet={selectedSheet} />
            ) : (
              <EmptyState
                icon={<ClipboardList size={22} />}
                title="Select a sheet"
                description="Choose a sheet from the list to review its detected answers and finalize its score."
              />
            )}
          </div>
        </div>
      )}

      {confirmBatch && (
        <ConfirmDialog
          title="Replace existing scores?"
          message="One or more of these sheets already has a recorded score for the same student and exam. Finalizing will overwrite the existing records."
          confirmLabel="Replace all"
          onConfirm={() => runFinalizeBatch(true)}
          onCancel={() => setConfirmBatch(false)}
        />
      )}
    </div>
  )
}

// ── Sheet list row ────────────────────────────────────────────────
// Shows the per-sheet Confidence_Score (Req 10.3) with a visual flag for
// low-confidence (<=50) and attention statuses (Req 10.1, 10.4).

function SheetListItem({
  sheet, selected, onSelect
}: {
  sheet: OmrSheet
  selected: boolean
  onSelect: () => void
}) {
  const meta = STATUS_META[sheet.status]
  const lowConf = sheet.sheetConfidence <= LOW_CONFIDENCE
  const attention = isAttention(sheet.status)
  const scored = sheet.status === 'detected' || sheet.status === 'finalized'

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left card p-3 border transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300',
        (attention || lowConf) && !selected && 'border-l-4 border-l-amber-400'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 truncate">
          {fileNameOf(sheet.imagePath)}
        </span>
        <Badge label={meta.label} color={meta.color} />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className={cn('text-xs font-semibold', confidenceColor(sheet.sheetConfidence))}>
          Confidence: {Math.round(sheet.sheetConfidence)}%
        </span>
        {(lowConf || attention) && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle size={12} />
            {lowConf ? 'Low confidence' : 'Needs attention'}
          </span>
        )}
      </div>

      {scored && (
        <div className="text-xs text-slate-500 mt-1">
          Score: {sheet.rawScore}/{sheet.maxScore} ({Math.round(sheet.percentage)}%) · {sheet.grade}
        </div>
      )}
    </button>
  )
}

// ── Sheet detail view ─────────────────────────────────────────────
// Detected vs Expected answers, editable overrides, student/exam assignment,
// Finalize, and the audit viewer.

function SheetDetail({ sheet }: { sheet: OmrSheet }) {
  const { addToast } = useUIStore()
  const { assign, recompute, finalize, getAudit, isFinalizing } = useOmrStore()

  const [exam, setExam] = useState<Exam | null>(null)
  const [exams, setExams] = useState<Exam[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [audit, setAudit] = useState<OmrAuditRecord | null>(null)
  const [lastScoreId, setLastScoreId] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const needsExamPick = sheet.status === 'qr_unreadable' || sheet.status === 'exam_not_found'

  // Load the sheet's exam (for Expected_Answer + question marks). Reset audit
  // state whenever the selected sheet or its exam changes.
  useEffect(() => {
    setAudit(null)
    setLastScoreId(null)
    if (sheet.examId) {
      ipc('db:get-exam', sheet.examId).then((e) => setExam(e ?? null))
    } else {
      setExam(null)
    }
  }, [sheet.id, sheet.examId])

  // For QR-unreadable / exam-not-found sheets, let the teacher pick the exam (Req 5.2).
  useEffect(() => {
    if (needsExamPick) {
      ipc('db:get-exams').then((es) => setExams(es ?? []))
    }
  }, [needsExamPick])

  // Students scoped to the exam's class level when known (Req 11.3).
  useEffect(() => {
    ipc('db:get-students', exam?.classLevel).then((ss) => setStudents(ss ?? []))
  }, [exam?.classLevel])

  // Objective questions keyed by id -> Expected_Answer + marks (Req 11.1).
  const expectedMap = useMemo(() => {
    const m: Record<string, Question> = {}
    for (const q of exam?.questions ?? []) {
      if (q.type === 'multiple_choice' || q.type === 'true_or_false') m[q.id] = q
    }
    return m
  }, [exam])

  async function handleAssignStudent(studentId: string) {
    try {
      await assign({ sheetId: sheet.id, studentId: studentId || undefined })
    } catch (err) {
      addToast({ type: 'error', title: 'Assignment failed', message: String(err) })
    }
  }

  async function handleAssignExam(examId: string) {
    try {
      await assign({ sheetId: sheet.id, examId: examId || undefined })
    } catch (err) {
      addToast({ type: 'error', title: 'Assignment failed', message: String(err) })
    }
  }

  // Override a detected answer and recompute the score (Req 11.2, 5.2).
  async function handleOverride(questionId: string, value: string) {
    const overrides = { ...sheet.overrides }
    if (value === '') delete overrides[questionId]        // back to detected
    else if (value === '__blank__') overrides[questionId] = []
    else overrides[questionId] = [value]
    try {
      await recompute({ sheetId: sheet.id, overrides })
    } catch (err) {
      addToast({ type: 'error', title: 'Recompute failed', message: String(err) })
    }
  }

  async function doFinalize(confirm = false) {
    try {
      const result = await finalize({ sheetId: sheet.id, confirmReplace: confirm })
      if (result.needsStudent) {
        addToast({
          type: 'warning',
          title: 'Assign a student first',
          message: 'This sheet needs a student assigned before it can be finalized.'
        })
        return
      }
      if (result.needsConfirmReplace) {
        setConfirmReplace(true)   // Req 12.4
        return
      }
      if (result.ok && result.scoreId) {
        setLastScoreId(result.scoreId)
        setConfirmReplace(false)
        addToast({ type: 'success', title: 'Sheet finalized', message: 'The score has been recorded.' })
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Finalize failed', message: String(err) })
    }
  }

  async function viewAudit() {
    if (!lastScoreId) return
    try {
      const rec = await getAudit(lastScoreId)
      setAudit(rec)
      if (!rec) addToast({ type: 'info', title: 'No audit record', message: 'No audit record was found for this sheet.' })
    } catch (err) {
      addToast({ type: 'error', title: 'Audit lookup failed', message: String(err) })
    }
  }

  const meta = STATUS_META[sheet.status]
  const scored = sheet.status === 'detected' || sheet.status === 'finalized'
  const isFailed = sheet.status === 'failed'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium text-slate-800 truncate">{fileNameOf(sheet.imagePath)}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge label={meta.label} color={meta.color} />
              <span className={cn('text-xs font-semibold', confidenceColor(sheet.sheetConfidence))}>
                Confidence: {Math.round(sheet.sheetConfidence)}%
              </span>
            </div>
            {sheet.reason && <p className="text-xs text-slate-400 mt-1">{sheet.reason}</p>}
          </div>
          {scored && (
            <span className={cn('px-3 py-1 rounded-lg border text-sm font-semibold', gradeBg(sheet.grade))}>
              {sheet.grade}
            </span>
          )}
        </div>
      </div>

      {isFailed ? (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
          <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            This file could not be read as an image and was skipped. {sheet.reason}
          </p>
        </div>
      ) : (
        <>
          {/* Assignment controls */}
          <div className="card p-4 space-y-3">
            {needsExamPick && (
              <Field label="Exam" hint="This sheet's QR code could not identify the exam. Select it manually.">
                <Select
                  value={sheet.examId ?? ''}
                  onChange={handleAssignExam}
                  options={exams.map((e) => ({ value: e.id, label: `${e.subject}: ${e.title}` }))}
                  placeholder="Choose an exam…"
                />
              </Field>
            )}
            <Field
              label="Student"
              hint="Assign the student this sheet belongs to before finalizing."
            >
              <Select
                value={sheet.studentId ?? ''}
                onChange={handleAssignStudent}
                options={students.map((s) => ({
                  value: s.id,
                  label: s.regNumber ? `${s.name} (${s.regNumber})` : s.name
                }))}
                placeholder="Unassigned"
              />
            </Field>
          </div>

          {/* Detected vs Expected (Req 11.1) */}
          {sheet.detectedAnswers.length > 0 && (
            <Section title="Detected vs Expected">
              <div className="space-y-1.5">
                {sheet.detectedAnswers.map((a) => (
                  <AnswerRow
                    key={a.questionId}
                    answer={a}
                    expected={expectedMap[a.questionId]?.expectedAnswer}
                    overrideValue={overrideSelectValue(sheet, a)}
                    onOverride={(v) => handleOverride(a.questionId, v)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Score summary + Finalize (Req 11.5) */}
          {scored && (
            <div className="card p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Score</div>
                <div className="text-2xl font-bold text-slate-800">
                  {sheet.rawScore}/{sheet.maxScore}
                </div>
                <div className="text-xs text-slate-400">{Math.round(sheet.percentage)}%</div>
              </div>
              <button
                className="btn-primary"
                onClick={() => doFinalize(false)}
                disabled={isFinalizing || sheet.status === 'finalized'}
              >
                {sheet.status === 'finalized' ? (
                  <><CheckCircle2 size={16} /> Finalized</>
                ) : isFinalizing ? (
                  <><Spinner size={16} className="text-white" /> Finalizing…</>
                ) : (
                  <><CheckCircle2 size={16} /> Finalize</>
                )}
              </button>
            </div>
          )}

          {/* Audit viewer (Req 13.5) */}
          {(lastScoreId || sheet.status === 'finalized') && (
            <Section title="Audit Record">
              {audit ? (
                <AuditView audit={audit} />
              ) : (
                <button className="btn-secondary" onClick={viewAudit} disabled={!lastScoreId}>
                  <FileClock size={16} /> View Audit Record
                </button>
              )}
              {!lastScoreId && sheet.status === 'finalized' && !audit && (
                <p className="text-xs text-slate-400 mt-1">
                  The audit record is available for sheets finalized in this session.
                </p>
              )}
            </Section>
          )}
        </>
      )}

      {confirmReplace && (
        <ConfirmDialog
          title="Replace existing score?"
          message="A score already exists for this student and exam. Finalizing will overwrite the existing record."
          confirmLabel="Replace"
          onConfirm={() => doFinalize(true)}
          onCancel={() => setConfirmReplace(false)}
        />
      )}
    </div>
  )
}

// Current value for an answer's override select: '' = use detected,
// '__blank__' = force blank, otherwise the overridden option label.
function overrideSelectValue(sheet: OmrSheet, a: DetectedAnswer): string {
  const ov = sheet.overrides[a.questionId]
  if (ov === undefined) return ''
  if (ov.length === 0) return '__blank__'
  return ov[0]
}

// ── Detected-answer row with editable override ────────────────────
// Flagged / low-confidence answers are visually marked (Req 10.2).

function AnswerRow({
  answer, expected, overrideValue, onOverride
}: {
  answer: DetectedAnswer
  expected?: string
  overrideValue: string
  onOverride: (v: string) => void
}) {
  const lowConf = answer.confidence <= LOW_CONFIDENCE
  const flagged = answer.flagged || lowConf
  const detected = answer.selected.length ? answer.selected.join(', ') : 'blank'

  const options = [
    { value: '', label: 'Detected' },
    ...answer.optionLabels.map((l) => ({ value: l, label: l })),
    { value: '__blank__', label: 'Blank' }
  ]

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg border',
        flagged ? 'border-amber-200 bg-amber-50' : 'border-slate-100'
      )}
    >
      <span className="w-8 text-xs font-semibold text-slate-500 flex-shrink-0">Q{answer.number}</span>

      <div className="flex-1 min-w-0 text-sm">
        <span className="text-slate-500">Detected: </span>
        <span className="font-medium text-slate-800">{detected}</span>
        <span className={cn('ml-2 text-xs', confidenceColor(answer.confidence))}>
          {Math.round(answer.confidence)}%
        </span>
        {flagged && <AlertTriangle size={12} className="inline ml-1 text-amber-500" />}
      </div>

      <div className="text-sm flex-shrink-0">
        <span className="text-slate-500">Expected: </span>
        <span className="font-medium text-slate-800">{expected ?? 'Not detected'}</span>
      </div>

      <Select
        className="w-28 flex-shrink-0"
        value={overrideValue}
        onChange={onOverride}
        options={options}
      />
    </div>
  )
}

// ── Audit view (Req 13.2, 13.3, 13.4, 13.5) ───────────────────────

function AuditView({ audit }: { audit: OmrAuditRecord }) {
  return (
    <div className="card p-3 text-sm space-y-2">
      <div className="text-xs text-slate-500">
        Sheet confidence: {Math.round(audit.sheetConfidence)}% · Source: {fileNameOf(audit.imagePath)}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">Detected answers</div>
        <div className="space-y-0.5">
          {audit.detectedAnswers.map((a) => (
            <div key={a.questionId} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">
                Q{a.number}: {a.selected.length ? a.selected.join(', ') : 'blank'}
              </span>
              <span className={confidenceColor(a.confidence)}>{Math.round(a.confidence)}%</span>
            </div>
          ))}
        </div>
      </div>

      {audit.overrides.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Overrides</div>
          <div className="space-y-0.5">
            {audit.overrides.map((o) => (
              <div key={o.questionId} className="text-xs text-slate-600">
                {o.questionId}: {o.original.length ? o.original.join(', ') : 'blank'}
                {' → '}
                {o.overridden.length ? o.overridden.join(', ') : 'blank'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────

function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onCancel
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="card p-5 max-w-sm w-full space-y-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
