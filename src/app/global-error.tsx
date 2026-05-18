'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa' }}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Something went wrong!</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>{error.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={reset}
              style={{ padding: '0.5rem 2rem', borderRadius: '0.5rem', backgroundColor: '#10b981', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
