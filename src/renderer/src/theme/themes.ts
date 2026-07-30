// src/renderer/src/theme/themes.ts
// Theme definitions for Kairos

export interface Theme {
  id: string
  name: string
  colors: {
    // Primary colors
    primary: string
    primaryHover: string
    primaryLight: string
    primaryDark: string
    
    // Accent colors
    accent: string
    accentHover: string
    
    // Background colors
    background: string
    surface: string
    surfaceHover: string
    
    // Text colors
    textPrimary: string
    textSecondary: string
    textTertiary: string
    
    // Border colors
    border: string
    borderLight: string
    
    // Status colors
    success: string
    warning: string
    error: string
    info: string
    
    // Semantic colors
    successBg: string
    warningBg: string
    errorBg: string
    infoBg: string
  }
}

export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  colors: {
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    primaryLight: '#dbeafe',
    primaryDark: '#1e40af',
    
    accent: '#f59e0b',
    accentHover: '#d97706',
    
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceHover: '#f1f5f9',
    
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textTertiary: '#94a3b8',
    
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    
    successBg: '#d1fae5',
    warningBg: '#fef3c7',
    errorBg: '#fee2e2',
    infoBg: '#dbeafe'
  }
}

export const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  colors: {
    primary: '#60a5fa',
    primaryHover: '#3b82f6',
    primaryLight: '#1e3a8a',
    primaryDark: '#93c5fd',
    
    accent: '#fbbf24',
    accentHover: '#f59e0b',
    
    background: '#0f172a',
    surface: '#1e293b',
    surfaceHover: '#334155',
    
    textPrimary: '#f1f5f9',
    textSecondary: '#cbd5e1',
    textTertiary: '#64748b',
    
    border: '#334155',
    borderLight: '#475569',
    
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    
    successBg: '#064e3b',
    warningBg: '#78350f',
    errorBg: '#7f1d1d',
    infoBg: '#1e3a8a'
  }
}

export const highContrastTheme: Theme = {
  id: 'high-contrast',
  name: 'High Contrast',
  colors: {
    primary: '#0066ff',
    primaryHover: '#0052cc',
    primaryLight: '#cce0ff',
    primaryDark: '#003d99',
    
    accent: '#ff9900',
    accentHover: '#cc7a00',
    
    background: '#ffffff',
    surface: '#ffffff',
    surfaceHover: '#f0f0f0',
    
    textPrimary: '#000000',
    textSecondary: '#333333',
    textTertiary: '#666666',
    
    border: '#000000',
    borderLight: '#666666',
    
    success: '#008000',
    warning: '#ff9900',
    error: '#cc0000',
    info: '#0066ff',
    
    successBg: '#ccffcc',
    warningBg: '#ffe5cc',
    errorBg: '#ffcccc',
    infoBg: '#cce0ff'
  }
}

export const themes: Record<string, Theme> = {
  light: lightTheme,
  dark: darkTheme,
  'high-contrast': highContrastTheme
}

export type ThemeId = 'light' | 'dark' | 'high-contrast'

/**
 * Apply a theme by id. Colors live entirely in CSS (globals.css) keyed off the
 * `data-theme` attribute on <html>, so switching is instant and consistent —
 * no per-property JS injection required.
 */
export function applyTheme(theme: Theme | ThemeId) {
  const id = typeof theme === 'string' ? theme : theme.id
  document.documentElement.setAttribute('data-theme', id)
  localStorage.setItem('kairos-theme', id)
}

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem('kairos-theme')
  return themes[stored || 'light'] || lightTheme
}

/** Resolve the preferred theme from the OS on first load. */
export function getSystemThemePreference(): ThemeId {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  if (window.matchMedia('(prefers-contrast: more)').matches) return 'high-contrast'
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}
