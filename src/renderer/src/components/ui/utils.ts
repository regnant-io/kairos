// src/renderer/src/components/ui/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  })
}

export function gradeColor(grade: string): string {
  const map: Record<string, string> = {
    A: 'text-success', B: 'text-green-500', C: 'text-amber-500',
    D: 'text-orange-500', F: 'text-danger'
  }
  return map[grade] ?? 'text-slate-600'
}

export function gradeBg(grade: string): string {
  const map: Record<string, string> = {
    A: 'bg-green-50 text-success border-green-200',
    B: 'bg-green-50 text-green-600 border-green-200',
    C: 'bg-amber-50 text-amber-600 border-amber-200',
    D: 'bg-orange-50 text-orange-600 border-orange-200',
    F: 'bg-red-50 text-danger border-red-200'
  }
  return map[grade] ?? 'bg-slate-50 text-slate-600 border-slate-200'
}

export function scoreToGrade(pct: number): string {
  if (pct >= 80) return 'A'
  if (pct >= 60) return 'B'
  if (pct >= 45) return 'C'
  if (pct >= 30) return 'D'
  return 'F'
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + '…' : str
}
