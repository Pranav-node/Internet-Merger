import React from 'react'
import { Zap, RefreshCw, Layers, Moon, Sun, HelpCircle } from 'lucide-react'
import { formatSpeed } from '../utils/formatters'

export default function Navbar({
  connected,
  totalSpeed = 0,
  onOpenGuide,
  onOpenAdapters,
  onRefresh,
  theme = 'dark',
  onToggleTheme,
}) {
  const isDownloading = totalSpeed > 0

  return (
    <header
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        padding: '12px 28px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      <div
        style={{
          maxWidth: '1240px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Brand & Connection Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-pill)',
              background: 'var(--accent-red)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: 'var(--shadow-pill)',
              fontWeight: 800,
              fontSize: '1.05rem',
              fontFamily: 'var(--font-heading)',
              flexShrink: 0,
            }}
          >
            M
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="brand-title"
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                Internet Merger
              </span>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--accent-red)',
                  display: 'inline-block',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: connected ? 'var(--accent-green)' : 'var(--accent-red)',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {connected ? 'Local Engine Connected' : 'Connecting to local backend...'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side Stats & Actions: Speed / Adapters / Refresh / Theme */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Aggregate Speed Stat Pill */}
          <div
            className={`badge ${isDownloading ? 'badge-red' : 'badge-muted'}`}
            style={{ padding: '6px 14px', fontSize: '0.8125rem', fontWeight: 700 }}
            title="Combined aggregate download speed across all active connections"
          >
            <Zap size={14} color={isDownloading ? 'var(--accent-red)' : 'var(--text-secondary)'} />
            <span>{formatSpeed(totalSpeed)}</span>
          </div>

          {/* Guide Modal Trigger */}
          <button
            onClick={onOpenGuide}
            className="btn btn-secondary"
            style={{ padding: '7px 14px', fontSize: '0.8125rem', borderRadius: 'var(--radius-pill)', gap: 5 }}
            title="Open Internet Merger concept guide & speed tips"
          >
            <HelpCircle size={14} color="var(--accent-red)" />
            <span>Guide</span>
          </button>

          {/* Adapters Drawer Trigger */}
          <button
            onClick={onOpenAdapters}
            className="btn btn-secondary"
            style={{ padding: '7px 14px', fontSize: '0.8125rem', borderRadius: 'var(--radius-pill)' }}
            title="Inspect detected network adapters and physical links"
          >
            <Layers size={14} />
            <span>Adapters</span>
          </button>

          {/* Refresh Data */}
          <button
            onClick={onRefresh}
            className="btn-icon"
            style={{ width: 34, height: 34 }}
            title="Refresh system state and interface status"
          >
            <RefreshCw size={14} />
          </button>

          {/* Dark/Light Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="btn-icon"
            style={{ width: 34, height: 34 }}
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </div>
    </header>
  )
}
