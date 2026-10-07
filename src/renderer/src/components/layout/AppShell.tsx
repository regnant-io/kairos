// src/renderer/src/components/layout/AppShell.tsx
import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, BookOpen, FileText, CheckSquare, ScanLine,
  MessageSquare, BarChart3, Settings, Cpu, AlertCircle, Loader2,
  Sun, Moon
} from 'lucide-react'
import { useAIStore, useTeacherStore, useUIStore } from '../../stores'
import { cn } from '../ui/utils'
import { ResizableLayout } from './ResizableLayout'
import { AIChat } from './AIChat'

const NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { path: '/lesson',    icon: BookOpen,         key: 'nav.lesson' },
  { path: '/exam',      icon: FileText,          key: 'nav.exam' },
  { path: '/marking',   icon: CheckSquare,       key: 'nav.marking' },
  { path: '/omr',       icon: ScanLine,          key: 'nav.omr' },
  { path: '/reports',   icon: MessageSquare,     key: 'nav.reports' },
  { path: '/analytics', icon: BarChart3,         key: 'nav.analytics' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { status } = useAIStore()
  const { teacher } = useTeacherStore()
  const { theme, setTheme } = useUIStore()

  const isDark = theme === 'dark'
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  const initials = teacher?.name
    ? teacher.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'T'

  // Sidebar content
  const sidebarContent = (
    <aside className="flex flex-col h-full bg-surface">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border h-14">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-white font-heading font-bold text-sm">K</span>
        </div>
        <span className="flex flex-col leading-none">
          <span className="font-heading font-bold text-primary text-lg tracking-tight">Kairos</span>
          <span className="text-[9px] tracking-wider text-content-secondary">by Regnant</span>
        </span>
        <button
          onClick={toggleTheme}
          className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-content-secondary hover:bg-surface-hover transition-colors no-drag"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle color theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn('nav-item w-full', isActive && 'active')}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span>{t(item.key)}</span>
            </button>
          )
        })}
      </nav>

      {/* Bottom: Settings + AI Status */}
      <div className="p-2 border-t border-slate-100 space-y-0.5">
        <button
          onClick={() => navigate('/settings')}
          className={cn('nav-item w-full', location.pathname === '/settings' && 'active')}
        >
          <Settings size={18} className="flex-shrink-0" />
          <span>{t('nav.settings')}</span>
        </button>

        {/* AI Status chip */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
          status.status === 'ready' && 'text-success bg-green-50',
          status.status === 'generating' && 'text-accent bg-amber-50',
          status.status === 'loading' && 'text-slate-500 bg-slate-50',
          status.status === 'error' && 'text-danger bg-red-50'
        )}>
          {status.status === 'ready' && <Cpu size={14} />}
          {status.status === 'generating' && <Loader2 size={14} className="animate-spin" />}
          {status.status === 'loading' && <Loader2 size={14} className="animate-spin" />}
          {status.status === 'error' && <AlertCircle size={14} />}
          <span className="truncate">
            {status.status === 'ready' && t('ai.ready')}
            {status.status === 'generating' && (status.currentJob ?? t('ai.generating'))}
            {status.status === 'loading' && t('ai.loading')}
            {status.status === 'error' && t('ai.error')}
          </span>
        </div>

        {/* Teacher avatar */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-primary text-xs font-semibold">{initials}</span>
          </div>
          <div className="truncate">
            <p className="text-xs font-medium text-slate-700 truncate">{teacher?.name}</p>
            <p className="text-xs text-slate-400 truncate">{teacher?.schoolName ?? 'Kairos'}</p>
          </div>
        </div>
      </div>
    </aside>
  )

  // Main content
  const mainContent = (
    <main className="h-full overflow-y-auto bg-background">
      {children}
    </main>
  )

  // AI Chat panel
  const chatContent = <AIChat />

  return (
    <ResizableLayout
      sidebar={sidebarContent}
      main={mainContent}
      chat={chatContent}
      defaultSidebarWidth={240}
      defaultChatWidth={320}
      minSidebarWidth={200}
      minMainWidth={400}
      minChatWidth={280}
    />
  )
}
