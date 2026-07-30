// src/renderer/src/components/layout/ResizableLayout.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '../ui/utils'
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose } from 'lucide-react'

interface ResizableLayoutProps {
  sidebar: React.ReactNode
  main: React.ReactNode
  chat: React.ReactNode
  defaultSidebarWidth?: number
  defaultChatWidth?: number
  minSidebarWidth?: number
  minMainWidth?: number
  minChatWidth?: number
}

const STORAGE_KEY = 'kairos-panel-widths'

export function ResizableLayout({
  sidebar,
  main,
  chat,
  defaultSidebarWidth = 240,
  defaultChatWidth = 320,
  minSidebarWidth = 200,
  minMainWidth = 400,
  minChatWidth = 280
}: ResizableLayoutProps) {
  // Load saved widths from localStorage
  const loadSavedWidths = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          sidebarWidth: parsed.sidebarWidth ?? defaultSidebarWidth,
          chatWidth: parsed.chatWidth ?? defaultChatWidth,
          sidebarCollapsed: parsed.sidebarCollapsed ?? false,
          chatCollapsed: parsed.chatCollapsed ?? false
        }
      }
    } catch (e) {
      console.error('Failed to load panel widths:', e)
    }
    return {
      sidebarWidth: defaultSidebarWidth,
      chatWidth: defaultChatWidth,
      sidebarCollapsed: false,
      chatCollapsed: false
    }
  }

  const saved = loadSavedWidths()
  const [sidebarWidth, setSidebarWidth] = useState(saved.sidebarWidth)
  const [chatWidth, setChatWidth] = useState(saved.chatWidth)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(saved.sidebarCollapsed)
  const [chatCollapsed, setChatCollapsed] = useState(saved.chatCollapsed)
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false)
  const [isDraggingChat, setIsDraggingChat] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Save to localStorage whenever widths or collapsed state changes
  useEffect(() => {
    const data = {
      sidebarWidth,
      chatWidth,
      sidebarCollapsed,
      chatCollapsed
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [sidebarWidth, chatWidth, sidebarCollapsed, chatCollapsed])

  // Handle sidebar resize
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingSidebar(true)
  }, [])

  // Handle chat resize
  const handleChatMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingChat(true)
  }, [])

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const containerWidth = containerRect.width

      if (isDraggingSidebar) {
        const newWidth = e.clientX - containerRect.left
        const maxWidth = containerWidth - minMainWidth - (chatCollapsed ? 0 : chatWidth)
        const clampedWidth = Math.max(minSidebarWidth, Math.min(newWidth, maxWidth))
        setSidebarWidth(clampedWidth)
      }

      if (isDraggingChat) {
        const newWidth = containerRect.right - e.clientX
        const maxWidth = containerWidth - minMainWidth - (sidebarCollapsed ? 0 : sidebarWidth)
        const clampedWidth = Math.max(minChatWidth, Math.min(newWidth, maxWidth))
        setChatWidth(clampedWidth)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingSidebar(false)
      setIsDraggingChat(false)
    }

    if (isDraggingSidebar || isDraggingChat) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDraggingSidebar, isDraggingChat, sidebarWidth, chatWidth, sidebarCollapsed, chatCollapsed, minSidebarWidth, minMainWidth, minChatWidth])

  const toggleSidebar = () => setSidebarCollapsed(!sidebarCollapsed)
  const toggleChat = () => setChatCollapsed(!chatCollapsed)

  return (
    <div ref={containerRef} className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar Panel */}
      <div
        className={cn(
          'flex-shrink-0 transition-all duration-200 ease-in-out relative',
          sidebarCollapsed && 'w-0'
        )}
        style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
      >
        {!sidebarCollapsed && (
          <>
            <div className="h-full overflow-hidden">
              {sidebar}
            </div>
            {/* Sidebar resize handle */}
            <div
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors group"
              onMouseDown={handleSidebarMouseDown}
            >
              <div className="absolute top-1/2 -translate-y-1/2 right-0 w-1 h-12 bg-slate-300 group-hover:bg-primary/60 rounded-full transition-colors" />
            </div>
          </>
        )}
      </div>

      {/* Sidebar collapse button */}
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-white border border-slate-200 rounded-r-lg flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
          title="Show sidebar"
        >
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 overflow-hidden relative">
        {main}
        
        {/* Sidebar collapse button (when sidebar is open) */}
        {!sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="absolute left-2 top-4 z-10 w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
            title="Hide sidebar"
          >
            <PanelLeftClose size={16} className="text-slate-500" />
          </button>
        )}

        {/* Chat collapse button (when chat is open) */}
        {!chatCollapsed && (
          <button
            onClick={toggleChat}
            className="absolute right-2 top-4 z-10 w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
            title="Hide AI chat"
          >
            <PanelRightClose size={16} className="text-slate-500" />
          </button>
        )}
      </div>

      {/* Chat Panel */}
      <div
        className={cn(
          'flex-shrink-0 transition-all duration-200 ease-in-out relative border-l border-slate-200',
          chatCollapsed && 'w-0 border-l-0'
        )}
        style={{ width: chatCollapsed ? 0 : chatWidth }}
      >
        {!chatCollapsed && (
          <>
            {/* Chat resize handle */}
            <div
              className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors group z-10"
              onMouseDown={handleChatMouseDown}
            >
              <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1 h-12 bg-slate-300 group-hover:bg-primary/60 rounded-full transition-colors" />
            </div>
            <div className="h-full overflow-hidden">
              {chat}
            </div>
          </>
        )}
      </div>

      {/* Chat expand button */}
      {chatCollapsed && (
        <button
          onClick={toggleChat}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-white border border-slate-200 rounded-l-lg flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
          title="Show AI chat"
        >
          <ChevronLeft size={14} className="text-slate-500" />
        </button>
      )}
    </div>
  )
}
