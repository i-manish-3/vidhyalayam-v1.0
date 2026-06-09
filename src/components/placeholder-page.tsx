'use client'

import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared'
import type { PageName } from '@/lib/store'
import {
  GraduationCap, BookOpen, Users, ClipboardList, Receipt, Wallet,
  Calendar, Award, Bus, Library, Package, Bell, Megaphone, Settings,
  CreditCard, Tag, Headphones, BarChart3, School, Layers,
  BookOpenCheck, DollarSign, FileText, IndianRupee, TrendingUp,
  Baby, UserCheck, Clock,
} from 'lucide-react'

const PAGE_ICONS: Record<string, React.ElementType> = {
  'dashboard': BarChart3,
  'students': GraduationCap,
  'teachers': BookOpen,
  'parents': Users,
  'attendance': ClipboardList,
  'fees-heads': IndianRupee,
  'fees-groups': Layers,
  'fees-structures': FileText,
  'fee-collections': DollarSign,
  'salary': Wallet,
  'salary-structure': FileText,
  'salary-payments': DollarSign,
  'salary-advance': TrendingUp,
  'timetable': Calendar,
  'exams': Award,
  'exam-results': Award,
  'transport': Bus,
  'library': Library,
  'inventory': Package,
  'notifications': Bell,
  'announcements': Megaphone,
  'classes': Layers,
  'subjects': BookOpenCheck,
  'settings': Settings,
  'subscriptions': CreditCard,
  'plans': Tag,
  'support': Headphones,
  'school-onboarding': School,
  'schools': School,
  'analytics': BarChart3,
  'my-classes': GraduationCap,
  'my-attendance': ClipboardList,
  'my-children': Baby,
  'fee-details': Receipt,
}

interface PlaceholderPageProps {
  title: string
  page: PageName
}

export function PlaceholderPage({ title, page }: PlaceholderPageProps) {
  const Icon = PAGE_ICONS[page] || GraduationCap

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your {title.toLowerCase()} here
        </p>
      </div>
      <EmptyState
        icon={Icon}
        title={`No ${title.toLowerCase()} yet`}
        description={`This is where you'll manage your ${title.toLowerCase()}. The full CRUD interface will be available here.`}
      />
    </div>
  )
}
