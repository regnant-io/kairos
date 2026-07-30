// src/renderer/src/pages/MarkingPage.tsx
import React, { useState, useEffect } from 'react'
import { CheckSquare, ChevronRight, ChevronLeft, Save, Users, Wand2, AlertCircle } from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useAIStore, useTeacherStore, useUIStore } from '../stores'
import {
  PageHeader, Field, Select, EmptyState, Spinner,
  ProgressBar, Badge, Section, AIGeneratingBanner
} from '../components/ui/Primitives'
import { cn, gradeColor, gradeBg, scoreToGrade } from '../components/ui/utils'
import type { Exam, Student, Score, Question } from '@shared/db-types'
import type { MarkingParams, MarkingResult } from '@shared/ai-types'

type MarkingState = Record<string, {
  answer: string
  result: MarkingResult | null
  overriddenScore: number | null
  saved: boolean
}>

export function MarkingPage() {
  const { status } = useAIStore()
  const { teacher } = useTeacherStore()
  const { addToast } = useUIStore()

  const [exams, setExams] = useState<Exam[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [strictness, setStrictness] = useState<'lenient' | 'standard' | 'strict'>('standard')
  const [markingState, setMarkingState] = useState<MarkingState>({})
  const [marking, setMarking] = useState(false)
  const [savingAll, setSavingAll] = useState(false)

  useEffect(() => {
    ipc('db:get-exams').then(es => setExams(es ?? []))
    ipc('db:get-students').then(ss => setStudents(ss ?? []))
  }, [])

  const questions = selectedExam?.questions ?? []
  const currentQ = questions[currentQIdx]
  const currentKey = currentQ ? `${selectedStudent?.id}-${currentQ.id}` : ''
  const currentMark = currentKey ? markingState[currentKey] : null

  function setAnswer(text: string) {
    if (!currentKey) return
    setMarkingState(s => ({
      ...s,
      [currentKey]: { ...s[currentKey], answer: text, result: null, saved: false, overriddenScore: null }
    }))
  }

  async function handleMark() {
    if (!selectedExam || !selectedStudent || !currentQ) return
    const answer = currentMark?.answer ?? ''
    if (!answer.trim()) {
      addToast({ type: 'warning', title: 'Enter student answer first' })
      return
    }

    setMarking(true)
    try {
      const scheme = selectedExam.markingScheme.find(m => m.questionId === currentQ.id)
      const result = await ipc('ai:mark-script', {
        examId: selectedExam.id,
        studentId: selectedStudent.id,
        questionId: currentQ.id,
        studentAnswer: answer,
        markingScheme: {
          expectedAnswer: scheme?.fullAnswer ?? currentQ.expectedAnswer,
          markingPoints: scheme?.markingPoints ?? [currentQ.markingGuide],
          totalMarks: currentQ.marks
        },
        strictness
      })
      setMarkingState(s => ({
        ...s,
        [currentKey]: { ...s[currentKey], result, saved: false }
      }))
    } catch (err) {
      addToast({ type: 'error', title: 'Marking failed', message: String(err) })
    } finally {
      setMarking(false)
    }
  }

  async function handleSaveAll() {
    if (!selectedExam || !selectedStudent) return
    setSavingAll(true)

    // Calculate total
    let total = 0
    const questionScores: any[] = []

    for (const q of questions) {
      const key = `${selectedStudent.id}-${q.id}`
      const ms = markingState[key]
      if (ms?.result) {
        const score = ms.overriddenScore ?? ms.result.suggestedScore
        total += score
        questionScores.push({
          questionId: q.id,
          score,
          maxScore: q.marks,
          topic: q.topic
        })
      }
    }

    const maxScore = questions.reduce((s, q) => s + q.marks, 0)
    const percentage = Math.round((total / maxScore) * 100)
    const grade = scoreToGrade(percentage)

    try {
      await ipc('db:save-score', {
        studentId: selectedStudent.id,
        examId: selectedExam.id,
        teacherId: teacher?.id ?? '',
        rawScore: total,
        maxScore,
        percentage,
        grade: grade as any,
        questionScores,
        markedAt: Date.now()
      })
      setMarkingState(s => {
        const updated = { ...s }
        for (const q of questions) {
          const key = `${selectedStudent.id}-${q.id}`
          if (updated[key]) updated[key] = { ...updated[key], saved: true }
        }
        return updated
      })
      addToast({ type: 'success', title: 'Scores saved!', message: `${selectedStudent.name}: ${percentage}% (${grade})` })
    } catch (err) {
      addToast({ type: 'error', title: 'Save failed', message: String(err) })
    } finally {
      setSavingAll(false)
    }
  }

  const markedCount = questions.filter(q => {
    const key = `${selectedStudent?.id}-${q.id}`
    return markingState[key]?.result != null
  }).length

  const classStudents = selectedExam
    ? students.filter(s => s.classLevel === selectedExam.classLevel)
    : []

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div className="w-72 flex flex-col border-r border-slate-200 bg-white flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <PageHeader title="Marking Assistant" subtitle="AI-assisted grading" className="mb-0" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Field label="Select Exam">
            <Select
              value={selectedExam?.id ?? ''}
              onChange={id => {
                const exam = exams.find(e => e.id === id) ?? null
                setSelectedExam(exam)
                setSelectedStudent(null)
                setCurrentQIdx(0)
                setMarkingState({})
              }}
              options={exams.map(e => ({ value: e.id, label: `${e.subject} - ${e.title}` }))}
              placeholder="Choose exam..."
            />
          </Field>

          {selectedExam && (
            <Field label="Select Student">
              <Select
                value={selectedStudent?.id ?? ''}
                onChange={id => {
                  const student = classStudents.find(s => s.id === id) ?? null
                  setSelectedStudent(student)
                  setCurrentQIdx(0)
                }}
                options={classStudents.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Choose student..."
              />
            </Field>
          )}

          <Field label="Strictness">
            <Select
              value={strictness}
              onChange={v => setStrictness(v as any)}
              options={[
                { value: 'lenient', label: 'Lenient (conceptual)' },
                { value: 'standard', label: 'Standard' },
                { value: 'strict', label: 'Strict (NECTA)' }
              ]}
            />
          </Field>

          {/* Progress */}
          {selectedExam && selectedStudent && (
            <div className="card p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500">Marking Progress</p>
                <p className="text-xs text-slate-400">{markedCount}/{questions.length}</p>
              </div>
              <ProgressBar value={markedCount} max={questions.length} color="primary" showLabel />
              <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                {questions.map((q, i) => {
                  const key = `${selectedStudent.id}-${q.id}`
                  const ms = markingState[key]
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQIdx(i)}
                      className={cn(
                        'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg text-left transition-colors',
                        i === currentQIdx ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <span className={cn(
                        'w-4 h-4 rounded-full text-xs flex items-center justify-center flex-shrink-0',
                        ms?.result ? 'bg-success text-white' : ms?.answer ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-500'
                      )}>
                        {i + 1}
                      </span>
                      <span className="truncate">Q{q.number}: {q.topic}</span>
                      {ms?.result && (
                        <span className="ml-auto flex-shrink-0 font-semibold">
                          {ms.overriddenScore ?? ms.result.suggestedScore}/{q.marks}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {selectedExam && selectedStudent && markedCount > 0 && (
            <button className="btn-primary w-full" onClick={handleSaveAll} disabled={savingAll}>
              <Save size={16} /> {savingAll ? 'Saving…' : 'Save All Scores'}
            </button>
          )}
        </div>
      </div>

      {/* Main marking area */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {!selectedExam || !selectedStudent ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={<CheckSquare size={24} />}
              title="Select exam and student"
              description="Choose an exam and a student from the left panel to begin marking"
            />
          </div>
        ) : !currentQ ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">No questions found in this exam</p>
          </div>
        ) : (
          <div className="p-6 max-w-3xl">
            {/* Question nav */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-lg font-semibold text-slate-700">
                  {selectedStudent.name}
                </h2>
                <span className="text-slate-400">—</span>
                <span className="text-sm text-slate-500">{selectedExam.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary btn-sm"
                  disabled={currentQIdx === 0}
                  onClick={() => setCurrentQIdx(i => i - 1)}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-sm text-slate-500">Q{currentQIdx + 1} of {questions.length}</span>
                <button
                  className="btn-secondary btn-sm"
                  disabled={currentQIdx === questions.length - 1}
                  onClick={() => setCurrentQIdx(i => i + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Question card */}
            <div className="card p-5 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">
                    {currentQ.number}
                  </span>
                  <Badge label={currentQ.topic} color="primary" />
                  <Badge label={currentQ.type.replace(/_/g, ' ')} color="slate" />
                  <Badge label={currentQ.difficulty} color={currentQ.difficulty === 'easy' ? 'green' : currentQ.difficulty === 'hard' ? 'red' : 'amber'} />
                </div>
                <Badge label={`${currentQ.marks} mark${currentQ.marks !== 1 ? 's' : ''}`} color="amber" />
              </div>

              <p className="text-slate-700 text-sm leading-relaxed mb-3">{currentQ.text}</p>

              {currentQ.type === 'multiple_choice' && currentQ.options && (
                <div className="space-y-1 mb-3">
                  {currentQ.options.map(opt => (
                    <div key={opt.label} className="flex gap-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-400">{opt.label}.</span> {opt.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Marking scheme hint */}
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                <strong>Expected:</strong> {currentQ.expectedAnswer}
              </div>
            </div>

            {/* Student answer */}
            <div className="card p-5 mb-4">
              <label className="label">Student's Answer</label>
              <textarea
                className="input resize-none"
                rows={5}
                placeholder="Type the student's answer here..."
                value={currentMark?.answer ?? ''}
                onChange={e => setAnswer(e.target.value)}
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="btn-primary"
                  onClick={handleMark}
                  disabled={marking || status.status !== 'ready' || !currentMark?.answer?.trim()}
                >
                  {marking ? <><Spinner size={14} className="text-white" /> Marking…</> : <><Wand2 size={14} /> Mark with AI</>}
                </button>
                <Select
                  value={strictness}
                  onChange={v => setStrictness(v as any)}
                  options={[
                    { value: 'lenient', label: 'Lenient' },
                    { value: 'standard', label: 'Standard' },
                    { value: 'strict', label: 'Strict' }
                  ]}
                  className="w-36 text-xs"
                />
              </div>
            </div>

            {/* AI marking result */}
            {marking && <AIGeneratingBanner feature="mark" />}

            {currentMark?.result && (
              <MarkingResult
                result={currentMark.result}
                maxMarks={currentQ.marks}
                overridden={currentMark.overriddenScore}
                onOverride={score => {
                  setMarkingState(s => ({
                    ...s,
                    [currentKey]: { ...s[currentKey], overriddenScore: score }
                  }))
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MarkingResult({
  result, maxMarks, overridden, onOverride
}: {
  result: MarkingResult
  maxMarks: number
  overridden: number | null
  onOverride: (score: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [scoreInput, setScoreInput] = useState(String(overridden ?? result.suggestedScore))
  const displayScore = overridden ?? result.suggestedScore
  const pct = Math.round((displayScore / maxMarks) * 100)
  const grade = scoreToGrade(pct)

  const confColor = { high: 'text-success', medium: 'text-amber-500', low: 'text-danger' }[result.confidence]

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Score card */}
      <div className={cn('card p-5 border-2', gradeBg(grade))}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">AI Suggested Score</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-bold">{displayScore}</span>
              <span className="text-lg opacity-60">/ {maxMarks}</span>
              <span className="text-xl font-bold">({grade})</span>
            </div>
            <p className={cn('text-xs mt-1 font-medium', confColor)}>
              Confidence: {result.confidence}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold opacity-70">{pct}%</p>
            {overridden !== null && (
              <Badge label="Overridden" color="amber" />
            )}
          </div>
        </div>

        {/* Override score */}
        <div className="flex items-center gap-2 mt-3">
          {editing ? (
            <>
              <input
                type="number" min={0} max={maxMarks}
                value={scoreInput}
                onChange={e => setScoreInput(e.target.value)}
                className="input w-24 text-sm"
              />
              <button className="btn-primary btn-sm" onClick={() => {
                onOverride(Math.min(maxMarks, Math.max(0, Number(scoreInput))))
                setEditing(false)
              }}>Set</button>
              <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn-secondary btn-sm" onClick={() => { setEditing(true); setScoreInput(String(displayScore)) }}>
              Override Score
            </button>
          )}
        </div>
      </div>

      {/* Points */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-semibold text-success uppercase tracking-wide mb-2">✓ Points Awarded</p>
          <ul className="space-y-1">
            {(result.pointsAwarded ?? []).map((p, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                <span className="text-success">✓</span> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-danger uppercase tracking-wide mb-2">✗ Points Missed</p>
          <ul className="space-y-1">
            {(result.pointsMissed ?? []).map((p, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                <span className="text-danger">✗</span> {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Feedback */}
      {result.feedbackForStudent && (
        <div className="card p-4 bg-blue-50 border-blue-100">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">💬 Feedback for Student</p>
          <p className="text-sm text-blue-800">{result.feedbackForStudent}</p>
        </div>
      )}

      {result.teacherNote && (
        <div className="card p-3 bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 mb-1">📝 Teacher Note</p>
          <p className="text-xs text-slate-600">{result.teacherNote}</p>
        </div>
      )}

      {/* Error types */}
      {result.errorTypes?.length > 0 && (
        <div className="card p-3">
          <p className="text-xs font-semibold text-slate-500 mb-2">Error Analysis</p>
          <div className="flex flex-wrap gap-2">
            {result.errorTypes.map((e, i) => (
              <div key={i} className="text-xs bg-red-50 text-red-600 border border-red-100 rounded px-2 py-1">
                <span className="font-medium capitalize">{e.type}:</span> {e.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
