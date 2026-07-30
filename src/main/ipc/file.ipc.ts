// src/main/ipc/file.ipc.ts
// File operations: parse docs, export PDF/DOCX, backup/restore

import type { IpcMain } from 'electron'
import { dialog, shell, app } from 'electron'
import { join } from 'path'
import { mkdirSync, copyFileSync, existsSync } from 'fs'
import type { DatabaseService } from '../services/DatabaseService'
import type { LlamaService } from '../services/LlamaService'
import { DocumentService } from '../services/DocumentService'
import { ExportService } from '../services/ExportService'
import type { OpenDialogOptions, SaveDialogOptions } from '../../shared/ipc-types'
import type { ExportPayload } from '../../shared/ai-types'

const docService = new DocumentService()
const exportService = new ExportService()

export function registerFileHandlers(ipc: IpcMain, db: DatabaseService, llama: LlamaService): void {

  // ── Document Parsing ──────────────────────────────────────────
  ipc.handle('file:parse-document', async (_e, filePath: string) => {
    const parsed = await docService.parseDocument(filePath)

    // Copy file to app uploads dir
    const teacher = db.getTeacher()
    if (teacher) {
      const uploadsDir = join(app.getPath('userData'), 'uploads')
      mkdirSync(uploadsDir, { recursive: true })
      const destPath = join(uploadsDir, `${parsed.id}-${parsed.filename}`)
      if (existsSync(filePath)) {
        copyFileSync(filePath, destPath)
      }
      db.saveDocument({
        teacherId: teacher.id,
        filename: parsed.filename,
        fileType: parsed.fileType,
        filePath: destPath,
        extractedText: parsed.extractedText,
        purpose: 'exam_source'
      })
    }

    return parsed
  })

  // ── Export ────────────────────────────────────────────────────
  ipc.handle('file:export-pdf', async (_e, payload: ExportPayload) => {
    return exportService.exportToPDF(payload)
  })

  ipc.handle('file:export-docx', async (_e, payload: ExportPayload) => {
    return exportService.exportToDOCX(payload)
  })

  // ── File Dialogs ──────────────────────────────────────────────
  ipc.handle('file:open-dialog', async (_e, options: OpenDialogOptions) => {
    const result = await dialog.showOpenDialog({
      title: options.title,
      filters: options.filters,
      properties: [
        'openFile',
        ...(options.multiSelections ? ['multiSelections' as const] : [])
      ]
    })
    return result.filePaths
  })

  ipc.handle('file:save-dialog', async (_e, options: SaveDialogOptions) => {
    const result = await dialog.showSaveDialog({
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters
    })
    return result.filePath ?? null
  })

  ipc.handle('file:open-path', (_e, filePath: string) => {
    shell.openPath(filePath)
  })

  // ── Backup ────────────────────────────────────────────────────
  ipc.handle('file:backup-create', () => {
    const backupsDir = join(app.getPath('userData'), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = join(backupsDir, `kairos-backup-${timestamp}.db`)
    const dbPath = db.getDbPath()
    copyFileSync(dbPath, backupPath)
    return backupPath
  })

  ipc.handle('file:backup-restore', (_e, backupPath: string) => {
    if (!existsSync(backupPath)) throw new Error('Backup file not found')
    const dbPath = db.getDbPath()
    copyFileSync(backupPath, dbPath)
    // App restart required to reload DB
  })

  // ── System Info ───────────────────────────────────────────────
  ipc.handle('settings:get-system-info', () => {
    const os = require('os')
    
    // Detect GPU (basic detection via Vulkan backend loading)
    const hasGPU = llama.getLlamaServerPath() ? true : false  // Simplified for now
    
    return {
      platform: process.platform,
      arch: process.arch,
      totalRAMGB: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
      freeRAMGB: Math.round(os.freemem() / (1024 ** 3) * 10) / 10,
      cpuCount: os.cpus().length,
      appVersion: app.getVersion(),
      modelLoaded: 'llama-3.2-3b-instruct-q4_k_m',
      dbPath: db.getDbPath(),
      dataPath: app.getPath('userData'),
      hasGPU,
      gpuName: hasGPU ? 'Vulkan-compatible GPU' : undefined
    }
  })

  ipc.handle('settings:get-models', () => {
    return llama.getInstalledModels()
  })

  ipc.handle('settings:get-ollama-models', async () => {
    return await llama.getOllamaModels()
  })
}
