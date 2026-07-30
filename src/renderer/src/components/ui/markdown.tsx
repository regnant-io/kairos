// src/renderer/src/components/ui/markdown.tsx
// Minimal inline-markdown renderer for chat messages. Deliberately lightweight
// (no react-markdown dependency) — handles the formatting the assistant
// actually produces: bold, italics, inline code, code blocks, and links.
import React from 'react'

let keyCounter = 0
function nextKey(): string {
  keyCounter += 1
  return `md-${keyCounter}`
}

function renderInlineSpans(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Order matters: code spans first so ** inside `code` isn't touched.
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    if (match[1] !== undefined) {
      nodes.push(
        <code key={nextKey()} className="px-1 py-0.5 rounded bg-slate-200/70 text-[0.85em] font-mono">
          {match[1]}
        </code>
      )
    } else if (match[2] !== undefined) {
      nodes.push(<strong key={nextKey()}>{match[2]}</strong>)
    } else if (match[3] !== undefined) {
      nodes.push(<em key={nextKey()}>{match[3]}</em>)
    } else if (match[4] !== undefined && match[5] !== undefined) {
      nodes.push(
        <a
          key={nextKey()}
          href={match[5]}
          onClick={(e) => e.preventDefault()}
          className="underline text-primary cursor-default"
          title={match[5]}
        >
          {match[4]}
        </a>
      )
    }
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

/**
 * Renders a chat message body with basic markdown support:
 * fenced ```code blocks```, and inline **bold**, *italics*, `code`, [links](url).
 * Plain-text lines fall through unchanged, so this is safe for un-formatted output.
 */
export function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null

  const parts = text.split(/```/)
  if (parts.length === 1) {
    return renderInlineSpans(text)
  }

  return parts.map((part, i) => {
    const isCodeBlock = i % 2 === 1
    if (isCodeBlock) {
      // Strip an optional leading language tag on the first line.
      const lines = part.replace(/^\s*\n/, '').split('\n')
      const code = (lines[0] && /^[a-zA-Z0-9_+-]+$/.test(lines[0].trim()))
        ? lines.slice(1).join('\n')
        : part
      return (
        <pre key={nextKey()} className="bg-slate-800 text-slate-100 rounded-lg p-3 my-1.5 overflow-x-auto text-xs font-mono whitespace-pre">
          <code>{code.trim()}</code>
        </pre>
      )
    }
    return <React.Fragment key={nextKey()}>{renderInlineSpans(part)}</React.Fragment>
  })
}
