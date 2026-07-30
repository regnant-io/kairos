// src/renderer/src/hooks/useIPC.ts
// Type-safe wrapper around window.electron.invoke

import type { KairosInvokeChannels } from '@shared/ipc-types'

type Awaited<T> = T extends Promise<infer U> ? U : T

export async function ipc<K extends keyof KairosInvokeChannels>(
  channel: K,
  ...args: Parameters<KairosInvokeChannels[K]>
): Promise<Awaited<ReturnType<KairosInvokeChannels[K]>>> {
  return (window as any).electron.invoke(channel, ...args)
}

export function onEvent(channel: string, callback: (...args: any[]) => void): () => void {
  return (window as any).electron.on(channel, callback)
}
