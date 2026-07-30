// src/shared/db-types.ts
// All database entity types shared between main and renderer processes

export interface Teacher {
  id: string
  name: string
  email?: string
  schoolId?: string
  schoolName?: string
  subjects: string[]         // JSON stored in DB
  classLevels: string[]      // JSON stored in DB
  languagePref: 'en' | 'sw' | 'bilingual'
  pin?: string               // Hashed
  createdAt: number
  updatedAt: number
}

// ─── LESSONS ────────────────────────────────────────────────────────

export interface LessonObjective {
  knowledge: string[]
  skills: string[]
  attitudes: string[]
}

export interface LessonTimePlan {
  phase: 'Introduction' | 'Development' | 'Conclusion'
  duration: number
  teacherActivity: string
  studentActivity: string
  resources: string[]
}

export interface LessonContent {
  mainPoints: string[]
  examples: string[]
  localContext: string
  commonMisconceptions: string[]
}

export interface LessonActivity {
  name: string
  description: string
  duration: number
}

export interface LessonAssessment {
  formative: string[]
  summative: string
}

export interface LessonReferences {
  textbook: string
  additional: string[]
}

export interface LessonPlan {
  id: string
  subject: string
  topic: string
  subtopic?: string
  classLevel: string
  durationMins: number
  language: 'en' | 'sw' | 'bilingual'
  objectives: LessonObjective
  competencies: string[]
  timePlan: LessonTimePlan[]
  content: LessonContent
  teachingActivities: LessonActivity[]
  homework: { task: string; objectives: string }
  assessment: LessonAssessment
  teachingNotes: string
  materials: string[]
  references: LessonReferences
}

export interface Lesson {
  id: string
  teacherId: string
  subject: string
  topic: string
  subtopic?: string
  classLevel: string
  durationMins: number
  language: 'en' | 'sw' | 'bilingual'
  content: LessonPlan
  isStarred: boolean
  tags: string[]
  createdAt: number
  updatedAt: number
}

// ─── EXAMS ────────────────────────────────────────────────────────

export type QuestionType =
  | 'multiple_choice'
  | 'true_or_false'
  | 'short_answer'
  | 'structured_essay'
  | 'fill_in_the_blank'
  | 'matching'

export type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyse' | 'evaluate' | 'create'

export interface QuestionOption {
  label: string
  text: string
}

export interface Question {
  id: string
  number: number
  type: QuestionType
  text: string
  marks: number
  options?: QuestionOption[]
  expectedAnswer: string
  markingGuide: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic: string
  bloomsLevel: BloomsLevel
  hint?: string
}

export interface ExamSection {
  name: string
  instructions: string
  questions: Question[]
  marks: number
}

export interface MarkingSchemeEntry {
  questionId: string
  fullAnswer: string
  markingPoints: string[]
  marksBreakdown: string
}

export interface ExamPaper {
  id: string
  title: string
  subject: string
  classLevel: string
  examType: 'quiz' | 'cat' | 'midterm' | 'final' | 'necta_mock'
  duration: number
  totalMarks: number
  instructions: string[]
  sections: ExamSection[]
  markingScheme: MarkingSchemeEntry[]
  language: 'en' | 'sw' | 'bilingual'
  nectaStyle: boolean
  generatedAt: string
}

export interface Exam {
  id: string
  teacherId: string
  title: string
  subject: string
  classLevel: string
  examType: 'quiz' | 'cat' | 'midterm' | 'final' | 'necta_mock'
  topics: string[]
  durationMins: number
  /** Alias of durationMins, kept for compatibility with the ExamPaper shape used in the preview/export UI */
  duration: number
  totalMarks: number
  instructions: string
  /** Flattened question list, kept for backward compatibility */
  questions: Question[]
  /** Section structure (name, instructions, per-section marks, questions) used by the preview and export UI */
  sections: ExamSection[]
  markingScheme: MarkingSchemeEntry[]
  language: 'en' | 'sw' | 'bilingual'
  sourceDocId?: string
  isStarred: boolean
  createdAt: number
  updatedAt: number
}

// ─── STUDENTS ──────────────────────────────────────────────────────

export interface Student {
  id: string
  teacherId: string
  name: string
  regNumber?: string
  classLevel: string
  stream?: string
  gender?: 'M' | 'F'
  isActive: boolean
  createdAt: number
}

// ─── SCORES ────────────────────────────────────────────────────────

export interface QuestionScore {
  questionId: string
  score: number
  maxScore: number
}

export interface AIFeedback {
  suggestedScore: number
  confidence: 'high' | 'medium' | 'low'
  pointsAwarded: string[]
  pointsMissed: string[]
  feedbackForStudent: string
  teacherNote: string
}

export interface Score {
  id: string
  studentId: string
  examId: string
  teacherId: string
  rawScore: number
  maxScore: number
  percentage: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  questionScores: QuestionScore[]
  aiFeedback?: AIFeedback
  teacherComment?: string
  markedAt: number
  createdAt: number
}

// ─── MARKING SESSIONS ─────────────────────────────────────────────

export interface MarkingSession {
  id: string
  teacherId: string
  examId: string
  status: 'in_progress' | 'completed'
  totalScripts: number
  markedCount: number
  classAvg?: number
  classWeaknesses?: WeaknessReport
  createdAt: number
  completedAt?: number
}

// ─── REPORT COMMENTS ──────────────────────────────────────────────

export interface ReportComment {
  id: string
  teacherId: string
  studentId: string
  term: string
  year: number
  commentText: string
  strengths: string[]
  areasForGrowth: string[]
  recommendation: string
  aiGenerated: boolean
  isFinalized: boolean
  createdAt: number
  updatedAt: number
}

// ─── WEAKNESS DETECTION ───────────────────────────────────────────

export interface TopicPerformance {
  topic: string
  avgScore: number
  attempts: number
  nectaWeight: number
  trend: 'improving' | 'declining' | 'stable'
}

export interface StudentWeaknessProfile {
  studentId: string
  studentName: string
  weakTopics: TopicPerformance[]
  strongTopics: TopicPerformance[]
  overallAvg: number
  trend: 'improving' | 'declining' | 'stable'
  nectaReadiness: number   // 0-100 score
  recommendedActions: string[]
}

export interface WeaknessReport {
  classLevel: string
  subject: string
  weakestTopics: TopicPerformance[]
  strongestTopics: TopicPerformance[]
  studentsAtRisk: { id: string; name: string; avgScore: number; weakestTopic: string }[]
  classAverage: number
  examReadinessScore: number
  suggestedFocusAreas: TopicPerformance[]
  actionableInsights: string[]
}

// ─── UPLOADED DOCUMENTS ───────────────────────────────────────────

export interface UploadedDocument {
  id: string
  teacherId: string
  filename: string
  fileType: 'pdf' | 'docx' | 'image'
  filePath: string
  extractedText?: string
  embeddingId?: string
  purpose: 'exam_source' | 'notes' | 'past_paper'
  createdAt: number
}

// ─── ANALYTICS ────────────────────────────────────────────────────

export interface WeeklyStats {
  lessonsGenerated: number
  examsCreated: number
  studentsMarked: number
  reportsWritten: number
  hoursEstimatedSaved: number
}

export interface LocalAnalytics {
  weeklyStats: WeeklyStats
  topSubjects: string[]
  mostUsedFeature: string
  totalLessons: number
  totalExams: number
  totalStudents: number
  totalReports: number
}

// ─── CURRICULUM ───────────────────────────────────────────────────

export interface CurriculumTopic {
  id: string
  subject: string
  classLevel: string
  chapter: number
  topic: string
  subtopics: string[]
  nectaWeight: number
  keywords: string[]
  textbookRef: string
}

// ─── SYNC ─────────────────────────────────────────────────────────

export interface KairosSyncPackage {
  version: string
  exportedAt: number
  exportedBy: string
  schoolId?: string
  encrypted: boolean
  iv?: string
  payload: {
    teachers: Teacher[]
    lessons: Lesson[]
    exams: Exam[]
    students: Student[]
    scores: Score[]
  }
}

// ─── GRADING ──────────────────────────────────────────────────────

export function getGrade(percentage: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (percentage >= 80) return 'A'
  if (percentage >= 60) return 'B'
  if (percentage >= 45) return 'C'
  if (percentage >= 30) return 'D'
  return 'F'
}

export const GRADE_COLORS = {
  A: '#27AE60',
  B: '#2ECC71',
  C: '#F39C12',
  D: '#E67E22',
  F: '#E74C3C'
}

export const SUBJECTS = [
  'Biology',
  'Chemistry',
  'Physics',
  'Mathematics',
  'English',
  'Kiswahili',
  'Geography',
  'History',
  'Civics',
  'Commerce',
  'Bookkeeping',
  'Agriculture',
  'Computer Studies',
  'French',
  'Arabic'
]

export const CLASS_LEVELS = [
  'Form 1',
  'Form 2',
  'Form 3',
  'Form 4',
  'Form 5',
  'Form 6'
]

export const EXAM_TYPES = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'cat', label: 'Continuous Assessment Test (CAT)' },
  { value: 'midterm', label: 'Mid-Term Examination' },
  { value: 'final', label: 'End of Term Examination' },
  { value: 'necta_mock', label: 'NECTA Mock Examination' }
]
