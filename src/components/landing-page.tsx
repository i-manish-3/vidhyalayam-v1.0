'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { motion, useInView, AnimatePresence, useScroll, useTransform, type Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  GraduationCap, Users, ClipboardCheck, CreditCard, BookOpen, Bell, Shield,
  Menu, Star, Check, ArrowRight, UserPlus, Settings, Rocket, Mail, Phone,
  Sparkles, School, Bus, Library, Package, Calendar, MessageSquare, Wallet,
  UsersRound, Crown, Palette, Globe, Zap, CheckCircle2, Play, MapPin, Sun, Moon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'

/* ─── Types ─── */
interface LandingPageProps {
  onLoginClick: () => void
}

/* ─── Smooth scroll helper ─── */
const scrollToId = (href: string) => {
  const el = document.querySelector(href)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ─── Animation variants ─── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: (i: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.5, delay: i * 0.08 },
  }),
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: (i: number = 0) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.5, delay: i * 0.06, type: 'spring', stiffness: 120 },
  }),
}

/* ─── Section wrapper with scroll animation ─── */
function Section({ children, id, className = '' }: {
  children: React.ReactNode; id?: string; className?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.section
      ref={ref} id={id}
      initial="hidden" animate={inView ? 'visible' : 'hidden'}
      variants={fadeUp} className={className}
    >
      {children}
    </motion.section>
  )
}

/* ─── Counter hook ─── */
function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  useEffect(() => {
    if (!inView) return
    let start = 0
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [inView, target, duration])
  return { count, ref }
}

/* ─── Data ─── */
const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Team', href: '#team' },
  { label: 'Contact Us', href: '#contact' },
]

const BRAND_TAGLINE = 'Empowering tradition with technology'

const STATS = [
  { label: 'Schools', value: 500, suffix: '+' },
  { label: 'Students', value: 50000, suffix: '+' },
  { label: 'Teachers', value: 5000, suffix: '+' },
  { label: 'Uptime', value: 99.9, suffix: '%', decimals: 1 },
]

const FEATURES = [
  { icon: Users, title: 'Student Management', desc: 'Complete student lifecycle management from admission to alumni tracking', color: 'from-emerald-500 to-teal-500' },
  { icon: ClipboardCheck, title: 'Smart Attendance', desc: 'Real-time attendance tracking with instant notifications to parents', color: 'from-teal-500 to-cyan-500' },
  { icon: CreditCard, title: 'Fees & Payments', desc: 'Automated fee collection, receipts, and financial reporting', color: 'from-cyan-500 to-emerald-500' },
  { icon: BookOpen, title: 'Academic Excellence', desc: 'Timetable, exams, grades, and comprehensive progress tracking', color: 'from-emerald-500 to-teal-500' },
  { icon: Bell, title: 'Communication Hub', desc: 'Seamless messaging between teachers, parents, and administration', color: 'from-teal-500 to-cyan-500' },
  { icon: Shield, title: 'Role-Based Access', desc: 'Granular permission controls for every role in your school', color: 'from-cyan-500 to-emerald-500' },
]

const MODULES = [
  { icon: UserPlus, name: 'Admission Management', desc: 'Streamline enrollment & admission workflows' },
  { icon: Users, name: 'Student Management', desc: 'End-to-end student lifecycle tracking' },
  { icon: UsersRound, name: 'Teacher Management', desc: 'Staff profiles, assignments & evaluations' },
  { icon: ClipboardCheck, name: 'Attendance Tracking', desc: 'Real-time attendance with parent alerts' },
  { icon: CreditCard, name: 'Fee Management', desc: 'Automated billing, receipts & reminders' },
  { icon: Wallet, name: 'Salary & Payroll', desc: 'Payroll processing & salary structures' },
  { icon: Bus, name: 'Transport Management', desc: 'Route planning & vehicle tracking' },
  { icon: Library, name: 'Library Management', desc: 'Catalog, issue/return & fine tracking' },
  { icon: Package, name: 'Inventory Tracking', desc: 'Asset management & procurement' },
  { icon: BookOpen, name: 'Exam Management', desc: 'Scheduling, grading & report cards' },
  { icon: Calendar, name: 'Timetable Scheduling', desc: 'Smart class & teacher scheduling' },
  { icon: MessageSquare, name: 'Communication', desc: 'Messaging & announcement platform' },
  { icon: Wallet, name: 'Petty Cash', desc: 'Track small expenses & reimbursements' },
  { icon: Users, name: 'Parent Portal', desc: 'Real-time access for parents' },
]

const STEPS = [
  { num: '01', title: 'Sign Up & Setup', desc: 'Create your school account in minutes', icon: UserPlus },
  { num: '02', title: 'Configure & Customize', desc: 'Set up classes, subjects, fees, and roles', icon: Settings },
  { num: '03', title: 'Go Live & Grow', desc: 'Start managing your school digitally', icon: Rocket },
]

/* ─── Pricing Data Types ─── */
interface PricingPlanData {
  id: string
  name: string
  pricePerStudent: number
  billingCycle: string
  description: string | null
  features: string // JSON string
  highlights: string | null // JSON string
  isActive: boolean
  isPopular: boolean
  sortOrder: number
}

interface PricingAddonData {
  id: string
  name: string
  description: string
  icon: string
  price: number
  priceLabel: string
  type: string
  isActive: boolean
  sortOrder: number
}

// Icon name to component mapping
const ICON_MAP: Record<string, React.ElementType> = {
  Wallet, Crown, Palette, Globe, CreditCard, Star, Zap, Shield, Users, BookOpen, Bell, Settings,
}

const DEFAULT_CORE_FEATURES = [
  'Student & Teacher Management', 'Smart Attendance Tracking', 'Fee Collection & Receipts',
  'Exam & Timetable Management', 'Parent & Student Portals', 'Transport & Library Modules',
  'Notifications & Announcements', 'Inventory & Petty Cash', 'Role-Based Access Control',
  'Reports & Analytics', 'Free Data Migration & Setup', 'Dedicated Onboarding Support',
]

const DEFAULT_HIGHLIGHTS = ['Data migration included', 'Free setup & onboarding', 'All core features']

const DEFAULT_ADDONS = [
  { id: 'salary_payroll', icon: Wallet, name: 'Salary & Payroll', desc: 'Complete payroll processing, salary structures, advance management & payslips', price: '₹25/staff/month', priceLabel: 'per staff / month', type: 'recurring' as const },
  { id: 'premium_feature', icon: Crown, name: 'Premium Features', desc: 'Advanced analytics, AI-powered insights, custom reports & priority feature requests', price: '₹1,000', priceLabel: 'one-time', type: 'one_time' as const },
  { id: 'custom_branding', icon: Palette, name: 'Custom Branding', desc: 'Your school logo, colors, subdomain & white-labeled experience', price: '₹1,000', priceLabel: 'one-time', type: 'one_time' as const },
  { id: 'school_landing_page', icon: Globe, name: 'School Landing Page', desc: 'Professional website with admission inquiry form & SEO optimization', price: '₹1,500', priceLabel: 'one-time', type: 'one_time' as const },
]


/* ─── Team Data Types ─── */
interface TeamMemberData {
  id: string
  name: string
  role: string
  bio: string
  image: string | null
  phone: string | null
  email: string | null
  linkedin: string | null
  twitter: string | null
  github: string | null
  instagram: string | null
  facebook: string | null
  website: string | null
  isActive: boolean
  sortOrder: number
}

const DEFAULT_TEAM_MEMBERS = [
  {
    id: 'default-1',
    name: 'Manish Kumar',
    role: 'Developer',
    bio: 'Full-stack developer passionate about building scalable SaaS products. Architect of Vidhyalayam\'s platform and core technology.',
    image: '/uploads/team/manish-kumar.png',
    phone: '+91 98765 43210',
    email: null, linkedin: null, twitter: null, github: null, instagram: null, facebook: null, website: null,
    isActive: true, sortOrder: 1,
  },
  {
    id: 'default-2',
    name: 'Ashish Arya',
    role: 'Marketing Head',
    bio: 'Strategic marketing professional driving growth and brand visibility. Connecting schools with the digital tools they need to succeed.',
    image: '/uploads/team/ashish-arya.png',
    phone: '+91 98765 67890',
    email: null, linkedin: null, twitter: null, github: null, instagram: null, facebook: null, website: null,
    isActive: true, sortOrder: 2,
  },
]

const FAQ_DATA = [
  { q: 'How long does it take to set up?', a: 'Most schools are up and running within 24-48 hours.' },
  { q: 'Is my school\'s data secure?', a: 'Enterprise-grade encryption, regular backups, data protection compliance.' },
  { q: 'Can I customize the platform for my school?', a: 'Yes, from branding to custom fee structures and role-based access.' },
  { q: 'Do you provide training?', a: 'Comprehensive training including video tutorials, live sessions, and dedicated support.' },
  { q: 'What about parent and student access?', a: 'Dedicated portals with real-time access to attendance, grades, fees.' },
  { q: 'Can I migrate from my current system?', a: 'Yes, free data migration from spreadsheets or any existing software.' },
]

/* ═══════════════════════════════════════════════════════════════════
   NAVBAR
   ═══════════════════════════════════════════════════════════════════ */
function Navbar({ onLoginClick }: { onLoginClick: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { queueMicrotask(() => setMounted(true)) }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNav = useCallback((href: string) => {
    setMobileOpen(false)
    scrollToId(href)
  }, [])

  return (
    <motion.nav
      initial={{ y: -80 }} animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200/50 dark:border-white/10 shadow-lg shadow-black/5'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 group" aria-label="Vidhyalayam">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/50 transition-all duration-300 group-hover:scale-105">
            <GraduationCap className="size-5" />
          </div>
          <span className="text-lg font-bold leading-tight pb-0.5 bg-gradient-to-br from-slate-900 to-slate-700 dark:from-white dark:to-white/70 bg-clip-text text-transparent">
            Vidhyalayam
          </span>
        </button>

        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.label}
              onClick={() => handleNav(link.href)}
              className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-emerald-50 dark:hover:bg-white/5 transition-colors rounded-lg relative group"
            >
              {link.label}
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400 group-hover:w-3/4 transition-all duration-300 rounded-full" />
            </button>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="text-slate-600 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-emerald-50 dark:hover:bg-white/5 transition-all duration-300">
            {mounted && (theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />)}
          </Button>
          <Button variant="ghost" size="sm" onClick={onLoginClick} className="text-slate-600 dark:text-white/80 hover:text-slate-900 dark:hover:text-white">
            Login
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 hover:scale-105"
            onClick={onLoginClick}
          >
            Get Started <ArrowRight className="size-4 ml-1" />
          </Button>
        </div>

        <div className="lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-slate-900 dark:text-white">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25">
                    <GraduationCap className="size-4" />
                  </div>
                  <span className="text-base font-bold">Vidhyalayam</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 mt-6">
                {NAV_LINKS.map((link) => (
                  <button key={link.href} onClick={() => handleNav(link.href)} className="px-4 py-3 text-sm font-medium text-left rounded-lg hover:bg-emerald-50 dark:hover:bg-white/5 transition-colors">
                    {link.label}
                  </button>
                ))}
                <div className="mt-4 flex flex-col gap-2 px-2">
                  <Button variant="outline" onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark') }} className="flex items-center gap-2">
                    {mounted && (theme === 'dark' ? <><Sun className="size-4" /> Light Mode</> : <><Moon className="size-4" /> Dark Mode</>)}
                  </Button>
                  <Button variant="outline" onClick={() => { setMobileOpen(false); onLoginClick() }}>Login</Button>
                  <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white" onClick={() => { setMobileOpen(false); onLoginClick() }}>Get Started</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.nav>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   HERO SECTION
   ═══════════════════════════════════════════════════════════════════ */
function HeroSection({ onLoginClick }: { onLoginClick: () => void }) {
  const { scrollY } = useScroll()
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0])
  const heroY = useTransform(scrollY, [0, 400], [0, 60])

  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pt-24 pb-16 md:pt-32 md:pb-20">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full opacity-20 dark:opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.4), transparent 70%)', top: '-10%', left: '-10%' }}
          animate={{ x: [0, 80, -40, 60, 0], y: [0, -60, 40, -20, 0], scale: [1, 1.1, 0.95, 1.05, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] rounded-full opacity-15 dark:opacity-8"
          style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.4), transparent 70%)', bottom: '-10%', right: '-10%' }}
          animate={{ x: [0, -60, 40, -30, 0], y: [0, 50, -30, 60, 0], scale: [1, 0.9, 1.1, 0.95, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* Dot grid */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      {/* Floating icons */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div className="absolute top-24 left-[8%] text-emerald-500/10" animate={{ y: [0, -20, 0], rotate: [0, 12, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}>
          <GraduationCap className="size-14" />
        </motion.div>
        <motion.div className="absolute top-40 right-[10%] text-teal-500/10" animate={{ y: [0, 15, 0], rotate: [0, -10, 0] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}>
          <BookOpen className="size-12" />
        </motion.div>
        <motion.div className="absolute bottom-32 left-[12%] text-emerald-500/8" animate={{ y: [0, -12, 0], x: [0, 8, 0] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}>
          <Sparkles className="size-10" />
        </motion.div>
        <motion.div className="absolute bottom-44 right-[6%] text-teal-500/8" animate={{ y: [0, 15, 0], rotate: [0, 8, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}>
          <School className="size-11" />
        </motion.div>
        {/* Additional floating icons */}
        <motion.div className="absolute top-[30%] left-[3%] text-emerald-500/6 hidden xl:block" animate={{ y: [0, 18, 0], rotate: [0, -15, 0] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 3 }}>
          <Shield className="size-10" />
        </motion.div>
        <motion.div className="absolute top-[20%] right-[4%] text-cyan-500/6 hidden xl:block" animate={{ y: [0, -16, 0], rotate: [0, 10, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}>
          <Zap className="size-9" />
        </motion.div>
      </div>

      {/* Scroll-driven wrapper */}
      <motion.div
        style={{
          opacity: heroOpacity,
          y: heroY,
        }}
        className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 shadow-lg shadow-emerald-500/10">
                <Sparkles className="size-3.5 mr-1.5" />
                #1 School Management Platform
              </Badge>
            </motion.div>

            <h1 className="text-5xl sm:text-5xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.2] text-slate-900 dark:text-white overflow-visible">
              <motion.span className="block" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}>
                Transform Your
              </motion.span>
              <motion.span className="block" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}>
                School Into a
              </motion.span>
              <motion.span
                className="block pb-1 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 dark:from-emerald-400 dark:via-teal-400 dark:to-cyan-400 bg-clip-text text-transparent"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 1, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                Digital Powerhouse
              </motion.span>
            </h1>

            <motion.p className="mt-4 text-base font-semibold text-emerald-700 dark:text-emerald-300 max-w-xl mx-auto lg:mx-0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.65 }}>
              {BRAND_TAGLINE}
            </motion.p>

            <motion.p className="mt-4 text-lg sm:text-xl text-slate-600 dark:text-white/60 max-w-xl mx-auto lg:mx-0" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.7 }}>
              The all-in-one school management platform that streamlines admissions, attendance, fees, academics, and communication — so you can focus on what matters most: your students.
            </motion.p>

            <motion.div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.9 }}>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 300 }}>
                <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 text-base px-8 h-12 transition-all duration-300" onClick={onLoginClick}>
                  Get Started Free <ArrowRight className="size-4 ml-2" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 300 }}>
                <Button variant="outline" size="lg" className="text-base px-8 h-12 border-slate-300 dark:border-white/20 hover:bg-emerald-50 hover:border-emerald-400 dark:hover:bg-white/5 transition-all duration-300" onClick={() => scrollToId('#contact')}>
                  <Play className="size-4 mr-2" /> Schedule Demo
                </Button>
              </motion.div>
            </motion.div>
          </div>

          {/* Dashboard Preview */}
          <motion.div
            className="hidden lg:block relative"
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5, type: 'spring', stiffness: 80 }}
          >
            {/* Shadow layer */}
            <div
              className="absolute -bottom-4 left-[5%] right-[5%] h-12 rounded-2xl blur-2xl"
              style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.15), rgba(20,184,166,0.1), rgba(6,182,212,0.15))' }}
            />
            {/* Reflection layer */}
            <div
              className="absolute -bottom-2 left-[10%] right-[10%] h-4 rounded-xl blur-lg opacity-30"
              style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(20,184,166,0.2))' }}
            />
            <motion.div
              className="rounded-2xl bg-white/90 dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-6 shadow-2xl shadow-emerald-500/5"
              whileHover={{ y: -8, boxShadow: '0 30px 60px -15px rgba(16, 185, 129, 0.2)' }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="size-3 rounded-full bg-red-400" />
                <div className="size-3 rounded-full bg-yellow-400" />
                <div className="size-3 rounded-full bg-green-400" />
                <span className="ml-2 text-xs text-slate-500 dark:text-white/50 font-medium">Vidhyalayam — Dashboard</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: 'Total Students', value: '2,847', change: '+12%', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
                  { label: 'Attendance', value: '94.2%', change: '+3%', bg: 'bg-teal-50 dark:bg-teal-500/10', text: 'text-teal-700 dark:text-teal-400' },
                  { label: 'Fee Collection', value: '₹18.5L', change: '+8%', bg: 'bg-amber-50 dark:bg-cyan-500/10', text: 'text-amber-700 dark:text-cyan-400' },
                  { label: 'Teachers', value: '156', change: '+5', bg: 'bg-rose-50 dark:bg-emerald-500/10', text: 'text-rose-700 dark:text-emerald-300' },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 + i * 0.1, type: 'spring', stiffness: 100 }}
                    className={`rounded-xl p-4 ${stat.bg} ${stat.text} border border-slate-100 dark:border-white/5`}
                  >
                    <p className="text-xs font-medium text-slate-500 dark:text-white/50">{stat.label}</p>
                    <p className="text-xl font-bold mt-1">{stat.value}</p>
                    <p className="text-xs font-medium mt-1 opacity-70">{stat.change} this month</p>
                  </motion.div>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-500 dark:text-white/50">Weekly Attendance</p>
                <div className="flex items-end gap-2 h-20">
                  {[65, 80, 72, 90, 85, 78, 92].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0, scaleY: 0 }}
                      animate={{ height: `${h}%`, scaleY: 1 }}
                      transition={{ duration: 0.6, delay: 0.9 + i * 0.06, type: 'spring', stiffness: 120 }}
                      className="flex-1 rounded-md bg-gradient-to-t from-emerald-500 to-teal-400 min-h-[4px]"
                      style={{ transformOrigin: 'bottom' }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-white/40">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <div className="flex justify-center mt-8 relative z-10">
        <motion.button
          onClick={() => scrollToId('#features')}
          className="flex flex-col items-center gap-1 text-slate-400 dark:text-white/30 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="text-xs font-medium">Scroll Down</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.button>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   STATS BAR
   ═══════════════════════════════════════════════════════════════════ */
function StatItem({ stat }: { stat: (typeof STATS)[number] }) {
  const { count, ref } = useCountUp(stat.decimals ? stat.value * 10 : stat.value, 2000)
  const display = stat.decimals ? (count / 10).toFixed(stat.decimals) : count.toLocaleString()
  return (
    <motion.div className="text-center" whileHover={{ scale: 1.08 }} transition={{ type: 'spring', stiffness: 300 }}>
      <span ref={ref} className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">{display}{stat.suffix}</span>
      <p className="mt-1 text-sm font-medium text-slate-500 dark:text-white/50">{stat.label}</p>
    </motion.div>
  )
}

function StatsBar() {
  return (
    <Section className="py-16 relative bg-white dark:bg-slate-950 border-y border-emerald-500/10">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-cyan-500/5" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat) => <StatItem key={stat.label} stat={stat} />)}
        </div>
      </div>
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FEATURES SECTION
   ═══════════════════════════════════════════════════════════════════ */
function FeaturesSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section id="features" className="py-20 md:py-28 bg-slate-50/50 dark:bg-slate-900/50 relative" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Sparkles className="size-3.5 mr-1.5" />Features</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Everything You Need to <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Run Your School</span></h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">Powerful tools designed specifically for modern school management</p>
        </motion.div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} custom={i} initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={scaleIn}>
              <motion.div whileHover={{ y: -8, boxShadow: '0 20px 40px -12px rgba(16,185,129,0.15)' }} transition={{ duration: 0.3 }} className="h-full">
                <Card className="h-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-emerald-500/30 transition-all duration-300 rounded-2xl">
                  <CardHeader>
                    <div className={`size-12 rounded-xl flex items-center justify-center mb-2 bg-gradient-to-br ${f.color} text-white shadow-lg shadow-emerald-500/20`}>
                      <f.icon className="size-6" />
                    </div>
                    <CardTitle className="text-lg">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="-mt-2">
                    <CardDescription className="text-sm leading-relaxed">{f.desc}</CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MODULES SECTION
   ═══════════════════════════════════════════════════════════════════ */
function ModulesSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section id="modules" className="py-20 md:py-28 bg-white dark:bg-slate-950 relative" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Zap className="size-3.5 mr-1.5" />Modules</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Powerful Modules for <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Every Need</span></h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">14+ specialized modules covering every aspect of school operations</p>
        </motion.div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MODULES.map((m, i) => (
            <motion.div key={m.name} custom={i} initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={scaleIn} whileHover={{ y: -6 }} className="group">
              <Card className="h-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-emerald-500/30 transition-all duration-300 rounded-2xl py-0 overflow-hidden">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="size-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 text-white shrink-0 shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
                    <m.icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight">{m.name}</p>
                    <p className="text-xs text-slate-500 dark:text-white/50 mt-1 leading-relaxed">{m.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   HOW IT WORKS SECTION
   ═══════════════════════════════════════════════════════════════════ */
function HowItWorksSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-slate-50/50 dark:bg-slate-900/50 relative" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Rocket className="size-3.5 mr-1.5" />How It Works</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Up and Running in <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">3 Simple Steps</span></h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">Getting started is easier than you think</p>
        </motion.div>

        <div className="mt-16 relative">
          <div className="hidden md:block absolute top-24 left-[16.67%] right-[16.67%]">
            <motion.div className="h-0.5 bg-gradient-to-r from-emerald-500/50 via-teal-500/50 to-cyan-500/50 rounded-full" initial={{ scaleX: 0 }} animate={inView ? { scaleX: 1 } : {}} transition={{ duration: 1.5, delay: 0.5, ease: 'easeInOut' }} style={{ originX: 0 }} />
          </div>
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} custom={i} initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp} className="relative text-center">
                <motion.div className="mx-auto size-20 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-emerald-500/30 relative z-10" whileHover={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}>
                  {step.num}
                  <motion.div className="absolute inset-0 rounded-full border-2 border-emerald-400/50" animate={{ scale: [1, 1.3], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }} />
                </motion.div>
                <motion.div className="mt-8" initial={{ opacity: 0, y: 15 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.4 + i * 0.15 }}>
                  <div className="mx-auto size-14 rounded-xl bg-emerald-50 dark:bg-white/5 border border-emerald-200 dark:border-white/10 flex items-center justify-center mb-4 text-emerald-600 dark:text-emerald-400">
                    <step.icon className="size-7" />
                  </div>
                  <h3 className="text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 text-slate-600 dark:text-white/60 leading-relaxed max-w-xs mx-auto">{step.desc}</p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PRICING SECTION
   ═══════════════════════════════════════════════════════════════════ */
function PricingSection({ plans, addons }: { plans: PricingPlanData[]; addons: PricingAddonData[] }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  // Use first active plan or fallback defaults
  const activePlan = plans.find(p => p.isActive) || null
  const planName = activePlan?.name || 'Base Plan'
  const planPrice = activePlan?.pricePerStudent || 10

  // Parse features from JSON string with fallback
  let planFeatures = DEFAULT_CORE_FEATURES
  if (activePlan?.features) {
    try {
      const parsed = JSON.parse(activePlan.features)
      if (Array.isArray(parsed) && parsed.length > 0) planFeatures = parsed
    } catch { /* use default */ }
  }

  // Parse highlights from JSON string with fallback
  let planHighlights = DEFAULT_HIGHLIGHTS
  if (activePlan?.highlights) {
    try {
      const parsed = JSON.parse(activePlan.highlights)
      if (Array.isArray(parsed) && parsed.length > 0) planHighlights = parsed
    } catch { /* use default */ }
  }

  // Format addon price display
  const formatAddonPrice = (addon: PricingAddonData) => {
    if (addon.type === 'recurring') return `₹${addon.price}/staff/month`
    return `₹${addon.price.toLocaleString('en-IN')}`
  }

  // Use dynamic addons or fallback to defaults
  const displayAddons = addons.length > 0
    ? addons.filter(a => a.isActive).map(a => ({
        id: a.id,
        IconComponent: ICON_MAP[a.icon] || CreditCard,
        name: a.name,
        desc: a.description,
        price: formatAddonPrice(a),
        priceLabel: a.priceLabel,
        type: a.type,
      }))
    : DEFAULT_ADDONS.map(a => ({
        id: a.id,
        IconComponent: a.icon,
        name: a.name,
        desc: a.desc,
        price: a.price,
        priceLabel: a.priceLabel,
        type: a.type,
      }))

  return (
    <section id="pricing" className="py-20 md:py-28 bg-white dark:bg-slate-950 relative" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><CreditCard className="size-3.5 mr-1.5" />Pricing</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Simple, <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Transparent</span> Pricing</h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">One flat rate per student. Everything included. No hidden fees.</p>
        </motion.div>

        <motion.div className="mt-12 max-w-4xl mx-auto" initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.15 }}>
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-2xl shadow-emerald-500/5">
            <div className="grid md:grid-cols-5">
              {/* Left: Price */}
              <div className="md:col-span-2 bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600 p-8 md:p-10 flex flex-col justify-center text-white relative overflow-hidden">
                <motion.div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-xl" animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }} transition={{ duration: 5, repeat: Infinity }} />
                <div className="relative z-10">
                  <p className="text-emerald-100 text-sm font-semibold uppercase tracking-widest">{planName}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-6xl font-extrabold leading-none">₹{planPrice}</span>
                    <div className="ml-1"><span className="text-lg font-medium text-white/90">/student</span><span className="block text-sm text-emerald-200">per month</span></div>
                  </div>
                  <div className="mt-6 space-y-2.5">
                    {planHighlights.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-emerald-100"><Check className="size-4 shrink-0" /><span className="text-sm">{item}</span></div>
                    ))}
                  </div>
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="lg" className="mt-8 w-full bg-white text-emerald-700 hover:bg-white/90 shadow-lg font-semibold text-base transition-all duration-300" onClick={() => scrollToId('#contact')}>
                      Get Started <ArrowRight className="size-4 ml-2" />
                    </Button>
                  </motion.div>
                </div>
              </div>

              {/* Right: Features */}
              <div className="md:col-span-3 p-8 md:p-10">
                <h3 className="font-bold text-lg mb-5">Everything included in your base plan</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {planFeatures.map((feature, i) => (
                    <motion.div key={feature} initial={{ opacity: 0, x: 10 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.3, delay: 0.3 + i * 0.03 }} className="flex items-center gap-2.5">
                      <div className="size-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0"><Check className="size-3 text-white" /></div>
                      <span className="text-sm text-slate-700 dark:text-white/80">{feature}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Add-ons */}
        <motion.div className="mt-16" initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.3 }}>
          <div className="text-center mb-10">
            <h3 className="text-2xl font-extrabold tracking-tight">Premium <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Add-Ons</span></h3>
            <p className="mt-2 text-slate-600 dark:text-white/60">Charged extra — pick what your school needs</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {displayAddons.map((addon, i) => {
              const AddonIcon = addon.IconComponent
              return (
              <motion.div key={addon.id} custom={i} initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={scaleIn} whileHover={{ y: -8 }} className="group">
                <Card className="h-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-emerald-500/30 transition-all duration-300 rounded-2xl overflow-hidden">
                  <motion.div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" initial={{ scaleX: 0 }} animate={inView ? { scaleX: 1 } : {}} transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }} style={{ originX: 0 }} />
                  <CardContent className="p-5 pt-4">
                    <div className="flex flex-col items-center text-center">
                      <div className="size-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 text-white mb-3 shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
                        <AddonIcon className="size-5" />
                      </div>
                      <h4 className="font-bold text-sm">{addon.name}</h4>
                      <p className="text-xs text-slate-500 dark:text-white/50 mt-1.5 leading-relaxed">{addon.desc}</p>
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 w-full">
                        <span className="text-xl font-extrabold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">{addon.price}</span>
                        <span className="block text-xs text-slate-500 dark:text-white/50 mt-0.5">{addon.priceLabel}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TESTIMONIALS SECTION
   ═══════════════════════════════════════════════════════════════════ */
function TestimonialCard({ t }: { t: { name: string; role: string; quote: string; stars: number; avatarUrl?: string | null } }) {
  return (
    <Card className="w-[300px] sm:w-[340px] shrink-0 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 rounded-2xl">
      <CardContent className="p-5">
        <div className="flex gap-0.5 mb-3">
          {Array.from({ length: t.stars }).map((_, j) => (
            <Star key={j} className="size-3.5 fill-emerald-500 text-emerald-500 dark:fill-emerald-400 dark:text-emerald-400" />
          ))}
        </div>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-white/60 mb-4">&ldquo;{t.quote}&rdquo;</p>
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
          {t.avatarUrl ? (
            <div className="size-9 rounded-full overflow-hidden shadow">
              <img src={t.avatarUrl} alt={t.name} className="size-full object-cover" />
            </div>
          ) : (
            <div className="size-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-xs shadow">{t.name.charAt(0)}</div>
          )}
          <div>
            <p className="font-semibold text-sm">{t.name}</p>
            <p className="text-xs text-slate-500 dark:text-white/50">{t.role}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TestimonialsSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [testimonials, setTestimonials] = useState<Array<{ name: string; role: string; quote: string; stars: number; avatarUrl?: string | null }>>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.get<{ testimonials?: Array<{ name: string; role: string; quote: string; stars: number; avatarUrl?: string | null }> }>('/api/testimonials', undefined, { skipLogoutOn401: true })
      .then(data => {
        if (data.testimonials && data.testimonials.length > 0) {
          setTestimonials(data.testimonials)
        }
      })
      .catch(() => {
        // silently fail — section won't render if empty
      })
      .finally(() => setLoaded(true))
  }, [])

  // Don't render the section at all if no testimonials from the database
  if (!loaded || testimonials.length === 0) {
    return loaded && testimonials.length === 0 ? null : (
      <section id="testimonials" className="py-20 md:py-28 bg-slate-50/50 dark:bg-slate-900/50 relative overflow-hidden" ref={ref}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
            <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Star className="size-3.5 mr-1.5" />Testimonials</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Loved by Schools <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Across India</span></h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-white/60">Hear from educators who transformed their schools</p>
          </motion.div>
        </div>
        <div className="mt-14 flex gap-6 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="w-[300px] sm:w-[340px] shrink-0 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl animate-pulse">
              <CardContent className="p-5">
                <div className="flex gap-0.5 mb-3">{Array.from({ length: 5 }).map((_, j) => <div key={j} className="size-3.5 rounded bg-slate-200 dark:bg-white/10" />)}</div>
                <div className="space-y-2 mb-4">{Array.from({ length: 3 }).map((_, j) => <div key={j} className="h-3 rounded bg-slate-200 dark:bg-white/10" />)}</div>
                <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
                  <div className="size-9 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="space-y-1.5"><div className="h-3 w-20 rounded bg-slate-200 dark:bg-white/10" /><div className="h-2.5 w-28 rounded bg-slate-200 dark:bg-white/10" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    )
  }

  // Seamless infinite loop: duplicate exactly 2x so the end connects to the start with zero gap
  const loopTestimonials = [...testimonials, ...testimonials]

  return (
    <section id="testimonials" className="py-20 md:py-28 bg-slate-50/50 dark:bg-slate-900/50 relative overflow-hidden" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Star className="size-3.5 mr-1.5" />Testimonials</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Loved by Schools <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Across India</span></h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">Hear from educators who transformed their schools</p>
        </motion.div>
      </div>

      {/* Single-row seamless circular marquee — last card connects directly to first */}
      <div className="mt-14 relative">
        {/* Fade edges for smooth blend */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-50/50 dark:from-slate-900/50 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-50/50 dark:from-slate-900/50 to-transparent z-10 pointer-events-none" />

        <div className="flex gap-6 w-max animate-marquee-fast">
          {loopTestimonials.map((t, i) => (
            <TestimonialCard key={`${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TEAM SECTION
   ═══════════════════════════════════════════════════════════════════ */
function TeamSection({ members }: { members: TeamMemberData[] }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  // Use dynamic members or fallback to defaults
  const displayMembers = members.length > 0 ? members : DEFAULT_TEAM_MEMBERS

  return (
    <section id="team" className="py-20 md:py-28 bg-white dark:bg-slate-950 relative" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><UsersRound className="size-3.5 mr-1.5" />Our Team</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Meet the <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">People</span> Behind the Platform</h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">Passionate minds building the future of school management</p>
        </motion.div>

        <div className="mt-14 grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {displayMembers.map((member, i) => (
            <motion.div key={member.id} custom={i} initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={scaleIn} whileHover={{ y: -8 }} className="group">
              <Card className="h-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-emerald-500/30 transition-all duration-300 rounded-2xl overflow-hidden">
                <CardContent className="p-5 md:p-6">
                  <div className="flex flex-col items-center text-center">
                    {/* Avatar with ring */}
                    <div className="relative mb-4">
                      <div className="size-22 rounded-full p-1 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow" style={{ width: '5.5rem', height: '5.5rem' }}>
                        <div className="size-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          {member.image ? (
                            <img src={member.image} alt={member.name} className="size-full object-cover" />
                          ) : (
                            <span className="text-2xl font-bold text-emerald-500">{member.name.charAt(0)}</span>
                          )}
                        </div>
                      </div>
                      {/* Status dot */}
                      <div className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950 shadow-sm" />
                    </div>

                    <h3 className="text-lg font-bold">{member.name}</h3>
                    <p className="text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent mt-0.5">{member.role}</p>
                    <p className="text-xs text-slate-600 dark:text-white/60 mt-2 leading-relaxed">{member.bio}</p>

                    {/* Phone */}
                    {member.phone && (
                      <a href={`tel:${member.phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 mt-3 text-xs text-slate-500 dark:text-white/40 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors no-underline">
                        <Phone className="size-3" />
                        {member.phone}
                      </a>
                    )}

                    {/* Social links */}
                    <div className="flex items-center gap-2 mt-4 w-full justify-center">
                      {member.linkedin && (
                        <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200" aria-label="LinkedIn">
                          <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        </a>
                      )}
                      {member.twitter && (
                        <a href={member.twitter} target="_blank" rel="noopener noreferrer" className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200" aria-label="X (Twitter)">
                          <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </a>
                      )}
                      {member.github && (
                        <a href={member.github} target="_blank" rel="noopener noreferrer" className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200" aria-label="GitHub">
                          <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                        </a>
                      )}
                      {member.instagram && (
                        <a href={member.instagram} target="_blank" rel="noopener noreferrer" className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200" aria-label="Instagram">
                          <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                        </a>
                      )}
                      {member.facebook && (
                        <a href={member.facebook} target="_blank" rel="noopener noreferrer" className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200" aria-label="Facebook">
                          <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>
                      )}
                      {member.website && (
                        <a href={member.website} target="_blank" rel="noopener noreferrer" className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200" aria-label="Website">
                          <Globe className="size-3.5" />
                        </a>
                      )}
                      {member.email && (
                        <a href={`mailto:${member.email}`} className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200" aria-label="Email">
                          <Mail className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FAQ SECTION
   ═══════════════════════════════════════════════════════════════════ */
function FAQSection() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section id="faq" className="py-20 md:py-28 bg-white dark:bg-slate-950 relative" ref={ref}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><MessageSquare className="size-3.5 mr-1.5" />FAQ</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Frequently Asked <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Questions</span></h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">Everything you need to know about Vidhyalayam</p>
        </motion.div>

        <motion.div className="mt-12" initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.2 }}>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQ_DATA.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="px-6 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 data-[state=open]:border-emerald-500/30 rounded-2xl transition-colors overflow-hidden">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-slate-600 dark:text-white/60 pb-5 leading-relaxed">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CONTACT SECTION
   ═══════════════════════════════════════════════════════════════════ */
function ContactSection({ onLoginClick, addons }: { onLoginClick: () => void; addons: PricingAddonData[] }) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [form, setForm] = useState({ name: '', schoolName: '', email: '', phone: '', studentCount: '', message: '', addOns: [] as string[] })

  const toggleAddOn = (id: string) => {
    setForm((p) => ({
      ...p,
      addOns: p.addOns.includes(id) ? p.addOns.filter((a) => a !== id) : [...p.addOns, id],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const data = await api.post<{ message?: string }>('/api/contact', form, { skipLogoutOn401: true })
      setSubmitted(true)
      toast({ title: 'Success', description: data.message || 'Thank you! We will contact you shortly.' })
    } catch (err) {
      toast({
        title: "Couldn't Submit",
        description: err instanceof Error ? err.message : "We couldn't submit your request. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="contact" className="py-14 md:py-20 bg-slate-50/50 dark:bg-slate-900/50 relative" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center max-w-3xl mx-auto" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={fadeUp}>
          <Badge variant="secondary" className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"><Mail className="size-3.5 mr-1.5" />Contact Us</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Get Started <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Today</span></h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-white/60">Fill out the form below and our team will get back to you within 24 hours</p>
        </motion.div>

        <motion.div className="mt-12 max-w-2xl mx-auto" initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.2 }}>
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="text-center py-16">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }} className="mx-auto size-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
                  <CheckCircle2 className="size-10 text-white" />
                </motion.div>
                <h3 className="text-2xl font-bold mb-2">Thank You!</h3>
                <p className="text-slate-600 dark:text-white/60 max-w-md mx-auto">We&apos;ve received your inquiry. Our team will reach out to you within 24 hours.</p>
                <Button variant="outline" className="mt-6" onClick={() => { setSubmitted(false); setForm({ name: '', schoolName: '', email: '', phone: '', studentCount: '', message: '', addOns: [] }) }}>Submit Another Inquiry</Button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={handleSubmit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                <div className="rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 p-6 md:p-8 space-y-5 shadow-lg">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="name">Full Name *</Label><Input id="name" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Your full name" /></div>
                    <div className="space-y-2"><Label htmlFor="schoolName">School Name *</Label><Input id="schoolName" required value={form.schoolName} onChange={(e) => setForm((p) => ({ ...p, schoolName: e.target.value }))} placeholder="Your school name" /></div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="email">Email *</Label><Input id="email" type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="you@school.com" /></div>
                    <div className="space-y-2"><Label htmlFor="phone">Phone *</Label><Input id="phone" type="tel" required value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="studentCount">Estimated Students</Label><Input id="studentCount" type="number" value={form.studentCount} onChange={(e) => setForm((p) => ({ ...p, studentCount: e.target.value }))} placeholder="Approximate number of students" /></div>

                  {/* Add-ons Selection */}
                  <div className="space-y-3">
                    <Label>Interested Add-Ons</Label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {(addons.length > 0 ? addons.filter(a => a.isActive).map(a => ({
                        id: a.name,
                        name: a.name,
                        price: a.type === 'recurring' ? `₹${a.price}/staff/month` : `₹${a.price.toLocaleString('en-IN')}`,
                      })) : DEFAULT_ADDONS.map(a => ({
                        id: a.name,
                        name: a.name,
                        price: a.price,
                      }))).map((addon) => {
                        const selected = form.addOns.includes(addon.id)
                        return (
                          <motion.button
                            key={addon.id}
                            type="button"
                            onClick={() => toggleAddOn(addon.id)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                              selected
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm shadow-emerald-500/10'
                                : 'border-slate-200 dark:border-white/10 hover:border-emerald-300 dark:hover:border-emerald-500/30'
                            }`}
                          >
                            <div className={`size-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                              selected ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white' : 'border-2 border-slate-300 dark:border-white/20'
                            }`}>
                              {selected && <Check className="size-3" />}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-medium ${selected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-white/80'}`}>{addon.name}</p>
                              <p className="text-xs text-slate-500 dark:text-white/40">{addon.price}</p>
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2"><Label htmlFor="message">Message</Label><Textarea id="message" value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} placeholder="Tell us about your school and requirements..." rows={4} /></div>
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 h-12 text-base font-semibold transition-all duration-300">
                      {submitting ? 'Submitting...' : 'Submit Inquiry'} <ArrowRight className="size-4 ml-2" />
                    </Button>
                  </motion.div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CTA SECTION
   ═══════════════════════════════════════════════════════════════════ */
function CTASection({ onLoginClick }: { onLoginClick: () => void }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <Section id="cta" className="py-14 md:py-16 bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600 relative overflow-hidden">
      <motion.div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />
      <motion.div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white/5 blur-3xl" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 6, repeat: Infinity, delay: 2 }} />
      <div ref={ref} className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.h2 className="text-3xl sm:text-4xl font-extrabold text-white" initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          Ready to Transform Your School?
        </motion.h2>
        <motion.p className="mt-4 text-lg text-emerald-100 max-w-2xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.15 }}>
          Join 500+ schools already using Vidhyalayam to streamline operations and improve outcomes.
        </motion.p>
        <motion.div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center" initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.3 }}>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="lg" className="bg-white text-emerald-700 hover:bg-white/90 shadow-xl text-base px-8 h-12 font-semibold transition-all duration-300" onClick={onLoginClick}>
              Get Started Free <ArrowRight className="size-4 ml-2" />
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="lg" className="border border-white/30 text-white hover:bg-white/10 text-base px-8 h-12 transition-all duration-300" onClick={() => scrollToId('#contact')}>
              <Play className="size-4 mr-2" /> Schedule Demo
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════════════ */
function Footer({ onLoginClick }: { onLoginClick: () => void }) {
  return (
    <footer className="relative bg-slate-900 dark:bg-slate-950 text-white py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg">
                <GraduationCap className="size-5" />
              </div>
              <span className="text-lg font-bold">Vidhyalayam</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              <span className="block font-medium text-emerald-300">{BRAND_TAGLINE}</span>
              <span className="mt-1 block">The all-in-one school management platform for modern schools.</span>
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-slate-300">Product</h4>
            <ul className="space-y-2.5">
              {['Features', 'Modules', 'Pricing', 'How It Works'].map((item) => (
                <li key={item}><button onClick={() => scrollToId(`#${item.toLowerCase().replace(/ /g, '-')}`)} className="text-sm text-slate-400 hover:text-emerald-400 transition-colors">{item}</button></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-slate-300">Support</h4>
            <ul className="space-y-2.5">
              <li><button onClick={() => scrollToId('#faq')} className="text-sm text-slate-400 hover:text-emerald-400 transition-colors">FAQ</button></li>
              <li><button onClick={() => scrollToId('#contact')} className="text-sm text-slate-400 hover:text-emerald-400 transition-colors">Contact Us</button></li>
              <li><button onClick={() => scrollToId('#testimonials')} className="text-sm text-slate-400 hover:text-emerald-400 transition-colors">Testimonials</button></li>
              <li><button onClick={() => scrollToId('#team')} className="text-sm text-slate-400 hover:text-emerald-400 transition-colors">Our Team</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-slate-300">Contact</h4>
            <ul className="space-y-2.5">
              <li><a href="mailto:contact@vidhyalayam.com" className="text-sm text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-2"><Mail className="size-3.5" />contact@vidhyalayam.com</a></li>
              <li><a href="tel:+91987463210" className="text-sm text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-2"><Phone className="size-3.5" />+91 987463210</a></li>
              <li><span className="text-sm text-slate-400 flex items-start gap-2"><MapPin className="size-3.5 mt-0.5 shrink-0" />Bairgania, Sitamarhi, Bihar, India</span></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} Vidhyalayam. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="text-sm text-slate-500 hover:text-emerald-400 cursor-pointer transition-colors">Privacy Policy</span>
            <span className="text-sm text-slate-500 hover:text-emerald-400 cursor-pointer transition-colors">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SCROLL PROGRESS BAR
   ═══════════════════════════════════════════════════════════════════ */
function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  return <motion.div className="fixed top-0 left-0 right-0 h-[3px] z-[100] origin-left bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" style={{ scaleX: scrollYProgress }} />
}

/* ═══════════════════════════════════════════════════════════════════
   BACK TO TOP BUTTON
   ═══════════════════════════════════════════════════════════════════ */
function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 size-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:shadow-emerald-500/50 transition-shadow"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M6 12L10 8L14 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export function LandingPage({ onLoginClick }: LandingPageProps) {
  // Pricing data state
  const [pricingPlans, setPricingPlans] = useState<PricingPlanData[]>([])
  const [pricingAddons, setPricingAddons] = useState<PricingAddonData[]>([])
  const [pricingLoaded, setPricingLoaded] = useState(false)

  // Team data state
  const [teamMembers, setTeamMembers] = useState<TeamMemberData[]>([])

  // Fetch pricing data from API
  useEffect(() => {
    api.get<{ plans?: PricingPlanData[]; addons?: PricingAddonData[] }>('/api/pricing', undefined, { skipLogoutOn401: true })
      .then(data => {
        if (data.plans) setPricingPlans(data.plans)
        if (data.addons) setPricingAddons(data.addons)
        setPricingLoaded(true)
      })
      .catch(() => setPricingLoaded(true))
  }, [])

  // Fetch team data from API
  useEffect(() => {
    api.get<{ members?: TeamMemberData[] }>('/api/team', undefined, { skipLogoutOn401: true })
      .then(data => {
        if (data.members) setTeamMembers(data.members)
      })
      .catch(() => { /* use defaults */ })
  }, [])

  // Add smooth scroll behavior globally
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = '' }
  }, [])

  return (
    <div className="flex flex-col">
      <ScrollProgress />
      <Navbar onLoginClick={onLoginClick} />
      <main>
        <HeroSection onLoginClick={onLoginClick} />
        <StatsBar />
        <FeaturesSection />
        <ModulesSection />
        <HowItWorksSection />
        <PricingSection plans={pricingPlans} addons={pricingAddons} />
        <TestimonialsSection />
        <TeamSection members={teamMembers} />
        <FAQSection />
        <ContactSection onLoginClick={onLoginClick} addons={pricingAddons} />
        <CTASection onLoginClick={onLoginClick} />
      </main>
      <Footer onLoginClick={onLoginClick} />
      <BackToTop />
    </div>
  )
}
