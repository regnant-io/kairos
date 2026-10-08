// src/renderer/src/pages/ReportsPage.tsx
import React, { useState, useEffect } from 'react'
import { MessageSquare, Wand2, CheckCircle, FileDown, Edit3, Check, X } from 'lucide-react'
import { ipc, onEvent } from '../hooks/useIPC'
import { useAIStore, useTeacherStore, useUIStore } from '../stores'
import {
  PageHeader, Field, Select, EmptyState, Spinner,
  Badge, ProgressBar, Section, AIGeneratingBanner
} from '../components/ui/Primitives'
import { cn, formatDate } from '../components/ui/utils'
import { CLASS_LEVELS, SUBJECTS } from '@shared/db-types'
import type { Student, Score, ReportComment } from '@shared/db-types'
import type { ReportParams, BatchReportJob } from '@shared/ai-types'

const TERMS = ['Term 1', 'Term 2', 'Term 3']
const CURRENT_YEAR = new Date().getFullYear()

export function ReportsPage() {
  const { status } = useAIStore()
  const { teacher } = useTeacherStore()
  const { addToast } = useUIStore()

  const [classLevel, setClassLevel] = useState(teacher?.classLevels?.[0] ?? 'Form 3')
  const [subject, setSubject] = useState(teacher?.subjects?.[0] ?? '')
  const [term, setTerm] = useState('Term 1')
  const [year, setYear] = useState(CURRENT_YEAR)
  const [tone, setTone] = useState<'formal' | 'warm' | 'direct'>('warm')
  const [length, setLength] = useState<'brief' | 'standard' | 'detailed'>('standard')

  const [students, setStudents] = useState<Student[]>([])
  const [scores, setScores] = useState<Map<string, Score[]>>(new Map())
  const [reports, setReports] = useState<Map<string, ReportComment>>(new Map())
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const [batchJobId, setBatchJobId] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, current: '' })
  const [generatingSingle, setGeneratingSingle] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  useEffect(() => {
    loadData()
  }, [classLevel])

  useEffect(() => {
    // Listen for batch progress events
    const unsub = onEvent('ai:batch-progress', (data) => {
      if (data.jobId === batchJobId) {
        setBatchProgress({ done: data.done, total: data.total, current: data.current })
        if (data.done === data.total) {
          setBatchJobId(null)
          addToast({ type: 'success', title: 'All reports generated!', message: `${data.total} comments ready for review` })
          loadReports()
        }
      }
    })
    return unsub
  }, [batchJobId])

  async function loadData() {
    try {
      const [ss, rs] = await Promise.all([
        ipc('db:get-students', classLevel),
        ipc('db:get-reports', { classLevel, term, year })
      ])
      setStudents(ss ?? [])
      const reportMap = new Map<string, ReportComment>()
      for (const r of rs ?? []) reportMap.set(r.studentId, r)
      setReports(reportMap)
    } catch (err) {
      console.error(err)
    }
  }

  async function loadReports() {
    const rs = await ipc('db:get-reports', { term, year })
    const reportMap = new Map<string, ReportComment>()
    for (const r of rs ?? []) reportMap.set(r.studentId, r)
    setReports(reportMap)
  }

  async function generateSingle(student: Student) {
    setGeneratingSingle(student.id)
    try {
      const studentScores = scores.get(student.id) ?? []
      const params: ReportParams = {
        studentId: student.id,
        studentName: student.name,
        subject,
        term,
        year,
        scores: {
          exams: studentScores.map(s => ({ name: `Exam ${s.examId.slice(0, 4)}`, score: s.rawScore, maxScore: s.maxScore })),
          classAverage: studentScores.reduce((sum, s) => sum + s.percentage, 0) / Math.max(1, studentScores.length)
        },
        tone,
        length
      }
      const report = await ipc('ai:generate-report', params)
      const saved = await ipc('db:save-report', {
        ...report,
        teacherId: teacher?.id ?? '',
        studentId: student.id,
        term, year
      })
      setReports(m => new Map(m).set(student.id, saved))
      addToast({ type: 'success', title: `Report ready for ${student.name}` })
    } catch (err) {
      addToast({ type: 'error', title: 'Failed', message: String(err) })
    } finally {
      setGeneratingSingle(null)
    }
  }

  async function generateBatch() {
    if (students.length === 0) {
      addToast({ type: 'warning', title: 'No students in this class' })
      return
    }

    const jobs: ReportParams[] = students.map(student => ({
      studentId: student.id,
      studentName: student.name,
      subject,
      term,
      year,
      scores: { exams: [], classAverage: 0 },
      tone,
      length
    }))

    const job: BatchReportJob = { classLevel, subject, term, year, students: jobs }

    try {
      const { jobId } = await ipc('ai:batch-reports', job)
      setBatchJobId(jobId)
      setBatchProgress({ done: 0, total: students.length, current: '' })
      addToast({ type: 'info', title: 'Batch generation started', message: `Generating ${students.length} reports…` })
    } catch (err) {
      addToast({ type: 'error', title: 'Batch failed', message: String(err) })
    }
  }

  async function handleFinalize(reportId: string) {
    await ipc('db:finalize-report', reportId)
    setReports(m => {
      const updated = new Map(m)
      for (const [sid, r] of updated.entries()) {
        if (r.id === reportId) updated.set(sid, { ...r, isFinalized: true })
      }
      return updated
    })
    addToast({ type: 'success', title: 'Report finalized' })
  }

  function startEdit(report: ReportComment) {
    setEditingId(report.id)
    setEditText(report.commentText)
  }

  async function saveEdit(studentId: string) {
    const r = reports.get(studentId)
    if (!r) return
    const updated = { ...r, commentText: editText }
    await ipc('db:save-report', updated)
    setReports(m => new Map(m).set(studentId, updated))
    setEditingId(null)
    addToast({ type: 'success', title: 'Comment updated' })
  }

  const doneCount = students.filter(s => reports.has(s.id)).length
  const finalizedCount = students.filter(s => reports.get(s.id)?.isFinalized).length

  return (
    <div className="operator-workflow-page operator-reports-page flex h-screen overflow-hidden">
      {/* Left Config */}
      <div className="w-72 flex flex-col border-r border-slate-200 bg-white flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <PageHeader title="Report Writer" subtitle="Batch student comments" className="mb-0" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Field label="Class Level">
            <Select value={classLevel} onChange={v => setClassLevel(v)}
              options={CLASS_LEVELS.map(cl => ({ value: cl, label: cl }))} />
          </Field>

          <Field label="Subject">
            <Select value={subject} onChange={setSubject}
              options={SUBJECTS.map(s => ({ value: s, label: s }))} placeholder="Select subject" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Term">
              <Select value={term} onChange={setTerm}
                options={TERMS.map(t => ({ value: t, label: t }))} />
            </Field>
            <Field label="Year">
              <input type="number" className="input" value={year}
                onChange={e => setYear(Number(e.target.value))} />
            </Field>
          </div>

          <Field label="Comment Tone">
            <Select value={tone} onChange={v => setTone(v as any)}
              options={[
                { value: 'warm', label: 'Warm & Encouraging' },
                { value: 'formal', label: 'Formal & Academic' },
                { value: 'direct', label: 'Direct & Factual' }
              ]} />
          </Field>

          <Field label="Comment Length">
            <Select value={length} onChange={v => setLength(v as any)}
              options={[
                { value: 'brief', label: 'Brief (2-3 sentences)' },
                { value: 'standard', label: 'Standard (3-5 sentences)' },
                { value: 'detailed', label: 'Detailed (5-7 sentences)' }
              ]} />
          </Field>

          {/* Progress summary */}
          <div className="card p-3">
            <p className="text-xs text-slate-500 mb-2">Progress</p>
            <ProgressBar value={doneCount} max={Math.max(1, students.length)} color="primary" showLabel />
            <p className="text-xs text-slate-400 mt-1">{doneCount}/{students.length} generated · {finalizedCount} finalized</p>

            {batchJobId && (
              <div className="mt-2">
                <p className="text-xs text-primary font-medium animate-pulse">
                  {batchProgress.current ? `Generating: ${batchProgress.current}` : 'Processing…'}
                </p>
                <ProgressBar value={batchProgress.done} max={Math.max(1, batchProgress.total)} color="accent" />
              </div>
            )}
          </div>

          <button
            className="btn-primary w-full"
            onClick={generateBatch}
            disabled={!!batchJobId || status.status !== 'ready' || students.length === 0}
          >
            {batchJobId
              ? <><Spinner size={14} className="text-white" /> Generating…</>
              : <><Wand2 size={14} /> Generate All Reports ({students.length})</>
            }
          </button>

          {doneCount > 0 && (
            <button className="btn-secondary w-full" onClick={async () => {
              const payload = {
                type: 'report' as const,
                title: `${classLevel} ${subject} Reports, ${term} ${year}`,
                content: Array.from(reports.values()),
                template: 'plain' as const,
                schoolName: teacher?.schoolName,
                teacherName: teacher?.name
              }
              const path = await ipc('file:export-pdf', payload)
              addToast({ type: 'success', title: 'Reports exported' })
              ipc('file:open-path', path)
            }}>
              <FileDown size={14} /> Export All Reports
            </button>
          )}
        </div>
      </div>

      {/* Student list + comments */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-xl font-semibold text-slate-700">
              {classLevel}: {students.length} Students
            </h2>
            <div className="flex gap-2">
              <Badge label={`${doneCount} ready`} color="green" />
              <Badge label={`${students.length - doneCount} pending`} color="amber" />
            </div>
          </div>

          {students.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={24} />}
              title="No students in this class"
              description="Add students in Settings → Students, then come back to generate reports"
            />
          ) : (
            <div className="space-y-3">
              {students.map(student => {
                const report = reports.get(student.id)
                const isSingleGenerating = generatingSingle === student.id
                const isEditing = editingId === report?.id

                return (
                  <div key={student.id} className={cn(
                    'card p-4 transition-all',
                    report?.isFinalized ? 'border-success/30 bg-green-50/30' : ''
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary text-xs font-bold">
                            {student.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{student.name}</p>
                          {student.regNumber && <p className="text-xs text-slate-400">{student.regNumber}</p>}
                        </div>
                        {report?.isFinalized && <Badge label="Finalized" color="green" />}
                        {report && !report.isFinalized && <Badge label="Draft" color="amber" />}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!report ? (
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => generateSingle(student)}
                            disabled={isSingleGenerating || status.status !== 'ready'}
                          >
                            {isSingleGenerating ? <Spinner size={12} className="text-white" /> : <Wand2 size={12} />}
                            Generate
                          </button>
                        ) : !report.isFinalized ? (
                          <>
                            <button className="btn-secondary btn-sm" onClick={() => startEdit(report)}>
                              <Edit3 size={12} /> Edit
                            </button>
                            <button className="btn-primary btn-sm" onClick={() => handleFinalize(report.id)}>
                              <CheckCircle size={12} /> Finalize
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {/* Report content */}
                    {report && (
                      <div className="mt-3 pl-10">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              className="input resize-none w-full"
                              rows={4}
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button className="btn-primary btn-sm" onClick={() => saveEdit(student.id)}>
                                <Check size={12} /> Save
                              </button>
                              <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                                <X size={12} /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-slate-700 leading-relaxed">{report.commentText}</p>
                            {report.recommendation && (
                              <p className="text-xs text-slate-400 mt-1.5 italic">{report.recommendation}</p>
                            )}
                            {report.strengths?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {report.strengths.map((s, i) => (
                                  <span key={i} className="text-xs bg-green-50 text-green-600 border border-green-100 rounded-full px-2 py-0.5">
                                    ✓ {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {isSingleGenerating && (
                      <div className="mt-2 pl-10">
                        <AIGeneratingBanner feature="report comment" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
