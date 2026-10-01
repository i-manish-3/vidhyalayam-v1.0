export const ATTENDANCE_SYNC_EVENT = 'attendance:sync'
export const FEE_SYNC_EVENT = 'fee:sync'

/**
 * Triggers a cross-tab and in-window realtime synchronization event
 * whenever attendance records are created, updated, or finalized.
 */
export function triggerAttendanceSync(): void {
  if (typeof window === 'undefined') return

  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('attendance-sync-channel')
      channel.postMessage({ type: 'SYNC', timestamp: Date.now() })
      channel.close()
    }
  } catch {
    // BroadcastChannel unsupported or restricted in environment
  }

  try {
    window.dispatchEvent(
      new CustomEvent(ATTENDANCE_SYNC_EVENT, { detail: { timestamp: Date.now() } })
    )
  } catch {
    // Window custom event fallback
  }
}

/**
 * Triggers a cross-tab and in-window realtime synchronization event
 * whenever fees are collected, recorded, or cancelled.
 */
export function triggerFeeSync(): void {
  if (typeof window === 'undefined') return

  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('fee-sync-channel')
      channel.postMessage({ type: 'FEE_SYNC', timestamp: Date.now() })
      channel.close()
    }
  } catch {
    // BroadcastChannel unsupported or restricted
  }

  try {
    window.dispatchEvent(
      new CustomEvent(FEE_SYNC_EVENT, { detail: { timestamp: Date.now() } })
    )
  } catch {
    // Fallback
  }
}
