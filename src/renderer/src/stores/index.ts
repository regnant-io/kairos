// src/renderer/src/stores/index.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Teacher, Lesson, Exam, Student } from '@shared/db-types'
import type { AIStatusInfo } from '@shared/ai-types'
import type { AppSettings } from '@shared/ipc-types'
import type {
  OmrSheet, OmrAuditRecord,
  GenerateSheetRequest, GenerateSheetResult, FinalizeResult
} from '@shared/omr-types'
import { ipc, onEvent } from '../hooks/useIPC'

// ── AI Store ──────────────────────────────────────────────────────

interface AIState {
  status: AIStatusInfo
  streamingText: string
  isStreaming: boolean
  currentJobId: string | null
  currentFeature: string | null  // Track which feature is generating (lesson, exam, report, etc.)
  setStatus: (s: AIStatusInfo) => void
  appendChunk: (chunk: string) => void
  startStream: (jobId: string, feature?: string) => void
  endStream: () => void
  resetStream: () => void
}

export const useAIStore = create<AIState>((set) => ({
  status: { status: 'loading', model: 'initializing', contextSize: 0 },
  streamingText: '',
  isStreaming: false,
  currentJobId: null,
  currentFeature: null,

  setStatus: (status) => set({ status }),
  appendChunk: (chunk) => set((s) => ({ streamingText: s.streamingText + chunk })),
  startStream: (jobId, feature) => set({ isStreaming: true, currentJobId: jobId, streamingText: '', currentFeature: feature ?? null }),
  endStream: () => set({ isStreaming: false }),
  resetStream: () => set({ streamingText: '', isStreaming: false, currentJobId: null, currentFeature: null })
}))

// ── Teacher / Session Store ────────────────────────────────────────

interface TeacherState {
  teacher: Teacher | null
  settings: AppSettings | null
  isOnboarded: boolean
  setTeacher: (t: Teacher | null) => void
  setSettings: (s: AppSettings) => void
  setOnboarded: (v: boolean) => void
}

export const useTeacherStore = create<TeacherState>()(
  persist(
    (set) => ({
      teacher: null,
      settings: null,
      isOnboarded: false,
      setTeacher: (teacher) => set({ teacher }),
      setSettings: (settings) => set({ settings }),
      setOnboarded: (isOnboarded) => set({ isOnboarded })
    }),
    {
      name: 'kairos-teacher',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

// ── UI Store ──────────────────────────────────────────────────────

interface UIState {
  sidebarCollapsed: boolean
  activeModal: string | null
  toasts: Toast[]
  theme: 'light' | 'dark' | 'high-contrast'
  setSidebarCollapsed: (v: boolean) => void
  openModal: (id: string) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setTheme: (theme: 'light' | 'dark' | 'high-contrast') => void
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number
}

// Detect system theme preference
function getSystemTheme(): 'light' | 'dark' | 'high-contrast' {
  if (typeof window === 'undefined') return 'light'
  
  // Check if user prefers dark mode
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  
  // Check if user prefers high contrast
  if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) {
    return 'high-contrast'
  }
  
  return 'light'
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeModal: null,
      toasts: [],
      theme: getSystemTheme(), // Default to system theme

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      openModal: (id) => set({ activeModal: id }),
      closeModal: () => set({ activeModal: null }),
      setTheme: (theme) => set({ theme }),

      addToast: (toast) => {
        const id = Math.random().toString(36).slice(2)
        set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
        const duration = toast.duration ?? 4000
        if (duration > 0) {
          setTimeout(() => {
            set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }))
          }, duration)
        }
      },

      removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }),
    {
      name: 'kairos-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }) // Only persist theme
    }
  )
)

// ── Lesson Store ───────────────────────────────────────────────────

interface LessonState {
  lessons: Lesson[]
  currentLesson: Lesson | null
  setLessons: (ls: Lesson[]) => void
  setCurrentLesson: (l: Lesson | null) => void
  addLesson: (l: Lesson) => void
  removeLesson: (id: string) => void
}

export const useLessonStore = create<LessonState>((set) => ({
  lessons: [],
  currentLesson: null,
  setLessons: (lessons) => set({ lessons }),
  setCurrentLesson: (currentLesson) => set({ currentLesson }),
  addLesson: (l) => set((s) => ({ lessons: [l, ...s.lessons] })),
  removeLesson: (id) => set((s) => ({ lessons: s.lessons.filter(x => x.id !== id) }))
}))

// ── Exam Store ────────────────────────────────────────────────────

interface ExamState {
  exams: Exam[]
  currentExam: Exam | null
  setExams: (es: Exam[]) => void
  setCurrentExam: (e: Exam | null) => void
  addExam: (e: Exam) => void
  removeExam: (id: string) => void
}

export const useExamStore = create<ExamState>()(
  persist(
    (set) => ({
      exams: [],
      currentExam: null,
      setExams: (exams) => set({ exams }),
      setCurrentExam: (currentExam) => set({ currentExam }),
      addExam: (e) => set((s) => ({ exams: [e, ...s.exams] })),
      removeExam: (id) => set((s) => ({ exams: s.exams.filter(x => x.id !== id) }))
    }),
    {
      name: 'kairos-exam',
      storage: createJSONStorage(() => localStorage),
      // Only persist the actively-viewed exam across refreshes; the list
      // itself is re-fetched from the database on mount.
      partialize: (s) => ({ currentExam: s.currentExam })
    }
  )
)

// ── AI Chat Store ────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  timestamp: number
  error?: boolean
  cancelled?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  setMessages: (m: ChatMessage[]) => void
  addMessage: (m: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  removeMessage: (id: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      setMessages: (messages) => set({ messages }),
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      updateMessage: (id, updates) => set((s) => ({
        messages: s.messages.map(m => m.id === id ? { ...m, ...updates } : m)
      })),
      removeMessage: (id) => set((s) => ({ messages: s.messages.filter(m => m.id !== id) })),
      clearMessages: () => set({ messages: [] })
    }),
    {
      name: 'kairos-chat',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

// ── Student Store ─────────────────────────────────────────────────

interface StudentState {
  students: Student[]
  selectedClassLevel: string
  setStudents: (ss: Student[]) => void
  setSelectedClassLevel: (cl: string) => void
  addStudent: (s: Student) => void
}

export const useStudentStore = create<StudentState>((set) => ({
  students: [],
  selectedClassLevel: '',
  setStudents: (students) => set({ students }),
  setSelectedClassLevel: (selectedClassLevel) => set({ selectedClassLevel }),
  addStudent: (s) => set((st) => ({ students: [...st.students, s] }))
}))

// ── OMR Store ─────────────────────────────────────────────────────
// Holds batch/sheet state for the OMR + QR auto-marking Review Interface.
// Subscribes to `omr:batch-progress` (Req 3.3) and exposes actions that call
// the `omr:*` IPC channels through the typed `ipc()` helper. The store simply
// holds sheet data (including per-sheet/per-answer confidence and flags) so the
// Review Interface can render low-confidence flags (Req 10.1, 10.2); flag logic
// itself lives in the deterministic engine, not here.

interface BatchProgress {
  done: number
  total: number
  current: string
}

interface OmrState {
  // State
  batchId: string | null
  sheets: OmrSheet[]
  progress: BatchProgress
  selectedSheetId: string | null
  isProcessing: boolean
  isLoading: boolean
  isFinalizing: boolean

  // Local state setters
  setSelectedSheet: (id: string | null) => void
  reset: () => void
  _applyProgress: (p: BatchProgress) => void

  // Actions calling the omr:* channels
  generateSheet: (req: GenerateSheetRequest) => Promise<GenerateSheetResult>
  processImages: (req: { examHint?: string; filePaths: string[] }) => Promise<string>
  getBatch: (batchId: string) => Promise<OmrSheet[]>
  refreshBatch: () => Promise<OmrSheet[]>
  assign: (req: { sheetId: string; examId?: string; studentId?: string }) => Promise<OmrSheet>
  recompute: (req: { sheetId: string; overrides: Record<string, string[]> }) => Promise<OmrSheet>
  finalize: (req: { sheetId: string; confirmReplace?: boolean }) => Promise<FinalizeResult>
  finalizeBatch: (req: { sheetIds: string[]; confirmReplace?: boolean }) => Promise<FinalizeResult[]>
  getAudit: (scoreId: string) => Promise<OmrAuditRecord | null>
}

const EMPTY_PROGRESS: BatchProgress = { done: 0, total: 0, current: '' }

export const useOmrStore = create<OmrState>((set, get) => ({
  batchId: null,
  sheets: [],
  progress: EMPTY_PROGRESS,
  selectedSheetId: null,
  isProcessing: false,
  isLoading: false,
  isFinalizing: false,

  setSelectedSheet: (selectedSheetId) => set({ selectedSheetId }),

  reset: () => set({
    batchId: null,
    sheets: [],
    progress: EMPTY_PROGRESS,
    selectedSheetId: null,
    isProcessing: false,
    isLoading: false,
    isFinalizing: false
  }),

  _applyProgress: (progress) => {
    set({ progress })
    // When the batch finishes, refetch the sheets so the Review Interface
    // shows the fully-processed results (Req 3.3).
    if (progress.total > 0 && progress.done >= progress.total) {
      set({ isProcessing: false })
      void get().refreshBatch()
    }
  },

  generateSheet: (req) => ipc('omr:generate-sheet', req),

  processImages: async (req) => {
    set({ isProcessing: true, progress: { done: 0, total: req.filePaths.length, current: '' } })
    try {
      const { batchId } = await ipc('omr:process-images', req)
      set({ batchId, sheets: [], selectedSheetId: null })
      return batchId
    } catch (err) {
      set({ isProcessing: false })
      throw err
    }
  },

  getBatch: async (batchId) => {
    set({ isLoading: true })
    try {
      const sheets = await ipc('omr:get-batch', batchId)
      set({ batchId, sheets })
      return sheets
    } finally {
      set({ isLoading: false })
    }
  },

  refreshBatch: async () => {
    const { batchId } = get()
    if (!batchId) return []
    const sheets = await ipc('omr:get-batch', batchId)
    set({ sheets })
    return sheets
  },

  assign: async (req) => {
    const sheet = await ipc('omr:assign', req)
    set((s) => ({ sheets: s.sheets.map((x) => (x.id === sheet.id ? sheet : x)) }))
    return sheet
  },

  recompute: async (req) => {
    const sheet = await ipc('omr:recompute', req)
    set((s) => ({ sheets: s.sheets.map((x) => (x.id === sheet.id ? sheet : x)) }))
    return sheet
  },

  finalize: async (req) => {
    set({ isFinalizing: true })
    try {
      const result = await ipc('omr:finalize', req)
      if (result.ok) await get().refreshBatch()
      return result
    } finally {
      set({ isFinalizing: false })
    }
  },

  finalizeBatch: async (req) => {
    set({ isFinalizing: true })
    try {
      const results = await ipc('omr:finalize-batch', req)
      if (results.some((r) => r.ok)) await get().refreshBatch()
      return results
    } finally {
      set({ isFinalizing: false })
    }
  },

  getAudit: (scoreId) => ipc('omr:get-audit', scoreId)
}))

// Subscribe once to batch-progress events (Req 3.3). Only updates progress for
// the batch currently tracked by the store; refetches sheets on completion.
onEvent('omr:batch-progress', (data: { batchId: string; done: number; total: number; current: string }) => {
  const { batchId } = useOmrStore.getState()
  if (batchId && data.batchId !== batchId) return
  useOmrStore.getState()._applyProgress({ done: data.done, total: data.total, current: data.current })
})
