// src/renderer/src/pages/AnalyticsPage.tsx
import React, { useState } from 'react'
import {
  BarChart3, TrendingDown, TrendingUp, AlertTriangle,
  Wand2, Users, BookOpen, Lightbulb, Target
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell, ReferenceLine
} from 'recharts'
import { ipc } from '../hooks/useIPC'
import { useAIStore, useTeacherStore, useUIStore } from '../stores'
import {
  PageHeader, Field, Select, EmptyState, Spinner,
  StatCard, ProgressBar, Badge, AIGeneratingBanner
} from '../components/ui/Primitives'
import { cn } from '../components/ui/utils'
import { CLASS_LEVELS, SUBJECTS } from '@shared/db-types'
import type { WeaknessReport, TopicPerformance } from '@shared/db-types'

export function AnalyticsPage() {
  const { status } = useAIStore()
  const { teacher } = useTeacherStore()
  const { addToast } = useUIStore()

  const [classLevel, setClassLevel] = useState(teacher?.classLevels?.[0] ?? 'Form 3')
  const [subject, setSubject] = useState(teacher?.subjects?.[0] ?? '')
  const [report, setReport] = useState<WeaknessReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [analyzingAI, setAnalyzingAI] = useState(false)

  async function handleAnalyze() {
    if (!classLevel) return
    setLoading(true)
    setReport(null)
    try {
      const data = await ipc('db:get-weakness-data', classLevel, subject || undefined)
      if (!data) {
        addToast({ type: 'info', title: 'No data yet', message: 'Mark some exams first to see class analytics.' })
        return
      }
      setReport(data)
    } catch (err) {
      addToast({ type: 'error', title: 'Analysis failed', message: String(err) })
    } finally {
      setLoading(false)
    }
  }

  async function handleAIInsights() {
    if (!classLevel) return
    setAnalyzingAI(true)
    try {
      const data = await ipc('ai:analyze-weakness', teacher?.id ?? '', classLevel, subject)
      if (data) setReport(data)
      addToast({ type: 'success', title: 'AI insights generated!' })
    } catch (err) {
      addToast({ type: 'error', title: 'AI analysis failed', message: String(err) })
    } finally {
      setAnalyzingAI(false)
    }
  }

  // Chart data
  const weakTopicData = (report?.weakestTopics ?? []).map(t => ({
    topic: t.topic.length > 20 ? t.topic.slice(0, 20) + '…' : t.topic,
    score: t.avgScore,
    fullTopic: t.topic
  }))

  const strongTopicData = (report?.strongestTopics ?? []).map(t => ({
    topic: t.topic.length > 20 ? t.topic.slice(0, 20) + '…' : t.topic,
    score: t.avgScore,
    fullTopic: t.topic
  }))

  const readinessColor = !report ? 'primary'
    : report.examReadinessScore >= 60 ? 'success'
    : report.examReadinessScore >= 40 ? 'accent'
    : 'danger'

  return (
    <div className="operator-standard-page p-6 max-w-5xl">
      <PageHeader
        title="Class Insights"
        subtitle="Performance analytics and NECTA readiness tracking"
        actions={
          report ? (
            <button
              className="btn-primary"
              onClick={handleAIInsights}
              disabled={analyzingAI || status.status !== 'ready'}
            >
              {analyzingAI
                ? <><Spinner size={14} className="text-white" /> Analyzing…</>
                : <><Wand2 size={14} /> AI Deep Analysis</>
              }
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex items-end gap-3 mb-6">
        <div className="w-40">
          <Field label="Class Level">
            <Select value={classLevel} onChange={setClassLevel}
              options={CLASS_LEVELS.map(cl => ({ value: cl, label: cl }))} />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Subject">
            <Select value={subject} onChange={setSubject}
              options={[{ value: '', label: 'All Subjects' }, ...SUBJECTS.map(s => ({ value: s, label: s }))]} />
          </Field>
        </div>
        <button className="btn-primary" onClick={handleAnalyze} disabled={loading}>
          {loading ? <><Spinner size={14} className="text-white" /> Loading…</> : <><BarChart3 size={14} /> Analyze</>}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Spinner size={32} className="mx-auto mb-3" />
            <p className="text-sm text-slate-400">Analyzing class performance…</p>
          </div>
        </div>
      )}

      {/* No data */}
      {!loading && !report && (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="No performance data yet"
          description="Mark some exam scripts first. Once you have scores saved, class analytics will appear here."
          action={
            <button className="btn-primary" onClick={handleAnalyze}>
              <BarChart3 size={14} /> Check Now
            </button>
          }
        />
      )}

      {analyzingAI && (
        <div className="mb-4">
          <AIGeneratingBanner feature="class insights" />
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Class Average"
              value={`${report.classAverage}%`}
              sub={subject || 'All subjects'}
              icon={<BarChart3 size={16} />}
              color={report.classAverage >= 60 ? 'success' : report.classAverage >= 45 ? 'accent' : 'danger'}
            />
            <StatCard
              label="NECTA Readiness"
              value={`${report.examReadinessScore}%`}
              sub="estimated"
              icon={<Target size={16} />}
              color={readinessColor as any}
            />
            <StatCard
              label="Students At Risk"
              value={report.studentsAtRisk.length}
              sub="below 45%"
              icon={<AlertTriangle size={16} />}
              color={report.studentsAtRisk.length > 5 ? 'danger' : 'accent'}
            />
            <StatCard
              label="Weak Topics"
              value={report.weakestTopics.length}
              sub="need focus"
              icon={<TrendingDown size={16} />}
              color={report.weakestTopics.length > 3 ? 'danger' : 'accent'}
            />
          </div>

          {/* NECTA Readiness bar */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Target size={16} className="text-primary" /> NECTA Readiness Score
              </h3>
              <span className={cn(
                'text-2xl font-bold',
                report.examReadinessScore >= 60 ? 'text-success' :
                report.examReadinessScore >= 40 ? 'text-amber-500' : 'text-danger'
              )}>
                {report.examReadinessScore}%
              </span>
            </div>
            <ProgressBar
              value={report.examReadinessScore}
              max={100}
              color={report.examReadinessScore >= 60 ? 'success' : report.examReadinessScore >= 40 ? 'accent' : 'danger'}
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Not Ready</span>
              <span>45% Pass Mark</span>
              <span>Distinction (80%+)</span>
            </div>
          </div>

          {/* Weak/Strong topic charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Weakest Topics */}
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <TrendingDown size={15} className="text-danger" /> Weakest Topics
              </h3>
              {weakTopicData.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No weak topics identified</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weakTopicData} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="topic" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val}%`, 'Avg Score']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTopic ?? ''}
                    />
                    <ReferenceLine x={45} stroke="var(--color-warning)" strokeDasharray="4 4" label={{ value: 'Pass', fontSize: 9, fill: 'var(--color-warning)' }} />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                      {weakTopicData.map((entry, i) => (
                        <Cell key={i} fill={entry.score < 30 ? 'var(--color-error)' : 'var(--color-warning)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Strongest Topics */}
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <TrendingUp size={15} className="text-success" /> Strongest Topics
              </h3>
              {strongTopicData.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No strong topics yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={strongTopicData} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="topic" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val}%`, 'Avg Score']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTopic ?? ''}
                    />
                    <Bar dataKey="score" fill="var(--color-success)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Students at risk */}
          {report.studentsAtRisk.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <AlertTriangle size={15} className="text-danger" />
                Students At Risk ({report.studentsAtRisk.length})
                <Badge label="Below 45%" color="red" />
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {report.studentsAtRisk.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-danger text-xs font-bold">
                        {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{s.name}</p>
                      <p className="text-xs text-slate-400">Avg: {s.avgScore}%</p>
                    </div>
                    <div className={cn(
                      'text-sm font-bold',
                      s.avgScore < 30 ? 'text-danger' : 'text-amber-500'
                    )}>
                      {s.avgScore}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insights */}
          {report.actionableInsights?.length > 0 && (
            <div className="card p-5 bg-primary-50 border-primary-100">
              <h3 className="font-semibold text-primary mb-4 flex items-center gap-2">
                <Lightbulb size={15} /> AI Actionable Insights
              </h3>
              <div className="space-y-3">
                {report.actionableInsights.map((insight, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                      {i + 1}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Focus Areas */}
          {report.suggestedFocusAreas?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BookOpen size={15} className="text-primary" /> Suggested Focus Areas (High NECTA Weight)
              </h3>
              <div className="space-y-2">
                {report.suggestedFocusAreas.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">{t.topic}</p>
                      <p className="text-xs text-amber-600">Current average: {t.avgScore}% · {t.attempts} attempts</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-amber-600 font-medium">NECTA Weight</p>
                      <p className="text-lg font-bold text-amber-700">{Math.round(t.nectaWeight * 100)}%</p>
                    </div>
                    <ProgressBar value={t.avgScore} max={100} color="accent" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
