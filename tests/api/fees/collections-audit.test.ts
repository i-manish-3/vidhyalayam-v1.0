/**
 * Integration Tests for Payment Collection Audit Logging
 *
 * Tests that payment recording creates correct audit logs with snapshots.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { db } from '@/lib/db'
import { logFeeTransaction } from '@/lib/audit'

describe('Payment Collection Audit Logging', () => {
  let testSchoolId: string
  let testStudentId: string
  let testUserId: string

  beforeEach(async () => {
    // Create test school
    const school = await db.school.create({
      data: {
        name: 'Test School',
        subdomain: `test-payment-${Date.now()}`,
        academicYear: '2026-2027',
      },
    })
    testSchoolId = school.id

    // Create test student
    const student = await db.student.create({
      data: {
        schoolId: testSchoolId,
        firstName: 'Test',
        lastName: 'Student',
        admissionNumber: 'TST001',
      },
    })
    testStudentId = student.id

    // Create test user
    const user = await db.user.create({
      data: {
        email: `test-payment-${Date.now()}@example.com`,
        password: 'hashed_password',
        name: 'Test User',
        role: 'SCHOOL_ADMIN',
        schoolId: testSchoolId,
      },
    })
    testUserId = user.id
  })

  afterEach(async () => {
    // Cleanup
    await db.feeAuditLog.deleteMany({ where: { schoolId: testSchoolId } })
    await db.studentFeePayment.deleteMany({ where: { schoolId: testSchoolId } })
    await db.user.deleteMany({ where: { schoolId: testSchoolId } })
    await db.student.deleteMany({ where: { schoolId: testSchoolId } })
    await db.school.delete({ where: { id: testSchoolId } })
  })

  it('should create audit log when payment is recorded', async () => {
    const payment = {
      id: 'pay_test_001',
      studentId: testStudentId,
      amount: 1000,
      paymentMethod: 'CASH',
      receiptNumber: 'RCP-001',
      paymentDate: new Date(),
      receivedBy: testUserId,
    }

    await db.$transaction(async (tx) => {
      // Create payment
      await tx.studentFeePayment.create({
        data: {
          schoolId: testSchoolId,
          studentId: testStudentId,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          receiptNumber: payment.receiptNumber,
          paymentDate: payment.paymentDate,
          receivedBy: payment.receivedBy,
        },
      })

      // Log audit
      await logFeeTransaction(
        tx,
        testSchoolId,
        'StudentFeePayment',
        payment.receiptNumber,
        'payment_recorded',
        null,
        payment,
        {
          userId: testUserId,
          ipAddress: '127.0.0.1',
          metadata: {
            totalPaid: payment.amount,
          },
        }
      )
    })

    // Verify audit log was created
    const auditLogs = await db.feeAuditLog.findMany({
      where: {
        schoolId: testSchoolId,
        entityType: 'StudentFeePayment',
      },
    })

    expect(auditLogs).toHaveLength(1)
    expect(auditLogs[0].action).toBe('payment_recorded')
    expect(auditLogs[0].studentId).toBe(testStudentId)
    expect(auditLogs[0].userId).toBe(testUserId)
    expect(auditLogs[0].ipAddress).toBe('127.0.0.1')

    // Verify snapshot
    const newValue = JSON.parse(auditLogs[0].newValue!)
    expect(newValue.amount).toBe(1000)
    expect(newValue.paymentMethod).toBe('CASH')
    expect(newValue.receiptNumber).toBe('RCP-001')

    // Verify diff summary
    expect(auditLogs[0].diffSummary).toContain('Recorded payment')
    expect(auditLogs[0].diffSummary).toContain('₹1000')
  })

  it('should create audit log with metadata', async () => {
    const payment = {
      studentId: testStudentId,
      amount: 1500,
      paymentMethod: 'UPI',
      receiptNumber: 'RCP-002',
      paymentDate: new Date(),
      receivedBy: testUserId,
    }

    await db.$transaction(async (tx) => {
      await logFeeTransaction(
        tx,
        testSchoolId,
        'StudentFeePayment',
        payment.receiptNumber,
        'payment_recorded',
        null,
        payment,
        {
          userId: testUserId,
          metadata: {
            totalPaid: payment.amount,
            totalDiscount: 100,
            rowCount: 3,
          },
        }
      )
    })

    const auditLog = await db.feeAuditLog.findFirst({
      where: {
        schoolId: testSchoolId,
        entityId: payment.receiptNumber,
      },
    })

    expect(auditLog).not.toBeNull()
    const metadata = JSON.parse(auditLog!.metadata!)
    expect(metadata.totalPaid).toBe(1500)
    expect(metadata.totalDiscount).toBe(100)
    expect(metadata.rowCount).toBe(3)
  })

  it('should handle concurrent payments without conflicts', async () => {
    const payments = [
      { receiptNumber: 'RCP-101', amount: 1000 },
      { receiptNumber: 'RCP-102', amount: 2000 },
      { receiptNumber: 'RCP-103', amount: 3000 },
    ]

    // Create payments concurrently
    await Promise.all(
      payments.map(payment =>
        db.$transaction(async (tx) => {
          await logFeeTransaction(
            tx,
            testSchoolId,
            'StudentFeePayment',
            payment.receiptNumber,
            'payment_recorded',
            null,
            {
              studentId: testStudentId,
              amount: payment.amount,
              receiptNumber: payment.receiptNumber,
            },
            { userId: testUserId }
          )
        })
      )
    )

    // Verify all audit logs were created
    const auditLogs = await db.feeAuditLog.findMany({
      where: {
        schoolId: testSchoolId,
        entityType: 'StudentFeePayment',
      },
    })

    expect(auditLogs).toHaveLength(3)
    const receiptNumbers = auditLogs.map(log => log.entityId).sort()
    expect(receiptNumbers).toEqual(['RCP-101', 'RCP-102', 'RCP-103'])
  })

  it('should rollback audit log if transaction fails', async () => {
    try {
      await db.$transaction(async (tx) => {
        // Create audit log
        await logFeeTransaction(
          tx,
          testSchoolId,
          'StudentFeePayment',
          'RCP-FAIL',
          'payment_recorded',
          null,
          { amount: 1000 },
          { userId: testUserId }
        )

        // Force transaction to fail
        throw new Error('Simulated transaction failure')
      })
    } catch (error) {
      // Expected to fail
    }

    // Verify audit log was NOT created
    const auditLogs = await db.feeAuditLog.findMany({
      where: {
        schoolId: testSchoolId,
        entityId: 'RCP-FAIL',
      },
    })

    expect(auditLogs).toHaveLength(0)
  })

  it('should track payment updates with before/after snapshots', async () => {
    const oldPayment = {
      id: 'pay_update_001',
      studentId: testStudentId,
      amount: 1000,
      paymentMethod: 'CASH',
      receiptNumber: 'RCP-UPDATE',
      notes: 'Original notes',
    }

    const newPayment = {
      ...oldPayment,
      amount: 1200,
      notes: 'Updated notes',
    }

    await db.$transaction(async (tx) => {
      await logFeeTransaction(
        tx,
        testSchoolId,
        'StudentFeePayment',
        oldPayment.receiptNumber,
        'updated',
        oldPayment,
        newPayment,
        { userId: testUserId }
      )
    })

    const auditLog = await db.feeAuditLog.findFirst({
      where: {
        schoolId: testSchoolId,
        entityId: 'RCP-UPDATE',
      },
    })

    expect(auditLog).not.toBeNull()

    // Verify old value
    const oldValue = JSON.parse(auditLog!.oldValue!)
    expect(oldValue.amount).toBe(1000)
    expect(oldValue.notes).toBe('Original notes')

    // Verify new value
    const newValue = JSON.parse(auditLog!.newValue!)
    expect(newValue.amount).toBe(1200)
    expect(newValue.notes).toBe('Updated notes')

    // Verify diff summary
    expect(auditLog!.diffSummary).toContain('2 changes')
  })
})
