import React, { useState, useEffect } from 'react'
import {
  Link as LinkIcon,
  Download,
  Sliders,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertCircle,
} from 'lucide-react'

export default function HeroSearchBar({
  interfaces = [],
  onSubmit,
  onRunQuickTest,
}) {
  const [url, setUrl] = useState('')
  const [connectionsPerLink, setConnectionsPerLink] = useState(8)
  const [chunkSizeMb, setChunkSizeMb] = useState(4)
  const [selectedIps, setSelectedIps] = useState([])
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Filter healthy physical interfaces for auto-selection
  const healthyInterfaces = interfaces.filter(
    (i) => i.is_up && !i.is_link_local && !i.is_vpn && !i.is_hidden_by_default
  )

  // Initialize selected IPs to healthy physical interfaces only
  useEffect(() => {
    if (healthyInterfaces.length > 0) {
      const healthyIps = healthyInterfaces.map((i) => i.ip)
      setSelectedIps((prev) => {
        if (prev.length === 0) return healthyIps
        return prev.filter((ip) => interfaces.some((i) => i.ip === ip && i.is_up))
      })
    }
  }, [interfaces])

  const toggleIp = (ip) => {
    setSelectedIps((prev) =>
      prev.includes(ip) ? prev.filter((x) => x !== ip) : [...prev, ip]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return

    setErrorMsg(null)
    setSubmitting(true)
    try {
      await onSubmit({
        url: url.trim(),
        connections_per_link: connectionsPerLink,
        chunk_size: chunkSizeMb * 1024 * 1024,
        bind_ips: selectedIps.length > 0 ? selectedIps : null,
      })
      setUrl('')
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start download')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section style={{ margin: '36px 0 40px' }}>
      {/* Centered Hero Heading */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h2
          style={{
            fontSize: '1.95rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          Merge Internet Connections. Download Faster.
        </h2>
        <p
          style={{
            fontSize: '0.9375rem',
            color: 'var(--text-secondary)',
            marginTop: 8,
          }}
        >
          Pulls file chunks concurrently over multiple Wi-Fi, Ethernet, and phone hotspot links.
        </p>
      </div>

      {/* Hero URL Input & Primary Action */}
      <form onSubmit={handleSubmit} style={{ maxWidth: '820px', margin: '0 auto' }}>
        <div className="hero-search-container">
          <LinkIcon size={18} color="var(--accent-red)" style={{ flexShrink: 0, marginLeft: 2 }} />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste download URL (e.g. https://releases.ubuntu.com/...) to merge connections"
            className="hero-search-input"
            required
          />
          <button
            type="submit"
            disabled={submitting || !url.trim()}
            className="btn btn-primary"
            style={{ padding: '10px 24px', fontSize: '0.9375rem', fontWeight: 700 }}
          >
            <Download size={16} />
            <span>{submitting ? 'Starting...' : 'Download'}</span>
          </button>
        </div>

        {/* 12px Spacing: Active Connection Area and Tuning Options */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            padding: '0 8px',
            fontSize: '0.8125rem',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* Active Connections Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Active Connections:</span>
            {healthyInterfaces.length === 0 ? (
              <span className="badge badge-amber" style={{ fontSize: '0.75rem' }}>
                Default OS Gateway
              </span>
            ) : (
              healthyInterfaces.map((iface) => {
                const isSelected = selectedIps.includes(iface.ip)
                return (
                  <button
                    key={iface.id}
                    type="button"
                    onClick={() => toggleIp(iface.ip)}
                    className={`badge ${isSelected ? 'badge-red' : 'badge-muted'}`}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--accent-red)' : '1px solid var(--border-color)',
                      padding: '4px 10px',
                      fontWeight: 600,
                      transition: 'all 0.15s ease',
                    }}
                    title={isSelected ? 'Click to disable connection' : 'Click to enable connection'}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: isSelected ? 'var(--accent-red)' : 'var(--text-muted)',
                      }}
                    />
                    <span>{iface.friendly_label || iface.adapter_name}</span>
                  </button>
                )
              })
            )}
          </div>

          {/* Tuning Options & Quick Demo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={() => setIsOptionsOpen(!isOptionsOpen)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                fontSize: '0.8125rem',
              }}
            >
              <Sliders size={13} />
              <span>{connectionsPerLink} Conns • {chunkSizeMb}MB Chunks</span>
              {isOptionsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            <button
              type="button"
              onClick={onRunQuickTest}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-red)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
                fontSize: '0.8125rem',
              }}
              title="Run 20MB local test file to benchmark multi-link acceleration"
            >
              <Zap size={13} />
              <span>Quick Demo</span>
            </button>
          </div>
        </div>

        {/* Collapsible Tuning Options Drawer */}
        {isOptionsOpen && (
          <div
            className="food-card"
            style={{
              marginTop: 14,
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 18,
            }}
          >
            <div>
              <label
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                <span>Connections per Link</span>
                <strong style={{ color: 'var(--accent-red)' }}>{connectionsPerLink} workers</strong>
              </label>
              <input
                type="range"
                min="1"
                max="16"
                step="1"
                value={connectionsPerLink}
                onChange={(e) => setConnectionsPerLink(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: 'var(--accent-red)' }}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Recommended: 8 workers per link for high-throughput multi-stream merging.
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                <span>Chunk Size</span>
                <strong style={{ color: 'var(--accent-red)' }}>{chunkSizeMb} MB</strong>
              </label>
              <select
                value={chunkSizeMb}
                onChange={(e) => setChunkSizeMb(parseInt(e.target.value, 10))}
                className="text-input"
                style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
              >
                <option value={2}>2 MB (Faster links / mobile data)</option>
                <option value={4}>4 MB (Recommended default)</option>
                <option value={8}>8 MB (High bandwidth gigabit)</option>
                <option value={16}>16 MB (Very large files 5GB+)</option>
              </select>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Non-blocking batch writer flushes data directly to disk without loop stalls.
              </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#DC2626',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </form>
    </section>
  )
}
