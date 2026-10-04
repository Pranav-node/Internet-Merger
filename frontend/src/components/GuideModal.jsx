import React, { useState, useEffect } from 'react'
import {
  X,
  BookOpen,
  Zap,
  Layers,
  Cpu,
  Package,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Wifi,
  ShieldAlert,
  HardDrive,
  HelpCircle,
} from 'lucide-react'

const TABS = [
  { id: 'quickstart', label: 'Quick Start', icon: Zap },
  { id: 'connections', label: 'Connections', icon: Layers },
  { id: 'chunks-workers', label: 'Chunks vs Workers', icon: Package },
  { id: 'speed-tips', label: 'Speed Tips', icon: Sliders },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: AlertTriangle },
]

export default function GuideModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('quickstart')

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease',
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
          padding: '26px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-card-hover)',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-red-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-red)',
                flexShrink: 0,
              }}
            >
              <BookOpen size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                Internet Merger Guide & Concepts
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                How multi-connection bonding works, key technical concepts, and speed optimization.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-icon"
            style={{ width: 34, height: 34, flexShrink: 0 }}
            title="Close Guide (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Category Pills */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`badge ${isActive ? 'badge-red' : 'badge-muted'}`}
                style={{
                  cursor: 'pointer',
                  padding: '7px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: isActive ? '1px solid var(--accent-red)' : '1px solid var(--border-color)',
                  background: isActive ? 'var(--accent-red)' : 'var(--bg-subtle)',
                  color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={14} color={isActive ? '#FFFFFF' : 'currentColor'} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab Content Areas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* TAB 1: QUICK START */}
          {activeTab === 'quickstart' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                }}
              >
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                  3-Step Quick Start
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--accent-red)',
                        color: '#FFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                        Connect Your Network Adapters
                      </strong>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        Connect two or more separate internet sources to your machine (e.g. your home Wi-Fi + phone USB tethering or Ethernet). Internet Merger automatically discovers active adapters.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--accent-red)',
                        color: '#FFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                        Paste Download URL
                      </strong>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        Paste any standard HTTP/HTTPS file download link into the top search bar (e.g., Linux ISOs, archives, installers).
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--accent-red)',
                        color: '#FFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        flexShrink: 0,
                      }}
                    >
                      3
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                        Click Download & Merge
                      </strong>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        The engine probes the server for Range support, partitions the file into chunks, and streams them simultaneously across all connected adapters directly to disk.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Flow Diagram */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78125rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>
                  PARALLEL MULTI-LINK DOWNLOAD FLOW
                </div>
                <div style={{ color: '#06b6d4' }}>[Ethernet Adapter]  ──▶ Workers #1..8  ──▶ Pulls Chunks [0, 2, 4, 6] ──┐</div>
                <div style={{ color: '#a855f7' }}>[Wi-Fi / Hotspot]  ──▶ Workers #1..8  ──▶ Pulls Chunks [1, 3, 5, 7] ──┼─▶ [Direct File on Disk]</div>
                <div style={{ color: '#f59e0b' }}>[Phone USB Tether] ──▶ Workers #1..8  ──▶ Pulls Chunks [8, 9, 10...] ──┘</div>
              </div>
            </div>
          )}

          {/* TAB 2: CONNECTIONS */}
          {activeTab === 'connections' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                }}
              >
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  How Connections & Sockets Work
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  Normally, Windows routes all outbound traffic through one single default gateway. Even if you have Wi-Fi and Ethernet active, standard browsers only utilize one.
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.55 }}>
                  Internet Merger uses low-level Winsock interface socket options (<code>IP_UNICAST_IF</code>) and local IP binding to force individual worker TCP sockets directly out of specific network adapters.
                </p>
              </div>

              {/* Realistic Bandwidth Expectations */}
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                }}
              >
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  True Additive Bandwidth Requirement
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(38, 126, 62, 0.08)',
                      border: '1px solid rgba(38, 126, 62, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--accent-green)', fontSize: '0.8125rem' }}>
                      ✓ Genuine Additive Speed
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      Home Fiber (Ethernet) + Mobile 4G/5G Hotspot (Wi-Fi/USB). Two independent ISP lines merge for combined speed (e.g. 50 + 30 = 80 Mbps).
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(217, 119, 6, 0.08)',
                      border: '1px solid rgba(217, 119, 6, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--accent-amber)', fontSize: '0.8125rem' }}>
                      ℹ Same-Router Limit
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      Connecting Ethernet and Wi-Fi to the same router cannot exceed your single broadband ISP plan, but bypasses per-connection remote throttling.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CHUNKS VS WORKERS */}
          {activeTab === 'chunks-workers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Simple Distinction Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Package size={18} color="var(--accent-red)" />
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      What is a Chunk?
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong>The Payload / Slice.</strong> The file is split into sequential byte ranges (e.g. 4 MB each).
                  </p>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    A 1 GB file = 256 chunks of 4 MB. Each chunk is written to disk at its exact byte offset as soon as it arrives.
                  </div>
                </div>

                <div
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Cpu size={18} color="var(--accent-red)" />
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      What is a Worker?
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong>The Delivery Pipeline.</strong> An independent concurrent task pinned to an adapter socket.
                  </p>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    8 workers per link = 8 parallel streams actively fetching chunks over that adapter from the shared work queue.
                  </div>
                </div>
              </div>

              {/* Warehouse Analogy Banner */}
              <div
                style={{
                  background: 'rgba(226, 55, 68, 0.06)',
                  border: '1px solid rgba(226, 55, 68, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem' }}>📦</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  <strong>Simple Analogy:</strong> Think of <strong>Chunks</strong> as boxes in a warehouse, and <strong>Workers</strong> as courier vans. Faster vans return quickly and grab more boxes automatically!
                </div>
              </div>

              {/* Chunk Slicing Visual */}
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  FILE CHUNK PARTITIONING EXAMPLE (4 MB CHUNKS)
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>Chunk 0 (0–4 MB)</span>
                  <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>Chunk 1 (4–8 MB)</span>
                  <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>Chunk 2 (8–12 MB)</span>
                  <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>Chunk 3 (12–16 MB)</span>
                  <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>... Chunks 4 to N</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SPEED TIPS */}
          {activeTab === 'speed-tips' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                }}
              >
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                  Maximizing Your Download Speed
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: '0.8125rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Start with 8 Workers per Connection:</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                        8 connections per link is the optimal balance for most fiber, 4G, and 5G networks without overwhelming server concurrency limits.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: '0.8125rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Click "Find Best Connections" on Active Downloads:</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                        The built-in autotuner systematically increases worker concurrency in steps, measures throughput gains, and locks in the peak speed.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: '0.8125rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Use USB Tethering Instead of Wi-Fi Hotspot:</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                        Plugging your phone in via USB and enabling "USB Tethering" avoids Wi-Fi channel interference, cuts ping jitter, and delivers higher throughput.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: '0.8125rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Tweak Chunk Size for File Size:</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                        Use 4 MB for general files (100MB–4GB), 2 MB for faster mobile links, and 8–16 MB for very large ISOs (10GB+) on gigabit links.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TROUBLESHOOTING */}
          {activeTab === 'troubleshooting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                }}
              >
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                  Common Issues & Resolutions
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#DC2626', fontWeight: 700, fontSize: '0.8125rem' }}>
                      <ShieldAlert size={15} />
                      <span>One connection shows 0 B/s or WinError 10013 (Access Denied)</span>
                    </div>
                    <p style={{ fontSize: '0.78125rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                      <strong>Cause:</strong> An active full-tunnel VPN (e.g. Cloudflare WARP, WireGuard, NordVPN, Tailscale) or firewall filter driver is capturing all outbound traffic and blocking socket-bound physical interfaces.
                      <br />
                      <strong>Fix:</strong> Pause or disconnect your VPN during multi-link parallel downloads.
                    </p>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.8125rem' }}>
                      <AlertTriangle size={15} />
                      <span>Total speed is the same as a single connection</span>
                    </div>
                    <p style={{ fontSize: '0.78125rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                      <strong>Cause:</strong> Both Ethernet and Wi-Fi are connected to the same home router / single ISP subscription.
                      <br />
                      <strong>Fix:</strong> Connect one adapter to your phone's mobile cellular hotspot (or USB tethering) so the connections pull from distinct internet providers.
                    </p>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-blue)', fontWeight: 700, fontSize: '0.8125rem' }}>
                      <HardDrive size={15} />
                      <span>Server doesn't support Range requests (HTTP 200)</span>
                    </div>
                    <p style={{ fontSize: '0.78125rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                      <strong>Behavior:</strong> Some legacy servers ignore HTTP Range headers. Internet Merger automatically detects this during probing and seamlessly falls back to a single stream without failing.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--border-color)',
            paddingTop: 14,
            fontSize: '0.78125rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span>Internet Merger • Desktop Accelerator</span>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px 16px', fontSize: '0.8125rem' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
