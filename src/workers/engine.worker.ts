/// <reference lib="webworker" />
/**
 * Web Worker del motore EDOPro: core wasm sync, script Lua, duello e normalizzatore girano qui, mai sul main thread.
 * Protocollo in src/engine/protocol.ts; client tipizzato in src/engine/client.ts.
 */
import { browserSources } from '@/engine/browserSources'
import { EngineHost } from '@/engine/host'
import { EngineError } from '@/engine/session'
import type { EngineEvent, EngineOut, EngineRequestEnvelope } from '@/engine/protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope
const post = (m: EngineOut) => ctx.postMessage(m)
const host = new EngineHost(browserSources((e: EngineEvent) => post({ type: 'event', ...e })))

// le richieste sono serializzate: un duello alla volta, nell'ordine di arrivo
let queue: Promise<unknown> = Promise.resolve()

ctx.onmessage = (ev: MessageEvent<EngineRequestEnvelope>) => {
  const { id, ...req } = ev.data
  queue = queue.then(async () => {
    try {
      post({ id, ok: true, result: await host.handle(req) })
    } catch (err) {
      post({
        id, ok: false, error: err instanceof Error ? err.message : String(err),
        ...(err instanceof EngineError ? { code: err.code } : { code: 'core' as const }),
      })
    }
  })
}
