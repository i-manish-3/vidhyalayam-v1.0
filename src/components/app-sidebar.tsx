'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { useAppStore, type PageName } from '@/lib/store'
import { isPageVisible } from '@/lib/permission-mappings'
import { resolveMigratedUrl } from '@/lib/migrated-routes'
import { usePlatformLogo } from '@/hooks/use-platform-branding'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  LayoutDashboard,
  School,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  ClipboardList,
  Receipt,
  ReceiptText,
  DollarSign,
  Bus,
  Library,
  Package,
  Wallet,
  Bell,
  Megaphone,
  Settings,
  BarChart3,
  Headphones,
  ChevronDown,
  X,
  PlusCircle,
  UserPlus,
  UserCheck,
  IndianRupee,
  FileText,
  Award,
  Baby,
  BookOpenCheck,
  TrendingUp,
  Layers,
  ListOrdered,
  ClipboardCheck,
  Shield,
  ShieldCheck,
  Mail,
  Quote,
  CreditCard,
  UsersRound,
  LayoutTemplate,
  IdCard,
  Printer,
  RefreshCw,
  Upload,
  History,
  CalendarDays,
  FileSpreadsheet,
  Fingerprint,
  ScanLine,
  RadioTower,
  Building2,
  ShoppingCart,
  DatabaseBackup,
  Palette,
  Home,
  Trash2,
} from 'lucide-react'

export interface MenuChild {
  label: string
  page: PageName
  icon: React.ElementType
  children?: MenuChild[]
}

export interface MenuItem {
  label: string
  page: PageName
  icon: React.ElementType
  children?: MenuChild[]
}

type SidebarMenuEntry = MenuItem | MenuChild

const PREFERRED_MENU_ORDER = new Map<string, number>([
  ['Dashboard', 0],
  ['Students', 1],
  ['Academics', 2],
  ['Fees', 3],
  ['Transport', 4],
  ['Hostel', 5],
  ['Exams', 6],
  ['Inventory', 7],
  ['Teachers', 8],
  ['Staff', 9],
  ['Salary', 10],
  ['Parents', 11],
  ['Library', 12],
])

export const MENUS: Record<string, MenuItem[]> = {
  SUPER_ADMIN: [
    { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
    { label: 'Schools', page: 'schools', icon: School },
    { label: 'Permissions', page: 'super-admin-permissions', icon: Shield },
    { label: 'Roles', page: 'super-admin-roles', icon: ShieldCheck },
    { label: 'Contact Requests', page: 'contact-requests', icon: Mail },
    { label: 'Broadcasts', page: 'platform-announcements', icon: Megaphone },
    { label: 'Data Exports', page: 'tenant-exports', icon: DatabaseBackup },
    { label: 'Student Wipe', page: 'student-wipe', icon: Trash2 },
    { label: 'Branding', page: 'platform-branding', icon: Palette },
    {
      label: 'Landing Page',
      page: 'testimonials',
      icon: LayoutTemplate,
      children: [
        { label: 'Testimonials', page: 'testimonials', icon: Quote },
        { label: 'Pricing Plans', page: 'pricing-plans', icon: CreditCard },
        { label: 'Team Members', page: 'team-members', icon: UsersRound },
      ],
    },
    { label: 'Support Tickets', page: 'support', icon: Headphones },
  ],
  SCHOOL_ADMIN: [
    { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
    {
      label: 'Students',
      page: 'students',
      icon: GraduationCap,
      children: [
        { label: 'Add New Admission', page: 'admission-form', icon: UserPlus },
        { label: 'Bulk Admission', page: 'bulk-admission', icon: Upload },
        { label: 'Student List', page: 'students', icon: Users },
        { label: 'Student Houses', page: 'student-houses', icon: Home },
        { label: 'Alumni', page: 'alumni', icon: GraduationCap },
      ],
    },
    {
      label: 'Academics',
      page: 'subjects',
      icon: GraduationCap,
      children: [
        {
          label: 'Subject',
          page: 'subjects',
          icon: BookOpenCheck,
          children: [
            { label: 'Add Subject', page: 'add-subject', icon: PlusCircle },
            { label: 'Subject List', page: 'subjects', icon: BookOpenCheck },
          ],
        },
        {
          label: 'Class',
          page: 'classes',
          icon: Layers,
          children: [
            { label: 'Add Class', page: 'add-class', icon: PlusCircle },
            { label: 'Class List', page: 'classes', icon: Layers },
            { label: 'Promote Student', page: 'promote-student', icon: TrendingUp },
            { label: 'Assign Roll No', page: 'assign-roll-numbers', icon: ListOrdered },
          ],
        },
        { label: 'Timetable', page: 'timetable', icon: Calendar },
        {
          label: 'Attendance',
          page: 'mark-attendance',
          icon: ClipboardCheck,
          children: [
            { label: 'Mark Attendance', page: 'mark-attendance', icon: ClipboardCheck },
            { label: 'View Attendance', page: 'view-attendance', icon: ClipboardList },
            { label: 'Employee Attendance', page: 'employee-attendance', icon: UsersRound },
            { label: 'RFID Kiosk', page: 'attendance-kiosk', icon: ScanLine },
            { label: 'Assign Cards', page: 'rfid-card-assign', icon: CreditCard },
            { label: 'Credentials', page: 'attendance-credentials', icon: Fingerprint },
            { label: 'Reader Devices', page: 'rfid-devices', icon: RadioTower },
            { label: 'Reports', page: 'attendance-reports', icon: BarChart3 },
          ],
        },
      ],
    },
    {
      label: 'Fees',
      page: 'fee-collections',
      icon: Receipt,
      children: [
        { label: 'Fee Heads', page: 'fees-heads', icon: IndianRupee },
        { label: 'Fee Groups', page: 'fees-groups', icon: Layers },
        { label: 'Fee Structures', page: 'fees-structures', icon: FileText },
        { label: 'Fee Collections', page: 'fee-collections', icon: DollarSign },
        { label: 'Fee Receipts', page: 'fee-list', icon: ReceiptText },
        { label: 'Demand Slips', page: 'fee-demand-slips', icon: FileSpreadsheet },
        { label: 'Change Fee Group', page: 'fee-change-group', icon: RefreshCw },
        { label: 'Reports', page: 'fee-reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Teachers',
      page: 'teachers',
      icon: BookOpen,
      children: [
        { label: 'Add Teacher', page: 'add-teacher', icon: UserPlus },
        { label: 'Teacher List', page: 'teachers', icon: BookOpen },
      ],
    },
    { label: 'Parents', page: 'parents', icon: Users },
    {
      label: 'Salary',
      page: 'salary',
      icon: Wallet,
      children: [
        { label: 'Salary Structure', page: 'salary-structure', icon: FileText },
        { label: 'Salary Payments', page: 'salary-payments', icon: DollarSign },
        { label: 'Run Payroll', page: 'salary-payroll', icon: Receipt },
        { label: 'Advance Requests', page: 'salary-advance', icon: TrendingUp },
        { label: 'Reports', page: 'salary-reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Exams',
      page: 'exam-dashboard',
      icon: Award,
      children: [
        { label: 'Dashboard', page: 'exam-dashboard', icon: LayoutDashboard },
        { label: 'Exam List', page: 'exam-list', icon: FileText },
        { label: 'Exam Patterns', page: 'exam-paradigms', icon: Layers },
        { label: 'Grade Scales', page: 'exam-grade-scales', icon: Award },
        { label: 'Report Card Templates', page: 'exam-report-card-templates', icon: LayoutTemplate },
        { label: 'Published Results', page: 'exam-published-results', icon: BarChart3 },
        { label: 'Audit Log', page: 'exam-audit-log', icon: History },
      ],
    },
    {
      label: 'Transport',
      page: 'transport',
      icon: Bus,
      children: [
        {
          label: 'Routes',
          page: 'transport',
          icon: Bus,
          children: [
            { label: 'Create Route', page: 'add-transport-route', icon: PlusCircle },
            { label: 'Route List', page: 'transport', icon: Bus },
            { label: 'Annual Setup', page: 'transport-annual-setup', icon: RefreshCw },
          ],
        },
        {
          label: 'Drivers',
          page: 'drivers',
          icon: UserCheck,
          children: [
            { label: 'Add Driver', page: 'add-driver', icon: UserPlus },
            { label: 'Driver Directory', page: 'drivers', icon: UserCheck },
          ],
        },
      ],
    },
    {
      label: 'Hostel',
      page: 'hostel',
      icon: Building2,
      children: [
        { label: 'Add Hostel', page: 'add-hostel', icon: PlusCircle },
        { label: 'Hostel List', page: 'hostel', icon: Building2 },
        { label: 'Annual Setup', page: 'hostel-annual-setup', icon: RefreshCw },
      ],
    },
    { label: 'Library', page: 'library', icon: Library },
    {
      label: 'Inventory',
      page: 'inventory',
      icon: Package,
      children: [
        { label: 'Items', page: 'inventory', icon: Package },
        { label: 'Sell to Student', page: 'inventory-sell', icon: ShoppingCart },
        { label: 'Sales History', page: 'inventory-sales', icon: Receipt },
        { label: 'Categories', page: 'inventory-catalog', icon: Layers },
        { label: 'Reports', page: 'inventory-reports', icon: TrendingUp },
      ],
    },
    {
      label: 'ID Cards',
      page: 'id-cards',
      icon: IdCard,
      children: [
        { label: 'Overview', page: 'id-cards', icon: LayoutDashboard },
        { label: 'Templates', page: 'id-card-templates', icon: LayoutTemplate },
        { label: 'Generate Cards', page: 'id-card-generate', icon: Printer },
      ],
    },
    { label: 'Notifications', page: 'notifications', icon: Bell },
    { label: 'Announcements', page: 'announcements', icon: Megaphone },
    {
      label: 'Staff',
      page: 'staff',
      icon: Users,
      children: [
        { label: 'Create Staff', page: 'staff-create', icon: UserPlus },
        { label: 'Staff List', page: 'staff', icon: Users },
      ],
    },
    { label: 'Roles & Permissions', page: 'school-roles', icon: ShieldCheck },
    {
      label: 'Audit Logs',
      page: 'attendance-audit-log',
      icon: History,
      children: [
        { label: 'Attendance', page: 'attendance-audit-log', icon: ClipboardList },
        { label: 'RFID', page: 'rfid-audit', icon: ScanLine },
        { label: 'Fees', page: 'fee-audit-log', icon: Receipt },
      ],
    },
    {
      label: 'Academic Settings',
      page: 'academic-years',
      icon: Calendar,
      children: [
        { label: 'Academic Years', page: 'academic-years', icon: Calendar },
        { label: 'Academic Calendar', page: 'holidays', icon: CalendarDays },
      ],
    },
    { label: 'Settings', page: 'settings', icon: Settings },
    { label: 'Help & Support', page: 'support', icon: Headphones },
  ],
  TEACHER: [
    { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
    { label: 'My Classes', page: 'my-classes', icon: GraduationCap },
    {
      label: 'Attendance',
      page: 'mark-attendance',
      icon: ClipboardList,
      children: [
        { label: 'Mark Attendance', page: 'mark-attendance', icon: ClipboardCheck },
        { label: 'View Attendance', page: 'view-attendance', icon: ClipboardList },
        { label: 'Employee Attendance', page: 'employee-attendance', icon: UsersRound },
        { label: 'RFID Kiosk', page: 'attendance-kiosk', icon: ScanLine },
        { label: 'Reports', page: 'attendance-reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Audit Logs',
      page: 'attendance-audit-log',
      icon: History,
      children: [
        { label: 'Attendance', page: 'attendance-audit-log', icon: ClipboardList },
      ],
    },
    { label: 'Timetable', page: 'timetable', icon: Calendar },
    {
      label: 'Exams',
      page: 'exam-list',
      icon: Award,
      children: [
        { label: 'Exam List', page: 'exam-list', icon: FileText },
        { label: 'Enter Marks', page: 'exam-marks-entry', icon: ClipboardCheck },
        { label: 'Results', page: 'exam-result-preview', icon: BarChart3 },
      ],
    },
    { label: 'Library', page: 'library', icon: Library },
    { label: 'Salary', page: 'salary', icon: Wallet },
    { label: 'Notifications', page: 'notifications', icon: Bell },
  ],
  STUDENT: [
    { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
    { label: 'My Attendance', page: 'my-attendance', icon: ClipboardList },
    { label: 'Fees', page: 'fee-collections', icon: Receipt },
    { label: 'Timetable', page: 'timetable', icon: Calendar },
    { label: 'Exam Results', page: 'exam-results', icon: Award },
    { label: 'Library', page: 'library', icon: Library },
    { label: 'Notifications', page: 'notifications', icon: Bell },
  ],
  PARENT: [
    { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
    { label: 'My Children', page: 'parent-children', icon: Baby },
    { label: 'Fee Details', page: 'parent-fees', icon: Receipt },
    { label: 'Attendance', page: 'parent-attendance', icon: UserCheck },
    { label: 'Exams', page: 'parent-exams', icon: Award },
    { label: 'Notifications', page: 'notifications', icon: Bell },
  ],
  STAFF: [
    { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
    { label: 'Students', page: 'students', icon: GraduationCap },
    {
      label: 'Attendance',
      page: 'mark-attendance',
      icon: ClipboardList,
      children: [
        { label: 'Mark Attendance', page: 'mark-attendance', icon: ClipboardCheck },
        { label: 'View Attendance', page: 'view-attendance', icon: ClipboardList },
        { label: 'Employee Attendance', page: 'employee-attendance', icon: UsersRound },
      ],
    },
    {
      label: 'Fees',
      page: 'fee-collections',
      icon: Receipt,
      children: [
        { label: 'Fee Heads', page: 'fees-heads', icon: IndianRupee },
        { label: 'Fee Groups', page: 'fees-groups', icon: Layers },
        { label: 'Fee Structures', page: 'fees-structures', icon: FileText },
        { label: 'Fee Collections', page: 'fee-collections', icon: DollarSign },
        { label: 'Fee Receipts', page: 'fee-list', icon: ReceiptText },
        { label: 'Demand Slips', page: 'fee-demand-slips', icon: FileSpreadsheet },
        { label: 'Change Fee Group', page: 'fee-change-group', icon: RefreshCw },
        { label: 'Reports', page: 'fee-reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Salary',
      page: 'salary',
      icon: Wallet,
      children: [
        { label: 'Salary Structure', page: 'salary-structure', icon: FileText },
        { label: 'Salary Payments', page: 'salary-payments', icon: DollarSign },
        { label: 'Run Payroll', page: 'salary-payroll', icon: Receipt },
        { label: 'Advance Requests', page: 'salary-advance', icon: TrendingUp },
        { label: 'Reports', page: 'salary-reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Transport',
      page: 'transport',
      icon: Bus,
      children: [
        {
          label: 'Routes',
          page: 'transport',
          icon: Bus,
          children: [
            { label: 'Create Route', page: 'add-transport-route', icon: PlusCircle },
            { label: 'Route List', page: 'transport', icon: Bus },
            { label: 'Annual Setup', page: 'transport-annual-setup', icon: RefreshCw },
          ],
        },
        {
          label: 'Drivers',
          page: 'drivers',
          icon: UserCheck,
          children: [
            { label: 'Add Driver', page: 'add-driver', icon: UserPlus },
            { label: 'Driver Directory', page: 'drivers', icon: UserCheck },
          ],
        },
      ],
    },
    {
      label: 'Hostel',
      page: 'hostel',
      icon: Building2,
      children: [
        { label: 'Add Hostel', page: 'add-hostel', icon: PlusCircle },
        { label: 'Hostel List', page: 'hostel', icon: Building2 },
        { label: 'Annual Setup', page: 'hostel-annual-setup', icon: RefreshCw },
      ],
    },
    { label: 'Library', page: 'library', icon: Library },
    {
      label: 'Inventory',
      page: 'inventory',
      icon: Package,
      children: [
        { label: 'Items', page: 'inventory', icon: Package },
        { label: 'Sell to Student', page: 'inventory-sell', icon: ShoppingCart },
        { label: 'Sales History', page: 'inventory-sales', icon: Receipt },
        { label: 'Categories', page: 'inventory-catalog', icon: Layers },
        { label: 'Reports', page: 'inventory-reports', icon: TrendingUp },
      ],
    },
    { label: 'Notifications', page: 'notifications', icon: Bell },
    { label: 'Announcements', page: 'announcements', icon: Megaphone },
  ],
}

function isPageActiveOnPath(page: PageName, pathname: string, exact = false): boolean {
  const url = resolveMigratedUrl(page)
  if (!url) return false
  if (exact) return pathname === url
  // Exact match OR pathname is a sub-route of this URL (covers e.g. /students/[id]
  // matching the "Students" menu item, /academics/classes/new matching "Classes").
  return pathname === url || pathname.startsWith(url + '/')
}

function hasActiveDescendant(item: MenuChild, pathname: string): boolean {
  if (isPageActiveOnPath(item.page, pathname)) return true
  if (item.children) return item.children.some(child => hasActiveDescendant(child, pathname))
  return false
}

function collectPages(item: MenuChild | MenuItem): PageName[] {
  const pages: PageName[] = [item.page]
  if (item.children) {
    for (const child of item.children) {
      pages.push(...collectPages(child))
    }
  }
  return pages
}

function filterChildren(children: MenuChild[], permissions: string[], role: string, permissionsLoaded: boolean): MenuChild[] {
  return children
    .filter(child => {
      if (role === 'SUPER_ADMIN') return true
      if (child.children && child.children.length > 0) {
        return child.children.some(gc => isPageVisible(gc.page, permissions, role, permissionsLoaded))
      }
      return isPageVisible(child.page, permissions, role, permissionsLoaded)
    })
    .map(child => {
      if (child.children) {
        return {
          ...child,
          children: child.children.filter(gc => isPageVisible(gc.page, permissions, role, permissionsLoaded)),
        }
      }
      return child
    })
}

function orderTopLevelMenus(items: MenuItem[]): MenuItem[] {
  return items
    .map((item, index) => ({
      item,
      index,
      order: PREFERRED_MENU_ORDER.get(item.label) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ item }) => item)
}

function getSidebarItemKey(item: SidebarMenuEntry, parentKey = ''): string {
  return `${parentKey}/${item.label}-${item.page}`
}

function collectOpenKeysForPath(items: SidebarMenuEntry[], path: string, parentKey = ''): string[] {
  return items.flatMap((item) => {
    if (!item.children?.length) return []

    const itemKey = getSidebarItemKey(item, parentKey)
    const childKeys = collectOpenKeysForPath(item.children, path, itemKey)
    const isActiveBranch = isPageActiveOnPath(item.page, path) ||
      item.children.some((child) => hasActiveDescendant(child, path))

    return isActiveBranch ? [itemKey, ...childKeys] : []
  })
}

export function AppSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, currentSchool, sidebarOpen, setSidebarOpen, sidebarCollapsed, permissions, permissionsLoaded } = useAppStore()
  const [openMenuKeys, setOpenMenuKeys] = useState<Set<string>>(() => new Set())
  const [hasMenuInteraction, setHasMenuInteraction] = useState(false)
  const [flyoutMenu, setFlyoutMenu] = useState<string | null>(null)
  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 })
  const flyoutTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const platformLogo = usePlatformLogo()
  const role = user?.role || 'SCHOOL_ADMIN' as const
  const isImpersonating = role === 'SUPER_ADMIN' && !!user?.impersonatingSchoolId
  const effectiveRole = isImpersonating ? 'SCHOOL_ADMIN' : role
  const isPlatformView = role === 'SUPER_ADMIN' && !isImpersonating
  const schoolDisplayName = isPlatformView
    ? 'Vidhyalayam'
    : currentSchool?.name || 'Vidhyalayam'
  const schoolSubLabel = isPlatformView
    ? 'Platform Admin'
    : ''
  // In the platform (super-admin) view show the configurable platform logo;
  // otherwise the school's own logo.
  const schoolLogo = isPlatformView ? (platformLogo || undefined) : currentSchool?.logo

  const menus = useMemo(() => {
    const roleMenus = MENUS[effectiveRole] || MENUS.SCHOOL_ADMIN
    if (!MENUS[effectiveRole]) {
      console.warn(`No menu configuration found for role: ${effectiveRole}, falling back to SCHOOL_ADMIN`)
    }
    const visibleMenus = roleMenus.filter(item => {
      if (effectiveRole === 'SUPER_ADMIN') return true
      if (item.children && item.children.length > 0) {
        return collectPages(item).some(p => isPageVisible(p, permissions, effectiveRole, permissionsLoaded))
      }
      return isPageVisible(item.page, permissions, effectiveRole, permissionsLoaded)
    }).map(item => {
      if (item.children) {
        return { ...item, children: filterChildren(item.children, permissions, effectiveRole, permissionsLoaded) }
      }
      return item
    })

    return orderTopLevelMenus(visibleMenus)
  }, [effectiveRole, permissions, permissionsLoaded])

  const isCollapsed = sidebarCollapsed

  const handleNavigate = (page: PageName) => {
    const url = resolveMigratedUrl(page)
    if (url) {
      setHasMenuInteraction(true)
      setOpenMenuKeys(new Set(collectOpenKeysForPath(menus, url)))
      router.push(url)
    }
    setFlyoutMenu(null)
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }

  const toggleMenuKey = (key: string, depth: number) => {
    setHasMenuInteraction(true)
    setOpenMenuKeys((prev) => {
      const isOpen = prev.has(key)

      if (isOpen) {
        const next = new Set(prev)
        next.forEach((openKey) => {
          if (openKey === key || openKey.startsWith(`${key}/`)) next.delete(openKey)
        })
        return next
      }

      if (depth === 0) {
        return new Set([key])
      }

      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  const openFlyout = useCallback((label: string, buttonEl: HTMLButtonElement) => {
    if (flyoutTimeoutRef.current) {
      clearTimeout(flyoutTimeoutRef.current)
      flyoutTimeoutRef.current = null
    }
    const rect = buttonEl.getBoundingClientRect()
    setFlyoutPos({ top: rect.top, left: rect.right + 8 })
    setFlyoutMenu(label)
  }, [])

  const closeFlyout = useCallback(() => {
    setFlyoutMenu(null)
  }, [])

  const closeFlyoutDelayed = useCallback(() => {
    flyoutTimeoutRef.current = setTimeout(() => {
      setFlyoutMenu(null)
    }, 300)
  }, [])

  const cancelFlyoutClose = useCallback(() => {
    if (flyoutTimeoutRef.current) {
      clearTimeout(flyoutTimeoutRef.current)
      flyoutTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-flyout]') || target.closest('[data-flyout-trigger]')) return
      if (flyoutMenu) setFlyoutMenu(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [flyoutMenu])

  const flyoutItem = flyoutMenu ? menus.find(m => m.label === flyoutMenu && m.children && m.children.length > 0) : null

  const renderExpandedItems = (items: SidebarMenuEntry[], depth = 0, parentKey = '') => {
    return items.map((item) => {
      const itemKey = getSidebarItemKey(item, parentKey)
      const Icon = item.icon
      const isActive = item.children?.length
        ? isPageActiveOnPath(item.page, pathname) || item.children.some((child) => hasActiveDescendant(child, pathname))
        : isPageActiveOnPath(item.page, pathname, true)
      const hasChildren = !!item.children?.length
      const isOpen = hasChildren && (openMenuKeys.has(itemKey) || (!hasMenuInteraction && isActive))
      const visualDepth = Math.min(depth, 1)
      const leftPadding = visualDepth === 0 ? 12 : 14

      if (hasChildren) {
        return (
          <div key={itemKey} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleMenuKey(itemKey, depth)}
              className={cn(
                'group relative flex min-h-10 w-full items-center gap-3 rounded-lg py-2.5 pr-2.5 text-sm font-semibold transition-all',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/70'
              )}
              style={{ paddingLeft: leftPadding }}
              aria-expanded={isOpen}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
              )}
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              <ChevronDown className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="mt-1 space-y-1 rounded-md border border-white/30 ml-2 p-1 bg-white/5">
                {renderExpandedItems(item.children || [], depth + 1, itemKey)}
              </div>
            )}
          </div>
        )
      }

      return (
        <button
          key={itemKey}
          type="button"
          onClick={() => handleNavigate(item.page)}
          className={cn(
            'relative flex min-h-9 w-full items-center gap-3 rounded-lg py-2 pr-2.5 text-sm font-semibold transition-all',
            isActive
              ? 'bg-sidebar-accent text-sidebar-primary shadow-sm'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/65'
          )}
          style={{ paddingLeft: leftPadding }}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
          )}
          <Icon className="size-4 shrink-0" />
          <span className="min-w-0 truncate text-left">{item.label}</span>
        </button>
      )
    })
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'shrink-0 bg-sidebar bg-brand-sidebar text-sidebar-foreground border-r border-sidebar-border z-50',
          'fixed lg:relative h-full lg:h-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'transition-[width,transform] duration-300 ease-in-out',
          isCollapsed ? 'w-[68px]' : 'w-64',
          'overflow-hidden'
        )}
      >
        <div className="flex h-screen lg:h-full flex-col">

          {/* Sidebar Header */}
          <div className={cn(
            'shrink-0 flex items-center border-b border-sidebar-border h-14 transition-[padding,gap] duration-300 ease-in-out',
            isCollapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
          )}>
            <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
              {schoolLogo ? (
                <img src={schoolLogo} alt={`${schoolDisplayName} logo`} className="size-full object-cover" />
              ) : (
                <GraduationCap className="size-4" />
              )}
            </div>
            <div className={cn(
              'flex flex-col min-w-0 transition-[opacity,max-width] duration-300 ease-in-out',
              isCollapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[200px]'
            )}>
              <span className="text-sm font-bold text-sidebar-foreground truncate">{schoolDisplayName}</span>
              {schoolSubLabel && (
                <span className="text-[10px] text-sidebar-foreground/60 truncate">{schoolSubLabel}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent lg:hidden shrink-0 ml-auto"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Sidebar Navigation */}
          <ScrollArea className="flex-1 min-h-0 overscroll-contain">
            <TooltipProvider delayDuration={0}>
              <nav className={cn('space-y-1 py-2 transition-[padding] duration-300 ease-in-out', isCollapsed ? 'px-2' : 'px-3')}>
                {isCollapsed ? menus.map((item) => {
                  const isActive = isPageActiveOnPath(item.page, pathname) ||
                    (item.children && item.children.some((child) => hasActiveDescendant(child, pathname)))

                  if (item.children && item.children.length > 0) {
                    const isFlyoutOpen = flyoutMenu === item.label
                    return (
                      <Tooltip key={item.label}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            data-flyout-trigger={item.label}
                            onClick={(e) => {
                              if (isFlyoutOpen) closeFlyout()
                              else openFlyout(item.label, e.currentTarget)
                            }}
                            onMouseEnter={(e) => openFlyout(item.label, e.currentTarget)}
                            onMouseLeave={closeFlyoutDelayed}
                            className={cn(
                              'relative flex min-h-10 w-full items-center justify-center rounded-lg py-2.5 transition-colors',
                              (isActive || isFlyoutOpen)
                                ? 'bg-sidebar-accent text-sidebar-primary shadow-sm'
                                : 'text-sidebar-foreground hover:bg-sidebar-accent/70'
                            )}
                          >
                            <item.icon className="size-5 shrink-0" />
                            {isActive && (
                              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                            )}
                            <ChevronDown className="absolute -right-0.5 bottom-1 size-2.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="font-medium">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return (
                    <Tooltip key={item.label}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleNavigate(item.page)}
                          className={cn(
                            'relative flex min-h-10 w-full items-center justify-center rounded-lg py-2.5 transition-colors',
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-primary shadow-sm'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent/70'
                          )}
                        >
                          <item.icon className="size-5 shrink-0" />
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8} className="font-medium">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  )
                }) : renderExpandedItems(menus)}
              </nav>
            </TooltipProvider>
          </ScrollArea>

        </div>
      </aside>

      {/* Flyout Popup for collapsed sidebar */}
      {isCollapsed && flyoutItem && flyoutMenu && typeof document !== 'undefined' && createPortal(
        <div
          data-flyout={flyoutMenu}
          className="fixed z-[100] min-w-[220px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl animate-in slide-in-from-left-1 fade-in duration-150"
          style={{ top: flyoutPos.top, left: flyoutPos.left }}
          onMouseEnter={cancelFlyoutClose}
          onMouseLeave={closeFlyoutDelayed}
        >
          <div className="border-b px-3 py-2">
            <p className="text-xs font-semibold">{flyoutItem.label}</p>
          </div>
          <div className="max-h-[min(70vh,560px)] overflow-y-auto py-1">
            {flyoutItem.children!.map((child) => {
              if (child.children && child.children.length > 0) {
                return (
                  <div key={child.label}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {child.label}
                    </div>
                    {child.children.map((grandChild) => (
                      <button
                        key={grandChild.page}
                        type="button"
                        onClick={() => handleNavigate(grandChild.page)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                          isPageActiveOnPath(grandChild.page, pathname, true)
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                      >
                        <grandChild.icon className="size-4 shrink-0" />
                        <span>{grandChild.label}</span>
                      </button>
                    ))}
                  </div>
                )
              }

              return (
                <button
                  key={child.page}
                  type="button"
                  onClick={() => handleNavigate(child.page)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    isPageActiveOnPath(child.page, pathname, true)
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <child.icon className="size-4 shrink-0" />
                  <span>{child.label}</span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}

      {/* Mobile menu toggle */}
      {!sidebarOpen && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 z-50 size-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 lg:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          <GraduationCap className="size-5" />
        </Button>
      )}
    </>
  )
}
