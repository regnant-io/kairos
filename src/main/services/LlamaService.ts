// src/main/services/LlamaService.ts
// Manages the llama.cpp server process and Ollama HTTP communication

import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import * as os from 'os'
import { app } from 'electron'
import type { AIStatusInfo, ModelConfig, FeatureKey } from '../../shared/ai-types'
import { SUPPORTED_MODELS } from '../../shared/ai-types'
import { cordonComplete, cordonHealth, cordonModels, type CordonReceipt } from './CordonClient'

const LLAMA_PORT = 11434
const LLAMA_HOST = '127.0.0.1'
const HEALTH_TIMEOUT_MS = 45_000
const HEALTH_POLL_MS = 1_000

type AIProvider = 'llamacpp' | 'ollama' | 'cordon'

export class LlamaService {
  private process: ChildProcess | null = null
  private modelPath: string = ''
  private modelName: string = ''
  private gpuLayers: number = -1  // Default to auto-detect
  private provider: AIProvider = 'llamacpp'
  private ollamaEndpoint: string = 'http://localhost:11434'
  private ollamaModel: string = 'llama3.2:3b'
  private thinkingModel?: string
  private enableThinkingModels: boolean = false
  // Cordon (Regnant): a school-wide node that audits each request and signs
  // each answer. See CordonClient.ts.
  private cordonEndpoint: string = 'http://127.0.0.1:8443'
  private cordonClientId: string = 'kairos'
  private cordonModel: string = 'default'
  private cordonContextSize: number = 8192
  private lastReceipt?: CordonReceipt
  // The actual usable context window (prompt + generation) resolved from the
  // running model. This is the single source of truth for token budgeting and
  // is what prevents silent truncation of long generations (exams, lessons).
  private maxContextWindow: number = 4096
  private status: AIStatusInfo = {
    status: 'loading',
    model: 'none',
    contextSize: 0
  }
  private statusListeners: ((status: AIStatusInfo) => void)[] = []
  // Tracks in-flight jobs so they can be genuinely cancelled (aborting the
  // underlying HTTP request) instead of just faking a "cancelled" event while
  // the generation keeps running in the background and completes anyway.
  private jobControllers = new Map<string, AbortController>()

  // ── Job cancellation ─────────────────────────────────────────────

  beginJob(jobId: string): AbortSignal {
    const controller = new AbortController()
    this.jobControllers.set(jobId, controller)
    return controller.signal
  }

  endJob(jobId: string): void {
    this.jobControllers.delete(jobId)
  }

  /** Returns true if a matching in-flight job was found and aborted. */
  cancelJob(jobId: string): boolean {
    const controller = this.jobControllers.get(jobId)
    if (!controller) return false
    controller.abort()
    return true
  }

  // ── Provider Configuration ──────────────────────────────────────

  setProvider(provider: AIProvider): void {
    this.provider = provider
  }

  getProvider(): AIProvider {
    return this.provider
  }

  setOllamaEndpoint(endpoint: string): void {
    // Strip trailing slashes so we never build '//api/generate' URLs, which
    // some reverse proxies (e.g. Cloudflare tunnels) reject.
    this.ollamaEndpoint = endpoint.replace(/\/+$/, '')
  }

  setOllamaModel(model: string): void {
    this.ollamaModel = model
  }

  setCordon(settings: { endpoint?: string; clientId?: string; model?: string; contextSize?: number }): void {
    if (settings.endpoint) this.cordonEndpoint = settings.endpoint.replace(/\/+$/, '')
    if (settings.clientId !== undefined) this.cordonClientId = settings.clientId
    if (settings.model) this.cordonModel = settings.model
    if (settings.contextSize && settings.contextSize > 0) this.cordonContextSize = settings.contextSize
  }

  /** Cordon's evidence (audit request ID, signature) for the last answer. */
  getLastReceipt(): CordonReceipt | undefined {
    return this.lastReceipt
  }

  private cordonConfig() {
    return { endpoint: this.cordonEndpoint, clientId: this.cordonClientId, model: this.cordonModel }
  }

  setThinkingModel(model: string | undefined, enabled: boolean): void {
    this.thinkingModel = model
    this.enableThinkingModels = enabled
  }

  async getOllamaModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.models?.map((m: any) => m.name) ?? []
    } catch (err) {
      console.error('[Ollama] Failed to fetch models:', err)
      return []
    }
  }

  // ── GPU Detection ───────────────────────────────────────────────

  async detectGPU(): Promise<{ hasGPU: boolean; gpuName?: string; vramGB?: number }> {
    const binDir = this.getBinariesDir()
    const gpuInfoPath = join(binDir, process.platform === 'win32' ? 'nv-gpu-info.exe' : 'nv-gpu-info')
    
    if (!existsSync(gpuInfoPath)) {
      console.log('[GPU] nv-gpu-info binary not found, assuming no GPU')
      return { hasGPU: false }
    }

    return new Promise((resolve) => {
      const proc = spawn(gpuInfoPath, [], { timeout: 5000 })
      let output = ''

      proc.stdout?.on('data', (data) => {
        output += data.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0 || !output.trim()) {
          resolve({ hasGPU: false })
          return
        }

        try {
          const lines = output.trim().split('\n')
          const gpuName = lines[0]?.trim()
          const vramMatch = lines[1]?.match(/(\d+)/)
          const vramMB = vramMatch ? parseInt(vramMatch[1]) : 0
          const vramGB = Math.floor(vramMB / 1024)

          console.log(`[GPU] Detected: ${gpuName}, VRAM: ${vramGB}GB`)
          resolve({ hasGPU: true, gpuName, vramGB })
        } catch (err) {
          console.error('[GPU] Failed to parse GPU info:', err)
          resolve({ hasGPU: false })
        }
      })

      proc.on('error', () => {
        resolve({ hasGPU: false })
      })
    })
  }

  async autoDetectGPULayers(): Promise<number> {
    const gpuInfo = await this.detectGPU()
    if (!gpuInfo.hasGPU) {
      console.log('[GPU] No GPU detected, using CPU only (0 layers)')
      return 0
    }

    // If GPU detected, use full GPU offloading (33 layers for most models)
    console.log('[GPU] GPU detected, using full GPU offloading (33 layers)')
    return 33
  }

  // ── Model Selection ─────────────────────────────────────────────

  setGPULayers(layers: number): void {
    this.gpuLayers = layers
  }

  getGPULayers(): number {
    return this.gpuLayers
  }

  getModelsDir(): string {
    if (process.env.NODE_ENV === 'development') {
      return join(process.cwd(), 'models')
    }
    return join(app.getPath('userData'), 'models')
  }

  getBinariesDir(): string {
    const platform = process.platform === 'win32' ? 'win-x64'
      : process.platform === 'darwin' ? `darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
      : 'linux-x64'

    if (process.env.NODE_ENV === 'development') {
      return join(process.cwd(), 'binaries', platform)
    }
    // In production, extraResources puts them in resources/binaries
    return join(process.resourcesPath, 'binaries')
  }

  getLlamaServerPath(): string {
    const binDir = this.getBinariesDir()
    const binary = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    const fullPath = join(binDir, binary)
    return fullPath
  }

  getInstalledModels(): ModelConfig[] {
    const modelsDir = this.getModelsDir()
    if (!existsSync(modelsDir)) return []

    try {
      const files = readdirSync(modelsDir).filter(f => f.endsWith('.gguf'))
      return SUPPORTED_MODELS.map(m => ({
        ...m,
        installed: files.includes(m.filename)
      }))
    } catch {
      return []
    }
  }

  async selectModel(): Promise<string> {
    const totalRAM = os.totalmem() / (1024 ** 3)
    const modelsDir = this.getModelsDir()
    const installed = this.getInstalledModels().filter(m => m.installed)

    if (installed.length === 0) {
      throw new Error('No GGUF models found. Please install a model in the models directory.')
    }

    // Sort by quality (best first) and filter by available RAM
    const candidates = installed
      .filter(m => m.minRAMGB <= totalRAM - 0.5) // Leave some headroom
      .sort((a, b) => {
        const quality = { best: 3, balanced: 2, fast: 1 }
        return quality[b.quality] - quality[a.quality]
      })

    const chosen = candidates[0] ?? installed[0]
    return join(modelsDir, chosen.filename)
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.provider === 'ollama') {
      return this.startOllama()
    }
    if (this.provider === 'cordon') {
      return this.startCordon()
    }
    return this.startLlamaCpp()
  }

  private async startCordon(): Promise<void> {
    console.log('[Cordon] Connecting to Cordon at:', this.cordonEndpoint, 'as', this.cordonClientId)
    if (!(await cordonHealth(this.cordonConfig(), 10_000))) {
      throw new Error(`Cordon is not serving at ${this.cordonEndpoint}. Start the node (cordon run) or check the address.`)
    }
    const models = await cordonModels(this.cordonConfig())
    this.modelName = models.includes(this.cordonModel) || !models.length ? this.cordonModel : models[0]
    this.maxContextWindow = this.cordonContextSize
    this.updateStatus({ status: 'ready', model: `cordon:${this.modelName}`, contextSize: this.maxContextWindow })
  }

  private async startOllama(): Promise<void> {
    console.log('[Ollama] Connecting to Ollama at:', this.ollamaEndpoint)
    
    // Check if Ollama is running
    const alive = await this.health()
    if (!alive) {
      throw new Error(`Ollama server not reachable at ${this.ollamaEndpoint}. Please start Ollama first.`)
    }

    // Verify model exists
    const models = await this.getOllamaModels()
    if (!models.includes(this.ollamaModel)) {
      throw new Error(`Model ${this.ollamaModel} not found in Ollama. Available models: ${models.join(', ')}`)
    }

    this.modelName = this.ollamaModel

    // Resolve the model's real trained context length so we can request an
    // appropriate num_ctx per generation. Ollama defaults to a tiny 2048-token
    // window unless num_ctx is passed explicitly — the usual cause of "powerful
    // models still get truncated".
    this.maxContextWindow = await this.resolveOllamaContext(this.ollamaModel)
    this.updateStatus({ status: 'ready', model: this.modelName, contextSize: this.maxContextWindow })
  }

  /** Query Ollama for a model's trained context length via /api/show. */
  private async resolveOllamaContext(model: string): Promise<number> {
    try {
      const res = await fetch(`${this.ollamaEndpoint}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(5000)
      })
      if (!res.ok) return 8192
      const data = await res.json()
      const info = data?.model_info ?? {}
      // Key looks like "llama.context_length", "qwen2.context_length", etc.
      const key = Object.keys(info).find(k => k.endsWith('.context_length'))
      const ctx = key ? Number(info[key]) : 0
      // Cap to keep memory sane on teacher laptops; most tasks fit in 16k.
      if (ctx && ctx > 0) return Math.min(ctx, 16384)
      return 8192
    } catch {
      return 8192
    }
  }

  /** Public accessor for the resolved context window. */
  getContextWindow(): number {
    return this.maxContextWindow
  }

  /** Rough token estimate (~4 chars/token) for budgeting generation length. */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /**
   * True when `text` contains a structurally complete JSON value (balanced
   * braces/brackets, not ending inside a string). Used to detect when a model
   * stopped early mid-JSON so we can auto-continue even on a natural stop.
   */
  private isBalancedJson(text: string): boolean {
    let depth = 0
    let inString = false
    let escaped = false
    let started = false
    for (const ch of text) {
      if (inString) {
        if (escaped) { escaped = false }
        else if (ch === '\\') { escaped = true }
        else if (ch === '"') { inString = false }
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === '{' || ch === '[') { depth++; started = true }
      else if (ch === '}' || ch === ']') { depth-- }
    }
    return started && depth === 0 && !inString
  }

  private async startLlamaCpp(): Promise<void> {
    const serverPath = this.getLlamaServerPath()

    // If binary doesn't exist, try fallback to Ollama
    if (!existsSync(serverPath)) {
      console.warn('[Llama] Server binary not found at:', serverPath)
      const alive = await this.health()
      if (alive) {
        this.updateStatus({ status: 'ready', model: 'external', contextSize: 4096 })
        return
      }
      throw new Error(`llama-server binary not found at: ${serverPath}\n` +
        'Please run scripts/build-llama.sh or download a pre-built binary.')
    }

    try {
      this.modelPath = await this.selectModel()
    } catch (err) {
      throw new Error(`Model selection failed: ${err}`)
    }

    // Extract model name for display
    this.modelName = this.modelPath.split('/').pop()?.replace('.gguf', '') ?? 'unknown'

    // Auto-detect GPU layers if set to -1
    if (this.gpuLayers === -1) {
      this.gpuLayers = await this.autoDetectGPULayers()
    }

    const threads = Math.max(2, os.cpus().length - 1)
    const totalRAM = os.totalmem() / (1024 ** 3)

    // Context window must be large enough to hold the prompt PLUS the full
    // generation. Long outputs (exams, detailed lessons) need real headroom,
    // otherwise the model is silently cut off at ctx-size no matter how high
    // n-predict is. Scale with available RAM to stay safe on low-end machines.
    // KV-cache for a 3B model at 8192 ctx is only a few hundred MB.
    const modelCtxCap = this.getModelContextCap()
    let ctxSize: number
    if (totalRAM >= 16) ctxSize = 8192
    else if (totalRAM >= 8) ctxSize = 6144
    else ctxSize = 4096
    ctxSize = Math.min(ctxSize, modelCtxCap)
    this.maxContextWindow = ctxSize

    const args = [
      '--model', this.modelPath,
      '--ctx-size', String(ctxSize),
      '--threads', String(threads),
      '--port', String(LLAMA_PORT),
      '--host', LLAMA_HOST,
      '--n-predict', '-1',  // no hard cap; budgeted per-request against ctx window
      '--temp', '0.3',
      '--repeat-penalty', '1.1',
      '--log-disable',
      '-np', '1',  // single parallel slot
      '--no-mmap',  // disable memory mapping to avoid crashes
      '-ngl', String(this.gpuLayers)  // GPU layers
    ]

    console.log('[Llama] Spawning server:', serverPath)
    console.log('[Llama] GPU layers:', this.gpuLayers)
    console.log('[Llama] Args:', args.slice(0, 8).join(' '), '...')

    this.process = spawn(serverPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data) => {
      const line = data.toString().trim()
      if (line) console.log('[llama.cpp]', line)
    })

    this.process.stderr?.on('data', (data) => {
      const line = data.toString().trim()
      if (line && !line.includes('load_model')) {
        console.error('[llama.cpp stderr]', line)
      }
    })

    this.process.on('exit', (code, signal) => {
      console.log(`[Llama] Process exited code=${code} signal=${signal}`)
      if (code !== 0 && code !== null) {
        this.updateStatus({ status: 'error', model: this.modelName, contextSize: 0, error: `Process exited with code ${code}` })
      }
    })

    // Wait for server to be healthy
    await this.waitForHealth()

    // Confirm the actual context the server allocated (source of truth).
    const serverCtx = await this.fetchLlamaCppContext()
    if (serverCtx > 0) this.maxContextWindow = serverCtx

    this.updateStatus({ status: 'ready', model: this.modelName, contextSize: this.maxContextWindow })
  }

  /**
   * Upper bound on context for the selected model, from SUPPORTED_MODELS metadata.
   * Prevents requesting more context than a model was trained for.
   */
  private getModelContextCap(): number {
    const filename = this.modelPath.split(/[\\/]/).pop() ?? ''
    const known = SUPPORTED_MODELS.find(m => m.filename === filename)
    return known?.contextLen ?? 8192
  }

  /** Read the context size the running llama.cpp server actually allocated. */
  private async fetchLlamaCppContext(): Promise<number> {
    try {
      const res = await fetch(`http://${LLAMA_HOST}:${LLAMA_PORT}/props`, {
        signal: AbortSignal.timeout(3000)
      })
      if (!res.ok) return 0
      const data = await res.json()
      const ctx = data?.default_generation_settings?.n_ctx ?? data?.n_ctx ?? 0
      return typeof ctx === 'number' ? ctx : 0
    } catch {
      return 0
    }
  }

  async stop(): Promise<void> {
    if (this.provider === 'ollama' || this.provider === 'cordon') {
      // Nothing to stop for Ollama
      return
    }

    if (this.process) {
      this.process.kill('SIGTERM')
      await new Promise<void>(resolve => {
        const t = setTimeout(() => {
          this.process?.kill('SIGKILL')
          resolve()
        }, 5000)
        this.process!.on('exit', () => {
          clearTimeout(t)
          resolve()
        })
      })
      this.process = null
    }
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  // ── Health ──────────────────────────────────────────────────────

  async health(): Promise<boolean> {
    if (this.provider === 'cordon') {
      return cordonHealth(this.cordonConfig())
    }
    try {
      const endpoint = this.provider === 'ollama' 
        ? `${this.ollamaEndpoint}/api/tags`
        : `http://${LLAMA_HOST}:${LLAMA_PORT}/health`

      // Remote/tunneled Ollama endpoints (e.g. Cloudflare quick tunnels) add
      // real network latency — TLS handshake, edge routing, sometimes a cold
      // start — that a local loopback health check never has to deal with.
      // A 3s timeout was tight enough to misreport a perfectly healthy remote
      // server as "not reachable". Local llama.cpp keeps the fast timeout.
      const isRemote = this.provider === 'ollama' && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(this.ollamaEndpoint)
      const timeoutMs = isRemote ? 10_000 : 3_000

      const res = await fetch(endpoint, {
        signal: AbortSignal.timeout(timeoutMs)
      })
      return res.ok
    } catch {
      return false
    }
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await this.health()) return
      await new Promise(r => setTimeout(r, HEALTH_POLL_MS))
    }
    throw new Error(`llama-server did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s`)
  }

  // ── Inference ───────────────────────────────────────────────────

  async complete(prompt: string, options: {
    maxTokens?: number
    temperature?: number
    stopSequences?: string[]
    stream?: boolean
    onChunk?: (chunk: string) => void
    useThinking?: boolean
    autoContinue?: boolean
    maxContinuations?: number
    jsonMode?: boolean
    signal?: AbortSignal
  } = {}): Promise<string> {
    const {
      maxTokens = 2048,
      temperature = 0.3,
      stopSequences = ['</json>', '###END###', '\n\nHuman:', '\n\nUser:'],
      stream = false,
      onChunk,
      useThinking = false,
      autoContinue = true,
      maxContinuations = 4,
      jsonMode = false,
      signal
    } = options

    // Use thinking model if enabled and requested
    const model = useThinking && this.enableThinkingModels && this.thinkingModel
      ? this.thinkingModel
      : (this.provider === 'ollama' ? this.ollamaModel : undefined)

    // ── Token budgeting ────────────────────────────────────────────
    // The generation must fit inside the context window alongside the prompt.
    // We reserve room for the prompt and cap the per-round request so the model
    // is never asked to produce more than physically fits.
    const promptTokens = this.estimateTokens(prompt)
    const safetyBuffer = 256
    const available = Math.max(512, this.maxContextWindow - promptTokens - safetyBuffer)
    const roundBudget = Math.min(maxTokens, available)

    let full = ''
    let currentPrompt = prompt
    let rounds = 0

    while (true) {
      if (signal?.aborted) break

      // Only the FIRST round uses grammar-constrained JSON. Continuation rounds
      // must be free-form so the model textually resumes the partial JSON
      // (a grammar-constrained round would emit a new, separate JSON document).
      const roundJsonMode = jsonMode && rounds === 0

      const runOnce = this.provider === 'cordon'
        ? this.completeCordon(currentPrompt, {
            maxTokens: roundBudget, temperature, stopSequences, stream, onChunk, jsonMode: roundJsonMode, signal
          })
        : this.provider === 'ollama'
        ? this.completeOllama(currentPrompt, {
            maxTokens: roundBudget, temperature, stopSequences, stream, onChunk, model, jsonMode: roundJsonMode, signal
          })
        : this.completeLlamaCpp(currentPrompt, {
            maxTokens: roundBudget, temperature, stopSequences, stream, onChunk, jsonMode: roundJsonMode, signal
          })

      const { text, truncated, cancelled } = await runOnce
      full += text

      if (cancelled) break

      // In JSON mode a model may stop early (natural EOS) while the JSON is
      // still structurally incomplete. Treat that as "needs more" too, so we
      // continue until the braces/brackets balance — not only on length cutoffs.
      const incomplete = jsonMode && text.length > 0 && !this.isBalancedJson(full)

      // Stop when finished, continuation disabled, budget exhausted, or no room.
      const roomLeft = this.maxContextWindow - this.estimateTokens(currentPrompt + text) - safetyBuffer
      if ((!truncated && !incomplete) || !autoContinue || rounds >= maxContinuations || roomLeft < 256) {
        break
      }

      // Feed the partial output back so the model continues exactly where it
      // stopped. llama.cpp/Ollama cache the shared prefix so this stays fast.
      rounds++
      currentPrompt = prompt + full
    }

    return full
  }

  private async completeLlamaCpp(prompt: string, options: {
    maxTokens: number
    temperature: number
    stopSequences: string[]
    stream: boolean
    onChunk?: (chunk: string) => void
    jsonMode?: boolean
    signal?: AbortSignal
  }): Promise<{ text: string; truncated: boolean; cancelled?: boolean }> {
    const { maxTokens, temperature, stopSequences, stream, onChunk, jsonMode, signal } = options

    const body = JSON.stringify({
      prompt,
      temperature,
      top_p: 0.9,
      n_predict: maxTokens,
      repeat_penalty: 1.1,
      cache_prompt: true,  // reuse shared prefix across continuation rounds
      stream,
      stop: stopSequences,
      // Constrain output to valid JSON at the grammar level when requested.
      // An empty schema matches any JSON value (object or array).
      ...(jsonMode ? { json_schema: {} } : {})
    })

    const response = await fetch(`http://${LLAMA_HOST}:${LLAMA_PORT}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: combineSignals(AbortSignal.timeout(600_000), signal)  // 10 minutes for CPU inference
    }).catch(err => {
      if (err.name === 'AbortError' && signal?.aborted) return null
      throw err
    })

    if (!response) return { text: '', truncated: false, cancelled: true }

    if (!response.ok) {
      throw new Error(`llama-server error: ${response.status} ${await response.text()}`)
    }

    if (stream && onChunk) {
      return this.consumeStream(response, onChunk, signal)
    }

    const data = await response.json()
    // stopped_limit === true means generation was cut off at the token budget.
    const truncated = data.stopped_limit === true || data.truncated === true
    return { text: data.content ?? '', truncated }
  }

  private async completeCordon(prompt: string, options: {
    maxTokens: number
    temperature: number
    stopSequences: string[]
    stream: boolean
    onChunk?: (chunk: string) => void
    jsonMode?: boolean
    signal?: AbortSignal
  }): Promise<{ text: string; truncated: boolean; cancelled?: boolean }> {
    const res = await cordonComplete(this.cordonConfig(), prompt, {
      ...options,
      signal: combineSignals(AbortSignal.timeout(600_000), options.signal)
    })
    if (res.receipt) {
      this.lastReceipt = res.receipt
      console.log(`[Cordon] answer signed (request ${res.receipt.request_id ?? '?'})`)
    }
    return { text: res.text, truncated: res.truncated, cancelled: res.cancelled }
  }

  private async completeOllama(prompt: string, options: {
    maxTokens: number
    temperature: number
    stopSequences: string[]
    stream: boolean
    onChunk?: (chunk: string) => void
    model?: string
    jsonMode?: boolean
    signal?: AbortSignal
  }): Promise<{ text: string; truncated: boolean; cancelled?: boolean }> {
    const { maxTokens, temperature, stopSequences, stream, onChunk, model, jsonMode, signal } = options

    // Explicitly size the context window. Without num_ctx, Ollama silently
    // truncates to 2048 tokens — the primary cause of cut-off generations.
    const numCtx = Math.min(this.maxContextWindow, this.estimateTokens(prompt) + maxTokens + 256)

    const body = JSON.stringify({
      model: model ?? this.ollamaModel,
      prompt,
      stream,
      // format: 'json' forces Ollama to emit syntactically valid JSON, which
      // eliminates missing-quote/comma errors from the model.
      ...(jsonMode ? { format: 'json' } : {}),
      options: {
        temperature,
        num_predict: maxTokens,
        num_ctx: numCtx,
        top_p: 0.9,
        stop: stopSequences
      }
    })

    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: combineSignals(AbortSignal.timeout(600_000), signal)
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${await response.text()}`)
      }

      if (stream && onChunk) {
        return this.consumeOllamaStream(response, onChunk, signal)
      }

      const data = await response.json()
      // done_reason === 'length' means it hit num_predict and was cut off.
      const truncated = data.done_reason === 'length'
      return { text: data.response ?? '', truncated }
    } catch (err: any) {
      if (err.name === 'AbortError' && signal?.aborted) {
        return { text: '', truncated: false, cancelled: true }
      }
      if (err.code === 'UND_ERR_CONNECT_TIMEOUT' || err.message?.includes('fetch failed')) {
        throw new Error(`Cannot connect to Ollama at ${this.ollamaEndpoint}. Please ensure Ollama is running and accessible.`)
      }
      throw err
    }
  }

  private async consumeStream(
    response: Response,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ text: string; truncated: boolean; cancelled?: boolean }> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let full = ''
    let truncated = false
    // Buffer partial lines: a network chunk can split an NDJSON/SSE line in
    // half. Parsing the halves separately silently drops tokens (corruption
    // and apparent truncation), so we only parse on complete lines.
    let buffer = ''

    const handleLine = (line: string): boolean => {
      const trimmed = line.trim()
      if (!trimmed) return false
      const raw = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed
      if (raw === '[DONE]') return true
      try {
        const obj = JSON.parse(raw)
        if (obj.content) {
          full += obj.content
          onChunk(obj.content)
        }
        if (obj.stop) {
          truncated = obj.stopped_limit === true || obj.truncated === true
          return true
        }
      } catch { /* genuinely malformed complete line — skip */ }
      return false
    }

    let cancelled = false
    while (true) {
      if (signal?.aborted) { cancelled = true; break }
      let readResult
      try {
        readResult = await reader.read()
      } catch (err: any) {
        // The underlying fetch was aborted mid-read (race with the check above).
        if (signal?.aborted || err.name === 'AbortError') { cancelled = true; break }
        throw err
      }
      const { done, value } = readResult
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''  // keep the (possibly incomplete) last line
      for (const line of lines) {
        if (handleLine(line)) { buffer = ''; break }
      }
    }
    if (cancelled) {
      await reader.cancel().catch(() => {})
      return { text: full, truncated: false, cancelled: true }
    }
    // Flush any remaining complete content in the buffer.
    if (buffer.trim()) handleLine(buffer)

    return { text: full, truncated }
  }

  private async consumeOllamaStream(
    response: Response,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ text: string; truncated: boolean; cancelled?: boolean }> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let full = ''
    let truncated = false
    let buffer = ''

    const handleLine = (line: string): boolean => {
      const trimmed = line.trim()
      if (!trimmed) return false
      try {
        const obj = JSON.parse(trimmed)
        if (obj.response) {
          full += obj.response
          onChunk(obj.response)
        }
        if (obj.done) {
          truncated = obj.done_reason === 'length'
          return true
        }
      } catch { /* incomplete/malformed complete line — skip */ }
      return false
    }

    let cancelled = false
    while (true) {
      if (signal?.aborted) { cancelled = true; break }
      let readResult
      try {
        readResult = await reader.read()
      } catch (err: any) {
        if (signal?.aborted || err.name === 'AbortError') { cancelled = true; break }
        throw err
      }
      const { done, value } = readResult
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''  // keep incomplete last line for next chunk
      for (const line of lines) {
        if (handleLine(line)) { buffer = ''; break }
      }
    }
    if (cancelled) {
      await reader.cancel().catch(() => {})
      return { text: full, truncated: false, cancelled: true }
    }
    if (buffer.trim()) handleLine(buffer)

    return { text: full, truncated }
  }

  async embed(text: string): Promise<number[]> {
    // Cordon serves completions only; callers treat [] as "no embedding".
    if (this.provider === 'cordon') return []
    try {
      const endpoint = this.provider === 'ollama'
        ? `${this.ollamaEndpoint}/api/embeddings`
        : `http://${LLAMA_HOST}:${LLAMA_PORT}/embedding`

      const body = this.provider === 'ollama'
        ? JSON.stringify({ model: this.ollamaModel, prompt: text })
        : JSON.stringify({ content: text })

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(15_000)
      })
      
      if (!response.ok) return []
      const data = await response.json()
      return this.provider === 'ollama' ? (data.embedding ?? []) : (data.embedding ?? [])
    } catch {
      return []
    }
  }

  // ── Status ──────────────────────────────────────────────────────

  getStatus(): AIStatusInfo {
    return this.status
  }

  private updateStatus(status: AIStatusInfo): void {
    this.status = status
    this.statusListeners.forEach(l => l(status))
  }

  onStatusChange(listener: (status: AIStatusInfo) => void): () => void {
    this.statusListeners.push(listener)
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener)
    }
  }
}

// Combines a mandatory timeout signal with an optional caller-provided
// cancellation signal, so a request aborts on whichever fires first.
function combineSignals(timeoutSignal: AbortSignal, extra?: AbortSignal): AbortSignal {
  if (!extra) return timeoutSignal
  if (typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any([timeoutSignal, extra])
  }
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  timeoutSignal.addEventListener('abort', onAbort)
  extra.addEventListener('abort', onAbort)
  if (extra.aborted) controller.abort()
  return controller.signal
}
