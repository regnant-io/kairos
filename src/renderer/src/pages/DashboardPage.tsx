// src/renderer/src/pages/DashboardPage.tsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, FileText, CheckSquare, MessageSquare, Clock, TrendingUp, BarChart3, Star } from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useTeacherStore, useAIStore } from '../stores'
import { StatCard, Spinner } from '../components/ui/Primitives'
import { formatDate } from '../components/ui/utils'
import type { LocalAnalytics, Lesson, Exam } from '@shared/db-types'

export function DashboardPage() {
  const navigate = useNavigate()
  const { teacher } = useTeacherStore()
  const { status } = useAIStore()
  const [analytics, setAnalytics] = useState<LocalAnalytics | null>(null)
  const [recentLessons, setRecentLessons] = useState<Lesson[]>([])
  const [recentExams, setRecentExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const greetings: Record<string, string> = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }

  useEffect(() => {
    async function load() {
      try {
        const [ana, lessons, exams] = await Promise.all([
          ipc('db:get-analytics'),
          ipc('db:get-lessons'),
          ipc('db:get-exams')
        ])
        setAnalytics(ana)
        setRecentLessons((lessons ?? []).slice(0, 4))
        setRecentExams((exams ?? []).slice(0, 3))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const quickActions = [
    { label: 'Plan a Lesson', sub: 'Generate a full NECTA-aligned lesson plan', icon: BookOpen, path: '/lesson', color: 'bg-primary-50 text-primary border-primary-100' },
    { label: 'Create an Exam', sub: 'Multiple choice, essays, NECTA mock', icon: FileText, path: '/exam', color: 'bg-amber-50 text-amber-700 border-amber-100' },
    { label: 'Mark Scripts', sub: 'AI-assisted grading with feedback', icon: CheckSquare, path: '/marking', color: 'bg-green-50 text-green-700 border-green-100' },
    { label: 'Write Reports', sub: 'Batch generate student comments', icon: MessageSquare, path: '/reports', color: 'bg-purple-50 text-purple-700 border-purple-100' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Spinner size={32} />
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-semibold text-slate-800">
          {greetings[timeOfDay]}, {teacher?.name?.split(' ')[0]} 👋
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <div className={`w-2 h-2 rounded-full ${
            status.status === 'ready' ? 'bg-success' :
            status.status === 'generating' ? 'bg-amber-400 animate-pulse' :
            status.status === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-danger'
          }`} />
          <p className="text-sm text-slate-500">
            {status.status === 'ready' ? `AI ready — ${status.model}` :
             status.status === 'generating' ? 'AI generating…' :
             status.status === 'loading' ? 'Loading AI model, please wait…' :
             'AI unavailable — check settings'}
          </p>
        </div>
      </div>

      {/* Stats row */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Lessons"
            value={analytics.totalLessons}
            sub="all time"
            icon={<BookOpen size={16} />}
            color="primary"
          />
          <StatCard
            label="Exams"
            value={analytics.totalExams}
            sub="created"
            icon={<FileText size={16} />}
            color="accent"
          />
          <StatCard
            label="Students"
            value={analytics.totalStudents}
            sub="enrolled"
            icon={<TrendingUp size={16} />}
            color="success"
          />
          <StatCard
            label="Time Saved"
            value={`${analytics.weeklyStats.hoursEstimatedSaved}h`}
            sub="this week"
            icon={<Clock size={16} />}
            color="primary"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Start</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.path}
                onClick={() => navigate(a.path)}
                className={`card p-4 flex items-start gap-3 text-left hover:shadow-md transition-shadow border ${a.color}`}
              >
                <div className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-semibold text-sm">{a.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{a.sub}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Recent work */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Lessons */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recent Lessons</h2>
            <button onClick={() => navigate('/lesson')} className="text-xs text-primary hover:underline">See all</button>
          </div>
          <div className="space-y-2">
            {recentLessons.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No lessons yet — generate your first one!</p>
            ) : recentLessons.map(l => (
              <div key={l.id} className="card p-3 flex items-start gap-2.5 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate('/lesson')}>
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={14} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{l.topic}</p>
                  <p className="text-xs text-slate-400">{l.subject} · {l.classLevel} · {formatDate(l.updatedAt)}</p>
                </div>
                {l.isStarred && <Star size={12} className="text-accent flex-shrink-0 mt-1" fill="currentColor" />}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Exams */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recent Exams</h2>
            <button onClick={() => navigate('/exam')} className="text-xs text-primary hover:underline">See all</button>
          </div>
          <div className="space-y-2">
            {recentExams.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No exams yet — create your first one!</p>
            ) : recentExams.map(e => (
              <div key={e.id} className="card p-3 flex items-start gap-2.5 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate('/exam')}>
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{e.title}</p>
                  <p className="text-xs text-slate-400">{e.subject} · {e.classLevel} · {e.totalMarks} marks</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly summary */}
      {analytics && (
        <div className="mt-6 card p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-primary">This week</h3>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <span><strong className="text-slate-800">{analytics.weeklyStats.lessonsGenerated}</strong> <span className="text-slate-400">lessons</span></span>
            <span><strong className="text-slate-800">{analytics.weeklyStats.examsCreated}</strong> <span className="text-slate-400">exams</span></span>
            <span><strong className="text-slate-800">{analytics.weeklyStats.studentsMarked}</strong> <span className="text-slate-400">scripts marked</span></span>
            <span><strong className="text-slate-800">{analytics.weeklyStats.reportsWritten}</strong> <span className="text-slate-400">reports</span></span>
          </div>
        </div>
      )}
    </div>
  )
}
