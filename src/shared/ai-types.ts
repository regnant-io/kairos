// src/shared/ai-types.ts
// AI/LLM request and response types

import type { LessonPlan, ExamPaper, ReportComment, WeaknessReport } from './db-types'
import type { SheetLayout } from './omr-layout'

// ─── INPUT PARAMS ─────────────────────────────────────────────────

export interface LessonParams {
  subject: string
  topic: string
  subtopic?: string
  classLevel: string
  durationMins: number
  language: 'en' | 'sw' | 'bilingual'
  teachingStyle?: 'discussion' | 'demonstration' | 'discovery' | 'lecture'
  availableResources?: string[]
  priorKnowledge?: string
}

export interface ExamParams {
  subject: string
  topics: string[]
  classLevel: string
  sourceDocId?: string
  examType: 'quiz' | 'cat' | 'midterm' | 'final' | 'necta_mock'
  questionTypes: {
    multipleChoice?: number
    trueOrFalse?: number
    shortAnswer?: number
    structuredEssay?: number
    fillInTheBlank?: number
    matching?: number
  }
  totalMarks: number
  durationMins: number
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  language: 'en' | 'sw' | 'bilingual'
  nectaStyle: boolean
}

export interface MarkingParams {
  examId: string
  studentId: string
  questionId: string
  studentAnswer: string
  markingScheme: {
    expectedAnswer: string
    markingPoints: string[]
    totalMarks: number
  }
  strictness: 'lenient' | 'standard' | 'strict'
}

export interface ReportParams {
  studentId: string
  studentName: string
  subject: string
  term: string
  year: number
  scores: {
    exams: { name: string; score: number; maxScore: number }[]
    classAverage: number
    rank?: number
    totalStudents?: number
  }
  attendance?: { present: number; total: number }
  behaviorNotes?: string[]
  tone: 'formal' | 'warm' | 'direct'
  length: 'brief' | 'standard' | 'detailed'
}

export interface BatchReportJob {
  classLevel: string
  subject: string
  term: string
  year: number
  students: ReportParams[]
}

// ─── MARKING RESULT ───────────────────────────────────────────────

export interface MarkingResult {
  questionId: string
  suggestedScore: number
  maxScore: number
  confidence: 'high' | 'medium' | 'low'
  pointsAwarded: string[]
  pointsMissed: string[]
  errorTypes: {
    type: 'factual' | 'conceptual' | 'calculation' | 'expression'
    description: string
  }[]
  feedbackForStudent: string
  teacherNote: string
}

// ─── AI STATUS ────────────────────────────────────────────────────

export type AIStatus = 'loading' | 'ready' | 'generating' | 'error' | 'offline'

export interface AIStatusInfo {
  status: AIStatus
  model: string
  contextSize: number
  tokensGenerated?: number
  currentJob?: string
  error?: string
}

// ─── STREAM EVENTS ────────────────────────────────────────────────

export interface StreamJob {
  jobId: string
  feature: 'lesson' | 'exam' | 'marking' | 'report' | 'weakness'
  startedAt: number
}

// ─── MODEL CONFIG ─────────────────────────────────────────────────

export type FeatureKey = 'lesson' | 'exam' | 'marking' | 'report' | 'batch_marking' | 'weakness'

export interface ModelConfig {
  id: string
  name: string
  filename: string
  sizeGB: number
  minRAMGB: number
  quality: 'fast' | 'balanced' | 'best'
  contextLen: number
  bestFor: FeatureKey[]
  quantization: 'Q4_K_M' | 'Q5_K_M' | 'Q8_0' | 'F16'
  installed: boolean
}

export const SUPPORTED_MODELS: Omit<ModelConfig, 'installed'>[] = [
  {
    id: 'llama3.2-3b-q4',
    name: 'Llama 3.2 3B (Fast)',
    filename: 'llama-3.2-3b-instruct-q4_k_m.gguf',
    sizeGB: 2.2,
    minRAMGB: 4,
    quality: 'fast',
    contextLen: 4096,
    bestFor: ['lesson', 'report', 'batch_marking'],
    quantization: 'Q4_K_M'
  },
  {
    id: 'llama3.1-8b-q4',
    name: 'Llama 3.1 8B (Balanced)',
    filename: 'llama-3.1-8b-instruct-q4_k_m.gguf',
    sizeGB: 4.7,
    minRAMGB: 6,
    quality: 'balanced',
    contextLen: 8192,
    bestFor: ['exam', 'marking'],
    quantization: 'Q4_K_M'
  },
  {
    id: 'phi3.5-mini-q4',
    name: 'Phi-3.5 Mini (Low RAM)',
    filename: 'phi-3.5-mini-instruct-q4.gguf',
    sizeGB: 2.2,
    minRAMGB: 3,
    quality: 'fast',
    contextLen: 4096,
    bestFor: ['report', 'lesson'],
    quantization: 'Q4_K_M'
  }
]

// ─── EXPORT ───────────────────────────────────────────────────────

/** Printable OMR answer-sheet payload (Req 1.6, 1.7, 2.1). */
export interface AnswerSheetContent {
  layout: SheetLayout
  qrDataUrl: string
  exam: { title: string; subject: string; classLevel: string }
  studentName?: string
}

export interface ExportPayload {
  type: 'lesson' | 'exam' | 'report' | 'marking_scheme' | 'answer_sheet'
  title: string
  content: LessonPlan | ExamPaper | ReportComment[] | string | AnswerSheetContent
  template: 'plain' | 'school_letterhead' | 'necta_style'
  includeMarkingScheme?: boolean
  schoolName?: string
  teacherName?: string
}

export interface ParsedDocument {
  id: string
  filename: string
  fileType: 'pdf' | 'docx' | 'image'
  extractedText: string
  pageCount?: number
  wordCount: number
}
