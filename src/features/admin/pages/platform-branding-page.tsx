'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ImagePlus, Trash2, GraduationCap } from 'lucide-react'
import { setCachedPlatformLogo } from '@/hooks/use-platform-branding'

const MAX_BYTES = 1024 * 1024 // 1 MB
const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

export function PlatformBrandingPage() {
  const { toast } = useToast()
  const [logo, setLogo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchBranding = useCallback(async () => {
    try {
      const res = await api.get<{ logo: string | null }>('/api/super-admin/platform-branding')
      setLogo(res.logo)
    } catch {
      toast({ title: "Couldn't load branding", description: 'Please refresh and try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchBranding()
  }, [fetchBranding])

  const save = useCallback(
    async (value: string | null) => {
      try {
        setSaving(true)
        const res = await api.patch<{ logo: string | null }>('/api/super-admin/platform-branding', {
          logo: value,
        })
        setLogo(res.logo)
        setCachedPlatformLogo(res.logo)
        toast({ title: value ? 'Logo updated' : 'Logo removed' })
      } catch (err) {
        toast({
          title: "Couldn't save logo",
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setSaving(false)
      }
    },
    [toast],
  )

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // allow re-selecting the same file
      if (!file) return
      if (!ACCEPTED.includes(file.type)) {
        toast({ title: 'Unsupported file', description: 'Use a PNG, JPG, WEBP or GIF image.', variant: 'destructive' })
        return
      }
      if (file.size > MAX_BYTES) {
        toast({ title: 'File too large', description: 'Logo must be 1 MB or smaller.', variant: 'destructive' })
        return
      }
      try {
        const dataUrl = await fileToDataUrl(file)
        await save(dataUrl)
      } catch {
        toast({ title: "Couldn't read the file", description: 'Please try a different image.', variant: 'destructive' })
      }
    },
    [save, toast],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branding"
        description="Set the platform logo shown in the admin panel and on the login screen."
      />

      <Card className="max-w-xl">
        <CardContent className="flex flex-col gap-5 py-6 sm:flex-row sm:items-center">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
            {loading ? (
              <span className="text-xs text-muted-foreground">…</span>
            ) : logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Platform logo" className="size-full object-contain" />
            ) : (
              <GraduationCap className="size-9 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              PNG, JPG, WEBP or GIF · up to 1 MB. A square or wide transparent PNG looks best.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(',')}
                className="hidden"
                onChange={(e) => void onPick(e)}
              />
              <Button onClick={() => inputRef.current?.click()} disabled={saving}>
                <ImagePlus className="mr-1 size-4" />
                {logo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {logo && (
                <Button variant="outline" disabled={saving} onClick={() => void save(null)}>
                  <Trash2 className="mr-1 size-4" /> Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
