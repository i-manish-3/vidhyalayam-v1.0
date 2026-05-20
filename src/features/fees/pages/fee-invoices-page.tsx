'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreditCard, FileText, Lock, LockOpen, ReceiptText, XCircle } from 'lucide-react'

type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled'
type PaymentMethod = 'CASH' | 'ONLINE' | 'CHEQUE' | 'UPI'

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string | null
  subtotal: number
  discount: number
  concession: number
  scholarship: number
  fine: number
  totalAmount: number
  paidAmount: number
  status: InvoiceStatus
  lockedAt?: string | null
  student?: {
    firstName: string
    lastName: string
    admissionNumber?: string | null
    rollNumber?: string | null
    class?: { name: string } | null
    section?: { name: string } | null
  }
  assignment?: {
    academicYear: string
    name: string
    source: string
    feesGroup?: { name: string } | null
  } | null
  lines: Array<{
    id: string
    feeHeadName: string
    installmentName: string
    amount: number
    totalAmount: number
    dueDate?: string | null
    status: string
  }>
  payments: Array<{
    id: string
    amount: number
    paymentMethod: string
    receiptNumber: string
    paymentDate: string
  }>
}

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  unpaid: 'bg-red-100 text-red-800 hover:bg-red-100',
  partial: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  paid: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  cancelled: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
}

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function FeeInvoicesPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'CASH' as PaymentMethod,
    transactionRef: '',
  })

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await api.get<{ invoices: Invoice[] }>('/api/school/fees/invoices')
      setInvoices(data.invoices || [])
    } catch {
      toast({ title: "Couldn't Load Invoices", description: 'Please refresh and try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const filteredInvoices = useMemo(
    () => statusFilter === 'ALL' ? invoices : invoices.filter((invoice) => invoice.status === statusFilter),
    [invoices, statusFilter]
  )

  const totals = useMemo(() => ({
    total: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    paid: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
    balance: invoices.reduce((sum, invoice) => sum + Math.max(invoice.totalAmount - invoice.paidAmount, 0), 0),
  }), [invoices])

  const openPayment = (invoice: Invoice) => {
    const balance = Math.max(invoice.totalAmount - invoice.paidAmount, 0)
    setSelectedInvoice(invoice)
    setPaymentForm({ amount: String(balance), paymentMethod: 'CASH', transactionRef: '' })
    setPaymentOpen(true)
  }

  const handleInvoiceAction = async (invoice: Invoice, action: 'lock' | 'unlock' | 'cancel') => {
    try {
      setSaving(true)
      await api.patch(`/api/school/fees/invoices/${invoice.id}`, { action })
      toast({ title: 'Invoice Updated', description: `Invoice ${action} action completed.` })
      fetchInvoices()
    } catch (err) {
      toast({
        title: "Couldn't Update Invoice",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePayment = async () => {
    if (!selectedInvoice) return
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid payment amount.', variant: 'destructive' })
      return
    }

    try {
      setSaving(true)
      await api.post(`/api/school/fees/invoices/${selectedInvoice.id}/payments`, {
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
        transactionRef: paymentForm.transactionRef || undefined,
      })
      toast({ title: 'Payment Recorded', description: 'Invoice balance has been updated.' })
      setPaymentOpen(false)
      setSelectedInvoice(null)
      fetchInvoices()
    } catch (err) {
      toast({
        title: "Couldn't Record Payment",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Invoices"
        description={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'} generated from student fee snapshots`}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Total Demand</p>
          <p className="mt-1 text-2xl font-semibold">{money(totals.total)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Collected</p>
          <p className="mt-1 text-2xl font-semibold">{money(totals.paid)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Balance</p>
          <p className="mt-1 text-2xl font-semibold">{money(totals.balance)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['ALL', 'unpaid', 'partial', 'paid', 'cancelled'].map((status) => (
          <Button key={status} variant={statusFilter === status ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(status)}>
            {status === 'ALL' ? 'All' : status}
          </Button>
        ))}
      </div>

      {filteredInvoices.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No Fee Invoices" description="Invoices appear after admission or manual fee assignment creates a student snapshot." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Fee Group</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => {
                const balance = Math.max(invoice.totalAmount - invoice.paidAmount, 0)
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => setSelectedInvoice(invoice)}>
                        {invoice.invoiceNumber}
                      </button>
                      <div className="text-xs text-muted-foreground">Due {formatDate(invoice.dueDate)}</div>
                    </TableCell>
                    <TableCell>
                      <div>{invoice.student ? `${invoice.student.firstName} ${invoice.student.lastName}` : '-'}</div>
                      <div className="text-xs text-muted-foreground">
                        {invoice.student?.class?.name || 'No class'} {invoice.student?.section?.name || ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{invoice.assignment?.feesGroup?.name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{invoice.assignment?.academicYear || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <div>{money(invoice.totalAmount)}</div>
                      <div className="text-xs text-muted-foreground">{money(balance)} balance</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[invoice.status]} variant="secondary">{invoice.status}</Badge>
                      {invoice.lockedAt && <Badge variant="outline" className="ml-2">Locked</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {balance > 0 && invoice.status !== 'cancelled' && (
                          <Button size="sm" onClick={() => openPayment(invoice)} disabled={saving}>
                            <CreditCard className="mr-1.5 size-4" />
                            Pay
                          </Button>
                        )}
                        <Button size="icon" variant="outline" onClick={() => handleInvoiceAction(invoice, invoice.lockedAt ? 'unlock' : 'lock')} disabled={saving}>
                          {invoice.lockedAt ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                        </Button>
                        {invoice.paidAmount === 0 && invoice.status !== 'cancelled' && (
                          <Button size="icon" variant="outline" onClick={() => handleInvoiceAction(invoice, 'cancel')} disabled={saving}>
                            <XCircle className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedInvoice && !paymentOpen} onOpenChange={(open) => { if (!open) setSelectedInvoice(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              {selectedInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <Tabs defaultValue="lines">
              <TabsList>
                <TabsTrigger value="lines">Lines</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>
              <TabsContent value="lines" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Head</TableHead>
                      <TableHead>Installment</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoice.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.feeHeadName}</TableCell>
                        <TableCell>{line.installmentName}</TableCell>
                        <TableCell>{formatDate(line.dueDate)}</TableCell>
                        <TableCell className="text-right">{money(line.totalAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="payments" className="mt-4">
                {selectedInvoice.payments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{payment.receiptNumber}</TableCell>
                          <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                          <TableCell>{payment.paymentMethod}</TableCell>
                          <TableCell className="text-right">{money(payment.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={(open) => {
        setPaymentOpen(open)
        if (!open) setSelectedInvoice(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Invoice Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min="1" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentForm.paymentMethod} onValueChange={(value) => setPaymentForm((current) => ({ ...current, paymentMethod: value as PaymentMethod }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transaction Reference</Label>
              <Input value={paymentForm.transactionRef} onChange={(event) => setPaymentForm((current) => ({ ...current, transactionRef: event.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPaymentOpen(false)
              setSelectedInvoice(null)
            }}>Cancel</Button>
            <Button onClick={handlePayment} disabled={saving}>
              <CreditCard className="mr-2 size-4" />
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
