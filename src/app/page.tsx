'use client'

import { useEffect } from 'react'

/**
 * Root route forwards to the pure HTML/CSS/JS frontend served as static
 * assets from /public/app. The AI Engineering Platform is a vanilla-JS SPA.
 */
export default function Home() {
  useEffect(() => {
    window.location.replace('/app/index.html')
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0f17',
        color: '#8b98a9',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
        fontSize: 14,
      }}
    >
      Loading AI Engineering Platform…
    </div>
  )
}
