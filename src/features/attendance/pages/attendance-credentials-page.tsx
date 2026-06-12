'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Fingerprint,
  IdCard,
  Plus,
  RadioTower,
  RefreshCcw,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

type StaffType = 'teacher' | 'staff'
type PersonType = 'student' | StaffType

interface AttendanceDevice {
  id: string
  provider: string
  serialNo: string
  name: string
  location: string | null
  isActive: boolean
  lastSeenAt: string | null
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

function todayString(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function personKey(person: Pick<EmployeePerson, 'staffType' | 'staffId'>): string {
  return `${person.staffType}:${person.staffId}`
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

export function AttendanceCredentialsPage() {
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<AttendanceDevice[]>([])
  const [credentials, setCredentials] = useState<AttendanceCredential[]>([])
  const [people, setPeople] = useState<EmployeePerson[]>([])
  const [staffType, setStaffType] = useState<'all' | StaffType>('all')
  const [deviceId, setDeviceId] = useState('')
  const [personId, setPersonId] = useState('')
  const [credentialValue, setCredentialValue] = useState('')
  const [credentialType, setCredentialType] = useState<'zkteco_pin' | 'fingerprint' | 'zkteco_card_no'>('zkteco_pin')
  const [savingCredential, setSavingCredential] = useState(false)
  const [showDeviceDialog, setShowDeviceDialog] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [deviceSerial, setDeviceSerial] = useState('')
  const [deviceLocation, setDeviceLocation] = useState('')
  const [savingDevice, setSavingDevice] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const academicYear = useMemo(() => getCurrentAcademicYear(), [])
  const filteredPeople = useMemo(
    () => people.filter((person) => staffType === 'all' || person.staffType === staffType),
    [people, staffType],
  )
  const activeDevices = devices.filter((device) => device.isActive)
  const activeCredentials = credentials.filter((credential) => credential.isActive)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [deviceRes, credentialRes, employeeRes] = await Promise.all([
        api.get<{ devices: AttendanceDevice[] }>('/api/school/attendance-devices'),
        api.get<{ credentials: AttendanceCredential[] }>('/api/school/attendance-credentials'),
        api.get<{ people: EmployeePerson[] }>('/api/school/employee-attendance', {
          date: todayString(),
          academicYear,
          staffType: 'all',
        }),
      ])
      setDevices(deviceRes.devices)
      setCredentials(credentialRes.credentials)
      setPeople(employeeRes.people)
      setDeviceId((current) => current || deviceRes.devices.find((device) => device.isActive)?.id || '')
    } catch (error) {
      toast.error('Could not load attendance credentials.')
    } finally {
      setLoading(false)
    }
  }, [academicYear])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (personId && !filteredPeople.some((person) => personKey(person) === personId)) {
      setPersonId('')
    }
  }, [filteredPeople, personId])

  async function createDevice() {
    if (!deviceName.trim() || !deviceSerial.trim()) return
    try {
      setSavingDevice(true)
      await api.post('/api/school/attendance-devices', {
        provider: 'zkteco_adms',
        name: deviceName.trim(),
        serialNo: deviceSerial.trim(),
        location: deviceLocation.trim() || null,
      })
      toast.success('Attendance device added.')
      setShowDeviceDialog(false)
      setDeviceName('')
      setDeviceSerial('')
      setDeviceLocation('')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add attendance device.')
    } finally {
      setSavingDevice(false)
    }
  }

  async function saveCredential() {
    const person = people.find((item) => personKey(item) === personId)
    if (!deviceId || !person || !credentialValue.trim()) return

    try {
      setSavingCredential(true)
      await api.post('/api/school/attendance-credentials', {
        deviceId,
        provider: 'zkteco_adms',
        personType: person.staffType,
        personId: person.staffId,
        credentialType,
        credentialValue: credentialValue.trim(),
      })
      toast.success('Employee credential linked.')
      setCredentialValue('')
      setPersonId('')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not link credential.')
    } finally {
      setSavingCredential(false)
    }
  }

  async function revokeCredential(credential: AttendanceCredential) {
    try {
      setRevokingId(credential.id)
      await api.patch(`/api/school/attendance-credentials/${credential.id}/revoke`, {
        reason: 'Revoked from credentials page',
      })
      toast.success('Credential revoked.')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke credential.')
    } finally {
      setRevokingId(null)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Attendance Credentials</h1>
          <p className="text-xs text-muted-foreground">ZKTeco devices, employee PINs, fingerprint and card links</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} className="gap-2">
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowDeviceDialog(true)} className="gap-2">
            <Plus className="size-4" />
            Device
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="size-4" />
              Link Employee Credential
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Device</Label>
                <Select value={deviceId} onValueChange={setDeviceId}>
                  <SelectTrigger>
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

              <div className="space-y-2">
                <Label>Employee Type</Label>
                <Select value={staffType} onValueChange={(value) => setStaffType(value as 'all' | StaffType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Teachers & Staff</SelectItem>
                    <SelectItem value="teacher">Teachers</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPeople.map((person) => (
                      <SelectItem key={personKey(person)} value={personKey(person)}>
                        {person.firstName} {person.lastName}
                        {person.employeeId ? ` - ${person.employeeId}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Credential</Label>
                <Select value={credentialType} onValueChange={(value) => setCredentialType(value as typeof credentialType)}>
                  <SelectTrigger>
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

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label>ZKTeco User/PIN</Label>
                <Input
                  value={credentialValue}
                  onChange={(event) => setCredentialValue(event.target.value)}
                  placeholder="1001"
                  className="font-mono"
                />
              </div>
              <Button
                onClick={saveCredential}
                disabled={!deviceId || !personId || !credentialValue.trim() || savingCredential}
                className="gap-2"
              >
                <BadgeCheck className="size-4" />
                {savingCredential ? 'Saving...' : 'Link'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTower className="size-4" />
              Devices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {devices.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No devices</div>
            ) : (
              devices.map((device) => (
                <div key={device.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{device.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{device.serialNo}</div>
                    </div>
                    <Badge variant={device.isActive ? 'default' : 'secondary'}>{device.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>{device.location || 'No location'}</span>
                    <span className="text-right">{device._count?.credentials ?? 0} links</span>
                    <span className="col-span-2">Last seen: {formatDateTime(device.lastSeenAt)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="size-4" />
            Linked Credentials
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeCredentials.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No linked credentials</div>
          ) : (
            <div className="divide-y rounded-md border">
              {activeCredentials.map((credential) => (
                <div key={credential.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_160px_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', credential.personType === 'teacher' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700')}>
                      {credential.personType === 'teacher' ? <UserRound className="size-4" /> : <UsersRound className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{credential.person?.name || credential.personId}</div>
                      <div className="text-xs text-muted-foreground">
                        {credential.personType === 'teacher' ? 'Teacher' : credential.personType === 'staff' ? 'Staff' : 'Student'}
                        {credential.person?.code ? ` - ${credential.person.code}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm">{credential.device?.name || 'Any ZKTeco device'}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{credential.device?.serialNo || credential.provider}</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm">{credential.credentialValue}</div>
                    <div className="text-xs text-muted-foreground">{credentialLabel(credential.credentialType)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => revokeCredential(credential)}
                    disabled={revokingId === credential.id}
                    title="Revoke credential"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDeviceDialog} onOpenChange={setShowDeviceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add ZKTeco Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Main Gate" />
            </div>
            <div className="space-y-2">
              <Label>Serial Number</Label>
              <Input value={deviceSerial} onChange={(event) => setDeviceSerial(event.target.value)} placeholder="TEST-ZK-001" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={deviceLocation} onChange={(event) => setDeviceLocation(event.target.value)} placeholder="Main Gate" />
            </div>
          </div>
          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeviceDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createDevice} disabled={savingDevice || !deviceName.trim() || !deviceSerial.trim()}>
              {savingDevice ? 'Saving...' : 'Add Device'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function credentialLabel(value: string): string {
  if (value === 'fingerprint') return 'Fingerprint'
  if (value === 'zkteco_card_no') return 'Card'
  return 'User/PIN'
}
