import { Suspense } from 'react'

export default function FeedLayout({
  children,
  filters,
}: {
  children: React.ReactNode
  filters: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">{children}</div>
        <Suspense fallback={null}>{filters}</Suspense>
      </div>
    </div>
  )
}
