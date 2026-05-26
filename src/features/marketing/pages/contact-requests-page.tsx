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
  Search,
  Phone,
  Mail,
  Building2,
  Users,
  Clock,
  Wallet,
  Crown,
  Palette,
  Globe,
  Sparkles,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  CheckCircle2,
  PhoneCall,
  Star,
  XCircle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ContactRequest {
  id: string
  name: string
  schoolName: string
  email: string
  phone: string
  studentCount: number
  message: string | null
  addOns: string | null
  status: string
  notes: string | null
  contactedBy: string | null
  contactedAt: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Inbox }> = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400', icon: Inbox },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400', icon: PhoneCall },
  qualified: { label: 'Qualified', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400', icon: Star },
  converted: { label: 'Converted', color: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400', icon: CheckCircle2 },
  lost: { label: 'Lost', color: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400', icon: XCircle },
}

const ADD_ON_ICONS: Record<string, typeof Wallet> = {
  'Salary & Payroll': Wallet,
  'Premium Feature': Crown,
  'Premium Features': Crown,
  'Custom Branding': Palette,
  'School Landing Page': Globe,
  'Landing Page': Globe,
}

function getAddOnIcon(name: string) {
  return ADD_ON_ICONS[name] || Sparkles
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function ContactRequestsPage() {
  const { user } = useAppStore()
  const { toast } = useToast()
  const [contacts, setContacts] = useState<ContactRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedContact, setSelectedContact] = useState<ContactRequest | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [updateNotes, setUpdateNotes] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [addonIdToName, setAddonIdToName] = useState<Record<string, string>>({})

  useEffect(() => {
    api.get<{ addons?: Array<{ id: string; name: string }> }>('/api/pricing', undefined, { skipLogoutOn401: true })
      .then((data: { addons?: Array<{ id: string; name: string }> }) => {
        if (data.addons) {
          const map: Record<string, string> = {}
          for (const a of data.addons) map[a.id] = a.name
          setAddonIdToName(map)
        }
      })
      .catch(() => { /* fallback to raw value */ })
  }, [])

  const resolveAddon = useCallback((value: string) => addonIdToName[value] || value, [addonIdToName])

  const fetchContacts = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = { page: page.toString(), limit: '12' }
      if (statusFilter !== 'all') params.status = statusFilter
      if (search) params.search = search

      const data = await api.get<{ contacts: ContactRequest[]; total: number; page: number; totalPages: number }>('/api/super-admin/contacts?' + new URLSearchParams(params).toString())
      setContacts(data.contacts)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {
      toast({ title: "Couldn't Load Contact Requests", description: "We couldn't load the contact requests. Please refresh the page.", variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [page, statusFilter, search, toast])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  const handleOpenDetail = (contact: ContactRequest) => {
    setSelectedContact(contact)
    setUpdateStatus(contact.status)
    setUpdateNotes(contact.notes || '')
    setDetailOpen(true)
  }

  const handleUpdate = async () => {
    if (!selectedContact) return
    setIsUpdating(true)
    try {
      const body: Record<string, unknown> = {
        status: updateStatus,
        notes: updateNotes,
      }
      if (updateStatus !== selectedContact.status && updateStatus === 'contacted') {
        body.contactedBy = user?.id
      }
      await api.patch(`/api/super-admin/contacts/${selectedContact.id}`, body)
      toast({ title: 'Updated', description: 'Contact request updated successfully' })
      setDetailOpen(false)
      fetchContacts()
    } catch {
      toast({ title: "Couldn't Update Contact Request", description: "We couldn't update the contact request. Please try again.", variant: 'destructive' })
    } finally {
      setIsUpdating(false)
    }
  }

  const newCount = contacts.filter(c => c.status === 'new').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contact Requests</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage demo requests and inquiries from schools
          </p>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 animate-pulse">
              <Inbox className="size-3 mr-1" />
              {newCount} New
            </Badge>
          )}
          <Badge variant="outline">{total} Total</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, school, email, phone..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Contact Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-20">
          <Inbox className="size-12 text-muted-foreground/50 mx-auto" />
          <p className="mt-4 text-muted-foreground">No contact requests found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {contacts.map((contact, i) => {
              const statusCfg = STATUS_CONFIG[contact.status] || STATUS_CONFIG.new
              const StatusIcon = statusCfg.icon
              let addOns: string[] = []
              try {
                addOns = contact.addOns ? JSON.parse(contact.addOns) : []
              } catch { /* ignore */ }

              return (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <Card className="hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors cursor-pointer" onClick={() => handleOpenDetail(contact)}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="size-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {contact.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold truncate">{contact.name}</h3>
                              <Badge className={`text-xs ${statusCfg.color}`}>
                                <StatusIcon className="size-3 mr-1" />
                                {statusCfg.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1"><Building2 className="size-3" /> {contact.schoolName}</span>
                              {contact.studentCount > 0 && (
                                <span className="flex items-center gap-1"><Users className="size-3" /> {contact.studentCount} students</span>
                              )}
                              <span className="flex items-center gap-1"><Clock className="size-3" /> {formatTimeAgo(contact.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1"><Mail className="size-3" /> {contact.email}</span>
                              <span className="flex items-center gap-1"><Phone className="size-3" /> {contact.phone}</span>
                            </div>
                            {addOns.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {addOns.map((ao) => {
                                  const label = resolveAddon(ao)
                                  const Icon = getAddOnIcon(label)
                                  return (
                                    <Badge key={ao} variant="outline" className="text-xs py-0">
                                      <Icon className="size-3 mr-1" />
                                      {label}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0">
                          <Eye className="size-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedContact && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-xs">
                    {selectedContact.name.charAt(0)}
                  </div>
                  {selectedContact.name}
                </DialogTitle>
                <DialogDescription>{selectedContact.schoolName}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="truncate">{selectedContact.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="size-4 text-muted-foreground" />
                    <span>{selectedContact.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="size-4 text-muted-foreground" />
                    <span>{selectedContact.studentCount || 'Not specified'} students</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="size-4 text-muted-foreground" />
                    <span>{formatTimeAgo(selectedContact.createdAt)}</span>
                  </div>
                </div>

                {/* Message */}
                {selectedContact.message && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Message</p>
                    <p className="text-sm leading-relaxed">{selectedContact.message}</p>
                  </div>
                )}

                {/* Add-ons */}
                {(() => {
                  let addOns: string[] = []
                  try {
                    addOns = selectedContact.addOns ? JSON.parse(selectedContact.addOns) : []
                  } catch { /* ignore */ }
                  if (addOns.length === 0) return null
                  return (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Interested Add-Ons</p>
                      <div className="flex flex-wrap gap-2">
                        {addOns.map((ao) => {
                          const label = resolveAddon(ao)
                          const Icon = getAddOnIcon(label)
                          return (
                            <Badge key={ao} variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                              <Icon className="size-3 mr-1" />
                              {label}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Status Update */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="space-y-1.5">
                    <Label>Update Status</Label>
                    <Select value={updateStatus} onValueChange={setUpdateStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea
                      placeholder="Add notes about this contact..."
                      value={updateNotes}
                      onChange={(e) => setUpdateNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleUpdate}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
                      Save Changes
                    </Button>
                    <Button variant="outline" onClick={() => setDetailOpen(false)}>
                      Cancel
                    </Button>
                  </div>

                  {selectedContact.contactedAt && (
                    <p className="text-xs text-muted-foreground">
                      Contacted on {new Date(selectedContact.contactedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
