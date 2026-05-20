import { useAppStore } from './store'

const BASE_URL = ''

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
  private getToken(): string | null {
    return useAppStore.getState().token
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async get<T>(path: string, params?: Record<string, string>, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    const url = new URL(path, window.location.origin)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    return this.fetchWithRetry<T>(`${BASE_URL}${url.pathname}${url.search}`, {
      method: 'GET',
      headers: this.getHeaders(),
    }, options?.skipLogoutOn401)
  }

  async post<T>(path: string, body?: unknown, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    return this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, options?.skipLogoutOn401)
  }

  async put<T>(path: string, body?: unknown, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    return this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, options?.skipLogoutOn401)
  }

  async patch<T>(path: string, body?: unknown, options?: { skipLogoutOn401?: boolean }): Promise<T> {
    return this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, options?.skipLogoutOn401)
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

    return this.fetchWithRetry<T>(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }, requestOptions?.skipLogoutOn401)
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
  ): Promise<T> {
    let response: Response

    try {
      response = await fetch(url, init)
    } catch (networkError) {
      // Network error — server might be restarting
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
        await sleep(delay)
        return this.fetchWithRetry<T>(url, init, skipLogoutOn401, attempt + 1)
      }
      // All retries exhausted
      throw new Error(
        'Unable to connect to the server. The server may be restarting — please wait a moment and try again.'
      )
    }

    // Handle 401 — read the server's message first (e.g., wrong credentials on login)
    if (response.status === 401) {
      let serverMessage: string | undefined
      try {
        const data = await response.json()
        serverMessage = getErrorMessage(data, 401)
      } catch {
        // Can't parse response
      }
      // If the server gave a specific message (like "wrong credentials"), use it.
      // Otherwise, fall back to "session expired" for authenticated routes.
      const isSessionExpired = !serverMessage || serverMessage === STATUS_MESSAGES[401]
      if (isSessionExpired) {
        if (!skipLogoutOn401) {
          useAppStore.getState().logout()
        }
        throw new Error('Your session has expired. Please log in again to continue.')
      }
      // Server gave a specific message (e.g., wrong credentials on login) — show that instead
      throw new Error(serverMessage)
    }

    // Retry transient server errors (502, 503, 504)
    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
      await sleep(delay)
      return this.fetchWithRetry<T>(url, init, skipLogoutOn401, attempt + 1)
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
