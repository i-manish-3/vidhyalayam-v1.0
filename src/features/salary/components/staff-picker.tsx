'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown, GraduationCap, Users, Bus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StaffType = 'teacher' | 'staff' | 'driver'

export interface PickableStaff {
  id: string
  staffType: StaffType
  fullName: string
  employeeId: string | null
  roleLabel: string
  department: string | null
}

interface StaffPickerProps {
  value?: { staffType?: string; staffId?: string }
  onChange: (staff: PickableStaff) => void
  disabled?: boolean
  placeholder?: string
}

const TYPE_TABS: Array<{ key: StaffType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'staff', label: 'Staff' },
  { key: 'driver', label: 'Drivers' },
]

const TYPE_ICON: Record<StaffType, typeof GraduationCap> = {
  teacher: GraduationCap,
  staff: Users,
  driver: Bus,
}

export function StaffPicker({ value, onChange, disabled, placeholder = 'Select staff member' }: StaffPickerProps) {
  const [open, setOpen] = useState(false)
  const [staff, setStaff] = useState<PickableStaff[]>([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<StaffType | 'all'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ staff: PickableStaff[] }>('/api/school/salary/staff')
      setStaff(res.staff || [])
    } catch {
      setStaff([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selected = useMemo(
    () => staff.find((s) => s.staffType === value?.staffType && s.id === value?.staffId) || null,
    [staff, value]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter((s) => {
      if (typeFilter !== 'all' && s.staffType !== typeFilter) return false
      if (!q) return true
      return (
        s.fullName.toLowerCase().includes(q) ||
        (s.employeeId || '').toLowerCase().includes(q) ||
        s.roleLabel.toLowerCase().includes(q)
      )
    })
  }, [staff, typeFilter, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{selected.fullName}</span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {selected.roleLabel}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex gap-1 border-b p-2">
          {TYPE_TABS.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              size="sm"
              variant={typeFilter === tab.key ? 'default' : 'ghost'}
              className="h-7 flex-1 px-2 text-xs"
              onClick={() => setTypeFilter(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name or ID..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{loading ? 'Loading staff...' : 'No staff found.'}</CommandEmpty>
            <CommandGroup>
              {filtered.map((s) => {
                const Icon = TYPE_ICON[s.staffType]
                const isSelected = selected?.staffType === s.staffType && selected?.id === s.id
                return (
                  <CommandItem
                    key={`${s.staffType}:${s.id}`}
                    value={`${s.staffType}:${s.id}`}
                    onSelect={() => {
                      onChange(s)
                      setOpen(false)
                    }}
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">
                      {s.fullName}
                      {s.employeeId ? <span className="ml-1 text-xs text-muted-foreground">({s.employeeId})</span> : null}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {s.roleLabel}
                    </Badge>
                    <Check className={cn('ml-1 h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
