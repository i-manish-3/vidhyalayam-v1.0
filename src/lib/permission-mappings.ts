/**
 * Maps sidebar menu items to the permission codes required to see them.
 * This is used to filter the sidebar based on the user's effective permissions.
 * 
 * Key: page name (from store.ts PageName)
 * Value: array of permission codes — if the user has ANY of these, the item is visible
 * 
 * Special values:
 * - null = always visible (dashboard, etc.)
 * - '*' = visible if user has wildcard (super admin)
 */

// Module-level permission prefixes for sidebar items
// A sidebar item is visible if the user has at least one permission with the matching module prefix
const MODULE_PERMISSION_MAP: Record<string, string[]> = {
  // Students & Admissions
  'admission-form': ['admission:read', 'admission:create', 'student:create'],
  'bulk-admission': ['admission:create', 'student:create'],
  'students': ['student:read', 'student:create'],
  'student-detail': ['student:read'],
  'edit-student': ['student:read', 'student:update'],

  // People
  'teachers': ['teacher:read', 'teacher:create'],
  'add-teacher': ['teacher:create'],
  'parents': ['parent:read', 'parent:create'],

  // Academic
  'classes': ['class:read', 'class:create'],
  'promote-student': ['class:read', 'student:update', 'admission:update'],
  'assign-roll-numbers': ['class:read', 'student:update'],
  'subjects': ['subject:read', 'subject:create'],
  'academic-years': ['settings:read', 'settings:update'],
  'holidays': ['holiday:read', 'holiday:manage', 'settings:read', 'settings:update'],
  'add-subject': ['subject:read', 'subject:create'],
  'edit-subject': ['subject:read', 'subject:update'],
  'add-class': ['class:read', 'class:create'],
  'edit-class': ['class:read', 'class:update'],
  'attendance': ['attendance:read', 'attendance:mark'],
  'mark-attendance': ['attendance:mark'],
  'view-attendance': ['attendance:read'],
  'attendance-audit-log': ['attendance:audit:view'],
  'attendance-reports': ['attendance:report:view'],
  'attendance-kiosk': ['attendance:mark'],
  'rfid-devices': ['rfid:devices:manage'],
  'student-rfid-cards': ['rfid:cards:read', 'rfid:cards:manage'],
  'rfid-card-assign': ['rfid:cards:manage'],
  'rfid-audit': ['rfid:taps:view', 'attendance:audit:view'],
  'timetable': ['timetable:read', 'timetable:create'],
  'exams': ['exam:read', 'exam:create'],
  'exam-results': ['exam:read', 'exam:results', 'exam:result:view'],

  // Exam Module (Phase 1+)
  'exam-dashboard': ['exam:read'],
  'exam-paradigms': ['exam:read', 'exam:configure'],
  'exam-paradigm-edit': ['exam:configure'],
  'exam-groups': ['exam:read', 'exam:configure'],
  'exam-list': ['exam:read'],
  'exam-create': ['exam:create'],
  'exam-edit': ['exam:update'],
  'exam-configure': ['exam:configure'],
  'exam-schedule': ['exam:schedule'],
  'exam-marks-entry': ['exam:marks:enter', 'exam:marks:submit', 'exam:marks:lock'],
  'exam-grade-scales': ['exam:gradescale:manage', 'exam:read'],
  'exam-grade-scale-edit': ['exam:gradescale:manage'],
  'exam-result-preview': ['exam:result:view', 'exam:result:compute'],
  'exam-published-results': ['exam:result:view'],
  'exam-report-card-templates': ['exam:reportcard:manage'],
  'exam-report-card-template-edit': ['exam:reportcard:manage'],
  'exam-audit-log': ['exam:audit:view'],
  'teacher-subject-assignments': ['exam:configure', 'role:read'],
  'student-subject-mappings': ['exam:configure', 'student:read'],

  // Fees
  'fees-heads': ['fees:read'],
  'fees-groups': ['fees:read'],
  'fees-structures': ['fees:read'],
  'fee-collections': ['fees:read', 'fees:collect'],
  'fee-details': ['fees:read'],
  'fee-change-group': ['fees:change-group'],
  'fee-demand-config': ['fees:read'],
  'fee-demand-slips': ['fees:read'],
  'fee-audit-log': ['fees:read', 'fees:audit'],
  'fee-reports': ['fees:read'],

  // Salary
  'salary': ['salary:read'],
  'salary-structure': ['salary:read'],
  'salary-payments': ['salary:read', 'salary:pay'],
  'salary-advance': ['salary:read', 'salary:advance'],

  // Resources
  'transport': ['transport:read', 'transport:create'],
  'add-transport-route': ['transport:create'],
  'transport-annual-setup': ['transport:annual-setup'],
  'drivers': ['transport:read', 'transport:create'],
  'add-driver': ['transport:create'],
  'library': ['library:read', 'library:create'],
  'inventory': ['inventory:read', 'inventory:create'],
  'petty-cash': ['petty_cash:read', 'petty_cash:create'],

  // Communication
  'notifications': ['notification:read'],
  'announcements': ['announcement:read', 'announcement:create'],

  // Student ID Cards
  'id-cards': ['idcard:read', 'idcard:generate', 'idcard:print'],
  'id-card-templates': ['idcard:read', 'idcard:template:create', 'idcard:template:update'],
  'id-card-template-edit': ['idcard:template:create', 'idcard:template:update'],
  'id-card-generate': ['idcard:generate'],

  // Admin
  'settings': ['settings:read', 'settings:update'],
  'school-roles': ['role:read', 'role:create'],
  'school-permissions': ['role:read', 'permission:assign'],
  'school-users': ['role:read'],
  'staff': ['role:read'],
  'staff-create': ['role:read', 'role:create'],
  'staff-detail': ['role:read'],

  // Teacher-specific
  'my-classes': ['attendance:read', 'attendance:mark'],
  'my-attendance': ['attendance:read'],
  'my-children': ['student:read'],

  // ID Card subpages not declared earlier in the map
  'id-card-template-new': ['idcard:template:create'],
  'id-card-showcase': ['idcard:read', 'idcard:template:create'],

  // Super-admin only (no permission gating needed)
  'contact-requests': [],
}

// Menu labels that represent a parent group containing children
// The parent is visible if ANY child is visible
const PARENT_MENU_MODULES: Record<string, string> = {
  'Students': 'admission-form', // visible if admission-form OR students is visible
  'Academics': 'subjects',
  'Fees': 'fees-heads',
  'Salary': 'salary-structure',
  'Roles & Permissions': 'school-roles',
  'Audit Logs': 'attendance-audit-log',
  'ID Cards': 'id-cards',
  'Exams': 'exam-dashboard',
}

/**
 * Check if a specific page should be visible based on user permissions.
 *
 * @param page - The page name from the sidebar
 * @param permissions - Array of permission codes the user has
 * @param role - The user's role
 * @param permissionsLoaded - Whether permissions have finished loading. While
 *   `false`, the function avoids hiding items (prevents a flash of empty
 *   sidebar between login and the /permissions API resolving). Once `true`,
 *   the user is properly gated even when the array is empty — defaults to
 *   `true` for backwards compatibility with non-loading call sites.
 * @returns true if the page should be visible
 */
export function isPageVisible(
  page: string,
  permissions: string[],
  role: string,
  permissionsLoaded = true,
): boolean {
  // SUPER_ADMIN always sees everything
  if (role === 'SUPER_ADMIN') return true

  // Dashboard is always visible
  if (page === 'dashboard') return true

  // If user has wildcard permissions, show everything
  if (permissions.includes('*')) return true

  // Only fall back to "show everything" while permissions are still loading.
  // Once load completes, an empty permissions array means "no access" and we
  // gate accordingly — fixes the issue where a brand-new role with one
  // permission would still see the entire sidebar.
  if (!permissionsLoaded) return true

  // Check if the page requires specific permissions
  const requiredPerms = MODULE_PERMISSION_MAP[page]
  if (!requiredPerms) {
    // No mapping = always visible (e.g., super admin pages that are already filtered by role)
    return true
  }

  // User must have at least one of the required permissions
  return requiredPerms.some(perm => permissions.includes(perm))
}

/**
 * Check if a parent menu (with children) should be visible.
 * The parent is visible if ANY of its children are visible.
 * 
 * @param parentLabel - The parent menu label
 * @param childPages - Array of child page names
 * @param permissions - Array of permission codes the user has
 * @param role - The user's role
 * @returns true if the parent menu should be visible
 */
export function isParentMenuVisible(
  parentLabel: string,
  childPages: string[],
  permissions: string[],
  role: string
): boolean {
  // If any child is visible, the parent is visible
  return childPages.some(page => isPageVisible(page, permissions, role))
}
