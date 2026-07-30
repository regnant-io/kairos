// src/renderer/src/components/layout/AIChat.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Send, Bot, User, Loader2, ChevronDown, ChevronRight, Brain,
  Square, Copy, RotateCcw, Check, Trash2
} from 'lucide-react'
import { useAIStore, useChatStore, type ChatMessage } from '../../stores'
import { ipc, onEvent } from '../../hooks/useIPC'
import { cn } from '../ui/utils'
import { renderInlineMarkdown } from '../ui/markdown'

// Parse thinking tags from AI response
function parseThinking(text: string): { thinking?: string; content: string } {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i)
  if (thinkMatch) {
    return {
      thinking: thinkMatch[1].trim(),
      content: text.replace(/<think>[\s\S]*?<\/think>/i, '').trim()
    }
  }
  return { content: text }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function AIChat() {
  const { t } = useTranslation()
  const { status } = useAIStore()
  const { messages, addMessage, clearMessages } = useChatStore()
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Track the job actually driving this chat panel so stream events from
  // OTHER features (lesson/exam/report generation happening concurrently)
  // never bleed into the chat view, and so a stale global "streaming" flag
  // can't prematurely close out a response that's still generating.
  const activeJobIdRef = useRef<string | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, liveText, scrollToBottom])

  // Listen directly for this panel's own job chunks/errors, keyed by jobId,
  // instead of relying on the shared useAIStore streaming state (which is
  // also mutated by lesson/exam/report generation and can get out of sync).
  useEffect(() => {
    const cleanups = [
      onEvent('ai:stream-chunk', ({ jobId, chunk }) => {
        if (jobId !== activeJobIdRef.current) return
        setLiveText(prev => prev + chunk)
      }),
      onEvent('ai:stream-error', ({ jobId, error, cancelled }) => {
        if (jobId !== activeJobIdRef.current) return
        activeJobIdRef.current = null
        setIsProcessing(false)
        if (!cancelled) {
          addMessage({
            id: newId(),
            role: 'assistant',
            content: `Sorry, I ran into an error: ${String(error)}`,
            timestamp: Date.now(),
            error: true
          })
        }
        setLiveText('')
      })
    ]
    return () => cleanups.forEach(fn => fn())
  }, [addMessage])

  async function sendMessage(content: string, historyOverride?: ChatMessage[]) {
    if (!content.trim() || isProcessing) return

    const history = (historyOverride ?? messages).slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }))

    const jobId = newId()
    activeJobIdRef.current = jobId
    setIsProcessing(true)
    setLiveText('')

    try {
      // The invoke promise itself resolves with the FINAL text once the main
      // process finishes generating — that's the authoritative result. We no
      // longer infer completion by watching a shared streaming flag, which is
      // what previously caused responses to get lost (the panel would decide
      // the reply was "done" from stale state while the model kept working).
      const result = await ipc('ai:chat', content, history, jobId)
      // Ignore late-arriving results from a job the user has since cancelled
      // or superseded.
      if (activeJobIdRef.current !== jobId) return

      const parsed = parseThinking(result || liveText)
      addMessage({
        id: newId(),
        role: 'assistant',
        content: parsed.content,
        thinking: parsed.thinking,
        timestamp: Date.now()
      })
    } catch (err) {
      if (activeJobIdRef.current === jobId) {
        addMessage({
          id: newId(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${String(err)}`,
          timestamp: Date.now(),
          error: true
        })
      }
    } finally {
      if (activeJobIdRef.current === jobId) {
        activeJobIdRef.current = null
        setIsProcessing(false)
        setLiveText('')
      }
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return
    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    }
    addMessage(userMessage)
    setInput('')
    await sendMessage(userMessage.content, [...messages, userMessage])
  }

  const handleStop = async () => {
    const jobId = activeJobIdRef.current
    if (!jobId) return
    try {
      await ipc('ai:cancel-job', jobId)
    } catch { /* best-effort */ }
    // Preserve whatever was generated so far instead of discarding it.
    if (activeJobIdRef.current === jobId) {
      const parsed = parseThinking(liveText)
      if (parsed.content.trim()) {
        addMessage({
          id: newId(),
          role: 'assistant',
          content: parsed.content,
          thinking: parsed.thinking,
          timestamp: Date.now(),
          cancelled: true
        })
      }
      activeJobIdRef.current = null
      setIsProcessing(false)
      setLiveText('')
    }
  }

  const handleRetry = async (userMsg: ChatMessage) => {
    if (isProcessing) return
    const idx = messages.findIndex(m => m.id === userMsg.id)
    const historyBefore = idx >= 0 ? messages.slice(0, idx) : messages
    await sendMessage(userMsg.content, historyBefore)
  }

  const handleCopy = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopiedId(msg.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const toggleThinking = (messageId: string) => {
    setExpandedThinking(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  // Parse streaming text for thinking
  const streamingParsed = parseThinking(liveText)
  const isChatStreaming = isProcessing

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <Bot size={20} className="text-primary" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-slate-900">AI Assistant</h3>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              status.status === 'ready' && !isProcessing && 'bg-green-500',
              (isProcessing || status.status === 'generating') && 'bg-amber-500 animate-pulse',
              status.status === 'loading' && 'bg-slate-400 animate-pulse',
              status.status === 'error' && 'bg-red-500'
            )} />
            {isProcessing || status.status === 'generating'
              ? 'Thinking…'
              : status.status === 'ready' ? 'Online'
              : status.status === 'loading' ? 'Starting…'
              : status.status === 'error' ? 'Error' : 'Offline'}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            title="Clear conversation"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Bot size={48} className="text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 mb-1">AI Assistant Ready</p>
            <p className="text-xs text-slate-400">
              Ask me anything about lesson planning, exam creation, or teaching strategies.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id} className="group">
            <div
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot size={16} className="text-primary" />
                </div>
              )}
              <div className="flex flex-col gap-2 max-w-[80%]">
                {/* Thinking section (collapsible) */}
                {msg.thinking && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleThinking(msg.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      {expandedThinking.has(msg.id) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                      <Brain size={14} />
                      <span className="font-medium">Thinking process</span>
                    </button>
                    {expandedThinking.has(msg.id) && (
                      <div className="px-3 py-2 text-xs text-slate-600 border-t border-slate-200 whitespace-pre-wrap">
                        {msg.thinking}
                      </div>
                    )}
                  </div>
                )}

                {/* Main message */}
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-white'
                      : msg.error
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'bg-slate-100 text-slate-900'
                  )}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {renderInlineMarkdown(msg.content)}
                  </div>
                  <div className={cn(
                    'flex items-center gap-1.5 text-xs mt-1',
                    msg.role === 'user' ? 'text-primary-100' : 'text-slate-400'
                  )}>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.cancelled && <span className="italic">· stopped</span>}
                  </div>
                </div>

                {/* Action row: copy, retry (assistant only, revealed on hover) */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopy(msg)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    {i > 0 && messages[i - 1].role === 'user' && (
                      <button
                        onClick={() => handleRetry(messages[i - 1])}
                        disabled={isProcessing}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded disabled:opacity-50"
                        title="Regenerate response"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-slate-600" />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {isChatStreaming && liveText && (
          <div>
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="flex flex-col gap-2 max-w-[80%]">
                {/* Streaming thinking (always show if present) */}
                {streamingParsed.thinking && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600">
                      <Brain size={14} />
                      <span className="font-medium">Thinking...</span>
                      <Loader2 size={12} className="animate-spin ml-auto" />
                    </div>
                    <div className="px-3 py-2 text-xs text-slate-600 border-t border-slate-200 whitespace-pre-wrap">
                      {streamingParsed.thinking}
                    </div>
                  </div>
                )}

                {/* Streaming content */}
                {streamingParsed.content && (
                  <div className="rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-900">
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {renderInlineMarkdown(streamingParsed.content)}
                    </div>
                    <Loader2 size={12} className="animate-spin text-slate-400 mt-1" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Processing indicator (before first chunk arrives) */}
        {isProcessing && !liveText && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-primary" />
            </div>
            <div className="rounded-lg px-3 py-2 bg-slate-100">
              <Loader2 size={16} className="animate-spin text-slate-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[40px] max-h-[120px]"
            rows={1}
            disabled={status.status !== 'ready' || isProcessing}
          />
          {isProcessing ? (
            <button
              onClick={handleStop}
              className="px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center"
              title="Stop generating"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || status.status !== 'ready'}
              className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {isProcessing ? 'Generating… click stop to cancel' : 'Press Enter to send, Shift+Enter for new line'}
        </p>
      </div>
    </div>
  )
}
