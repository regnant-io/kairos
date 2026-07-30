// src/main/ipc/sync.ipc.ts
// USB/LAN sync: export and import Kairos backup packages

import type { IpcMain } from 'electron'
import { createWriteStream, createReadStream, readFileSync, writeFileSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { DatabaseService } from '../services/DatabaseService'
import type { KairosSyncPackage } from '../../shared/db-types'
import type { SyncExportOptions, SyncImportResult } from '../../shared/ipc-types'

export function registerSyncHandlers(ipc: IpcMain, db: DatabaseService): void {

  ipc.handle('sync:export', async (_e, options: SyncExportOptions): Promise<string> => {
    const teacher = db.getTeacher()
    if (!teacher) throw new Error('No teacher profile')

    const payload: KairosSyncPackage['payload'] = {
      teachers: [teacher],
      lessons: options.includeLessons ? db.getLessons(teacher.id) : [],
      exams: options.includeExams ? db.getExams(teacher.id) : [],
      students: options.includeStudents ? db.getStudents(teacher.id) : [],
      scores: options.includeScores ? [] : [] // complex — skipping for now
    }

    const pkg: KairosSyncPackage = {
      version: '1.0.0',
      exportedAt: Date.now(),
      exportedBy: teacher.id,
      encrypted: options.encrypt,
      payload
    }

    let data = JSON.stringify(pkg)

    if (options.encrypt && options.password) {
      const iv = randomBytes(16)
      const key = scryptSync(options.password, 'kairos-salt', 32)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      data = JSON.stringify({
        encrypted: true,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('base64')
      })
    }

    const { app } = require('electron')
    const { join } = require('path')
    const { mkdirSync } = require('fs')
    const backupsDir = join(app.getPath('userData'), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const outPath = join(backupsDir, `kairos-sync-${ts}.kbak`)
    writeFileSync(outPath, data, 'utf-8')
    return outPath
  })

  ipc.handle('sync:import', async (_e, filePath: string): Promise<SyncImportResult> => {
    let raw = readFileSync(filePath, 'utf-8')
    let parsed: any = JSON.parse(raw)

    // Handle encrypted package
    if (parsed.encrypted && parsed.iv && parsed.data) {
      throw new Error('Encrypted backup — password required. Decryption UI not yet implemented.')
    }

    const pkg = parsed as KairosSyncPackage
    const teacher = db.getTeacher()
    const result: SyncImportResult = {
      success: true,
      imported: { lessons: 0, exams: 0, students: 0, scores: 0 },
      errors: []
    }

    try {
      // Import lessons
      for (const lesson of pkg.payload.lessons ?? []) {
        try {
          db.saveLesson(lesson.content, teacher?.id ?? lesson.teacherId, lesson.language)
          result.imported.lessons++
        } catch (e) {
          result.errors.push(`Lesson ${lesson.id}: ${e}`)
        }
      }

      // Import students
      for (const student of pkg.payload.students ?? []) {
        try {
          db.saveStudent({ ...student, teacherId: teacher?.id ?? student.teacherId })
          result.imported.students++
        } catch (e) {
          result.errors.push(`Student ${student.name}: ${e}`)
        }
      }
    } catch (err) {
      result.success = false
      result.errors.push(String(err))
    }

    return result
  })
}
