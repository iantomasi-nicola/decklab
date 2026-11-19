import { useCallback, useState } from 'react'
import { cn } from '@/ui/cn'
import { cardImageUrl } from './api'

export interface CardImageProps {
  /** Passcode della carta (può essere quello di un artwork alternativo). */
  id: number
  size?: 'small' | 'full'
  /** Nome della carta: testo alternativo e scritta sul dorso quando manca l'immagine. */
  alt?: string
  /** La larghezza si decide qui (es. "w-24"); l'altezza segue da aspect-ratio 59:86. */
  className?: string
  /** Immagine "above the fold": niente lazy loading. */
  eager?: boolean
}

/**
 * Immagine carta con rapporto fisso 59:86 (nessun layout shift), skeleton in caricamento
 * e dorso carta con nome se l'immagine non c'è (variabile VITE_IMAGE_BASE_URL assente) o fallisce.
 * Non scarica mai da domini esterni: l'URL viene solo da cardImageUrl().
 */
export function CardImage({ id, size = 'small', alt = '', className, eager }: CardImageProps) {
  const url = cardImageUrl(id, size)
  // ricordiamo per quale URL è fallito/caricato: al cambio di id lo stato si azzera da solo
  const [failed, setFailed] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<string | null>(null)
  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      // immagine già in cache: onLoad può essere partito prima del montaggio
      if (img?.complete && img.naturalWidth > 0 && url) setLoaded(url)
    },
    [url],
  )
  const showImage = !!url && failed !== url
  const isLoaded = !!url && loaded === url

  return (
    <div
      className={cn('relative block w-full select-none overflow-hidden rounded-[6px] bg-surface-3', className)}
      style={{ aspectRatio: '59 / 86', containerType: 'inline-size' }}
      data-card-id={id}
    >
      {showImage ? (
        <>
          {!isLoaded && <div aria-hidden className="skeleton absolute inset-0 rounded-none" />}
          <img
            key={url}
            ref={ref}
            src={url}
            alt={alt}
            width={59}
            height={86}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            crossOrigin="anonymous"
            onLoad={() => setLoaded(url)}
            onError={() => setFailed(url)}
            className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-200', isLoaded ? 'opacity-100' : 'opacity-0')}
          />
        </>
      ) : (
        <CardBack name={alt} />
      )}
    </div>
  )
}

/** Dorso carta elegante: cornice, ovale con girale, nome in basso. Solo token del tema. */
function CardBack({ name }: { name: string }) {
  return (
    <div
      role="img"
      aria-label={name}
      className="absolute inset-0 flex flex-col items-center justify-between border border-line-strong p-[7%] text-center"
      style={{ background: 'linear-gradient(160deg, var(--accent-soft) 0%, var(--surface-3) 55%, var(--surface-2) 100%)' }}
    >
      <svg aria-hidden viewBox="0 0 100 100" className="my-auto w-[62%] text-accent-text" fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="44" strokeWidth="1.5" opacity=".55" />
        <circle cx="50" cy="50" r="33" strokeWidth="1" opacity=".4" />
        <path d="M50 8c20 14 28 34 0 42S30 80 50 92M50 8C30 22 22 42 50 50s20 30 0 42" strokeWidth="1.6" opacity=".85" />
        <circle cx="50" cy="50" r="5" fill="currentColor" stroke="none" opacity=".9" />
      </svg>
      {name ? (
        <span className="line-clamp-3 w-full text-[clamp(9px,7cqw,13px)] font-medium leading-tight text-fg-muted [text-wrap:balance]">
          {name}
        </span>
      ) : null}
    </div>
  )
}
