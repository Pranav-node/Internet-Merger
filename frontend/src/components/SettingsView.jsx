import React, { useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'

export default function SettingsView({
  settings,
  onUpdateSettings,
  systemInfo,
  theme,
  onToggleTheme,
}) {
  const {
    connectionsPerLink = 8,
    chunkSize = 4 * 1024 * 1024,
    autoVerifyChecksum = true,
    defaultDownloadDir = 'downloads/',
  } = settings

  const [isBrowsingDefault, setIsBrowsingDefault] = useState(false)

  const handleBrowseDefaultDir = async () => {
    setIsBrowsingDefault(true)
    try {
      const res = await fetch('/api/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_dir: defaultDownloadDir || systemInfo?.default_download_dir }),
      })
      if (!res.ok) throw new Error('Failed to open folder picker')
      const data = await res.json()
      if (data.success && data.path) {
        onUpdateSettings({ defaultDownloadDir: data.path })
      }
    } catch (e) {
      console.error('Error changing default download directory:', e)
    } finally {
      setIsBrowsingDefault(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      {/* Download Engine Defaults */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--bg-surface)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Download Engine Defaults
        </div>

        {/* Connections Per Link */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>
              Default Connections per Link
            </label>
            <span className="mono tabular-nums" style={{ fontSize: 12, fontWeight: 600 }}>
              {connectionsPerLink} sockets
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>1</span>
            <input
              type="range"
              min={1}
              max={16}
              value={connectionsPerLink}
              onChange={(e) => onUpdateSettings({ connectionsPerLink: parseInt(e.target.value, 10) })}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>16</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Parallel HTTP range sockets opened on each active network interface (default: 8).
          </span>
        </div>

        {/* Chunk Size */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>
            Default Chunk Slice Size
          </label>
          <select
            value={chunkSize}
            onChange={(e) => onUpdateSettings({ chunkSize: parseInt(e.target.value, 10) })}
          >
            <option value={1024 * 1024}>1 MB</option>
            <option value={2 * 1024 * 1024}>2 MB</option>
            <option value={4 * 1024 * 1024}>4 MB (Recommended)</option>
            <option value={8 * 1024 * 1024}>8 MB</option>
            <option value={16 * 1024 * 1024}>16 MB</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Byte range slice size requested per connection thread.
          </span>
        </div>

        {/* Checksum Verification */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginTop: 4 }}>
          <input
            type="checkbox"
            checked={autoVerifyChecksum}
            onChange={(e) => onUpdateSettings({ autoVerifyChecksum: e.target.checked })}
            style={{ marginTop: 2 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>
              Auto-Verify Checksum
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Compute and verify SHA-256 hash when an expected checksum is provided.
            </span>
          </div>
        </label>
      </div>

      {/* Directory & Theme */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--bg-surface)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Environment & Appearance
        </div>

        {/* Destination Directory */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>
            Default Output Directory
          </label>
          <input
            type="text"
            value={defaultDownloadDir}
            onChange={(e) => onUpdateSettings({ defaultDownloadDir: e.target.value })}
            className="mono"
          />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Files are saved to this folder relative to the engine working directory.
          </span>
        </div>

        {/* Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>Visual Theme</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Select neutral light or dark interface.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={theme === 'light' ? 'btn-primary btn-sm' : 'btn-sm'}
              onClick={() => theme !== 'light' && onToggleTheme()}
            >
              Light
            </button>
            <button
              type="button"
              className={theme === 'dark' ? 'btn-primary btn-sm' : 'btn-sm'}
              onClick={() => theme !== 'dark' && onToggleTheme()}
            >
              Dark
            </button>
          </div>
        </div>
      </div>

      {/* System Diagnostics Info */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--bg-surface)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          System Information
        </div>

        <div className="table-container">
          <table className="dense-table">
            <tbody>
              <tr>
                <td style={{ color: 'var(--text-secondary)', width: 140 }}>Engine Endpoint</td>
                <td className="mono">http://127.0.0.1:8000</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-secondary)' }}>Operating System</td>
                <td>
                  {systemInfo?.os || 'Windows'} {systemInfo?.os_release || ''}
                </td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-secondary)' }}>Default Directory</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span className="mono">{defaultDownloadDir || systemInfo?.default_download_dir || 'downloads/'}</span>
                    <button
                      type="button"
                      onClick={handleBrowseDefaultDir}
                      disabled={isBrowsingDefault}
                      className="btn btn-secondary"
                      style={{
                        padding: '3px 10px',
                        fontSize: 11,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        flexShrink: 0,
                      }}
                      title="Select default download directory on your PC"
                    >
                      {isBrowsingDefault ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Browsing...</span>
                        </>
                      ) : (
                        <>
                          <FolderOpen size={12} />
                          <span>Browse...</span>
                        </>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-secondary)' }}>Socket Architecture</td>
                <td>Dual-stack TCP bind with IP_UNICAST_IF / SO_BINDTODEVICE</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
