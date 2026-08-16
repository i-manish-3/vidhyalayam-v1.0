'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck,
  Copy,
  Fingerprint,
  GraduationCap,
  IdCard,
  Info,
  KeyRound,
  Loader2,
  Plus,
  RadioTower,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type StaffType = 'teacher' | 'staff'
type PersonType = 'student' | StaffType
type CredentialType = 'zkteco_pin' | 'fingerprint' | 'zkteco_card_no'
type StatusFilter = 'all' | 'assigned' | 'unassigned'
type Tab = 'students' | 'employees'

interface AttendanceDevice {
  id: string
  provider: string
  serialNo: string
  name: string
  location: string | null
  isActive: boolean
  lastSeenAt: string | null
  commKeyHash: string | null
  _count?: {
    credentials: number
    punchLogs: number
  }
}

interface EmployeePerson {
  staffType: StaffType
  staffId: string
  employeeId: string | null
  firstName: string
  lastName: string
  roleLabel: string | null
}

interface CredentialPerson {
  id: string
  type: PersonType
  name: string
  code: string | null
}

interface AttendanceCredential {
  id: string
  deviceId: string | null
  provider: string
  credentialType: string
  credentialValue: string
  personType: PersonType
  personId: string
  academicYear: string | null
  isActive: boolean
  assignedAt: string
  revokedAt: string | null
  device: {
    id: string
    name: string
    serialNo: string
    provider: string
  } | null
  person: CredentialPerson | null
}

interface ClassOption {
  id: string
  name: string
}

interface SectionOption {
  id: string
  name: string
  classId: string
}

interface StudentRow {
  id: string
  firstName: string
  lastName: string | null
  admissionNumber: string | null
  rollNumber: string | null
  isActive: boolean
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  fullName: string
}

interface AssignTarget {
  personType: PersonType
  personId: string
  name: string
  code: string | null
}

function todayString(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function personKey(person: Pick<EmployeePerson, 'staffType' | 'staffId'>): string {
  return `${person.staffType}:${person.staffId}`
}

function credentialKey(personType: PersonType, personId: string): string {
  return `${personType}:${personId}`
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

function initials(first?: string | null, last?: string | null): string {
  return `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.toUpperCase() || '··'
}

function credentialLabel(value: string): string {
  if (value === 'fingerprint') return 'Fingerprint'
  if (value === 'zkteco_card_no') return 'Card'
  return 'User/PIN'
}

export function AttendanceCredentialsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const loadedRef = useRef(false)
  const [tab, setTab] = useState<Tab>('students')

  const [devices, setDevices] = useState<AttendanceDevice[]>([])
  const [credentials, setCredentials] = useState<AttendanceCredential[]>([])
  const [people, setPeople] = useState<EmployeePerson[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)

  const [deviceId, setDeviceId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [studentClassId, setStudentClassId] = useState('')
  const [studentSectionId, setStudentSectionId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [empType, setEmpType] = useState<'all' | StaffType>('all')
  const [empSearch, setEmpSearch] = useState('')

  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null)
  const [dialogDeviceId, setDialogDeviceId] = useState('')
  const [dialogType, setDialogType] = useState<CredentialType>('zkteco_pin')
  const [dialogValue, setDialogValue] = useState('')
  const [saving, setSaving] = useState(false)

  const [showDeviceDialog, setShowDeviceDialog] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [deviceSerial, setDeviceSerial] = useState('')
  const [deviceLocation, setDeviceLocation] = useState('')
  const [deviceCommKey, setDeviceCommKey] = useState('')
  const [savingDevice, setSavingDevice] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [newDeviceKey, setNewDeviceKey] = useState<{ deviceId: string; key: string } | null>(null)
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null)
  const [rotatedKey, setRotatedKey] = useState<{ deviceId: string; key: string } | null>(null)

  const academicYear = useMemo(() => getCurrentAcademicYear(), [])

  const activeDevices = devices.filter((device) => device.isActive)
  const activeCredentials = credentials.filter((credential) => credential.isActive)

  const credentialByPerson = useMemo(() => {
    const map = new Map<string, AttendanceCredential>()
    for (const credential of activeCredentials) {
      map.set(credentialKey(credential.personType, credential.personId), credential)
    }
    return map
  }, [activeCredentials])

  const filteredSections = useMemo(
    () => sections.filter((section) => section.classId === studentClassId),
    [sections, studentClassId],
  )

  const loadData = useCallback(async () => {
    try {
      if (!loadedRef.current) setLoading(true)
      const [deviceRes, credentialRes, employeeRes, classRes, sectionRes] = await Promise.all([
        api.get<{ devices: AttendanceDevice[] }>('/api/school/attendance-devices'),
        api.get<{ credentials: AttendanceCredential[] }>('/api/school/attendance-credentials'),
        api.get<{ people: EmployeePerson[] }>('/api/school/employee-attendance', {
          date: todayString(),
          academicYear,
          staffType: 'all',
        }),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
        api.get<{ sections: SectionOption[] }>('/api/school/sections'),
      ])
      setDevices(deviceRes.devices)
      setCredentials(credentialRes.credentials)
      setPeople(employeeRes.people)
      setClasses(classRes.classes || [])
      setSections(sectionRes.sections || [])
      setDeviceId((current) => current || deviceRes.devices.find((device) => device.isActive)?.id || '')
    } catch (error) {
      toast({ title: 'Could not load attendance credentials', variant: 'destructive' })
    } finally {
      loadedRef.current = true
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!studentClassId) {
      setStudentSectionId('')
      return
    }
    if (studentSectionId && !sections.some((section) => section.id === studentSectionId && section.classId === studentClassId)) {
      setStudentSectionId('')
    }
  }, [studentClassId, studentSectionId, sections])

  useEffect(() => {
    let cancelled = false
    setStudentsLoading(true)
    const params: Record<string, string> = { minimal: 'true', limit: 'all', academicYear, isActive: 'true' }
    if (studentClassId) params.classId = studentClassId
    if (studentSectionId) params.sectionId = studentSectionId

    api
      .get<{ students: StudentRow[] }>('/api/school/students', params)
      .then((res) => {
        if (!cancelled) setStudents(res.students || [])
      })
      .catch(() => {
        if (!cancelled) toast({ title: 'Could not load students', variant: 'destructive' })
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [academicYear, studentClassId, studentSectionId, toast])

  const filteredStudents = useMemo(() => {
    let list = students
    const query = studentSearch.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (student) =>
          student.fullName.toLowerCase().includes(query) ||
          (student.admissionNumber || '').toLowerCase().includes(query) ||
          (student.rollNumber || '').toLowerCase().includes(query),
      )
    }
    if (statusFilter === 'assigned') list = list.filter((student) => credentialByPerson.has(credentialKey('student', student.id)))
    if (statusFilter === 'unassigned') list = list.filter((student) => !credentialByPerson.has(credentialKey('student', student.id)))
    return [...list].sort(
      (a, b) =>
        (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName),
    )
  }, [students, studentSearch, statusFilter, credentialByPerson])

  const empTypePeople = useMemo(() => people.filter((person) => empType === 'all' || person.staffType === empType), [people, empType])

  const filteredEmployees = useMemo(() => {
    let list = empTypePeople
    const query = empSearch.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (person) =>
          `${person.firstName} ${person.lastName}`.toLowerCase().includes(query) ||
          (person.employeeId || '').toLowerCase().includes(query),
      )
    }
    if (statusFilter === 'assigned') list = list.filter((person) => credentialByPerson.has(personKey(person)))
    if (statusFilter === 'unassigned') list = list.filter((person) => !credentialByPerson.has(personKey(person)))
    return [...list].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
  }, [empTypePeople, empSearch, statusFilter, credentialByPerson])

  const tabCredentials = useMemo(
    () =>
      activeCredentials.filter((credential) =>
        tab === 'students' ? credential.personType === 'student' : credential.personType !== 'student',
      ),
    [activeCredentials, tab],
  )

  async function createDevice() {
    if (!deviceName.trim() || !deviceSerial.trim()) return
    try {
      setSavingDevice(true)
      const result = await api.post<{ device: AttendanceDevice; commKey: string }>('/api/school/attendance-devices', {
        provider: 'zkteco_adms',
        name: deviceName.trim(),
        serialNo: deviceSerial.trim(),
        location: deviceLocation.trim() || null,
        commKey: deviceCommKey.trim() || undefined,
      })
      toast({ title: 'Attendance device added' })
      setShowDeviceDialog(false)
      setDeviceName('')
      setDeviceSerial('')
      setDeviceLocation('')
      setDeviceCommKey('')
      setNewDeviceKey({ deviceId: result.device.id, key: result.commKey })
      await loadData()
    } catch (error) {
      toast({
        title: 'Could not add attendance device',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingDevice(false)
    }
  }

  async function rotateCommKey(deviceId: string) {
    try {
      setRotatingKeyId(deviceId)
      const result = await api.post<{ commKey: string }>(`/api/school/attendance-devices/${deviceId}/commkey`)
      setRotatedKey({ deviceId, key: result.commKey })
      toast({ title: 'New comm key generated' })
      await loadData()
    } catch (error) {
      toast({
        title: 'Could not rotate comm key',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setRotatingKeyId(null)
    }
  }

  async function copyCommKey(key: string) {
    try {
      await navigator.clipboard.writeText(key)
      toast({ title: 'Comm key copied' })
    } catch {
      toast({ title: 'Could not copy comm key', variant: 'destructive' })
    }
  }

  function openAssign(target: AssignTarget) {
    setAssignTarget(target)
    setDialogDeviceId(deviceId || activeDevices[0]?.id || '')
    setDialogType('zkteco_pin')
    setDialogValue('')
  }

  async function saveAssign() {
    if (!assignTarget || !dialogDeviceId || !dialogValue.trim()) return
    try {
      setSaving(true)
      await api.post('/api/school/attendance-credentials', {
        deviceId: dialogDeviceId,
        provider: 'zkteco_adms',
        personType: assignTarget.personType,
        personId: assignTarget.personId,
        credentialType: dialogType,
        credentialValue: dialogValue.trim(),
      })
      toast({ title: 'Credential assigned' })
      setAssignTarget(null)
      await loadData()
    } catch (error) {
      toast({
        title: 'Could not assign credential',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function revokeCredential(credential: AttendanceCredential) {
    try {
      setRevokingId(credential.id)
      await api.patch(`/api/school/attendance-credentials/${credential.id}/revoke`, {
        reason: 'Revoked from credentials page',
      })
      toast({ title: 'Credential revoked' })
      await loadData()
    } catch (error) {
      toast({
        title: 'Could not revoke credential',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setRevokingId(null)
    }
  }

  const studentAssignedCount = students.filter((student) => credentialByPerson.has(credentialKey('student', student.id))).length
  const employeeAssignedCount = empTypePeople.filter((person) => credentialByPerson.has(personKey(person))).length
  const listCount = tab === 'students' ? students.length : empTypePeople.length
  const assignedCount = tab === 'students' ? studentAssignedCount : employeeAssignedCount
  const unassignedCount = listCount - assignedCount
  const coveragePercent = listCount > 0 ? Math.round((assignedCount / listCount) * 100) : 0

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* ── Branded Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -top-14 right-1/3 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-1/4 size-28 rounded-full bg-amber-300/10 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
              <Fingerprint className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Attendance Credentials</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                  {academicYear}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Link students and employees to ZKTeco device PINs, fingerprints, or cards.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 border border-white/30 bg-white/20 px-2.5 text-xs text-white shadow-sm backdrop-blur-sm hover:bg-white/30"
              onClick={loadData}
            >
              <RefreshCcw className="size-3.5" />
              Refresh
            </Button>
            <Button
              onClick={() => setShowDeviceDialog(true)}
              size="sm"
              className="h-8 gap-1.5 bg-white px-3 text-xs text-primary shadow-sm [background-image:none] hover:bg-white/90"
            >
              <Plus className="size-3.5" />
              Add Device
            </Button>
          </div>
        </div>
      </section>

      {/* ── No Devices Warning ──────────────────────────────────────── */}
      {activeDevices.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-3 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
            <RadioTower className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">No ZKTeco devices yet</p>
            <p className="mt-0.5 text-xs text-amber-700/70 dark:text-amber-400/70">
              Add one with the <b>Add Device</b> button above before assigning credentials.
            </p>
          </div>
        </div>
      )}

      {/* ── Configuration Bar ───────────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            {tab === 'students' ? (
              <>
                {/* Class */}
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Class</Label>
                  <Select value={studentClassId || 'all'} onValueChange={(value) => setStudentClassId(value === 'all' ? '' : value)}>
                    <SelectTrigger
                      leadingIcon={<UsersRound className="size-3.5 text-white" />}
                      leadingIconClassName="from-sky-500 to-cyan-600"
                      className="h-10 w-full border-sky-200 from-sky-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-sky-400 focus:ring-sky-400/20 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:w-[180px] sm:text-xs"
                    >
                      <SelectValue placeholder="All classes" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-sky-200/80 bg-white shadow-lg dark:border-sky-500/25 dark:bg-popover">
                      <SelectItem
                        value="all"
                        className="data-[state=checked]:bg-sky-50 data-[state=checked]:font-semibold data-[state=checked]:text-sky-700 dark:data-[state=checked]:bg-sky-500/15 dark:data-[state=checked]:text-sky-300"
                      >
                        All classes
                      </SelectItem>
                      {classes.map((cls) => (
                        <SelectItem
                          key={cls.id}
                          value={cls.id}
                          className="data-[state=checked]:bg-sky-50 data-[state=checked]:font-semibold data-[state=checked]:text-sky-700 dark:data-[state=checked]:bg-sky-500/15 dark:data-[state=checked]:text-sky-300"
                        >
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Section */}
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Section</Label>
                  <Select value={studentSectionId || 'all'} onValueChange={(value) => setStudentSectionId(value === 'all' ? '' : value)} disabled={!studentClassId}>
                    <SelectTrigger
                      leadingIcon={<GraduationCap className="size-3.5 text-white" />}
                      leadingIconClassName="from-violet-500 to-purple-600"
                      className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 disabled:opacity-60 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:w-[170px] sm:text-xs"
                    >
                      <SelectValue placeholder="All sections" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
                      <SelectItem
                        value="all"
                        className="data-[state=checked]:bg-violet-50 data-[state=checked]:font-semibold data-[state=checked]:text-violet-700 dark:data-[state=checked]:bg-violet-500/15 dark:data-[state=checked]:text-violet-300"
                      >
                        All sections
                      </SelectItem>
                      {filteredSections.map((section) => (
                        <SelectItem
                          key={section.id}
                          value={section.id}
                          className="data-[state=checked]:bg-violet-50 data-[state=checked]:font-semibold data-[state=checked]:text-violet-700 dark:data-[state=checked]:bg-violet-500/15 dark:data-[state=checked]:text-violet-300"
                        >
                          {section.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              /* Employee type */
              <div className="flex items-center gap-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</Label>
                <Select value={empType} onValueChange={(value) => setEmpType(value as 'all' | StaffType)}>
                  <SelectTrigger
                    leadingIcon={<UsersRound className="size-3.5 text-white" />}
                    leadingIconClassName="from-violet-500 to-purple-600"
                    className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:w-[170px] sm:text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
                    <SelectItem value="all">Teachers & Staff</SelectItem>
                    <SelectItem value="teacher">Teachers</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Device */}
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Device</Label>
              <Select value={deviceId} onValueChange={setDeviceId} disabled={activeDevices.length === 0}>
                <SelectTrigger
                  leadingIcon={<RadioTower className="size-3.5 text-white" />}
                  leadingIconClassName="from-teal-500 to-cyan-600"
                  className="h-10 w-full border-teal-200 from-teal-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-teal-400 focus:ring-teal-400/20 disabled:opacity-60 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:w-[190px] sm:text-xs"
                >
                  <SelectValue placeholder="Select device" />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-teal-200/80 bg-white shadow-lg dark:border-teal-500/25 dark:bg-popover">
                  {activeDevices.map((device) => (
                    <SelectItem
                      key={device.id}
                      value={device.id}
                      className="data-[state=checked]:bg-teal-50 data-[state=checked]:font-semibold data-[state=checked]:text-teal-700 dark:data-[state=checked]:bg-teal-500/15 dark:data-[state=checked]:text-teal-300"
                    >
                      {device.name} - {device.serialNo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger
                  leadingIcon={<BadgeCheck className="size-3.5 text-white" />}
                  leadingIconClassName="from-emerald-500 to-teal-600"
                  className="h-10 w-full border-emerald-200 from-emerald-50 via-white to-teal-50 px-2 text-sm shadow-sm focus:border-emerald-400 focus:ring-emerald-400/20 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-input/30 dark:to-teal-500/10 sm:h-9 sm:w-[150px] sm:text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-emerald-200/80 bg-white shadow-lg dark:border-emerald-500/25 dark:bg-popover">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unassigned">Not assigned</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Stats ───────────────────────────────────────────── */}
      {listCount > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {/* Total */}
          <div className="flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
              {tab === 'students' ? <GraduationCap className="size-4" /> : <UsersRound className="size-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-lg font-bold leading-tight text-sky-700 dark:text-sky-300">{listCount}</p>
            </div>
          </div>

          {/* Assigned */}
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <BadgeCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned</p>
              <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-300">{assignedCount}</p>
            </div>
          </div>

          {/* Not assigned */}
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <IdCard className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Not assigned</p>
              <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-300">{unassignedCount}</p>
            </div>
          </div>

          {/* Coverage */}
          <div className="col-span-2 rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-cyan-500/10 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                <Fingerprint className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Coverage</p>
                <p className={cn('text-lg font-bold leading-tight', coveragePercent === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-700 dark:text-teal-300')}>
                  {coveragePercent}%
                </p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-teal-100 dark:bg-teal-950/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-300"
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Main Grid ───────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {/* ── People List Card ────────────────────────────────────── */}
          <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
                  <TabsList>
                    <TabsTrigger value="students">
                      <GraduationCap className="size-4" />
                      Students
                    </TabsTrigger>
                    <TabsTrigger value="employees">
                      <UsersRound className="size-4" />
                      Employees
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex flex-wrap items-center gap-2">
                  {studentsLoading && (
                    <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {listCount} people
                  </Badge>
                  <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal">
                    <BadgeCheck className="size-3 text-emerald-600" />
                    {assignedCount} assigned
                  </Badge>
                </div>
              </div>
              {/* Search */}
              <div className="relative mt-3">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={tab === 'students' ? 'Search student… name / admission no / roll' : 'Search employee… name / id'}
                  value={tab === 'students' ? studentSearch : empSearch}
                  onChange={(event) => (tab === 'students' ? setStudentSearch(event.target.value) : setEmpSearch(event.target.value))}
                  className="h-9 w-full bg-white pl-8 pr-8 text-sm dark:bg-input/30"
                />
                {(tab === 'students' ? studentSearch : empSearch) && (
                  <button
                    onClick={() => (tab === 'students' ? setStudentSearch('') : setEmpSearch(''))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Column headers */}
            <div className="hidden items-center gap-3 border-b border-cyan-200/70 bg-gradient-to-r from-cyan-100/80 via-sky-50 to-violet-100/70 px-5 py-2 dark:border-cyan-500/20 dark:from-cyan-500/15 dark:via-sky-500/10 dark:to-violet-500/15 lg:flex">
              <span className="w-8 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</span>
              <span className="w-10" />
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tab === 'students' ? 'Student' : 'Employee'}
              </span>
              <span className="w-[150px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tab === 'students' ? 'Class · Section' : 'Role'}
              </span>
              <span className="w-[230px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
              <span className="w-[90px] text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {tab === 'students' ? (
                studentsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading students…
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">No students match this selection.</div>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const credential = credentialByPerson.get(credentialKey('student', student.id))
                    return (
                      <div
                        key={student.id}
                        className={cn(
                          'px-3 py-3 transition-all duration-150 sm:px-5',
                          credential
                            ? 'border-l-2 border-emerald-300 bg-gradient-to-r from-emerald-50/60 via-white to-white dark:border-emerald-700 dark:from-emerald-950/30 dark:via-card dark:to-card'
                            : '',
                        )}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                          <div className="flex min-w-0 items-center gap-3 lg:flex-1">
                            <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-foreground lg:w-8">{idx + 1}</span>
                            <Avatar className="size-10 shrink-0 lg:size-9">
                              <AvatarFallback
                                className={cn(
                                  'text-[11px] font-bold',
                                  credential
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                    : 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
                                )}
                              >
                                {initials(student.firstName, student.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold leading-tight">{student.fullName}</p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {[student.admissionNumber, student.rollNumber ? `Roll ${student.rollNumber}` : null]
                                  .filter(Boolean)
                                  .join(' · ') || 'No admission no'}
                              </p>
                            </div>
                          </div>

                          <div className="truncate text-xs text-muted-foreground lg:w-[150px] lg:shrink-0">
                            {student.class?.name}
                            {student.section?.name ? ` - ${student.section.name}` : ''}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 lg:w-[230px] lg:shrink-0">
                            <Badge variant={credential ? 'success' : 'warning'} className="gap-1">
                              {credential ? <BadgeCheck className="size-3" /> : <IdCard className="size-3" />}
                              {credential ? 'Assigned' : 'Not assigned'}
                            </Badge>
                            {credential && (
                              <span className="font-mono text-xs text-muted-foreground">
                                {credential.credentialValue} · {credentialLabel(credential.credentialType)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-2 lg:w-[90px] lg:shrink-0">
                            {credential ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => revokeCredential(credential)}
                                disabled={revokingId === credential.id}
                                title="Revoke credential"
                              >
                                {revokingId === credential.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-8 gap-1 bg-gradient-to-r from-teal-600 to-cyan-600 px-3 text-xs text-white shadow-sm hover:from-teal-700 hover:to-cyan-700"
                                onClick={() =>
                                  openAssign({
                                    personType: 'student',
                                    personId: student.id,
                                    name: student.fullName,
                                    code: student.admissionNumber,
                                  })
                                }
                                disabled={activeDevices.length === 0}
                              >
                                <Plus className="size-3.5" />
                                Assign
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )
              ) : filteredEmployees.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No employees match this selection.</div>
              ) : (
                filteredEmployees.map((person, idx) => {
                  const credential = credentialByPerson.get(personKey(person))
                  return (
                    <div
                      key={personKey(person)}
                      className={cn(
                        'px-3 py-3 transition-all duration-150 sm:px-5',
                        credential
                          ? 'border-l-2 border-emerald-300 bg-gradient-to-r from-emerald-50/60 via-white to-white dark:border-emerald-700 dark:from-emerald-950/30 dark:via-card dark:to-card'
                          : '',
                      )}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 items-center gap-3 lg:flex-1">
                          <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-foreground lg:w-8">{idx + 1}</span>
                          <Avatar className="size-10 shrink-0 lg:size-9">
                            <AvatarFallback
                              className={cn(
                                'text-[11px] font-bold',
                                credential
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                  : person.staffType === 'teacher'
                                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
                                    : 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
                              )}
                            >
                              {initials(person.firstName, person.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight">
                              {person.firstName} {person.lastName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {person.staffType === 'teacher' ? 'Teacher' : 'Staff'}
                              {person.employeeId ? ` · ${person.employeeId}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="truncate text-xs text-muted-foreground lg:w-[150px] lg:shrink-0">{person.roleLabel || '—'}</div>

                        <div className="flex flex-wrap items-center gap-2 lg:w-[230px] lg:shrink-0">
                          <Badge variant={credential ? 'success' : 'warning'} className="gap-1">
                            {credential ? <BadgeCheck className="size-3" /> : <IdCard className="size-3" />}
                            {credential ? 'Assigned' : 'Not assigned'}
                          </Badge>
                          {credential && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {credential.credentialValue} · {credentialLabel(credential.credentialType)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 lg:w-[90px] lg:shrink-0">
                          {credential ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => revokeCredential(credential)}
                              disabled={revokingId === credential.id}
                              title="Revoke credential"
                            >
                              {revokingId === credential.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 gap-1 bg-gradient-to-r from-teal-600 to-cyan-600 px-3 text-xs text-white shadow-sm hover:from-teal-700 hover:to-cyan-700"
                              onClick={() =>
                                openAssign({
                                  personType: person.staffType,
                                  personId: person.staffId,
                                  name: `${person.firstName} ${person.lastName}`,
                                  code: person.employeeId,
                                })
                              }
                              disabled={activeDevices.length === 0}
                            >
                              <Plus className="size-3.5" />
                              Assign
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer legend */}
            <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Assigned: <strong className="text-foreground">{assignedCount}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-400" />
                  Not assigned: <strong className="text-foreground">{unassignedCount}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300">
                <RadioTower className="size-3.5" />
                {activeDevices.length === 0
                  ? 'No device configured'
                  : deviceId
                    ? `Assigning to ${activeDevices.find((device) => device.id === deviceId)?.name || 'selected device'}`
                    : 'Select a device to assign'}
              </div>
            </div>
          </Card>

          {/* ── Linked Credentials Card ─────────────────────────────── */}
          <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-purple-500/10">
            <div className="flex items-center justify-between border-b border-violet-200/70 bg-gradient-to-r from-violet-100/80 via-purple-50 to-violet-100/70 px-4 py-3 dark:border-violet-500/20 dark:from-violet-500/15 dark:via-purple-500/10 dark:to-violet-500/15 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                  <IdCard className="size-4 text-white" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{tab === 'students' ? 'Linked Student Credentials' : 'Linked Employee Credentials'}</h3>
                  <p className="text-[10px] text-muted-foreground">Currently active ZKTeco links</p>
                </div>
              </div>
              <Badge variant="secondary" className="h-5 text-[10px]">{tabCredentials.length}</Badge>
            </div>
            <div className="divide-y divide-border">
              {tabCredentials.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                  No linked credentials{tab === 'students' ? ' for students' : ' for employees'}.
                </div>
              ) : (
                tabCredentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg',
                          credential.personType === 'teacher'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
                        )}
                      >
                        {credential.personType === 'teacher' ? <UserRound className="size-4" /> : <UsersRound className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{credential.person?.name || credential.personId}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {credential.personType === 'teacher' ? 'Teacher' : credential.personType === 'staff' ? 'Staff' : 'Student'}
                          {credential.person?.code ? ` - ${credential.person.code}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 sm:w-40 sm:shrink-0">
                      <div className="truncate text-xs font-medium text-muted-foreground">{credential.device?.name || 'Any ZKTeco device'}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground/70">
                        {credential.device?.serialNo || credential.provider}
                      </div>
                    </div>
                    <div className="min-w-0 sm:w-28 sm:shrink-0">
                      <div className="truncate font-mono text-sm">{credential.credentialValue}</div>
                      <div className="text-xs text-muted-foreground">{credentialLabel(credential.credentialType)}</div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => revokeCredential(credential)}
                        disabled={revokingId === credential.id}
                        title="Revoke credential"
                      >
                        {revokingId === credential.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* ── Devices Card ──────────────────────────────────────────── */}
        <Card className="h-fit gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-cyan-500/10">
          <div className="flex items-center justify-between border-b border-teal-200/70 bg-gradient-to-r from-teal-100/80 via-cyan-50 to-teal-100/70 px-4 py-3 dark:border-teal-500/20 dark:from-teal-500/15 dark:via-cyan-500/10 dark:to-teal-500/15">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                <RadioTower className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Devices</h3>
                <p className="text-[10px] text-muted-foreground">ZKTeco reader health</p>
              </div>
            </div>
            <Badge variant="secondary" className="h-5 text-[10px]">{devices.length}</Badge>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            {newDeviceKey && devices.some((device) => device.id === newDeviceKey.deviceId) && (
              <div className="rounded-lg border border-teal-300/70 bg-teal-50 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-teal-200">
                  <ShieldCheck className="size-3.5" />
                  Comm key for {devices.find((device) => device.id === newDeviceKey.deviceId)?.name}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-teal-200 bg-white px-2 py-1.5 font-mono text-xs text-teal-900 shadow-sm dark:border-teal-500/25 dark:bg-background dark:text-teal-100">
                    {newDeviceKey.key}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1 border-teal-300 px-2 text-xs text-teal-800 hover:bg-teal-100 dark:border-teal-500/40 dark:text-teal-200"
                    onClick={() => copyCommKey(newDeviceKey.key)}
                  >
                    <Copy className="size-3" />
                    Copy
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-teal-700/70 dark:text-teal-300/70">
                  Enter this key on the device: Comm → Cloud Server → Comm Key.
                </p>
              </div>
            )}

            {devices.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No devices</div>
            ) : (
              devices.map((device) => {
                const rotated = rotatedKey?.deviceId === device.id
                return (
                  <div key={device.id} className="rounded-lg border border-teal-200/70 bg-white/70 p-3 shadow-sm dark:border-teal-500/20 dark:bg-background/35">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{device.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{device.serialNo}</p>
                      </div>
                      <Badge variant={device.isActive ? 'success' : 'secondary'}>{device.isActive ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <RadioTower className="size-3" />
                        {device.location || 'No location'}
                      </span>
                      <span className="text-right">{device._count?.credentials ?? 0} links</span>
                      <span className="col-span-2 flex items-center gap-1">
                        <RefreshCcw className="size-3" />
                        Last seen: {formatDateTime(device.lastSeenAt)}
                      </span>
                      <span className="col-span-2 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1">
                          <KeyRound className="size-3" />
                          {device.commKeyHash ? 'Comm key set' : 'No comm key'}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 border-teal-300 px-2 text-[10px] text-teal-800 hover:bg-teal-100 dark:border-teal-500/40 dark:text-teal-200"
                          onClick={() => rotateCommKey(device.id)}
                          disabled={rotatingKeyId === device.id}
                          title="Generate a new comm key (update it on the device)"
                        >
                          {rotatingKeyId === device.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <KeyRound className="size-3" />
                          )}
                          Rotate key
                        </Button>
                      </span>
                    </div>
                    {rotated && (
                      <div className="mt-2 rounded-md border border-amber-300/70 bg-amber-50 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                          <ShieldCheck className="size-3.5" />
                          New comm key — update it on the device now
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-md border border-amber-200 bg-white px-2 py-1.5 font-mono text-xs text-amber-900 shadow-sm dark:border-amber-500/25 dark:bg-background dark:text-amber-100">
                            {rotatedKey?.key}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 gap-1 border-amber-300 px-2 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-200"
                            onClick={() => rotatedKey && copyCommKey(rotatedKey.key)}
                          >
                            <Copy className="size-3" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>

      {/* ── Assign Credential Dialog ────────────────────────────────── */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-teal-500/20 bg-card p-0 shadow-2xl shadow-teal-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0d9488_0%,#0891b2_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-teal-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <IdCard className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Assign Credential</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Link {assignTarget?.personType === 'student' ? 'a student' : 'an employee'} to a ZKTeco device PIN.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {assignTarget && (
            <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-teal-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
              <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-teal-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-teal-500/10">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
                <div className="relative mb-3 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-sm"><UserRound className="size-4 text-white" /></span>
                  <div><h3 className="text-sm font-semibold">Person</h3><p className="text-[10px] text-muted-foreground">Verify who you&apos;re linking before continuing</p></div>
                </div>
                <div className="relative flex items-center gap-3">
                  <Avatar className="size-12 border-2 border-white shadow-md ring-2 ring-sky-200/70 dark:border-card dark:ring-sky-500/25">
                    <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-600 text-sm font-bold text-white">{initials(assignTarget.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{assignTarget.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {assignTarget.personType === 'student' ? 'Student' : assignTarget.personType === 'teacher' ? 'Teacher' : 'Staff'}
                      {assignTarget.code ? ` - ${assignTarget.code}` : ''}
                    </p>
                  </div>
                </div>
              </section>

              <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-blue-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-blue-500/10">
                <div aria-hidden className="absolute -bottom-10 left-12 size-24 rounded-full bg-violet-200/30 blur-xl dark:bg-violet-500/10" />
                <div className="relative mb-3 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-sm"><RadioTower className="size-4 text-white" /></span>
                  <div><h3 className="text-sm font-semibold">Device & Credential</h3><p className="text-[10px] text-muted-foreground">Match the user ID set on the physical ZKTeco device</p></div>
                </div>
                <div className="relative grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Device</Label>
                    <Select value={dialogDeviceId} onValueChange={setDialogDeviceId}>
                      <SelectTrigger className="h-9 w-full bg-white shadow-sm dark:bg-input/30">
                        <SelectValue placeholder="Select device" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeDevices.map((device) => (
                          <SelectItem key={device.id} value={device.id}>
                            {device.name} - {device.serialNo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Credential Type</Label>
                    <Select value={dialogType} onValueChange={(value) => setDialogType(value as CredentialType)}>
                      <SelectTrigger className="h-9 w-full bg-white shadow-sm dark:bg-input/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zkteco_pin">ZKTeco User/PIN</SelectItem>
                        <SelectItem value="fingerprint">Fingerprint PIN</SelectItem>
                        <SelectItem value="zkteco_card_no">Card PIN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="relative mt-3 space-y-1.5">
                  <Label className="text-xs">ZKTeco User ID / PIN <span className="text-destructive">*</span></Label>
                  <Input
                    value={dialogValue}
                    onChange={(event) => setDialogValue(event.target.value)}
                    placeholder="e.g. 1001"
                    className="h-9 bg-white font-mono shadow-sm dark:bg-input/30"
                  />
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="size-3.5 shrink-0 text-violet-500" />
                    Use the same user ID (PIN) you set for this person on the physical ZKTeco device.
                  </p>
                </div>
              </section>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setAssignTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-gradient-to-r from-teal-600 to-cyan-600 px-4 text-xs text-white shadow-sm transition-all hover:from-teal-700 hover:to-cyan-700"
              onClick={saveAssign}
              disabled={saving || !dialogDeviceId || !dialogValue.trim() || !assignTarget}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />}
              {saving ? 'Assigning…' : 'Assign Credential'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Device Dialog ───────────────────────────────────────── */}
      <Dialog open={showDeviceDialog} onOpenChange={setShowDeviceDialog}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-teal-500/20 bg-card p-0 shadow-2xl shadow-teal-500/15 sm:max-w-lg [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0d9488_0%,#0891b2_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-teal-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <RadioTower className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Add ZKTeco Device</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Register a fingerprint + card reader so it can push punch records.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-teal-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-4 shadow-sm dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-cyan-500/10">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-teal-200/35 blur-xl dark:bg-teal-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm"><RadioTower className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Device Details</h3><p className="text-[10px] text-muted-foreground">Use the serial number printed on the device label</p></div>
              </div>
              <div className="relative space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Device Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={deviceName}
                    onChange={(event) => setDeviceName(event.target.value)}
                    placeholder="Main Gate"
                    className="h-9 bg-white shadow-sm dark:bg-input/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Serial Number <span className="text-destructive">*</span></Label>
                  <Input
                    value={deviceSerial}
                    onChange={(event) => setDeviceSerial(event.target.value)}
                    placeholder="TEST-ZK-001"
                    className="h-9 bg-white font-mono shadow-sm dark:bg-input/30"
                  />
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="size-3.5 shrink-0 text-teal-500" />
                    The device pushes punches to /iclock/cdata using this serial number.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Comm Key (optional)</Label>
                  <Input
                    value={deviceCommKey}
                    onChange={(event) => setDeviceCommKey(event.target.value)}
                    placeholder="Leave blank to auto-generate"
                    className="h-9 bg-white font-mono shadow-sm dark:bg-input/30"
                  />
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="size-3.5 shrink-0 text-teal-500" />
                    Set the same key on the device (Comm → Cloud Server → Comm Key). Punches without it are rejected.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location</Label>
                  <Input
                    value={deviceLocation}
                    onChange={(event) => setDeviceLocation(event.target.value)}
                    placeholder="Main Gate"
                    className="h-9 bg-white shadow-sm dark:bg-input/30"
                  />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setShowDeviceDialog(false)} disabled={savingDevice}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-gradient-to-r from-teal-600 to-cyan-600 px-4 text-xs text-white shadow-sm transition-all hover:from-teal-700 hover:to-cyan-700"
              onClick={createDevice}
              disabled={savingDevice || !deviceName.trim() || !deviceSerial.trim()}
            >
              {savingDevice ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {savingDevice ? 'Saving…' : 'Add Device'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}