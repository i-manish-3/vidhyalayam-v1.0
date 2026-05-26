'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { useAppStore, type PageName } from '@/lib/store'
import { isPageVisible } from '@/lib/permission-mappings'
import { resolveMigratedUrl } from '@/lib/migrated-routes'
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
  ChevronLeft,
  ChevronRight,
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
  RefreshCw,
  Upload,
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

export const MENUS: Record<string, MenuItem[]> = {
  SUPER_ADMIN: [
    { label: 'Dashboard', page: 'dashboard', icon: LayoutDashboard },
    { label: 'Schools', page: 'schools', icon: School },
    { label: 'Permissions', page: 'super-admin-permissions', icon: Shield },
    { label: 'Roles', page: 'super-admin-roles', icon: ShieldCheck },
    { label: 'Contact Requests', page: 'contact-requests', icon: Mail },
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
    { label: 'Analytics', page: 'analytics', icon: BarChart3 },
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
        { label: 'Change Fee Group', page: 'fee-change-group', icon: RefreshCw },
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
        { label: 'Advance Requests', page: 'salary-advance', icon: TrendingUp },
      ],
    },
    { label: 'Exams', page: 'exams', icon: Award },
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
    { label: 'Library', page: 'library', icon: Library },
    { label: 'Inventory', page: 'inventory', icon: Package },
    { label: 'Petty Cash', page: 'petty-cash', icon: Wallet },
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
    { label: 'Academic Years', page: 'academic-years', icon: Calendar },
    { label: 'Settings', page: 'settings', icon: Settings },
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
      ],
    },
    { label: 'Timetable', page: 'timetable', icon: Calendar },
    { label: 'Exams', page: 'exams', icon: Award },
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
    { label: 'My Children', page: 'my-children', icon: Baby },
    { label: 'Fee Details', page: 'fee-details', icon: Receipt },
    { label: 'Attendance', page: 'my-attendance', icon: UserCheck },
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
        { label: 'Change Fee Group', page: 'fee-change-group', icon: RefreshCw },
      ],
    },
    {
      label: 'Salary',
      page: 'salary',
      icon: Wallet,
      children: [
        { label: 'Salary Payments', page: 'salary-payments', icon: DollarSign },
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
    { label: 'Library', page: 'library', icon: Library },
    { label: 'Inventory', page: 'inventory', icon: Package },
    { label: 'Petty Cash', page: 'petty-cash', icon: Wallet },
    { label: 'Notifications', page: 'notifications', icon: Bell },
    { label: 'Announcements', page: 'announcements', icon: Megaphone },
  ],
}

function isPageActiveOnPath(page: PageName, pathname: string): boolean {
  const url = resolveMigratedUrl(page)
  if (!url) return false
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

export function AppSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, currentSchool, sidebarOpen, setSidebarOpen, sidebarCollapsed, permissions, permissionsLoaded } = useAppStore()
  const [menuStack, setMenuStack] = useState<Array<{ label: string; items: SidebarMenuEntry[] }>>([])
  const [menuPanelPos, setMenuPanelPos] = useState({ top: 0, left: 0 })
  const [flyoutMenu, setFlyoutMenu] = useState<string | null>(null)
  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 })
  const flyoutTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const role = user?.role || 'SCHOOL_ADMIN' as const
  const schoolDisplayName = role === 'SUPER_ADMIN'
    ? 'Vidhyalayam'
    : currentSchool?.name || 'Vidhyalayam'
  const schoolSubLabel = role === 'SUPER_ADMIN'
    ? 'Platform Admin'
    : currentSchool?.subdomain
    ? `${currentSchool.subdomain} dashboard`
    : 'School Management'
  const schoolLogo = role === 'SUPER_ADMIN' ? undefined : currentSchool?.logo

  const menus = useMemo(() => {
    const roleMenus = MENUS[role] || MENUS.SCHOOL_ADMIN
    if (!MENUS[role]) {
      console.warn(`No menu configuration found for role: ${role}, falling back to SCHOOL_ADMIN`)
    }
    return roleMenus.filter(item => {
      if (role === 'SUPER_ADMIN') return true
      if (item.children && item.children.length > 0) {
        // The parent group is visible if ANY page it contains is visible —
        // including the parent's own landing page (which is often duplicated
        // inside its children list, e.g. Fees → Fee Collections). Earlier
        // logic stripped item.page out and accidentally hid the whole group
        // when the only visible permission targeted that landing page.
        return collectPages(item).some(p => isPageVisible(p, permissions, role, permissionsLoaded))
      }
      return isPageVisible(item.page, permissions, role, permissionsLoaded)
    }).map(item => {
      if (item.children) {
        return { ...item, children: filterChildren(item.children, permissions, role, permissionsLoaded) }
      }
      return item
    })
  }, [role, permissions, permissionsLoaded])

  const isCollapsed = sidebarCollapsed
  const activeDrill = menuStack[menuStack.length - 1]

  const openMenuPanel = (item: SidebarMenuEntry, buttonEl: HTMLButtonElement) => {
    if (!item.children?.length) return
    const rect = buttonEl.getBoundingClientRect()
    setMenuPanelPos({
      top: Math.max(64, rect.top),
      left: Math.min(rect.right + 8, window.innerWidth - 300),
    })
    setMenuStack([{ label: item.label, items: item.children || [] }])
  }

  const enterPanelMenu = (item: SidebarMenuEntry) => {
    if (!item.children?.length) return
    setMenuStack((prev) => [...prev, { label: item.label, items: item.children || [] }])
  }

  const closeMenuPanel = () => {
    setMenuStack([])
  }

  const goBackMenuPanel = () => {
    setMenuStack((prev) => prev.slice(0, -1))
  }

  const handleNavigate = (page: PageName) => {
    const url = resolveMigratedUrl(page)
    if (url) router.push(url)
    setFlyoutMenu(null)
    setMenuStack([])
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
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
      if (target.closest('[data-flyout]') || target.closest('[data-flyout-trigger]') || target.closest('[data-menu-panel]') || target.closest('[data-menu-panel-trigger]')) return
      if (flyoutMenu) setFlyoutMenu(null)
      if (menuStack.length) setMenuStack([])
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [flyoutMenu, menuStack.length])

  const flyoutItem = flyoutMenu ? menus.find(m => m.label === flyoutMenu && m.children && m.children.length > 0) : null

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
          'shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border z-50',
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
              <span className="text-[10px] text-sidebar-foreground/60 truncate">{schoolSubLabel}</span>
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
          <ScrollArea className="flex-1 min-h-0">
            <TooltipProvider delayDuration={0}>
              <nav className={cn('py-2 space-y-0.5 transition-[padding] duration-300 ease-in-out', isCollapsed ? 'px-2' : 'px-3')}>
                {menus.map((item) => {
                  const isActive = isPageActiveOnPath(item.page, pathname) ||
                    (item.children && item.children.some((child) => hasActiveDescendant(child, pathname)))

                  /* ─── Collapsed mode: icon-only buttons ─── */
                  if (isCollapsed) {
                    if (item.children && item.children.length > 0) {
                      const isFlyoutOpen = flyoutMenu === item.label
                      return (
                        <button
                          key={item.label}
                          data-flyout-trigger={item.label}
                          onClick={(e) => {
                            if (isFlyoutOpen) closeFlyout()
                            else openFlyout(item.label, e.currentTarget)
                          }}
                          onMouseEnter={(e) => openFlyout(item.label, e.currentTarget)}
                          onMouseLeave={closeFlyoutDelayed}
                          className={cn(
                            'flex w-full items-center justify-center rounded-lg py-2.5 transition-colors relative',
                            (isActive || isFlyoutOpen)
                              ? 'bg-sidebar-accent text-sidebar-primary'
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                          )}
                        >
                          <item.icon className="size-5 shrink-0" />
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sidebar-primary rounded-r-full" />
                          )}
                          <ChevronDown className="absolute -right-0.5 bottom-1 size-2.5 opacity-50" />
                        </button>
                      )
                    }

                    return (
                      <Tooltip key={item.label}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleNavigate(item.page)}
                            className={cn(
                              'flex w-full items-center justify-center rounded-lg py-2.5 transition-colors relative',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-primary'
                                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                            )}
                          >
                            <item.icon className="size-5 shrink-0" />
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sidebar-primary rounded-r-full" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="font-medium">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  /* ─── Expanded mode: full items with collapsible sub-menus ─── */
                  if (item.children) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        data-menu-panel-trigger={item.label}
                        onClick={(e) => openMenuPanel(item, e.currentTarget)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive || activeDrill?.label === item.label
                            ? 'bg-sidebar-accent text-sidebar-primary'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                        <ChevronRight className="size-4 shrink-0 opacity-70" />
                      </button>
                    )
                  }

                  // Regular item without children
                  return (
                    <button
                      key={item.page}
                      onClick={() => handleNavigate(item.page)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-primary'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </button>
                  )
                })}
              </nav>
            </TooltipProvider>
          </ScrollArea>

          {/* Sidebar Footer */}
          <div className={cn('shrink-0 border-t border-sidebar-border transition-[padding] duration-300 ease-in-out', isCollapsed ? 'p-2' : 'p-3')}>
            {!isCollapsed ? (
              <div className="rounded-lg bg-sidebar-accent/50 p-3">
                <p className="truncate text-xs font-medium text-sidebar-foreground/80">{schoolDisplayName}</p>
                <p className="mt-1 truncate text-[10px] text-sidebar-foreground/50">{schoolSubLabel}</p>
              </div>
            ) : (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex justify-center py-2">
                      <div className="size-7 overflow-hidden rounded-md bg-sidebar-accent/50 flex items-center justify-center">
                        {schoolLogo ? (
                          <img src={schoolLogo} alt={`${schoolDisplayName} logo`} className="size-full object-cover" />
                        ) : (
                          <GraduationCap className="size-3.5 text-sidebar-foreground/60" />
                        )}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {schoolDisplayName}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </aside>

      {/* Submenu panel for expanded sidebar */}
      {!isCollapsed && activeDrill && typeof document !== 'undefined' && createPortal(
        <div
          data-menu-panel
          className="fixed z-[100] w-72 overflow-hidden rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl animate-in slide-in-from-left-1 fade-in duration-150"
          style={{ top: menuPanelPos.top, left: menuPanelPos.left }}
        >
          <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2.5">
            {menuStack.length > 1 && (
              <button
                type="button"
                onClick={goBackMenuPanel}
                className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{activeDrill.label}</p>
            <button
              type="button"
              onClick={closeMenuPanel}
              className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[min(520px,calc(100vh-96px))] overflow-y-auto p-2">
            {activeDrill.items.map((item) => {
              const isActive = isPageActiveOnPath(item.page, pathname) || (item.children && item.children.some((child) => hasActiveDescendant(child, pathname)))

              if (item.children?.length) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => enterPanelMenu(item)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    <ChevronRight className="size-4 shrink-0 opacity-70" />
                  </button>
                )
              }

              return (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => handleNavigate(item.page)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isPageActiveOnPath(item.page, pathname)
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}

      {/* Flyout Popup for collapsed sidebar */}
      {isCollapsed && flyoutItem && flyoutMenu && typeof document !== 'undefined' && createPortal(
        <div
          data-flyout={flyoutMenu}
          className="fixed z-[100] rounded-lg border bg-popover text-popover-foreground shadow-xl min-w-[200px] animate-in slide-in-from-left-1 fade-in duration-150"
          style={{ top: flyoutPos.top, left: flyoutPos.left }}
          onMouseEnter={cancelFlyoutClose}
          onMouseLeave={closeFlyoutDelayed}
        >
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-semibold">{flyoutItem.label}</p>
          </div>
          <div className="py-1">
            {flyoutItem.children!.map((child) => {
              if (child.children && child.children.length > 0) {
                return (
                  <div key={child.label}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {child.label}
                    </div>
                    {child.children.map((grandChild) => (
                      <button
                        key={grandChild.page}
                        onClick={() => handleNavigate(grandChild.page)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                          isPageActiveOnPath(grandChild.page, pathname)
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
                  onClick={() => handleNavigate(child.page)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    isPageActiveOnPath(child.page, pathname)
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
