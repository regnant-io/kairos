// src/renderer/src/components/ui/Primitives.tsx
import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from './utils'

// ── Page Header ───────────────────────────────────────────────────

export function PageHeader({
  title, subtitle, actions, className
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between mb-6', className)}>
      <div>
        <h1 className="font-heading text-2xl font-semibold text-primary">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, icon, color = 'primary', trend
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
  color?: 'primary' | 'accent' | 'success' | 'danger'
  trend?: 'up' | 'down' | 'neutral'
}) {
  const colors = {
    primary: 'bg-primary-50 text-primary',
    accent: 'bg-amber-50 text-accent',
    success: 'bg-green-50 text-success',
    danger: 'bg-red-50 text-danger'
  }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {icon && (
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', colors[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────

export function EmptyState({
  icon, title, description, action
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
        {icon}
      </div>
      <h3 className="font-medium text-slate-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-400 mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-primary', className)} />
}

// ── Select ────────────────────────────────────────────────────────

export function Select({
  value, onChange, options, placeholder, className, disabled
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={cn('select', className)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ── Label + Input Group ────────────────────────────────────────────

export function Field({
  label, required, children, hint
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="label">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

// ── Section Panel ─────────────────────────────────────────────────

export function Section({
  title, children, className, actions
}: {
  title?: string
  children: React.ReactNode
  className?: string
  actions?: React.ReactNode
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────

export function ProgressBar({ value, max = 100, color = 'primary', showLabel = false }:
  { value: number; max?: number; color?: string; showLabel?: boolean }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const bg = color === 'primary' ? 'bg-primary' : color === 'success' ? 'bg-success' :
    color === 'danger' ? 'bg-danger' : color === 'accent' ? 'bg-accent' : 'bg-primary'
  return (
    <div className="space-y-1">
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', bg)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <p className="text-xs text-slate-500 text-right">{pct}%</p>}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────

export function Badge({ label, color = 'slate' }: { label: string; color?: string }) {
  const styles: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    primary: 'bg-primary-50 text-primary'
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', styles[color] ?? styles.slate)}>
      {label}
    </span>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────

export function Tabs({
  tabs, activeTab, onTabChange
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode }[]
  activeTab: string
  onTabChange: (id: string) => void
}) {
  return (
    <div className="flex border-b border-slate-200 mb-6">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── AI Generating Indicator ───────────────────────────────────────

export function AIGeneratingBanner({ feature }: { feature: string }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-primary-50 border border-primary-100 rounded-xl">
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <p className="text-sm text-primary font-medium">AI is generating your {feature}…</p>
    </div>
  )
}

// ── Streaming Text ────────────────────────────────────────────────

export function StreamingText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('font-mono text-xs text-slate-600 bg-slate-50 rounded-lg p-4 overflow-auto max-h-64', className)}>
      <pre className="whitespace-pre-wrap break-words">{text}<span className="cursor-blink">▌</span></pre>
    </div>
  )
}
