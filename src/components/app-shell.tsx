'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useAppStore, type PageName, type User as StoreUser } from '@/lib/store'
import { AppSidebar, MENUS } from './app-sidebar'
import { isPageVisible } from '@/lib/permission-mappings'
import { SCHOOL_THEME_VARIABLE_NAMES, findDashboardFont, getSchoolThemeVariables, getSuperAdminThemeVariables } from '@/lib/theme-palettes'
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
import { Sun, Moon, Bell, LogOut, User, PanelLeftOpen, Search, ArrowRight, Lock, Sunrise, Sunset, MoonStar, ImagePlus, Trash2 } from 'lucide-react'
import { AcademicYearSwitcher } from '@/components/academic-year-switcher'
import { resolveMigratedUrl } from '@/lib/migrated-routes'

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
  { label: 'Teachers', page: 'teachers', keywords: ['staff', 'faculty', 'educator'] },
  { label: 'Add Teacher', page: 'add-teacher', keywords: ['new teacher', 'create teacher', 'add faculty', 'add educator'] },
  { label: 'Parents', page: 'parents', keywords: ['mother', 'father'] },
  { label: 'New Admission Form', page: 'admission-form', keywords: ['apply', 'enroll form', 'register student'] },
  { label: 'Mark Attendance', page: 'mark-attendance', keywords: ['present', 'absent', 'daily', 'mark attendance'] },
  { label: 'View Attendance', page: 'view-attendance', keywords: ['attendance report', 'view attendance', 'attendance records'] },
  { label: 'Fee Heads', page: 'fees-heads', keywords: ['fee type', 'tuition', 'charge'] },
  { label: 'Fee Groups', page: 'fees-groups', keywords: ['fee category', 'group fees'] },
  { label: 'Fee Structures', page: 'fees-structures', keywords: ['fee plan', 'class fees', 'amount'] },
  { label: 'Fee Collections', page: 'fee-collections', keywords: ['payment', 'collect', 'receipt', 'pay'] },
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
  { label: 'Petty Cash', page: 'petty-cash', keywords: ['expense', 'small payment', 'cash'] },
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

function UniversalSearch() {
  const router = useRouter()
  const { user, permissions, permissionsLoaded } = useAppStore()
  const role = user?.role || 'SCHOOL_ADMIN'
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const results = query.trim()
    ? SEARCH_ITEMS.filter(item => {
        if (!allowedPages.has(item.page)) return false
        if (!isPageVisible(item.page, permissions, role, permissionsLoaded)) return false
        const q = query.toLowerCase()
        return (
          item.label.toLowerCase().includes(q) ||
          item.keywords.some(k => k.includes(q)) ||
          item.page.toLowerCase().includes(q)
        )
      })
    : []

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
    setSelectedIndex(0)
    inputRef.current?.blur()
    const url = resolveMigratedUrl(page)
    if (url) router.push(url)
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
    <div className="relative min-w-0 flex-1 max-w-64 lg:max-w-72">
      <div className="relative flex items-center">
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

function getTimeGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return { label: 'Good morning', Icon: Sunrise }
  if (hour >= 12 && hour < 17) return { label: 'Good afternoon', Icon: Sun }
  if (hour >= 17 && hour < 21) return { label: 'Good evening', Icon: Sunset }
  return { label: 'Good night', Icon: MoonStar }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, currentSchool, logout, sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapse, isAuthenticated } = useAppStore()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { toast } = useToast()
  const [unreadCount, setUnreadCount] = useState(0)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours())
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)
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

  const handleBellClick = useCallback(() => {
    setUnreadCount(0)
    router.push('/notifications')
  }, [router])

  const roleBadge = user?.role?.replace('_', ' ') || 'User'
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'User'
  const displayName = `Dear ${firstName}`
  const timeGreeting = getTimeGreeting(currentHour)
  const GreetingIcon = timeGreeting.Icon
  const isDarkTheme = resolvedTheme === 'dark' || theme === 'dark'
  const schoolThemeStyle = useMemo(
    () => user?.role === 'SUPER_ADMIN'
      ? getSuperAdminThemeVariables(isDarkTheme)
      : getSchoolThemeVariables(currentSchool?.primaryColor, isDarkTheme),
    [user?.role, currentSchool?.primaryColor, isDarkTheme]
  )
  const dashboardFont = useMemo(
    () => findDashboardFont(currentSchool?.dashboardFont),
    [currentSchool?.dashboardFont]
  )

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

  useEffect(() => {
    document.body.style.fontFamily = dashboardFont.stack
    document.documentElement.style.setProperty('--font-sans', dashboardFont.stack)

    return () => {
      document.body.style.removeProperty('font-family')
      document.documentElement.style.removeProperty('--font-sans')
    }
  }, [dashboardFont.stack])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/school/notifications?limit=1', {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setUnreadCount(data.unreadCount || 0)
        }
      } catch {
        // Silently ignore
      }
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

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
          // Non-fatal: the in-memory user is already updated.
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
            // Non-fatal
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
            // Non-fatal
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

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background font-sans" style={schoolThemeStyle}>
      <header className="shrink-0 flex h-14 items-center gap-3 border-b border-primary/30 bg-primary text-primary-foreground shadow-sm px-3 lg:px-4 z-30 dark:border-sidebar-border dark:bg-sidebar dark:text-sidebar-foreground">
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

        <div className="hidden min-w-0 shrink-0 md:flex">
          <div className="group flex h-9 max-w-[280px] items-center gap-2 rounded-lg border border-primary-foreground/20 bg-gradient-to-r from-primary-foreground/15 to-primary-foreground/7 px-2.5 shadow-sm shadow-black/5 backdrop-blur dark:border-sidebar-border dark:from-sidebar-accent/80 dark:to-sidebar-accent/45">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary-foreground/15 bg-primary-foreground/15 text-primary-foreground shadow-inner dark:border-sidebar-border dark:bg-sidebar-primary/25 dark:text-sidebar-foreground">
              <GreetingIcon className="size-3.5" />
            </span>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[11px] font-medium text-primary-foreground/70 dark:text-sidebar-foreground/60">
                {timeGreeting.label}
              </span>
              <span className="size-1 shrink-0 rounded-full bg-primary-foreground/45 dark:bg-sidebar-foreground/35" />
              <span className="truncate text-xs font-semibold text-primary-foreground dark:text-sidebar-foreground">
                {displayName}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <AcademicYearSwitcher />

          <Button variant="ghost" size="icon" className="size-9 relative text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground" onClick={handleBellClick}>
            <Bell className="size-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

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
                <div className="hidden sm:flex flex-col items-start">
                  <span className="text-xs font-medium leading-tight">{user?.name}</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 leading-none bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/15 dark:bg-sidebar-accent dark:text-sidebar-foreground">
                    {roleBadge}
                  </Badge>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowProfileDialog(true)}>
                <User className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <AppSidebar />

        <main className="flex-1 min-w-0 overflow-y-auto flex flex-col">
          <PastYearGlobalBanner />
          <div className="flex-1 p-4 lg:p-6">
            {/* Plain wrapper — AnimatePresence+motion around {children} crashed
                with "Cannot read properties of null (reading 'removeChild')"
                on Next.js 16 / React 19 / framer-motion 12, because the App
                Router swaps children before framer-motion finishes its exit
                cleanup. */}
            <div key={pathname}>
              {children}
            </div>
          </div>

          <footer className="shrink-0 border-t py-3 px-4 text-center text-xs text-muted-foreground bg-card">
            © {new Date().getFullYear()} Vidhyalayam — School Management System
          </footer>
        </main>
      </div>

      <Dialog open={showProfileDialog} onOpenChange={(open) => {
        setShowProfileDialog(open)
        if (!open) {
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="size-4" />
              My Profile
            </DialogTitle>
            <DialogDescription>
              Update your profile photo and password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Profile Photo</h3>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => handleAvatarSelect(event.target.files?.[0])}
              />
              <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3">
                <Avatar className="size-16">
                  {user?.avatar && <AvatarImage src={user.avatar} alt={user?.name || 'User'} />}
                  <AvatarFallback className="text-base">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="truncate text-sm font-medium">{user?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
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
                        className="h-8 gap-1.5 text-destructive hover:text-destructive"
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
              <p className="text-[11px] text-muted-foreground">
                JPG, PNG, or WebP up to 200 KB. Larger images are compressed automatically.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="size-3.5" />
                Change Password
              </h3>
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-current-password">Current Password</Label>
                  <Input
                    id="profile-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-new-password">New Password</Label>
                  <Input
                    id="profile-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-confirm-password">Confirm New Password</Label>
                  <Input
                    id="profile-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  onClick={handleRequiredPasswordChange}
                  disabled={changingPassword}
                  className="w-full"
                >
                  {changingPassword ? 'Saving...' : 'Update Password'}
                </Button>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
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
