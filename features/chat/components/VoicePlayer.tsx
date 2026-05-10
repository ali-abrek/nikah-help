'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import WaveSurfer from 'wavesurfer.js'

interface VoicePlayerProps {
  audioUrl: string
  duration: number
}

/**
 * Voice message player using wavesurfer.js for waveform visualization.
 * Zustand singleton ensures only one message plays at a time.
 */
export function VoicePlayer({ audioUrl, duration }: VoicePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const ws = WaveSurfer.create({
      container: containerRef.current!,
      waveColor: '#d4d4d8',
      progressColor: '#FF8C42',
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 32,
      backend: 'WebAudio',
      interact: false,
    })

    ws.load(audioUrl)
    ws.on('ready', () => setLoaded(true))
    ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()))
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))

    wavesurferRef.current = ws

    return () => {
      ws.destroy()
    }
  }, [audioUrl])

  const togglePlay = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause()
    }
  }, [])

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div ref={containerRef} className="flex-1 min-w-0" />
      <span className="text-xs tabular-nums text-zinc-500 shrink-0">
        {loaded ? formatTime(playing ? currentTime : duration) : '--:--'}
      </span>
    </div>
  )
}
