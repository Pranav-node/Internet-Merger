import React, { useState, useEffect } from 'react'
import {
  Play,
  Pause,
  X,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  HardDrive,
  Copy,
  ChevronDown,
  ChevronUp,
  Cpu,
  Activity,
  Sliders,
  Sparkles,
} from 'lucide-react'
import { formatBytes, formatSpeed, formatTime, getStatusBadge } from '../utils/formatters'
import LiveSpeedGraph from './LiveSpeedGraph'

const LINK_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']

export default function DownloadCard({
  download,
  interfaces = [],
  onPause,
  onResume,
  onCancel,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(true)
  const [speedHistory, setSpeedHistory] = useState([])
  const [copiedHash, setCopiedHash] = useState(false)
  const [tuningRequested, setTuningRequested] = useState(false)

  const isCompleted = download.status === 'completed'
  const isDownloading = download.status === 'downloading'
  const isPaused = download.status === 'paused'

  // Track sliding speed history for live graph
  useEffect(() => {
    if (isDownloading) {
      const now = Date.now()
      const linkSpeeds = {}
      if (download.links) {
        Object.entries(download.links).forEach(([k, s]) => {
          linkSpeeds[k] = s.current_speed_bps || 0
        })
      }

      setSpeedHistory((prev) => {
        const next = [
          ...prev,
          { timestamp: now, links: linkSpeeds, total: download.total_speed_bps || 0 },
        ]
        return next.slice(-35)
      })
    }
  }, [download.total_speed_bps, download.links, isDownloading])

  const badge = getStatusBadge(download.status)
  const links = download.links || {}
  const linkKeys = Object.keys(links)

  // Calculate total bytes transferred across links in this session
  const totalSessionBytes = Object.values(links).reduce(
    (acc, l) => acc + (l.bytes_downloaded || 0),
    0
  )

  const handleCopyHash = () => {
    if (download.computed_checksum) {
      navigator.clipboard.writeText(download.computed_checksum)
      setCopiedHash(true)
      setTimeout(() => setCopiedHash(false), 2000)
    }
  }

  const handleFindBestConnections = async () => {
    setTuningRequested(true)
    try {
      await fetch(`/api/downloads/${download.id}/autotune-connections`, { method: 'POST' })
    } catch (err) {
      console.error('Failed to trigger autotune:', err)
    } finally {
      setTimeout(() => setTuningRequested(false), 2000)
    }
  }

  // Lookup adapter friendly label from interfaces list
  const getAdapterName = (key, ifIndex) => {
    if (key === 'default') return 'Default OS Gateway'
    const found = interfaces.find(
      (i) => i.ip === key || (ifIndex && i.if_index === ifIndex)
    )
    if (found) {
      return found.friendly_label || found.adapter_name
    }
    return key
  }

  return (
    <div
      className="food-card"
      style={{
        padding: '22px 26px',
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header Row: Filename, Status, Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-pill)',
              background: isCompleted
                ? 'var(--accent-green-light)'
                : 'var(--accent-red-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isCompleted ? 'var(--accent-green)' : 'var(--accent-red)',
              flexShrink: 0,
            }}
          >
            {isCompleted ? <CheckCircle2 size={22} /> : <HardDrive size={22} />}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '560px',
                }}
                title={download.filename}
              >
                {download.filename}
              </h3>

              <span className={`badge ${badge.className}`}>
                {badge.pulse && <span className="pulse-indicator" style={{ width: 6, height: 6 }} />}
                {badge.label}
              </span>
            </div>

            <div
              style={{
                fontSize: '0.78125rem',
                color: 'var(--text-secondary)',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '500px',
              }}
              title={download.url}
            >
              {download.url}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isDownloading && (
            <button
              onClick={() => onPause(download.id)}
              className="btn btn-secondary"
              style={{ padding: '7px 14px', fontSize: '0.8125rem' }}
              title="Pause Download"
            >
              <Pause size={14} />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              onClick={() => onResume(download.id)}
              className="btn btn-primary"
              style={{ padding: '7px 14px', fontSize: '0.8125rem' }}
              title="Resume Download"
            >
              <Play size={14} />
              <span>Resume</span>
            </button>
          )}

          {(isDownloading || download.status === 'probing' || isPaused) && (
            <button
              onClick={() => onCancel(download.id)}
              className="btn btn-secondary"
              style={{ padding: '7px 14px', fontSize: '0.8125rem' }}
              title="Cancel Download"
            >
              <X size={14} />
              <span>Cancel</span>
            </button>
          )}

          {(isCompleted || download.status === 'failed' || download.status === 'cancelled') && (
            <button
              onClick={() => onDelete(download.id)}
              className="btn btn-danger"
              style={{ padding: '7px 14px', fontSize: '0.8125rem' }}
              title="Remove from download list"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="btn-icon"
            style={{ width: 34, height: 34 }}
            title={expanded ? 'Collapse Details' : 'Expand Details'}
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Error Message Banner if any */}
      {download.error_message && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.8125rem',
            color: '#DC2626',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Issue:</strong> {download.error_message}
          </div>
        </div>
      )}

      {/* Progress & Speed Stats Row */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Progress Percent & Transferred Amount */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                fontFamily: 'var(--font-heading)',
                color: isCompleted ? 'var(--accent-green)' : 'var(--accent-red)',
                lineHeight: 1,
              }}
            >
              {isCompleted ? '100%' : `${download.progress_percent}%`}
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {isCompleted
                ? `${formatBytes(download.total_bytes)} / ${formatBytes(download.total_bytes)}`
                : `${formatBytes(download.downloaded_bytes)} of ${formatBytes(download.total_bytes)}`}
            </span>
            {isCompleted && (
              <span
                className="badge badge-green"
                style={{ fontSize: '0.75rem', padding: '3px 8px', fontWeight: 700 }}
              >
                ✓ Completed
              </span>
            )}
          </div>

          {/* Speed & ETA Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            {isCompleted ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="var(--accent-green)" />
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  Download Finished
                </span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={16} color="var(--accent-red)" />
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {formatSpeed(download.total_speed_bps)}
                  </span>
                </div>

                {isDownloading && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Clock size={15} />
                    <span style={{ fontSize: '0.875rem' }}>
                      ETA: {formatTime(download.eta_seconds)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress Bar: Green when completed, Red when active */}
        <div className="progress-bar-container">
          <div
            className={`progress-bar-fill ${isDownloading ? 'active' : ''}`}
            style={{
              width: `${isCompleted ? 100 : Math.max(0.5, download.progress_percent)}%`,
              backgroundColor: isCompleted ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
          />
        </div>

        {/* Technical Metrics Pills Row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Event loop lag badge */}
            <span
              className="badge badge-muted"
              title="Time difference between scheduled and actual event loop execution (lower is better)"
              style={{
                background:
                  (download.event_loop_lag_ms || 0) > 15
                    ? 'rgba(239, 68, 68, 0.1)'
                    : 'var(--bg-subtle)',
                color:
                  (download.event_loop_lag_ms || 0) > 15
                    ? '#DC2626'
                    : 'var(--text-secondary)',
                fontSize: '0.7125rem',
                padding: '3px 8px',
              }}
            >
              <Cpu size={12} />
              <span>Loop lag: {download.event_loop_lag_ms ?? 0.8} ms</span>
            </span>

            {/* Disk write latency badge */}
            <span
              className="badge badge-muted"
              title="Average disk seek, write, and batch flush latency via background writer thread"
              style={{ fontSize: '0.7125rem', padding: '3px 8px' }}
            >
              <HardDrive size={12} />
              <span>Disk write: {download.disk_write_latency_ms ?? 1.4} ms</span>
            </span>

            {/* Connections info */}
            <span
              className="badge badge-muted"
              style={{ fontSize: '0.7125rem', padding: '3px 8px' }}
            >
              <Sliders size={12} />
              <span>{download.connections_per_link || 8} conns/link</span>
            </span>
          </div>

          {/* Autotuning Button (visible during active download) */}
          {isDownloading && (
            <button
              onClick={handleFindBestConnections}
              disabled={download.is_autotuning || tuningRequested}
              className="btn btn-secondary"
              style={{ padding: '3px 12px', fontSize: '0.75rem', gap: 5 }}
              title="Step-by-step increases connections per link and stops when speed gains drop below 5%"
            >
              {download.is_autotuning ? (
                <>
                  <Activity size={12} className="spin" />
                  <span>{download.autotune_status || 'Finding best connections...'}</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} color="var(--accent-red)" />
                  <span>Find best connections</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Multi-Link Breakdown & Real-Time Graph */}
      {expanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            paddingTop: 12,
            borderTop: '1px solid var(--border-color)',
          }}
        >
          {/* Live Multi-Link Speed Chart / Clean Historical View */}
          <LiveSpeedGraph
            history={speedHistory}
            links={links}
            height={100}
            isCompleted={isCompleted}
            status={download.status}
          />

          {/* Per-Link Breakdown Cards: NETWORK CONTRIBUTION */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
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
                Network Contribution
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {linkKeys.length} {linkKeys.length === 1 ? 'Connection' : 'Active Connections'}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {linkKeys.map((k, idx) => {
                const s = links[k]
                const linkColor = LINK_COLORS[idx % LINK_COLORS.length]
                const adapterLabel = getAdapterName(k, s.if_index)

                // Share calculation dynamically derived from backend data
                const sessionShare =
                  s.session_share_percent !== undefined
                    ? s.session_share_percent
                    : totalSessionBytes > 0
                    ? Number(((s.bytes_downloaded / totalSessionBytes) * 100).toFixed(0))
                    : 0

                const isBlocked = s.last_error && s.bytes_downloaded === 0
                const isActive = s.current_speed_bps > 1024

                return (
                  <div
                    key={k}
                    style={{
                      background: 'var(--bg-subtle)',
                      border: isBlocked
                        ? '1px solid rgba(239, 68, 68, 0.4)'
                        : '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                    }}
                  >
                    {/* Adapter Title and Share Badge */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: isBlocked
                              ? 'var(--accent-red)'
                              : isActive
                              ? 'var(--accent-green)'
                              : 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: '0.875rem',
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={adapterLabel}
                          >
                            {adapterLabel}
                          </div>
                          {k !== 'default' && (
                            <div
                              style={{
                                fontSize: '0.6875rem',
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {k} {s.if_index ? `(idx: ${s.if_index})` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dynamic Contribution Badge */}
                      {isBlocked ? (
                        <span className="badge badge-red" style={{ fontSize: '0.6875rem' }}>
                          Offline
                        </span>
                      ) : (
                        <span
                          className="badge badge-muted"
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: linkColor,
                            borderColor: `${linkColor}40`,
                          }}
                          title={`${sessionShare}% share of session downloaded bytes`}
                        >
                          {sessionShare}%
                        </span>
                      )}
                    </div>

                    {/* Visual Horizontal Contribution Bar */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          background: 'var(--bg-card)',
                          borderRadius: 'var(--radius-pill)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, sessionShare))}%`,
                            height: '100%',
                            background: isBlocked ? 'var(--accent-red)' : linkColor,
                            borderRadius: 'var(--radius-pill)',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>

                    {/* Stats Breakdown: Speed, Transferred, Workers */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.78125rem',
                        marginTop: 4,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>Speed:</span>
                      <strong
                        style={{
                          color: isDownloading && isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {formatSpeed(s.current_speed_bps)}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.78125rem',
                        marginTop: 3,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>Transferred:</span>
                      <span
                        style={{
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {formatBytes(s.bytes_downloaded)}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        marginTop: 3,
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>Workers:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {s.chunks_completed} chunks ({s.active_connections} active)
                      </span>
                    </div>

                    {/* Plain Language Error Diagnostic if any */}
                    {s.last_error && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#DC2626',
                          fontSize: '0.7125rem',
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        <strong>Issue:</strong> {s.last_error}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer with Destination Path and Verified Checksum */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              paddingTop: 4,
            }}
          >
            <div style={{ maxWidth: '650px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span>Destination: </span>
              <code style={{ color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                {download.destination_path}
              </code>
            </div>

            {download.computed_checksum && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} color="var(--accent-green)" />
                <span>SHA-256:</span>
                <code style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                  {download.computed_checksum.slice(0, 16)}...
                </code>
                <button
                  onClick={handleCopyHash}
                  className="btn-icon"
                  style={{ width: 24, height: 24, padding: 0 }}
                  title={copiedHash ? 'Copied!' : 'Copy Checksum'}
                >
                  {copiedHash ? (
                    <CheckCircle2 size={11} color="var(--accent-green)" />
                  ) : (
                    <Copy size={11} />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
