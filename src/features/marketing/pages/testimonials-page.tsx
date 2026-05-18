'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search,
  Star,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MessageSquareQuote,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Quote,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Testimonial {
  id: string
  name: string
  role: string
  quote: string
  stars: number
  avatarUrl: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface FormState {
  name: string
  role: string
  quote: string
  stars: number
  avatarUrl: string
  isActive: boolean
  sortOrder: number
}

const EMPTY_FORM: FormState = {
  name: '',
  role: '',
  quote: '',
  stars: 5,
  avatarUrl: '',
  isActive: true,
  sortOrder: 0,
}

function StarRating({ stars, size = 16 }: { stars: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={
            i < stars
              ? 'fill-amber-400 text-amber-400'
              : 'fill-transparent text-muted-foreground/30'
          }
        />
      ))}
    </div>
  )
}

function AvatarInitial({ name, avatarUrl, size = 'sm' }: { name: string; avatarUrl: string | null; size?: 'sm' | 'lg' }) {
  const dimension = size === 'lg' ? 'size-12' : 'size-10'
  const fontSize = size === 'lg' ? 'text-lg' : 'text-sm'

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${dimension} rounded-full object-cover shrink-0`}
      />
    )
  }

  return (
    <div className={`${dimension} rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold ${fontSize} shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function TestimonialsPage() {
  const { user } = useAppStore()
  const { toast } = useToast()
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchTestimonials = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search) params.search = search

      const data = await api.get<{ testimonials: Testimonial[]; total: number }>(
        '/api/super-admin/testimonials?' + new URLSearchParams(params).toString()
      )
      setTestimonials(data.testimonials)
      setTotal(data.total)
    } catch {
      toast({ title: "Couldn't Load Testimonials", description: "We couldn't load the testimonials. Please refresh the page.", variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [search, toast])

  useEffect(() => {
    fetchTestimonials()
  }, [fetchTestimonials])

  const activeCount = testimonials.filter(t => t.isActive).length
  const inactiveCount = testimonials.filter(t => !t.isActive).length

  const handleOpenAdd = () => {
    setIsEditing(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const handleOpenEdit = (testimonial: Testimonial) => {
    setIsEditing(true)
    setEditingId(testimonial.id)
    setForm({
      name: testimonial.name,
      role: testimonial.role,
      quote: testimonial.quote,
      stars: testimonial.stars,
      avatarUrl: testimonial.avatarUrl || '',
      isActive: testimonial.isActive,
      sortOrder: testimonial.sortOrder,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.role.trim() || !form.quote.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the name, role, and quote.', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        role: form.role.trim(),
        quote: form.quote.trim(),
        stars: form.stars,
        avatarUrl: form.avatarUrl.trim() || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      }

      if (isEditing && editingId) {
        await api.patch(`/api/super-admin/testimonials/${editingId}`, body)
        toast({ title: 'Updated', description: 'Testimonial updated successfully' })
      } else {
        await api.post('/api/super-admin/testimonials', body)
        toast({ title: 'Created', description: 'Testimonial created successfully' })
      }

      setFormOpen(false)
      fetchTestimonials()
    } catch {
      toast({ title: isEditing ? "Couldn't Update Testimonial" : "Couldn't Create Testimonial", description: `We couldn't ${isEditing ? 'update' : 'create'} the testimonial. Please try again.`, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeletingId(id)
    setDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/super-admin/testimonials/${deletingId}`)
      toast({ title: 'Deleted', description: 'Testimonial deleted successfully' })
      setDeleteOpen(false)
      fetchTestimonials()
    } catch {
      toast({ title: "Couldn't Delete Testimonial", description: "We couldn't delete the testimonial. Please try again.", variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Testimonials</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage testimonials displayed on the landing page
          </p>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          onClick={handleOpenAdd}
        >
          <Plus className="size-4 mr-2" />
          Add Testimonial
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{inactiveCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Inactive</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, role, or quote..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Testimonials List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : testimonials.length === 0 ? (
        <div className="text-center py-20">
          <MessageSquareQuote className="size-12 text-muted-foreground/50 mx-auto" />
          <p className="mt-4 text-muted-foreground font-medium">No testimonials yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Add testimonials to showcase on the landing page
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleOpenAdd}
          >
            <Plus className="size-4 mr-2" />
            Add First Testimonial
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {testimonials.map((testimonial, i) => (
              <motion.div
                key={testimonial.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Card className="hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row gap-4">
                      {/* Avatar & Main Content */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <AvatarInitial name={testimonial.name} avatarUrl={testimonial.avatarUrl} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate">{testimonial.name}</h3>
                            <Badge
                              className={
                                testimonial.isActive
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs'
                              }
                            >
                              {testimonial.isActive ? (
                                <><CheckCircle2 className="size-3 mr-1" />Active</>
                              ) : (
                                <><XCircle className="size-3 mr-1" />Inactive</>
                              )}
                            </Badge>
                            {testimonial.sortOrder > 0 && (
                              <Badge variant="outline" className="text-xs py-0">
                                <ArrowUpDown className="size-3 mr-1" />
                                #{testimonial.sortOrder}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{testimonial.role}</p>
                          <StarRating stars={testimonial.stars} size={14} />
                          <div className="mt-2 relative">
                            <Quote className="size-3 text-emerald-400/60 absolute -left-0.5 -top-0.5" />
                            <p className="text-sm leading-relaxed pl-4 italic text-muted-foreground/90 line-clamp-3">
                              {testimonial.quote}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 sm:flex-col sm:justify-center shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(testimonial)}
                        >
                          <Pencil className="size-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          onClick={() => handleDeleteClick(testimonial.id)}
                        >
                          <Trash2 className="size-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Testimonial' : 'Add Testimonial'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the testimonial details below'
                : 'Fill in the details for the new testimonial'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g., Dr. Rajesh Kumar"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Role <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g., Principal, DPS Delhi"
                value={form.role}
                onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
              />
            </div>

            {/* Quote */}
            <div className="space-y-1.5">
              <Label>Quote <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="The testimonial quote from the person..."
                value={form.quote}
                onChange={(e) => setForm(prev => ({ ...prev, quote: e.target.value }))}
                rows={4}
              />
            </div>

            {/* Stars */}
            <div className="space-y-1.5">
              <Label>Star Rating</Label>
              <Select
                value={form.stars.toString()}
                onValueChange={(v) => setForm(prev => ({ ...prev, stars: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 Stars - Excellent</SelectItem>
                  <SelectItem value="4">4 Stars - Very Good</SelectItem>
                  <SelectItem value="3">3 Stars - Good</SelectItem>
                  <SelectItem value="2">2 Stars - Fair</SelectItem>
                  <SelectItem value="1">1 Star - Poor</SelectItem>
                </SelectContent>
              </Select>
              <div className="pt-1">
                <StarRating stars={form.stars} size={18} />
              </div>
            </div>

            {/* Avatar URL */}
            <div className="space-y-1.5">
              <Label>Avatar URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="https://example.com/avatar.jpg"
                value={form.avatarUrl}
                onChange={(e) => setForm(prev => ({ ...prev, avatarUrl: e.target.value }))}
              />
              {form.avatarUrl && (
                <div className="flex items-center gap-2 pt-1">
                  <AvatarInitial name={form.name || 'A'} avatarUrl={form.avatarUrl} size="lg" />
                  <span className="text-xs text-muted-foreground">Preview</span>
                </div>
              )}
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Display this testimonial on the landing page
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, isActive: checked }))}
              />
            </div>

            {/* Sort Order */}
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={form.sortOrder}
                onChange={(e) => setForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first. Use 0 for default ordering.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="size-4 mr-2" />
                )}
                {isEditing ? 'Save Changes' : 'Create Testimonial'}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Testimonial</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this testimonial? This action will remove it from the landing page. The data will be soft-deleted and can be recovered if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="size-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
