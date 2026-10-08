// src/renderer/src/pages/SettingsPage.tsx
import React, { useState, useEffect } from 'react'
import {
  Settings, User, Cpu, HardDrive, Shield, Globe,
  Download, Upload, RefreshCw, CheckCircle, AlertCircle,
  ChevronRight, Trash2, UserPlus, FileText
} from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useTeacherStore, useAIStore, useUIStore } from '../stores'
import {
  PageHeader, Field, Select, StatCard, Badge, Tabs, Section
} from '../components/ui/Primitives'
import { cn, formatDate } from '../components/ui/utils'
import { SUBJECTS, CLASS_LEVELS } from '@shared/db-types'
import type { SystemInfo, AppSettings } from '@shared/ipc-types'
import type { ModelConfig } from '@shared/ai-types'
import type { Student } from '@shared/db-types'

export function SettingsPage() {
  const { teacher, setTeacher, settings, setSettings } = useTeacherStore()
  const { status } = useAIStore()
  const { addToast, theme, setTheme } = useUIStore()

  const [activeTab, setActiveTab] = useState('profile')
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [models, setModels] = useState<ModelConfig[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [saving, setSaving] = useState(false)
  const [restartingAI, setRestartingAI] = useState(false)

  // Form states
  const [name, setName] = useState(teacher?.name ?? '')
  const [schoolName, setSchoolName] = useState(teacher?.schoolName ?? '')
  const [email, setEmail] = useState(teacher?.email ?? '')
  const [subjects, setSubjects] = useState<string[]>(teacher?.subjects ?? [])
  const [classLevels, setClassLevels] = useState<string[]>(teacher?.classLevels ?? [])
  const [langPref, setLangPref] = useState(teacher?.languagePref ?? 'en')

  // Student form
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentClass, setNewStudentClass] = useState(teacher?.classLevels?.[0] ?? 'Form 3')
  const [newStudentReg, setNewStudentReg] = useState('')
  const [filterClass, setFilterClass] = useState('')

  useEffect(() => {
    ipc('settings:get-system-info').then(setSysInfo)
    ipc('settings:get-models').then(ms => setModels(ms ?? []))
    ipc('db:get-students').then(ss => setStudents(ss ?? []))
  }, [])

  function toggleArr<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
  }

  async function saveProfile() {
    setSaving(true)
    try {
      const updated = await ipc('db:update-teacher', {
        name, email, schoolName, subjects, classLevels, languagePref: langPref
      })
      setTeacher(updated)
      addToast({ type: 'success', title: 'Profile saved!' })
    } catch (err) {
      addToast({ type: 'error', title: 'Save failed', message: String(err) })
    } finally {
      setSaving(false)
    }
  }

  async function handleRestartAI() {
    setRestartingAI(true)
    try {
      await ipc('ai:restart')
      addToast({ type: 'success', title: 'AI model restarted' })
    } catch (err) {
      addToast({ type: 'error', title: 'Restart failed', message: String(err) })
    } finally {
      setRestartingAI(false)
    }
  }

  async function handleBackup() {
    try {
      const path = await ipc('file:backup-create')
      addToast({ type: 'success', title: 'Backup created', message: path })
      ipc('file:open-path', path.split('/').slice(0, -1).join('/'))
    } catch (err) {
      addToast({ type: 'error', title: 'Backup failed', message: String(err) })
    }
  }

  async function handleAddStudent() {
    if (!newStudentName.trim()) return
    try {
      const student = await ipc('db:save-student', {
        name: newStudentName.trim(),
        regNumber: newStudentReg.trim() || undefined,
        classLevel: newStudentClass,
        isActive: true,
        stream: undefined,
        gender: undefined
      })
      setStudents(ss => [...ss, student])
      setNewStudentName('')
      setNewStudentReg('')
      addToast({ type: 'success', title: `${student.name} added` })
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to add student', message: String(err) })
    }
  }

  async function handleDeleteStudent(id: string) {
    await ipc('db:delete-student', id)
    setStudents(ss => ss.filter(s => s.id !== id))
    addToast({ type: 'info', title: 'Student removed' })
  }

  async function handleImportStudents() {
    const paths = await ipc('file:open-dialog', {
      title: 'Import Student List',
      filters: [{ name: 'CSV / Text', extensions: ['csv', 'txt'] }]
    })
    if (!paths?.length) return
    try {
      // Simple CSV parse: name,class,reg_number
      const text = await (window as any).electron.invoke('file:parse-document', paths[0])
      addToast({ type: 'info', title: 'Import via CSV not yet supported', message: 'Add students manually for now' })
    } catch (err) {
      addToast({ type: 'error', title: 'Import failed', message: String(err) })
    }
  }

  const filteredStudents = filterClass
    ? students.filter(s => s.classLevel === filterClass)
    : students

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User size={13} /> },
    { id: 'students', label: `Students (${students.length})`, icon: <UserPlus size={13} /> },
    { id: 'ai', label: 'AI Model', icon: <Cpu size={13} /> },
    { id: 'backup', label: 'Backup & Sync', icon: <HardDrive size={13} /> },
    { id: 'system', label: 'System', icon: <Settings size={13} /> },
  ]

  return (
    <div className="operator-standard-page operator-settings-page p-6 max-w-3xl">
      <PageHeader title="Settings" subtitle="Configure Kairos for your school" />

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-700">Teacher Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <input className="input" value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </Field>
            </div>

            <Field label="School Name">
              <input className="input" placeholder="e.g. Dodoma Secondary School" value={schoolName} onChange={e => setSchoolName(e.target.value)} />
            </Field>

            <Field label="Default Language">
              <Select value={langPref} onChange={v => setLangPref(v as any)}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'sw', label: 'Kiswahili' },
                  { value: 'bilingual', label: 'Bilingual (English + Kiswahili)' }
                ]} />
            </Field>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-slate-700 mb-4">Subjects You Teach</h3>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(s => (
                <button
                  key={s}
                  onClick={() => setSubjects(arr => toggleArr(arr, s))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    subjects.includes(s)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-primary'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-slate-700 mb-4">Class Levels</h3>
            <div className="flex flex-wrap gap-2">
              {CLASS_LEVELS.map(cl => (
                <button
                  key={cl}
                  onClick={() => setClassLevels(arr => toggleArr(arr, cl))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    classLevels.includes(cl)
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-accent'
                  )}
                >
                  {cl}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* STUDENTS TAB */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          {/* Add student form */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <UserPlus size={15} /> Add Student
            </h3>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Full name"
                value={newStudentName}
                onChange={e => setNewStudentName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddStudent()}
              />
              <input
                className="input w-28"
                placeholder="Reg No."
                value={newStudentReg}
                onChange={e => setNewStudentReg(e.target.value)}
              />
              <Select
                value={newStudentClass}
                onChange={setNewStudentClass}
                options={CLASS_LEVELS.map(cl => ({ value: cl, label: cl }))}
                className="w-28"
              />
              <button className="btn-primary flex-shrink-0" onClick={handleAddStudent}>Add</button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button className="btn-secondary btn-sm" onClick={handleImportStudents}>
                <Upload size={13} /> Import CSV
              </button>
              <span className="text-xs text-slate-400">Format: name, class_level, reg_number</span>
            </div>
          </div>

          {/* Filter + list */}
          <div className="flex items-center gap-2">
            <Select
              value={filterClass}
              onChange={setFilterClass}
              options={[{ value: '', label: 'All Classes' }, ...CLASS_LEVELS.map(cl => ({ value: cl, label: cl }))]}
              className="w-36"
            />
            <span className="text-sm text-slate-400">{filteredStudents.length} students</span>
          </div>

          <div className="card overflow-hidden">
            {filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No students yet</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredStudents.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 group">
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary text-xs font-semibold">
                        {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{s.name}</p>
                      {s.regNumber && <p className="text-xs text-slate-400">{s.regNumber}</p>}
                    </div>
                    <Badge label={s.classLevel} color="blue" />
                    <button
                      onClick={() => handleDeleteStudent(s.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-danger p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI TAB */}
      {activeTab === 'ai' && (
        <div className="space-y-4">
          {/* Current status */}
          <div className={cn(
            'card p-5 flex items-center gap-4',
            status.status === 'ready' ? 'border-success/30 bg-green-50/30' :
            status.status === 'error' ? 'border-danger/30 bg-red-50/30' : 'border-amber-200 bg-amber-50/30'
          )}>
            {status.status === 'ready'
              ? <CheckCircle size={24} className="text-success flex-shrink-0" />
              : <AlertCircle size={24} className="text-amber-500 flex-shrink-0" />
            }
            <div className="flex-1">
              <p className="font-semibold text-slate-700">
                {status.status === 'ready' ? 'AI Model Ready' :
                 status.status === 'loading' ? 'Loading Model…' :
                 status.status === 'generating' ? 'Generating…' :
                 'AI Error'}
              </p>
              <p className="text-sm text-slate-500">Model: {status.model}</p>
              {status.contextSize > 0 && <p className="text-xs text-slate-400">Context: {status.contextSize.toLocaleString()} tokens</p>}
              {status.error && <p className="text-xs text-danger mt-1">{status.error}</p>}
            </div>
            <button className="btn-secondary btn-sm" onClick={handleRestartAI} disabled={restartingAI}>
              <RefreshCw size={13} className={restartingAI ? 'animate-spin' : ''} />
              {restartingAI ? 'Restarting…' : 'Restart AI'}
            </button>
          </div>

          {/* AI Provider Selection */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Cpu size={15} /> AI Provider
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Choose local llama.cpp, Ollama, or a Cordon node on your school network
            </p>
            <div className="space-y-3">
              <Field label="Provider">
                <Select
                  value={settings?.aiProvider ?? 'llamacpp'}
                  onChange={async (v) => {
                    try {
                      await ipc('settings:save', { aiProvider: v as 'llamacpp' | 'ollama' | 'cordon' })
                      setSettings({ ...settings, aiProvider: v as 'llamacpp' | 'ollama' | 'cordon' } as any)
                      addToast({ type: 'success', title: 'Provider updated', message: 'Restart AI to apply changes' })
                    } catch (err) {
                      addToast({ type: 'error', title: 'Failed', message: String(err) })
                    }
                  }}
                  options={[
                    { value: 'llamacpp', label: 'llama.cpp (Local)' },
                    { value: 'ollama', label: 'Ollama' },
                    { value: 'cordon', label: 'Cordon (school server, signed answers)' }
                  ]}
                />
              </Field>

              {settings?.aiProvider === 'cordon' && (
                <>
                  <p className="text-xs text-slate-500">
                    Cordon runs one model for the whole school. It records every request and signs every
                    answer, so you can show which exam or report the AI produced, and that it was not changed.
                  </p>
                  {([
                    ['cordonEndpoint', 'Cordon address', 'http://127.0.0.1:8443'],
                    ['cordonClientId', 'Client ID (enrolled on the node)', 'kairos'],
                    ['cordonModel', 'Model', 'default'],
                    ['cordonContextSize', 'Context window (tokens)', '8192']
                  ] as const).map(([key, label, fallback]) => (
                    <Field key={key} label={label}>
                      <input
                        className="input"
                        placeholder={fallback}
                        defaultValue={String((settings as any)?.[key] ?? fallback)}
                        onBlur={async (e) => {
                          const value = key === 'cordonContextSize' ? Number(e.target.value) || 8192 : e.target.value.trim()
                          try {
                            await ipc('settings:save', { [key]: value })
                            addToast({ type: 'success', title: `${label} updated`, message: 'Restart AI to apply changes' })
                          } catch (err) {
                            addToast({ type: 'error', title: 'Failed', message: String(err) })
                          }
                        }}
                      />
                    </Field>
                  ))}
                </>
              )}

              {settings?.aiProvider === 'ollama' && (
                <>
                  <Field label="Ollama Endpoint">
                    <input
                      className="input"
                      placeholder="http://localhost:11434"
                      defaultValue={settings?.ollamaEndpoint ?? 'http://localhost:11434'}
                      onBlur={async (e) => {
                        try {
                          await ipc('settings:save', { ollamaEndpoint: e.target.value })
                          addToast({ type: 'success', title: 'Endpoint updated' })
                        } catch (err) {
                          addToast({ type: 'error', title: 'Failed', message: String(err) })
                        }
                      }}
                    />
                  </Field>

                  <Field label="Ollama Model">
                    <input
                      className="input"
            placeholder="gemma4:cloud"
            defaultValue={settings?.ollamaModel ?? 'gemma4:cloud'}
                      onBlur={async (e) => {
                        try {
                          await ipc('settings:save', { ollamaModel: e.target.value })
                          addToast({ type: 'success', title: 'Model updated' })
                        } catch (err) {
                          addToast({ type: 'error', title: 'Failed', message: String(err) })
                        }
                      }}
                    />
                  </Field>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enable-thinking"
                      checked={settings?.enableThinkingModels ?? false}
                      onChange={async (e) => {
                        try {
                          const newSettings = await ipc('settings:save', { enableThinkingModels: e.target.checked })
                          setSettings({ ...settings, ...newSettings })
                          addToast({ type: 'success', title: 'Thinking models ' + (e.target.checked ? 'enabled' : 'disabled') })
                        } catch (err) {
                          addToast({ type: 'error', title: 'Failed', message: String(err) })
                        }
                      }}
                    />
                    <label htmlFor="enable-thinking" className="text-sm text-slate-700">
                      Enable thinking models for complex reasoning
                    </label>
                  </div>

                  {settings?.enableThinkingModels && (
                    <Field label="Thinking Model">
                      <input
                        className="input"
                        placeholder="deepseek-r1:7b"
                        defaultValue={settings?.thinkingModel ?? ''}
                        onBlur={async (e) => {
                          try {
                            const newSettings = await ipc('settings:save', { thinkingModel: e.target.value })
                            setSettings({ ...settings, ...newSettings })
                            addToast({ type: 'success', title: 'Thinking model updated' })
                          } catch (err) {
                            addToast({ type: 'error', title: 'Failed', message: String(err) })
                          }
                        }}
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
          </div>

          {/* GPU Settings */}
          {sysInfo?.hasGPU && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Cpu size={15} /> GPU Acceleration
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {sysInfo.gpuName ? `Detected: ${sysInfo.gpuName}` : 'GPU detected'}
                <br />
                Offload model layers to GPU for faster inference. Higher values = faster but more VRAM usage.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-700 w-32">GPU Layers:</label>
                  <input
                    type="range"
                    min="-1"
                    max="33"
                    step="1"
                    defaultValue={settings?.gpuLayers ?? -1}
                    className="flex-1"
                    onChange={async (e) => {
                      const layers = parseInt(e.target.value)
                      const valueLabel = document.getElementById('gpu-layers-value')
                      if (valueLabel) {
                        valueLabel.textContent = layers === -1 ? 'Auto' : layers === 0 ? '0 (CPU)' : `${layers}`
                      }
                      try {
                        await ipc('settings:save', { gpuLayers: layers })
                        addToast({ 
                          type: 'success', 
                          title: 'GPU settings updated',
                          message: layers === -1 ? 'Auto-detect mode' : layers === 0 ? 'CPU only mode' : `${layers} layers on GPU`
                        })
                      } catch (err) {
                        addToast({ type: 'error', title: 'Failed to update', message: String(err) })
                      }
                    }}
                  />
                  <span className="text-sm text-slate-600 w-24 text-right" id="gpu-layers-value">
                    {settings?.gpuLayers === -1 ? 'Auto' : settings?.gpuLayers === 0 ? '0 (CPU)' : settings?.gpuLayers ?? 'Auto'}
                  </span>
                </div>
                <div className="flex gap-2 text-xs">
                  <button className="px-2 py-1 bg-slate-100 rounded hover:bg-slate-200" onClick={async () => {
                    try {
                      await ipc('settings:save', { gpuLayers: -1 })
                      addToast({ type: 'info', title: 'Auto-detect mode' })
                    } catch (err) {
                      addToast({ type: 'error', title: 'Failed', message: String(err) })
                    }
                  }}>Auto (-1)</button>
                  <button className="px-2 py-1 bg-slate-100 rounded hover:bg-slate-200" onClick={async () => {
                    try {
                      await ipc('settings:save', { gpuLayers: 0 })
                      addToast({ type: 'info', title: 'CPU only mode' })
                    } catch (err) {
                      addToast({ type: 'error', title: 'Failed', message: String(err) })
                    }
                  }}>CPU Only (0)</button>
                  <button className="px-2 py-1 bg-slate-100 rounded hover:bg-slate-200" onClick={async () => {
                    try {
                      await ipc('settings:save', { gpuLayers: 16 })
                      addToast({ type: 'success', title: 'Balanced GPU mode' })
                    } catch (err) {
                      addToast({ type: 'error', title: 'Failed', message: String(err) })
                    }
                  }}>Balanced (16)</button>
                  <button className="px-2 py-1 bg-slate-100 rounded hover:bg-slate-200" onClick={async () => {
                    try {
                      await ipc('settings:save', { gpuLayers: 33 })
                      addToast({ type: 'success', title: 'Full GPU mode' })
                    } catch (err) {
                      addToast({ type: 'error', title: 'Failed', message: String(err) })
                    }
                  }}>Full GPU (33)</button>
                </div>
                <p className="text-xs text-slate-400">
                  ⚠️ Changing GPU settings will restart the AI model (takes ~30 seconds). Auto mode detects GPU and uses full offloading if available.
                </p>
              </div>
            </div>
          )}

          {/* Installed models */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-700">Available Models</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Place .gguf model files in your models directory. Kairos selects the best one for your RAM.
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              {models.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">No model info available</div>
              ) : models.map(m => (
                <div key={m.id} className={cn(
                  'p-4 flex items-center gap-3',
                  m.installed ? 'bg-white' : 'bg-slate-50/50 opacity-70'
                )}>
                  <div className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    m.installed ? 'bg-success' : 'bg-slate-300'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.filename}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge label={`${m.sizeGB} GB`} color="slate" />
                      <Badge label={`${m.minRAMGB}+ GB RAM`} color="slate" />
                      <Badge label={m.quality} color={m.quality === 'best' ? 'green' : m.quality === 'balanced' ? 'blue' : 'slate'} />
                    </div>
                  </div>
                  <Badge label={m.installed ? 'Installed' : 'Not installed'} color={m.installed ? 'green' : 'slate'} />
                </div>
              ))}
            </div>
          </div>

          {sysInfo && (
            <div className="card p-4 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">System RAM</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.round(((sysInfo.totalRAMGB - sysInfo.freeRAMGB) / sysInfo.totalRAMGB) * 100)}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-600 flex-shrink-0">
                  {sysInfo.freeRAMGB} GB free / {sysInfo.totalRAMGB} GB total
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BACKUP TAB */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <HardDrive size={15} /> Local Backup
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Create a full backup of all lessons, exams, students, and scores.
              Store on USB drive or external disk for safety.
            </p>
            <button className="btn-primary" onClick={handleBackup}>
              <Download size={14} /> Create Backup Now
            </button>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Upload size={15} /> USB / LAN Sync
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Export your data to share with other teachers or sync between devices.
              Kairos works without internet.
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={async () => {
                try {
                  const path = await ipc('sync:export', {
                    includeLessons: true,
                    includeExams: true,
                    includeStudents: true,
                    includeScores: true,
                    encrypt: false
                  })
                  addToast({ type: 'success', title: 'Sync package exported', message: path })
                  ipc('file:open-path', path.split('/').slice(0, -1).join('/'))
                } catch (err) {
                  addToast({ type: 'error', title: 'Export failed', message: String(err) })
                }
              }}>
                <Download size={14} /> Export Sync Package
              </button>
              <button className="btn-secondary" onClick={async () => {
                const paths = await ipc('file:open-dialog', {
                  title: 'Import Kairos Backup',
                  filters: [{ name: 'Kairos Backup', extensions: ['kbak', 'json'] }]
                })
                if (!paths?.length) return
                try {
                  const result = await ipc('sync:import', paths[0])
                  addToast({
                    type: 'success',
                    title: 'Import complete',
                    message: `${result.imported.lessons} lessons, ${result.imported.students} students`
                  })
                } catch (err) {
                  addToast({ type: 'error', title: 'Import failed', message: String(err) })
                }
              }}>
                <Upload size={14} /> Import Backup
              </button>
            </div>
          </div>

          <div className="card p-5 bg-amber-50 border-amber-100">
            <h3 className="font-semibold text-amber-700 mb-2 flex items-center gap-2">
              <Shield size={15} /> Data Privacy
            </h3>
            <p className="text-sm text-amber-700">
              All your data is stored <strong>locally on this device only</strong>.
              Nothing is sent to the internet. Your students' data stays private.
              Kairos uses llama.cpp to run AI models completely offline.
            </p>
          </div>
        </div>
      )}

      {/* SYSTEM TAB */}
      {activeTab === 'system' && sysInfo && (
        <div className="space-y-4">
          {/* Theme Settings */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Settings size={15} /> Appearance
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Customize the look and feel of Kairos
            </p>
            <Field label="Theme">
              <Select
                value={theme}
                onChange={(v) => {
                  setTheme(v as 'light' | 'dark' | 'high-contrast')
                  addToast({ type: 'success', title: 'Theme changed', message: `Switched to ${v} theme` })
                }}
                options={[
                  { value: 'light', label: '☀️ Light' },
                  { value: 'dark', label: '🌙 Dark' },
                  { value: 'high-contrast', label: '🔲 High Contrast' }
                ]}
              />
            </Field>
          </div>

          <div className="card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {[
                { label: 'App Version', value: sysInfo.appVersion },
                { label: 'Platform', value: `${sysInfo.platform} (${sysInfo.arch})` },
                { label: 'CPU Cores', value: String(sysInfo.cpuCount) },
                { label: 'Total RAM', value: `${sysInfo.totalRAMGB} GB` },
                { label: 'Free RAM', value: `${sysInfo.freeRAMGB} GB` },
                { label: 'AI Model', value: sysInfo.modelLoaded },
                { label: 'Database', value: sysInfo.dbPath },
                { label: 'Data Folder', value: sysInfo.dataPath },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-slate-500">{row.label}</p>
                  <p className="text-sm font-medium text-slate-700 font-mono text-right max-w-xs truncate">{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => ipc('file:open-path', sysInfo.dataPath)}>
              <HardDrive size={13} /> Open Data Folder
            </button>
            <button className="btn-secondary btn-sm" onClick={() => ipc('file:open-path', sysInfo.dbPath.split('/').slice(0, -1).join('/'))}>
              <FileText size={13} /> Open DB Folder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
