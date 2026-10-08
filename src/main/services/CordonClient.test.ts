import { afterEach, describe, expect, it, vi } from 'vitest'
import { cordonComplete, cordonHealth } from './CordonClient'

const config = { endpoint: 'http://cordon.school:8443', clientId: 'kairos', model: 'default' }
const signal = new AbortController().signal

function sse(lines: string[]): Response {
  const body = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      // Split mid-line to prove partial lines are buffered, not dropped.
      const text = lines.map(l => `data: ${l}\n\n`).join('')
      controller.enqueue(enc.encode(text.slice(0, 37)))
      controller.enqueue(enc.encode(text.slice(37)))
      controller.close()
    }
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('Cordon client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the prompt as the enrolled client and returns the signed receipt', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ index: 0, finish_reason: 'length', message: { role: 'assistant', content: '{"title": "Photosynthesis"' } }],
      cordon: { request_id: 'req-1', signature: { value: 'c2ln' } }
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await cordonComplete(config, 'Write a lesson plan', {
      maxTokens: 900, temperature: 0.3, stopSequences: ['a', 'b', 'c', 'd', 'e'], stream: false, jsonMode: true, signal
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(url).toBe('http://cordon.school:8443/openai/v1/chat/completions')
    expect((init.headers as Record<string, string>)['x-client-id']).toBe('kairos')
    expect(body.messages).toEqual([{ role: 'user', content: 'Write a lesson plan' }])
    expect(body.max_tokens).toBe(900)
    expect(body.stop).toHaveLength(4)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(res.text).toBe('{"title": "Photosynthesis"')
    expect(res.truncated).toBe(true)  // so Kairos auto-continues
    expect(res.receipt?.request_id).toBe('req-1')
  })

  it('streams deltas and keeps the receipt from the final chunk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: 'Habari ' } }] }),
      JSON.stringify({ choices: [{ index: 0, delta: { content: 'darasa' } }] }),
      JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], cordon: { request_id: 'req-2' } }),
      '[DONE]'
    ])))
    const chunks: string[] = []
    const res = await cordonComplete(config, 'Greet the class', {
      maxTokens: 50, temperature: 0.3, stopSequences: [], stream: true, onChunk: c => chunks.push(c), signal
    })
    expect(chunks.join('')).toBe('Habari darasa')
    expect(res).toMatchObject({ text: 'Habari darasa', truncated: false, receipt: { request_id: 'req-2' } })
  })

  it('reports a refusal in words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'client kairos is not enrolled' }
    }), { status: 403 })))
    await expect(cordonComplete(config, 'x', {
      maxTokens: 10, temperature: 0, stopSequences: [], stream: false, signal
    })).rejects.toThrow(/403.*not enrolled/)
  })

  it('is healthy only while the node is serving', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'loading', serving: false }))))
    expect(await cordonHealth(config)).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'healthy', serving: true }))))
    expect(await cordonHealth(config)).toBe(true)
  })
})
