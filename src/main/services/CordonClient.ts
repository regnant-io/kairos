/**
 * Cordon — Regnant's confidential inference engine — as Kairos's model.
 *
 * A school can run one Cordon node on its own network (a staff-room PC or a
 * small server) and point every teacher's Kairos at it, instead of loading a
 * model on each 4 GB laptop. Cordon admits each request under a client
 * identity and audits it before it runs, and filters and signs every answer.
 * For exams that matters: the school can show which paper the model produced,
 * when, and for whom — and that nobody changed it afterwards.
 *
 * Cordon speaks OpenAI's chat-completions protocol on /openai/v1. Kairos's
 * prompts are single completions, so each becomes one user message.
 */

export interface CordonConfig {
  endpoint: string   // e.g. http://192.168.1.20:8443
  clientId: string   // enrolled in Cordon's clients.json
  model: string      // the model the node loaded ('default' is fine)
}

export interface CordonReceipt {
  request_id?: string
  signature?: { value?: string; key_provenance?: string }
  [key: string]: unknown
}

export interface CordonCompletion {
  text: string
  truncated: boolean
  cancelled?: boolean
  receipt?: CordonReceipt
}

function headers(config: CordonConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.clientId) h['x-client-id'] = config.clientId
  return h
}

/** Cordon's liveness: serving only once its model is loaded. */
export async function cordonHealth(config: CordonConfig, timeoutMs = 5_000): Promise<boolean> {
  try {
    const res = await fetch(`${config.endpoint}/v1/health`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    return data?.serving !== false
  } catch {
    return false
  }
}

export async function cordonModels(config: CordonConfig): Promise<string[]> {
  try {
    const res = await fetch(`${config.endpoint}/openai/v1/models`, {
      headers: headers(config), signal: AbortSignal.timeout(5_000)
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.data ?? []).map((m: any) => m.id).filter(Boolean)
  } catch {
    return []
  }
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text()
  try {
    return JSON.parse(text)?.error?.message ?? text
  } catch {
    return text
  }
}

export async function cordonComplete(config: CordonConfig, prompt: string, options: {
  maxTokens: number
  temperature: number
  stopSequences: string[]
  stream: boolean
  onChunk?: (chunk: string) => void
  jsonMode?: boolean
  signal: AbortSignal
}): Promise<CordonCompletion> {
  const { maxTokens, temperature, stopSequences, stream, onChunk, jsonMode, signal } = options
  const body = {
    model: config.model || 'default',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
    top_p: 0.9,
    // OpenAI accepts at most four stop sequences.
    ...(stopSequences.length ? { stop: stopSequences.slice(0, 4) } : {}),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    stream: Boolean(stream && onChunk)
  }

  let res: Response
  try {
    res = await fetch(`${config.endpoint}/openai/v1/chat/completions`, {
      method: 'POST', headers: headers(config), body: JSON.stringify(body), signal
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') return { text: '', truncated: false, cancelled: true }
    throw new Error(`Cannot connect to Cordon at ${config.endpoint}. Is the node running and reachable?`)
  }
  if (!res.ok) {
    throw new Error(`Cordon refused the request (${res.status}): ${await errorMessage(res)}`)
  }

  if (body.stream) return consumeStream(res, onChunk!, signal)

  const data = await res.json()
  const choice = data?.choices?.[0] ?? {}
  return {
    text: choice?.message?.content ?? '',
    truncated: choice?.finish_reason === 'length',
    receipt: data?.cordon
  }
}

/** OpenAI server-sent events: `data: {chunk}` lines, ending with `data: [DONE]`. */
async function consumeStream(res: Response, onChunk: (chunk: string) => void, signal: AbortSignal): Promise<CordonCompletion> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let truncated = false
  let receipt: CordonReceipt | undefined
  let buffer = ''
  let finished = false

  const handleLine = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') { finished = true; return }
    try {
      const obj = JSON.parse(payload)
      if (obj.error) throw new Error(`Cordon: ${obj.error.message ?? 'stream refused'}`)
      const choice = obj.choices?.[0]
      const delta = choice?.delta?.content
      if (delta) { full += delta; onChunk(delta) }
      if (choice?.finish_reason) truncated = choice.finish_reason === 'length'
      if (obj.cordon) receipt = obj.cordon
    } catch (err: any) {
      if (err?.message?.startsWith('Cordon:')) throw err
      /* a malformed line — skip it */
    }
  }

  while (!finished) {
    let read
    try {
      read = await reader.read()
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') {
        await reader.cancel().catch(() => {})
        return { text: full, truncated: false, cancelled: true }
      }
      throw err
    }
    if (read.done) break
    buffer += decoder.decode(read.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  }
  if (buffer.trim()) handleLine(buffer)
  return { text: full, truncated, receipt }
}
