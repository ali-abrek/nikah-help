'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface VoiceRecorderProps {
  chatId: string
  onSend: (blob: Blob, duration: number) => Promise<void>
}

const MAX_DURATION = 90 // seconds

export function VoiceRecorder({ chatId, onSend }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [sending, setSending] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const actualDuration = duration

        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop())

        if (actualDuration < 1) return // Too short, discard

        setSending(true)
        try {
          await onSend(blob, actualDuration)
        } finally {
          setSending(false)
          setDuration(0)
        }
      }

      mediaRecorder.start()
      setRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= MAX_DURATION - 1) {
            mediaRecorder.stop()
            return prev + 1
          }
          return prev + 1
        })
      }, 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }, [onSend, duration])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    setRecording(false)
  }, [])

  useEffect(() => {
    if (duration >= MAX_DURATION) {
      stopRecording()
    }
  }, [duration, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop()
      }
    }
  }, [])

  if (sending) {
    return (
      <button
        type="button"
        disabled
        className="shrink-0 rounded-lg p-2 text-zinc-400"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </button>
    )
  }

  if (recording) {
    return (
      <button
        type="button"
        onClick={stopRecording}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-white',
          'bg-red-500 hover:bg-red-600 transition-colors animate-pulse',
        )}
      >
        <Square className="h-4 w-4" />
        <span className="text-xs tabular-nums">
          {MAX_DURATION - duration}с
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-primary transition-colors"
      aria-label="Записать голосовое сообщение"
    >
      <Mic className="h-5 w-5" />
    </button>
  )
}
