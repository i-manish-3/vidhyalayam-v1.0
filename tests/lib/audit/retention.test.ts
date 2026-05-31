/**
 * Integration Tests for Audit Retention
 *
 * Tests cleanup of old audit logs with retention policy.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { db } from '@/lib/db'
import {
  cleanupOldAuditLogs,
  getAuditLogStats,
} from '@/lib/audit/retention'

describe('Audit Retention', () => {
  let testSchoolId: string

  beforeEach(async () => {
    // Create test school
    const school = await db.school.create({
      data: {
        name: 'Test School',
        subdomain: `test-retention-${Date.now()}`,
        academicYear: '2026-2027',
      },
    })
    testSchoolId = school.id
  })

  afterEach(async () => {
    // Cleanup
    await db.feeAuditLog.deleteMany({ where: { schoolId: testSchoolId } })
    await db.feeConfigAuditLog.deleteMany({ where: { schoolId: testSchoolId } })
    await db.school.delete({ where: { id: testSchoolId } })
  })

  describe('cleanupOldAuditLogs', () => {
    it('should delete logs older than retention period', async () => {
      const now = new Date()
      const oldDate = new Date(now)
      oldDate.setDate(oldDate.getDate() - 400) // 400 days ago

      const recentDate = new Date(now)
      recentDate.setDate(recentDate.getDate() - 30) // 30 days ago

      // Create old logs
      await db.feeAuditLog.createMany({
        data: [
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'old_1',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 1000 }),
            createdAt: oldDate,
          },
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'old_2',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 2000 }),
            createdAt: oldDate,
          },
        ],
      })

      // Create recent logs
      await db.feeAuditLog.create({
        data: {
          schoolId: testSchoolId,
          entityType: 'StudentFeePayment',
          entityId: 'recent_1',
          action: 'payment_recorded',
          newValue: JSON.stringify({ amount: 3000 }),
          createdAt: recentDate,
        },
      })

      // Run cleanup with 365 days retention
      const result = await cleanupOldAuditLogs(testSchoolId, 365)

      expect(result.deletedCount).toBe(2)

      // Verify old logs were deleted
      const remainingLogs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      expect(remainingLogs).toHaveLength(1)
      expect(remainingLogs[0].entityId).toBe('recent_1')
    })

    it('should not delete recent logs', async () => {
      const now = new Date()
      const recentDate = new Date(now)
      recentDate.setDate(recentDate.getDate() - 30) // 30 days ago

      // Create recent logs
      await db.feeAuditLog.createMany({
        data: [
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'recent_1',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 1000 }),
            createdAt: recentDate,
          },
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'recent_2',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 2000 }),
            createdAt: recentDate,
          },
        ],
      })

      // Run cleanup with 365 days retention
      const result = await cleanupOldAuditLogs(testSchoolId, 365)

      expect(result.deletedCount).toBe(0)

      // Verify logs still exist
      const remainingLogs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      expect(remainingLogs).toHaveLength(2)
    })

    it('should handle custom retention periods', async () => {
      const now = new Date()
      const date60DaysAgo = new Date(now)
      date60DaysAgo.setDate(date60DaysAgo.getDate() - 60)

      const date20DaysAgo = new Date(now)
      date20DaysAgo.setDate(date20DaysAgo.getDate() - 20)

      // Create logs at different ages
      await db.feeAuditLog.createMany({
        data: [
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'old_60',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 1000 }),
            createdAt: date60DaysAgo,
          },
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'recent_20',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 2000 }),
            createdAt: date20DaysAgo,
          },
        ],
      })

      // Run cleanup with 30 days retention
      const result = await cleanupOldAuditLogs(testSchoolId, 30)

      expect(result.deletedCount).toBe(1)

      // Verify only old log was deleted
      const remainingLogs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      expect(remainingLogs).toHaveLength(1)
      expect(remainingLogs[0].entityId).toBe('recent_20')
    })

    it('should delete both fee and config audit logs', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 400)

      // Create old fee audit log
      await db.feeAuditLog.create({
        data: {
          schoolId: testSchoolId,
          entityType: 'StudentFeePayment',
          entityId: 'old_fee',
          action: 'payment_recorded',
          newValue: JSON.stringify({ amount: 1000 }),
          createdAt: oldDate,
        },
      })

      // Create old config audit log
      await db.feeConfigAuditLog.create({
        data: {
          schoolId: testSchoolId,
          configType: 'FeeDemandConfig',
          configId: 'old_config',
          action: 'updated',
          newValue: JSON.stringify({ dueDay: 10 }),
          createdAt: oldDate,
        },
      })

      // Run cleanup
      const result = await cleanupOldAuditLogs(testSchoolId, 365)

      expect(result.deletedCount).toBe(2)

      // Verify both were deleted
      const feeAuditLogs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })
      const configAuditLogs = await db.feeConfigAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })

      expect(feeAuditLogs).toHaveLength(0)
      expect(configAuditLogs).toHaveLength(0)
    })

    it('should respect multi-tenant isolation', async () => {
      // Create another school
      const otherSchool = await db.school.create({
        data: {
          name: 'Other School',
          subdomain: `other-retention-${Date.now()}`,
          academicYear: '2026-2027',
        },
      })

      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 400)

      // Create old logs for both schools
      await db.feeAuditLog.createMany({
        data: [
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'test_old',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 1000 }),
            createdAt: oldDate,
          },
          {
            schoolId: otherSchool.id,
            entityType: 'StudentFeePayment',
            entityId: 'other_old',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 2000 }),
            createdAt: oldDate,
          },
        ],
      })

      // Run cleanup for test school only
      const result = await cleanupOldAuditLogs(testSchoolId, 365)

      expect(result.deletedCount).toBe(1)

      // Verify test school log was deleted
      const testSchoolLogs = await db.feeAuditLog.findMany({
        where: { schoolId: testSchoolId },
      })
      expect(testSchoolLogs).toHaveLength(0)

      // Verify other school log still exists
      const otherSchoolLogs = await db.feeAuditLog.findMany({
        where: { schoolId: otherSchool.id },
      })
      expect(otherSchoolLogs).toHaveLength(1)

      // Cleanup
      await db.feeAuditLog.deleteMany({ where: { schoolId: otherSchool.id } })
      await db.school.delete({ where: { id: otherSchool.id } })
    })
  })

  describe('getAuditLogStats', () => {
    it('should return correct statistics', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100)

      // Create audit logs
      await db.feeAuditLog.createMany({
        data: [
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'pay_1',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 1000 }),
            createdAt: oldDate,
          },
          {
            schoolId: testSchoolId,
            entityType: 'StudentFeePayment',
            entityId: 'pay_2',
            action: 'payment_recorded',
            newValue: JSON.stringify({ amount: 2000 }),
          },
        ],
      })

      await db.feeConfigAuditLog.create({
        data: {
          schoolId: testSchoolId,
          configType: 'FeeDemandConfig',
          configId: 'cfg_1',
          action: 'updated',
          newValue: JSON.stringify({ dueDay: 10 }),
        },
      })

      const stats = await getAuditLogStats(testSchoolId)

      expect(stats.feeAuditCount).toBe(2)
      expect(stats.feeConfigAuditCount).toBe(1)
      expect(stats.oldestFeeAudit).toBeInstanceOf(Date)
      expect(stats.estimatedSizeMB).toBeGreaterThan(0)
    })

    it('should handle empty audit logs', async () => {
      const stats = await getAuditLogStats(testSchoolId)

      expect(stats.feeAuditCount).toBe(0)
      expect(stats.feeConfigAuditCount).toBe(0)
      expect(stats.oldestFeeAudit).toBeNull()
      expect(stats.oldestFeeConfigAudit).toBeNull()
      expect(stats.estimatedSizeMB).toBe(0)
    })
  })
})
