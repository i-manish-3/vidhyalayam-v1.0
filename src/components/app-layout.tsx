'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from 'next-themes'
import { useAppStore, type PageName } from '@/lib/store'
import { AppSidebar, MENUS } from './app-sidebar'
import { isPageVisible } from '@/lib/permission-mappings'
import { SCHOOL_THEME_VARIABLE_NAMES, findDashboardFont, getSchoolThemeVariables } from '@/lib/theme-palettes'
import { api } from '@/lib/api'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Sun, Moon, Bell, LogOut, User, ChevronRight, PanelLeftClose, PanelLeftOpen, Search, ArrowRight, Lock } from 'lucide-react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'

// Dashboard imports
import { SuperAdminDashboard } from './dashboards/super-admin-dashboard'
import { SchoolAdminDashboard } from './dashboards/school-admin-dashboard'
import { TeacherDashboard } from './dashboards/teacher-dashboard'
import { StudentDashboard } from './dashboards/student-dashboard'
import { ParentDashboard } from './dashboards/parent-dashboard'

// Module page dynamic imports
const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
)

const StudentsPage = dynamic(() => import('@/features/students/pages/students-page').then(mod => ({ default: mod.StudentsPage })), { ssr: false, loading: PageLoader })
const TeachersPage = dynamic(() => import('@/features/people/pages/teachers-page').then(mod => ({ default: mod.TeachersPage })), { ssr: false, loading: PageLoader })
const AttendancePage = dynamic(() => import('@/features/attendance/pages/attendance-page').then(mod => ({ default: mod.AttendancePage })), { ssr: false, loading: PageLoader })
const FeesHeadsPage = dynamic(() => import('@/features/fees/pages/fees-heads-page').then(mod => ({ default: mod.FeesHeadsPage })), { ssr: false, loading: PageLoader })
const FeesGroupsPage = dynamic(() => import('@/features/fees/pages/fees-groups-page').then(mod => ({ default: mod.FeesGroupsPage })), { ssr: false, loading: PageLoader })
const FeesStructuresPage = dynamic(() => import('@/features/fees/pages/fees-structures-page').then(mod => ({ default: mod.FeesStructuresPage })), { ssr: false, loading: PageLoader })
const FeeAssignmentsPage = dynamic(() => import('@/features/fees/pages/fee-assignments-page').then(mod => ({ default: mod.FeeAssignmentsPage })), { ssr: false, loading: PageLoader })
const FeeInvoicesPage = dynamic(() => import('@/features/fees/pages/fee-invoices-page').then(mod => ({ default: mod.FeeInvoicesPage })), { ssr: false, loading: PageLoader })
const FeeCollectionsPage = dynamic(() => import('@/features/fees/pages/fee-collections-page').then(mod => ({ default: mod.FeeCollectionsPage })), { ssr: false, loading: PageLoader })
const SalaryStructurePage = dynamic(() => import('@/features/salary/pages/salary-structure-page').then(mod => ({ default: mod.SalaryStructurePage })), { ssr: false, loading: PageLoader })
const SalaryPaymentsPage = dynamic(() => import('@/features/salary/pages/salary-payments-page').then(mod => ({ default: mod.SalaryPaymentsPage })), { ssr: false, loading: PageLoader })
const SalaryAdvancePage = dynamic(() => import('@/features/salary/pages/salary-advance-page').then(mod => ({ default: mod.SalaryAdvancePage })), { ssr: false, loading: PageLoader })
const TimetablePage = dynamic(() => import('@/features/academics/pages/timetable-page').then(mod => ({ default: mod.TimetablePage })), { ssr: false, loading: PageLoader })
const ExamsPage = dynamic(() => import('@/features/exams/pages/exams-page').then(mod => ({ default: mod.ExamsPage })), { ssr: false, loading: PageLoader })
const ExamResultsPage = dynamic(() => import('@/features/exams/pages/exam-results-page').then(mod => ({ default: mod.ExamResultsPage })), { ssr: false, loading: PageLoader })
const TransportPage = dynamic(() => import('@/features/transport/pages/transport-page').then(mod => ({ default: mod.TransportPage })), { ssr: false, loading: PageLoader })
const AddTransportRoutePage = dynamic(() => import('@/features/transport/pages/add-transport-route-page').then(mod => ({ default: mod.AddTransportRoutePage })), { ssr: false, loading: PageLoader })
const EditTransportRoutePage = dynamic(() => import('@/features/transport/pages/edit-transport-route-page').then(mod => ({ default: mod.EditTransportRoutePage })), { ssr: false, loading: PageLoader })
const AddDriverPage = dynamic(() => import('@/features/transport/pages/add-driver-page').then(mod => ({ default: mod.AddDriverPage })), { ssr: false, loading: PageLoader })
const DriverDirectoryPage = dynamic(() => import('@/features/transport/pages/driver-directory-page').then(mod => ({ default: mod.DriverDirectoryPage })), { ssr: false, loading: PageLoader })
const LibraryPage = dynamic(() => import('@/features/operations/pages/library-page').then(mod => ({ default: mod.LibraryPage })), { ssr: false, loading: PageLoader })
const InventoryPage = dynamic(() => import('@/features/operations/pages/inventory-page').then(mod => ({ default: mod.InventoryPage })), { ssr: false, loading: PageLoader })
const PettyCashPage = dynamic(() => import('@/features/operations/pages/petty-cash-page').then(mod => ({ default: mod.PettyCashPage })), { ssr: false, loading: PageLoader })
const NotificationsPage = dynamic(() => import('@/features/communications/pages/notifications-page').then(mod => ({ default: mod.NotificationsPage })), { ssr: false, loading: PageLoader })
const AnnouncementsPage = dynamic(() => import('@/features/communications/pages/announcements-page').then(mod => ({ default: mod.AnnouncementsPage })), { ssr: false, loading: PageLoader })
const ClassesPage = dynamic(() => import('@/features/academics/pages/classes-page').then(mod => ({ default: mod.ClassesPage })), { ssr: false, loading: PageLoader })
const PromoteStudentPage = dynamic(() => import('@/features/academics/pages/promote-student-page').then(mod => ({ default: mod.PromoteStudentPage })), { ssr: false, loading: PageLoader })
const AssignRollNumbersPage = dynamic(() => import('@/features/academics/pages/assign-roll-numbers-page').then(mod => ({ default: mod.AssignRollNumbersPage })), { ssr: false, loading: PageLoader })
const SubjectsPage = dynamic(() => import('@/features/academics/pages/subjects-page').then(mod => ({ default: mod.SubjectsPage })), { ssr: false, loading: PageLoader })
const AddSubjectPage = dynamic(() => import('@/features/academics/pages/add-subject-page').then(mod => ({ default: mod.AddSubjectPage })), { ssr: false, loading: PageLoader })
const AddClassPage = dynamic(() => import('@/features/academics/pages/add-class-page').then(mod => ({ default: mod.AddClassPage })), { ssr: false, loading: PageLoader })
const ParentsPage = dynamic(() => import('@/features/people/pages/parents-page').then(mod => ({ default: mod.ParentsPage })), { ssr: false, loading: PageLoader })
const AdmissionFormPage = dynamic(() => import('@/features/admissions/pages/admission-form-page').then(mod => ({ default: mod.AdmissionFormPage })), { ssr: false, loading: PageLoader })
const StudentDetailPage = dynamic(() => import('@/features/students/pages/student-detail-page').then(mod => ({ default: mod.StudentDetailPage })), { ssr: false, loading: PageLoader })
const SchoolsPage = dynamic(() => import('@/features/admin/pages/schools-page').then(mod => ({ default: mod.SchoolsPage })), { ssr: false, loading: PageLoader })
const SchoolDetailPage = dynamic(() => import('@/features/admin/pages/school-detail-page').then(mod => ({ default: mod.SchoolDetailPage })), { ssr: false, loading: PageLoader })
const SupportPage = dynamic(() => import('@/features/communications/pages/support-page').then(mod => ({ default: mod.SupportPage })), { ssr: false, loading: PageLoader })
const SettingsPage = dynamic(() => import('@/features/settings/pages/settings-page').then(mod => ({ default: mod.SettingsPage })), { ssr: false, loading: PageLoader })
const AcademicYearsPage = dynamic(() => import('@/features/settings/pages/academic-years-page').then(mod => ({ default: mod.AcademicYearsPage })), { ssr: false, loading: PageLoader })
const PlaceholderPage = dynamic(() => import('./placeholder-page').then(mod => ({ default: mod.PlaceholderPage })), { ssr: false, loading: PageLoader })
const SuperAdminPermissionsPage = dynamic(() => import('@/features/admin/pages/super-admin-permissions-page').then(mod => ({ default: mod.SuperAdminPermissionsPage })), { ssr: false, loading: PageLoader })
const SuperAdminRolesPage = dynamic(() => import('@/features/admin/pages/super-admin-roles-page').then(mod => ({ default: mod.SuperAdminRolesPage })), { ssr: false, loading: PageLoader })
const SchoolRolesPage = dynamic(() => import('@/features/admin/pages/school-roles-page').then(mod => ({ default: mod.SchoolRolesPage })), { ssr: false, loading: PageLoader })
const SchoolPermissionsPage = dynamic(() => import('@/features/admin/pages/school-permissions-page').then(mod => ({ default: mod.SchoolPermissionsPage })), { ssr: false, loading: PageLoader })
const SchoolUsersPage = dynamic(() => import('@/features/admin/pages/school-users-page').then(mod => ({ default: mod.SchoolUsersPage })), { ssr: false, loading: PageLoader })
const StaffPage = dynamic(() => import('@/features/people/pages/staff-page').then(mod => ({ default: mod.StaffPage })), { ssr: false, loading: PageLoader })
const StaffCreatePage = dynamic(() => import('@/features/people/pages/staff-create-page').then(mod => ({ default: mod.StaffCreatePage })), { ssr: false, loading: PageLoader })
const StaffDetailPage = dynamic(() => import('@/features/people/pages/staff-detail-page').then(mod => ({ default: mod.StaffDetailPage })), { ssr: false, loading: PageLoader })
const ContactRequestsPage = dynamic(() => import('@/features/marketing/pages/contact-requests-page').then(mod => ({ default: mod.ContactRequestsPage })), { ssr: false, loading: PageLoader })
const TestimonialsPage = dynamic(() => import('@/features/marketing/pages/testimonials-page').then(mod => ({ default: mod.TestimonialsPage })), { ssr: false, loading: PageLoader })
const PricingPlansPage = dynamic(() => import('@/features/marketing/pages/pricing-plans-page').then(mod => ({ default: mod.PricingPlansPage })), { ssr: false, loading: PageLoader })
const TeamMembersPage = dynamic(() => import('@/features/marketing/pages/team-members-page').then(mod => ({ default: mod.TeamMembersPage })), { ssr: false, loading: PageLoader })
const EditStudentPage = dynamic(() => import('@/features/students/pages/edit-student-page').then(mod => ({ default: mod.EditStudentPage })), { ssr: false, loading: PageLoader })
const EditClassPage = dynamic(() => import('@/features/academics/pages/edit-class-page').then(mod => ({ default: mod.EditClassPage })), { ssr: false, loading: PageLoader })
const EditSubjectPage = dynamic(() => import('@/features/academics/pages/edit-subject-page').then(mod => ({ default: mod.EditSubjectPage })), { ssr: false, loading: PageLoader })
const ViewAttendancePage = dynamic(() => import('@/features/attendance/pages/view-attendance-page').then(mod => ({ default: mod.ViewAttendancePage })), { ssr: false, loading: PageLoader })

const PAGE_TITLES: Record<PageName, string> = {
  'dashboard': 'Dashboard',
  'students': 'Students',
  'teachers': 'Teachers',
  'parents': 'Parents',
  'admission-form': 'New Admission',
  'student-detail': 'Student Details',
  'attendance': 'Attendance',
  'mark-attendance': 'Mark Attendance',
  'view-attendance': 'View Attendance',
  'fees-heads': 'Fee Heads',
  'fees-groups': 'Fee Groups',
  'fees-structures': 'Fee Structures',
  'fee-assignments': 'Fee Assignments',
  'fee-invoices': 'Fee Invoices',
  'fee-collections': 'Fee Collections',
  'salary': 'Salary',
  'salary-structure': 'Salary Structure',
  'salary-payments': 'Salary Payments',
  'salary-advance': 'Advance Requests',
  'timetable': 'Timetable',
  'exams': 'Exams',
  'exam-results': 'Exam Results',
  'transport': 'Transport',
  'add-transport-route': 'Create Transport Route',
  'edit-transport-route': 'Edit Transport Route',
  'drivers': 'Drivers',
  'add-driver': 'Add Driver',
  'library': 'Library',
  'inventory': 'Inventory',
  'petty-cash': 'Petty Cash',
  'notifications': 'Notifications',
  'announcements': 'Announcements',
  'classes': 'Classes',
  'promote-student': 'Promote Student',
  'assign-roll-numbers': 'Assign Roll Numbers',
  'subjects': 'Subjects',
  'academic-years': 'Academic Years',
  'add-subject': 'Add Subject',
  'add-class': 'Add Class',
  'edit-class': 'Edit Class',
  'edit-subject': 'Edit Subject',
  'settings': 'Settings',
  'support': 'Support Tickets',
  'school-onboarding': 'School Onboarding',
  'schools': 'Schools',
  'school-detail': 'School Details',
  'analytics': 'Analytics',
  'my-classes': 'My Classes',
  'my-attendance': 'My Attendance',
  'my-children': 'My Children',
  'fee-details': 'Fee Details',
  'super-admin-permissions': 'School Permissions',
  'super-admin-roles': 'Roles',
  'school-roles': 'Roles',
  'school-permissions': 'Role Assignments',
  'school-users': 'School Users',
  'staff': 'Staff List',
  'staff-create': 'Create Staff',
  'staff-detail': 'Staff Details',
  'contact-requests': 'Contact Requests',
  'testimonials': 'Testimonials',
  'pricing-plans': 'Pricing Plans',
  'team-members': 'Team Members',
  'edit-student': 'Edit Student',
}

// Map page names to components
const PAGE_COMPONENTS: Partial<Record<PageName, React.ComponentType>> = {
  'students': StudentsPage,
  'teachers': TeachersPage,
  'parents': ParentsPage,
  'admission-form': AdmissionFormPage,
  'student-detail': StudentDetailPage,
  'attendance': AttendancePage,
  'mark-attendance': AttendancePage,
  'view-attendance': ViewAttendancePage,
  'my-attendance': AttendancePage,
  'fees-heads': FeesHeadsPage,
  'fees-groups': FeesGroupsPage,
  'fees-structures': FeesStructuresPage,
  'fee-assignments': FeeAssignmentsPage,
  'fee-invoices': FeeInvoicesPage,
  'fee-collections': FeeCollectionsPage,
  'fee-details': FeeCollectionsPage,
  'salary-structure': SalaryStructurePage,
  'salary': SalaryStructurePage,
  'salary-payments': SalaryPaymentsPage,
  'salary-advance': SalaryAdvancePage,
  'timetable': TimetablePage,
  'exams': ExamsPage,
  'exam-results': ExamResultsPage,
  'transport': TransportPage,
  'add-transport-route': AddTransportRoutePage,
  'edit-transport-route': EditTransportRoutePage,
  'drivers': DriverDirectoryPage,
  'add-driver': AddDriverPage,
  'library': LibraryPage,
  'inventory': InventoryPage,
  'petty-cash': PettyCashPage,
  'notifications': NotificationsPage,
  'announcements': AnnouncementsPage,
  'classes': ClassesPage,
  'promote-student': PromoteStudentPage,
  'assign-roll-numbers': AssignRollNumbersPage,
  'subjects': SubjectsPage,
  'academic-years': AcademicYearsPage,
  'add-subject': AddSubjectPage,
  'add-class': AddClassPage,
  'schools': SchoolsPage,
  'school-detail': SchoolDetailPage,
  'support': SupportPage,
  'settings': SettingsPage,
  'my-classes': ClassesPage,
  'my-children': ParentsPage,
  'super-admin-permissions': SuperAdminPermissionsPage,
  'super-admin-roles': SuperAdminRolesPage,
  'school-roles': SchoolRolesPage,
  'school-permissions': SchoolPermissionsPage,
  'school-users': SchoolUsersPage,
  'staff': StaffPage,
  'staff-create': StaffCreatePage,
  'staff-detail': StaffDetailPage,
  'contact-requests': ContactRequestsPage,
  'testimonials': TestimonialsPage,
  'pricing-plans': PricingPlansPage,
  'team-members': TeamMembersPage,
  'edit-student': EditStudentPage,
  'edit-class': EditClassPage,
  'edit-subject': EditSubjectPage,
}

function PageContent({ page }: { page: PageName }) {
  const role = useAppStore((s) => s.user?.role)

  if (page === 'dashboard') {
    switch (role) {
      case 'SUPER_ADMIN': return <SuperAdminDashboard />
      case 'SCHOOL_ADMIN': return <SchoolAdminDashboard />
      case 'TEACHER': return <TeacherDashboard />
      case 'STUDENT': return <StudentDashboard />
      case 'PARENT': return <ParentDashboard />
      default: return <SchoolAdminDashboard />
    }
  }

  const Component = PAGE_COMPONENTS[page]
  if (Component) return <Component />

  return <PlaceholderPage title={PAGE_TITLES[page] || page} page={page} />
}

// Searchable items for universal search
const SEARCH_ITEMS: { label: string; page: PageName; keywords: string[] }[] = [
  { label: 'Dashboard', page: 'dashboard', keywords: ['home', 'overview', 'main'] },
  { label: 'Students', page: 'students', keywords: ['learner', 'pupil', 'admission'] },
  { label: 'Teachers', page: 'teachers', keywords: ['staff', 'faculty', 'educator'] },
  { label: 'Parents', page: 'parents', keywords: ['mother', 'father'] },
  { label: 'New Admission Form', page: 'admission-form', keywords: ['apply', 'enroll form', 'register student'] },
  { label: 'Mark Attendance', page: 'mark-attendance', keywords: ['present', 'absent', 'daily', 'mark attendance'] },
  { label: 'View Attendance', page: 'view-attendance', keywords: ['attendance report', 'view attendance', 'attendance records'] },
  { label: 'Fee Heads', page: 'fees-heads', keywords: ['fee type', 'tuition', 'charge'] },
  { label: 'Fee Groups', page: 'fees-groups', keywords: ['fee category', 'group fees'] },
  { label: 'Fee Structures', page: 'fees-structures', keywords: ['fee plan', 'class fees', 'amount'] },
  { label: 'Fee Assignments', page: 'fee-assignments', keywords: ['student fee', 'fee snapshot', 'assign fees'] },
  { label: 'Fee Invoices', page: 'fee-invoices', keywords: ['invoice', 'demand', 'bill'] },
  { label: 'Fee Collections', page: 'fee-collections', keywords: ['payment', 'collect', 'receipt', 'pay'] },
  { label: 'Salary Structure', page: 'salary-structure', keywords: ['pay scale', 'ctc', 'compensation'] },
  { label: 'Salary Payments', page: 'salary-payments', keywords: ['payroll', 'salary slip', 'month pay'] },
  { label: 'Advance Requests', page: 'salary-advance', keywords: ['loan', 'advance salary', 'prepayment'] },
  { label: 'Timetable', page: 'timetable', keywords: ['schedule', 'period', 'routine'] },
  { label: 'Exams', page: 'exams', keywords: ['test', 'assessment', 'mid term', 'final'] },
  { label: 'Exam Results', page: 'exam-results', keywords: ['marks', 'grades', 'score', 'report'] },
  { label: 'Transport', page: 'transport', keywords: ['bus', 'route', 'vehicle', 'pickup'] },
  { label: 'Create Transport Route', page: 'add-transport-route', keywords: ['add route', 'new route', 'create route', 'bus route'] },
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
  { label: 'School Details', page: 'school-detail', keywords: ['school info', 'school edit', 'school view'] },
  { label: 'School Permissions', page: 'super-admin-permissions', keywords: ['permission', 'module access', 'school access'] },
  { label: 'Roles', page: 'super-admin-roles', keywords: ['role', 'custom role', 'create role', 'role management'] },
  { label: 'Support Tickets', page: 'support', keywords: ['help', 'issue', 'complaint'] },
  { label: 'Contact Requests', page: 'contact-requests', keywords: ['contact', 'demo', 'request', 'inquiry', 'lead'] },
  { label: 'Testimonials', page: 'testimonials', keywords: ['testimonial', 'review', 'feedback', 'rating'] },
  { label: 'Pricing Plans', page: 'pricing-plans', keywords: ['pricing', 'plan', 'addon', 'price', 'subscription', 'billing'] },
  { label: 'Team Members', page: 'team-members', keywords: ['team', 'member', 'staff', 'people', 'about'] },
]

// Build a set of pages allowed for a role based on MENUS config (including children)
function collectMenuPages(item: { page: PageName; children?: any[] }): PageName[] {
  const pages: PageName[] = [item.page]
  if (item.children) {
    for (const child of item.children) {
      pages.push(...collectMenuPages(child))
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

// Universal Search Component
function UniversalSearch() {
  const { setCurrentPage, user, permissions } = useAppStore()
  const role = user?.role || 'SCHOOL_ADMIN'
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K shortcut to focus search
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

  // Get pages allowed for this role from MENUS config
  const allowedPages = useMemo(() => getAllowedPagesForRole(role), [role])

  const results = query.trim()
    ? SEARCH_ITEMS.filter(item => {
        // Must be in the role's allowed pages (from sidebar MENUS config)
        if (!allowedPages.has(item.page)) return false
        // Must pass permission visibility check
        if (!isPageVisible(item.page, permissions, role)) return false
        // Text match
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
    setCurrentPage(page)
    setQuery('')
    setIsOpen(false)
    setSelectedIndex(0)
    inputRef.current?.blur()
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
    <div className="relative flex-1 max-w-md">
      {/* Search Input */}
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
        {/* Keyboard shortcut hint */}
        {!query && (
          <kbd className="absolute right-2 pointer-events-none hidden sm:inline-flex items-center gap-0.5 rounded border border-primary-foreground/20 bg-primary-foreground/15 px-1 py-0.5 text-[9px] text-primary-foreground/70 font-mono dark:border-sidebar-border dark:bg-sidebar-accent dark:text-sidebar-foreground/60">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Search Results Dropdown — rendered via portal to escape header overflow */}
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

      {/* No results */}
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

// Custom 3-line hamburger icon component
function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="2" y="4" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="9.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="14.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  )
}

export function AppLayout() {
  const { user, currentSchool, logout, sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapse, currentPage, token } = useAppStore()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { toast } = useToast()
  const [unreadCount, setUnreadCount] = useState(0)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const roleBadge = user?.role?.replace('_', ' ') || 'User'
  const isDarkTheme = resolvedTheme === 'dark' || theme === 'dark'
  const schoolThemeStyle = useMemo(
    () => getSchoolThemeVariables(currentSchool?.primaryColor, isDarkTheme),
    [currentSchool?.primaryColor, isDarkTheme]
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

  // Fetch unread notification count
  useEffect(() => {
    if (!token) return
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/school/notifications?limit=1', {
          headers: { Authorization: `Bearer ${token}` },
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
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [token])

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
        localStorage.setItem('erp_user', JSON.stringify(updatedUser))
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

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background font-sans" style={schoolThemeStyle}>
      {/* Top Header Bar */}
      <header className="shrink-0 flex h-14 items-center gap-3 border-b border-primary/30 bg-primary text-primary-foreground shadow-sm px-3 lg:px-4 z-30 dark:border-sidebar-border dark:bg-sidebar dark:text-sidebar-foreground">
        {/* Hamburger / Sidebar Toggle */}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground"
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    // Mobile: toggle sidebar open/close
                    setSidebarOpen(!sidebarOpen)
                  } else {
                    // Desktop: toggle sidebar collapse/expand
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

        {/* Separator */}
        <div className="h-5 w-px bg-primary-foreground/25 shrink-0 dark:bg-sidebar-border" />

        {/* Universal Search */}
        <UniversalSearch />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side actions */}
        <div className="flex items-center gap-1.5">
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="size-9 relative text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground" onClick={() => { useAppStore.getState().setCurrentPage('notifications'); setUnreadCount(0) }}>
            <Bell className="size-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </Button>

          {/* Separator before user */}
          <div className="h-5 w-px bg-primary-foreground/25 shrink-0 hidden sm:block dark:bg-sidebar-border" />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pl-1.5 pr-2.5 h-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-sidebar-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-foreground">
                <Avatar className="size-7">
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
              <DropdownMenuItem>
                <User className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="mr-2 size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        <AppSidebar />

        {/* Main Content - scrollable */}
        <main className="flex-1 min-w-0 overflow-y-auto flex flex-col">
          <div className="flex-1 p-4 lg:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <PageContent page={currentPage} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer — always sticks to bottom */}
          <footer className="shrink-0 border-t py-3 px-4 text-center text-xs text-muted-foreground bg-card">
            © {new Date().getFullYear()} My Digital Academy — School Management System
          </footer>
        </main>
      </div>

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
