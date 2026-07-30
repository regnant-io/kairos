// src/main/ipc/ai.ipc.ts
// All AI-related IPC handlers: lesson, exam, marking, reports, weakness

import type { IpcMain, BrowserWindow } from 'electron'
import { BrowserWindow as BW } from 'electron'
import { v4 as uuid } from 'uuid'
import { jsonrepair } from 'jsonrepair'
import type { DatabaseService } from '../services/DatabaseService'
import type { LlamaService } from '../services/LlamaService'
import { PromptService } from '../services/PromptService'
import { DocumentService } from '../services/DocumentService'
import { ContextService } from '../services/ContextService'
import type {
  LessonParams, ExamParams, MarkingParams, ReportParams,
  BatchReportJob, MarkingResult
} from '../../shared/ai-types'
import type { LessonPlan, ExamPaper, ReportComment } from '../../shared/db-types'
import { getGrade } from '../../shared/db-types'

const promptService = new PromptService()
const docService = new DocumentService()

// Single concurrent slot for CPU inference
let aiQueue: any
let queueInitPromise: Promise<void>

// Initialize p-queue using dynamic import
async function initQueue(): Promise<void> {
  if (!queueInitPromise) {
    queueInitPromise = (async () => {
      const { default: PQueue } = await import('p-queue')
      aiQueue = new PQueue({ concurrency: 1 })
    })()
  }
  return queueInitPromise
}

function broadcast(event: string, data: any): void {
  BW.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send(event, data)
  })
}

function sendStatus(status: any): void {
  broadcast('ai:status-change', status)
}

export function registerAIHandlers(
  ipc: IpcMain,
  db: DatabaseService,
  llama: LlamaService
): void {

  // Initialize context service
  const contextService = new ContextService(db)

  // Forward status changes from llama to renderer
  llama.onStatusChange((status) => broadcast('ai:status-change', status))

  // ── AI Status ────────────────────────────────────────────────────

  ipc.handle('ai:get-status', () => llama.getStatus())

  ipc.handle('ai:restart', async () => {
    sendStatus({ status: 'loading', model: 'restarting', contextSize: 0 })
    await llama.restart()
    sendStatus(llama.getStatus())
  })

  ipc.handle('ai:cancel-job', (_e, jobId: string) => {
    // Genuinely abort the underlying HTTP request for this job so generation
    // actually stops server-side, instead of just telling the renderer it did
    // while the model kept generating in the background and the response
    // showed up anyway a few seconds later.
    const cancelled = llama.cancelJob(jobId)
    broadcast('ai:stream-error', { jobId, error: 'Cancelled by user', cancelled: true })
    sendStatus({ ...llama.getStatus(), status: 'ready' })
    return cancelled
  })

  // ── Lesson Plan Generation ───────────────────────────────────────

  ipc.handle('ai:generate-lesson', async (_e, params: LessonParams): Promise<LessonPlan> => {
    await initQueue()
    const jobId = uuid()
    const startedAt = Date.now()
    broadcast('ai:stream-start', { jobId, feature: 'lesson' })
    sendStatus({ ...llama.getStatus(), status: 'generating', currentJob: 'Lesson Plan' })

    return aiQueue.add(async () => {
      try {
        const curriculum = contextService.getCurriculumContext(
          params.subject, params.classLevel,
          [params.topic, params.subtopic].filter(Boolean) as string[]
        )
        const prompt = promptService.buildLessonPrompt(params, curriculum)
        let accumulated = ''

        const result = await llama.complete(prompt, {
          maxTokens: 3500,
          temperature: 0.3,
          jsonMode: true,
          stream: true,
          onChunk: (chunk) => {
            accumulated += chunk
            broadcast('ai:stream-chunk', { jobId, chunk })
          }
        })

        broadcast('ai:stream-end', { jobId, result, feature: 'lesson' })
        sendStatus({ ...llama.getStatus(), status: 'ready' })

        const plan = parseJSONFromAI<LessonPlan>(result || accumulated)
        plan.id = plan.id || uuid()
        return plan
      } catch (err) {
        broadcast('ai:stream-error', { jobId, error: String(err) })
        sendStatus({ ...llama.getStatus(), status: 'ready' })
        throw err
      }
    }) as Promise<LessonPlan>
  })

  // ── Exam Generation ──────────────────────────────────────────────

  ipc.handle('ai:generate-exam', async (_e, params: ExamParams): Promise<ExamPaper> => {
    await initQueue()
    const jobId = uuid()
    broadcast('ai:stream-start', { jobId, feature: 'exam' })
    sendStatus({ ...llama.getStatus(), status: 'generating', currentJob: 'Exam Paper' })

    return aiQueue.add(async () => {
      try {
        // If sourceDocId is set, load the stored extracted text and pull the
        // chunks most relevant to the requested topics so the exam is grounded
        // in the teacher's own material (past papers, notes, textbook scans).
        let docContext: string | undefined
        if (params.sourceDocId) {
          const doc = db.getDocument(params.sourceDocId)
          if (doc?.extractedText) {
            const query = [params.subject, ...params.topics].join(' ')
            docContext = docService.getRelevantChunks(doc.extractedText, query, 4)
          }
        }

        const curriculum = contextService.getCurriculumContext(
          params.subject, params.classLevel, params.topics
        )
        const prompt = promptService.buildExamPrompt(params, docContext, curriculum)
        let accumulated = ''

        const result = await llama.complete(prompt, {
          maxTokens: 10000,  // Increased for complex exams with multiple sections
          temperature: 0.25,
          jsonMode: true,
          stream: true,
          onChunk: (chunk) => {
            accumulated += chunk
            broadcast('ai:stream-chunk', { jobId, chunk })
          }
        })

        broadcast('ai:stream-end', { jobId, result, feature: 'exam' })
        sendStatus({ ...llama.getStatus(), status: 'ready' })

        const finalText = result || accumulated
        
        // Check if response seems truncated
        if (finalText.length > 5000 && !finalText.trim().endsWith('}')) {
          console.warn('[Exam] Response may be truncated, attempting to repair...')
        }

        const paper = parseJSONFromAI<ExamPaper>(finalText)
        paper.id = paper.id || uuid()
        
        // Validate that we have at least some questions
        if (!paper.sections || paper.sections.length === 0) {
          throw new Error('Generated exam has no sections. The response may have been truncated. Try reducing the number of questions or using a simpler exam structure.')
        }

        // Persist immediately so the exam is recorded even if the user
        // never clicks "Save" or the app is refreshed/closed right after
        // generation. The renderer's Save button remains available to
        // re-save after edits (e.g. starring), but nothing is lost by default.
        try {
          const teacher = db.getTeacher()
          if (teacher) db.saveExam(paper, teacher.id)
        } catch (saveErr) {
          console.error('[Exam] Auto-save failed:', saveErr)
        }

        return paper
      } catch (err) {
        broadcast('ai:stream-error', { jobId, error: String(err) })
        sendStatus({ ...llama.getStatus(), status: 'ready' })
        throw err
      }
    }) as Promise<ExamPaper>
  })

  // ── Marking ──────────────────────────────────────────────────────

  ipc.handle('ai:mark-script', async (_e, params: MarkingParams): Promise<MarkingResult> => {
    await initQueue()
    const jobId = uuid()
    sendStatus({ ...llama.getStatus(), status: 'generating', currentJob: 'Marking Script' })

    return aiQueue.add(async () => {
      try {
        const prompt = promptService.buildMarkingPrompt(params)
        const result = await llama.complete(prompt, {
          maxTokens: 800,
          temperature: 0.1,   // Very low temp for consistent marking
          jsonMode: true,
          stream: false
        })
        sendStatus({ ...llama.getStatus(), status: 'ready' })
        return parseJSONFromAI<MarkingResult>(result)
      } catch (err) {
        sendStatus({ ...llama.getStatus(), status: 'ready' })
        throw err
      }
    }) as Promise<MarkingResult>
  })

  // ── Report Comments ──────────────────────────────────────────────

  ipc.handle('ai:generate-report', async (_e, params: ReportParams): Promise<ReportComment> => {
    await initQueue()
    const jobId = uuid()
    broadcast('ai:stream-start', { jobId, feature: 'report' })
    sendStatus({ ...llama.getStatus(), status: 'generating', currentJob: 'Report Comment' })

    return aiQueue.add(async () => {
      try {
        const prompt = promptService.buildReportPrompt(params)
        let accumulated = ''

        const result = await llama.complete(prompt, {
          maxTokens: 600,
          temperature: 0.4,
          jsonMode: true,
          stream: true,
          onChunk: (chunk) => {
            accumulated += chunk
            broadcast('ai:stream-chunk', { jobId, chunk })
          }
        })

        broadcast('ai:stream-end', { jobId, result, feature: 'report' })
        sendStatus({ ...llama.getStatus(), status: 'ready' })

        const parsed = parseJSONFromAI<any>(result || accumulated)
        const teacher = db.getTeacher()

        return {
          id: uuid(),
          teacherId: teacher?.id ?? '',
          studentId: params.studentId,
          term: params.term,
          year: params.year,
          commentText: parsed.comment ?? '',
          strengths: parsed.strengths ?? [],
          areasForGrowth: parsed.areasForGrowth ?? [],
          recommendation: parsed.recommendation ?? '',
          aiGenerated: true,
          isFinalized: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      } catch (err) {
        broadcast('ai:stream-error', { jobId, error: String(err) })
        sendStatus({ ...llama.getStatus(), status: 'ready' })
        throw err
      }
    }) as Promise<ReportComment>
  })

  // ── Batch Reports ────────────────────────────────────────────────

  ipc.handle('ai:batch-reports', async (_e, job: BatchReportJob): Promise<{ jobId: string }> => {
    await initQueue()
    const batchJobId = uuid()
    const total = job.students.length

    // Run batch asynchronously (don't await — let it stream progress)
    ;(async () => {
      let done = 0
      for (const studentParams of job.students) {
        try {
          const prompt = promptService.buildReportPrompt(studentParams)
          const result = await aiQueue.add(() =>
            llama.complete(prompt, { maxTokens: 600, temperature: 0.4, jsonMode: true })
          ) as string

          const parsed = parseJSONFromAI<any>(result)
          const teacher = db.getTeacher()

          db.saveReport({
            teacherId: teacher?.id ?? '',
            studentId: studentParams.studentId,
            term: job.term,
            year: job.year,
            commentText: parsed.comment ?? '',
            strengths: parsed.strengths ?? [],
            areasForGrowth: parsed.areasForGrowth ?? [],
            recommendation: parsed.recommendation ?? '',
            aiGenerated: true,
            isFinalized: false
          })

          done++
          broadcast('ai:batch-progress', {
            jobId: batchJobId,
            done,
            total,
            current: studentParams.studentName
          })
        } catch (err) {
          console.error('[Batch] Failed for student:', studentParams.studentId, err)
          done++
        }
      }
      broadcast('ai:batch-progress', { jobId: batchJobId, done: total, total, current: 'Complete' })
      sendStatus({ ...llama.getStatus(), status: 'ready' })
    })()

    return { jobId: batchJobId }
  })

  // ── Weakness Analysis ─────────────────────────────────────────────

  ipc.handle('ai:analyze-weakness',
    async (_e, teacherId: string, classLevel: string, subject: string) => {
    await initQueue()
    const report = db.getWeaknessData(teacherId, classLevel, subject)
    if (!report) return null

    // Generate AI insights for the report
    const prompt = promptService.buildWeaknessInsightsPrompt(report)

    return aiQueue.add(async () => {
      try {
        const result = await llama.complete(prompt, { maxTokens: 600, temperature: 0.3, jsonMode: true })
        const insights = parseJSONFromAI<string[]>(result)
        report.actionableInsights = Array.isArray(insights) ? insights : []
        return report
      } catch {
        return report // return without AI insights if fails
      }
    })
  })

  // ── AI Chat ───────────────────────────────────────────────────────

  ipc.handle('ai:chat', async (_e, message: string, conversationHistory?: Array<{role: string, content: string}>, jobId?: string) => {
    await initQueue()
    const id = jobId || uuid()
    const signal = llama.beginJob(id)
    broadcast('ai:stream-start', { jobId: id, feature: 'chat' })
    sendStatus({ ...llama.getStatus(), status: 'generating', currentJob: 'Chat' })

    return aiQueue.add(async () => {
      try {
        // Get relevant context from database
        const relevantContext = await contextService.getRelevantContext(message)
        
        // Build conversation context
        let prompt = 'You are a helpful AI assistant for teachers in Tanzania. You help with lesson planning, exam creation, student assessment, and teaching strategies. You have access to the teacher\'s data and can provide personalized assistance.\n\n'
        
        // Add relevant context if available
        if (relevantContext) {
          prompt += `Context about this teacher:\n${relevantContext}\n\n`
        }
        
        if (conversationHistory && conversationHistory.length > 0) {
          prompt += 'Previous conversation:\n'
          conversationHistory.forEach(msg => {
            prompt += `${msg.role === 'user' ? 'Teacher' : 'Assistant'}: ${msg.content}\n`
          })
          prompt += '\n'
        }
        
        prompt += `Teacher: ${message}\nAssistant:`

        let accumulated = ''

        const result = await llama.complete(prompt, {
          maxTokens: 1500,
          temperature: 0.7,
          stream: true,
          signal,
          onChunk: (chunk) => {
            accumulated += chunk
            broadcast('ai:stream-chunk', { jobId: id, chunk })
          }
        })

        broadcast('ai:stream-end', { jobId: id, result: result || accumulated, feature: 'chat' })
        sendStatus({ ...llama.getStatus(), status: 'ready' })

        return result || accumulated
      } catch (err) {
        broadcast('ai:stream-error', { jobId: id, error: String(err) })
        sendStatus({ ...llama.getStatus(), status: 'ready' })
        throw err
      } finally {
        llama.endJob(id)
      }
    }) as Promise<string>
  })
}

// ── JSON Parser ────────────────────────────────────────────────────────────────

function parseJSONFromAI<T>(raw: string): T {
  if (!raw || !raw.trim()) {
    throw new Error('AI returned empty response')
  }

  let text = raw.trim()

  // Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  // Find the first { or [ — start of the JSON value. Discard any leading prose.
  const start = text.search(/[{\[]/)
  if (start === -1) {
    throw new Error(`No JSON found in AI response: ${text.slice(0, 200)}`)
  }
  const fromStart = text.slice(start)

  // Also prepare a "trimmed to last close" variant for the case where the model
  // appended trailing prose after a complete JSON value.
  const lastClose = Math.max(fromStart.lastIndexOf('}'), fromStart.lastIndexOf(']'))
  const trimmed = lastClose >= 0 ? fromStart.slice(0, lastClose + 1) : fromStart

  // Try strategies in order of fidelity. Crucially, jsonrepair is fed the FULL
  // remainder (not chopped at the last brace) so it can close truncated
  // structures and preserve the outer object even when generation was cut off.
  const candidates: Array<() => string> = [
    () => trimmed,                                   // already-valid JSON
    () => jsonrepair(fromStart),                     // repair full (handles truncation)
    () => jsonrepair(trimmed),                       // repair trailing-prose case
    () => jsonrepair(fixEscapeSequences(fromStart)), // repair after escape fixes
    () => repairJSON(trimmed),                       // legacy repairs
    () => aggressiveRepairJSON(trimmed)
  ]

  for (const build of candidates) {
    try {
      return JSON.parse(build())
    } catch { /* try next strategy */ }
  }

  throw new Error(`Failed to parse AI JSON. Raw: ${fromStart.slice(0, 500)}`)
}

function fixEscapeSequences(str: string): string {
  let fixed = str
  
  // Fix invalid escape sequences that commonly appear in AI output
  // Valid JSON escapes are: \" \\ \/ \b \f \n \r \t \uXXXX
  
  // First, protect valid escape sequences by temporarily replacing them
  const validEscapes: Array<[string, string]> = [
    ['\\"', '\x00QUOTE\x00'],
    ['\\\\', '\x00BACKSLASH\x00'],
    ['\\/', '\x00SLASH\x00'],
    ['\\b', '\x00BACKSPACE\x00'],
    ['\\f', '\x00FORMFEED\x00'],
    ['\\n', '\x00NEWLINE\x00'],
    ['\\r', '\x00RETURN\x00'],
    ['\\t', '\x00TAB\x00']
  ]
  
  // Protect valid escapes
  for (const [escape, placeholder] of validEscapes) {
    fixed = fixed.split(escape).join(placeholder)
  }
  
  // Now fix any remaining backslashes (these are invalid escapes)
  fixed = fixed.replace(/\\/g, '\\\\')
  
  // Restore valid escapes
  for (const [escape, placeholder] of validEscapes) {
    fixed = fixed.split(placeholder).join(escape)
  }
  
  return fixed
}

function aggressiveRepairJSON(str: string): string {
  let repaired = str
  
  // Apply standard repairs first
  repaired = repairJSON(repaired)
  
  // If still failing, try to salvage what we can
  // Find the last complete object or array element
  const lines = repaired.split('\n')
  let validLines: string[] = []
  let braceCount = 0
  let bracketCount = 0
  let inString = false
  let lastChar = ''
  
  for (const line of lines) {
    for (const char of line) {
      // Track if we're in a string (accounting for escapes)
      if (char === '"' && lastChar !== '\\') {
        inString = !inString
      }
      if (!inString) {
        if (char === '{') braceCount++
        if (char === '}') braceCount--
        if (char === '[') bracketCount++
        if (char === ']') bracketCount--
      }
      lastChar = char
    }
    
    validLines.push(line)
    
    // If we've closed all structures, stop here
    if (braceCount === 0 && bracketCount === 0 && validLines.length > 1) {
      break
    }
  }
  
  repaired = validLines.join('\n')
  
  // Final cleanup
  repaired = repaired.replace(/,\s*([}\]])/g, '$1')
  
  // Ensure all structures are closed
  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/\]/g) || []).length
  
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']'
  }
  
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}'
  }
  
  return repaired
}

function repairJSON(str: string): string {
  let repaired = str
  
  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1')
  
  // Handle incomplete strings - find unclosed quotes
  const quotes = repaired.match(/(?<!\\)"/g) || []  // Count unescaped quotes
  if (quotes.length % 2 === 1) {
    // Odd number of quotes means we have an unclosed string
    // Find the last unescaped quote and check what comes after
    const lastQuotePos = repaired.lastIndexOf('"')
    const afterQuote = repaired.slice(lastQuotePos + 1)
    
    // If there's content after the last quote that's not a valid JSON character
    if (afterQuote && !afterQuote.match(/^\s*[,}\]:]/)) {
      // We're in the middle of a string value, close it
      repaired = repaired.slice(0, lastQuotePos + 1) + '"'
    }
  }
  
  // Find incomplete key-value pairs (key: without value)
  const lastColon = repaired.lastIndexOf(':')
  const lastComma = repaired.lastIndexOf(',')
  const lastCloseBrace = repaired.lastIndexOf('}')
  const lastCloseBracket = repaired.lastIndexOf(']')
  
  // If we have a colon after the last comma/brace/bracket, we have an incomplete key-value
  if (lastColon > Math.max(lastComma, lastCloseBrace, lastCloseBracket)) {
    // Check what comes after the colon
    const afterColon = repaired.slice(lastColon + 1).trim()
    
    if (!afterColon || afterColon.match(/^[,}\]]/)) {
      // Empty value or just punctuation, remove the incomplete key-value pair
      const beforeColon = repaired.slice(0, lastColon)
      const lastQuoteBeforeColon = beforeColon.lastIndexOf('"')
      if (lastQuoteBeforeColon > 0) {
        const beforeKey = beforeColon.slice(0, lastQuoteBeforeColon)
        const prevChar = beforeKey.trimEnd().slice(-1)
        if (prevChar === ',') {
          repaired = beforeKey.trimEnd().slice(0, -1)
        } else if (prevChar === '{' || prevChar === '[') {
          repaired = beforeKey
        }
      }
    } else if (afterColon.startsWith('"') && !afterColon.slice(1).includes('"')) {
      // Incomplete string value, close it
      repaired = repaired + '"'
    } else if (afterColon.startsWith('[') && !afterColon.includes(']')) {
      // Incomplete array, close it
      repaired = repaired + ']'
    } else if (afterColon.startsWith('{') && !afterColon.includes('}')) {
      // Incomplete object, close it
      repaired = repaired + '}'
    } else if (afterColon.match(/^[0-9.-]+[^0-9.,}\]\s]/)) {
      // Incomplete number, truncate to valid number
      const numMatch = afterColon.match(/^[0-9.-]+/)
      if (numMatch) {
        repaired = repaired.slice(0, lastColon + 1) + numMatch[0]
      }
    }
  }
  
  // Remove any trailing incomplete array elements
  const lastOpenBracket = repaired.lastIndexOf('[')
  if (lastOpenBracket > lastCloseBracket) {
    const arrayContent = repaired.slice(lastOpenBracket + 1)
    // If array has incomplete content, try to clean it
    if (arrayContent && !arrayContent.trim().match(/^[\s,]*$/)) {
      const elements = arrayContent.split(',')
      const validElements = elements.filter(el => {
        const trimmed = el.trim()
        // Keep complete strings, numbers, booleans, objects, arrays
        return trimmed.match(/^"[^"]*"$/) || 
               trimmed.match(/^[0-9.-]+$/) || 
               trimmed.match(/^(true|false|null)$/) ||
               (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
               (trimmed.startsWith('[') && trimmed.endsWith(']'))
      })
      if (validElements.length > 0) {
        repaired = repaired.slice(0, lastOpenBracket + 1) + validElements.join(',')
      } else {
        repaired = repaired.slice(0, lastOpenBracket + 1)
      }
    }
  }
  
  // Count opening and closing braces/brackets
  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/\]/g) || []).length
  
  // Close any unclosed arrays
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']'
  }
  
  // Close any unclosed objects
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}'
  }
  
  return repaired
}
