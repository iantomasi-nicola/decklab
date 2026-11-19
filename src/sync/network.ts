export interface NetworkMonitor {
  isOnline(): boolean
  /** Notifica i cambi di connettivita'; ritorna la disiscrizione. */
  subscribe(cb: (online: boolean) => void): () => void
}

export function createBrowserNetwork(): NetworkMonitor {
  const has = typeof window !== 'undefined' && typeof navigator !== 'undefined'
  return {
    isOnline: () => (has ? navigator.onLine : true),
    subscribe(cb) {
      if (!has) return () => {}
      const on = () => cb(true)
      const off = () => cb(false)
      window.addEventListener('online', on)
      window.addEventListener('offline', off)
      return () => {
        window.removeEventListener('online', on)
        window.removeEventListener('offline', off)
      }
    },
  }
}

/** Monitor controllabile a mano (test). */
export function createManualNetwork(initial = true): NetworkMonitor & { set(online: boolean): void } {
  let online = initial
  const subs = new Set<(o: boolean) => void>()
  return {
    isOnline: () => online,
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    set(v) {
      if (v === online) return
      online = v
      subs.forEach((cb) => cb(v))
    },
  }
}
