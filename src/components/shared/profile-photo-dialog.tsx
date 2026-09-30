'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Camera,
  Upload,
  RotateCcw,
  Check,
  SwitchCamera,
  Trash2,
  X,
  AlertCircle,
  HardDrive,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'

interface ProfilePhotoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPhoto?: string | null
  onPhotoSelected: (dataUrl: string) => void
  title?: string
  description?: string
}

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  currentPhoto,
  onPhotoSelected,
  title = 'Student Profile Photo',
  description = 'Upload a photo from your device or capture one using your camera.',
}: ProfilePhotoDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [mode, setMode] = useState<'choose' | 'camera'>('choose')
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  // Clean up camera stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  // Start camera stream
  const startCamera = useCallback(
    async (facing: 'user' | 'environment') => {
      stopStream()
      setCameraLoading(true)
      setCameraError(null)
      setCapturedPreview(null)

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not supported by your browser or environment.')
        setCameraLoading(false)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (err) {
        console.error('Camera access error:', err)
        let msg = 'Could not access the camera.'
        if (err instanceof DOMException) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            msg = 'Camera permission was denied. Please allow camera access in your browser settings.'
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            msg = 'No camera device found on this system.'
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            msg = 'Camera is currently in use by another application.'
          }
        }
        setCameraError(msg)
      } finally {
        setCameraLoading(false)
      }
    },
    [stopStream],
  )

  // Switch camera when mode changes to 'camera'
  useEffect(() => {
    if (open && mode === 'camera' && !capturedPreview) {
      void startCamera(facingMode)
    }
    if (!open) {
      stopStream()
      setMode('choose')
      setCapturedPreview(null)
      setCameraError(null)
    }
    return () => {
      stopStream()
    }
  }, [open, mode, facingMode, startCamera, stopStream, capturedPreview])

  // Handle file input selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    try {
      const { dataUrl, finalBytes, compressed } = await compressImage(file)
      if (finalBytes > 200 * 1024) {
        toast({
          title: 'Photo Too Large',
          description: 'This image cannot be compressed under 200 KB. Please choose another image.',
          variant: 'destructive',
        })
        return
      }
      onPhotoSelected(dataUrl)
      onOpenChange(false)
      toast({
        title: 'Photo updated',
        description: compressed
          ? `Optimized & resized to ${Math.round(finalBytes / 1024)} KB.`
          : 'Profile photo updated.',
      })
    } catch {
      toast({
        title: 'Could not read photo',
        description: 'Please try another image file (JPG, PNG, or WebP).',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Snap photo from video feed
  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current || document.createElement('canvas')

    // Create square crop around center
    const size = Math.min(video.videoWidth, video.videoHeight)
    const startX = (video.videoWidth - size) / 2
    const startY = (video.videoHeight - size) / 2

    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // If front camera, mirror image for natural selfie feel
    if (facingMode === 'user') {
      ctx.translate(size, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCapturedPreview(dataUrl)
    stopStream()
  }

  // Use captured snapshot
  const applyCapturedPhoto = async () => {
    if (!capturedPreview) return
    setProcessing(true)
    try {
      // Convert data URL to Blob -> File -> compressImage
      const res = await fetch(capturedPreview)
      const blob = await res.blob()
      const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' })
      const { dataUrl, finalBytes } = await compressImage(file)

      onPhotoSelected(dataUrl)
      onOpenChange(false)
      toast({
        title: 'Photo captured',
        description: `Captured from camera and saved (${Math.round(finalBytes / 1024)} KB).`,
      })
    } catch (err) {
      toast({
        title: 'Failed to process photo',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-sky-500/20 bg-card p-0 shadow-2xl shadow-sky-500/15 sm:max-w-lg [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        {/* Header */}
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7_0%,#0ea5e9_45%,#0d9488_100%)] px-5 py-4 pr-12 text-white sm:px-6">
          <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
          <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-cyan-300/20 blur-2xl" />
          <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-teal-300/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              <Camera className="size-5 text-white" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold tracking-normal text-white">{title}</DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-xs text-white/75">
                {mode === 'camera'
                  ? capturedPreview
                    ? 'Review your photo before saving'
                    : 'Align face in the center and click snap'
                  : description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Body */}
        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.03] via-background to-teal-500/[0.055] p-4 sm:p-5">
          {mode === 'choose' ? (
            <div className="space-y-3">
              {/* Option 1: Upload from Device */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                }}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-sky-500/5"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-500/20 transition-transform group-hover:scale-105">
                    <HardDrive className="size-6 text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Upload from Device</h3>
                      <Badge variant="outline" className="h-5 text-[10px] border-sky-200 text-sky-700 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                        Files
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      Select an image file from your computer, phone, or tablet gallery.
                    </p>
                  </div>
                  <Upload className="size-5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </div>

              {/* Option 2: Take Photo using Camera */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setMode('camera')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setMode('camera')
                }}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-teal-500/5"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/20 transition-transform group-hover:scale-105">
                    <Camera className="size-6 text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Take Photo with Camera</h3>
                      <Badge variant="outline" className="h-5 text-[10px] border-teal-200 text-teal-700 bg-teal-50 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
                        Webcam
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      Use your built-in webcam or smartphone camera to capture a live portrait.
                    </p>
                  </div>
                  <Sparkles className="size-5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600" />
                </div>
              </div>

              {/* Current photo preview & remove */}
              {currentPhoto && (
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center gap-3">
                    <div className="size-11 shrink-0 overflow-hidden rounded-full border border-border bg-background shadow-xs">
                      <img src={currentPhoto} alt="Current" className="size-full object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">Current Profile Photo</p>
                      <p className="text-[11px] text-muted-foreground">Active in student records</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      onPhotoSelected('')
                      onOpenChange(false)
                      toast({ title: 'Photo removed' })
                    }}
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Camera Mode */
            <div className="space-y-3">
              <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-2xl border-2 border-primary/25 bg-black shadow-inner">
                {capturedPreview ? (
                  <img src={capturedPreview} alt="Captured preview" className="size-full object-cover" />
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`size-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                    />
                    {/* Face Guide Overlay */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="size-56 rounded-full border-2 border-dashed border-white/60 shadow-lg shadow-black/40 ring-1 ring-black/40" />
                    </div>
                  </>
                )}

                {cameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-white">
                    <Loader2 className="size-8 animate-spin text-sky-400" />
                    <p className="text-xs">Initializing camera...</p>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/85 text-white">
                    <AlertCircle className="size-8 text-rose-400 mb-2" />
                    <p className="text-xs leading-relaxed text-white/90">{cameraError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4 h-8 bg-white/10 text-white hover:bg-white/20"
                      onClick={() => void startCamera(facingMode)}
                    >
                      Retry Camera
                    </Button>
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              {!cameraError && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  {capturedPreview ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 px-4 text-xs"
                        onClick={() => {
                          setCapturedPreview(null)
                          void startCamera(facingMode)
                        }}
                        disabled={processing}
                      >
                        <RotateCcw className="size-3.5" /> Retake
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 gap-1.5 px-5 text-xs bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-600/20"
                        onClick={() => void applyCapturedPhoto()}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        {processing ? 'Processing...' : 'Use This Photo'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 rounded-full shadow-xs"
                        title="Flip Camera"
                        onClick={() => {
                          const next = facingMode === 'user' ? 'environment' : 'user'
                          setFacingMode(next)
                        }}
                        disabled={cameraLoading}
                      >
                        <SwitchCamera className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        className="size-12 rounded-full bg-gradient-to-tr from-sky-500 to-teal-500 text-white shadow-lg shadow-sky-500/30 hover:scale-105 active:scale-95 transition-all"
                        title="Capture Photo"
                        onClick={capturePhoto}
                        disabled={cameraLoading}
                      >
                        <Camera className="size-6" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5 flex items-center justify-between sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {mode === 'camera' ? 'Camera mode' : 'JPEG, PNG, or WebP up to 200 KB'}
          </p>
          <div className="flex items-center gap-2">
            {mode === 'camera' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => {
                  stopStream()
                  setCapturedPreview(null)
                  setMode('choose')
                }}
              >
                Back to options
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
