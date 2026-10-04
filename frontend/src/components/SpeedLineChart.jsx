import React, { useMemo } from 'react'
import { LINK_COLORS, formatSpeed } from '../utils/formatters'

export default function SpeedLineChart({ history = [], download, interfaces = [] }) {
  // Map link_id to a friendly adapter name
  const getLinkName = (linkId, ip) => {
    const iface = interfaces.find((i) => i.ip === ip || i.id === linkId)
    if (iface) return iface.friendly_label || iface.adapter_name
    return ip || linkId
  }

  const activeLinks = useMemo(() => {
    if (!download?.links) return []
    return Object.entries(download.links).map(([k, v], idx) => ({
      linkId: k,
      ip: v.ip,
      name: getLinkName(k, v.ip),
      currentSpeed: v.current_speed_bps || 0,
      color: LINK_COLORS[idx % LINK_COLORS.length],
    }))
  }, [download, interfaces])

  // Process data points (minimum 2 points)
  const chartData = useMemo(() => {
    if (!history || history.length < 2) {
      // Create a 2-point baseline from current state
      const now = Date.now()
      return [
        { time: now - 1000, links: activeLinks.reduce((acc, l) => ({ ...acc, [l.linkId]: l.currentSpeed }), {}) },
        { time: now, links: activeLinks.reduce((acc, l) => ({ ...acc, [l.linkId]: l.currentSpeed }), {}) },
      ]
    }
    return history.slice(-30) // last 30 samples (~30 seconds)
  }, [history, activeLinks])

  // Calculate Y-axis max scale
  const { maxSpeedMBs, yTicks } = useMemo(() => {
    let peakMBs = 1.0
    chartData.forEach((pt) => {
      if (pt.links) {
        Object.values(pt.links).forEach((speed) => {
          const mbs = (speed || 0) / (1024 * 1024)
          if (mbs > peakMBs) peakMBs = mbs
        })
      }
    })
    // Round peak to nice clean ceiling
    let ceiling = 10
    if (peakMBs > 100) ceiling = Math.ceil(peakMBs / 25) * 25
    else if (peakMBs > 50) ceiling = Math.ceil(peakMBs / 10) * 10
    else if (peakMBs > 20) ceiling = Math.ceil(peakMBs / 5) * 5
    else if (peakMBs > 10) ceiling = Math.ceil(peakMBs / 2) * 2
    else ceiling = Math.max(5, Math.ceil(peakMBs))

    return {
      maxSpeedMBs: ceiling,
      yTicks: [ceiling, Math.round(ceiling / 2), 0],
    }
  }, [chartData])

  // Coordinate math
  const width = 640
  const height = 120
  const padLeft = 52
  const padRight = 140 // Room for direct line labels
  const padTop = 12
  const padBottom = 20

  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  const timeMin = chartData[0]?.time || 0
  const timeMax = chartData[chartData.length - 1]?.time || 1
  const timeSpan = Math.max(timeMax - timeMin, 1)

  const getX = (t) => padLeft + ((t - timeMin) / timeSpan) * plotW
  const getY = (speedBps) => {
    const mbs = (speedBps || 0) / (1024 * 1024)
    const ratio = Math.min(1.0, Math.max(0.0, mbs / maxSpeedMBs))
    return padTop + plotH - ratio * plotH
  }

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Throughput Telemetry</span>
        <span className="mono">Last 30 seconds • Max scale: {maxSpeedMBs} MB/s</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" preserveAspectRatio="none">
        {/* Horizontal grid lines & Y labels */}
        {yTicks.map((val) => {
          const y = padTop + plotH - (val / maxSpeedMBs) * plotH
          return (
            <g key={val}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotW}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fill="var(--text-secondary)"
              >
                {val} MB/s
              </text>
            </g>
          )
        })}

        {/* X axis baseline */}
        <line
          x1={padLeft}
          y1={padTop + plotH}
          x2={padLeft + plotW}
          y2={padTop + plotH}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />

        {/* X axis labels */}
        <text x={padLeft} y={height - 4} fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-muted)">
          -30s
        </text>
        <text
          x={padLeft + plotW / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill="var(--text-muted)"
        >
          -15s
        </text>
        <text
          x={padLeft + plotW}
          y={height - 4}
          textAnchor="end"
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill="var(--text-muted)"
        >
          0s
        </text>

        {/* Link Speed Lines with Direct Labels at line ends */}
        {activeLinks.map((link) => {
          const points = chartData.map((pt) => {
            const spd = pt.links?.[link.linkId] || 0
            return { x: getX(pt.time), y: getY(spd) }
          })

          if (points.length === 0) return null

          const pathD = points.reduce((acc, p, idx) => {
            return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`
          }, '')

          const lastPoint = points[points.length - 1]
          const currentSpeedText = formatSpeed(link.currentSpeed)

          return (
            <g key={link.linkId}>
              {/* Line path */}
              <path
                d={pathD}
                fill="none"
                stroke={link.color}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* End circle */}
              <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={link.color} />

              {/* Direct label at line end */}
              <text
                x={lastPoint.x + 6}
                y={lastPoint.y + 3}
                fill={link.color}
                fontSize="10.5"
                fontWeight="600"
                fontFamily="var(--font-ui)"
              >
                {link.name}: <tspan fontFamily="var(--font-mono)">{currentSpeedText}</tspan>
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
