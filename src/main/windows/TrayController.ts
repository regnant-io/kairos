import { app, BrowserWindow, Menu, nativeImage, Notification, Tray } from 'electron'
import { join } from 'path'

let tray: Tray | null = null
let hasShownBackgroundNotice = false

export function createAppTray(getWindow: () => BrowserWindow | null, quit: () => void): Tray {
  const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, iconName)
    : join(process.cwd(), 'resources', iconName)
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) throw new Error(`Tray icon could not be loaded: ${iconPath}`)

  tray = new Tray(icon)
  tray.setToolTip('Kairos')

  const openWindow = () => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Kairos', click: openWindow },
    { type: 'separator' },
    { label: 'Quit Kairos', click: quit }
  ]))
  tray.on('double-click', openWindow)
  if (process.platform !== 'darwin') tray.on('click', openWindow)
  return tray
}

export function notifyBackground(): void {
  if (hasShownBackgroundNotice || !tray) return
  hasShownBackgroundNotice = true

  const title = 'Kairos is still running'
  const body = 'Open it from the tray. Choose Quit Kairos there to exit.'
  try {
    if (process.platform === 'win32') {
      tray.displayBalloon({ title, content: body, iconType: 'info' })
    } else if (Notification.isSupported()) {
      new Notification({ title, body, silent: true }).show()
    }
  } catch (error) {
    console.warn('[Kairos] Background notification unavailable:', error)
  }
}

export function destroyAppTray(): void {
  tray?.destroy()
  tray = null
}
