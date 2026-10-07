// src/main/ipc/db.ipc.ts
// Database CRUD IPC handlers

import type { IpcMain } from 'electron'
import type { DatabaseService } from '../services/DatabaseService'
import type { LlamaService } from '../services/LlamaService'
import type { LessonPlan, Student } from '../../shared/db-types'
import type { LessonParams } from '../../shared/ai-types'

export function registerDBHandlers(ipc: IpcMain, db: DatabaseService, llama: LlamaService): void {

  // ── Teacher ────────────────────────────────────────────────────
  ipc.handle('db:get-teacher', () => db.getTeacher())
  ipc.handle('db:save-teacher', (_e, data) => db.saveTeacher(data))
  ipc.handle('db:update-teacher', (_e, updates) => db.updateTeacher(updates))

  // ── Lessons ────────────────────────────────────────────────────
  ipc.handle('db:save-lesson', (_e, { plan, params }: { plan: LessonPlan; params: LessonParams }) => {
    const teacher = db.getTeacher()
    if (!teacher) throw new Error('No teacher profile')
    return db.saveLesson(plan, teacher.id, params.language)
  })

  ipc.handle('db:get-lessons', (_e, filters) => {
    const teacher = db.getTeacher()
    if (!teacher) return []
    return db.getLessons(teacher.id, filters)
  })

  ipc.handle('db:get-lesson', (_e, id: string) => db.getLesson(id))

  ipc.handle('db:delete-lesson', (_e, id: string) => db.deleteLesson(id))

  ipc.handle('db:star-lesson', (_e, id: string, starred: boolean) => db.starLesson(id, starred))

  // ── Exams ──────────────────────────────────────────────────────
  ipc.handle('db:save-exam', (_e, paper) => {
    const teacher = db.getTeacher()
    if (!teacher) throw new Error('No teacher profile')
    return db.saveExam(paper, teacher.id)
  })

  ipc.handle('db:get-exams', (_e, filters) => {
    const teacher = db.getTeacher()
    if (!teacher) return []
    return db.getExams(teacher.id, filters)
  })

  ipc.handle('db:get-exam', (_e, id: string) => db.getExam(id))

  ipc.handle('db:delete-exam', (_e, id: string) => db.deleteExam(id))

  ipc.handle('db:star-exam', (_e, id: string, starred: boolean) => {
    db['db'].prepare('UPDATE exams SET is_starred = ? WHERE id = ?').run(starred ? 1 : 0, id)
  })

  // ── Students ────────────────────────────────────────────────────
  ipc.handle('db:save-student', (_e, student) => {
    const teacher = db.getTeacher()
    if (!teacher) throw new Error('No teacher profile')
    return db.saveStudent({ ...student, teacherId: teacher.id })
  })

  ipc.handle('db:get-students', (_e, classLevel?: string) => {
    const teacher = db.getTeacher()
    if (!teacher) return []
    return db.getStudents(teacher.id, classLevel)
  })

  ipc.handle('db:import-students', (_e, students) => {
    const teacher = db.getTeacher()
    if (!teacher) throw new Error('No teacher profile')
    return db.importStudents(students, teacher.id)
  })

  ipc.handle('db:delete-student', (_e, id: string) => db.deleteStudent(id))

  // ── Scores ────────────────────────────────────────────────────
  ipc.handle('db:save-score', (_e, score) => db.saveScore(score))
  ipc.handle('db:get-scores', (_e, examId: string) => db.getScores(examId))
  ipc.handle('db:get-student-scores', (_e, studentId: string) => db.getStudentScores(studentId))

  ipc.handle('db:get-weakness-data', (_e, classLevel: string, subject?: string) => {
    const teacher = db.getTeacher()
    if (!teacher) return null
    return db.getWeaknessData(teacher.id, classLevel, subject)
  })

  // ── Reports ───────────────────────────────────────────────────
  ipc.handle('db:save-report', (_e, report) => db.saveReport(report))

  ipc.handle('db:get-reports', (_e, filters) => {
    const teacher = db.getTeacher()
    if (!teacher) return []
    return db.getReports(teacher.id, filters)
  })

  ipc.handle('db:finalize-report', (_e, id: string) => {
    db['db'].prepare('UPDATE report_comments SET is_finalized = 1 WHERE id = ?').run(id)
  })

  // ── Analytics ─────────────────────────────────────────────────
  ipc.handle('db:get-analytics', () => {
    const teacher = db.getTeacher()
    if (!teacher) return null
    return db.getAnalytics(teacher.id)
  })

  // ── Settings ──────────────────────────────────────────────────
  ipc.handle('settings:get', () => {
    const settings: Record<string, any> = {}
    const keys = ['language', 'theme', 'modelId', 'llamaPort', 'llamaThreads',
      'pinEnabled', 'lockAfterMins', 'schoolName', 'exportPath', 'autoBackup', 'gpuLayers',
      'aiProvider', 'ollamaEndpoint', 'ollamaModel', 'thinkingModel', 'enableThinkingModels']
    for (const key of keys) {
      const val = db.getSetting(key)
      if (val !== null) {
        try { settings[key] = JSON.parse(val) } catch { settings[key] = val }
      }
    }
    return {
      language: 'en', theme: 'light', modelId: 'llama3.2-3b-q4',
      llamaPort: 11434, llamaThreads: 4, pinEnabled: false, lockAfterMins: 30,
      exportPath: '', autoBackup: true, backupIntervalDays: 7,
      aiProvider: 'llamacpp',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3.2:3b',
      enableThinkingModels: false,
      cordonEndpoint: 'http://127.0.0.1:8443',
      cordonClientId: 'kairos',
      cordonModel: 'default',
      cordonContextSize: 8192,
      useGPU: llama.getGPULayers() > 0,
      gpuLayers: llama.getGPULayers(),
      ...settings
    }
  })

  ipc.handle('settings:save', async (_e, updates: Record<string, any>) => {
    // Handle AI provider changes
    if (updates.aiProvider) {
      llama.setProvider(updates.aiProvider)
      db.setSetting('aiProvider', JSON.stringify(updates.aiProvider))
    }
    
    // Handle Ollama settings
    if (updates.ollamaEndpoint) {
      llama.setOllamaEndpoint(updates.ollamaEndpoint)
      db.setSetting('ollamaEndpoint', JSON.stringify(updates.ollamaEndpoint))
    }
    
    if (updates.ollamaModel) {
      llama.setOllamaModel(updates.ollamaModel)
      db.setSetting('ollamaModel', JSON.stringify(updates.ollamaModel))
    }
    
    // Cordon (Regnant) node settings
    const cordonKeys = ['cordonEndpoint', 'cordonClientId', 'cordonModel', 'cordonContextSize'] as const
    if (cordonKeys.some(k => updates[k] !== undefined)) {
      for (const k of cordonKeys) {
        if (updates[k] !== undefined) db.setSetting(k, JSON.stringify(updates[k]))
      }
      llama.setCordon({
        endpoint: updates.cordonEndpoint,
        clientId: updates.cordonClientId,
        model: updates.cordonModel,
        contextSize: updates.cordonContextSize !== undefined ? Number(updates.cordonContextSize) : undefined
      })
    }

    if (updates.thinkingModel !== undefined || updates.enableThinkingModels !== undefined) {
      const currentThinkingModel = updates.thinkingModel !== undefined 
        ? updates.thinkingModel 
        : JSON.parse(db.getSetting('thinkingModel') || 'null')
      const currentEnabled = updates.enableThinkingModels !== undefined
        ? updates.enableThinkingModels
        : JSON.parse(db.getSetting('enableThinkingModels') || 'false')
      
      llama.setThinkingModel(currentThinkingModel, currentEnabled)
      
      if (updates.thinkingModel !== undefined) {
        db.setSetting('thinkingModel', JSON.stringify(updates.thinkingModel))
      }
      if (updates.enableThinkingModels !== undefined) {
        db.setSetting('enableThinkingModels', JSON.stringify(updates.enableThinkingModels))
      }
    }
    
    // Handle GPU settings specially
    if (typeof updates.gpuLayers === 'number') {
      llama.setGPULayers(updates.gpuLayers)
      db.setSetting('gpuLayers', JSON.stringify(updates.gpuLayers))
      // Restart llama server to apply GPU settings
      await llama.restart()
    }
    
    // Save other settings to database
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'gpuLayers') {  // Already handled above
        db.setSetting(key, JSON.stringify(value))
      }
    }
    return updates
  })
}
