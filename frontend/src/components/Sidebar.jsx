import React from 'react'
import { Download, Network, History, Settings, Sun, Moon } from 'lucide-react'
import { formatSpeed } from '../utils/formatters'

export default function Sidebar({
  currentView,
  onSelectView,
  downloadsCount,
  activeDownloadsCount,
  activeLinksCount,
  completedCount,
  totalSpeed,
  connected,
  theme,
  onToggleTheme,
}) {
  return (
    <aside className="desktop-sidebar">
      <div>
        <div className="sidebar-header">
          <span className="brand-wordmark">Internet Merger</span>
          <div className="engine-status-line">
            <span
              className={`status-dot ${connected ? 'downloading' : 'failed'}`}
              title={connected ? 'Connected to 127.0.0.1:8000' : 'Disconnected'}
            />
            <span className="mono">127.0.0.1:8000</span>
            <span>{connected ? 'online' : 'offline'}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item ${currentView === 'downloads' ? 'active' : ''}`}
            onClick={() => onSelectView('downloads')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Download size={14} />
              <span>Downloads</span>
            </span>
            {activeDownloadsCount > 0 ? (
              <span className="nav-badge" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}>
                {activeDownloadsCount}
              </span>
            ) : (
              <span className="nav-badge">{downloadsCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === 'links' ? 'active' : ''}`}
            onClick={() => onSelectView('links')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Network size={14} />
              <span>Network Links</span>
            </span>
            <span className="nav-badge">{activeLinksCount} active</span>
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === 'history' ? 'active' : ''}`}
            onClick={() => onSelectView('history')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={14} />
              <span>History</span>
            </span>
            {completedCount > 0 && <span className="nav-badge">{completedCount}</span>}
          </button>

          <button
            type="button"
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => onSelectView('settings')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={14} />
              <span>Settings</span>
            </span>
          </button>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="throughput-widget">
          <div className="throughput-label">Combined Throughput</div>
          <div className="throughput-value tabular-nums mono">{formatSpeed(totalSpeed)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {activeLinksCount} physical {activeLinksCount === 1 ? 'link' : 'links'} bonded
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          style={{ width: '100%', justifyContent: 'space-between', padding: '5px 8px' }}
          title="Toggle Light / Dark mode"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
            <span>Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
          </span>
          <span className="nav-badge mono">{theme}</span>
        </button>
      </div>
    </aside>
  )
}
