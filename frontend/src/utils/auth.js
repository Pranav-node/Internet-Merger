/**
 * Authentication and Session Security Module for Internet Merger.
 *
 * Extracts the per-session security token from the URL fragment (#token=...),
 * stores it safely in memory and sessionStorage, immediately strips it from the
 * visible browser address bar, and configures fetch to send X-Auth-Token.
 */

let inMemoryToken = ''

export function initSessionAuth() {
  if (typeof window === 'undefined') return ''

  // 1. Check URL fragment for #token=...
  const hash = window.location.hash
  if (hash) {
    const match = hash.match(/(?:^|#|&)token=([A-Za-z0-9_-]+)/)
    if (match && match[1]) {
      inMemoryToken = match[1]
      try {
        sessionStorage.setItem('im_session_token', inMemoryToken)
      } catch (e) {
        // Ignore storage restrictions
      }
    }
    // Cleanly remove token from visible URL address bar
    const cleanUrl = window.location.pathname + window.location.search
    window.history.replaceState(null, '', cleanUrl)
  }

  // 2. Fallback to existing session token in sessionStorage (for page refreshes)
  if (!inMemoryToken) {
    try {
      inMemoryToken = sessionStorage.getItem('im_session_token') || ''
    } catch (e) {
      inMemoryToken = ''
    }
  }

  // 3. Globally intercept window.fetch for /api/ calls so all requests automatically carry the token
  if (!window._fetchPatched) {
    const originalFetch = window.fetch
    window.fetch = async function (input, init = {}) {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '')
      if (url.includes('/api/')) {
        const token = getSessionToken()
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : {}))
        if (token && !headers.has('X-Auth-Token')) {
          headers.set('X-Auth-Token', token)
        }
        init = { ...init, headers }
      }
      return originalFetch.call(this, input, init)
    }
    window._fetchPatched = true
  }

  return inMemoryToken
}

export function getSessionToken() {
  if (!inMemoryToken && typeof window !== 'undefined') {
    try {
      inMemoryToken = sessionStorage.getItem('im_session_token') || ''
    } catch (e) {
      inMemoryToken = ''
    }
  }
  return inMemoryToken
}
