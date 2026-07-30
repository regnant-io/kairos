// src/shared/ipc-types.ts
// Type-safe IPC channel definitions

import type {
  Lesson, LessonPlan, Exam, ExamPaper, Student, Score,
  ReportComment, WeaknessReport, UploadedDocument,
  LocalAnalytics, Teacher, KairosSyncPackage
} from './db-types'

import type {
  LessonParams, ExamParams, MarkingParams, ReportParams,
  BatchReportJob, MarkingResult, AIStatusInfo, ParsedDocument,
  ExportPayload, ModelConfig
} from './ai-types'

import type {
  OmrSheet, OmrAuditRecord,
  GenerateSheetRequest, GenerateSheetResult, FinalizeResult
} from './omr-types'

// All invoke channels (request/response)
export interface KairosInvokeChannels {
  // ── AI Operations ─────────────────────────────────────────────
  'ai:generate-lesson': (params: LessonParams) => LessonPlan
  'ai:generate-exam': (params: ExamParams) => ExamPaper
  'ai:mark-script': (params: MarkingParams) => MarkingResult
  'ai:generate-report': (params: ReportParams) => ReportComment
  'ai:batch-reports': (job: BatchReportJob) => { jobId: string }
  'ai:analyze-weakness': (teacherId: string, classLevel: string, subject: string) => WeaknessReport
  'ai:chat': (message: string, conversationHistory?: Array<{role: string, content: string}>, jobId?: string) => string
  'ai:get-status': () => AIStatusInfo
  'ai:cancel-job': (jobId: string) => boolean
  'ai:restart': () => void

  // ── Database: Teacher ─────────────────────────────────────────
  'db:get-teacher': () => Teacher | null
  'db:save-teacher': (teacher: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'>) => Teacher
  'db:update-teacher': (updates: Partial<Teacher>) => Teacher

  // ── Database: Lessons ─────────────────────────────────────────
  'db:save-lesson': (lesson: { plan: LessonPlan; params: LessonParams }) => Lesson
  'db:get-lessons': (filters?: { subject?: string; classLevel?: string; search?: string }) => Lesson[]
  'db:get-lesson': (id: string) => Lesson | null
  'db:update-lesson': (id: string, updates: Partial<Lesson>) => Lesson
  'db:delete-lesson': (id: string) => void
  'db:star-lesson': (id: string, starred: boolean) => void

  // ── Database: Exams ───────────────────────────────────────────
  'db:save-exam': (exam: ExamPaper) => Exam
  'db:get-exams': (filters?: { subject?: string; classLevel?: string }) => Exam[]
  'db:get-exam': (id: string) => Exam | null
  'db:delete-exam': (id: string) => void
  'db:star-exam': (id: string, starred: boolean) => void

  // ── Database: Students ────────────────────────────────────────
  'db:save-student': (student: Omit<Student, 'id' | 'createdAt'>) => Student
  'db:get-students': (classLevel?: string) => Student[]
  'db:import-students': (students: Omit<Student, 'id' | 'createdAt' | 'teacherId'>[]) => number
  'db:delete-student': (id: string) => void

  // ── Database: Scores ──────────────────────────────────────────
  'db:save-score': (score: Omit<Score, 'id' | 'createdAt'>) => Score
  'db:get-scores': (examId: string) => Score[]
  'db:get-student-scores': (studentId: string) => Score[]
  'db:get-weakness-data': (classLevel: string, subject?: string) => WeaknessReport | null

  // ── Database: Reports ─────────────────────────────────────────
  'db:save-report': (report: Omit<ReportComment, 'id' | 'createdAt' | 'updatedAt'>) => ReportComment
  'db:get-reports': (filters?: { classLevel?: string; term?: string; year?: number }) => ReportComment[]
  'db:finalize-report': (id: string) => void

  // ── Analytics ─────────────────────────────────────────────────
  'db:get-analytics': () => LocalAnalytics

  // ── File Operations ───────────────────────────────────────────
  'file:parse-document': (filePath: string) => ParsedDocument
  'file:export-pdf': (payload: ExportPayload) => string
  'file:export-docx': (payload: ExportPayload) => string
  'file:backup-create': () => string
  'file:backup-restore': (backupPath: string) => void
  'file:open-dialog': (options: OpenDialogOptions) => string[]
  'file:save-dialog': (options: SaveDialogOptions) => string | null
  'file:open-path': (filePath: string) => void

  // ── Sync ──────────────────────────────────────────────────────
  'sync:export': (options: SyncExportOptions) => string
  'sync:import': (filePath: string) => SyncImportResult

  // ── OMR / QR Auto-Marking ─────────────────────────────────────
  'omr:generate-sheet': (req: GenerateSheetRequest) => GenerateSheetResult
  'omr:process-images': (req: { examHint?: string; filePaths: string[] }) => { batchId: string }
  'omr:get-batch': (batchId: string) => OmrSheet[]
  'omr:assign': (req: { sheetId: string; examId?: string; studentId?: string }) => OmrSheet
  'omr:recompute': (req: { sheetId: string; overrides: Record<string, string[]> }) => OmrSheet
  'omr:finalize': (req: { sheetId: string; confirmReplace?: boolean }) => FinalizeResult
  'omr:finalize-batch': (req: { sheetIds: string[]; confirmReplace?: boolean }) => FinalizeResult[]
  'omr:get-audit': (scoreId: string) => OmrAuditRecord | null

  // ── Settings ──────────────────────────────────────────────────
  'settings:get': () => AppSettings
  'settings:save': (settings: Partial<AppSettings>) => AppSettings
  'settings:get-models': () => ModelConfig[]
  'settings:get-ollama-models': () => Promise<string[]>
  'settings:get-system-info': () => SystemInfo
}

// One-way events from main to renderer
export interface KairosEventChannels {
  'ai:stream-start': { jobId: string; feature: string }
  'ai:stream-chunk': { jobId: string; chunk: string }
  'ai:stream-end': { jobId: string; result: string; feature?: string }
  'ai:stream-error': { jobId: string; error: string }
  'ai:batch-progress': { jobId: string; done: number; total: number; current: string }
  'ai:status-change': AIStatusInfo
  'omr:batch-progress': { batchId: string; done: number; total: number; current: string }
  'sync:progress': { step: string; percent: number }
  'update:available': { version: string; releaseNotes: string }
}

// ── Supporting types ─────────────────────────────────────────────

export interface OpenDialogOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  multiSelections?: boolean
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

export interface SyncExportOptions {
  includeStudents: boolean
  includeLessons: boolean
  includeExams: boolean
  includeScores: boolean
  encrypt: boolean
  password?: string
}

export interface SyncImportResult {
  success: boolean
  imported: {
    lessons: number
    exams: number
    students: number
    scores: number
  }
  errors: string[]
}

export interface AppSettings {
  teacherId?: string
  language: 'en' | 'sw' | 'bilingual'
  theme: 'light' | 'dark' | 'system'
  modelId: string
  llamaPort: number
  llamaThreads: number
  // AI Provider settings
  aiProvider: 'llamacpp' | 'ollama'
  ollamaEndpoint: string
  ollamaModel: string
  enableThinkingModels: boolean
  thinkingModel?: string
  // GPU settings
  useGPU: boolean
  gpuLayers: number  // Number of layers to offload to GPU (0 = CPU only, -1 = auto, 33 = full GPU)
  pinEnabled: boolean
  pinHash?: string
  lockAfterMins: number
  schoolName?: string
  schoolLogo?: string
  exportPath: string
  autoBackup: boolean
  backupIntervalDays: number
}

export interface SystemInfo {
  platform: string
  arch: string
  totalRAMGB: number
  freeRAMGB: number
  cpuCount: number
  appVersion: string
  modelLoaded: string
  dbPath: string
  dataPath: string
  hasGPU: boolean
  gpuName?: string
}
