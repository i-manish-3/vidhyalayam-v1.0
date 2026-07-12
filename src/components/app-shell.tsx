'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useAppStore, type PageName, type User as StoreUser } from '@/lib/store'
import { AppSidebar, MENUS } from './app-sidebar'
import { isPageVisible } from '@/lib/permission-mappings'
import { SCHOOL_THEME_VARIABLE_NAMES, getThemeVariables } from '@/lib/theme-palettes'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Sun,
  Moon,
  LogOut,
  User,
  PanelLeftOpen,
  Search,
  ArrowRight,
  Lock,
  ImagePlus,
  Trash2,
  ChevronDown,
  Mail,
  ShieldCheck,
  Sparkles,
  GraduationCap,
  Award,
  Coins,
  CalendarDays,
  CalendarCheck,
  Package,
  UserPlus,
  ReceiptText,
  BarChart2,
  IndianRupee,
  Bus,
  Building2,
  UserRound,
  Users,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { AcademicYearSwitcher } from '@/components/academic-year-switcher'
import { ImpersonationBanner } from '@/components/super-admin/impersonation-banner'
import { PlatformAnnouncementBanner } from '@/components/super-admin/platform-announcement-banner'
import { ChatbotWidget } from '@/features/chatbot/chatbot-widget'
import { resolveMigratedUrl } from '@/lib/migrated-routes'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notifications/notification-bell'

function PastYearGlobalBanner() {
  const currentSchool = useAppStore((state) => state.currentSchool)
  const viewingAcademicYear = useAppStore((state) => state.viewingAcademicYear)
  const setViewingAcademicYear = useAppStore((state) => state.setViewingAcademicYear)
  const schoolActiveYear = currentSchool?.academicYear || null
  const effectiveYear = viewingAcademicYear || schoolActiveYear
  if (!schoolActiveYear || !effectiveYear || effectiveYear === schoolActiveYear) return null
  return (
    <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>Viewing {effectiveYear} session.</strong> Fees, attendance, profile and other year-scoped data on every
          page will reflect this session until you switch back.
        </span>
        <button
          type="button"
          onClick={() => setViewingAcademicYear(schoolActiveYear)}
          className="rounded-md border border-amber-400 bg-white px-2 py-0.5 text-xs font-semibold hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30"
        >
          Switch back to {schoolActiveYear}
        </button>
      </div>
    </div>
  )
}

// Searchable items for universal search
const SEARCH_ITEMS: { label: string; page: PageName; keywords: string[] }[] = [
  { label: 'Dashboard', page: 'dashboard', keywords: ['home', 'overview', 'main'] },
  { label: 'Students', page: 'students', keywords: ['learner', 'pupil', 'admission'] },
  { label: 'Student Houses', page: 'student-houses', keywords: ['house', 'red house', 'blue house', 'student house', 'assign house'] },
  { label: 'Alumni', page: 'alumni', keywords: ['passout', 'pass out', 'graduate', 'ex-student', 'tc', 'transfer certificate', 'left', 'withdrawn', 'old students'] },
  { label: 'Teachers', page: 'teachers', keywords: ['staff', 'faculty', 'educator'] },
  { label: 'Add Teacher', page: 'add-teacher', keywords: ['new teacher', 'create teacher', 'add faculty', 'add educator'] },
  { label: 'Parents', page: 'parents', keywords: ['mother', 'father'] },
  { label: 'New Admission Form', page: 'admission-form', keywords: ['apply', 'enroll form', 'register student'] },
  { label: 'Mark Attendance', page: 'mark-attendance', keywords: ['present', 'absent', 'daily', 'mark attendance'] },
  { label: 'View Attendance', page: 'view-attendance', keywords: ['attendance report', 'view attendance', 'attendance records'] },
  { label: 'Employee Attendance', page: 'employee-attendance', keywords: ['teacher attendance', 'staff attendance', 'employee present absent'] },
  { label: 'Attendance Credentials', page: 'attendance-credentials', keywords: ['zkteco', 'fingerprint', 'biometric', 'rfid credential', 'device pin'] },
  { label: 'Attendance Audit Log', page: 'attendance-audit-log', keywords: ['audit', 'finalize', 'reopen', 'log', 'history', 'attendance audit'] },
  { label: 'Attendance Reports', page: 'attendance-reports', keywords: ['report', 'monthly', 'summary', 'calendar', 'defaulters', 'analytics', 'percentage'] },
  { label: 'Fee Heads', page: 'fees-heads', keywords: ['fee type', 'tuition', 'charge'] },
  { label: 'Fee Groups', page: 'fees-groups', keywords: ['fee category', 'group fees'] },
  { label: 'Fee Structures', page: 'fees-structures', keywords: ['fee plan', 'class fees', 'amount'] },
  { label: 'Fee Collections', page: 'fee-collections', keywords: ['payment', 'collect', 'receipt', 'pay'] },
  { label: 'Fee Receipts', page: 'fee-list', keywords: ['receipt', 'history', 'paid', 'list'] },
  { label: 'Fee Demand Slips', page: 'fee-demand-slips', keywords: ['monthly', 'invoice', 'slip', 'demand', 'generate'] },
  { label: 'Change Fee Group', page: 'fee-change-group', keywords: ['switch fee group', 'reassign fees', 'wrong fee group'] },
  { label: 'Salary Structure', page: 'salary-structure', keywords: ['pay scale', 'ctc', 'compensation'] },
  { label: 'Salary Payments', page: 'salary-payments', keywords: ['payroll', 'salary slip', 'month pay'] },
  { label: 'Advance Requests', page: 'salary-advance', keywords: ['loan', 'advance salary', 'prepayment'] },
  { label: 'Timetable', page: 'timetable', keywords: ['schedule', 'period', 'routine'] },
  { label: 'Exams', page: 'exams', keywords: ['test', 'assessment', 'mid term', 'final'] },
  { label: 'Exam Results', page: 'exam-results', keywords: ['marks', 'grades', 'score', 'report'] },
  { label: 'Transport', page: 'transport', keywords: ['bus', 'route', 'vehicle', 'pickup'] },
  { label: 'Create Transport Route', page: 'add-transport-route', keywords: ['add route', 'new route', 'create route', 'bus route'] },
  { label: 'Annual Transport Setup', page: 'transport-annual-setup', keywords: ['annual transport', 'session transport', 'stop fares', 'next session routes', 'year transport'] },
  { label: 'Drivers', page: 'drivers', keywords: ['driver', 'cab', 'vehicle operator', 'chauffeur'] },
  { label: 'Add Driver', page: 'add-driver', keywords: ['new driver', 'create driver', 'add driver', 'register driver'] },
  { label: 'Library', page: 'library', keywords: ['book', 'issue', 'return', 'read'] },
  { label: 'Inventory', page: 'inventory', keywords: ['stock', 'item', 'asset', 'furniture'] },
  { label: 'Notifications', page: 'notifications', keywords: ['alert', 'message', 'reminder'] },
  { label: 'Announcements', page: 'announcements', keywords: ['notice', 'broadcast', 'news'] },
  { label: 'Classes', page: 'classes', keywords: ['grade', 'standard', 'section'] },
  { label: 'Promote Student', page: 'promote-student', keywords: ['promotion', 'promote students', 'session promotion', 'student promote'] },
  { label: 'Assign Roll Numbers', page: 'assign-roll-numbers', keywords: ['roll number', 'roll no', 'assign roll', 'alphabetical', 'class roll'] },
  { label: 'Subjects', page: 'subjects', keywords: ['course', 'discipline', 'math', 'science'] },
  { label: 'Academic Years', page: 'academic-years', keywords: ['session', 'year', 'current year', 'school year'] },
  { label: 'Add Subject', page: 'add-subject', keywords: ['new subject', 'create subject', 'add course'] },
  { label: 'Add Class', page: 'add-class', keywords: ['new class', 'create class', 'add grade'] },
  { label: 'Settings', page: 'settings', keywords: ['config', 'preference', 'system'] },
  { label: 'Schools', page: 'schools', keywords: ['institution', 'campus', 'branch'] },
  { label: 'Add School', page: 'add-school', keywords: ['new school', 'create school', 'add institution', 'onboard school'] },
  { label: 'School Details', page: 'school-detail', keywords: ['school info', 'school edit', 'school view'] },
  { label: 'School Permissions', page: 'super-admin-permissions', keywords: ['permission', 'module access', 'school access'] },
  { label: 'Roles', page: 'super-admin-roles', keywords: ['role', 'custom role', 'create role', 'role management'] },
  { label: 'Support Tickets', page: 'support', keywords: ['help', 'issue', 'complaint'] },
  { label: 'Contact Requests', page: 'contact-requests', keywords: ['contact', 'demo', 'request', 'inquiry', 'lead'] },
  { label: 'Testimonials', page: 'testimonials', keywords: ['testimonial', 'review', 'feedback', 'rating'] },
  { label: 'Pricing Plans', page: 'pricing-plans', keywords: ['pricing', 'plan', 'addon', 'price', 'subscription', 'billing'] },
  { label: 'Team Members', page: 'team-members', keywords: ['team', 'member', 'staff', 'people', 'about'] },
]

function collectMenuPages(item: { page: PageName; children?: { page: PageName; children?: unknown[] }[] }): PageName[] {
  const pages: PageName[] = [item.page]
  if (item.children) {
    for (const child of item.children) {
      pages.push(...collectMenuPages(child as { page: PageName; children?: { page: PageName; children?: unknown[] }[] }))
    }
  }
  return pages
}

function getAllowedPagesForRole(role: string): Set<PageName> {
  const roleMenus = MENUS[role]
  if (!roleMenus) return new Set()
  const pages = new Set<PageName>()
  for (const item of roleMenus) {
    for (const p of collectMenuPages(item)) {
      pages.add(p)
    }
  }
  return pages
}

type StickyQuickMenuLink = {
  type: 'link'
  label: string
  page: PageName
  href: string
  icon: LucideIcon
}

type StickyQuickMenuDropdown = {
  type: 'dropdown'
  label: string
  icon: LucideIcon
  children: StickyQuickMenuLink[]
}

type StickyQuickMenuItem = StickyQuickMenuLink | StickyQuickMenuDropdown

function quickMenuTone(label: string) {
  const tones: Record<string, { icon: string; hover: string; active: string; activeIcon: string }> = {
    'Student List': { icon: 'bg-sky-500/12 text-sky-600 dark:text-sky-300', hover: 'hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-300', active: 'bg-sky-500/12 text-sky-700 hover:bg-sky-500/15 hover:text-sky-700 dark:text-sky-300', activeIcon: 'bg-sky-500 text-white' },
    Timetable: { icon: 'bg-violet-500/12 text-violet-600 dark:text-violet-300', hover: 'hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300', active: 'bg-violet-500/12 text-violet-700 hover:bg-violet-500/15 hover:text-violet-700 dark:text-violet-300', activeIcon: 'bg-violet-500 text-white' },
    Exam: { icon: 'bg-amber-500/14 text-amber-600 dark:text-amber-300', hover: 'hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300', active: 'bg-amber-500/14 text-amber-700 hover:bg-amber-500/18 hover:text-amber-700 dark:text-amber-300', activeIcon: 'bg-amber-500 text-white' },
    'Collect Fees': { icon: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300', hover: 'hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300', active: 'bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-300', activeIcon: 'bg-emerald-500 text-white' },
    Attendance: { icon: 'bg-rose-500/12 text-rose-600 dark:text-rose-300', hover: 'hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300', active: 'bg-rose-500/12 text-rose-700 hover:bg-rose-500/15 hover:text-rose-700 dark:text-rose-300', activeIcon: 'bg-rose-500 text-white' },
    Inventory: { icon: 'bg-orange-500/12 text-orange-600 dark:text-orange-300', hover: 'hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-300', active: 'bg-orange-500/12 text-orange-700 hover:bg-orange-500/15 hover:text-orange-700 dark:text-orange-300', activeIcon: 'bg-orange-500 text-white' },
    Admission: { icon: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-300', hover: 'hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300', active: 'bg-cyan-500/12 text-cyan-700 hover:bg-cyan-500/15 hover:text-cyan-700 dark:text-cyan-300', activeIcon: 'bg-cyan-500 text-white' },
    'Account Reports': { icon: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300', hover: 'hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300', active: 'bg-indigo-500/12 text-indigo-700 hover:bg-indigo-500/15 hover:text-indigo-700 dark:text-indigo-300', activeIcon: 'bg-indigo-500 text-white' },
  }
  return tones[label] || { icon: 'bg-primary/10 text-primary', hover: 'hover:bg-primary/10 hover:text-primary', active: 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary', activeIcon: 'bg-primary text-primary-foreground' }
}

function UniversalSearch() {
  const router = useRouter()
  const { user, permissions, permissionsLoaded } = useAppStore()
  const role = user?.role || 'SCHOOL_ADMIN'
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const allowedPages = useMemo(() => getAllowedPagesForRole(role), [role])

  const visibleSearchItems = useMemo(
    () => SEARCH_ITEMS.filter(item =>
      allowedPages.has(item.page) && isPageVisible(item.page, permissions, role, permissionsLoaded)
    ),
    [allowedPages, permissions, permissionsLoaded, role]
  )

  const results = query.trim()
    ? visibleSearchItems.filter(item => {
        const q = query.toLowerCase()
        return (
          item.label.toLowerCase().includes(q) ||
          item.keywords.some(k => k.includes(q)) ||
          item.page.toLowerCase().includes(q)
        )
      })
    : []
  const mobileItems = query.trim() ? results : visibleSearchItems.slice(0, 8)

  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const updateDropdownPosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        zIndex: 9999,
      })
    }
  }, [])

  useEffect(() => {
    if (isOpen && results.length > 0) {
      updateDropdownPosition()
      window.addEventListener('scroll', updateDropdownPosition, true)
      window.addEventListener('resize', updateDropdownPosition)
      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true)
        window.removeEventListener('resize', updateDropdownPosition)
      }
    }
  }, [isOpen, results.length, updateDropdownPosition])

  const handleSelect = (page: PageName) => {
    setQuery('')
    setIsOpen(false)
    setMobileSearchOpen(false)
    setSelectedIndex(0)
    inputRef.current?.blur()
    mobileInputRef.current?.blur()
    const url = resolveMigratedUrl(page)
    if (url) router.push(url)
  }

  const openMobileSearch = () => {
    setMobileSearchOpen(true)
    setIsOpen(false)
    window.requestAnimationFrame(() => mobileInputRef.current?.focus())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex].page)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setQuery('')
      inputRef.current?.blur()
    }
  }

  return (
    <>
    <div className="relative shrink-0 sm:min-w-0 sm:flex-1 sm:max-w-64 lg:max-w-72">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground sm:hidden dark:border-sidebar-border dark:bg-sidebar-accent/60 dark:text-sidebar-foreground dark:hover:bg-sidebar-accent"
        onClick={openMobileSearch}
        aria-label="Search"
      >
        <Search className="size-[18px]" />
      </Button>

      <div className="relative hidden items-center sm:flex">
        <Search className="absolute left-2.5 size-3.5 text-primary-foreground/75 pointer-events-none dark:text-sidebar-foreground/60" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
            setSelectedIndex(0)
          }}
          onFocus={() => query.trim() && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="Search pages, modules..."
          className="h-8 w-full rounded-md border border-primary-foreground/20 bg-primary-foreground/15 pl-8 pr-8 text-xs text-primary-foreground ring-offset-background placeholder:text-primary-foreground/65 transition-shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-foreground/60 focus-visible:ring-offset-0 dark:border-sidebar-border dark:bg-sidebar-accent/60 dark:text-sidebar-foreground dark:placeholder:text-sidebar-foreground/55 dark:focus-visible:ring-sidebar-ring"
        />
        {!query && (
          <kbd className="absolute right-2 pointer-events-none hidden sm:inline-flex items-center gap-0.5 rounded border border-primary-foreground/20 bg-primary-foreground/15 px-1 py-0.5 text-[9px] text-primary-foreground/70 font-mono dark:border-sidebar-border dark:bg-sidebar-accent dark:text-sidebar-foreground/60">
            ⌘K
          </kbd>
        )}
      </div>

      {isOpen && results.length > 0 && typeof window !== 'undefined' && createPortal(
        <div
          className="rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-top-1 duration-150"
          style={dropdownStyle}
        >
          <div className="p-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-3">
            {results.length} result{results.length > 1 ? 's' : ''}
          </div>
          <div className="max-h-64 overflow-y-auto px-1 pb-1">
            {results.map((item, index) => (
              <button
                key={item.page}
                onMouseDown={() => handleSelect(item.page)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <ArrowRight className="size-3 shrink-0 opacity-40" />
                <span className="font-medium">{item.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60 truncate max-w-[100px]">
                  {item.page}
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {isOpen && query.trim() && results.length === 0 && typeof window !== 'undefined' && createPortal(
        <div
          className="rounded-lg border bg-popover text-popover-foreground shadow-lg p-4 text-center animate-in fade-in-0 slide-in-from-top-1 duration-150"
          style={dropdownStyle}
        >
          <p className="text-xs text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Try searching for a page or module name</p>
        </div>,
        document.body
      )}
    </div>

    <Dialog open={mobileSearchOpen} onOpenChange={(open) => {
      setMobileSearchOpen(open)
      if (!open) {
        setQuery('')
        setSelectedIndex(0)
      }
    }}>
      <DialogContent className="top-4 max-h-[calc(100svh-2rem)] translate-y-0 gap-0 overflow-hidden rounded-2xl border-slate-200 bg-background/95 p-0 shadow-2xl backdrop-blur sm:hidden">
        <DialogHeader className="border-b px-4 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" />
            Search
          </DialogTitle>
          <DialogDescription>Find pages and modules quickly.</DialogDescription>
        </DialogHeader>

        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={mobileInputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelectedIndex(0)
              }}
              placeholder="Search pages, modules..."
              className="h-11 rounded-xl pl-9"
            />
          </div>
        </div>

        <div className="themed-scrollbar max-h-[58svh] overflow-y-auto overscroll-contain px-2 py-2">
          {!query.trim() && (
            <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick links</p>
          )}
          {query.trim() && results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium">No results for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a page or module name.</p>
            </div>
          ) : (
            mobileItems.map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => handleSelect(item.page)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ArrowRight className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.page}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="2" y="4" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="9.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="14.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, currentSchool, logout, sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapse, isAuthenticated, permissions, permissionsLoaded } = useAppStore()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { toast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const handleLogout = useCallback(() => {
    // Defer the logout state flip so the DropdownMenu can finish its close
    // animation before AppShell unmounts. Without this, Radix's portal
    // cleanup races with our unmount and crashes with "Cannot read
    // properties of null (reading 'removeChild')" on Next.js 16 / Turbopack.
    // The (app)/layout useEffect will redirect to /login once isAuthenticated
    // flips — no manual nav needed here.
    setTimeout(() => { void logout() }, 200)
  }, [logout])

  // Prefer the custom permission role (e.g. "Accountant") for STAFF users so the
  // header shows their actual job role instead of the generic "Staff" label.
  const roleBadge = user?.role === 'STAFF' && user.assignedRoleName
    ? user.assignedRoleName
    : user?.role?.replace('_', ' ') || 'User'
  const isDarkTheme = resolvedTheme === 'dark' || theme === 'dark'
  const schoolThemeStyle = useMemo(
    () => getThemeVariables(isDarkTheme),
    [isDarkTheme]
  )

  const role = user?.role || 'SCHOOL_ADMIN'
  const isImpersonating = role === 'SUPER_ADMIN' && !!user?.impersonatingSchoolId
  const effectiveRole = isImpersonating ? 'SCHOOL_ADMIN' : role
  const allowedTopMenuPages = useMemo(() => getAllowedPagesForRole(effectiveRole), [effectiveRole])
  const hideStickyQuickMenu = pathname === '/dashboard' && (role === 'PARENT' || (role === 'SUPER_ADMIN' && !isImpersonating))

  const visibleItems = useMemo(() => {
    const attendanceChildren: StickyQuickMenuLink[] = [
      { type: 'link', label: 'Student', page: 'mark-attendance', href: '/attendance/mark', icon: UserRound },
      { type: 'link', label: 'Staff', page: 'employee-attendance', href: '/attendance/staff', icon: Users },
    ]
    const accountReportChildren: StickyQuickMenuLink[] = [
      { type: 'link', label: 'Fee Reports', page: 'fee-reports', href: '/fees/reports', icon: IndianRupee },
      { type: 'link', label: 'Transport Reports', page: 'transport', href: '/transport/routes', icon: Bus },
      { type: 'link', label: 'Hostel Reports', page: 'hostel', href: '/hostel/hostels', icon: Building2 },
    ]

    const items: StickyQuickMenuItem[] = [
      { type: 'link', label: 'Student List', page: 'students', href: '/students', icon: GraduationCap },
      { type: 'link', label: 'Timetable', page: 'timetable', href: '/academics/timetable', icon: CalendarDays },
      { type: 'link', label: 'Exam', page: 'exam-dashboard', href: '/exams', icon: Award },
      { type: 'link', label: 'Collect Fees', page: 'fee-collections', href: '/fees/collections', icon: IndianRupee },
      {
        type: 'dropdown',
        label: 'Attendance',
        icon: CalendarCheck,
        children: attendanceChildren.filter(child => allowedTopMenuPages.has(child.page) && isPageVisible(child.page, permissions, effectiveRole, permissionsLoaded)),
      },
      { type: 'link', label: 'Inventory', page: 'inventory', href: '/inventory', icon: Package },
      { type: 'link', label: 'Admission', page: 'admission-form', href: '/students/admit', icon: UserPlus },
      {
        type: 'dropdown',
        label: 'Account Reports',
        icon: BarChart2,
        children: accountReportChildren.filter(child => allowedTopMenuPages.has(child.page) && isPageVisible(child.page, permissions, effectiveRole, permissionsLoaded)),
      },
    ]

    return items.filter(item => {
      if (item.type === 'dropdown') {
        return item.children && item.children.length > 0
      }
      return allowedTopMenuPages.has(item.page) && isPageVisible(item.page, permissions, effectiveRole, permissionsLoaded)
    })
  }, [allowedTopMenuPages, effectiveRole, permissions, permissionsLoaded])

  // When quick links overlap (for example `/students` and
  // `/students/admit`), only the most specific matching route is active.
  const activeQuickHref = useMemo(() => {
    const hrefs = visibleItems.flatMap((item) =>
      item.type === 'dropdown' ? item.children.map((child) => child.href) : [item.href]
    )

    return hrefs
      .filter((href) => pathname === href || (href !== '/' && pathname.startsWith(href + '/')))
      .sort((a, b) => b.length - a.length)[0] ?? null
  }, [pathname, visibleItems])

  useEffect(() => {
    const root = document.documentElement

    if (!schoolThemeStyle) {
      SCHOOL_THEME_VARIABLE_NAMES.forEach((name) => root.style.removeProperty(name))
      return
    }

    Object.entries(schoolThemeStyle).forEach(([name, value]) => {
      if (typeof value === 'string') {
        root.style.setProperty(name, value)
      }
    })

    return () => {
      SCHOOL_THEME_VARIABLE_NAMES.forEach((name) => root.style.removeProperty(name))
    }
  }, [schoolThemeStyle])

  const handleRequiredPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Missing Details', description: 'Please enter your current password and new password.', variant: 'destructive' })
      return
    }
    if (newPassword.length < 6) {
      toast({ title: 'Password Too Short', description: 'Your new password must be at least 6 characters long.', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords Don't Match", description: 'Please enter the same new password twice.', variant: 'destructive' })
      return
    }

    try {
      setChangingPassword(true)
      await api.post('/api/auth/change-password', { currentPassword, newPassword })
      const updatedUser = user ? { ...user, mustChangePassword: false } : user
      useAppStore.setState({ user: updatedUser })
      if (typeof window !== 'undefined' && updatedUser) {
        const { avatar: _avatar, ...slim } = updatedUser
        void _avatar
        try {
          localStorage.setItem('erp_user', JSON.stringify(slim))
        } catch {
        }
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Password Changed', description: 'Your new password is active now.' })
    } catch (err) {
      toast({
        title: "Couldn't Change Password",
        description: err instanceof Error ? err.message : 'Please check the password and try again.',
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const handleAvatarSelect = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid File', description: 'Please choose an image file (JPG, PNG, or WebP).', variant: 'destructive' })
      return
    }
    try {
      setSavingAvatar(true)
      const { dataUrl, finalBytes, compressed } = await compressImage(file)
      if (finalBytes > 200 * 1024) {
        toast({
          title: 'Photo Too Large',
          description: 'The profile photo must be under 200 KB. Please pick a smaller image.',
          variant: 'destructive',
        })
        return
      }
      const res = await api.patch<{ user: StoreUser }>('/api/auth/profile', { avatar: dataUrl })
      if (res?.user) {
        useAppStore.setState({ user: res.user })
        if (typeof window !== 'undefined') {
          const { avatar: _avatar, ...slim } = res.user
          void _avatar
          try {
            localStorage.setItem('erp_user', JSON.stringify(slim))
          } catch {
          }
        }
      }
      toast({
        title: 'Profile Photo Updated',
        description: compressed ? `Resized to ${Math.round(finalBytes / 1024)} KB and saved.` : 'Your new photo is live.',
      })
    } catch (err) {
      toast({
        title: "Couldn't Update Photo",
        description: err instanceof Error ? err.message : 'Please try again with a different image.',
        variant: 'destructive',
      })
    } finally {
      setSavingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const handleAvatarRemove = async () => {
    try {
      setSavingAvatar(true)
      const res = await api.patch<{ user: StoreUser }>('/api/auth/profile', { avatar: null })
      if (res?.user) {
        useAppStore.setState({ user: res.user })
        if (typeof window !== 'undefined') {
          const { avatar: _avatar, ...slim } = res.user
          void _avatar
          try {
            localStorage.setItem('erp_user', JSON.stringify(slim))
          } catch {
          }
        }
      }
      toast({ title: 'Photo Removed', description: 'Your profile photo was removed.' })
    } catch (err) {
      toast({
        title: "Couldn't Remove Photo",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingAvatar(false)
    }
  }

  const handleNameSave = async () => {
    const trimmed = profileName.trim()
    if (trimmed.length < 2) {
      toast({ title: 'Name Too Short', description: 'Please enter at least 2 characters.', variant: 'destructive' })
      return
    }
    if (trimmed === (user?.name || '')) return
    try {
      setSavingName(true)
      const res = await api.patch<{ user: StoreUser }>('/api/auth/profile', { name: trimmed })
      if (res?.user) {
        useAppStore.setState({ user: res.user })
        if (typeof window !== 'undefined') {
          const { avatar: _avatar, ...slim } = res.user
          void _avatar
          try {
            localStorage.setItem('erp_user', JSON.stringify(slim))
          } catch {
          }
        }
      }
      toast({ title: 'Name Updated', description: 'Your display name has been updated.' })
    } catch (err) {
      toast({
        title: "Couldn't Update Name",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-brand-page font-sans" style={schoolThemeStyle}>
      <header className="shrink-0 flex h-14 items-center gap-3 border-b border-primary/30 bg-primary bg-brand-header text-primary-foreground shadow-sm px-3 lg:px-4 z-30 dark:border-sidebar-border dark:bg-sidebar dark:text-sidebar-foreground">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground"
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    setSidebarOpen(!sidebarOpen)
                  } else {
                    toggleSidebarCollapse()
                  }
                }}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="size-[18px]" />
                ) : (
                  <HamburgerIcon className="size-[18px]" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="lg:hidden">
              {sidebarOpen ? 'Close menu' : 'Open menu'}
            </TooltipContent>
            <TooltipContent side="bottom" className="hidden lg:block">
              {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-5 w-px bg-primary-foreground/25 shrink-0 dark:bg-sidebar-border" />

        <UniversalSearch />

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <AcademicYearSwitcher />

          <NotificationBell />

          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </Button>

          <div className="h-5 w-px bg-primary-foreground/25 shrink-0 hidden sm:block dark:bg-sidebar-border" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pl-1.5 pr-2.5 h-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground">
                <Avatar className="size-7">
                  {user?.avatar && <AvatarImage src={user.avatar} alt={user?.name || 'User'} />}
                  <AvatarFallback className="bg-primary-foreground text-primary text-[10px] dark:bg-sidebar-primary dark:text-sidebar-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex min-w-0 flex-col items-start">
                  <span className="max-w-40 truncate text-xs font-medium leading-tight">{user?.name}</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 leading-none bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/15 dark:bg-sidebar-accent dark:text-sidebar-foreground">
                    {roleBadge}
                  </Badge>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-72 overflow-hidden rounded-xl border border-primary/20 bg-popover p-0 shadow-2xl shadow-primary/15">
              <DropdownMenuLabel className="relative overflow-hidden bg-gradient-to-r from-primary via-teal-600 to-cyan-600 p-3.5 text-white">
                <div aria-hidden className="absolute -right-5 -top-8 size-24 rounded-full border-[12px] border-white/10" />
                <div className="relative flex items-center gap-3">
                  <Avatar className="size-11 border-2 border-white/60 shadow-md">
                    {user?.avatar && <AvatarImage src={user.avatar} alt={user?.name || 'User'} />}
                    <AvatarFallback className="bg-white text-xs font-bold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{user?.name}</p>
                    <p className="truncate text-[11px] font-normal text-white/75">{user?.email}</p>
                    <Badge className="mt-1 h-4 border border-white/20 bg-white/15 px-1.5 text-[9px] font-semibold text-white hover:bg-white/15">
                      {roleBadge}
                    </Badge>
                  </div>
                </div>
              </DropdownMenuLabel>
              <div className="bg-gradient-to-br from-primary/[0.025] via-popover to-sky-500/[0.045] p-1.5">
                <DropdownMenuItem onClick={() => setShowProfileDialog(true)} className="group cursor-pointer gap-3 rounded-lg px-2.5 py-2 focus:bg-sky-50 dark:focus:bg-sky-500/10">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm transition-transform group-hover:scale-105">
                    <User className="size-4 text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">My Profile</p>
                    <p className="text-[10px] text-muted-foreground">Photo, name and password</p>
                  </div>
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuItem onClick={handleLogout} className="group cursor-pointer gap-3 rounded-lg px-2.5 py-2 text-destructive focus:bg-red-50 focus:text-destructive dark:focus:bg-red-500/10">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-sm transition-transform group-hover:scale-105">
                    <LogOut className="size-4 text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Sign Out</p>
                    <p className="text-[10px] text-muted-foreground">End this session securely</p>
                  </div>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <AppSidebar />

        <main className="flex-1 min-w-0 overflow-y-auto flex flex-col bg-brand-page">
          {/* Sticky Quick Access Menubar */}
          {!hideStickyQuickMenu && visibleItems.length > 0 && (
            <div className="no-scrollbar sticky top-0 z-20 flex h-10 shrink-0 items-center overflow-x-auto overflow-y-hidden bg-card/90 px-4 shadow-[0_4px_12px_-8px_color-mix(in_oklab,var(--primary),transparent_45%)] backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-gradient-to-r after:from-sky-400/60 after:via-primary/75 after:to-violet-400/60 after:content-[''] lg:px-6">
              <div className="flex items-center gap-2 sm:gap-4 text-[13px] font-medium py-1">
                {visibleItems.map((item) => {
                  const tone = quickMenuTone(item.label)
                  if (item.type === 'dropdown') {
                    const isDropdownActive = item.children.some(child => child.href === activeQuickHref)
                    return (
                      <DropdownMenu key={item.label}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              'group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium tracking-wide text-muted-foreground/90 transition-all duration-200',
                              tone.hover,
                              isDropdownActive && `font-semibold ${tone.active}`,
                            )}
                          >
                            <span className={cn(
                              'flex size-6 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-105',
                              isDropdownActive ? tone.activeIcon : tone.icon,
                            )}>
                              <item.icon className="size-3.5" stroke="currentColor" fill="none" />
                            </span>
                            <span>{item.label}</span>
                            <ChevronDown className="size-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          sideOffset={6}
                          className={cn(
                            'w-[var(--radix-dropdown-menu-trigger-width)] min-w-0 overflow-hidden rounded-lg border p-1 shadow-xl backdrop-blur-md',
                            item.label === 'Attendance' && 'border-rose-200/80 bg-gradient-to-br from-popover via-popover to-rose-50 dark:border-rose-500/25 dark:to-rose-500/10',
                            item.label === 'Account Reports' && 'border-indigo-200/80 bg-gradient-to-br from-popover via-popover to-indigo-50 dark:border-indigo-500/25 dark:to-indigo-500/10',
                          )}
                        >
                          {item.children.map((child) => {
                            const isChildActive = child.href === activeQuickHref
                            const ChildIcon = child.icon
                            const childTone = tone
                            return (
                              <DropdownMenuItem key={child.label} asChild className="rounded-lg p-0 focus:bg-transparent">
                                <Link
                                  href={child.href}
                                  className={cn(
                                    'group relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-all',
                                    !isChildActive && 'text-popover-foreground/80 hover:bg-background/70 hover:text-popover-foreground',
                                    isChildActive && `font-semibold shadow-sm ${childTone.active}`,
                                  )}
                                >
                                  {isChildActive && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-current" />}
                                  {ChildIcon && (
                                    <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-105', isChildActive ? childTone.activeIcon : childTone.icon)}>
                                      <ChildIcon className={cn('size-3.5', isChildActive && 'text-white')} />
                                    </span>
                                  )}
                                  <span className="flex-1">{child.label}</span>
                                  {isChildActive && <CheckCircle2 className="size-3 opacity-70" />}
                                </Link>
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  }

                  const isActive = item.href === activeQuickHref
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        'group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium tracking-wide text-muted-foreground/90 transition-all duration-200',
                        tone.hover,
                        isActive && `font-semibold ${tone.active}`,
                      )}
                    >
                      <span className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-105',
                        isActive ? tone.activeIcon : tone.icon,
                      )}>
                        <item.icon className="size-3.5" stroke="currentColor" fill="none" />
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
          <PlatformAnnouncementBanner />
          <ImpersonationBanner />
          <PastYearGlobalBanner />
          <div className="flex-1 p-4 lg:p-6">
            {/* Plain wrapper — AnimatePresence+motion around {children} crashed
                with "Cannot read properties of null (reading 'removeChild')"
                on Next.js 16 / React 19 / framer-motion 12, because the App
                Router swaps children before framer-motion finishes its exit
                cleanup. */}
            <div key={pathname} className="page-transition">
              {children}
            </div>
          </div>

          <footer className="shrink-0 border-t py-3 px-4 text-center text-xs text-muted-foreground bg-card">
            © {new Date().getFullYear()} Vidhyalayam — School Management System
          </footer>
        </main>
      </div>

      <ChatbotWidget />

      <Dialog open={showProfileDialog} onOpenChange={(open) => {
        setShowProfileDialog(open)
        if (open) {
          setProfileName(user?.name || '')
        }
        if (!open) {
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
        }
      }}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <User className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">My Profile</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Manage your account details and security.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div aria-hidden className="absolute -bottom-10 left-12 size-24 rounded-full bg-violet-200/30 blur-xl dark:bg-violet-500/10" />
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => handleAvatarSelect(event.target.files?.[0])}
              />
              <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <div className="relative shrink-0">
                  <Avatar className="size-24 border-4 border-white shadow-xl ring-4 ring-sky-200/70 dark:border-card dark:ring-sky-500/25">
                    {user?.avatar && <AvatarImage src={user.avatar} alt={user?.name || 'User'} />}
                    <AvatarFallback className="bg-gradient-to-br from-primary via-teal-500 to-cyan-600 text-2xl font-bold text-white">{initials}</AvatarFallback>
                  </Avatar>
                  {savingAvatar && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                      <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div>
                    <p className="truncate text-lg font-bold">{user?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <div className="grid gap-2 text-left sm:grid-cols-3">
                    <div className="rounded-lg border border-sky-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-sky-500/20 dark:bg-background/35">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300">
                        <ShieldCheck className="size-3" />
                        Role
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold">{roleBadge}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-emerald-500/20 dark:bg-background/35">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="size-3" />
                        Status
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold">Active account</p>
                    </div>
                    <div className="rounded-lg border border-violet-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-violet-500/20 dark:bg-background/35">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-violet-700 dark:text-violet-300">
                        <Mail className="size-3" />
                        Email
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold">{user?.email || '-'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-sky-200 bg-white text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-50 dark:border-sky-500/25 dark:bg-input/30 dark:text-sky-300"
                      disabled={savingAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <ImagePlus className="size-3.5" />
                      {user?.avatar ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                    {user?.avatar && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs font-semibold text-destructive hover:bg-red-50 hover:text-destructive dark:hover:bg-red-500/10"
                        disabled={savingAvatar}
                        onClick={handleAvatarRemove}
                      >
                        <Trash2 className="size-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <p className="relative mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground sm:justify-start sm:text-left">
                <Sparkles className="size-3 text-sky-500" />
                JPG, PNG, or WebP up to 200 KB. Larger images are compressed automatically.
              </p>
            </section>

            <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm"><User className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Display Name</h3><p className="text-[10px] text-muted-foreground">Shown across your school account</p></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name" className="text-xs">Full Name</Label>
                  <Input
                    id="profile-name"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder="Enter your name"
                    maxLength={80}
                    autoComplete="name"
                    className="h-9 bg-white dark:bg-input/30"
                  />
                </div>
                <Button
                  onClick={handleNameSave}
                  disabled={savingName || profileName.trim().length < 2 || profileName.trim() === (user?.name || '')}
                  className="h-9 gap-1.5 px-3 text-xs sm:w-auto"
                >
                  {savingName && <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {savingName ? 'Saving...' : 'Update Name'}
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><Lock className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Change Password</h3><p className="text-[10px] text-muted-foreground">Use at least 6 characters</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="profile-current-password" className="text-xs">Current Password</Label>
                  <Input
                    id="profile-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    className="h-9 bg-white dark:bg-input/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-new-password" className="text-xs">New Password</Label>
                  <Input
                    id="profile-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    className="h-9 bg-white dark:bg-input/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-confirm-password" className="text-xs">Confirm Password</Label>
                  <Input
                    id="profile-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="h-9 bg-white dark:bg-input/30"
                  />
                </div>
                <Button
                  onClick={handleRequiredPasswordChange}
                  disabled={changingPassword}
                  className="h-9 gap-1.5 text-xs sm:col-span-2"
                >
                  {changingPassword && <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {changingPassword ? 'Saving...' : 'Update Password'}
                </Button>
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setShowProfileDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!user?.mustChangePassword}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              You logged in with a generated password. Set a new password before continuing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="required-current-password">Current Password</Label>
              <Input
                id="required-current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="required-new-password">New Password</Label>
              <Input
                id="required-new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="required-confirm-password">Confirm New Password</Label>
              <Input
                id="required-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleRequiredPasswordChange}
              disabled={changingPassword}
              className="w-full sm:w-auto"
            >
              {changingPassword ? 'Saving...' : 'Change Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
