// src/main/app.ts
// Electron app lifecycle — startup, shutdown, IPC registration

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DatabaseService } from './services/DatabaseService'
import { LlamaService } from './services/LlamaService'
import { registerAIHandlers } from './ipc/ai.ipc'
import { registerDBHandlers } from './ipc/db.ipc'
import { registerFileHandlers } from './ipc/file.ipc'
import { registerSyncHandlers } from './ipc/sync.ipc'
import { registerOMRHandlers } from './ipc/omr.ipc'
import { createMainWindow } from './windows/MainWindow'
import { createAppTray, destroyAppTray, notifyBackground } from './windows/TrayController'
import { existsSync, readFileSync } from 'fs'

// Singletons
export let mainWindow: BrowserWindow | null = null
export const db = new DatabaseService()
export const llama = new LlamaService()
let hasTray = false
let isQuitting = false
let shutdownComplete = false
let shutdownStarted = false

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function attachWindow(window: BrowserWindow): void {
  mainWindow = window
  window.on('ready-to-show', () => { if (!isQuitting) window.show() })
  window.on('maximize', () => window.webContents.send('window:maximized-change', true))
  window.on('unmaximize', () => window.webContents.send('window:maximized-change', false))
  window.on('close', event => {
    if (isQuitting || !hasTray) return
    event.preventDefault()
    window.hide()
    notifyBackground()
  })
  window.on('closed', () => { if (mainWindow === window) mainWindow = null })
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

/**
 * Load the TIE curriculum JSON from bundled assets and seed it into the DB.
 * Dev: <cwd>/assets/curriculum; Prod: <resources>/curriculum (see electron-builder.yml).
 */
function seedCurriculum(): void {
  const candidates = [
    join(process.cwd(), 'assets', 'curriculum', 'tz-curriculum.json'),
    join(process.resourcesPath ?? '', 'curriculum', 'tz-curriculum.json')
  ]
  const path = candidates.find(p => p && existsSync(p))
  if (!path) {
    console.warn('[Kairos] Curriculum asset not found, skipping seed')
    return
  }
  const topics = JSON.parse(readFileSync(path, 'utf-8'))
  if (Array.isArray(topics) && topics.length > 0) {
    db.seedCurriculum(topics)
    console.log(`[Kairos] Curriculum seeded (${topics.length} topics) from ${path}`)
  }
}

async function bootstrap(): Promise<void> {
  // Electron setup
  electronApp.setAppUserModelId('com.kairos.education')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database first (synchronous, fast)
  try {
    await db.initialize()
    console.log('[Kairos] Database initialized')
  } catch (err) {
    console.error('[Kairos] Database init failed:', err)
    dialog.showErrorBox('Database Error', `Failed to initialize database:\n${err}`)
    app.quit()
    return
  }

  // Seed the TIE curriculum from bundled assets (idempotent — INSERT OR IGNORE)
  try {
    seedCurriculum()
  } catch (err) {
    console.warn('[Kairos] Curriculum seed skipped:', err)
  }

  // Register all IPC handlers
  registerAIHandlers(ipcMain, db, llama)
  registerDBHandlers(ipcMain, db, llama)
  registerFileHandlers(ipcMain, db, llama)
  registerSyncHandlers(ipcMain, db)
  registerOMRHandlers(ipcMain, db)

  ipcMain.handle('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.handle('window:toggle-maximize', event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })
  ipcMain.handle('window:is-maximized', event => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)
  ipcMain.handle('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close())

  // Create the main window
  attachWindow(createMainWindow())
  try {
    createAppTray(() => mainWindow, () => {
      isQuitting = true
      app.quit()
    })
    hasTray = true
  } catch (error) {
    console.error('[Kairos] Tray unavailable:', error)
  }

  // Load AI provider settings from database before starting llama server
  try {
    const aiProvider = db.getSetting('aiProvider')
    const ollamaEndpoint = db.getSetting('ollamaEndpoint')
    const ollamaModel = db.getSetting('ollamaModel')
    const enableThinkingModels = db.getSetting('enableThinkingModels')
    const thinkingModel = db.getSetting('thinkingModel')
    const gpuLayersSetting = db.getSetting('gpuLayers')

    if (aiProvider) {
      llama.setProvider(JSON.parse(aiProvider))
      console.log(`[Kairos] AI provider set to ${JSON.parse(aiProvider)}`)
    }

    if (ollamaEndpoint) {
      llama.setOllamaEndpoint(JSON.parse(ollamaEndpoint))
      console.log(`[Kairos] Ollama endpoint set to ${JSON.parse(ollamaEndpoint)}`)
    }

    if (ollamaModel) {
      llama.setOllamaModel(JSON.parse(ollamaModel))
      console.log(`[Kairos] Ollama model set to ${JSON.parse(ollamaModel)}`)
    }

    const cordonSetting = (key: string) => {
      const raw = db.getSetting(key)
      return raw ? JSON.parse(raw) : undefined
    }
    llama.setCordon({
      endpoint: cordonSetting('cordonEndpoint'),
      clientId: cordonSetting('cordonClientId'),
      model: cordonSetting('cordonModel'),
      contextSize: cordonSetting('cordonContextSize')
    })

    if (enableThinkingModels && thinkingModel) {
      llama.setThinkingModel(
        JSON.parse(thinkingModel),
        JSON.parse(enableThinkingModels)
      )
      console.log(`[Kairos] Thinking model enabled: ${JSON.parse(thinkingModel)}`)
    }

    if (gpuLayersSetting !== null) {
      const layers = JSON.parse(gpuLayersSetting)
      llama.setGPULayers(layers)
      console.log(`[Kairos] GPU layers set to ${layers}`)
    } else {
      // Default to 28 layers for good GPU performance (balanced)
      llama.setGPULayers(28)
      db.setSetting('gpuLayers', JSON.stringify(28))
      console.log('[Kairos] GPU layers defaulted to 28 (balanced)')
    }
  } catch (err) {
    console.warn('[Kairos] Failed to load AI settings:', err)
  }

  // Start llama.cpp server (non-blocking — app is usable while it loads)
  llama.start().then(() => {
    console.log('[Kairos] LLM server ready')
    mainWindow?.webContents.send('ai:status-change', llama.getStatus())
  }).catch((err) => {
    console.error('[Kairos] LLM server failed to start:', err)
    mainWindow?.webContents.send('ai:status-change', {
      status: 'error',
      model: 'none',
      contextSize: 0,
      error: String(err)
    })
  })

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) attachWindow(createMainWindow())
    else showMainWindow()
  })
}

app.whenReady().then(bootstrap)

app.on('window-all-closed', () => {
  if (!hasTray && process.platform !== 'darwin') app.quit()
})

app.on('before-quit', event => {
  isQuitting = true
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
  void llama.stop().catch(error => {
    console.error('[Kairos] Could not stop the model cleanly:', error)
  }).finally(() => {
    shutdownComplete = true
    app.quit()
  })
})

app.on('will-quit', destroyAppTray)

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}
