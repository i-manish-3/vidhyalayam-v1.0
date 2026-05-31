/**
 * Unit Tests for Audit Utilities
 *
 * Tests snapshot generation, diff calculation, and audit logging functions.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import {
  snapshotPayment,
  snapshotInvoice,
  snapshotLedgerEntry,
  snapshotRefund,
  snapshotDemandConfig,
} from '@/lib/audit/snapshot-generators'
import {
  calculateDiff,
  formatDiffSummary,
  highlightChangedFields,
  generateDetailedDescription,
} from '@/lib/audit/diff-helpers'

describe('Snapshot Generators', () => {
  describe('snapshotPayment', () => {
    it('should create a payment snapshot with all fields', () => {
      const payment = {
        id: 'pay_123',
        studentId: 'stu_456',
        invoiceId: 'inv_789',
        amount: 1000,
        paymentMethod: 'CASH',
        transactionRef: 'TXN123',
        receiptNumber: 'RCP-001',
        paymentDate: new Date('2026-05-31'),
        notes: 'Test payment',
        receivedBy: 'user_123',
        createdAt: new Date('2026-05-31'),
      }

      const snapshot = snapshotPayment(payment)

      expect(snapshot).toEqual({
        id: 'pay_123',
        studentId: 'stu_456',
        invoiceId: 'inv_789',
        amount: 1000,
        paymentMethod: 'CASH',
        transactionRef: 'TXN123',
        receiptNumber: 'RCP-001',
        paymentDate: '2026-05-31T00:00:00.000Z',
        notes: 'Test payment',
        receivedBy: 'user_123',
        createdAt: '2026-05-31T00:00:00.000Z',
      })
    })

    it('should handle null/undefined fields', () => {
      const payment = {
        id: 'pay_123',
        studentId: 'stu_456',
        amount: 1000,
        paymentMethod: 'CASH',
        receiptNumber: 'RCP-001',
      }

      const snapshot = snapshotPayment(payment)

      expect(snapshot.transactionRef).toBeUndefined()
      expect(snapshot.notes).toBeUndefined()
    })
  })

  describe('snapshotInvoice', () => {
    it('should create an invoice snapshot', () => {
      const invoice = {
        id: 'inv_123',
        studentId: 'stu_456',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date('2026-05-01'),
        dueDate: new Date('2026-05-10'),
        subtotal: 5000,
        discount: 500,
        totalAmount: 4500,
        paidAmount: 0,
        status: 'unpaid',
        billingMonth: 5,
        billingYear: 2026,
        isMonthlyDemand: true,
        previousBalance: 1000,
      }

      const snapshot = snapshotInvoice(invoice)

      expect(snapshot.id).toBe('inv_123')
      expect(snapshot.totalAmount).toBe(4500)
      expect(snapshot.status).toBe('unpaid')
    })

    it('should truncate lines array', () => {
      const invoice = {
        id: 'inv_123',
        studentId: 'stu_456',
        invoiceNumber: 'INV-001',
        totalAmount: 5000,
        lines: [{ id: '1' }, { id: '2' }, { id: '3' }],
      }

      const snapshot = snapshotInvoice(invoice)

      expect(snapshot.lines).toBe('[3 lines]')
    })
  })

  describe('snapshotDemandConfig', () => {
    it('should redact sensitive fields', () => {
      const config = {
        id: 'cfg_123',
        schoolId: 'sch_456',
        dueDay: 10,
        slipNumberFormat: 'DS/{year}/{month}',
        metaAccessToken: 'secret_token_12345',
        metaPhoneNumberId: '1234567890',
        metaBusinessId: 'business_123',
      }

      const snapshot = snapshotDemandConfig(config)

      expect(snapshot.metaAccessToken).toBe('[REDACTED]')
      expect(snapshot.metaPhoneNumberId).toBe('[REDACTED]')
      expect(snapshot.metaBusinessId).toBe('[REDACTED]')
      expect(snapshot.dueDay).toBe(10)
    })
  })
})

describe('Diff Helpers', () => {
  describe('calculateDiff', () => {
    it('should detect changed fields', () => {
      const oldValue = {
        id: '123',
        amount: 1000,
        status: 'unpaid',
        notes: 'Old notes',
      }

      const newValue = {
        id: '123',
        amount: 1200,
        status: 'paid',
        notes: 'New notes',
      }

      const diff = calculateDiff(oldValue, newValue)

      expect(diff).toHaveProperty('amount')
      expect(diff.amount).toEqual({ old: 1000, new: 1200 })
      expect(diff).toHaveProperty('status')
      expect(diff.status).toEqual({ old: 'unpaid', new: 'paid' })
      expect(diff).not.toHaveProperty('id') // ID should be skipped
    })

    it('should handle creation (no old value)', () => {
      const newValue = {
        id: '123',
        amount: 1000,
        status: 'unpaid',
      }

      const diff = calculateDiff(null, newValue)

      expect(diff.amount).toEqual({ old: null, new: 1000 })
      expect(diff.status).toEqual({ old: null, new: 'unpaid' })
    })

    it('should handle deletion (no new value)', () => {
      const oldValue = {
        id: '123',
        amount: 1000,
        status: 'unpaid',
      }

      const diff = calculateDiff(oldValue, null)

      expect(diff.amount).toEqual({ old: 1000, new: null })
      expect(diff.status).toEqual({ old: 'unpaid', new: null })
    })

    it('should return empty diff when no changes', () => {
      const value = {
        id: '123',
        amount: 1000,
        status: 'unpaid',
      }

      const diff = calculateDiff(value, value)

      expect(Object.keys(diff)).toHaveLength(0)
    })
  })

  describe('formatDiffSummary', () => {
    it('should format single change', () => {
      const diff = {
        amount: { old: 1000, new: 1200 },
      }

      const summary = formatDiffSummary(diff, 'Payment')

      expect(summary).toBe('Changed Amount from 1000 to 1200')
    })

    it('should format multiple changes', () => {
      const diff = {
        amount: { old: 1000, new: 1200 },
        status: { old: 'unpaid', new: 'paid' },
        notes: { old: 'Old', new: 'New' },
      }

      const summary = formatDiffSummary(diff, 'Payment')

      expect(summary).toContain('3 changes')
      expect(summary).toContain('Changed Amount')
      expect(summary).toContain('Changed Status')
    })

    it('should handle null values', () => {
      const diff = {
        notes: { old: null, new: 'New notes' },
      }

      const summary = formatDiffSummary(diff, 'Payment')

      expect(summary).toBe('Set Notes to "New notes"')
    })

    it('should handle cleared values', () => {
      const diff = {
        notes: { old: 'Old notes', new: null },
      }

      const summary = formatDiffSummary(diff, 'Payment')

      expect(summary).toBe('Cleared Notes')
    })
  })

  describe('highlightChangedFields', () => {
    it('should extract only new values', () => {
      const diff = {
        amount: { old: 1000, new: 1200 },
        status: { old: 'unpaid', new: 'paid' },
      }

      const highlighted = highlightChangedFields(diff)

      expect(highlighted).toEqual({
        amount: 1200,
        status: 'paid',
      })
    })
  })

  describe('generateDetailedDescription', () => {
    it('should generate payment description', () => {
      const diff = {
        amount: { old: null, new: 1000 },
      }

      const description = generateDetailedDescription(
        'StudentFeePayment',
        'payment_recorded',
        diff,
        { amount: 1000, paymentMethod: 'CASH', receiptNumber: 'RCP-001' }
      )

      expect(description).toContain('Recorded payment')
      expect(description).toContain('₹1000')
      expect(description).toContain('CASH')
      expect(description).toContain('RCP-001')
    })

    it('should generate invoice description', () => {
      const diff = {
        invoiceNumber: { old: null, new: 'INV-001' },
        totalAmount: { old: null, new: 5000 },
      }

      const description = generateDetailedDescription(
        'StudentFeeInvoice',
        'created',
        diff,
        { invoiceNumber: 'INV-001', totalAmount: 5000 }
      )

      expect(description).toContain('Created invoice')
      expect(description).toContain('INV-001')
      expect(description).toContain('₹5000')
    })

    it('should generate refund description', () => {
      const diff = {
        amount: { old: null, new: 500 },
      }

      const description = generateDetailedDescription(
        'StudentFeeRefund',
        'refund_issued',
        diff,
        { amount: 500, receiptNumber: 'RFD-001' }
      )

      expect(description).toContain('Issued refund')
      expect(description).toContain('₹500')
      expect(description).toContain('RFD-001')
    })

    it('should generate config description', () => {
      const diff = {
        dueDay: { old: 5, new: 10 },
        lateFeeEnabled: { old: false, new: true },
      }

      const description = generateDetailedDescription(
        'FeeDemandConfig',
        'updated',
        diff
      )

      expect(description).toContain('Updated demand config')
      expect(description).toContain('due day from 5 to 10')
      expect(description).toContain('late fee enabled')
    })
  })
})
