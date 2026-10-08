// src/renderer/src/pages/LessonPage.tsx
import React, { useState, useEffect } from 'react'
import {
  BookOpen, Wand2, Save, FileDown, Star, Trash2,
  ChevronRight, Clock, Target, List, Search, Filter
} from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useAIStore, useTeacherStore, useLessonStore, useUIStore } from '../stores'
import {
  PageHeader, Field, Select, EmptyState, Spinner,
  AIGeneratingBanner, StreamingText, Tabs, Badge
} from '../components/ui/Primitives'
import { cn, formatDate, truncate } from '../components/ui/utils'
import { SUBJECTS, CLASS_LEVELS } from '@shared/db-types'
import type { LessonPlan, Lesson } from '@shared/db-types'
import type { LessonParams } from '@shared/ai-types'

const DURATION_OPTIONS = [40, 45, 60, 80, 90].map(n => ({ value: String(n), label: `${n} minutes` }))
const STYLE_OPTIONS = [
  { value: 'discussion', label: 'Discussion-based' },
  { value: 'demonstration', label: 'Demonstration' },
  { value: 'discovery', label: 'Discovery / Inquiry' },
  { value: 'lecture', label: 'Direct Instruction' }
]

export function LessonPage() {
  const { status, isStreaming, streamingText, currentFeature } = useAIStore()
  const { teacher } = useTeacherStore()
  const { lessons, setLessons, addLesson, removeLesson } = useLessonStore()
  const { addToast } = useUIStore()

  // Only show streaming if this is a lesson generation
  const isGeneratingLesson = isStreaming && currentFeature === 'lesson'

  const [activeTab, setActiveTab] = useState<'generate' | 'preview' | 'history'>('generate')
  const [currentPlan, setCurrentPlan] = useState<LessonPlan | null>(null)
  const [savedLesson, setSavedLesson] = useState<Lesson | null>(null)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterSubject, setFilterSubject] = useState('')

  // Form state
  const [params, setParams] = useState<LessonParams>({
    subject: teacher?.subjects?.[0] ?? '',
    topic: '',
    subtopic: '',
    classLevel: teacher?.classLevels?.[0] ?? 'Form 3',
    durationMins: 80,
    language: teacher?.languagePref ?? 'en',
    teachingStyle: 'discussion',
    availableResources: [],
    priorKnowledge: ''
  })

  useEffect(() => {
    ipc('db:get-lessons').then(ls => setLessons(ls ?? []))
  }, [])

  const canGenerate = params.subject && params.topic.trim() && status.status === 'ready'

  async function handleGenerate() {
    if (!canGenerate) return
    setCurrentPlan(null)
    setSavedLesson(null)

    try {
      const plan = await ipc('ai:generate-lesson', params)
      setCurrentPlan(plan)
      setActiveTab('preview')
      addToast({ type: 'success', title: 'Lesson plan ready', message: `${plan.topic}, ${plan.classLevel}` })
    } catch (err) {
      addToast({ type: 'error', title: 'Generation failed', message: String(err) })
    }
  }

  async function handleSave() {
    if (!currentPlan) return
    setSaving(true)
    try {
      const lesson = await ipc('db:save-lesson', { plan: currentPlan, params })
      addLesson(lesson)
      setSavedLesson(lesson)
      addToast({ type: 'success', title: 'Lesson saved!' })
    } catch (err) {
      addToast({ type: 'error', title: 'Save failed', message: String(err) })
    } finally {
      setSaving(false)
    }
  }

  async function handleExport(format: 'pdf' | 'docx') {
    if (!currentPlan) return
    setExporting(true)
    try {
      const path = format === 'pdf'
        ? await ipc('file:export-pdf', {
            type: 'lesson', title: `${currentPlan.subject} - ${currentPlan.topic}`,
            content: currentPlan, template: 'plain',
            schoolName: teacher?.schoolName, teacherName: teacher?.name
          })
        : await ipc('file:export-docx', {
            type: 'lesson', title: `${currentPlan.subject} - ${currentPlan.topic}`,
            content: currentPlan, template: 'plain',
            schoolName: teacher?.schoolName, teacherName: teacher?.name
          })
      addToast({ type: 'success', title: 'Exported!', message: path })
      ipc('file:open-path', path)
    } catch (err) {
      addToast({ type: 'error', title: 'Export failed', message: String(err) })
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete(id: string) {
    await ipc('db:delete-lesson', id)
    removeLesson(id)
    addToast({ type: 'info', title: 'Lesson deleted' })
  }

  const filteredLessons = lessons.filter(l => {
    const matchSearch = !search || l.topic.toLowerCase().includes(search.toLowerCase()) || l.subject.toLowerCase().includes(search.toLowerCase())
    const matchSubject = !filterSubject || l.subject === filterSubject
    return matchSearch && matchSubject
  })

  return (
    <div className="operator-workflow-page operator-lesson-page flex h-screen overflow-hidden">
      {/* Left: Form + History */}
      <div className="w-80 flex flex-col border-r border-slate-200 bg-white overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <PageHeader title="Lesson Planner" subtitle="NECTA-aligned lesson plans" className="mb-0" />
        </div>

        <Tabs
          tabs={[
            { id: 'generate', label: 'Generate' },
            { id: 'history', label: `History (${lessons.length})` }
          ]}
          activeTab={activeTab === 'preview' ? 'generate' : activeTab}
          onTabChange={t => setActiveTab(t as any)}
        />

        <div className="flex-1 overflow-y-auto">
          {activeTab !== 'history' ? (
            /* Generate Form */
            <div className="p-4 space-y-3">
              <Field label="Subject" required>
                <Select
                  value={params.subject}
                  onChange={v => setParams(p => ({ ...p, subject: v }))}
                  options={SUBJECTS.map(s => ({ value: s, label: s }))}
                  placeholder="Select subject"
                />
              </Field>

              <Field label="Class Level" required>
                <Select
                  value={params.classLevel}
                  onChange={v => setParams(p => ({ ...p, classLevel: v }))}
                  options={CLASS_LEVELS.map(cl => ({ value: cl, label: cl }))}
                />
              </Field>

              <Field label="Topic" required>
                <input
                  className="input"
                  placeholder="e.g. Photosynthesis"
                  value={params.topic}
                  onChange={e => setParams(p => ({ ...p, topic: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                />
              </Field>

              <Field label="Subtopic (optional)">
                <input
                  className="input"
                  placeholder="e.g. Light-dependent reactions"
                  value={params.subtopic ?? ''}
                  onChange={e => setParams(p => ({ ...p, subtopic: e.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Duration">
                  <Select
                    value={String(params.durationMins)}
                    onChange={v => setParams(p => ({ ...p, durationMins: Number(v) }))}
                    options={DURATION_OPTIONS}
                  />
                </Field>
                <Field label="Language">
                  <Select
                    value={params.language}
                    onChange={v => setParams(p => ({ ...p, language: v as any }))}
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'sw', label: 'Kiswahili' },
                      { value: 'bilingual', label: 'Bilingual' }
                    ]}
                  />
                </Field>
              </div>

              <Field label="Teaching Style">
                <Select
                  value={params.teachingStyle ?? 'discussion'}
                  onChange={v => setParams(p => ({ ...p, teachingStyle: v as any }))}
                  options={STYLE_OPTIONS}
                />
              </Field>

              <Field label="Prior Knowledge" hint="What students already know">
                <textarea
                  className="input resize-none"
                  rows={2}
                  placeholder="e.g. Students know the cell structure"
                  value={params.priorKnowledge ?? ''}
                  onChange={e => setParams(p => ({ ...p, priorKnowledge: e.target.value }))}
                />
              </Field>

              <button
                className="btn-primary w-full mt-2"
                onClick={handleGenerate}
                disabled={!canGenerate || isGeneratingLesson}
              >
                {isGeneratingLesson ? (
                  <><Spinner size={16} className="text-white" /> Generating…</>
                ) : (
                  <><Wand2 size={16} /> Generate Lesson Plan</>
                )}
              </button>

              {status.status !== 'ready' && !isGeneratingLesson && (
                <p className="text-xs text-slate-400 text-center">
                  {status.status === 'loading' ? 'AI model loading…' : 'AI unavailable'}
                </p>
              )}
            </div>
          ) : (
            /* History */
            <div className="p-3 space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-8 text-xs"
                  placeholder="Search lessons…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={filterSubject}
                onChange={setFilterSubject}
                options={SUBJECTS.map(s => ({ value: s, label: s }))}
                placeholder="All subjects"
                className="text-xs"
              />

              {filteredLessons.length === 0 ? (
                <EmptyState icon={<BookOpen size={20} />} title="No lessons yet" />
              ) : filteredLessons.map(l => (
                <div key={l.id} className="card p-3 group">
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                      setCurrentPlan(l.content)
                      setActiveTab('preview')
                    }}>
                      <p className="text-sm font-medium text-slate-700 truncate">{l.topic}</p>
                      <p className="text-xs text-slate-400">{l.subject} · {l.classLevel}</p>
                      <p className="text-xs text-slate-300 mt-0.5">{formatDate(l.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => ipc('db:star-lesson', l.id, !l.isStarred)} className="p-1 hover:text-accent">
                        <Star size={12} className={l.isStarred ? 'text-accent fill-accent' : 'text-slate-300'} />
                      </button>
                      <button onClick={() => handleDelete(l.id)} className="p-1 hover:text-danger">
                        <Trash2 size={12} className="text-slate-300 hover:text-danger" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {isGeneratingLesson ? (
          <div className="p-6 space-y-4">
            <AIGeneratingBanner feature="lesson plan" />
            <StreamingText text={streamingText} />
          </div>
        ) : currentPlan ? (
          <LessonPreview
            plan={currentPlan}
            onSave={handleSave}
            onExportPDF={() => handleExport('pdf')}
            onExportDOCX={() => handleExport('docx')}
            saving={saving}
            exporting={exporting}
            saved={!!savedLesson}
          />
        ) : (
          <EmptyPreview />
        )}
      </div>
    </div>
  )
}

function EmptyPreview() {
  return (
    <div className="flex items-center justify-center h-full text-center p-8">
      <div>
        <div className="w-20 h-20 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} className="text-primary-300" />
        </div>
        <h3 className="font-heading text-lg font-semibold text-slate-600 mb-2">Ready to plan</h3>
        <p className="text-sm text-slate-400 max-w-xs">
          Fill in the form and click <strong>Generate Lesson Plan</strong>. Your full lesson will appear here.
        </p>
      </div>
    </div>
  )
}

function LessonPreview({
  plan, onSave, onExportPDF, onExportDOCX, saving, exporting, saved
}: {
  plan: LessonPlan
  onSave: () => void
  onExportPDF: () => void
  onExportDOCX: () => void
  saving: boolean
  exporting: boolean
  saved: boolean
}) {
  const [viewTab, setViewTab] = useState('overview')

  const totalTime = (plan.timePlan ?? []).reduce((sum, t) => sum + t.duration, 0)

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-primary">{plan.topic}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge label={plan.subject} color="primary" />
            <Badge label={plan.classLevel} color="blue" />
            <Badge label={`${plan.durationMins} min`} color="slate" />
            <Badge label={plan.language === 'en' ? 'English' : plan.language === 'sw' ? 'Kiswahili' : 'Bilingual'} color="slate" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExportPDF} disabled={exporting} className="btn-secondary btn-sm">
            <FileDown size={14} /> PDF
          </button>
          <button onClick={onExportDOCX} disabled={exporting} className="btn-secondary btn-sm">
            <FileDown size={14} /> Word
          </button>
          <button onClick={onSave} disabled={saving || saved} className="btn-primary btn-sm">
            {saved ? <><Star size={14} fill="currentColor" /> Saved</> : saving ? 'Saving…' : <><Save size={14} /> Save</>}
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview', icon: <Target size={13} /> },
          { id: 'timeplan', label: 'Time Plan', icon: <Clock size={13} /> },
          { id: 'content', label: 'Content' },
          { id: 'assessment', label: 'Assessment' },
        ]}
        activeTab={viewTab}
        onTabChange={setViewTab}
      />

      {viewTab === 'overview' && (
        <div className="space-y-4">
          {/* Objectives */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><Target size={15} className="text-primary" /> Learning Objectives</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-medium text-primary text-xs uppercase tracking-wide mb-2">Knowledge</p>
                <ul className="space-y-1">
                  {(plan.objectives?.knowledge ?? []).map((o, i) => (
                    <li key={i} className="text-slate-600 flex gap-1.5"><span className="text-primary mt-1">•</span>{o}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-green-600 text-xs uppercase tracking-wide mb-2">Skills</p>
                <ul className="space-y-1">
                  {(plan.objectives?.skills ?? []).map((o, i) => (
                    <li key={i} className="text-slate-600 flex gap-1.5"><span className="text-green-500 mt-1">•</span>{o}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-purple-600 text-xs uppercase tracking-wide mb-2">Attitudes</p>
                <ul className="space-y-1">
                  {(plan.objectives?.attitudes ?? []).map((o, i) => (
                    <li key={i} className="text-slate-600 flex gap-1.5"><span className="text-purple-400 mt-1">•</span>{o}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Local Context */}
          {plan.content?.localContext && (
            <div className="card p-4 bg-amber-50 border-amber-100">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">🇹🇿 Tanzanian Context</p>
              <p className="text-sm text-amber-800">{plan.content.localContext}</p>
            </div>
          )}

          {/* Materials + Homework */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Materials Needed</p>
              <ul className="space-y-1">
                {(plan.materials ?? []).map((m, i) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-1.5">
                    <span className="text-slate-300">·</span> {m}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Homework</p>
              <p className="text-sm text-slate-600">{plan.homework?.task}</p>
              {plan.homework?.objectives && (
                <p className="text-xs text-slate-400 mt-1">Objective: {plan.homework.objectives}</p>
              )}
            </div>
          </div>

          {/* References */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">References</p>
            <p className="text-sm text-slate-700">{plan.references?.textbook}</p>
            {(plan.references?.additional ?? []).map((r, i) => (
              <p key={i} className="text-xs text-slate-400">{r}</p>
            ))}
          </div>
        </div>
      )}

      {viewTab === 'timeplan' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700">Time Allocation</h3>
            <Badge label={`Total: ${totalTime} min`} color={totalTime === plan.durationMins ? 'green' : 'amber'} />
          </div>
          <div className="divide-y divide-slate-100">
            {(plan.timePlan ?? []).map((tp, i) => (
              <div key={i} className={cn('p-4 grid grid-cols-12 gap-3 text-sm',
                tp.phase === 'Introduction' ? 'bg-blue-50/30' :
                tp.phase === 'Development' ? 'bg-white' : 'bg-green-50/30'
              )}>
                <div className="col-span-2">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                    tp.phase === 'Introduction' ? 'bg-blue-100 text-blue-700' :
                    tp.phase === 'Development' ? 'bg-primary-100 text-primary' : 'bg-green-100 text-green-700'
                  )}>{tp.phase}</span>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Clock size={10} />{tp.duration} min</p>
                </div>
                <div className="col-span-5">
                  <p className="text-xs font-medium text-slate-500 mb-0.5">Teacher</p>
                  <p className="text-slate-700">{tp.teacherActivity}</p>
                </div>
                <div className="col-span-5">
                  <p className="text-xs font-medium text-slate-500 mb-0.5">Students</p>
                  <p className="text-slate-700">{tp.studentActivity}</p>
                  {tp.resources?.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">Resources: {tp.resources.join(', ')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewTab === 'content' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3">Main Teaching Points</h3>
            <ol className="space-y-2">
              {(plan.content?.mainPoints ?? []).map((p, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                  <span className="text-slate-700">{p}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Examples</p>
              <ul className="space-y-1">
                {(plan.content?.examples ?? []).map((e, i) => (
                  <li key={i} className="text-sm text-slate-600">• {e}</li>
                ))}
              </ul>
            </div>
            <div className="card p-4 border-orange-100 bg-orange-50/30">
              <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">⚠ Common Misconceptions</p>
              <ul className="space-y-1">
                {(plan.content?.commonMisconceptions ?? []).map((m, i) => (
                  <li key={i} className="text-sm text-orange-700">• {m}</li>
                ))}
              </ul>
            </div>
          </div>

          {plan.teachingNotes && (
            <div className="card p-4 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Teacher Notes</p>
              <p className="text-sm text-slate-600">{plan.teachingNotes}</p>
            </div>
          )}
        </div>
      )}

      {viewTab === 'assessment' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3">Formative Assessment (During Lesson)</h3>
            <ul className="space-y-2">
              {(plan.assessment?.formative ?? []).map((a, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600">
                  <ChevronRight size={16} className="text-primary flex-shrink-0 mt-0.5" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-2">Summative Assessment (End of Lesson)</h3>
            <p className="text-sm text-slate-600">{plan.assessment?.summative}</p>
          </div>
        </div>
      )}
    </div>
  )
}
