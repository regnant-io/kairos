import React, { useEffect, useState } from 'react'
import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { ipc, onEvent } from '../../hooks/useIPC'

export function WindowChrome() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    ipc('window:is-maximized').then(setMaximized).catch(() => {})
    return onEvent('window:maximized-change', setMaximized)
  }, [])

  async function toggleMaximize() {
    setMaximized(await ipc('window:toggle-maximize'))
  }

  return <div className="operator-window-chrome">
    <div className="operator-window-drag" title="Drag to move the window">
      <span className="operator-window-mark">K</span>
      <span className="operator-window-name">KAIROS</span>
    </div>
    <div className="operator-window-controls">
      <button type="button" title="Minimize" aria-label="Minimize window" onClick={() => ipc('window:minimize')}><Minus size={15} /></button>
      <button type="button" title={maximized ? 'Restore' : 'Maximize'} aria-label={maximized ? 'Restore window' : 'Maximize window'} onClick={toggleMaximize}>
        {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
      <button type="button" className="operator-window-close" title="Minimize to tray" aria-label="Minimize to tray" onClick={() => ipc('window:close')}><X size={16} /></button>
    </div>
  </div>
}
