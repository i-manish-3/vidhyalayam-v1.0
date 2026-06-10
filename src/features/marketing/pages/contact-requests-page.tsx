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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
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
  Inbox,
  CheckCircle2,
  PhoneCall,
  Star,
  XCircle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

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

interface ContactRequestsListState {
  search?: string
  statusFilter?: string
  page?: number
}

const CONTACT_REQUESTS_LIST_STATE_KEY = 'marketing:contact-requests:list'
const PAGE_SIZE = 12

export function ContactRequestsPage() {
  const { user } = useAppStore()
  const savedListState = useAppStore((state) => state.pageState[CONTACT_REQUESTS_LIST_STATE_KEY] as ContactRequestsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const { toast } = useToast()
  const [contacts, setContacts] = useState<ContactRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [statusFilter, setStatusFilter] = useState(savedListState?.statusFilter ?? 'all')
  const [page, setPage] = useState(savedListState?.page ?? 1)
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
      const params: Record<string, string> = { page: page.toString(), limit: String(PAGE_SIZE) }
      if (statusFilter !== 'all') params.status = statusFilter
      if (search) params.search = search

      const data = await api.get<{ contacts: ContactRequest[]; total: number; page: number; totalPages: number }>('/api/super-admin/contacts?' + new URLSearchParams(params).toString())
      setContacts(data.contacts)
      setTotal(data.total)
      setTotalPages(Math.max(1, data.totalPages || 1))
    } catch {
      toast({ title: "Couldn't Load Contact Requests", description: "We couldn't load the contact requests. Please refresh the page.", variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [page, statusFilter, search, toast])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  const rememberListState = (patch: Partial<ContactRequestsListState>) => {
    setPageState(CONTACT_REQUESTS_LIST_STATE_KEY, { search, statusFilter, page, ...patch })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
    rememberListState({ search: value, page: 1 })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
    rememberListState({ statusFilter: value, page: 1 })
  }

  const handlePageChange = (value: number) => {
    const nextPage = Math.min(Math.max(1, value), totalPages)
    setPage(nextPage)
    rememberListState({ page: nextPage })
  }

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
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, total)
  const pageNumbers: (number | 'ellipsis-start' | 'ellipsis-end')[] = (() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 3) return [1, 2, 3, 4, 'ellipsis-end', totalPages]
    if (page >= totalPages - 2) return [1, 'ellipsis-start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages]
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-stretch gap-3">
          <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Contact Requests</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage demo requests and inquiries from schools
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {newCount > 0 && (
            <Badge className="animate-pulse bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
              <Inbox className="size-3 mr-1" />
              {newCount} New
            </Badge>
          )}
          <Badge variant="outline">{total} Total</Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="py-0">
        <CardContent className="p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, school, email, phone..."
                className="h-9 pl-9"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="h-9 w-full sm:w-44">
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
        </CardContent>
      </Card>

      {/* Contact Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : contacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="size-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">No contact requests found</p>
          </CardContent>
        </Card>
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
                  <Card className="overflow-hidden rounded-lg bg-card py-0 shadow-sm transition-colors hover:border-primary/40 cursor-pointer" onClick={() => handleOpenDetail(contact)}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="bg-brand-soft flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm">
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
      {total > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {showingFrom} to {showingTo} of {total} requests
          </p>
          <Pagination className="mx-0 w-auto justify-start sm:justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={cn('h-8', page <= 1 && 'pointer-events-none opacity-50')}
                  aria-disabled={page <= 1}
                  onClick={(event) => {
                    event.preventDefault()
                    if (page > 1) handlePageChange(page - 1)
                  }}
                />
              </PaginationItem>
              {pageNumbers.map((p, index) => (
                <PaginationItem key={`${p}-${index}`}>
                  {p === 'ellipsis-start' || p === 'ellipsis-end' ? (
                    <PaginationEllipsis className="size-8" />
                  ) : (
                    <PaginationLink
                      href="#"
                      isActive={p === page}
                      className="size-8 text-xs"
                      onClick={(event) => {
                        event.preventDefault()
                        handlePageChange(p)
                      }}
                    >
                      {p}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={cn('h-8', page >= totalPages && 'pointer-events-none opacity-50')}
                  aria-disabled={page >= totalPages}
                  onClick={(event) => {
                    event.preventDefault()
                    if (page < totalPages) handlePageChange(page + 1)
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
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
