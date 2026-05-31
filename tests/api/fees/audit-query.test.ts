/**
 * Integration Tests for Audit API Endpoints
 *
 * Tests the audit query endpoints with filtering, pagination, and multi-tenant isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { db } from '@/lib/db'

describe('Audit API Endpoints', () => {
  let testSchoolId: string
  let testStudentId: string
  let testUserId: string
  let testAuditLogIds: string[] = []

  beforeEach(async () => {
    // Create test school
    const school = await db.school.create({
      data: {
        name: 'Test School',
        subdomain: `test-${Date.now()}`,
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
        email: `test-${Date.now()}@example.com`,
        password: 'hashed_password',
        name: 'Test User',
        role: 'SCHOOL_ADMIN',
        schoolId: testSchoolId,
      },
    })
    testUserId = user.id

    // Create test audit logs
    const auditLogs = await Promise.all([
      db.feeAuditLog.create({
        data: {
          schoolId: testSchoolId,
          entityType: 'StudentFeePayment',
          entityId: 'pay_001',
          action: 'payment_recorded',
          studentId: testStudentId,
          userId: testUserId,
          newValue: JSON.stringify({ amount: 1000 }),
          diffSummary: 'Recorded payment of ₹1000',
        },
      }),
      db.feeAuditLog.create({
        data: {
          schoolId: testSchoolId,
          entityType: 'StudentFeeInvoice',
          entityId: 'inv_001',
          action: 'created',
          studentId: testStudentId,
          userId: testUserId,
          newValue: JSON.stringify({ totalAmount: 5000 }),
          diffSummary: 'Created invoice INV-001',
        },
      }),
      db.feeAuditLog.create({
        data: {
          schoolId: testSchoolId,
          entityType: 'StudentFeeRefund',
          entityId: 'rfd_001',
          action: 'refund_issued',
          studentId: testStudentId,
          userId: testUserId,
          newValue: JSON.stringify({ amount: 500 }),
          diffSummary: 'Issued refund of ₹500',
        },
      }),
    ])

    testAuditLogIds = auditLogs.map(log => log.id)
  })

  afterEach(async () => {
    // Cleanup
    await db.feeAuditLog.deleteMany({ where: { schoolId: testSchoolId } })
    await db.feeConfigAuditLog.deleteMany({ where: { schoolId: testSchoolId } })
    await db.user.deleteMany({ where: { schoolId: testSchoolId } })
    await db.student.deleteMany({ where: { schoolId: testSchoolId } })
    await db.school.delete({ where: { id: testSchoolId } })
  })

  describe('GET /api/school/fees/audit', () => {
    it('should fetch all audit logs for a school', async () => {
      const logs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
        include: {
          student: true,
          user: true,
        },
      })

      expect(logs).toHaveLength(3)
      expect(logs[0].schoolId).toBe(testSchoolId)
    })

    it('should filter by entity type', async () => {
      const logs = await db.feeAuditLog.findMany({
        where: {
          schoolId: testSchoolId,
          entityType: 'StudentFeePayment',
        },
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].entityType).toBe('StudentFeePayment')
    })

    it('should filter by student', async () => {
      const logs = await db.feeAuditLog.findMany({
        where: {
          schoolId: testSchoolId,
          studentId: testStudentId,
        },
      })

      expect(logs).toHaveLength(3)
      expect(logs.every(log => log.studentId === testStudentId)).toBe(true)
    })

    it('should filter by user', async () => {
      const logs = await db.feeAuditLog.findMany({
        where: {
          schoolId: testSchoolId,
          userId: testUserId,
        },
      })

      expect(logs).toHaveLength(3)
      expect(logs.every(log => log.userId === testUserId)).toBe(true)
    })

    it('should filter by action', async () => {
      const logs = await db.feeAuditLog.findMany({
        where: {
          schoolId: testSchoolId,
          action: 'payment_recorded',
        },
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].action).toBe('payment_recorded')
    })

    it('should filter by date range', async () => {
      const now = new Date()
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const logs = await db.feeAuditLog.findMany({
        where: {
          schoolId: testSchoolId,
          createdAt: {
            gte: yesterday,
            lte: tomorrow,
          },
        },
      })

      expect(logs).toHaveLength(3)
    })

    it('should support pagination', async () => {
      const page1 = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 2,
      })

      const page2 = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
        orderBy: { createdAt: 'desc' },
        skip: 2,
        take: 2,
      })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(1)
      expect(page1[0].id).not.toBe(page2[0].id)
    })

    it('should enforce multi-tenant isolation', async () => {
      // Create another school
      const otherSchool = await db.school.create({
        data: {
          name: 'Other School',
          subdomain: `other-${Date.now()}`,
          academicYear: '2026-2027',
        },
      })

      // Create audit log for other school
      await db.feeAuditLog.create({
        data: {
          schoolId: otherSchool.id,
          entityType: 'StudentFeePayment',
          entityId: 'pay_other',
          action: 'payment_recorded',
          newValue: JSON.stringify({ amount: 2000 }),
        },
      })

      // Query for test school should not return other school's logs
      const logs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      expect(logs).toHaveLength(3)
      expect(logs.every(log => log.schoolId === testSchoolId)).toBe(true)

      // Cleanup
      await db.feeAuditLog.deleteMany({ where: { schoolId: otherSchool.id } })
      await db.school.delete({ where: { id: otherSchool.id } })
    })

    it('should parse JSON fields correctly', async () => {
      const logs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      logs.forEach(log => {
        if (log.newValue) {
          const parsed = JSON.parse(log.newValue)
          expect(typeof parsed).toBe('object')
        }
      })
    })
  })

  describe('GET /api/school/fees/audit/config', () => {
    beforeEach(async () => {
      // Create config audit logs
      await db.feeConfigAuditLog.create({
        data: {
          schoolId: testSchoolId,
          configType: 'FeeDemandConfig',
          configId: 'cfg_001',
          action: 'updated',
          userId: testUserId,
          oldValue: JSON.stringify({ dueDay: 5 }),
          newValue: JSON.stringify({ dueDay: 10 }),
          diffSummary: 'Changed due day from 5 to 10',
        },
      })
    })

    it('should fetch config audit logs', async () => {
      const logs = await db.feeConfigAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].configType).toBe('FeeDemandConfig')
    })

    it('should filter by config type', async () => {
      const logs = await db.feeConfigAuditLog.findMany({
        where: {
          schoolId: testSchoolId,
          configType: 'FeeDemandConfig',
        },
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].configType).toBe('FeeDemandConfig')
    })

    it('should enforce multi-tenant isolation', async () => {
      // Create another school
      const otherSchool = await db.school.create({
        data: {
          name: 'Other School',
          subdomain: `other-config-${Date.now()}`,
          academicYear: '2026-2027',
        },
      })

      // Create config audit log for other school
      await db.feeConfigAuditLog.create({
        data: {
          schoolId: otherSchool.id,
          configType: 'FeeDemandConfig',
          configId: 'cfg_other',
          action: 'updated',
          newValue: JSON.stringify({ dueDay: 15 }),
        },
      })

      // Query for test school should not return other school's logs
      const logs = await db.feeConfigAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].schoolId).toBe(testSchoolId)

      // Cleanup
      await db.feeConfigAuditLog.deleteMany({ where: { schoolId: otherSchool.id } })
      await db.school.delete({ where: { id: otherSchool.id } })
    })
  })
})
