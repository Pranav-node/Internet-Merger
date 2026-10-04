import React, { useState } from 'react'
import {
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wifi,
  Network,
  Usb,
  Globe,
} from 'lucide-react'
import { LINK_COLORS } from '../utils/formatters'

export default function LinksView({
  interfaces = [],
  hasActiveVpn = false,
  activeVpns = [],
  vpnWarning = null,
  onRefresh,
}) {
  const [showAllAdapters, setShowAllAdapters] = useState(false)
  const [testResults, setTestResults] = useState({})
  const [testingIps, setTestingIps] = useState({})
  const [isTestingAll, setIsTestingAll] = useState(false)

  // Inactive, APIPA (169.254.x.x), and VPN adapters hidden by default unless toggle enabled
  const displayedInterfaces = interfaces.filter((iface) => {
    if (showAllAdapters) return true
    if (!iface.is_up) return false
    if (iface.is_link_local) return false // APIPA
    if (iface.is_vpn) return false
    return true
  })

  const hiddenCount = interfaces.length - displayedInterfaces.length

  // Test single interface connectivity
  const handleTestLink = async (ip) => {
    if (!ip) return
    setTestingIps((prev) => ({ ...prev, [ip]: true }))
    try {
      const res = await fetch('/api/interfaces/test-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      })
      const data = await res.json()
      setTestResults((prev) => ({
        ...prev,
        [ip]: {
          success: data.success,
          public_ip: data.public_ip,
          error: data.error,
          timestamp: Date.now(),
        },
      }))
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [ip]: {
          success: false,
          error: err.message || 'Connection failed',
          timestamp: Date.now(),
        },
      }))
    } finally {
      setTestingIps((prev) => ({ ...prev, [ip]: false }))
    }
  }

  // Test all links concurrently
  const handleTestAllLinks = async () => {
    setIsTestingAll(true)
    try {
      const res = await fetch('/api/interfaces/test-all-links', { method: 'POST' })
      const data = await res.json()
      if (data.results) {
        const mapped = {}
        data.results.forEach((r) => {
          mapped[r.ip] = {
            success: r.success,
            public_ip: r.public_ip,
            error: r.error,
            is_duplicate: r.is_duplicate,
            duplicate_warning: r.duplicate_warning,
            timestamp: Date.now(),
          }
        })
        setTestResults((prev) => ({ ...prev, ...mapped }))
      }
    } catch (err) {
      console.error('Failed to test all links:', err)
    } finally {
      setIsTestingAll(false)
    }
  }

  // Icon helper
  const getInterfaceIcon = (iface) => {
    const name = (iface.friendly_label || iface.adapter_name || '').toLowerCase()
    if (name.includes('wi-fi') || name.includes('wifi') || name.includes('wlan')) {
      return <Wifi size={20} />
    }
    if (name.includes('usb') || name.includes('tether') || name.includes('phone') || name.includes('cellular')) {
      return <Usb size={20} />
    }
    return <Network size={20} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* VPN Alert Banner (Plain utilitarian warning, no emoji) */}
      {hasActiveVpn && (
        <div className="warning-banner">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Warning:</strong> Active VPN adapter detected ({activeVpns.join(', ') || 'VPN'}).
            Full-tunnel VPNs route all traffic through one gateway and frequently block outbound packets
            on secondary physical adapters. If physical links fail to connect, pause or disconnect the VPN
            while multi-link merging.
          </div>
        </div>
      )}

      {/* Control Toolbar */}
      <section className="toolbar-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>
            Detected Adapters ({interfaces.length} total, {displayedInterfaces.length} active)
          </span>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={showAllAdapters}
              onChange={(e) => setShowAllAdapters(e.target.checked)}
            />
            <span>Show all adapters{hiddenCount > 0 && !showAllAdapters ? ` (${hiddenCount} hidden)` : ''}</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={onRefresh}
            className="btn btn-sm"
            title="Refresh adapter list from OS"
          >
            <RefreshCw size={12} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleTestAllLinks}
            disabled={isTestingAll}
            className="btn-primary btn-sm"
          >
            <Play size={12} />
            <span>{isTestingAll ? 'Testing all...' : 'Test All Links'}</span>
          </button>
        </div>
      </section>

      {/* Adapter Cards Grid (Matching Stitch visual reference) */}
      {displayedInterfaces.length === 0 ? (
        <div className="stitch-card" style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No active physical network adapters found. Check "Show all adapters" to display inactive links.
        </div>
      ) : (
        <div className="adapters-grid">
          {displayedInterfaces.map((iface, idx) => {
            const color = LINK_COLORS[idx % LINK_COLORS.length]
            const test = testResults[iface.ip]
            const isTesting = testingIps[iface.ip]

            return (
              <div key={iface.id || iface.ip} className="adapter-card">
                {/* Top channel color strip */}
                <div
                  className="adapter-card-top-bar"
                  style={{ backgroundColor: iface.is_up ? color : 'var(--border)' }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: iface.is_up ? color : 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        {getInterfaceIcon(iface)}
                      </div>

                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="status-chip"
                            style={{
                              borderColor: iface.is_up ? 'rgba(46, 158, 91, 0.35)' : 'var(--border)',
                              color: iface.is_up ? 'var(--status-success)' : 'var(--text-muted)',
                            }}
                          >
                            <span className={`status-dot ${iface.is_up ? 'active' : 'queued'}`} />
                            <span>{iface.is_up ? 'UP • Active' : 'Down'}</span>
                          </span>

                          {iface.is_vpn && (
                            <span className="status-chip error">
                              <span className="status-dot error" />
                              <span>VPN</span>
                            </span>
                          )}
                          {iface.is_link_local && (
                            <span className="status-chip warning">
                              <span className="status-dot paused" />
                              <span>APIPA</span>
                            </span>
                          )}
                        </div>

                        <h3
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--text)',
                            marginTop: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {iface.friendly_label || iface.adapter_name}
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Hardware details & IP */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Interface: <span className="mono" style={{ color: 'var(--text)' }}>{iface.adapter_name}</span>
                      {iface.if_index ? ` • idx: ${iface.if_index}` : ''}
                    </div>

                    <div className="mono tabular-nums" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Local IP: <strong>{iface.ip}</strong>
                    </div>

                    {/* Tested Public IP badge */}
                    {test && test.success && test.public_ip && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        <Globe size={13} style={{ color: 'var(--text-muted)' }} />
                        <span className="mono tabular-nums">Public IP: {test.public_ip}</span>
                      </div>
                    )}

                    {test && !test.success && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11,
                          color: 'var(--status-error)',
                          marginTop: 2,
                        }}
                      >
                        <XCircle size={13} />
                        <span>{test.error || 'Connection check failed'}</span>
                      </div>
                    )}
                  </div>

                  {/* Real Link Speed / PHY Box */}
                  <div
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PHY Link Speed</div>
                      <div className="mono tabular-nums" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                        {iface.speed_mbps ? `${iface.speed_mbps} Mbps` : '--'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Socket Route</div>
                      <span className="mono tabular-nums" style={{ fontSize: 11.5, color: color, fontWeight: 600 }}>
                        {iface.is_default ? 'Default Gateway' : 'Secondary Route'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Channel #{idx + 1}
                  </span>

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleTestLink(iface.ip)}
                    disabled={isTesting || !iface.is_up}
                    title="Test outbound route through this adapter"
                  >
                    {isTesting ? (
                      <span>Probing...</span>
                    ) : test?.success ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--status-success)' }}>
                        <CheckCircle2 size={13} />
                        <span>Verified</span>
                      </span>
                    ) : (
                      <span>Test Link</span>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
