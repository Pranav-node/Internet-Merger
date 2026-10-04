import React, { useState, useEffect, useRef, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import MobileNav from './components/MobileNav'
import DownloadsView from './components/DownloadsView'
import LinksView from './components/LinksView'
import HistoryView from './components/HistoryView'
import SettingsView from './components/SettingsView'
import NewDownloadModal from './components/NewDownloadModal'
import { getSessionToken } from './utils/auth'

export default function App() {
  const [currentView, setCurrentView] = useState('downloads')
  const [downloads, setDownloads] = useState([])
  const [interfaces, setInterfaces] = useState([])
  const [systemInfo, setSystemInfo] = useState(null)
  const [connected, setConnected] = useState(false)
  const [isNewDownloadOpen, setIsNewDownloadOpen] = useState(false)
  const [hasActiveVpn, setHasActiveVpn] = useState(false)
  const [activeVpns, setActiveVpns] = useState([])
  const [vpnWarning, setVpnWarning] = useState(null)
  const [speedHistories, setSpeedHistories] = useState({})

  // Theme: neutral light (default) or dark
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')

  // Settings
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('im_settings')
      return saved
        ? JSON.parse(saved)
        : {
            connectionsPerLink: 8,
            chunkSize: 4 * 1024 * 1024,
            autoVerifyChecksum: true,
            defaultDownloadDir: 'downloads/',
          }
    } catch {
      return {
        connectionsPerLink: 8,
        chunkSize: 4 * 1024 * 1024,
        autoVerifyChecksum: true,
        defaultDownloadDir: 'downloads/',
      }
    }
  })

  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  // Update Settings (synced to %APPDATA%\InternetMerger\settings.json)
  const updateSettings = async (updates) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates }
      localStorage.setItem('im_settings', JSON.stringify(next))
      return next
    })
    try {
      const payload = {}
      if (updates.connectionsPerLink !== undefined) payload.connections_per_link = updates.connectionsPerLink
      if (updates.chunkSize !== undefined) payload.chunk_size = updates.chunkSize
      if (updates.autoVerifyChecksum !== undefined) payload.auto_verify_checksum = updates.autoVerifyChecksum
      if (updates.defaultDownloadDir !== undefined) payload.default_download_dir = updates.defaultDownloadDir

      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (e) {
      console.warn('Could not sync settings to backend:', e)
    }
  }

  // Fetch initial system info, interfaces, settings, and downloads
  const fetchData = async () => {
    try {
      const [sysRes, ifRes, dlRes, setRes, histRes] = await Promise.all([
        fetch('/api/system/info').then((r) => r.json()).catch(() => null),
        fetch('/api/interfaces').then((r) => r.json()).catch(() => null),
        fetch('/api/downloads').then((r) => r.json()).catch(() => null),
        fetch('/api/settings').then((r) => r.json()).catch(() => null),
        fetch('/api/history').then((r) => r.json()).catch(() => null),
      ])
      if (sysRes) setSystemInfo(sysRes)
      if (setRes && setRes.settings) {
        setSettings((prev) => ({
          ...prev,
          connectionsPerLink: setRes.settings.connections_per_link || prev.connectionsPerLink,
          chunkSize: setRes.settings.chunk_size || prev.chunkSize,
          autoVerifyChecksum: setRes.settings.auto_verify_checksum !== undefined ? setRes.settings.auto_verify_checksum : prev.autoVerifyChecksum,
          defaultDownloadDir: setRes.settings.default_download_dir || prev.defaultDownloadDir,
        }))
      }
      if (dlRes && dlRes.downloads) setDownloads(dlRes.downloads)
      if (histRes && histRes.history) {
        setDownloads((current) => {
          const ids = new Set(current.map((d) => d.id))
          const additional = histRes.history.filter((h) => !ids.has(h.id))
          return [...current, ...additional]
        })
      }
      if (ifRes) {
        if (ifRes.interfaces) setInterfaces(ifRes.interfaces)
        if (ifRes.has_active_vpn !== undefined) {
          setHasActiveVpn(Boolean(ifRes.has_active_vpn))
          setVpnWarning(ifRes.vpn_warning)
          setActiveVpns(ifRes.active_vpns || [])
        }
      }
    } catch (err) {
      console.warn('Initial metadata fetch warning:', err)
    }
  }

  // WebSocket connection management
  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.port === '5173' ? '127.0.0.1:8000' : (window.location.host || '127.0.0.1:8000')
    const token = getSessionToken()
    const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'progress' || data.type === 'initial') {
          if (data.downloads) {
            setDownloads(data.downloads)
            // Record telemetry for rolling speed charts
            const now = Date.now()
            setSpeedHistories((prev) => {
              const next = { ...prev }
              data.downloads.forEach((d) => {
                const sample = {
                  time: now,
                  total: d.total_speed_bps || 0,
                  links: {},
                }
                if (d.links) {
                  Object.entries(d.links).forEach(([k, v]) => {
                    sample.links[k] = v.current_speed_bps || 0
                  })
                }
                const prevList = next[d.id] || []
                next[d.id] = [...prevList.slice(-29), sample]
              })
              return next
            })
          }
        }
      } catch (e) {
        console.error('Error parsing WS message:', e)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  useEffect(() => {
    fetchData()
    connectWebSocket()

    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [])

  // Aggregate stats
  const { totalSpeed, activeCount, completedCount } = useMemo(() => {
    let speed = 0
    let active = 0
    let done = 0

    downloads.forEach((d) => {
      if (d.status === 'downloading') {
        speed += d.total_speed_bps || 0
        active += 1
      } else if (d.status === 'probing' || d.status === 'queued') {
        active += 1
      } else if (d.status === 'completed') {
        done += 1
      }
    })

    return { totalSpeed: speed, activeCount: active, completedCount: done }
  }, [downloads])

  // Count active physical interfaces
  const activeLinksCount = useMemo(() => {
    return interfaces.filter((i) => i.is_up && !i.is_link_local && !i.is_vpn).length
  }, [interfaces])

  // Action handlers
  const handlePause = async (id) => {
    try {
      await fetch(`/api/downloads/${id}/pause`, { method: 'POST' })
    } catch (e) {
      console.error(e)
    }
  }

  const handleResume = async (id) => {
    try {
      await fetch(`/api/downloads/${id}/resume`, { method: 'POST' })
    } catch (e) {
      console.error(e)
    }
  }

  const handleCancel = async (id) => {
    try {
      await fetch(`/api/downloads/${id}/cancel`, { method: 'POST' })
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/downloads/${id}?delete_file=true`, { method: 'DELETE' })
      setDownloads((prev) => prev.filter((d) => d.id !== id))
    } catch (e) {
      console.error(e)
    }
  }

  const handlePauseAll = async () => {
    const downloading = downloads.filter((d) => d.status === 'downloading')
    await Promise.all(downloading.map((d) => handlePause(d.id)))
  }

  const handleResumeAll = async () => {
    const paused = downloads.filter((d) => d.status === 'paused')
    await Promise.all(paused.map((d) => handleResume(d.id)))
  }

  const handleAddDownload = async (payload) => {
    const res = await fetch('/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to start download')
    }
    if (data.download) {
      setDownloads((prev) => [data.download, ...prev])
    }
  }

  // Quick 1-click test against local test server
  const handleRunQuickTest = async () => {
    try {
      await handleAddDownload({
        url: 'http://127.0.0.1:8088/range-file',
        destination_path: 'downloads/demo_20mb.bin',
        connections_per_link: settings.connectionsPerLink || 8,
        chunk_size: settings.chunkSize || 4 * 1024 * 1024,
      })
    } catch (err) {
      console.error('Quick test error:', err)
    }
  }

  return (
    <div className="app-container">
      {/* Desktop Sidebar (≥ 1024px) */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        downloadsCount={downloads.length}
        activeDownloadsCount={activeCount}
        activeLinksCount={activeLinksCount}
        completedCount={completedCount}
        totalSpeed={totalSpeed}
        connected={connected}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main View Area */}
      <div className="main-wrapper">
        {/* Desktop Top Header (≥ 1024px) */}
        <Header
          currentView={currentView}
          hasActiveDownloads={activeCount > 0}
          onPauseAll={handlePauseAll}
          onResumeAll={handleResumeAll}
          onOpenNewDownload={() => setIsNewDownloadOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Mobile Header & Bottom Nav (< 1024px) */}
        <MobileNav
          currentView={currentView}
          onSelectView={setCurrentView}
          downloadsCount={downloads.length}
          activeLinksCount={activeLinksCount}
          totalSpeed={totalSpeed}
          onOpenNewDownload={() => setIsNewDownloadOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Content Pane */}
        <main className="content-pane">
          {currentView === 'downloads' && (
            <DownloadsView
              downloads={downloads}
              interfaces={interfaces}
              speedHistories={speedHistories}
              onPause={handlePause}
              onResume={handleResume}
              onCancel={handleCancel}
              onDelete={handleDelete}
              onOpenNewDownload={() => setIsNewDownloadOpen(true)}
              onRunQuickTest={handleRunQuickTest}
            />
          )}

          {currentView === 'links' && (
            <LinksView
              interfaces={interfaces}
              hasActiveVpn={hasActiveVpn}
              activeVpns={activeVpns}
              vpnWarning={vpnWarning}
              onRefresh={fetchData}
            />
          )}

          {currentView === 'history' && (
            <HistoryView
              downloads={downloads}
              onDelete={handleDelete}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={updateSettings}
              systemInfo={systemInfo}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          )}
        </main>
      </div>

      {/* New Download Modal */}
      <NewDownloadModal
        isOpen={isNewDownloadOpen}
        onClose={() => setIsNewDownloadOpen(false)}
        onSubmit={handleAddDownload}
        interfaces={interfaces}
        defaultConnections={settings.connectionsPerLink || 8}
        defaultChunkSize={settings.chunkSize || 4 * 1024 * 1024}
      />
    </div>
  )
}
