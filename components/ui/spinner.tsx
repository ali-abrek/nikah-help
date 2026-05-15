import { cn } from '@/lib/utils/cn'

export function Spinner({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        'inline-block rounded-full border-[2.5px] border-[var(--divider-strong)] border-t-[var(--primary)]',
        className,
      )}
      style={{
        width: size,
        height: size,
        animation: 'spin 0.8s linear infinite',
      }}
    />
  )
}

export function Skeleton({
  className,
  w = '100%',
  h = 16,
  r = 6,
}: {
  className?: string
  w?: number | string
  h?: number | string
  r?: number
}) {
  return (
    <div
      className={cn('animate-[shimmer_1.4s_linear_infinite]', className)}
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background:
          'linear-gradient(90deg, var(--surface-2), var(--divider), var(--surface-2))',
        backgroundSize: '200% 100%',
      }}
    />
  )
}
