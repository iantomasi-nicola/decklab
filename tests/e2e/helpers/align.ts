import type { Page } from '@playwright/test'

/**
 * Controlli di allineamento estetico (non solo overflow): barre segmentate (opzioni di uguale larghezza,
 * nessuno spazio vuoto, testo non troncato, target >= 44px), pulsanti/chip con testo tagliato, tab con testo spezzato.
 */
export async function alignmentIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = []
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const desc = (el: Element) => `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}]`
    // barre segmentate
    document.querySelectorAll('div[role="group"]').forEach((g) => {
      const items = [...g.querySelectorAll(':scope > button[role="radio"]')]
      if (items.length < 2 || !vis(g)) return
      const rects = items.map((i) => i.getBoundingClientRect())
      const w0 = rects[0]!.width
      if (rects.some((r) => Math.abs(r.width - w0) > 1.5)) bad.push(`segmented larghezze diverse: ${desc(g)} ${rects.map((r) => Math.round(r.width)).join('/')}`)
      const gr = g.getBoundingClientRect()
      const left = rects[0]!.left - gr.left
      const right = gr.right - rects[rects.length - 1]!.right
      if (left > 6 || right > 6) bad.push(`segmented con spazio vuoto: ${desc(g)} sx${Math.round(left)} dx${Math.round(right)}`)
      if (rects.some((r) => r.height < 43.5)) bad.push(`segmented target <44px: ${desc(g)}`)
      items.forEach((i) => {
        const span = i.querySelector('span:last-child')
        if (span && span.scrollWidth > span.clientWidth + 1) bad.push(`segmented testo troncato: ${desc(i)}`)
      })
    })
    // pulsanti, tab, chip, badge: testo tagliato
    document.querySelectorAll('button, [role="tab"], [data-slot="badge"], a').forEach((el) => {
      if (!vis(el)) return
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll') bad.push(`testo tagliato: ${desc(el)}`)
    })
    // tab: etichetta su piu righe
    document.querySelectorAll('[role="tab"]').forEach((el) => {
      if (vis(el) && el.getBoundingClientRect().height > 60) bad.push(`tab a piu righe: ${desc(el)}`)
    })
    return bad
  })
}
