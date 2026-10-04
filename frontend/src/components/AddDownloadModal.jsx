import React, { useState, useEffect } from 'react'
import {
  X,
  Search,
  Download,
  Network,
  Sliders,
  ShieldCheck,
  Check,
  AlertCircle,
  AlertTriangle,
  Activity,
  Layers,
  Globe,
  FolderOpen,
} from 'lucide-react'
import { formatBytes } from '../utils/formatters'

export default function AddDownloadModal({
  isOpen,
  onClose,
  onSubmit,
  interfaces = [],
  defaultDownloadDir = 'downloads',
  hasActiveVpn = false,
  vpnWarning = null,
}) {
  const [url, setUrl] = useState('')
  const [destinationPath, setDestinationPath] = useState(defaultDownloadDir)
  const [selectedIps, setSelectedIps] = useState([])
  const [connectionsPerLink, setConnectionsPerLink] = useState(4)
  const [chunkSizeMb, setChunkSizeMb] = useState(4)
  const [expectedChecksum, setExpectedChecksum] = useState('')

  const [probing, setProbing] = useState(false)
  const [probeResult, setProbeResult] = useState(null)
  const [probeError, setProbeError] = useState(null)
  const [testingIp, setTestingIp] = useState(null)
  const [testingAll, setTestingAll] = useState(false)
  const [linkTestResults, setLinkTestResults] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  // Initialize selected IPs to active non-link-local interfaces
  useEffect(() => {
    if (interfaces.length > 0 && selectedIps.length === 0) {
      const activeIps = interfaces
        .filter((iface) => iface.is_up && !iface.is_link_local)
        .map((iface) => iface.ip)

      // If multiple active, select all; otherwise leave empty (Auto)
      if (activeIps.length > 1) {
        setSelectedIps(activeIps)
      } else if (activeIps.length === 1) {
        setSelectedIps(activeIps)
      }
    }
  }, [interfaces])

  useEffect(() => {
    if (defaultDownloadDir && destinationPath === 'downloads') {
      setDestinationPath(defaultDownloadDir)
    }
  }, [defaultDownloadDir])

  if (!isOpen) return null

  const handleProbe = async () => {
    if (!url.trim()) return
    setProbing(true)
    setProbeError(null)
    setProbeResult(null)

    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Probe request failed')
      }
      setProbeResult(data)
    } catch (err) {
      setProbeError(err.message)
    } finally {
      setProbing(false)
    }
  }

  const handleTestLink = async (ip) => {
    setTestingIp(ip)
    try {
      const res = await fetch('/api/interfaces/test-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      })
      const data = await res.json()
      setLinkTestResults((prev) => ({
        ...prev,
        [ip]: {
          success: data.success,
          public_ip: data.public_ip,
          error: data.error,
          if_index: data.if_index,
        },
      }))
    } catch (e) {
      setLinkTestResults((prev) => ({
        ...prev,
        [ip]: { success: false, public_ip: null, error: e.message },
      }))
    } finally {
      setTestingIp(null)
    }
  }

  const handleTestAllLinks = async () => {
    setTestingAll(true)
    try {
      const res = await fetch('/api/interfaces/test-all-links', { method: 'POST' })
      const data = await res.json()
      if (data.results) {
        const resultMap = {}
        data.results.forEach((r) => {
          resultMap[r.ip] = r
        })
        setLinkTestResults(resultMap)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setTestingAll(false)
    }
  }

  const toggleIp = (ip) => {
    setSelectedIps((prev) =>
      prev.includes(ip) ? prev.filter((item) => item !== ip) : [...prev, ip]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return

    setSubmitting(true)
    try {
      await onSubmit({
        url: url.trim(),
        destination_path: destinationPath.trim() || undefined,
        bind_ips: selectedIps.length > 0 ? selectedIps : null,
        connections_per_link: connectionsPerLink,
        chunk_size: chunkSizeMb * 1024 * 1024,
        expected_checksum: expectedChecksum.trim() || undefined,
      })
      onClose()
    } catch (err) {
      alert(`Failed to add download: ${err.message}`)
    } finally {
      setSubmitting(false)
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
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
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
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          background: 'rgba(17, 24, 39, 0.95)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              New Multi-Link Download
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Split file chunks across selected network adapters to maximize total download speed.
            </p>
          </div>
          <button onClick={onClose} className="btn-icon" title="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* URL Input */}
          <div className="input-group">
            <label className="input-label">Download URL (HTTP / HTTPS)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                required
                className="text-input"
                placeholder="https://example.com/largefile.zip"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => {
                  if (url.trim() && !probeResult && !probing) handleProbe()
                }}
              />
              <button
                type="button"
                onClick={handleProbe}
                disabled={probing || !url.trim()}
                className="btn btn-secondary"
                style={{ flexShrink: 0, padding: '8px 16px' }}
              >
                <Search size={16} />
                <span>{probing ? 'Probing...' : 'Probe URL'}</span>
              </button>
            </div>
          </div>

          {/* Probed Info Card */}
          {probeResult && (
            <div
              style={{
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {probeResult.filename}
                </span>
                <span className={`badge ${probeResult.supports_range ? 'badge-green' : 'badge-amber'}`}>
                  {probeResult.supports_range ? 'Multi-Link Range Supported' : 'Single Stream Only'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)' }}>
                <span>Size: <strong style={{ color: 'var(--accent-cyan)' }}>{formatBytes(probeResult.total_bytes)}</strong></span>
                {probeResult.etag && <span>ETag: {probeResult.etag}</span>}
              </div>
            </div>
          )}

          {probeError && (
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                fontSize: '0.8125rem',
                color: '#fb7185',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={16} />
              <span>{probeError}</span>
            </div>
          )}

          {/* Destination Path */}
          <div className="input-group">
            <label className="input-label">Save Location</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                className="text-input"
                value={destinationPath}
                onChange={(e) => setDestinationPath(e.target.value)}
                placeholder="downloads/filename.ext or folder path"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={async () => {
                  setBrowsing(true)
                  try {
                    const res = await fetch('/api/browse-folder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ initial_dir: destinationPath }),
                    })
                    const data = await res.json()
                    if (data.success && data.path) {
                      setDestinationPath(data.path)
                    }
                  } catch (e) {
                    console.error('Browse error:', e)
                  } finally {
                    setBrowsing(false)
                  }
                }}
                disabled={browsing}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 12px',
                  height: 38,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title="Browse folder on your PC"
              >
                <FolderOpen size={14} />
                <span>{browsing ? 'Browsing...' : 'Browse...'}</span>
              </button>
            </div>
          </div>

          {/* Interface Selector (Multi-Link Binding) */}
          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Network size={14} color="var(--accent-cyan)" />
                Merge Network Interfaces ({selectedIps.length} selected)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleTestAllLinks}
                  disabled={testingAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-amber)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {testingAll ? 'Testing All...' : '⚡ Test All Links'}
                </button>
                <span style={{ color: 'var(--text-muted)' }}>|</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIps(
                      interfaces.filter((i) => i.is_up && !i.is_link_local).map((i) => i.ip)
                    )
                  }
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Select All
                </button>
                <span style={{ color: 'var(--text-muted)' }}>|</span>
                <button
                  type="button"
                  onClick={() => setSelectedIps([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Auto
                </button>
              </div>
            </div>

            {/* Active VPN Warning Banner */}
            {hasActiveVpn && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  fontSize: '0.78125rem',
                  color: '#fbbf24',
                  lineHeight: 1.45,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Active VPN Detected:</strong> {vpnWarning || 'An active VPN adapter is running. Full-tunnel VPNs override Windows routing and block direct connections on physical adapters (WinError 10013: Access Denied). Disconnect or pause your VPN if physical links fail to connect.'}
                </div>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                maxHeight: '230px',
                overflowY: 'auto',
              }}
            >
              {interfaces
                .filter((iface) => !iface.is_link_local)
                .map((iface) => {
                  const isChecked = selectedIps.includes(iface.ip)
                  const testRes = linkTestResults[iface.ip]
                  const isTesting = testingIp === iface.ip

                  return (
                    <div
                      key={iface.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: isChecked ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: isChecked ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid transparent',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            flex: 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleIp(iface.ip)}
                            style={{ accentColor: 'var(--accent-cyan)', width: 16, height: 16 }}
                          />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {iface.adapter_name}
                              </span>
                              {iface.if_index && (
                                <span className="badge badge-cyan" style={{ fontSize: '0.625rem', padding: '1px 5px' }}>
                                  IfIndex:{iface.if_index}
                                </span>
                              )}
                              {iface.is_vpn && (
                                <span className="badge badge-purple" style={{ fontSize: '0.625rem' }}>
                                  VPN Tunnel
                                </span>
                              )}
                              {iface.is_default && (
                                <span className="badge badge-cyan" style={{ fontSize: '0.625rem' }}>
                                  Gateway
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              IP: {iface.ip} {iface.speed_mbps > 0 ? `• ${iface.speed_mbps} Mbps` : ''}
                            </div>
                          </div>
                        </label>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {testRes?.success && (
                            <span className="badge badge-green" title={`Public WAN IP: ${testRes.public_ip}`}>
                              <Globe size={11} /> {testRes.public_ip}
                            </span>
                          )}

                          {testRes && !testRes.success && (
                            <span className="badge badge-rose" title={testRes.error}>
                              Failed
                            </span>
                          )}

                          {testRes?.is_duplicate && (
                            <span className="badge badge-amber" title={testRes.duplicate_warning}>
                              Duplicate WAN
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleTestLink(iface.ip)
                            }}
                            disabled={isTesting}
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '0.725rem' }}
                            title="Test this interface by fetching public IP via IP_UNICAST_IF"
                          >
                            {isTesting ? <Activity size={12} className="spin" /> : <span>Test Link</span>}
                          </button>
                        </div>
                      </div>

                      {/* Diagnostic Link Error Details if failed */}
                      {testRes && !testRes.success && (
                        <div
                          style={{
                            marginTop: 4,
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(244, 63, 94, 0.1)',
                            border: '1px solid rgba(244, 63, 94, 0.25)',
                            color: '#fb7185',
                            fontSize: '0.7125rem',
                            lineHeight: 1.35,
                          }}
                        >
                          <strong>Test Failed:</strong> {testRes.error}
                        </div>
                      )}

                      {/* Duplicate WAN Warning */}
                      {testRes?.duplicate_warning && (
                        <div
                          style={{
                            marginTop: 2,
                            padding: '5px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            color: '#fbbf24',
                            fontSize: '0.7rem',
                            lineHeight: 1.35,
                          }}
                        >
                          💡 {testRes.duplicate_warning}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Tip: Merging separate physical connections (e.g. Wi-Fi router + 5G mobile hotspot) produces true speed aggregation.
            </p>
          </div>

          {/* Configuration Settings (Conns & Chunks) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={14} />
                Connections per Link: {connectionsPerLink}
              </label>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={connectionsPerLink}
                onChange={(e) => setConnectionsPerLink(parseInt(e.target.value, 10))}
                style={{ accentColor: 'var(--accent-cyan)', marginTop: 8 }}
              />
            </div>

            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={14} />
                Chunk Size
              </label>
              <select
                className="text-input"
                value={chunkSizeMb}
                onChange={(e) => setChunkSizeMb(parseInt(e.target.value, 10))}
              >
                <option value={2}>2 MB (Faster links / mobile)</option>
                <option value={4}>4 MB (Recommended)</option>
                <option value={8}>8 MB (High-bandwidth lines)</option>
                <option value={16}>16 MB (Very large files)</option>
              </select>
            </div>
          </div>

          {/* Optional Checksum */}
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} />
              Expected Checksum (Optional SHA-256 or MD5)
            </label>
            <input
              type="text"
              className="text-input stat-mono"
              placeholder="e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              value={expectedChecksum}
              onChange={(e) => setExpectedChecksum(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 6 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !url.trim()} className="btn btn-primary">
              <Download size={16} />
              <span>{submitting ? 'Starting...' : 'Start Download'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
