// src/preload/index.ts
// Secure contextBridge exposing typed IPC to the renderer

import { contextBridge, ipcRenderer } from 'electron'

// Expose typed IPC methods
const api = {
  // Invoke (request/response)
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  // Listen for events from main process
  on: (channel: string, callback: (...args: any[]) => void) => {
    const listener = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    // Return cleanup function
    return () => ipcRenderer.removeListener(channel, listener)
  },

  // One-time listener
  once: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  },

  // Remove a listener
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },

  // Platform info
  platform: process.platform,
  version: process.env.npm_package_version ?? '1.0.0'
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', api)
} else {
  // @ts-ignore
  window.electron = api
}

export type ElectronAPI = typeof api
