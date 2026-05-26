import { useAppStore } from './store'

const BASE_URL = ''

// ============================================
// CACHING LAYER
// ============================================
// Cache for expensive API calls (academic years, next admission number, etc.)
// Improves performance on page reloads and form interactions
const CACHE_STORE = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds

// Endpoints that should be cached
const CACHEABLE_ENDPOINTS = new Set([
  '/api/school/academic-years',
  '/api/school/admissions/next-number',
  '/api/school/admission-settings',
  '/api/school/classes',
  '/api/school/sections',
  '/api/school/fees/groups',
  '/api/school/transport/routes',
])

function getCacheKey(url: string): string {
  return url
}

function getCachedData<T>(url: string): T | null {
  const cacheKey = getCacheKey(url)
  const cached = CACHE_STORE.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data as T
  }
  
  // Clear expired cache
  if (cached) {
    CACHE_STORE.delete(cacheKey)
  }
  
  return null
}

function setCachedData(url: string, data: unknown): void {
  const cacheKey = getCacheKey(url)
  CACHE_STORE.set(cacheKey, { data, timestamp: Date.now() })
}

function shouldCache(url: string): boolean {
  for (const endpoint of CACHEABLE_ENDPOINTS) {
    if (url.includes(endpoint)) {
      return true
    }
  }
  return false
}

function clearRelatedCache(path: string): void {
  // On POST/PATCH/DELETE, clear related caches
  const patterns = [
    { path: '/api/school/admissions', clear: ['/api/school/admissions/next-number'] },
    { path: '/api/school/admission-settings', clear: ['/api/school/admission-settings', '/api/school/admissions/next-number'] },
    { path: '/api/school/students', clear: ['/api/school/students', '/api/school/fees/collections', '/api/school/fees/assignments'] },
    { path: '/api/school/academic-years', clear: ['/api/school/academic-years'] },
    { path: '/api/school/classes', clear: ['/api/school/classes', '/api/school/sections'] },
    { path: '/api/school/sections', clear: ['/api/school/sections'] },
    { path: '/api/school/fees/groups', clear: ['/api/school/fees/groups'] },
    { path: '/api/school/transport/routes', clear: ['/api/school/transport/routes'] },
    { path: '/api/school/transport/annual-setup', clear: ['/api/school/transport/routes'] },
  ]
  
  for (const pattern of patterns) {
    if (path.includes(pattern.path)) {
      pattern.clear.forEach(endpoint => {
        for (const key of Array.from(CACHE_STORE.keys())) {
          if (key === endpoint || key.startsWith(`${endpoint}?`)) {
            CACHE_STORE.delete(key)
          }
        }
      })
    }
  }
}

/**
 * Professional, user-friendly messages for common HTTP status codes.
 * These are used as fallbacks when the server doesn't return a specific message.
 */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'The information you entered seems incorrect. Please check and try again.',
  401: 'Your session has expired. Please log in again to continue.',
  403: "You don't have permission to do this. Please contact your administrator if you think this is a mistake.",
  404: 'We couldn\'t find what you\'re looking for. It may have been removed or moved.',
  405: 'This action isn\'t available right now.',
  408: 'The request took too long. Please check your connection and try again.',
  409: 'This record already exists or was modified by someone else. Please refresh and try again.',
  422: 'Some of the information you entered is incorrect. Please review the highlighted fields and fix them.',
  429: 'You\'re doing that too quickly. Please wait a moment and try again.',
  500: 'We ran into an unexpected issue. Please try again in a few minutes.',
  502: 'The server is temporarily unavailable. Please wait a moment and try again.',
  503: 'We\'re doing some maintenance right now. Please check back in a few minutes.',
  504: 'The server took too long to respond. Please check your connection and try again.',
}

/**
 * Extracts a human-readable error message from an API error response.
 * Tries multiple common field names: message, error, detail, errorMessage.
 * Falls back to a professional status-based message.
 */
function getErrorMessage(data: Record<string, unknown>, status: number): string {
  const messageFields = ['message', 'error', 'detail', 'errorMessage', 'msg'] as const
  for (const field of messageFields) {
    const value = data[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return STATUS_MESSAGES[status] || `We ran into an unexpected issue. Please try again.`
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Status codes that indicate a temporary server issue worth retrying */
const RETRYABLE_STATUS = new Set([502, 503, 504])

/** Maximum number of automatic retries for transient server errors */
const MAX_RETRIES = 8

/** Base delay between retries (ms), doubles each retry */
const RETRY_BASE_DELAY = 500

class ApiClient {
  // Single-flight guard: when N parallel requests all see 401 at the same time
  // (typical after the access cookie expires and the dashboard fires 5+ queries),
  // they share one /api/auth/refresh call instead of stampeding the endpoint.
  private refreshing: Promise<boolean> | null = null

  private getHeaders(): HeadersInit {
    // No Authorization header — the access token lives in the HttpOnly cookie
    // `erp_access`, which the browser attaches automatically because every
    // fetch below uses `credentials: 'include'`.
    return { 'Content-Type': 'application/json' }
  }

  private async refreshOnce(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => {
          this.refreshing = null
        })
    }
    return this.refreshing
  }

  async get<T>(path: string, params?: Record<string, string>, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    const url = new URL(path, window.location.origin)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    const fullUrl = `${BASE_URL}${url.pathname}${url.search}`
    
    // Check cache for GET requests
    if (shouldCache(fullUrl)) {
      const cached = getCachedData<T>(fullUrl)
      if (cached !== null) {
        return cached
      }
    }

    const result = await this.fetchWithRetry<T>(fullUrl, {
      method: 'GET',
      headers: this.getHeaders(),
    }, options?.skipLogoutOn401)
    
    // Cache the result
    if (shouldCache(fullUrl)) {
      setCachedData(fullUrl, result)
    }
    
    return result
  }

  async post<T>(path: string, body?: unknown, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    const result = await this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, options?.skipLogoutOn401)
    
    // Clear related caches after mutation
    clearRelatedCache(path)
    
    return result
  }

  async put<T>(path: string, body?: unknown, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    const result = await this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, options?.skipLogoutOn401)
    
    // Clear related caches after mutation
    clearRelatedCache(path)
    
    return result
  }

  async patch<T>(path: string, body?: unknown, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    const result = await this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, options?.skipLogoutOn401)
    
    // Clear related caches after mutation
    clearRelatedCache(path)
    
    return result
  }

  async upload<T>(path: string, formData: FormData, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    const result = await this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
    }, options?.skipLogoutOn401)

    clearRelatedCache(path)

    return result
  }

  async delete<T>(
    path: string,
    bodyOrOptions?: unknown | { skipLogoutOn401?: boolean },
    options?: { skipLogoutOn401?: boolean }
  ): Promise<T> {
    const isOptionsOnly =
      bodyOrOptions &&
      typeof bodyOrOptions === 'object' &&
      'skipLogoutOn401' in bodyOrOptions &&
      Object.keys(bodyOrOptions).length === 1
    const body = isOptionsOnly ? undefined : bodyOrOptions
    const requestOptions = isOptionsOnly ? bodyOrOptions as { skipLogoutOn401?: boolean } : options

    const result = await this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, requestOptions?.skipLogoutOn401)
    
    // Clear related caches after mutation
    clearRelatedCache(path)
    
    return result
  }

  /**
   * Fetch with automatic retry for transient errors (502, 503, 504)
   * and graceful handling of network failures.
   */
  private async fetchWithRetry<T>(
    url: string,
    init: RequestInit,
    skipLogoutOn401?: boolean,
    attempt: number = 0,
    didRefresh: boolean = false,
  ): Promise<T> {
    let response: Response

    try {
      response = await fetch(url, { ...init, credentials: 'include' })
    } catch (networkError) {
      // Network error — server might be restarting
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
        await sleep(delay)
        return this.fetchWithRetry<T>(url, init, skipLogoutOn401, attempt + 1, didRefresh)
      }
      // All retries exhausted
      throw new Error(
        'Unable to connect to the server. The server may be restarting — please wait a moment and try again.'
      )
    }

    // Handle 401. The access cookie (`erp_access`) is short-lived (15 min);
    // most 401s on authenticated routes mean it just expired. We try a single
    // refresh: if the refresh cookie is still valid (within 30 days), the
    // server rotates both cookies and we retry the original request silently.
    // The user sees no interruption.
    //
    // We skip the refresh attempt for:
    //   - /api/auth/login   — 401 here means wrong credentials, not expiry.
    //   - /api/auth/refresh — refreshing the refresh would loop.
    //   - retries that already came out of a refresh — prevents the
    //     refresh→retry→401→refresh→... loop.
    if (response.status === 401) {
      const isAuthEndpoint =
        url.includes('/api/auth/login') || url.includes('/api/auth/refresh')

      if (!skipLogoutOn401 && !didRefresh && !isAuthEndpoint) {
        const refreshed = await this.refreshOnce()
        if (refreshed) {
          // Cookies are fresh now — retry exactly once with didRefresh=true so
          // a second 401 falls through to the logout path below instead of
          // looping.
          return this.fetchWithRetry<T>(url, init, skipLogoutOn401, attempt, true)
        }
      }

      // Refresh wasn't possible (or already tried and failed). Distinguish
      // "wrong credentials" style messages from "session expired" so we don't
      // log the user out on a fresh login-page submission.
      let serverMessage: string | undefined
      try {
        const data = await response.json()
        serverMessage = getErrorMessage(data, 401)
      } catch {
        // Can't parse response
      }
      const isSessionExpired = !serverMessage || serverMessage === STATUS_MESSAGES[401]

      if (isSessionExpired) {
        if (!skipLogoutOn401) {
          // Fire-and-forget — logout is async now (it calls the logout
          // endpoint to clear cookies), but we don't want to block the
          // error throw on it.
          void useAppStore.getState().logout()
        }
        throw new Error('Your session has expired. Please log in again to continue.')
      }
      throw new Error(serverMessage)
    }

    // Retry transient server errors (502, 503, 504)
    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
      await sleep(delay)
      return this.fetchWithRetry<T>(url, init, skipLogoutOn401, attempt + 1, didRefresh)
    }

    // Handle non-ok responses
    if (!response.ok) {
      let message: string | undefined
      try {
        const data = await response.json()
        message = getErrorMessage(data, response.status)
      } catch {
        message = STATUS_MESSAGES[response.status] || `We ran into an unexpected issue. Please try again.`
      }
      throw new Error(message)
    }

    return response.json()
  }
}

export const api = new ApiClient()
