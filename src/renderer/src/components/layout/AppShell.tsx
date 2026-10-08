import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart3, BookOpen, ChevronLeft, ChevronRight, ClipboardCheck, FileText,
  LayoutGrid, MessageSquare, Moon, ScanLine, Settings, Sun, Library,
  PanelRightClose, PanelRightOpen
} from 'lucide-react'
import { useAIStore, useTeacherStore, useUIStore } from '../../stores'
import { cn } from '../ui/utils'
import { AIChat } from './AIChat'

const NAV_GROUPS = [
  {
    label: 'nav.workspace',
    items: [
      { path: '/dashboard', label: 'nav.overview', icon: LayoutGrid },
      { path: '/exam', label: 'nav.examStudio', icon: FileText },
      { path: '/questions', label: 'nav.questionBank', icon: Library },
      { path: '/marking', label: 'nav.markingDesk', icon: ClipboardCheck },
      { path: '/omr', label: 'nav.omrReview', icon: ScanLine }
    ]
  },
  {
    label: 'nav.intelligence',
    items: [
      { path: '/lesson', label: 'nav.lessonPlans', icon: BookOpen },
      { path: '/reports', label: 'nav.reportsShort', icon: MessageSquare },
      { path: '/analytics', label: 'nav.classInsights', icon: BarChart3 }
    ]
  }
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'nav.overview', '/exam': 'nav.examStudio', '/questions': 'nav.questionBank',
  '/marking': 'nav.markingDesk', '/omr': 'nav.omrReview', '/lesson': 'nav.lessonPlans',
  '/reports': 'nav.reportsShort', '/analytics': 'nav.classInsights', '/settings': 'nav.settings'
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { status } = useAIStore()
  const { teacher } = useTeacherStore()
  const { theme, setTheme } = useUIStore()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(true)

  const modelReady = status.status === 'ready'
  const initials = teacher?.name?.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'KT'
  const pageTitle = t(PAGE_TITLES[location.pathname] || 'nav.workspace')

  return (
    <div className="operator-app">
      <aside className={cn('operator-sidebar', !navOpen && 'is-collapsed')} aria-label="Main navigation">
        <div className="operator-brand">
          <button className="operator-brand-mark" onClick={() => navigate('/dashboard')} aria-label="Kairos overview">
            <span className="operator-brand-glyph">K</span><span className="operator-brand-corner" />
          </button>
          {navOpen && <div className="operator-brand-copy"><strong>KAIROS</strong><span>BY REGNANT</span></div>}
        </div>

        <div className="operator-sidebar-body">
          {NAV_GROUPS.map(group => (
            <div className="operator-nav-group" key={group.label}>
              {navOpen && <div className="operator-nav-caption">{t(group.label)}</div>}
              {group.items.map(item => {
                const Icon = item.icon
                const active = location.pathname === item.path
                return (
                  <button key={item.path} title={!navOpen ? t(item.label) : undefined}
                    className={cn('operator-nav-item', active && 'active')}
                    aria-label={t(item.label)}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(item.path)}>
                    <Icon size={17} strokeWidth={1.8} />
                    {navOpen && <span>{t(item.label)}</span>}
                    {navOpen && active && <span className="operator-nav-active-line" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="operator-sidebar-bottom">
          <button className={cn('operator-nav-item', location.pathname === '/settings' && 'active')}
            title={!navOpen ? t('nav.settings') : undefined} aria-label={t('nav.settings')} onClick={() => navigate('/settings')}>
            <Settings size={17} strokeWidth={1.8} />{navOpen && <span>{t('nav.settings')}</span>}
          </button>
          <div className="operator-account" title={teacher?.name || 'Teacher'}>
            <span className="operator-avatar">{initials}</span>
            {navOpen && <div className="operator-account-copy"><strong>{teacher?.name || 'Teacher'}</strong><span>{teacher?.schoolName || 'School'}</span></div>}
          </div>
        </div>
      </aside>

      <div className="operator-center">
        <header className="operator-topbar">
          <div className="operator-topbar-left">
            <button className="operator-icon-button operator-nav-toggle" onClick={() => setNavOpen(v => !v)}
              title={navOpen ? 'Collapse navigation' : 'Expand navigation'} aria-label="Toggle navigation">
              {navOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
            <span className="operator-topbar-workspace">{t('nav.workspace')}</span>
            <span className="operator-topbar-separator">/</span>
            <span className="operator-topbar-title">{pageTitle}</span>
          </div>
          <div className="operator-topbar-actions">
            <span className={cn('operator-system-status', modelReady && 'is-ready')} title={status.model || status.status}>
              <span className="operator-status-dot" />{modelReady ? t('nav.modelReady') : status.status.toUpperCase()}
            </span>
            <span className="operator-topbar-divider" />
            <button className="operator-icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className={cn('operator-assistant-button', assistantOpen && 'active')}
              onClick={() => setAssistantOpen(v => !v)} aria-expanded={assistantOpen}>
              {assistantOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              <span>{t('nav.assistant')}</span>
            </button>
          </div>
        </header>
        <main className="operator-main" id="main-content">{children}</main>
      </div>

      {assistantOpen && <aside className="operator-assistant" aria-label="AI assistant"><AIChat /></aside>}
    </div>
  )
}
