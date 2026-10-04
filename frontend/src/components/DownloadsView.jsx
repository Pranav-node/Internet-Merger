import React, { useState, useMemo } from 'react'
import { Plus, Search, X, Wifi, Network, Usb, Activity } from 'lucide-react'
import DownloadItem from './DownloadItem'
import { formatBytes, formatSpeed, LINK_COLORS, useNumberTween } from '../utils/formatters'

export default function DownloadsView({
  downloads = [],
  interfaces = [],
  speedHistories = {},
  onPause,
  onResume,
  onCancel,
  onDelete,
  onOpenNewDownload,
  onRunQuickTest,
}) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Active physical interfaces
  const activeInterfaces = useMemo(() => {
    return interfaces.filter((i) => i.is_up && !i.is_link_local && !i.is_vpn)
  }, [interfaces])

  // Aggregate current speed in bytes per second
  const totalSpeedBps = useMemo(() => {
    return downloads.reduce((acc, d) => {
      if (d.status === 'downloading') {
        return acc + (d.total_speed_bps || 0)
      }
      return acc
    }, 0)
  }, [downloads])

  // Speed in MB/s with 150ms smooth number tweening
  const totalSpeedMBs = totalSpeedBps / (1024 * 1024)
  const tweenedSpeedMBs = useNumberTween(totalSpeedMBs, 150)
  const isDownloading = totalSpeedBps > 0 || downloads.some((d) => d.status === 'downloading')

  // Peak aggregate throughput observed
  const peakSpeed = useMemo(() => {
    let peak = totalSpeedBps
    Object.values(speedHistories).forEach((samples) => {
      samples.forEach((s) => {
        if (s.total > peak) peak = s.total
      })
    })
    return peak
  }, [speedHistories, totalSpeedBps])

  // Counts for tabs
  const counts = useMemo(() => {
    let downloading = 0
    let paused = 0
    let completed = 0

    downloads.forEach((d) => {
      if (d.status === 'downloading' || d.status === 'probing' || d.status === 'queued') downloading++
      else if (d.status === 'paused') paused++
      else if (d.status === 'completed') completed++
    })

    return { all: downloads.length, downloading, paused, completed }
  }, [downloads])

  // Filtered downloads
  const filteredDownloads = useMemo(() => {
    return downloads.filter((d) => {
      if (statusFilter === 'downloading') {
        if (d.status !== 'downloading' && d.status !== 'probing' && d.status !== 'queued') return false
      } else if (statusFilter === 'paused') {
        if (d.status !== 'paused') return false
      } else if (statusFilter === 'completed') {
        if (d.status !== 'completed') return false
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const fn = (d.filename || '').toLowerCase()
        const url = (d.url || '').toLowerCase()
        const dest = (d.destination_path || '').toLowerCase()
        if (!fn.includes(query) && !url.includes(query) && !dest.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [downloads, statusFilter, searchQuery])

  // Sparkline data points for hero banner
  const sparklinePaths = useMemo(() => {
    // Generate 30 sample points
    const pointsCount = 30
    const w = 280
    const h = 48
    const maxVal = Math.max(peakSpeed, 1024 * 1024)

    // Aggregate link speeds over time from speedHistories
    return activeInterfaces.map((iface, ifaceIdx) => {
      const color = LINK_COLORS[ifaceIdx % LINK_COLORS.length]
      const pts = []
      for (let i = 0; i < pointsCount; i++) {
        const x = (i / (pointsCount - 1)) * w
        // Find speed across downloads at index
        let spd = 0
        Object.entries(speedHistories).forEach(([dlId, samples]) => {
          const sample = samples[samples.length - (pointsCount - i)]
          if (sample && sample.links) {
            // Check matching ip or linkId
            Object.entries(sample.links).forEach(([k, sSpeed]) => {
              if (k === iface.id || k === iface.ip || iface.ip?.includes(k)) {
                spd += sSpeed
              }
            })
          }
        })
        // If no history yet, use current speed or baseline
        if (spd === 0 && isDownloading) {
          spd = (totalSpeedBps / activeInterfaces.length) * (0.8 + 0.4 * Math.sin(i * 0.5 + ifaceIdx))
        }
        const y = h - Math.min(h - 4, Math.max(4, (spd / maxVal) * (h - 8)))
        pts.push({ x, y })
      }

      const lineD = pts.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '')
      const areaD = `${lineD} L ${w},${h} L 0comma${h} Z`.replace('0comma', '0,')

      return { color, lineD, areaD, iface }
    })
  }, [activeInterfaces, speedHistories, peakSpeed, totalSpeedBps, isDownloading])

  // Helper icon for interface types
  const getInterfaceIcon = (iface) => {
    const name = (iface.friendly_label || iface.adapter_name || '').toLowerCase()
    if (name.includes('wi-fi') || name.includes('wifi') || name.includes('wlan')) {
      return <Wifi size={18} />
    }
    if (name.includes('usb') || name.includes('tether') || name.includes('phone') || name.includes('cellular')) {
      return <Usb size={18} />
    }
    return <Network size={18} />
  }

  // Calculate current speed per interface
  const getInterfaceSpeed = (iface) => {
    let speed = 0
    downloads.forEach((d) => {
      if (d.status === 'downloading' && d.links) {
        Object.entries(d.links).forEach(([k, l]) => {
          if (k === iface.id || l.ip === iface.ip || iface.ip === l.ip) {
            speed += l.current_speed_bps || 0
          }
        })
      }
    })
    return speed
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ------------------------------------------------------------------
          1. Stitch Hero Banner: Live Throughput Aggregator & Waveform
          ------------------------------------------------------------------ */}
      <section className="hero-banner">
        <div className="hero-banner-main">
          {/* Left Column: Status Chip & Big Numeral */}
          <div className="hero-metric-wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={`status-chip ${isDownloading ? 'success' : ''}`}>
                <span className={`status-dot ${isDownloading ? 'active' : 'queued'}`} />
                <span>{isDownloading ? 'Bonding Engine Active' : 'Bonding Engine Standby'}</span>
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-muted)',
                }}
              >
                Physical Route Multiplexing
              </span>
            </div>

            <div className="hero-speed-row" style={{ marginTop: 2 }}>
              <span className="metric-numeral tabular-nums">
                {tweenedSpeedMBs > 0 ? tweenedSpeedMBs.toFixed(1) : '0.0'}
              </span>
              <span className="hero-speed-unit">MB/s</span>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
              {activeInterfaces.length > 0
                ? `Merging ${activeInterfaces.length} physical network routes for unconstrained parallel downloads`
                : 'Ready to bond physical network routes for maximum throughput'}
            </p>
          </div>

          {/* Right Column: Real-time Stacked Sparkline Waveform */}
          <div className="hero-chart-wrap">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              <span>Aggregate Waveform</span>
              <span className="mono tabular-nums">Peak: {formatSpeed(peakSpeed)}</span>
            </div>

            <div className="hero-chart-box">
              <svg className="w-full h-full" viewBox="0 0 280 48" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                {sparklinePaths.length === 0 ? (
                  <path d="M 0,44 L 280,44" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 3" />
                ) : (
                  sparklinePaths.map((item, idx) => (
                    <g key={idx}>
                      <path
                        d={item.lineD}
                        fill="none"
                        stroke={item.color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  ))
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* Active Interface Chips Row */}
        {activeInterfaces.length > 0 && (
          <div className="interface-chips-grid">
            {activeInterfaces.map((iface, idx) => {
              const color = LINK_COLORS[idx % LINK_COLORS.length]
              const ifaceSpeed = getInterfaceSpeed(iface)

              return (
                <div key={iface.id || iface.ip} className="interface-chip-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: color,
                        flexShrink: 0,
                      }}
                    >
                      {getInterfaceIcon(iface)}
                    </div>

                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            backgroundColor: color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: 'var(--text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {iface.friendly_label || iface.adapter_name}
                        </span>
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {iface.ip} {iface.speed_mbps ? `• ${iface.speed_mbps} Mbps` : ''}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span
                      className="mono tabular-nums"
                      style={{ fontSize: 14, fontWeight: 700, color: color, display: 'block' }}
                    >
                      {formatSpeed(ifaceSpeed)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------
          2. Filter & Controls Toolbar
          ------------------------------------------------------------------ */}
      <section className="toolbar-row">
        <div className="toolbar-tabs">
          <button
            type="button"
            className={`toolbar-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            className={`toolbar-tab ${statusFilter === 'downloading' ? 'active' : ''}`}
            onClick={() => setStatusFilter('downloading')}
          >
            Downloading ({counts.downloading})
          </button>
          <button
            type="button"
            className={`toolbar-tab ${statusFilter === 'paused' ? 'active' : ''}`}
            onClick={() => setStatusFilter('paused')}
          >
            Paused ({counts.paused})
          </button>
          <button
            type="button"
            className={`toolbar-tab ${statusFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            Completed ({counts.completed})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="search-field">
            <Search size={14} />
            <input
              type="text"
              placeholder="Filter download jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 2,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenNewDownload}
            className="btn-primary"
            style={{ borderRadius: 'var(--radius-pill)', padding: '7px 16px' }}
          >
            <Plus size={14} />
            <span>Add Download URL</span>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          3. Download Cards Stack
          ------------------------------------------------------------------ */}
      {downloads.length === 0 ? (
        <div className="stitch-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>No download jobs</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 440, margin: '8px auto 16px auto' }}>
            Add a file download URL to partition chunk streams across all connected physical network interfaces.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button type="button" onClick={onOpenNewDownload} className="btn-primary">
              <Plus size={14} />
              <span>Add Download URL</span>
            </button>
            {onRunQuickTest && (
              <button type="button" onClick={onRunQuickTest}>
                <span>Run 20MB Multi-Link Test</span>
              </button>
            )}
          </div>
        </div>
      ) : filteredDownloads.length === 0 ? (
        <div className="stitch-card" style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No downloads matching the current filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredDownloads.map((item) => (
            <DownloadItem
              key={item.id}
              download={item}
              interfaces={interfaces}
              speedHistory={speedHistories[item.id] || []}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
