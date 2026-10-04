/**
 * Plain Utilitarian Formatters and Constants
 */

// User specified link colors, always in this order and used consistently everywhere:
// chip, chart line, segmented bar: #0E9F8E, #E8742C, #8A5CD0, #D63E7A
export const LINK_COLORS = [
  '#0E9F8E', // 0: Teal
  '#E8742C', // 1: Orange
  '#8A5CD0', // 2: Purple
  '#D63E7A', // 3: Magenta
]

export const OKABE_ITO_COLORS = LINK_COLORS

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '--'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const idx = Math.min(i, sizes.length - 1)
  return `${(bytes / Math.pow(k, idx)).toFixed(idx > 1 ? 2 : 1)} ${sizes[idx]}`
}

export function formatSpeed(bps) {
  if (bps === null || bps === undefined || bps < 1 || isNaN(bps)) return '0 B/s'
  return `${formatBytes(bps)}/s`
}

export function formatTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return '--'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hours}h ${remMins}m`
}

export function getStatusStyle(status) {
  switch (status?.toLowerCase()) {
    case 'downloading':
      return { label: 'Downloading', dotClass: 'downloading', tagClass: 'green' }
    case 'completed':
      return { label: 'Completed', dotClass: 'completed', tagClass: 'green' }
    case 'paused':
      return { label: 'Paused', dotClass: 'paused', tagClass: 'amber' }
    case 'probing':
      return { label: 'Probing', dotClass: 'probing', tagClass: 'neutral' }
    case 'queued':
      return { label: 'Queued', dotClass: 'queued', tagClass: 'neutral' }
    case 'failed':
      return { label: 'Failed', dotClass: 'failed', tagClass: 'red' }
    case 'cancelled':
      return { label: 'Cancelled', dotClass: 'cancelled', tagClass: 'neutral' }
    default:
      return { label: status || 'Unknown', dotClass: 'queued', tagClass: 'neutral' }
  }
}

import { useState, useEffect, useRef } from 'react'

export function useNumberTween(targetValue, duration = 150) {
  const [displayValue, setDisplayValue] = useState(targetValue)
  const prevValueRef = useRef(targetValue)
  const startTimeRef = useRef(null)
  const animFrameRef = useRef(null)

  useEffect(() => {
    const startVal = prevValueRef.current
    const diff = targetValue - startVal
    if (Math.abs(diff) < 0.01) {
      setDisplayValue(targetValue)
      prevValueRef.current = targetValue
      return
    }

    startTimeRef.current = performance.now()

    const step = (now) => {
      const elapsed = now - startTimeRef.current
      const progress = Math.min(1, elapsed / duration)
      const current = startVal + diff * (1 - Math.pow(1 - progress, 2))
      setDisplayValue(current)

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step)
      } else {
        setDisplayValue(targetValue)
        prevValueRef.current = targetValue
      }
    }

    animFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [targetValue, duration])

  return displayValue
}
