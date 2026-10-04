import React, { useState } from 'react'
import {
  X,
  Layers,
  Globe,
  Activity,
  AlertTriangle,
  Zap,
  Info,
  CheckCircle2,
  Gauge,
  Wifi,
} from 'lucide-react'

export default function NetworkDrawer({
  isOpen,
  onClose,
  interfaces = [],
  hasActiveVpn = false,
  vpnWarning = null,
  activeVpns = [],
}) {
  const [showAllAdapters, setShowAllAdapters] = useState(false)
  const [testingIp, setTestingIp] = useState(null)
  const [testResults, setTestResults] = useState({})
  const [benchmarking, setBenchmarking] = useState(false)
  const [benchmarkResults, setBenchmarkResults] = useState({})
  const [benchmarkingIp, setBenchmarkingIp] = useState(null)

  if (!isOpen) return null

  // Filter visible adapters
  const visibleInterfaces = showAllAdapters
    ? interfaces
    : interfaces.filter((i) => !i.is_hidden_by_default)

  const hiddenCount = interfaces.length - interfaces.filter((i) => !i.is_hidden_by_default).length

  // Test single interface public IP
  const handleTestLink = async (ip) => {
    setTestingIp(ip)
    try {
      const res = await fetch('/api/interfaces/test-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      })
      const data = await res.json()
      setTestResults((prev) => ({ ...prev, [ip]: data }))
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [ip]: { success: false, error: err.message || 'Test failed' },
      }))
    } finally {
      setTestingIp(null)
    }
  }

  // Benchmark single interface alone (10 seconds)
  const handleBenchmarkSingle = async (ip) => {
    setBenchmarkingIp(ip)
    try {
      const res = await fetch('/api/interfaces/benchmark-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, duration_seconds: 10.0 }),
      })
      const data = await res.json()
      setBenchmarkResults((prev) => ({ ...prev, [ip]: data }))
    } catch (err) {
      setBenchmarkResults((prev) => ({
        ...prev,
        [ip]: { success: false, error: err.message || 'Benchmark failed' },
      }))
    } finally {
      setBenchmarkingIp(null)
    }
  }

  // Benchmark all interfaces alone sequentially (10 seconds each)
  const handleBenchmarkAll = async () => {
    setBenchmarking(true)
    try {
      const res = await fetch('/api/interfaces/benchmark-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_seconds: 10.0 }),
      })
      const data = await res.json()
      if (data.results) {
        const map = {}
        data.results.forEach((r) => {
          map[r.ip] = r
        })
        setBenchmarkResults(map)
      }
    } catch (err) {
      console.error('Benchmark all failed:', err)
    } finally {
      setBenchmarking(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="food-card"
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-red-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-red)',
              }}
            >
              <Layers size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Network Adapters & Link Benchmark
              </h2>
              <p style={{ fontSize: '0.78125rem', color: 'var(--text-secondary)' }}>
                Inspect physical adapters, test public WAN routing, and discover bottlenecks.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={18} />
          </button>
        </div>

        {/* Compact VPN Warning Banner */}
        {hasActiveVpn && (
          <div
            style={{
              background: 'var(--accent-amber-light)',
              border: '1px solid rgba(217, 119, 6, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              fontSize: '0.8125rem',
              color: '#B45309',
              lineHeight: 1.4,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong>Active VPN Detected ({activeVpns.join(', ')}):</strong> Full-tunnel VPNs route all traffic through the tunnel. If physical links fail to connect, pause your VPN while multi-link merging.
            </div>
          </div>
        )}

        {/* Benchmark All Action Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              Standalone Link Benchmarking
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Test each connection alone for 10 seconds to discover individual throughput limits.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78125rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={showAllAdapters}
                onChange={(e) => setShowAllAdapters(e.target.checked)}
                style={{ accentColor: 'var(--accent-red)' }}
              />
              <span>Show all ({hiddenCount} hidden)</span>
            </label>

            <button
              onClick={handleBenchmarkAll}
              disabled={benchmarking}
              className="btn btn-primary"
              style={{ padding: '6px 16px', fontSize: '0.8125rem', gap: 6 }}
            >
              {benchmarking ? (
                <>
                  <Activity size={14} className="spin" />
                  <span>Benchmarking (10s/link)...</span>
                </>
              ) : (
                <>
                  <Gauge size={14} />
                  <span>Test each link alone</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Adapters List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibleInterfaces.map((iface) => {
            const testRes = testResults[iface.ip]
            const benchRes = benchmarkResults[iface.ip]
            const isTesting = testingIp === iface.ip
            const isBenchmarking = benchmarkingIp === iface.ip

            return (
              <div
                key={iface.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: iface.is_up ? 'var(--accent-green)' : 'var(--text-muted)',
                        }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                        {iface.friendly_label || iface.adapter_name}
                      </span>

                      {iface.if_index && (
                        <span className="badge badge-muted" style={{ fontSize: '0.6875rem' }}>
                          IfIndex:{iface.if_index}
                        </span>
                      )}

                      {iface.is_vpn && (
                        <span className="badge badge-red" style={{ fontSize: '0.6875rem' }}>
                          VPN Tunnel
                        </span>
                      )}

                      {iface.is_default && (
                        <span className="badge badge-blue" style={{ fontSize: '0.6875rem' }}>
                          Default Gateway
                        </span>
                      )}

                      {iface.is_link_local && (
                        <span className="badge badge-amber" style={{ fontSize: '0.6875rem' }}>
                          APIPA (169.254)
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '0.78125rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 4,
                      }}
                    >
                      IP: {iface.ip}
                      {iface.speed_mbps > 0 && (
                        <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                          • Link Rate: {iface.speed_mbps} Mbps
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Live Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {testRes?.success && (
                      <span className="badge badge-green" title={`Public WAN IP: ${testRes.public_ip}`}>
                        <Globe size={11} /> {testRes.public_ip}
                      </span>
                    )}

                    {benchRes?.success && (
                      <span className="badge badge-red" style={{ fontWeight: 700 }}>
                        <Zap size={12} /> {benchRes.speed_mb_s} MB/s ({benchRes.speed_mbps} Mbps)
                      </span>
                    )}

                    {!iface.is_link_local && iface.is_up && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTestLink(iface.ip)}
                          disabled={isTesting}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          title="Verify public IP through this specific link"
                        >
                          {isTesting ? <Activity size={12} className="spin" /> : <span>Test IP</span>}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleBenchmarkSingle(iface.ip)}
                          disabled={isBenchmarking || benchmarking}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          title="Benchmark this interface alone for 10 seconds"
                        >
                          {isBenchmarking ? <Activity size={12} className="spin" /> : <span>10s Speed Test</span>}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Wi-Fi Link Rate Bottleneck Warning */}
                {benchRes?.bottleneck_warning && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-amber-light)',
                      border: '1px solid rgba(217, 119, 6, 0.25)',
                      color: '#B45309',
                      fontSize: '0.75rem',
                      lineHeight: 1.35,
                    }}
                  >
                    💡 <strong>Bottleneck Warning:</strong> {benchRes.bottleneck_warning}
                  </div>
                )}

                {/* Test error diagnostic */}
                {testRes && !testRes.success && (
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#DC2626',
                      fontSize: '0.725rem',
                    }}
                  >
                    <strong>Diagnostic:</strong> {testRes.error}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Technical Footer */}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          💡 <strong>Multi-Link Tip:</strong> On Windows, outgoing sockets are pinned using Winsock option 31 (<code>IP_UNICAST_IF</code>) with interface index in network byte order. To merge full bandwidth, combine two truly independent connections (e.g. Fiber broadband on Wi-Fi + 5G mobile hotspot on USB Tethering).
        </div>
      </div>
    </div>
  )
}
