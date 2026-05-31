/**
 * Concurrent Payment Test
 *
 * This script simulates multiple cashiers from the same school clicking "Pay Fees"
 * at the same time to verify that:
 * 1. Receipt numbers are unique (no duplicates)
 * 2. Ledger balances are updated correctly (no lost updates)
 * 3. Retry logic handles concurrent modifications gracefully
 *
 * Run with: npx tsx tests/concurrent-payment-test.ts
 */

import { db } from '../src/lib/db'
import { Prisma } from '@prisma/client'

const CONCURRENT_PAYMENTS = 5

async function setupTestData() {
  console.log('Setting up test data...')

  // Find a student first, then get their school
  const student = await db.student.findFirst({
    where: { deletedAt: null },
    include: { school: true },
  })

  if (!student || !student.school) {
    throw new Error('No student with school found in database. Please run seed first.')
  }

  const school = student.school

  console.log(`Using school: ${school.name} (${school.id})`)
  console.log(`Using student: ${student.firstName} ${student.lastName} (${student.id})`)

  // Clean up any existing test data for this student
  const testMarker = 'CONCURRENT_TEST'
  await db.studentFeeLedgerAllocation.deleteMany({
    where: {
      schoolId: school.id,
      studentId: student.id,
      notes: { contains: testMarker },
    },
  })
  await db.studentFeeLedgerEntry.deleteMany({
    where: {
      schoolId: school.id,
      studentId: student.id,
      description: { contains: testMarker },
    },
  })
  await db.studentFeePayment.deleteMany({
    where: {
      schoolId: school.id,
      studentId: student.id,
      notes: { contains: testMarker },
    },
  })

  // Create a test debit entry with balance of 5000
  const debit = await db.studentFeeLedgerEntry.create({
    data: {
      schoolId: school.id,
      studentId: student.id,
      entryType: 'DEBIT',
      sourceType: 'test',
      feeHeadName: 'Tuition Fee',
      installmentName: 'May',
      description: `${testMarker} - Test debit for concurrent payment testing`,
      debit: 5000,
      credit: 0,
      balanceAmount: 5000,
      transactionDate: new Date(),
      status: 'open',
    },
  })

  console.log(`Created test debit entry: ${debit.id} with balance: ${debit.balanceAmount}`)
  return { debit, school, student }
}

async function simulateConcurrentPayment(
  schoolId: string,
  studentId: string,
  debitId: string,
  paymentAmount: number,
  cashierIndex: number
): Promise<{ success: boolean; receiptNumber?: string; error?: string }> {
  const RETRY_ATTEMPTS = 3
  const RETRY_DELAY_MS = 100
  const testMarker = 'CONCURRENT_TEST'

  function isRetryableError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return true
    }
    if (error instanceof Error) {
      if (error.message.includes('Concurrent modification detected')) return true
    }
    return false
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  let lastError: unknown = null

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await db.$transaction(async (tx) => {
        // Generate receipt number
        const receipts = await tx.studentFeePayment.findMany({
          where: { schoolId },
          select: { receiptNumber: true },
        })
        const maxNum = receipts
          .map((r) => parseInt(r.receiptNumber, 10))
          .filter((n) => Number.isFinite(n))
          .reduce((m, n) => (n > m ? n : m), 0)
        const receiptNumber = String(maxNum + 1)

        // Create payment record
        const payment = await tx.studentFeePayment.create({
          data: {
            schoolId,
            studentId,
            amount: paymentAmount,
            paymentMethod: 'CASH',
            receiptNumber,
            paymentDate: new Date(),
            notes: `${testMarker} - Cashier ${cashierIndex} - Attempt ${attempt + 1}`,
          },
        })

        // Create credit entry
        const creditEntry = await tx.studentFeeLedgerEntry.create({
          data: {
            schoolId,
            studentId,
            paymentId: payment.id,
            entryType: 'CREDIT',
            sourceType: 'payment',
            sourceId: payment.id,
            description: `${testMarker} - Fee payment received`,
            debit: 0,
            credit: paymentAmount,
            balanceAmount: paymentAmount,
            transactionDate: new Date(),
            receiptNumber,
            status: 'open',
          },
        })

        // Fetch the debit entry with current version
        const debitEntry = await tx.studentFeeLedgerEntry.findUniqueOrThrow({
          where: { id: debitId },
        })

        const applied = Math.min(paymentAmount, debitEntry.balanceAmount)
        const nextBalance = debitEntry.balanceAmount - applied

        // Optimistic locking: only update if version matches
        const updateResult = await tx.studentFeeLedgerEntry.updateMany({
          where: {
            id: debitId,
            version: debitEntry.version,
          },
          data: {
            balanceAmount: nextBalance,
            status: nextBalance <= 0 ? 'settled' : nextBalance < debitEntry.debit ? 'partial' : 'open',
            version: { increment: 1 },
          },
        })

        if (updateResult.count === 0) {
          throw new Error(`Concurrent modification detected on ledger entry ${debitId}. Please retry the payment.`)
        }

        // Create allocation
        await tx.studentFeeLedgerAllocation.create({
          data: {
            schoolId,
            studentId,
            debitEntryId: debitId,
            creditEntryId: creditEntry.id,
            amount: applied,
            allocatedAt: new Date(),
            receiptNumber,
            notes: testMarker,
          },
        })

        return { receiptNumber, applied }
      })

      return { success: true, receiptNumber: result.receiptNumber }
    } catch (error) {
      lastError = error

      if (!isRetryableError(error)) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }

      if (attempt === RETRY_ATTEMPTS - 1) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
      await sleep(delay)
    }
  }

  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }
}

async function runConcurrentPaymentTest() {
  console.log('\n=== Concurrent Payment Test ===\n')

  try {
    // Setup
    const { debit, school, student } = await setupTestData()
    const testMarker = 'CONCURRENT_TEST'

    // Simulate concurrent payments
    console.log(`\nSimulating ${CONCURRENT_PAYMENTS} concurrent payments of 1000 each...\n`)

    const startTime = Date.now()
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_PAYMENTS }, (_, i) =>
        simulateConcurrentPayment(school.id, student.id, debit.id, 1000, i + 1)
      )
    )
    const endTime = Date.now()

    // Analyze results
    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    console.log('Results:')
    console.log(`  ✓ Successful: ${successful.length}`)
    console.log(`  ✗ Failed: ${failed.length}`)
    console.log(`  ⏱ Time: ${endTime - startTime}ms`)

    if (successful.length > 0) {
      console.log('\nSuccessful receipt numbers:')
      successful.forEach((r) => console.log(`  - ${r.receiptNumber}`))
    }

    if (failed.length > 0) {
      console.log('\nFailed payments:')
      failed.forEach((r, i) => console.log(`  ${i + 1}. ${r.error}`))
    }

    // Verify data integrity
    console.log('\n=== Data Integrity Check ===\n')

    const finalDebit = await db.studentFeeLedgerEntry.findUnique({
      where: { id: debit.id },
    })

    const payments = await db.studentFeePayment.findMany({
      where: {
        schoolId: school.id,
        studentId: student.id,
        notes: { contains: testMarker },
      },
      orderBy: { receiptNumber: 'asc' },
    })

    const allocations = await db.studentFeeLedgerAllocation.findMany({
      where: {
        schoolId: school.id,
        studentId: student.id,
        debitEntryId: debit.id,
        notes: testMarker,
      },
    })

    console.log('Final State:')
    console.log(`  Initial balance: 5000`)
    console.log(`  Final balance: ${finalDebit?.balanceAmount}`)
    console.log(`  Expected balance: ${5000 - successful.length * 1000}`)
    console.log(`  Payments recorded: ${payments.length}`)
    console.log(`  Allocations created: ${allocations.length}`)
    console.log(`  Total allocated: ${allocations.reduce((sum, a) => sum + a.amount, 0)}`)

    // Check for duplicate receipt numbers
    const receiptNumbers = payments.map((p) => p.receiptNumber)
    const uniqueReceipts = new Set(receiptNumbers)
    const hasDuplicates = receiptNumbers.length !== uniqueReceipts.size

    console.log('\nReceipt Number Check:')
    console.log(`  Total receipts: ${receiptNumbers.length}`)
    console.log(`  Unique receipts: ${uniqueReceipts.size}`)
    console.log(`  Duplicates: ${hasDuplicates ? '✗ YES' : '✓ NO'}`)

    // Verify balance integrity
    const expectedBalance = 5000 - successful.length * 1000
    const balanceCorrect = finalDebit?.balanceAmount === expectedBalance

    console.log('\nBalance Integrity:')
    console.log(`  ${balanceCorrect ? '✓' : '✗'} Balance is ${balanceCorrect ? 'correct' : 'INCORRECT'}`)

    // Overall result
    console.log('\n=== Test Result ===\n')
    if (!hasDuplicates && balanceCorrect && failed.length === 0) {
      console.log('✓ ALL TESTS PASSED')
      console.log('  - No duplicate receipt numbers')
      console.log('  - Balance updated correctly')
      console.log('  - All payments succeeded')
    } else {
      console.log('✗ TESTS FAILED')
      if (hasDuplicates) console.log('  - Duplicate receipt numbers detected')
      if (!balanceCorrect) console.log('  - Balance mismatch detected')
      if (failed.length > 0) console.log(`  - ${failed.length} payments failed`)
    }

    // Cleanup
    console.log('\nCleaning up test data...')
    await db.studentFeeLedgerAllocation.deleteMany({
      where: {
        schoolId: school.id,
        studentId: student.id,
        notes: testMarker,
      },
    })
    await db.studentFeeLedgerEntry.deleteMany({
      where: {
        schoolId: school.id,
        studentId: student.id,
        description: { contains: testMarker },
      },
    })
    await db.studentFeePayment.deleteMany({
      where: {
        schoolId: school.id,
        studentId: student.id,
        notes: { contains: testMarker },
      },
    })
    console.log('✓ Cleanup complete')

  } catch (error) {
    console.error('Test failed with error:', error)
    throw error
  } finally {
    await db.$disconnect()
  }
}

// Run the test
runConcurrentPaymentTest().catch(console.error)
