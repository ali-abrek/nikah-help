'use client'

interface TypingIndicatorProps {
  name: string
}

export function TypingIndicator({ name }: TypingIndicatorProps) {
  return (
    <div className="px-4 py-1">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className="flex gap-0.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
        </div>
        <span>{name} печатает...</span>
      </div>
    </div>
  )
}
