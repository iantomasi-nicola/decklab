/** Marchio: due carte sovrapposte (stesso disegno di public/icon.svg). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 512 512" className="shrink-0">
      <rect width="512" height="512" rx="112" fill="var(--surface-2)" />
      <rect x="150" y="96" width="212" height="300" rx="24" fill="var(--accent)" />
      <rect x="200" y="140" width="212" height="300" rx="24" fill="var(--fg)" opacity=".9" transform="rotate(8 306 290)" />
    </svg>
  )
}
