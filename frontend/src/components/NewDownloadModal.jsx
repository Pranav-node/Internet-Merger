import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react'
import { formatBytes } from '../utils/formatters'

export default function NewDownloadModal({
  isOpen,
  onClose,
  onSubmit,
  interfaces = [],
  defaultConnections = 8,
  defaultChunkSize = 4 * 1024 * 1024,
}) {
  const [url, setUrl] = useState('')
  const [downloadFolder, setDownloadFolder] = useState(() => {
    try {
      return localStorage.getItem('im_download_folder') || 'downloads'
    } catch {
      return 'downloads'
    }
  })
  const [filename, setFilename] = useState('')
  const [connectionsPerLink, setConnectionsPerLink] = useState(defaultConnections)
  const [chunkSize, setChunkSize] = useState(defaultChunkSize)
  const [checksum, setChecksum] = useState('')
  const [selectedIps, setSelectedIps] = useState([])
  const [isProbing, setIsProbing] = useState(false)
  const [probeResult, setProbeResult] = useState(null)
  const [probeError, setProbeError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [isBrowsing, setIsBrowsing] = useState(false)

  const probeTimeoutRef = useRef(null)

  // Filter available physical interfaces (default to active interfaces)
  const activeInterfaces = interfaces.filter((i) => i.is_up && !i.is_link_local && !i.is_vpn)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setUrl('')
      setFilename('')
      setConnectionsPerLink(defaultConnections)
      setChunkSize(defaultChunkSize)
      setChecksum('')
      setProbeResult(null)
      setProbeError(null)
      setSubmitError(null)
      setIsSubmitting(false)
      // Default to all active physical interfaces selected
      setSelectedIps(activeInterfaces.map((i) => i.ip))
    }
  }, [isOpen])

  // Probe URL with debounce when URL changes
  useEffect(() => {
    if (!url.trim() || !url.startsWith('http')) {
      setProbeResult(null)
      setProbeError(null)
      return
    }

    if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current)

    probeTimeoutRef.current = setTimeout(async () => {
      setIsProbing(true)
      setProbeError(null)
      try {
        const res = await fetch('/api/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to probe URL')
        }
        setProbeResult(data)
        if (data.filename) {
          setFilename(data.filename)
        }
      } catch (err) {
        let msg = err.message || 'Probe error'
        if (msg.startsWith('Failed to probe URL: ')) {
          msg = msg.substring('Failed to probe URL: '.length)
        }
        setProbeError(msg)
        setProbeResult(null)
        try {
          const parsed = new URL(url.trim())
          const pathname = parsed.pathname.split('/').filter(Boolean).pop()
          if (pathname) {
            setFilename(decodeURIComponent(pathname))
          } else {
            setFilename('download.bin')
          }
        } catch {
          setFilename('download.bin')
        }
      } finally {
        setIsProbing(false)
      }
    }, 600)

    return () => {
      if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current)
    }
  }, [url])

  // Compute resolved destination path cleanly
  const resolvedPath = useMemo(() => {
    const folder = (downloadFolder || '').trim().replace(/^["']|["']$/g, '')
    const fn = (filename || '').trim().replace(/^["']|["']$/g, '')
    if (!folder) return fn || 'download.bin'
    if (!fn) return folder
    const sep = folder.includes('\\') ? '\\' : '/'
    const cleanFolder = folder.replace(/[\\/]+$/, '')
    return `${cleanFolder}${sep}${fn}`
  }, [downloadFolder, filename])

  const handleFolderChange = (val) => {
    let clean = val.replace(/^["']|["']$/g, '').trim()

    // Handle accidentally pasted drive paths e.g. foo.rarD:\DL
    const driveMatch = clean.match(/^(.*?)(?<!^)([a-zA-Z]:[\\/].*)$/)
    if (driveMatch) {
      const prefix = driveMatch[1].replace(/[\\/]+$/, '')
      const suffix = driveMatch[2].trim()
      clean = suffix
      if (prefix) {
        const prefixBase = prefix.split(/[\\/]/).pop()
        if (prefixBase && prefixBase.includes('.')) {
          setFilename(prefixBase)
        }
      }
    }

    // Check if user pasted a full path that ends with a file extension
    const lastSep = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
    if (lastSep !== -1) {
      const possibleFile = clean.slice(lastSep + 1)
      if (possibleFile.includes('.') && !possibleFile.endsWith('.')) {
        const folderPart = clean.slice(0, lastSep) || (clean.startsWith('/') ? '/' : '.')
        setDownloadFolder(folderPart)
        setFilename(possibleFile)
        try {
          localStorage.setItem('im_download_folder', folderPart)
        } catch {}
        return
      }
    }

    setDownloadFolder(val)
    try {
      localStorage.setItem('im_download_folder', val)
    } catch {}
  }

  const handleBrowseFolder = async () => {
    setIsBrowsing(true)
    try {
      const res = await fetch('/api/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_dir: downloadFolder || undefined }),
      })
      if (!res.ok) {
        throw new Error('Failed to open folder picker')
      }
      const data = await res.json()
      if (data.success && data.path) {
        handleFolderChange(data.path)
      }
    } catch (err) {
      console.error('Folder browsing error:', err)
    } finally {
      setIsBrowsing(false)
    }
  }

  const handleFilenameChange = (val) => {
    let clean = val.replace(/^["']|["']$/g, '').trim()
    const lastSep = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
    if (lastSep !== -1) {
      const folderPart = clean.slice(0, lastSep)
      const filePart = clean.slice(lastSep + 1)
      if (folderPart) {
        setDownloadFolder(folderPart)
        try {
          localStorage.setItem('im_download_folder', folderPart)
        } catch {}
      }
      setFilename(filePart)
      return
    }
    setFilename(val)
  }

  if (!isOpen) return null

  const handleToggleIp = (ip) => {
    setSelectedIps((prev) =>
      prev.includes(ip) ? prev.filter((item) => item !== ip) : [...prev, ip]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const payload = {
        url: url.trim(),
        destination_path: resolvedPath || undefined,
        bind_ips: selectedIps.length > 0 ? selectedIps : undefined,
        connections_per_link: connectionsPerLink,
        chunk_size: chunkSize,
        expected_checksum: checksum.trim() || undefined,
      }

      await onSubmit(payload)
      onClose()
    } catch (err) {
      setSubmitError(err.message || 'Failed to start download')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Multi-Link Download</span>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}
            aria-label="Close dialog"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {submitError && (
            <div className="warning-banner" style={{ borderColor: 'var(--status-red)', color: 'var(--status-red)' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{submitError}</div>
            </div>
          )}

          {/* URL Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>
              Download URL
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="url"
                required
                placeholder="https://example.com/file.iso"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                className="mono"
              />
              {isProbing && (
                <Loader2
                  size={14}
                  className="animate-spin"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)',
                  }}
                />
              )}
            </div>

            {/* Probe Feedback */}
            {probeResult && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-subtle)',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {probeResult.supports_range ? (
                    <span style={{ color: 'var(--status-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={13} />
                      <span style={{ fontWeight: 600 }}>Supports HTTP Range</span>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--status-amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={13} />
                      <span>Single-stream (No Range)</span>
                    </span>
                  )}
                  {probeResult.filename && (
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                      • {probeResult.filename}
                    </span>
                  )}
                </div>

                <div className="mono tabular-nums" style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {formatBytes(probeResult.total_bytes)}
                </div>
              </div>
            )}

            {probeError && (
              <span style={{ fontSize: 11, color: 'var(--status-red)' }}>
                Probe note: {probeError}
              </span>
            )}
          </div>

          {/* Destination Folder and File Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Download Folder with Browse Button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>
                  Download Folder
                </label>
                {downloadFolder !== 'downloads' && (
                  <button
                    type="button"
                    onClick={() => handleFolderChange('downloads')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Reset default
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Select or enter folder (e.g. C:\Downloads or D:\DL)"
                  value={downloadFolder}
                  onChange={(e) => handleFolderChange(e.target.value)}
                  className="mono"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  id="browse-folder-btn"
                  onClick={handleBrowseFolder}
                  disabled={isBrowsing}
                  className="btn btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 14px',
                    height: 34,
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    borderRadius: 'var(--radius-md)',
                    cursor: isBrowsing ? 'wait' : 'pointer',
                    flexShrink: 0,
                  }}
                  title="Browse folder on your PC"
                >
                  {isBrowsing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Browsing...</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen size={14} />
                      <span>Browse...</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* File Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>
                File Name
              </label>
              <input
                type="text"
                placeholder="filename.ext"
                value={filename}
                onChange={(e) => handleFilenameChange(e.target.value)}
                className="mono"
              />
            </div>
          </div>

          {/* Destination Path Preview */}
          <div
            style={{
              padding: '6px 10px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflow: 'hidden',
            }}
          >
            <span style={{ color: 'var(--text-secondary)', flexShrink: 0, fontWeight: 500 }}>Save to:</span>
            <span
              className="mono"
              style={{
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
              title={resolvedPath}
            >
              {resolvedPath}
            </span>
          </div>

          {/* Active Interfaces Checkboxes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>
                Bonded Interfaces ({selectedIps.length} of {activeInterfaces.length} selected)
              </label>
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface)',
                maxHeight: 130,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {activeInterfaces.length === 0 ? (
                <div style={{ padding: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                  No active physical adapters detected.
                </div>
              ) : (
                activeInterfaces.map((iface) => (
                  <label
                    key={iface.ip}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selectedIps.includes(iface.ip)}
                        onChange={() => handleToggleIp(iface.ip)}
                      />
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {iface.friendly_label || iface.adapter_name}
                      </span>
                      <span className="mono tabular-nums" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        ({iface.ip})
                      </span>
                    </div>

                    <span className="mono tabular-nums" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {iface.speed_mbps ? `${iface.speed_mbps} Mbps` : ''}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Tuning: Connections & Chunk Size */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontWeight: 600, fontSize: 11, color: 'var(--text)' }}>
                Sockets per Link
              </label>
              <select
                value={connectionsPerLink}
                onChange={(e) => setConnectionsPerLink(parseInt(e.target.value, 10))}
              >
                <option value={2}>2 sockets</option>
                <option value={4}>4 sockets</option>
                <option value={8}>8 sockets (Recommended)</option>
                <option value={12}>12 sockets</option>
                <option value={16}>16 sockets</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontWeight: 600, fontSize: 11, color: 'var(--text)' }}>
                Chunk Slice Size
              </label>
              <select
                value={chunkSize}
                onChange={(e) => setChunkSize(parseInt(e.target.value, 10))}
              >
                <option value={1024 * 1024}>1 MB</option>
                <option value={2 * 1024 * 1024}>2 MB</option>
                <option value={4 * 1024 * 1024}>4 MB (Standard)</option>
                <option value={8 * 1024 * 1024}>8 MB</option>
                <option value={16 * 1024 * 1024}>16 MB</option>
              </select>
            </div>
          </div>

          {/* Optional Checksum */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>
              Expected Checksum Hash (Optional)
            </label>
            <input
              type="text"
              placeholder="SHA-256 or MD5 hash..."
              value={checksum}
              onChange={(e) => setChecksum(e.target.value)}
              className="mono"
            />
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !url.trim()}>
              {isSubmitting ? 'Starting...' : 'Start Download'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
