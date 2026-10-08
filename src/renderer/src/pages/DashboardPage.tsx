import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, BookOpen, Clock3, ClipboardCheck,
  FileText, MessageSquare, Plus, Users
} from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useTeacherStore, useAIStore } from '../stores'
import { Spinner } from '../components/ui/Primitives'
import { formatDate } from '../components/ui/utils'
import type { LocalAnalytics, Lesson, Exam } from '@shared/db-types'

export function DashboardPage() {
  const navigate = useNavigate()
  const { teacher } = useTeacherStore()
  const { status } = useAIStore()
  const [analytics, setAnalytics] = useState<LocalAnalytics | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [summary, recentLessons, recentExams] = await Promise.all([
          ipc('db:get-analytics'), ipc('db:get-lessons'), ipc('db:get-exams')
        ])
        setAnalytics(summary)
        setLessons((recentLessons ?? []).slice(0, 4))
        setExams((recentExams ?? []).slice(0, 4))
      } catch (error) {
        console.error('Could not load dashboard', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const recentWork = [
    ...exams.map(item => ({ id: item.id, title: item.title, kind: 'Exam', detail: `${item.subject} · ${item.classLevel}`, date: item.updatedAt, path: '/exam', icon: FileText })),
    ...lessons.map(item => ({ id: item.id, title: item.topic, kind: 'Lesson', detail: `${item.subject} · ${item.classLevel}`, date: item.updatedAt, path: '/lesson', icon: BookOpen }))
  ].sort((a, b) => b.date - a.date).slice(0, 6)

  const actions = [
    { number: '01', label: 'Create an exam', description: 'Build a curriculum aligned assessment', path: '/exam', icon: FileText },
    { number: '02', label: 'Mark student work', description: 'Review AI suggested scores and feedback', path: '/marking', icon: ClipboardCheck },
    { number: '03', label: 'Plan a lesson', description: 'Turn objectives into a teaching plan', path: '/lesson', icon: BookOpen },
    { number: '04', label: 'Write reports', description: 'Draft comments across a class', path: '/reports', icon: MessageSquare }
  ]

  if (loading) return <div className="operator-loading"><Spinner size={24} /><span>Loading workspace</span></div>

  return (
    <div className="operator-page operator-dashboard">
      <section className="operator-hero">
        <div>
          <p className="operator-hero-kicker">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, <span>{teacher?.name?.split(' ')[0] || 'teacher'}</span></h1>
        </div>
        <div className="operator-hero-actions">
          <button className="operator-action-primary" onClick={() => navigate('/exam')}><Plus size={17} /> New exam</button>
          <button className="operator-action-secondary" onClick={() => navigate('/marking')}>Marking desk <ArrowRight size={16} /></button>
        </div>
      </section>

      <section className="operator-metric-grid" aria-label="Workspace metrics">
        {[
          { label: 'LESSONS CREATED', value: analytics?.totalLessons ?? 0, note: 'Plans in your library', icon: BookOpen },
          { label: 'EXAMS BUILT', value: analytics?.totalExams ?? 0, note: 'Assessments available', icon: FileText },
          { label: 'STUDENTS', value: analytics?.totalStudents ?? 0, note: 'On the roster', icon: Users },
          { label: 'TIME RETURNED', value: `${analytics?.weeklyStats.hoursEstimatedSaved ?? 0}h`, note: 'Estimate for this week', icon: Clock3 }
        ].map(metric => {
          const Icon = metric.icon
          return <div className="operator-metric" key={metric.label}>
            <div className="operator-metric-top"><span>{metric.label}</span><Icon size={17} strokeWidth={1.6} /></div>
            <strong>{metric.value}</strong><span className="operator-metric-note">{metric.note}</span>
          </div>
        })}
      </section>

      <div className="operator-dashboard-grid">
        <section className="operator-panel operator-work-panel">
          <div className="operator-section-heading"><div><span className="operator-section-index">01 /</span><h2>Recent work</h2></div><span className="operator-section-sub">Your latest teaching assets</span></div>
          <div className="operator-table-head"><span>ASSET</span><span>TYPE</span><span>UPDATED</span><span /></div>
          {recentWork.length ? recentWork.map(item => {
            const Icon = item.icon
            return <button className="operator-work-row" key={`${item.kind}-${item.id}`} onClick={() => navigate(item.path)}>
              <span className="operator-work-primary"><span className="operator-work-icon"><Icon size={16} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span></span>
              <span className="operator-kind">{item.kind}</span><span className="operator-work-date">{formatDate(item.date)}</span><ArrowUpRight size={16} className="operator-row-arrow" />
            </button>
          }) : <div className="operator-empty-rows"><FileText size={22} /><strong>No recent work</strong><span>Saved exams and lessons appear here.</span></div>}
        </section>

        <section className="operator-panel operator-actions-panel">
          <div className="operator-section-heading"><div><span className="operator-section-index">02 /</span><h2>Quick actions</h2></div></div>
          <div className="operator-action-list">
            {actions.map(action => {
              const Icon = action.icon
              return <button key={action.number} className="operator-action-row" onClick={() => navigate(action.path)}>
                <span className="operator-action-number">{action.number}</span><Icon size={18} strokeWidth={1.6} /><span className="operator-action-copy"><strong>{action.label}</strong><small>{action.description}</small></span><ArrowUpRight size={16} />
              </button>
            })}
          </div>
          <div className="operator-intelligence-strip"><span className="operator-status-dot" /><span>{status.status === 'ready' ? `Model: ${status.model}` : `Model: ${status.status}`}</span></div>
        </section>
      </div>

      {analytics && <section className="operator-weekly-strip" aria-label="Weekly activity"><span>THIS WEEK</span>
        <strong>{analytics.weeklyStats.lessonsGenerated} <small>lessons</small></strong>
        <strong>{analytics.weeklyStats.examsCreated} <small>exams</small></strong>
        <strong>{analytics.weeklyStats.studentsMarked} <small>scripts marked</small></strong>
        <strong>{analytics.weeklyStats.reportsWritten} <small>reports</small></strong>
      </section>}
    </div>
  )
}
