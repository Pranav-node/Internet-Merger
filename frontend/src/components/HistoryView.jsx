import React, { useMemo } from 'react'
import { Copy, Trash2, CheckCircle2, Folder } from 'lucide-react'
import { formatBytes, formatSpeed } from '../utils/formatters'

export default function HistoryView({ downloads = [], onDelete }) {
  const completedDownloads = useMemo(() => {
    return downloads.filter((d) => d.status === 'completed')
  }, [downloads])

  const totalBytesSaved = useMemo(() => {
    return completedDownloads.reduce((sum, d) => sum + (d.total_bytes || d.downloaded_bytes || 0), 0)
  }, [completedDownloads])

  const handleCopyPath = (path) => {
    if (path && navigator.clipboard) {
      navigator.clipboard.writeText(path)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary Row */}
      <div className="control-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            Completed Transfers ({completedDownloads.length})
          </span>
          <span className="mono tabular-nums" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Total transferred: {formatBytes(totalBytesSaved)}
          </span>
        </div>
      </div>

      {/* Completed Transfers Table */}
      <div className="table-container">
        <table className="dense-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Destination Path</th>
              <th>Total Size</th>
              <th>Final Speed</th>
              <th>Verification</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {completedDownloads.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                  No completed downloads yet. Finished downloads will appear here.
                </td>
              </tr>
            ) : (
              completedDownloads.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={13} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
                      <span className="download-filename" title={item.filename || item.url}>
                        {item.filename || item.url}
                      </span>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.destination_path || 'downloads/'}
                  </td>
                  <td className="mono tabular-nums">
                    {formatBytes(item.total_bytes || item.downloaded_bytes)}
                  </td>
                  <td className="mono tabular-nums">
                    {formatSpeed(item.total_speed_bps)}
                  </td>
                  <td>
                    {item.computed_checksum ? (
                      <span className="status-tag green mono" style={{ fontSize: 10 }}>
                        Verified
                      </span>
                    ) : (
                      <span className="status-tag neutral" style={{ fontSize: 10 }}>
                        Completed
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => handleCopyPath(item.destination_path)}
                        title="Copy file path"
                      >
                        <Copy size={11} />
                        <span>Copy Path</span>
                      </button>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => onDelete(item.id)}
                        title="Delete from history"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
