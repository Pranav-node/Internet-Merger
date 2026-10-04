import React, { useMemo } from 'react'
import { Activity } from 'lucide-react'
import { formatSpeed } from '../utils/formatters'

const LINK_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']

export default function LiveSpeedGraph({
  history = [],
  links = {},
  height = 105,
  isCompleted = false,
  status = 'downloading',
}) {
  const width = 500
  const padding = { top: 12, right: 12, bottom: 22, left: 12 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const linkKeys = Object.keys(links)

  // Check if meaningful speed data is present
  const hasMeaningfulData = useMemo(() => {
    if (!history || history.length < 2) return false
    return history.some(
      (point) =>
        (point.total || 0) > 1024 ||
        Object.values(point.links || {}).some((v) => (v || 0) > 1024)
    )
  }, [history])

  const { maxSpeed, seriesData } = useMemo(() => {
    if (!hasMeaningfulData) {
      return { maxSpeed: 1024 * 1024, seriesData: {} }
    }

    let maxVal = 1024 * 1024 // Minimum scale of 1 MB/s
    history.forEach((point) => {
      if (point.total > maxVal) maxVal = point.total
      Object.values(point.links || {}).forEach((val) => {
        if (val > maxVal) maxVal = val
      })
    })

    // Add 10% headroom
    maxVal = maxVal * 1.1

    const sData = {}
    linkKeys.forEach((key) => {
      sData[key] = []
    })

    const n = history.length
    history.forEach((point, idx) => {
      const x = padding.left + (idx / Math.max(1, n - 1)) * chartWidth
      linkKeys.forEach((key) => {
        const val = (point.links && point.links[key]) || 0
        const y = padding.top + chartHeight - (val / maxVal) * chartHeight
        sData[key].push({ x, y, val })
      })
    })

    return { maxSpeed: maxVal, seriesData: sData }
  }, [history, linkKeys, hasMeaningfulData, chartWidth, chartHeight])

  // Convert points array to smooth SVG path
  const makeSmoothPath = (pts) => {
    if (!pts || pts.length === 0) return ''
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`

    let d = `M ${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2

      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
    }
    return d
  }

  // Handle empty state gracefully without leaving a large awkward blank box
  if (!hasMeaningfulData) {
    if (isCompleted || status === 'completed') {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            fontSize: '0.78125rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
            <Activity size={14} color="var(--accent-green)" />
            <span>Speed History</span>
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Completed session transfer
          </span>
        </div>
      )
    }

    // Active download warming up
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          fontSize: '0.78125rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
          <Activity size={14} color="var(--accent-red)" />
          <span>Live Multi-Link Speed Monitor</span>
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Measuring live connection speeds...
        </span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Live Link Speeds (Multi-Link Monitor)
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Peak: {formatSpeed(maxSpeed / 1.1)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: `${height}px`,
          background: 'rgba(15, 23, 42, 0.45)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          display: 'block',
        }}
      >
        <defs>
          {linkKeys.map((key, i) => {
            const color = LINK_COLORS[i % LINK_COLORS.length]
            return (
              <linearGradient
                key={`grad-${key}`}
                id={`grad-${key}`}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            )
          })}
        </defs>

        {/* Grid lines */}
        {[0, 0.33, 0.66, 1].map((ratio) => {
          const y = padding.top + chartHeight * ratio
          return (
            <line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeDasharray="3 3"
            />
          )
        })}

        {/* Series paths */}
        {linkKeys.map((key, i) => {
          const color = LINK_COLORS[i % LINK_COLORS.length]
          const pts = seriesData[key] || []
          if (pts.length < 2) return null

          const linePath = makeSmoothPath(pts)
          const firstX = pts[0].x
          const lastX = pts[pts.length - 1].x
          const bottomY = padding.top + chartHeight
          const areaPath = `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`

          return (
            <g key={key}>
              <path d={areaPath} fill={`url(#grad-${key})`} />
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}
      </svg>

      {/* Legend with Connection Status */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
        {linkKeys.map((key, i) => {
          const color = LINK_COLORS[i % LINK_COLORS.length]
          const curSpeed = links[key]?.current_speed_bps || 0
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.75rem',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span style={{ color: 'var(--text-secondary)' }}>{key}:</span>
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {formatSpeed(curSpeed)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
