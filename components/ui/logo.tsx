export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M22 16a7 7 0 1 1-7-7 5 5 0 1 0 7 7z" fill="var(--bg)" />
    </svg>
  )
}
