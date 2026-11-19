import { useLayoutEffect, useRef, type RefObject } from 'react'

export const MOVE_MS = 220
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Animazione FLIP delle carte (`[data-card]`) quando cambia `key` (fotogramma): ogni carta già presente scivola dalla vecchia
 * alla nuova posizione, quelle nuove appaiono in dissolvenza. Solo `transform`/`opacity`, 150–250 ms; nessuna animazione con
 * prefers-reduced-motion, né se il contenitore è stato ridimensionato tra due fotogrammi.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, key: unknown) {
  const prev = useRef<{ rects: Map<string, { x: number; y: number }>; w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const box = root.getBoundingClientRect()
    const rects = new Map<string, { x: number; y: number }>()
    const before = prev.current
    const animate = !!before && !prefersReducedMotion() && Math.abs(before.w - box.width) < 1 && Math.abs(before.h - box.height) < 1
    for (const el of root.querySelectorAll<HTMLElement>('[data-card]')) {
      const uid = el.dataset.card!
      const r = el.getBoundingClientRect()
      const at = { x: r.left - box.left, y: r.top - box.top }
      rects.set(uid, at)
      if (!animate || typeof el.animate !== 'function') continue
      const old = before!.rects.get(uid)
      if (!old) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE })
        continue
      }
      const dx = old.x - at.x
      const dy = old.y - at.y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: MOVE_MS, easing: EASE })
    }
    prev.current = { rects, w: box.width, h: box.height }
  }, [ref, key])
}
