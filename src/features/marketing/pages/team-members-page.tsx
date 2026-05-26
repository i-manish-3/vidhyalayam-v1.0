'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Users,
  Phone,
  Mail,
  Globe,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Linkedin,
  Twitter,
  Github,
  Instagram,
  Facebook,
  ExternalLink,
  Upload,
  ImagePlus,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  name: string
  role: string
  bio: string
  image: string | null
  phone: string | null
  email: string | null
  linkedin: string | null
  twitter: string | null
  github: string | null
  instagram: string | null
  facebook: string | null
  website: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface FormState {
  name: string
  role: string
  bio: string
  image: string
  phone: string
  email: string
  linkedin: string
  twitter: string
  github: string
  instagram: string
  facebook: string
  website: string
  isActive: boolean
  sortOrder: number
}

const EMPTY_FORM: FormState = {
  name: '',
  role: '',
  bio: '',
  image: '',
  phone: '',
  email: '',
  linkedin: '',
  twitter: '',
  github: '',
  instagram: '',
  facebook: '',
  website: '',
  isActive: true,
  sortOrder: 0,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function MemberAvatar({ name, imageUrl, size = 'sm' }: { name: string; imageUrl: string | null; size?: 'sm' | 'lg' }) {
  const dimension = size === 'lg' ? 'size-14' : 'size-10'
  const fontSize = size === 'lg' ? 'text-lg' : 'text-sm'

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
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

function SocialLinkIcon({ platform, url }: { platform: string; url: string | null }) {
  if (!url) return null

  const iconMap: Record<string, React.ReactNode> = {
    linkedin: <Linkedin className="size-3.5" />,
    twitter: <Twitter className="size-3.5" />,
    github: <Github className="size-3.5" />,
    instagram: <Instagram className="size-3.5" />,
    facebook: <Facebook className="size-3.5" />,
    website: <Globe className="size-3.5" />,
  }

  const icon = iconMap[platform]
  if (!icon) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
      title={platform}
    >
      {icon}
    </a>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TeamMembersPage() {
  const { user } = useAppStore()
  const { toast } = useToast()
  const [members, setMembers] = useState<TeamMember[]>([])
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

  // Image upload state
  const [isUploading, setIsUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search) params.search = search

      const data = await api.get<{ members: TeamMember[]; total: number }>(
        '/api/super-admin/team?' + new URLSearchParams(params).toString()
      )
      setMembers(data.members)
      setTotal(data.total)
    } catch {
      toast({ title: "Couldn't Load Team Members", description: "We couldn't load the team members. Please refresh the page.", variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [search, toast])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // ─── Derived state ─────────────────────────────────────────────────────────

  const activeCount = members.filter(m => m.isActive).length
  const inactiveCount = members.filter(m => !m.isActive).length

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setIsEditing(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setImagePreview(null)
    setFormOpen(true)
  }

  const handleOpenEdit = (member: TeamMember) => {
    setIsEditing(true)
    setEditingId(member.id)
    setForm({
      name: member.name,
      role: member.role,
      bio: member.bio,
      image: member.image || '',
      phone: member.phone || '',
      email: member.email || '',
      linkedin: member.linkedin || '',
      twitter: member.twitter || '',
      github: member.github || '',
      instagram: member.instagram || '',
      facebook: member.facebook || '',
      website: member.website || '',
      isActive: member.isActive,
      sortOrder: member.sortOrder,
    })
    setImagePreview(member.image || null)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.role.trim() || !form.bio.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the name, role, and bio.', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        role: form.role.trim(),
        bio: form.bio.trim(),
        image: form.image.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        linkedin: form.linkedin.trim() || null,
        twitter: form.twitter.trim() || null,
        github: form.github.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        website: form.website.trim() || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      }

      if (isEditing && editingId) {
        await api.patch(`/api/super-admin/team/${editingId}`, body)
        toast({ title: 'Updated', description: 'Team member updated successfully' })
      } else {
        await api.post('/api/super-admin/team', body)
        toast({ title: 'Created', description: 'Team member created successfully' })
      }

      setFormOpen(false)
      fetchMembers()
    } catch {
      toast({ title: isEditing ? "Couldn't Update Team Member" : "Couldn't Create Team Member", description: `We couldn't ${isEditing ? 'update' : 'create'} the team member. Please try again.`, variant: 'destructive' })
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
      await api.delete(`/api/super-admin/team/${deletingId}`)
      toast({ title: 'Deleted', description: 'Team member deleted successfully' })
      setDeleteOpen(false)
      fetchMembers()
    } catch {
      toast({ title: "Couldn't Delete Team Member", description: "We couldn't delete the team member. Please try again.", variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const updateForm = (key: keyof FormState, value: string | number | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // ─── Count social links for a member ───────────────────────────────────────

  const getSocialCount = (member: TeamMember) => {
    return [member.linkedin, member.twitter, member.github, member.instagram, member.facebook, member.website]
      .filter(Boolean).length
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Members</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage team members displayed on the landing page
          </p>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          onClick={handleOpenAdd}
        >
          <Plus className="size-4 mr-2" />
          Add Member
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
          placeholder="Search by name..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Members List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-20">
          <Users className="size-12 text-muted-foreground/50 mx-auto" />
          <p className="mt-4 text-muted-foreground font-medium">No team members yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Add team members to showcase on the landing page
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleOpenAdd}
          >
            <Plus className="size-4 mr-2" />
            Add First Member
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {members.map((member, i) => (
              <motion.div
                key={member.id}
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
                        <MemberAvatar name={member.name} imageUrl={member.image} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate">{member.name}</h3>
                            <Badge
                              className={
                                member.isActive
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs'
                              }
                            >
                              {member.isActive ? (
                                <><CheckCircle2 className="size-3 mr-1" />Active</>
                              ) : (
                                <><XCircle className="size-3 mr-1" />Inactive</>
                              )}
                            </Badge>
                            {member.sortOrder > 0 && (
                              <Badge variant="outline" className="text-xs py-0">
                                <ArrowUpDown className="size-3 mr-1" />
                                #{member.sortOrder}
                              </Badge>
                            )}
                          </div>

                          {/* Role with gradient text */}
                          <p className="text-sm font-medium bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent mt-0.5">
                            {member.role}
                          </p>

                          {/* Bio - truncated */}
                          <p className="text-sm text-muted-foreground/90 mt-1 line-clamp-2">
                            {member.bio}
                          </p>

                          {/* Contact info */}
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {member.phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="size-3" />
                                <span>{member.phone}</span>
                              </div>
                            )}
                            {member.email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="size-3" />
                                <span className="truncate max-w-[180px]">{member.email}</span>
                              </div>
                            )}
                          </div>

                          {/* Social Links */}
                          {getSocialCount(member) > 0 && (
                            <div className="flex items-center gap-0.5 mt-2 -ml-0.5">
                              <SocialLinkIcon platform="linkedin" url={member.linkedin} />
                              <SocialLinkIcon platform="twitter" url={member.twitter} />
                              <SocialLinkIcon platform="github" url={member.github} />
                              <SocialLinkIcon platform="instagram" url={member.instagram} />
                              <SocialLinkIcon platform="facebook" url={member.facebook} />
                              <SocialLinkIcon platform="website" url={member.website} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 sm:flex-col sm:justify-center shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(member)}
                        >
                          <Pencil className="size-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          onClick={() => handleDeleteClick(member.id)}
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
              {isEditing ? 'Edit Team Member' : 'Add Team Member'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the team member details below'
                : 'Fill in the details for the new team member'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g., Manish Kumar"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Role <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g., Developer, Marketing Head"
                value={form.role}
                onChange={(e) => updateForm('role', e.target.value)}
              />
            </div>

            {/* Bio */}
            <div className="space-y-1.5">
              <Label>Bio <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Short bio or description about the team member..."
                value={form.bio}
                onChange={(e) => updateForm('bio', e.target.value)}
                rows={4}
              />
            </div>

            {/* Image Upload */}
            <div className="space-y-1.5">
              <Label>Photo <span className="text-muted-foreground text-xs">(optional)</span></Label>
              
              {/* Preview area */}
              {(imagePreview || form.image) && (
                <div className="relative inline-block">
                  <div className="size-20 rounded-full overflow-hidden border-2 border-emerald-200 dark:border-emerald-800">
                    <img
                      src={imagePreview || form.image}
                      alt="Preview"
                      className="size-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateForm('image', '')
                      setImagePreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="absolute -top-1 -right-1 size-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )}
              
              {/* Upload button */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    // Validate file type
                    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
                    if (!validTypes.includes(file.type)) {
                      toast({ title: 'Invalid Image Format', description: 'Please upload a JPG, PNG, WebP, or GIF image.', variant: 'destructive' })
                      return
                    }

                    // Compress to ≤200 KB before uploading
                    let uploadFile = file
                    try {
                      const result = await compressImage(file)
                      if (result.finalBytes > 200 * 1024) {
                        toast({ title: 'Image Too Large', description: 'The image must be under 200 KB. GIFs are not auto-compressed — please use a smaller file.', variant: 'destructive' })
                        return
                      }
                      uploadFile = result.file
                      if (result.compressed) {
                        toast({ title: 'Image Compressed', description: `Resized to ${Math.round(result.finalBytes / 1024)} KB for upload.` })
                      }
                    } catch {
                      toast({ title: 'Could Not Read Image', description: 'Please try a different file.', variant: 'destructive' })
                      return
                    }

                    // Show local preview immediately
                    const localPreview = URL.createObjectURL(uploadFile)
                    setImagePreview(localPreview)

                    // Upload to server
                    setIsUploading(true)
                    try {
                      const formData = new FormData()
                      formData.append('file', uploadFile)

                      const data = await api.upload<{ url: string }>('/api/upload/team', formData)
                      updateForm('image', data.url)
                      toast({ title: 'Uploaded', description: 'Photo uploaded successfully' })
                    } catch (err) {
                      toast({ title: 'Upload Failed', description: err instanceof Error ? err.message : "We couldn't upload the image. Please try again.", variant: 'destructive' })
                      setImagePreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    } finally {
                      setIsUploading(false)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="size-4 mr-2" />
                  )}
                  {isUploading ? 'Uploading...' : (imagePreview || form.image) ? 'Change Photo' : 'Upload Photo'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WebP or GIF — auto-compressed to 200 KB.
              </p>
            </div>

            {/* Phone & Email row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  placeholder="manish@example.com"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                />
              </div>
            </div>

            {/* Social Links Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-1">
                <ExternalLink className="size-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Social Links</Label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* LinkedIn */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Linkedin className="size-3" />
                    LinkedIn
                  </Label>
                  <Input
                    placeholder="https://linkedin.com/in/..."
                    value={form.linkedin}
                    onChange={(e) => updateForm('linkedin', e.target.value)}
                  />
                </div>

                {/* Twitter */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Twitter className="size-3" />
                    Twitter / X
                  </Label>
                  <Input
                    placeholder="https://x.com/..."
                    value={form.twitter}
                    onChange={(e) => updateForm('twitter', e.target.value)}
                  />
                </div>

                {/* GitHub */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Github className="size-3" />
                    GitHub
                  </Label>
                  <Input
                    placeholder="https://github.com/..."
                    value={form.github}
                    onChange={(e) => updateForm('github', e.target.value)}
                  />
                </div>

                {/* Instagram */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Instagram className="size-3" />
                    Instagram
                  </Label>
                  <Input
                    placeholder="https://instagram.com/..."
                    value={form.instagram}
                    onChange={(e) => updateForm('instagram', e.target.value)}
                  />
                </div>

                {/* Facebook */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Facebook className="size-3" />
                    Facebook
                  </Label>
                  <Input
                    placeholder="https://facebook.com/..."
                    value={form.facebook}
                    onChange={(e) => updateForm('facebook', e.target.value)}
                  />
                </div>

                {/* Website */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Globe className="size-3" />
                    Website
                  </Label>
                  <Input
                    placeholder="https://example.com"
                    value={form.website}
                    onChange={(e) => updateForm('website', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Display this team member on the landing page
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => updateForm('isActive', checked)}
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
                onChange={(e) => updateForm('sortOrder', parseInt(e.target.value) || 0)}
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
                disabled={isSaving || isUploading}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="size-4 mr-2" />
                )}
                {isUploading ? 'Uploading Photo...' : isEditing ? 'Save Changes' : 'Create Member'}
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
            <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this team member? This action will remove them from the landing page. The data will be soft-deleted and can be recovered if needed.
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
