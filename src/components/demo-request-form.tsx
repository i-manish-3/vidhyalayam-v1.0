'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { GraduationCap, Loader2, CheckCircle2, Phone, Mail, Building2, Users, MessageSquare, Wallet, Crown, Settings, School } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const ADD_ON_OPTIONS = [
  { id: 'salary_payroll', label: 'Salary & Payroll Management', icon: Wallet },
  { id: 'premium_feature', label: 'Premium Feature', icon: Crown },
  { id: 'custom_branding', label: 'Custom Branding', icon: Settings },
  { id: 'school_landing_page', label: 'School Landing Page', icon: School },
]

interface DemoRequestFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DemoRequestForm({ open, onOpenChange }: DemoRequestFormProps) {
  const [name, setName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [studentCount, setStudentCount] = useState('')
  const [message, setMessage] = useState('')
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const { toast } = useToast()

  const handleAddOnToggle = (addOnId: string) => {
    setSelectedAddOns(prev =>
      prev.includes(addOnId)
        ? prev.filter(id => id !== addOnId)
        : [...prev, addOnId]
    )
  }

  const resetForm = () => {
    setName('')
    setSchoolName('')
    setEmail('')
    setPhone('')
    setStudentCount('')
    setMessage('')
    setSelectedAddOns([])
    setIsSuccess(false)
  }

  const handleSubmit = async () => {
    if (!name || !schoolName || !email || !phone) {
      toast({ title: 'Missing Fields', description: 'Please fill in all required fields', variant: 'destructive' })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schoolName,
          email,
          phone,
          studentCount: studentCount ? parseInt(studentCount) : 0,
          message,
          addOns: selectedAddOns,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit')
      }

      setIsSuccess(true)
      toast({ title: 'Request Submitted!', description: 'We will contact you shortly.' })
    } catch (err) {
      toast({
        title: 'Submission Failed',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset after animation
    setTimeout(resetForm, 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="size-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <GraduationCap className="size-4" />
            </div>
            Schedule a Demo
          </DialogTitle>
          <DialogDescription>
            Fill in your details and we&apos;ll get back to you within 24 hours.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
              >
                <CheckCircle2 className="size-16 text-emerald-500 mx-auto" />
              </motion.div>
              <h3 className="mt-4 text-xl font-bold">Thank You!</h3>
              <p className="mt-2 text-muted-foreground">
                Your demo request has been submitted. Our team will contact you within 24 hours.
              </p>
              <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleClose}>
                Close
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 py-2"
            >
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="demo-name" className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-muted-foreground" />
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="demo-name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* School Name */}
              <div className="space-y-1.5">
                <Label htmlFor="demo-school" className="flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  School Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="demo-school"
                  placeholder="Enter your school name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                />
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="demo-email" className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-muted-foreground" />
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="demo-email"
                    type="email"
                    placeholder="you@school.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="demo-phone" className="flex items-center gap-1.5">
                    <Phone className="size-3.5 text-muted-foreground" />
                    Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="demo-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Student Count */}
              <div className="space-y-1.5">
                <Label htmlFor="demo-students" className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-muted-foreground" />
                  Estimated Number of Students
                </Label>
                <Input
                  id="demo-students"
                  type="number"
                  placeholder="e.g., 500"
                  value={studentCount}
                  onChange={(e) => setStudentCount(e.target.value)}
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label htmlFor="demo-message" className="flex items-center gap-1.5">
                  <MessageSquare className="size-3.5 text-muted-foreground" />
                  Message (Optional)
                </Label>
                <Textarea
                  id="demo-message"
                  placeholder="Tell us about your school and what you're looking for..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Add-ons */}
              <div className="space-y-2.5">
                <Label className="text-sm font-medium">Interested Add-Ons (Optional)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ADD_ON_OPTIONS.map((addon) => (
                    <label
                      key={addon.id}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedAddOns.includes(addon.id)
                          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700'
                          : 'border-border hover:border-emerald-300 dark:hover:border-emerald-700'
                      }`}
                    >
                      <Checkbox
                        checked={selectedAddOns.includes(addon.id)}
                        onCheckedChange={() => handleAddOnToggle(addon.id)}
                      />
                      <addon.icon className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-xs font-medium">{addon.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 text-base"
                onClick={handleSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  'Submit Demo Request'
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                We&apos;ll contact you within 24 hours. No spam, ever.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
