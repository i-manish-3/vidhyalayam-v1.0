import { create } from 'zustand'
import { cacheSchoolBranding } from '@/lib/branding'

export type PageName = 
  | 'dashboard'
  | 'students' | 'teachers' | 'parents' | 'admission-form' | 'student-detail'
  | 'attendance' | 'mark-attendance' | 'view-attendance'
  | 'fees-heads' | 'fees-groups' | 'fees-structures' | 'fee-assignments' | 'fee-invoices' | 'fee-collections'
  | 'salary' | 'salary-structure' | 'salary-payments' | 'salary-advance'
  | 'timetable' | 'exams' | 'exam-results'
  | 'transport' | 'add-transport-route' | 'edit-transport-route' | 'drivers' | 'add-driver' | 'library' | 'inventory' | 'petty-cash'
  | 'notifications' | 'announcements'
  | 'classes' | 'subjects' | 'academic-years' | 'add-subject' | 'add-class' | 'edit-class' | 'edit-subject'
  | 'settings' | 'support'
  | 'school-onboarding' | 'schools' | 'school-detail' | 'analytics'
  | 'my-classes' | 'my-attendance' | 'my-children' | 'fee-details'
  | 'super-admin-permissions' | 'super-admin-roles' | 'school-roles' | 'school-permissions' | 'school-users' | 'staff' | 'staff-create' | 'staff-detail' | 'contact-requests' | 'testimonials' | 'pricing-plans' | 'team-members' | 'edit-student'

export interface User {
  id: string
  email: string
  name: string
  role: string
  schoolId?: string
  phone?: string
  avatar?: string
  mustChangePassword?: boolean
}

export interface School {
  id: string
  name: string
  logo?: string
  favicon?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  contactPhone?: string
  contactEmail?: string
  website?: string
  subdomain: string
  status: string
  primaryColor?: string
  dashboardFont?: string
  academicYear?: string
  board?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  permissions: string[]
  login: (user: User, token: string) => void
  logout: () => void
  setPermissions: (permissions: string[]) => void
}

interface NavigationState {
  currentPage: PageName
  pageHistory: PageName[]  // stack of previous pages for back navigation
  sidebarOpen: boolean
  sidebarCollapsed: boolean  // icon-only mode for desktop
  selectedStudentId: string | null
  selectedSchoolId: string | null
  staffDetailId: string | null
  selectedSuperAdminRoleId: string | null
  selectedClassId: string | null
  selectedSubjectId: string | null
  selectedTransportRouteId: string | null
  setCurrentPage: (page: PageName) => void
  navigateTo: (page: PageName) => void  // push current page to history then navigate
  goBack: (fallback?: PageName) => void  // go back to previous page
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  toggleSidebarCollapse: () => void
  setSelectedStudentId: (id: string | null) => void
  setSelectedSchoolId: (id: string | null) => void
  setStaffDetailId: (id: string | null) => void
  setSelectedSuperAdminRoleId: (id: string | null) => void
  setSelectedClassId: (id: string | null) => void
  setSelectedSubjectId: (id: string | null) => void
  setSelectedTransportRouteId: (id: string | null) => void
}

interface SchoolState {
  currentSchool: School | null
  setCurrentSchool: (school: School) => void
}

type AppStore = AuthState & NavigationState & SchoolState

export const useAppStore = create<AppStore>((set) => ({
  // Auth
  user: null,
  token: null,
  isAuthenticated: false,
  permissions: [],
  login: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('erp_token', token)
      localStorage.setItem('erp_user', JSON.stringify(user))
    }
    set({ user, token, isAuthenticated: true })
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('erp_token')
      localStorage.removeItem('erp_user')
      localStorage.removeItem('erp_permissions')
      localStorage.removeItem('erp_currentPage')
      localStorage.removeItem('erp_currentSchool')
    }
    set({ 
      user: null, 
      token: null, 
      isAuthenticated: false, 
      currentSchool: null,
      currentPage: 'dashboard',
      pageHistory: [],
      sidebarOpen: true,
      permissions: [],
      selectedTransportRouteId: null,
    })
  },
  setPermissions: (permissions) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('erp_permissions', JSON.stringify(permissions))
    }
    set({ permissions })
  },

  // Navigation
  currentPage: 'dashboard',
  pageHistory: [],
  sidebarOpen: true,
  sidebarCollapsed: false,
  selectedStudentId: null,
  selectedSchoolId: null,
  staffDetailId: null,
  selectedSuperAdminRoleId: null,
  selectedClassId: null,
  selectedSubjectId: null,
  selectedTransportRouteId: null,
  setCurrentPage: (page) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('erp_currentPage', page)
    }
    set({ currentPage: page })
  },
  navigateTo: (page) => set((state) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('erp_currentPage', page)
    }
    return { currentPage: page, pageHistory: [...state.pageHistory, state.currentPage] }
  }),
  goBack: (fallback) => set((state) => {
    let targetPage: PageName
    if (state.pageHistory.length > 0) {
      const history = [...state.pageHistory]
      targetPage = history.pop()!
      if (typeof window !== 'undefined') {
        localStorage.setItem('erp_currentPage', targetPage)
      }
      return { currentPage: targetPage, pageHistory: history }
    }
    targetPage = fallback || 'dashboard'
    if (typeof window !== 'undefined') {
      localStorage.setItem('erp_currentPage', targetPage)
    }
    return { currentPage: targetPage }
  }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleSidebarCollapse: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSelectedStudentId: (id) => set({ selectedStudentId: id }),
  setSelectedSchoolId: (id) => set({ selectedSchoolId: id }),
  setStaffDetailId: (id) => set({ staffDetailId: id }),
  setSelectedSuperAdminRoleId: (id) => set({ selectedSuperAdminRoleId: id }),
  setSelectedClassId: (id) => set({ selectedClassId: id }),
  setSelectedSubjectId: (id) => set({ selectedSubjectId: id }),
  setSelectedTransportRouteId: (id) => set({ selectedTransportRouteId: id }),

  // School
  currentSchool: null,
  setCurrentSchool: (school) => {
    cacheSchoolBranding(school)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('erp_currentSchool', JSON.stringify(school))
      } catch {
        // Keep the live app branding updated even if a large logo/favicon exceeds storage quota.
      }
    }
    set({ currentSchool: school })
  },
}))

// Initialize from localStorage on client
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('erp_token')
  const userStr = localStorage.getItem('erp_user')
  const permStr = localStorage.getItem('erp_permissions')
  const savedPage = localStorage.getItem('erp_currentPage')
  const schoolStr = localStorage.getItem('erp_currentSchool')
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr)
      if (user && typeof user === 'object' && 'id' in user && 'email' in user) {
        let permissions: string[] = []
        let currentSchool: School | null = null
        if (permStr) {
          try { permissions = JSON.parse(permStr) } catch { /* ignore */ }
        }
        if (schoolStr) {
          try { currentSchool = JSON.parse(schoolStr) } catch { /* ignore */ }
        }
        const initialState: Partial<AppStore> = { user, token, isAuthenticated: true, permissions, currentSchool }
        // Restore last visited page if valid
        if (savedPage) {
          initialState.currentPage = savedPage as PageName
        }
        useAppStore.setState(initialState as AppStore)
      } else {
        localStorage.removeItem('erp_token')
        localStorage.removeItem('erp_user')
        localStorage.removeItem('erp_permissions')
        localStorage.removeItem('erp_currentPage')
        localStorage.removeItem('erp_currentSchool')
      }
    } catch {
      localStorage.removeItem('erp_token')
      localStorage.removeItem('erp_user')
      localStorage.removeItem('erp_permissions')
      localStorage.removeItem('erp_currentPage')
      localStorage.removeItem('erp_currentSchool')
    }
  }
}
