/** QR code per i link combo: correzione errori bassa (L) per ridurre la densità; avviso se il link è troppo lungo. */
import QRCode from 'qrcode'

/** Oltre questa lunghezza il QR diventa molto denso e difficile da inquadrare. */
export const QR_WARN_CHARS = 1200
/** Capacità massima in byte-mode a livello L (versione 40). */
export const QR_MAX_CHARS = 2953

export type QrWarning = 'combo.qr.long' | 'combo.qr.tooLong'
export interface QrResult {
  svg: string | null // null se troppo lungo
  length: number
  warning?: QrWarning
}

export async function buildQr(text: string): Promise<QrResult> {
  const length = text.length
  if (length > QR_MAX_CHARS) return { svg: null, length, warning: 'combo.qr.tooLong' }
  const svg = await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'L', margin: 2 })
  return { svg, length, ...(length > QR_WARN_CHARS ? { warning: 'combo.qr.long' as const } : {}) }
}

export async function buildQrDataUrl(text: string): Promise<string | null> {
  if (text.length > QR_MAX_CHARS) return null
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'L', margin: 2 })
}
