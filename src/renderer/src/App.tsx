// src/renderer/src/App.tsx
import React, { useEffect } from 'react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from './components/layout/AppShell'
import { OnboardingPage } from './pages/OnboardingPage'
import { DashboardPage } from './pages/DashboardPage'
import { LessonPage } from './pages/LessonPage'
import { ExamPage } from './pages/ExamPage'
import { MarkingPage } from './pages/MarkingPage'
import { OMRPage } from './pages/OMRPage'
import { ReportsPage } from './pages/ReportsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ToastContainer } from './components/ui/Toast'
import { useAIStore, useTeacherStore, useUIStore } from './stores'
import { onEvent, ipc } from './hooks/useIPC'
import { applyTheme } from './theme/themes'

export default function App() {
  const { i18n } = useTranslation()
  const { setStatus } = useAIStore()
  const { startStream, appendChunk, endStream } = useAIStore()
  const { teacher, settings, isOnboarded, setTeacher, setSettings } = useTeacherStore()
  const { addToast, theme, setTheme } = useUIStore()

  // Apply theme on mount and when it changes — sets data-theme on <html>
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Listen for system theme changes
  useEffect(() => {
    if (!window.matchMedia) return

    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const highContrastQuery = window.matchMedia('(prefers-contrast: more)')

    const handleThemeChange = () => {
      // Only auto-update if user hasn't manually set a theme
      const storedTheme = localStorage.getItem('kairos-ui')
      if (!storedTheme) {
        if (highContrastQuery.matches) {
          setTheme('high-contrast')
        } else if (darkModeQuery.matches) {
          setTheme('dark')
        } else {
          setTheme('light')
        }
      }
    }

    darkModeQuery.addEventListener('change', handleThemeChange)
    highContrastQuery.addEventListener('change', handleThemeChange)

    return () => {
      darkModeQuery.removeEventListener('change', handleThemeChange)
      highContrastQuery.removeEventListener('change', handleThemeChange)
    }
  }, [setTheme])

  // Bootstrap: load teacher profile and settings on startup
  useEffect(() => {
    async function bootstrap() {
      try {
        const [teacherData, settingsData, aiStatus] = await Promise.all([
          ipc('db:get-teacher'),
          ipc('settings:get'),
          ipc('ai:get-status')
        ])
        if (teacherData) setTeacher(teacherData)
        if (settingsData) {
          setSettings(settingsData)
          if (settingsData.language) {
            i18n.changeLanguage(settingsData.language === 'bilingual' ? 'en' : settingsData.language)
          }
        }
        if (aiStatus) setStatus(aiStatus)
      } catch (err) {
        console.error('Bootstrap error:', err)
      }
    }
    bootstrap()
  }, [])

  // Subscribe to AI events from main process
  useEffect(() => {
    const cleanups = [
      onEvent('ai:status-change', (status) => setStatus(status)),
      onEvent('ai:stream-start', ({ jobId, feature }) => startStream(jobId, feature)),
      onEvent('ai:stream-chunk', ({ chunk }) => appendChunk(chunk)),
      onEvent('ai:stream-end', () => endStream()),
      onEvent('ai:stream-error', ({ error }) => {
        endStream()
        addToast({ type: 'error', title: 'AI Error', message: String(error) })
      })
    ]
    return () => cleanups.forEach(fn => fn())
  }, [])

  const showOnboarding = !isOnboarded || !teacher

  return (
    <>
      <MemoryRouter>
        {showOnboarding ? (
          <Routes>
            <Route path="*" element={<OnboardingPage />} />
          </Routes>
        ) : (
          <AppShell>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/lesson" element={<LessonPage />} />
              <Route path="/exam" element={<ExamPage />} />
              <Route path="/marking" element={<MarkingPage />} />
              <Route path="/omr" element={<OMRPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AppShell>
        )}
      </MemoryRouter>
      <ToastContainer />
    </>
  )
}
