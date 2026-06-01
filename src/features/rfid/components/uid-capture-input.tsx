'use client'

/**
 * UID capture input — three input paths in one component:
 *
 * 1. HID keyboard-emulation reader (Windows-FC, generic USB readers)
 *    Reader "types" the UID into the focused input followed by Enter. Works
 *    on every desktop OS, no permissions, no API. This is the default for
 *    desktop browsers.
 *
 * 2. Web NFC (Android Chrome only, HTTPS or localhost)
 *    Tap an NFC card on the back of the phone. UID is read via NDEFReader.
 *    Auto-detected on supported browsers; falls back to (1) otherwise.
 *
 * 3. Manual entry
 *    Type/paste the UID directly. Useful for testing without hardware.
 *
 * Emits the *normalized* UID (uppercase hex, no separators) when valid.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Smartphone, Usb, Keyboard, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface NDEFReadingEvent extends Event {
  serialNumber?: string
}

interface NDEFReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  addEventListener(type: 'reading', listener: (event: NDEFReadingEvent) => void): void
  addEventListener(type: 'readingerror', listener: (event: Event) => void): void
}

function normalizeUid(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (cleaned.length < 8 || cleaned.length > 20 || cleaned.length % 2 !== 0) return null
  return cleaned
}

export interface UidCaptureInputProps {
  id?: string
  value: string
  onChange: (uid: string) => void
  /** Called once the UID passes normalization. */
  onCapture?: (normalizedUid: string) => void
  disabled?: boolean
  autoFocus?: boolean
  label?: string
  hint?: string
}

type Mode = 'reader' | 'nfc' | 'manual'

export function UidCaptureInput({
  id,
  value,
  onChange,
  onCapture,
  disabled,
  autoFocus,
  label = 'Card UID',
  hint,
}: UidCaptureInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const nfcAbortRef = useRef<AbortController | null>(null)
  const [mode, setMode] = useState<Mode>('reader')
  const [nfcSupported, setNfcSupported] = useState(false)
  const [nfcStatus, setNfcStatus] = useState<'idle' | 'scanning' | 'denied' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Detect Web NFC support once on mount. Chrome on Android only.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setNfcSupported(true)
    }
  }, [])

  const finishCapture = useCallback(
    (raw: string) => {
      const normalized = normalizeUid(raw)
      if (!normalized) {
        setErrorMsg('That UID looks invalid. Try tapping again or check the format (8–20 hex chars).')
        return
      }
      setErrorMsg(null)
      onChange(normalized)
      onCapture?.(normalized)
    },
    [onChange, onCapture],
  )

  const startNfcScan = useCallback(async () => {
    if (!nfcSupported || typeof window === 'undefined') return
    try {
      setNfcStatus('scanning')
      setErrorMsg(null)
      const NDEFReaderCtor = (window as unknown as {
        NDEFReader: new () => NDEFReaderLike
      }).NDEFReader
      const reader = new NDEFReaderCtor()
      const abort = new AbortController()
      nfcAbortRef.current = abort
      await reader.scan({ signal: abort.signal })
      reader.addEventListener('reading', (event) => {
        const sn = (event as NDEFReadingEvent).serialNumber
        if (sn) finishCapture(sn)
      })
      reader.addEventListener('readingerror', () => {
        setErrorMsg('Could not read the card. Try again with the card flat against the phone.')
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'NotAllowedError') {
        setNfcStatus('denied')
        setErrorMsg('NFC permission denied. Enable NFC for this site in browser settings.')
      } else if (name === 'AbortError') {
        // user cancelled — silent
      } else {
        setNfcStatus('error')
        setErrorMsg(error instanceof Error ? error.message : 'NFC scan failed.')
      }
    }
  }, [nfcSupported, finishCapture])

  // Cancel any in-flight scan on unmount.
  useEffect(
    () => () => {
      nfcAbortRef.current?.abort()
    },
    [],
  )

  // When mode flips to NFC, kick off scan automatically.
  useEffect(() => {
    if (mode === 'nfc') {
      void startNfcScan()
    } else {
      nfcAbortRef.current?.abort()
      nfcAbortRef.current = null
      setNfcStatus('idle')
    }
  }, [mode, startNfcScan])

  // Enter submits the UID in both reader mode (HID readers append Enter) and
  // manual mode (operator typed/pasted the UID). NFC mode handles its own
  // submission via the NDEFReader event — Enter is irrelevant there.
  // Always preventDefault so a parent <form> doesn't accidentally submit.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.length > 0 && (mode === 'reader' || mode === 'manual')) {
      e.preventDefault()
      finishCapture(value)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
          </Label>
        ) : <span />}
        <div className="flex gap-1">
          <ModeButton
            current={mode}
            target="reader"
            onClick={() => setMode('reader')}
            icon={<Usb className="size-3.5" />}
            label="USB Reader"
          />
          {nfcSupported && (
            <ModeButton
              current={mode}
              target="nfc"
              onClick={() => setMode('nfc')}
              icon={<Smartphone className="size-3.5" />}
              label="NFC"
            />
          )}
          <ModeButton
            current={mode}
            target="manual"
            onClick={() => setMode('manual')}
            icon={<Keyboard className="size-3.5" />}
            label="Manual"
          />
        </div>
      </div>

      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'reader'
                ? 'Tap a card on the USB reader…'
                : mode === 'nfc'
                  ? 'Hold the card near the back of the phone…'
                  : 'Type or paste the card UID, then press Enter'
            }
            disabled={disabled || mode === 'nfc'}
            autoFocus={autoFocus}
            spellCheck={false}
            autoComplete="off"
            className="pr-9 font-mono uppercase tracking-wider"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="Clear UID"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {mode === 'manual' && (
          <Button
            type="button"
            onClick={() => finishCapture(value)}
            disabled={disabled || value.length === 0}
            size="default"
            className="shrink-0"
          >
            Submit
          </Button>
        )}
      </div>

      {mode === 'nfc' && nfcStatus === 'scanning' && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-2 animate-pulse rounded-full bg-emerald-500" />
          Scanning… hold the card flat against the back of the phone.
        </p>
      )}

      {errorMsg && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      {hint && !errorMsg && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function ModeButton({
  current,
  target,
  onClick,
  icon,
  label,
}: {
  current: Mode
  target: Mode
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  const active = current === target
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={active ? 'default' : 'outline'}
      size="sm"
      className="h-7 gap-1.5 px-2 text-[11px]"
    >
      {icon}
      {label}
    </Button>
  )
}
