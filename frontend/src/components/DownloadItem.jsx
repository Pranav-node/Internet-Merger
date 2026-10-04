import React, { useState, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Pause,
  Play,
  X,
  Trash2,
  RotateCcw,
  AlertCircle,
  FileBox,
  Disc,
  Archive,
  Film,
  FileCode,
  FileText,
} from 'lucide-react'
import {
  formatBytes,
  formatSpeed,
  formatTime,
  LINK_COLORS,
} from '../utils/formatters'
import SpeedLineChart from './SpeedLineChart'

export default function DownloadItem({
  download,
  interfaces = [],
  speedHistory = [],
  onPause,
  onResume,
  onCancel,
  onDelete,
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const {
    id,
    filename,
    destination_path,
    url,
    status,
    total_bytes,
    downloaded_bytes,
    progress_percent,
    total_speed_bps,
    eta_seconds,
    error_message,
    links = {},
  } = download

  const isDownloading = status === 'downloading'
  const isPaused = status === 'paused'
  const isFinished = status === 'completed'

  // Pick file icon based on file extension
  const fileIcon = useMemo(() => {
    const ext = (filename || url || '').split('.').pop().toLowerCase()
    if (['iso', 'img', 'dmg'].includes(ext)) return <Disc size={22} />
    if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz'].includes(ext)) return <Archive size={22} />
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return <Film size={22} />
    if (['exe', 'pkg', 'deb', 'rpm', 'msi', 'bin', 'apk'].includes(ext)) return <FileCode size={22} />
    if (['pdf', 'docx', 'doc', 'txt'].includes(ext)) return <FileText size={22} />
    return <FileBox size={22} />
  }, [filename, url])

  // Map link_id to a friendly adapter name
  const getLinkName = (linkId, ip) => {
    const iface = interfaces.find((i) => i.ip === ip || i.id === linkId)
    if (iface) return iface.friendly_label || iface.adapter_name
    return ip || linkId
  }

  // Calculate session total bytes across all links for share badges
  const linkEntries = Object.entries(links)
  const sessionTotal = linkEntries.reduce((sum, [, l]) => sum + (l.bytes_downloaded || 0), 0)
  const activeLinksCount = linkEntries.length > 0 ? linkEntries.length : 1

  return (
    <article className="download-card">
      {/* ------------------------------------------------------------------
          1. Card Top Header
          ------------------------------------------------------------------ */}
      <div className="card-header-row">
        <div className="card-title-group">
          {/* File type icon box */}
          <div className="card-file-icon">
            {fileIcon}
          </div>

          <div className="card-title-col">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 className="card-filename" title={filename || url}>
                {filename || url}
              </h2>

              {/* Status Chip (small dot + text only, never big fills) */}
              {isDownloading && (
                <span className="status-chip success">
                  <span className="status-dot active" />
                  <span>Merging {activeLinksCount} {activeLinksCount === 1 ? 'Link' : 'Links'} • Active</span>
                </span>
              )}
              {isPaused && (
                <span className="status-chip warning">
                  <span className="status-dot paused" />
                  <span>Paused</span>
                </span>
              )}
              {isFinished && (
                <span className="status-chip success">
                  <span className="status-dot completed" />
                  <span>Completed</span>
                </span>
              )}
              {status === 'failed' && (
                <span className="status-chip error">
                  <span className="status-dot error" />
                  <span>Failed</span>
                </span>
              )}
              {(status === 'probing' || status === 'queued') && (
                <span className="status-chip">
                  <span className="status-dot queued" />
                  <span>{status === 'probing' ? 'Probing...' : 'Queued'}</span>
                </span>
              )}
            </div>

            <div className="card-meta-url" title={destination_path || url}>
              {destination_path || url}
            </div>
          </div>
        </div>

        {/* Actions Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isDownloading && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onPause(id)}
              title="Pause download"
            >
              <Pause size={13} />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => onResume(id)}
              title="Resume download"
            >
              <Play size={13} />
              <span>Resume</span>
            </button>
          )}

          {(status === 'failed' || status === 'cancelled') && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onResume(id)}
              title="Retry download"
            >
              <RotateCcw size={13} />
              <span>Retry</span>
            </button>
          )}

          {!isFinished && status !== 'cancelled' && status !== 'failed' && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => onCancel(id)}
              title="Cancel download"
            >
              <X size={13} />
              <span>Cancel</span>
            </button>
          )}

          {(isFinished || status === 'cancelled' || status === 'failed') && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onDelete(id)}
              title="Delete from list"
            >
              <Trash2 size={13} />
              <span>Dismiss</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? 'Hide details' : 'Show details'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Details</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          2. Progress Section
          ------------------------------------------------------------------ */}
      <div className="card-progress-section">
        <div className="progress-metrics-row">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              className="mono tabular-nums"
              style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}
            >
              {Math.round(progress_percent || 0)}%
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
              {formatBytes(downloaded_bytes)} of {total_bytes ? formatBytes(total_bytes) : '--'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span
              className="mono tabular-nums"
              style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}
            >
              {formatSpeed(total_speed_bps)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
              {isDownloading
                ? `${formatTime(eta_seconds)} remaining`
                : isFinished
                ? 'Done'
                : isPaused
                ? 'Paused'
                : '--'}
            </span>
          </div>
        </div>

        {/* Master Progress Bar (4px thin flat track in text color with 150ms transition) */}
        <div className="progress-track-4px">
          <div
            className="progress-fill-text"
            style={{ width: `${Math.min(100, Math.max(0, progress_percent || 0))}%` }}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------
          3. Segmented Distribution Bar (Contribution by link)
          ------------------------------------------------------------------ */}
      <div className="segmented-bar-panel">
        <div className="segmented-bar-header">
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
            Socket Multi-Stream Chunk Allocation
          </span>

          <div className="segmented-chips-row">
            {linkEntries.length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>100% Primary Interface</span>
            ) : (
              linkEntries.map(([linkId, link], idx) => {
                const color = LINK_COLORS[idx % LINK_COLORS.length]
                const friendly = getLinkName(linkId, link.ip)
                const sharePct =
                  link.session_share_percent !== undefined
                    ? link.session_share_percent
                    : sessionTotal > 0
                    ? Math.round(((link.bytes_downloaded || 0) / sessionTotal) * 1000) / 10
                    : 100 / Math.max(linkEntries.length, 1)

                return (
                  <span
                    key={linkId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        backgroundColor: color,
                        display: 'inline-block',
                      }}
                    />
                    <span>{friendly}</span>
                    <strong className="mono tabular-nums" style={{ color: 'var(--text)' }}>
                      ({sharePct.toFixed(0)}%)
                    </strong>
                  </span>
                )
              })
            )}
          </div>
        </div>

        {/* Segmented Track */}
        <div className="segmented-track">
          {linkEntries.length === 0 ? (
            <div
              className="segmented-fill"
              style={{ backgroundColor: LINK_COLORS[0], width: '100%' }}
            />
          ) : (
            linkEntries.map(([linkId, link], idx) => {
              const color = LINK_COLORS[idx % LINK_COLORS.length]
              const sharePct =
                link.session_share_percent !== undefined
                  ? link.session_share_percent
                  : sessionTotal > 0
                  ? ((link.bytes_downloaded || 0) / sessionTotal) * 100
                  : 100 / linkEntries.length

              return (
                <div
                  key={linkId}
                  className="segmented-fill"
                  style={{ backgroundColor: color, width: `${Math.max(1, sharePct)}%` }}
                  title={`${getLinkName(linkId, link.ip)}: ${sharePct.toFixed(1)}%`}
                />
              )
            })
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------
          4. Expanded Per-Link Breakdown Table & Line Chart (150ms ease)
          ------------------------------------------------------------------ */}
      {isExpanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            transition: 'all 150ms ease-out',
          }}
        >
          {error_message && (
            <div className="warning-banner" style={{ borderColor: 'var(--status-error)', color: 'var(--status-error)' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Error:</strong> {error_message}
              </div>
            </div>
          )}

          {/* Real Backend Data Multi-Link Breakdown Table */}
          <div className="breakdown-table-wrap">
            <table className="stitch-table">
              <thead>
                <tr>
                  <th>Active Interface</th>
                  <th>Routing Socket / IP</th>
                  <th>Chunk Speed</th>
                  <th>Downloaded</th>
                  <th>Session Share</th>
                  <th>Streams / Chunks</th>
                  <th>Connections</th>
                  <th style={{ textAlign: 'right' }}>State</th>
                </tr>
              </thead>
              <tbody>
                {linkEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '14px' }}>
                      No per-link chunk streams established yet.
                    </td>
                  </tr>
                ) : (
                  linkEntries.map(([linkId, link], idx) => {
                    const color = LINK_COLORS[idx % LINK_COLORS.length]
                    const friendly = getLinkName(linkId, link.ip)
                    const sharePct =
                      link.session_share_percent !== undefined
                        ? link.session_share_percent
                        : sessionTotal > 0
                        ? Math.round(((link.bytes_downloaded || 0) / sessionTotal) * 1000) / 10
                        : 0

                    return (
                      <tr key={linkId}>
                        <td style={{ fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: color,
                                display: 'inline-block',
                              }}
                            />
                            <span>{friendly}</span>
                          </span>
                        </td>
                        <td className="mono tabular-nums">{link.ip || '127.0.0.1'}</td>
                        <td className="mono tabular-nums" style={{ fontWeight: 700, color: color }}>
                          {formatSpeed(link.current_speed_bps)}
                        </td>
                        <td className="mono tabular-nums">{formatBytes(link.bytes_downloaded)}</td>
                        <td>
                          <span
                            className="mono tabular-nums"
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-pill)',
                              backgroundColor: 'var(--bg-hover)',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {sharePct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="mono tabular-nums">{link.chunks_completed || 0} chunks</td>
                        <td className="mono tabular-nums">{link.active_connections || 0} conns</td>
                        <td style={{ textAlign: 'right' }}>
                          {link.errors_count > 0 ? (
                            <span className="status-chip error">
                              <span className="status-dot error" />
                              <span>{link.errors_count} err</span>
                            </span>
                          ) : (
                            <span className="status-chip success">
                              <span className="status-dot active" />
                              <span>Bonded</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Speed line chart with 4 link colors and labeled axes */}
          <SpeedLineChart
            history={speedHistory}
            download={download}
            interfaces={interfaces}
          />
        </div>
      )}
    </article>
  )
}
