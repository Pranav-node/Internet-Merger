import React from 'react'
import { Plus, Pause, Play, Sun, Moon } from 'lucide-react'

export default function Header({
  currentView,
  hasActiveDownloads,
  onPauseAll,
  onResumeAll,
  onOpenNewDownload,
  theme,
  onToggleTheme,
}) {
  const titles = {
    downloads: 'Downloads',
    links: 'Network Links',
    history: 'History',
    settings: 'Settings',
  }

  return (
    <header className="top-header">
      <div className="header-left">
        <h1 className="header-title">{titles[currentView] || 'Downloads'}</h1>
      </div>

      <div className="header-right">
        {currentView === 'downloads' && (
          <>
            {hasActiveDownloads ? (
              <button type="button" onClick={onPauseAll} className="btn-sm" title="Pause all downloading jobs">
                <Pause size={13} />
                <span>Pause All</span>
              </button>
            ) : (
              <button type="button" onClick={onResumeAll} className="btn-sm" title="Resume paused downloads">
                <Play size={13} />
                <span>Resume All</span>
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onOpenNewDownload}
          className="btn-primary"
          title="Add a new download URL"
        >
          <Plus size={14} />
          <span>New Download</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          style={{ padding: '6px 8px' }}
          title="Toggle light/dark theme"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>
    </header>
  )
}
