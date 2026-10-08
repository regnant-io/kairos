// src/renderer/src/pages/OnboardingPage.tsx
import React, { useState } from 'react'
import { ChevronRight, CheckCircle } from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useTeacherStore, useUIStore } from '../stores'
import { SUBJECTS, CLASS_LEVELS } from '@shared/db-types'
import { cn } from '../components/ui/utils'

type Step = 'welcome' | 'profile' | 'classes' | 'done'

export function OnboardingPage() {
  const [step, setStep] = useState<Step>('welcome')
  const [saving, setSaving] = useState(false)
  const { setTeacher, setOnboarded } = useTeacherStore()
  const { addToast } = useUIStore()

  const [form, setForm] = useState({
    name: '',
    schoolName: '',
    email: '',
    subjects: [] as string[],
    classLevels: [] as string[],
    languagePref: 'en' as 'en' | 'sw' | 'bilingual'
  })

  function toggle<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
  }

  async function handleFinish() {
    if (!form.name.trim()) {
      addToast({ type: 'error', title: 'Name required', message: 'Please enter your full name' })
      return
    }
    setSaving(true)
    try {
      const teacher = await ipc('db:save-teacher', {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        schoolName: form.schoolName.trim() || undefined,
        subjects: form.subjects,
        classLevels: form.classLevels,
        languagePref: form.languagePref
      })
      setTeacher(teacher)
      setOnboarded(true)
      setStep('done')
    } catch (err) {
      addToast({ type: 'error', title: 'Setup failed', message: String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="operator-onboarding min-h-screen bg-gradient-to-br from-primary-600 to-primary-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-4">
            <span className="font-heading text-white text-3xl font-bold">K</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-white">Kairos</h1>
          <p className="text-primary-200 mt-1 text-sm">Setup</p>
        </div>

        {/* Step card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 pt-6 pb-2">
            {(['welcome', 'profile', 'classes'] as Step[]).map((s, i) => (
              <div key={s} className={cn(
                'w-2 h-2 rounded-full transition-all',
                step === s ? 'w-6 bg-primary' : 'bg-slate-200'
              )} />
            ))}
          </div>

          <div className="p-8">
            {/* WELCOME */}
            {step === 'welcome' && (
              <div className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold text-slate-800">Set up Kairos</h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Add your profile, subjects, and classes. You can change these later in Settings.
                </p>
                <button className="btn-primary w-full" onClick={() => setStep('profile')}>
                  Continue <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* PROFILE */}
            {step === 'profile' && (
              <div className="space-y-4">
                <h2 className="font-heading text-xl font-semibold text-slate-800">Your Profile</h2>
                <p className="text-sm text-slate-500">Tell us about yourself so Kairos can personalize your experience.</p>

                <div className="space-y-3">
                  <div>
                    <label className="label">Full Name <span className="text-danger">*</span></label>
                    <input
                      className="input"
                      placeholder="e.g. Amina Hassan"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">School Name</label>
                    <input
                      className="input"
                      placeholder="e.g. Msalato Secondary School"
                      value={form.schoolName}
                      onChange={e => setForm(f => ({ ...f, schoolName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Email (optional)</label>
                    <input
                      className="input"
                      type="email"
                      placeholder="you@school.tz"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Preferred Language</label>
                    <select
                      className="select"
                      value={form.languagePref}
                      onChange={e => setForm(f => ({ ...f, languagePref: e.target.value as any }))}
                    >
                      <option value="en">English</option>
                      <option value="sw">Kiswahili</option>
                      <option value="bilingual">Bilingual (English + Kiswahili)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button className="btn-secondary flex-1" onClick={() => setStep('welcome')}>Back</button>
                  <button
                    className="btn-primary flex-1"
                    disabled={!form.name.trim()}
                    onClick={() => setStep('classes')}
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* CLASSES */}
            {step === 'classes' && (
              <div className="space-y-4">
                <h2 className="font-heading text-xl font-semibold text-slate-800">Subjects & Classes</h2>
                <p className="text-sm text-slate-500">Select the subjects and class levels you teach.</p>

                <div>
                  <label className="label">Subjects You Teach</label>
                  <div className="flex flex-wrap gap-2 mt-1 max-h-40 overflow-y-auto">
                    {SUBJECTS.map(s => (
                      <button
                        key={s}
                        onClick={() => setForm(f => ({ ...f, subjects: toggle(f.subjects, s) }))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                          form.subjects.includes(s)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Class Levels</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {CLASS_LEVELS.map(cl => (
                      <button
                        key={cl}
                        onClick={() => setForm(f => ({ ...f, classLevels: toggle(f.classLevels, cl) }))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                          form.classLevels.includes(cl)
                            ? 'bg-accent text-white border-accent'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-accent hover:text-accent'
                        )}
                      >
                        {cl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button className="btn-secondary flex-1" onClick={() => setStep('profile')}>Back</button>
                  <button
                    className="btn-primary flex-1"
                    disabled={saving}
                    onClick={handleFinish}
                  >
                    {saving ? 'Setting up…' : 'Finish Setup'} <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* DONE */}
            {step === 'done' && (
              <div className="text-center space-y-4 py-4">
                <CheckCircle size={48} className="text-success mx-auto" />
                <h2 className="font-heading text-xl font-semibold text-slate-800">You're all set!</h2>
                <p className="text-slate-500 text-sm">
                  Setup is complete. The AI model is loading in the background.
                </p>
                <button className="btn-primary w-full" onClick={() => window.location.reload()}>
                  Open Kairos →
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-primary-300 text-xs mt-6">
          Data is stored on this device.
        </p>
      </div>
    </div>
  )
}
