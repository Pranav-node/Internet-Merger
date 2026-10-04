import React from 'react'
import { Download, Network, History, Settings, Plus, Sun, Moon } from 'lucide-react'
import { formatSpeed } from '../utils/formatters'

export default function MobileNav({
  currentView,
  onSelectView,
  downloadsCount,
  activeLinksCount,
  totalSpeed,
  onOpenNewDownload,
  theme,
  onToggleTheme,
}) {
  return (
    <>
      <header className="mobile-top-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="brand-wordmark">Internet Merger</span>
          {totalSpeed > 0 && (
            <span className="mono tabular-nums" style={{ fontSize: 11, color: 'var(--status-green)', fontWeight: 600 }}>
              {formatSpeed(totalSpeed)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={onOpenNewDownload}
            className="btn-primary btn-sm"
            style={{ padding: '6px 10px' }}
          >
            <Plus size={13} />
            <span>New</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            style={{ padding: '6px 8px' }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </header>

      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={`mobile-nav-btn ${currentView === 'downloads' ? 'active' : ''}`}
          onClick={() => onSelectView('downloads')}
        >
          <Download size={18} />
          <span>Downloads{downloadsCount > 0 ? ` (${downloadsCount})` : ''}</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${currentView === 'links' ? 'active' : ''}`}
          onClick={() => onSelectView('links')}
        >
          <Network size={18} />
          <span>Links ({activeLinksCount})</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${currentView === 'history' ? 'active' : ''}`}
          onClick={() => onSelectView('history')}
        >
          <History size={18} />
          <span>History</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectView('settings')}
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </nav>
    </>
  )
}
