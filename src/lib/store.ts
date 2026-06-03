import { create } from 'zustand'
import { cacheSchoolBranding } from '@/lib/branding'

export type PageName =
  | 'dashboard'
  | 'students' | 'teachers' | 'add-teacher' | 'parents' | 'admission-form' | 'student-detail' | 'bulk-admission'
  | 'attendance' | 'mark-attendance' | 'view-attendance' | 'attendance-audit-log' | 'attendance-reports' | 'attendance-kiosk' | 'rfid-devices' | 'student-rfid-cards' | 'rfid-card-assign' | 'rfid-audit'
  | 'fees-heads' | 'fees-groups' | 'fees-structures' | 'fee-collections' | 'fee-change-group' | 'fee-demand-config' | 'fee-demand-slips' | 'fee-audit-log' | 'fee-reports'
  | 'salary' | 'salary-structure' | 'salary-payments' | 'salary-advance'
  | 'timetable' | 'exams' | 'exam-results'
  | 'exam-dashboard' | 'exam-paradigms' | 'exam-paradigm-edit' | 'exam-groups'
  | 'exam-list' | 'exam-create' | 'exam-edit' | 'exam-configure' | 'exam-schedule'
  | 'exam-marks-entry' | 'exam-grade-scales' | 'exam-grade-scale-edit'
  | 'exam-result-preview' | 'exam-published-results'
  | 'exam-report-card-templates' | 'exam-report-card-template-edit'
  | 'exam-admit-cards'
  | 'exam-audit-log' | 'teacher-subject-assignments' | 'student-subject-mappings'
  | 'transport' | 'add-transport-route' | 'edit-transport-route' | 'transport-annual-setup' | 'drivers' | 'add-driver' | 'library' | 'inventory' | 'petty-cash'
  | 'notifications' | 'announcements'
  | 'classes' | 'promote-student' | 'assign-roll-numbers' | 'subjects' | 'academic-years' | 'holidays' | 'add-subject' | 'add-class' | 'edit-class' | 'edit-subject'
  | 'settings' | 'support'
  | 'school-onboarding' | 'schools' | 'add-school' | 'edit-school' | 'school-detail' | 'analytics'
  | 'my-classes' | 'my-attendance' | 'my-children' | 'fee-details'
  | 'super-admin-permissions' | 'super-admin-roles' | 'school-roles' | 'school-permissions' | 'school-users' | 'staff' | 'staff-create' | 'staff-detail' | 'contact-requests' | 'testimonials' | 'pricing-plans' | 'team-members' | 'edit-student'
  | 'id-cards' | 'id-card-templates' | 'id-card-template-new' | 'id-card-template-edit' | 'id-card-generate' | 'id-card-showcase'

export interface User {
  id: string
  email: string
  name: string
  role: string
  schoolId?: string
  phone?: string
  avatar?: string
  mustChangePassword?: boolean
  assignedRoleName?: string | null
  impersonatingSchoolId?: string | null
  impersonatingSchoolName?: string | null
}

export interface School {
  id: string
  name: string
  logo?: string
  favicon?: string
  printHeader?: string
  registrationNumber?: string
  udiseNumber?: string
  affiliationNumber?: string
  establishedYear?: string
  principalSignature?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  contactPhone?: string
  contactEmail?: string
  website?: string
  status: string
  primaryColor?: string
  dashboardFont?: string
  academicYear?: string
  board?: string
  workingDays?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  permissions: string[]
  permissionsLoaded: boolean
  // Tokens live in HttpOnly cookies (erp_access, erp_refresh) set by the
  // server — JavaScript here can't (and shouldn't) read them. The login
  // action only mirrors user metadata into the store; the auth cookies
  // arrive in the same response and the browser persists them.
  login: (user: User) => void
  logout: () => Promise<void>
  setPermissions: (permissions: string[]) => void
}

interface NavigationState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean  // icon-only mode for desktop
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  toggleSidebarCollapse: () => void
}

interface SchoolState {
  currentSchool: School | null
  setCurrentSchool: (school: School) => void
}

// Global "viewing as" academic year. Distinct from currentSchool.academicYear
// (which is the school's *active* session). The admin can switch this from the
// top-bar to see fees / attendance / profile / etc. data as it was in a past
// session. Persisted to localStorage so a page reload keeps the same context.
interface AcademicYearContextState {
  viewingAcademicYear: string | null
  setViewingAcademicYear: (year: string | null) => void
}

interface PageMemoryState {
  pageState: Record<string, unknown>
  setPageState: <T>(key: string, value: T) => void
  clearPageState: (key: string) => void
}

type AppStore = AuthState & NavigationState & SchoolState & AcademicYearContextState & PageMemoryState

// Avatars (and other potentially large base64 blobs) are stripped before
// persisting to localStorage — a single 2 MB base64 image easily blows past
// the ~5 MB quota when combined with school branding (logo, favicon, print
// header) and breaks login. The avatar is kept in memory on the user object
// for the current session; nothing in the UI currently reads `user.avatar`
// from the persisted copy.
function persistUser(user: User) {
  if (typeof window === 'undefined') return
  const { avatar: _avatar, ...slim } = user
  void _avatar
  try {
    localStorage.setItem('erp_user', JSON.stringify(slim))
  } catch {
    // Quota errors here are non-fatal — auth still works from the in-memory
    // store; the user will simply re-fetch on next reload.
  }
}

export const useAppStore = create<AppStore>((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  permissions: [],
  permissionsLoaded: false,
  login: (user) => {
    if (typeof window !== 'undefined') {
      persistUser(user)
    }
    set({ user, isAuthenticated: true })
  },
  logout: async () => {
    // Ask the server to clear the auth cookies. We fire-and-forget if the
    // server is unreachable — the client-side cleanup below still happens
    // so the user lands on the login screen regardless.
    if (typeof window !== 'undefined') {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      } catch {
        // Network error — ignore. The cookies will simply expire on their own.
      }
      localStorage.removeItem('erp_user')
      localStorage.removeItem('erp_permissions')
      localStorage.removeItem('erp_currentSchool')
      localStorage.removeItem('erp_viewingAcademicYear')
    }
    set({
      user: null,
      isAuthenticated: false,
      currentSchool: null,
      sidebarOpen: true,
      permissions: [],
      permissionsLoaded: false,
      viewingAcademicYear: null,
      pageState: {},
    })
  },
  setPermissions: (permissions) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('erp_permissions', JSON.stringify(permissions))
      } catch {
        // ignore quota errors
      }
    }
    set({ permissions, permissionsLoaded: true })
  },

  // Navigation
  sidebarOpen: true,
  sidebarCollapsed: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleSidebarCollapse: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

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

  // Viewing academic year (global ERP context — affects most year-scoped pages)
  viewingAcademicYear: null,
  setViewingAcademicYear: (year) => {
    if (typeof window !== 'undefined') {
      if (year) {
        localStorage.setItem('erp_viewingAcademicYear', year)
      } else {
        localStorage.removeItem('erp_viewingAcademicYear')
      }
    }
    set({ viewingAcademicYear: year })
  },

  // Transient page memory. This is intentionally not persisted, so refresh clears it.
  pageState: {},
  setPageState: (key, value) => set((state) => ({
    pageState: { ...state.pageState, [key]: value },
  })),
  clearPageState: (key) => set((state) => {
    const next = { ...state.pageState }
    delete next[key]
    return { pageState: next }
  }),
}))

// Initialize from localStorage on client.
//
// The auth token used to live here; it now lives in the HttpOnly `erp_access`
// cookie. We still cache the *user metadata* (id, name, email, etc.) and
// permissions in localStorage for fast UI render — those are not security-
// sensitive (a stolen `erp_user` JSON tells the attacker nothing they can do
// with). The cookie is the authoritative source of authentication; if it's
// expired/missing, the first API call will return 401 and trigger logout.
if (typeof window !== 'undefined') {
  const userStr = localStorage.getItem('erp_user')
  const permStr = localStorage.getItem('erp_permissions')
  const schoolStr = localStorage.getItem('erp_currentSchool')

  // Clean up any leftover token from the pre-cookie era so it doesn't sit in
  // localStorage indefinitely. Safe to call even if the key is already gone.
  localStorage.removeItem('erp_token')
  // Clean up legacy keys from the pre-route-migration era.
  localStorage.removeItem('erp_currentPage')

  if (userStr) {
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
        const initialState: Partial<AppStore> = {
          user,
          // Provisional — we assume the cookie is still valid since user
          // metadata is cached. The next API call confirms or fails with 401.
          isAuthenticated: true,
          permissions,
          // Mark loaded only when we actually rehydrated permissions from
          // localStorage. Otherwise, leave it false so the sidebar shows
          // everything until the /permissions API call completes.
          permissionsLoaded: !!permStr,
          currentSchool,
        }
        const savedViewingYear = localStorage.getItem('erp_viewingAcademicYear')
        if (savedViewingYear) {
          initialState.viewingAcademicYear = savedViewingYear
        }
        useAppStore.setState(initialState as AppStore)
      } else {
        localStorage.removeItem('erp_user')
        localStorage.removeItem('erp_permissions')
        localStorage.removeItem('erp_currentSchool')
      }
    } catch {
      localStorage.removeItem('erp_user')
      localStorage.removeItem('erp_permissions')
      localStorage.removeItem('erp_currentSchool')
    }
  }
}
