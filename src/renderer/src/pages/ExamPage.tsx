// src/renderer/src/pages/ExamPage.tsx
import React, { useState, useEffect } from 'react'
import {
  FileText, Wand2, Save, FileDown, Upload, Plus, X, CheckSquare,
  AlignLeft, Circle, ToggleLeft, Layers
} from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useAIStore, useTeacherStore, useExamStore, useUIStore } from '../stores'
import {
  PageHeader, Field, Select, Tabs, EmptyState,
  Spinner, AIGeneratingBanner, Badge, Section
} from '../components/ui/Primitives'
import { cn, formatDate } from '../components/ui/utils'
import { SUBJECTS, CLASS_LEVELS, EXAM_TYPES } from '@shared/db-types'
import type { ExamPaper, Question } from '@shared/db-types'
import type { ExamParams } from '@shared/ai-types'

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'mixed', label: 'Mixed (recommended)' }
]

export function ExamPage() {
  const { status, isStreaming, currentFeature } = useAIStore()
  const { teacher } = useTeacherStore()
  const { exams, setExams, addExam, currentExam, setCurrentExam } = useExamStore()
  const { addToast } = useUIStore()

  // Only show streaming if this is an exam generation
  const isGeneratingExam = isStreaming && currentFeature === 'exam'

  const [activeTab, setActiveTab] = useState<'generate' | 'preview' | 'history'>('generate')
  const [previewMode, setPreviewMode] = useState<'exam' | 'scheme'>('exam')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [topicInput, setTopicInput] = useState('')

  const [params, setParams] = useState<ExamParams>({
    subject: teacher?.subjects?.[0] ?? '',
    topics: [],
    classLevel: teacher?.classLevels?.[0] ?? 'Form 3',
    examType: 'cat',
    questionTypes: {
      multipleChoice: 10,
      shortAnswer: 5,
      structuredEssay: 2
    },
    totalMarks: 50,
    durationMins: 90,
    difficulty: 'mixed',
    language: teacher?.languagePref ?? 'en',
    nectaStyle: false
  })

  useEffect(() => {
    ipc('db:get-exams').then(es => setExams(es ?? []))
  }, [])

  function addTopic() {
    if (!topicInput.trim()) return
    setParams(p => ({ ...p, topics: [...p.topics, topicInput.trim()] }))
    setTopicInput('')
  }

  function removeTopic(i: number) {
    setParams(p => ({ ...p, topics: p.topics.filter((_, j) => j !== i) }))
  }

  function updateQType(key: keyof ExamParams['questionTypes'], val: number) {
    setParams(p => ({
      ...p,
      questionTypes: { ...p.questionTypes, [key]: Math.max(0, val) }
    }))
  }

  const canGenerate = params.subject && params.topics.length > 0 && status.status === 'ready'

  async function handleGenerate() {
    if (!canGenerate) return
    setCurrentExam(null)
    try {
      const paper = await ipc('ai:generate-exam', params)
      setCurrentExam({ ...paper, teacherId: teacher?.id ?? '', isStarred: false, createdAt: Date.now(), updatedAt: Date.now() } as any)
      setActiveTab('preview')
      addToast({ type: 'success', title: 'Exam ready!', message: `${paper.totalMarks} marks · ${paper.sections.length} sections` })
    } catch (err) {
      addToast({ type: 'error', title: 'Generation failed', message: String(err) })
    }
  }

  async function handleSave() {
    if (!currentExam) return
    setSaving(true)
    try {
      const saved = await ipc('db:save-exam', currentExam)
      addExam(saved)
      addToast({ type: 'success', title: 'Exam saved!' })
    } catch (err) {
      addToast({ type: 'error', title: 'Save failed', message: String(err) })
    } finally {
      setSaving(false)
    }
  }

  async function handleExport(format: 'pdf' | 'docx', includeScheme = false) {
    if (!currentExam) return
    setExporting(true)
    try {
      const payload = {
        type: includeScheme ? 'marking_scheme' as const : 'exam' as const,
        title: currentExam.title,
        content: currentExam,
        template: 'plain' as const,
        includeMarkingScheme: includeScheme,
        schoolName: teacher?.schoolName,
        teacherName: teacher?.name
      }
      const path = format === 'pdf' ? await ipc('file:export-pdf', payload) : await ipc('file:export-docx', payload)
      addToast({ type: 'success', title: 'Exported successfully' })
      ipc('file:open-path', path)
    } catch (err) {
      addToast({ type: 'error', title: 'Export failed', message: String(err) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex flex-col border-r border-slate-200 bg-white overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <PageHeader title="Exam Generator" subtitle="NECTA-style exam papers" className="mb-0" />
        </div>

        <Tabs
          tabs={[
            { id: 'generate', label: 'Configure' },
            { id: 'history', label: `History (${exams.length})` }
          ]}
          activeTab={activeTab === 'preview' ? 'generate' : activeTab}
          onTabChange={t => setActiveTab(t as any)}
        />

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab !== 'history' ? (
            <>
              <Field label="Subject" required>
                <Select value={params.subject} onChange={v => setParams(p => ({ ...p, subject: v }))}
                  options={SUBJECTS.map(s => ({ value: s, label: s }))} placeholder="Select subject" />
              </Field>

              <Field label="Class Level">
                <Select value={params.classLevel} onChange={v => setParams(p => ({ ...p, classLevel: v }))}
                  options={CLASS_LEVELS.map(cl => ({ value: cl, label: cl }))} />
              </Field>

              <Field label="Exam Type">
                <Select value={params.examType} onChange={v => setParams(p => ({ ...p, examType: v as any }))}
                  options={EXAM_TYPES} />
              </Field>

              <Field label="Topics to Cover" required>
                <div className="flex gap-1.5">
                  <input
                    className="input flex-1 text-xs"
                    placeholder="Add a topic..."
                    value={topicInput}
                    onChange={e => setTopicInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTopic()}
                  />
                  <button className="btn-secondary btn-sm px-2" onClick={addTopic}><Plus size={14} /></button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {params.topics.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-primary-50 text-primary text-xs px-2 py-0.5 rounded-full">
                      {t}
                      <button onClick={() => removeTopic(i)}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </Field>

              {/* Question Types */}
              <div>
                <label className="label">Question Breakdown</label>
                <div className="space-y-1.5">
                  {([
                    { key: 'multipleChoice', label: 'Multiple Choice', icon: <Circle size={12} /> },
                    { key: 'shortAnswer', label: 'Short Answer', icon: <AlignLeft size={12} /> },
                    { key: 'structuredEssay', label: 'Structured Essay', icon: <Layers size={12} /> },
                    { key: 'trueOrFalse', label: 'True or False', icon: <ToggleLeft size={12} /> },
                    { key: 'fillInTheBlank', label: 'Fill in the Blank', icon: <CheckSquare size={12} /> },
                  ] as { key: keyof ExamParams['questionTypes']; label: string; icon: React.ReactNode }[]).map(qt => (
                    <div key={qt.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-slate-600 flex-1 min-w-0">
                        <span className="text-slate-400">{qt.icon}</span>
                        <span className="truncate">{qt.label}</span>
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button className="w-5 h-5 rounded border text-slate-500 hover:bg-slate-100 text-xs flex items-center justify-center"
                          onClick={() => updateQType(qt.key, (params.questionTypes[qt.key] ?? 0) - 1)}>−</button>
                        <input
                          type="number" min={0} max={30}
                          value={params.questionTypes[qt.key] ?? 0}
                          onChange={e => updateQType(qt.key, Number(e.target.value))}
                          className="w-8 text-center text-xs border border-slate-200 rounded py-0.5"
                        />
                        <button className="w-5 h-5 rounded border text-slate-500 hover:bg-slate-100 text-xs flex items-center justify-center"
                          onClick={() => updateQType(qt.key, (params.questionTypes[qt.key] ?? 0) + 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Total Marks">
                  <input type="number" className="input" value={params.totalMarks}
                    onChange={e => setParams(p => ({ ...p, totalMarks: Number(e.target.value) }))} />
                </Field>
                <Field label="Duration (min)">
                  <input type="number" className="input" value={params.durationMins}
                    onChange={e => setParams(p => ({ ...p, durationMins: Number(e.target.value) }))} />
                </Field>
              </div>

              <Field label="Difficulty">
                <Select value={params.difficulty} onChange={v => setParams(p => ({ ...p, difficulty: v as any }))}
                  options={DIFFICULTY_OPTIONS} />
              </Field>

              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <input type="checkbox" id="necta" className="accent-primary"
                  checked={params.nectaStyle}
                  onChange={e => setParams(p => ({ ...p, nectaStyle: e.target.checked }))} />
                <label htmlFor="necta" className="text-sm text-slate-600 cursor-pointer">
                  NECTA format (paper codes, structured sections)
                </label>
              </div>

              <button className="btn-primary w-full" onClick={handleGenerate} disabled={!canGenerate || isGeneratingExam}>
                {isGeneratingExam ? <><Spinner size={16} className="text-white" /> Generating…</> : <><Wand2 size={16} /> Generate Exam</>}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {exams.length === 0 ? (
                <EmptyState icon={<FileText size={20} />} title="No exams yet" />
              ) : exams.map(e => (
                <div key={e.id} className="card p-3 cursor-pointer hover:border-primary/30"
                  onClick={() => { setCurrentExam(e); setActiveTab('preview') }}>
                  <p className="text-sm font-medium text-slate-700 truncate">{e.title}</p>
                  <p className="text-xs text-slate-400">{e.subject} · {e.classLevel} · {e.totalMarks} marks</p>
                  <p className="text-xs text-slate-300 mt-0.5">{formatDate(e.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {isGeneratingExam ? (
          <div className="p-6"><AIGeneratingBanner feature="exam paper" /></div>
        ) : currentExam ? (
          <ExamPreview
            exam={currentExam}
            mode={previewMode}
            onModeChange={setPreviewMode}
            onSave={handleSave}
            onExport={handleExport}
            saving={saving}
            exporting={exporting}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-center p-8">
            <div>
              <div className="w-20 h-20 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <FileText size={32} className="text-amber-300" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-slate-600 mb-2">Ready to create</h3>
              <p className="text-sm text-slate-400 max-w-xs">
                Configure your exam on the left and click <strong>Generate Exam</strong>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ExamPreview({
  exam, mode, onModeChange, onSave, onExport, saving, exporting
}: {
  exam: any
  mode: 'exam' | 'scheme'
  onModeChange: (m: 'exam' | 'scheme') => void
  onSave: () => void
  onExport: (format: 'pdf' | 'docx', scheme?: boolean) => void
  saving: boolean
  exporting: boolean
}) {
  const allQuestions: Question[] = (exam.sections ?? []).flatMap((s: any) => s.questions ?? [])

  return (
    <div className="p-6 max-w-4xl">
      {/* Toolbar */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-heading text-xl font-semibold text-primary">{exam.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge label={exam.subject} color="primary" />
            <Badge label={exam.classLevel} color="blue" />
            <Badge label={`${exam.totalMarks} marks`} color="amber" />
            <Badge label={`${exam.duration} min`} color="slate" />
            {exam.nectaStyle && <Badge label="NECTA Format" color="green" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button className={cn('px-3 py-1.5 text-xs font-medium', mode === 'exam' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50')}
              onClick={() => onModeChange('exam')}>Exam Paper</button>
            <button className={cn('px-3 py-1.5 text-xs font-medium', mode === 'scheme' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50')}
              onClick={() => onModeChange('scheme')}>Marking Scheme</button>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => onExport('pdf', mode === 'scheme')}>
            <FileDown size={14} /> PDF
          </button>
          <button className="btn-primary btn-sm" onClick={onSave} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-slate-700">{allQuestions.length}</p>
          <p className="text-xs text-slate-400">Questions</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-slate-700">{exam.sections?.length ?? 0}</p>
          <p className="text-xs text-slate-400">Sections</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-slate-700">
            {allQuestions.filter((q: Question) => q.difficulty === 'easy').length}
          </p>
          <p className="text-xs text-slate-400">Easy</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-slate-700">
            {allQuestions.filter((q: Question) => q.difficulty === 'hard').length}
          </p>
          <p className="text-xs text-slate-400">Hard</p>
        </div>
      </div>

      {/* Instructions */}
      {mode === 'exam' && exam.instructions?.length > 0 && (
        <div className="card p-4 mb-4 bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Instructions to Candidates</p>
          <ol className="list-decimal list-inside space-y-1">
            {exam.instructions.map((inst: string, i: number) => (
              <li key={i} className="text-sm text-slate-600">{inst}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Sections */}
      {(exam.sections ?? []).map((section: any, si: number) => (
        <div key={si} className="card mb-4 overflow-hidden">
          <div className="flex items-center justify-between p-4 bg-primary-50 border-b border-primary-100">
            <div>
              <h3 className="font-semibold text-primary">{section.name}</h3>
              <p className="text-xs text-primary/70">{section.instructions}</p>
            </div>
            <Badge label={`${section.marks} marks`} color="primary" />
          </div>
          <div className="divide-y divide-slate-50">
            {(section.questions ?? []).map((q: Question, qi: number) => (
              <QuestionItem key={qi} q={q} showAnswer={mode === 'scheme'} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function QuestionItem({ q, showAnswer }: { q: Question; showAnswer: boolean }) {
  const diffColor = { easy: 'text-green-500', medium: 'text-amber-500', hard: 'text-red-500' }[q.difficulty] ?? 'text-slate-400'
  const bloomsColors: Record<string, string> = {
    remember: 'bg-slate-100', understand: 'bg-blue-50', apply: 'bg-green-50',
    analyse: 'bg-amber-50', evaluate: 'bg-orange-50', create: 'bg-red-50'
  }

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
          {q.number}
        </span>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-slate-700 leading-relaxed">{q.text}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={cn('text-xs font-medium', diffColor)}>
                {q.difficulty}
              </span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded', bloomsColors[q.bloomsLevel ?? 'remember'])}>
                {q.bloomsLevel}
              </span>
              <span className="text-xs font-semibold text-slate-500">({q.marks})</span>
            </div>
          </div>

          {q.type === 'multiple_choice' && q.options && (
            <div className="mt-2 space-y-1">
              {q.options.map(opt => (
                <div key={opt.label} className={cn(
                  'flex gap-2 text-sm px-2 py-1 rounded text-slate-600',
                  showAnswer && opt.label === q.expectedAnswer ? 'bg-green-100 text-green-700 font-medium' : ''
                )}>
                  <span className="font-medium">{opt.label}.</span> {opt.text}
                </div>
              ))}
            </div>
          )}

          {showAnswer && (
            <div className="mt-2 p-3 bg-green-50 border border-green-100 rounded-lg">
              <p className="text-xs font-semibold text-green-700 mb-1">Model Answer</p>
              <p className="text-sm text-green-800">{q.expectedAnswer}</p>
              <p className="text-xs text-green-600 mt-1">{q.markingGuide}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
