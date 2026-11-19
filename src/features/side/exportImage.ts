/**
 * Immagine PNG del piano di side, disegnata su canvas (nessuna dipendenza dal DOM dell'app).
 * Verticale 1080×1920 oppure orizzontale 1920×1080: titolo del matchup, mazzo dopo il side con le carte che entrano
 * in verde e quelle che escono in rosso, elenco "− OUT / + IN" con i conteggi e i nomi nella lingua scelta.
 * Le immagini delle carte arrivano da `imageUrl` (se mancano o falliscono si disegna un segnaposto con il nome).
 */
export type Orientation = 'portrait' | 'landscape'

export interface ExportCard {
  cardId: number
  /** Passcode dell'artwork da mostrare. */
  shownId: number
  name: string
  keep: number
  out: number
  in: number
}

export interface ExportLine {
  name: string
  count: number
}

export interface ExportInput {
  title: string
  subtitle: string
  cards: ExportCard[]
  outs: ExportLine[]
  ins: ExportLine[]
  labels: { out: string; in: string; main: string; noSwaps: string; footer: string }
  orientation: Orientation
  imageUrl?: (id: number) => string | null
  /** Per i test: salta il caricamento delle immagini. */
  skipImages?: boolean
}

export const SIZES: Record<Orientation, { w: number; h: number }> = {
  portrait: { w: 1080, h: 1920 },
  landscape: { w: 1920, h: 1080 },
}

const C = {
  bg: '#0e1015',
  surface: '#14171d',
  surface2: '#191d26',
  line: '#2a3040',
  fg: '#eceef5',
  muted: '#a3abbd',
  ok: '#5fd39a',
  okFill: 'rgba(95,211,154,0.18)',
  danger: '#ff6b6b',
  dangerSolid: '#c93a3a',
  dangerFill: 'rgba(255,107,107,0.32)',
  accent: '#a89dff',
}
const FONT = '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const font = (weight: number, px: number) => `${weight} ${px}px ${FONT}`

/** Sceglie colonne e dimensione carta per far entrare `n` carte (59:86) nell'area, con la carta più grande possibile. */
export function fitGrid(n: number, w: number, h: number, gap: number): { cols: number; cw: number; ch: number; rows: number } {
  let best = { cols: 1, cw: 1, ch: 1.46, rows: Math.max(1, n) }
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const cw = (w - (cols - 1) * gap) / cols
    const ch = (cw * 86) / 59
    const rows = Math.ceil(n / cols)
    if (rows * ch + (rows - 1) * gap <= h && cw > best.cw) best = { cols, cw, ch, rows }
  }
  // niente di troppo grande se le carte sono poche: massimo 1/3 della larghezza
  if (best.cw > w / 3) {
    const cw = w / 3
    best = { cols: Math.max(1, Math.floor((w + gap) / (cw + gap))), cw, ch: (cw * 86) / 59, rows: 0 }
    best.rows = Math.ceil(n / best.cols)
  }
  return best
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= maxW) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo).trimEnd()}…`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= maxW || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = ellipsize(ctx, `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxW)
    return kept
  }
  return lines
}

function loadImage(url: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = setTimeout(() => resolve(null), timeoutMs)
    img.onload = () => {
      clearTimeout(t)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(t)
      resolve(null)
    }
    img.src = url
  })
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, fill: string, color: string, px: number, anchor: 'left' | 'right' = 'left') {
  ctx.font = font(800, px)
  const w = Math.max(h, ctx.measureText(text).width + h * 0.7)
  const left = anchor === 'left' ? x : x - w
  ctx.fillStyle = fill
  rr(ctx, left, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + w / 2, y + h / 2 + 1)
  ctx.textAlign = 'left'
}

function drawCard(ctx: CanvasRenderingContext2D, c: ExportCard, img: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  const r = Math.max(4, w * 0.06)
  const gone = c.keep + c.in === 0
  ctx.save()
  rr(ctx, x, y, w, h, r)
  ctx.clip()
  if (img) {
    ctx.globalAlpha = gone ? 0.55 : 1
    ctx.drawImage(img, x, y, w, h)
    ctx.globalAlpha = 1
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h)
    g.addColorStop(0, '#241f4d')
    g.addColorStop(0.6, '#212633')
    g.addColorStop(1, '#191d26')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = 'rgba(168,157,255,0.45)'
    ctx.lineWidth = Math.max(1, w * 0.012)
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h * 0.4, w * 0.26, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = C.fg
    ctx.globalAlpha = gone ? 0.6 : 1
    const px = Math.max(10, Math.round(w * 0.1))
    ctx.font = font(600, px)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const lines = wrap(ctx, c.name, w * 0.86, 3)
    const startY = y + h * 0.56
    lines.forEach((l, i) => ctx.fillText(l, x + w / 2, startY + (i + 1) * px * 1.22))
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }
  if (c.in > 0) {
    ctx.fillStyle = C.okFill
    ctx.fillRect(x, y, w, h)
  }
  if (c.out > 0 && gone) {
    ctx.fillStyle = C.dangerFill
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = C.danger
    ctx.lineWidth = Math.max(3, w * 0.035)
    ctx.beginPath()
    ctx.moveTo(x + w * 0.08, y + h * 0.92)
    ctx.lineTo(x + w * 0.92, y + h * 0.08)
    ctx.stroke()
  }
  ctx.restore()
  // cornice
  if (c.in > 0 || c.out > 0) {
    const bw = Math.max(3, w * 0.05)
    ctx.strokeStyle = c.in > 0 ? C.ok : C.danger
    ctx.lineWidth = bw
    rr(ctx, x + bw / 2, y + bw / 2, w - bw, h - bw, r)
    ctx.stroke()
  }
  // badge
  const ph = Math.max(18, w * 0.2)
  const px = Math.max(11, ph * 0.62)
  const pad = Math.max(4, w * 0.05) + (c.in > 0 || c.out > 0 ? Math.max(3, w * 0.05) : 0)
  let bx = x + pad
  const by = y + h - ph - pad
  if (c.out > 0) {
    pill(ctx, `−${c.out}`, bx, by, ph, C.dangerSolid, '#ffffff', px)
    bx += Math.max(ph, ctx.measureText(`−${c.out}`).width + ph * 0.7) + 4
  }
  if (c.in > 0) pill(ctx, `+${c.in}`, bx, by, ph, C.ok, '#0e1015', px)
  const remaining = c.keep + c.in
  if (remaining > 1) pill(ctx, `×${remaining}`, x + w - pad, by, ph, 'rgba(14,16,21,0.9)', C.fg, px, 'right')
}

function drawList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, lineH: number, title: string, items: ExportLine[], tone: 'out' | 'in', empty: string): number {
  const color = tone === 'out' ? C.danger : C.ok
  const sign = tone === 'out' ? '−' : '+'
  const total = items.reduce((n, i) => n + i.count, 0)
  const headH = 52
  ctx.fillStyle = tone === 'out' ? 'rgba(255,107,107,0.12)' : 'rgba(95,211,154,0.12)'
  rr(ctx, x, y, w, headH, 14)
  ctx.fill()
  ctx.fillStyle = color
  ctx.font = font(800, 28)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(`${sign} ${title}`, x + 18, y + headH / 2 + 1)
  ctx.textAlign = 'right'
  ctx.fillText(`${sign}${total}`, x + w - 18, y + headH / 2 + 1)
  ctx.textAlign = 'left'
  const px = Math.round(Math.min(30, lineH * 0.68))
  ctx.font = font(500, px)
  if (!items.length) {
    ctx.fillStyle = C.muted
    ctx.fillText(empty, x + 18, y + headH + 12 + lineH / 2)
    return headH + 12 + lineH
  }
  items.forEach((it, i) => {
    const cy = y + headH + 12 + i * lineH + lineH / 2
    ctx.fillStyle = color
    ctx.font = font(800, px)
    const tag = `${sign}${it.count}`
    ctx.fillText(tag, x + 18, cy)
    ctx.fillStyle = C.fg
    ctx.font = font(500, px)
    const off = 18 + Math.max(60, ctx.measureText('+3').width + 18)
    ctx.fillText(ellipsize(ctx, it.name, w - off - 12), x + off, cy)
  })
  return headH + 12 + items.length * lineH
}

const LIST_HEAD = 52 + 12
/** Altezza di riga: 44 px se c'è spazio, altrimenti si stringe (mai sotto 26). */
const lineHeightFor = (free: number, rows: number) => Math.max(26, Math.min(44, Math.floor((free - LIST_HEAD * 2) / Math.max(2, rows))))

export async function renderSidePlanCanvas(input: ExportInput): Promise<HTMLCanvasElement> {
  const { w: W, h: H } = SIZES[input.orientation]
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas non disponibile')

  try {
    await Promise.all([document.fonts.load(font(600, 32)), document.fonts.load(font(800, 32))])
  } catch {
    /* font di ripiego */
  }
  const images = new Map<number, HTMLImageElement | null>()
  if (!input.skipImages && input.imageUrl) {
    await Promise.all(
      input.cards.map(async (c) => {
        const url = input.imageUrl?.(c.shownId)
        images.set(c.shownId, url ? await loadImage(url) : null)
      }),
    )
  }

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  const pad = 56
  const portrait = input.orientation === 'portrait'

  const header = (x: number, y: number, maxW: number): number => {
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = C.fg
    ctx.font = font(800, portrait ? 68 : 60)
    const lines = wrap(ctx, input.title, maxW, 2)
    const lh = portrait ? 78 : 70
    lines.forEach((l, i) => ctx.fillText(l, x, y + 60 + i * lh))
    let yy = y + 60 + (lines.length - 1) * lh
    ctx.fillStyle = C.muted
    ctx.font = font(500, 30)
    const sub = wrap(ctx, input.subtitle.replace(/ · /g, '\u00A0· '), maxW, 2)
    sub.forEach((l, i) => ctx.fillText(l, x, yy + 52 + i * 38))
    yy += 52 + (sub.length - 1) * 38
    return yy + 28
  }

  const footerH = 56
  const maxLines = Math.max(input.outs.length, input.ins.length, 1)

  if (portrait) {
    const contentW = W - pad * 2
    let y = header(pad, pad - 8, contentW)
    const colW = (contentW - 24) / 2
    const lh = Math.max(26, Math.min(44, Math.floor(680 / Math.max(1, Math.min(maxLines, 15)))))
    const listH = Math.max(
      drawList(ctx, pad, y, colW, lh, input.labels.out, input.outs, 'out', input.labels.noSwaps),
      drawList(ctx, pad + colW + 24, y, colW, lh, input.labels.in, input.ins, 'in', input.labels.noSwaps),
    )
    y += listH + 36
    ctx.fillStyle = C.muted
    ctx.font = font(700, 26)
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(input.labels.main, pad, y + 20)
    y += 40
    const area = { x: pad, y, w: contentW, h: H - y - footerH - 24 }
    drawGrid(ctx, input, images, area)
  } else {
    const rightW = 640
    const gridW = W - pad * 2 - rightW - 48
    const rx = W - pad - rightW
    let y = header(rx, pad - 8, rightW)
    const free = H - y - footerH - 24 - 24
    const lh = lineHeightFor(free, Math.max(1, input.outs.length) + Math.max(1, input.ins.length))
    const outH = drawList(ctx, rx, y, rightW, lh, input.labels.out, input.outs, 'out', input.labels.noSwaps)
    drawList(ctx, rx, y + outH + 24, rightW, lh, input.labels.in, input.ins, 'in', input.labels.noSwaps)
    y = pad
    ctx.fillStyle = C.muted
    ctx.font = font(700, 26)
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(input.labels.main, pad, y + 20)
    y += 40
    drawGrid(ctx, input, images, { x: pad, y, w: gridW, h: H - y - footerH - 24 })
  }

  ctx.fillStyle = C.muted
  ctx.font = font(600, 24)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText(input.labels.footer, pad, H - 36)
  ctx.fillStyle = C.accent
  ctx.fillRect(pad, H - footerH - 14, 56, 4)
  return canvas
}

function drawGrid(ctx: CanvasRenderingContext2D, input: ExportInput, images: Map<number, HTMLImageElement | null>, area: { x: number; y: number; w: number; h: number }) {
  const gap = 12
  const g = fitGrid(input.cards.length, area.w, area.h, gap)
  input.cards.forEach((c, i) => {
    const col = i % g.cols
    const row = Math.floor(i / g.cols)
    drawCard(ctx, c, images.get(c.shownId) ?? null, area.x + col * (g.cw + gap), area.y + row * (g.ch + gap), g.cw, g.ch)
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

/** PNG del piano. Se un'immagine esterna "sporca" il canvas (CORS) si ridisegna con i segnaposto. */
export async function renderSidePlanPng(input: ExportInput): Promise<Blob> {
  try {
    return await canvasToBlob(await renderSidePlanCanvas(input))
  } catch {
    return canvasToBlob(await renderSidePlanCanvas({ ...input, skipImages: true }))
  }
}
