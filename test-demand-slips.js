const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function testDemandSlipFeatures() {
  console.log('🧪 Testing Demand Slip Features\n')
  console.log('=' .repeat(60))

  try {
    // 1. Check if custom slip number format is in config
    console.log('\n1️⃣  Testing Custom Slip Number Format...')
    const config = await prisma.feeDemandConfig.findFirst({
      select: { slipNumberFormat: true }
    })
    if (config?.slipNumberFormat) {
      console.log('   ✅ Custom format field exists:', config.slipNumberFormat)
    } else {
      console.log('   ❌ Custom format field missing')
    }

    // 2. Check recent demand slips
    console.log('\n2️⃣  Testing Recent Demand Slips...')
    const recentSlips = await prisma.studentFeeInvoice.findMany({
      where: { isMonthlyDemand: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        lines: true,
        student: {
          include: { class: true, section: true }
        }
      }
    })

    if (recentSlips.length > 0) {
      console.log(`   ✅ Found ${recentSlips.length} recent slips`)
      recentSlips.forEach((slip, i) => {
        console.log(`   ${i + 1}. ${slip.invoiceNumber} - ${slip.student.firstName} ${slip.student.lastName}`)
        console.log(`      Lines: ${slip.lines.length}, Total: ₹${slip.totalAmount}, Status: ${slip.status}`)
        console.log(`      Prev Balance: ₹${slip.previousBalance}`)
      })
    } else {
      console.log('   ⚠️  No demand slips found')
    }

    // 3. Check demand runs with error logs
    console.log('\n3️⃣  Testing Run History & Skipped Tracking...')
    const runs = await prisma.feeDemandRun.findMany({
      take: 3,
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        billingMonth: true,
        billingYear: true,
        status: true,
        totalStudents: true,
        successCount: true,
        skippedCount: true,
        failedCount: true,
        errorLog: true,
        startedAt: true
      }
    })

    if (runs.length > 0) {
      console.log(`   ✅ Found ${runs.length} recent runs`)
      runs.forEach((run, i) => {
        console.log(`   ${i + 1}. Run ${run.id.slice(-8)} - ${run.billingMonth}/${run.billingYear}`)
        console.log(`      Success: ${run.successCount}, Skipped: ${run.skippedCount}, Failed: ${run.failedCount}`)

        if (run.errorLog) {
          try {
            const log = JSON.parse(run.errorLog)
            if (log.skipped && log.skipped.length > 0) {
              console.log(`      ✅ Skipped tracking works: ${log.skipped.length} students tracked`)
              console.log(`         Example: ${log.skipped[0].reason}`)
            }
            if (log.errors && log.errors.length > 0) {
              console.log(`      ⚠️  Errors: ${log.errors.length} students failed`)
            }
          } catch {
            console.log('      ⚠️  Old format errorLog (pre-update)')
          }
        }
      })
    } else {
      console.log('   ⚠️  No runs found')
    }

    // 4. Check if slips have proper line amounts
    console.log('\n4️⃣  Testing Slip Line Amounts...')
    const slipWithLines = await prisma.studentFeeInvoice.findFirst({
      where: {
        isMonthlyDemand: true,
        lines: { some: {} }
      },
      include: { lines: true }
    })

    if (slipWithLines && slipWithLines.lines.length > 0) {
      console.log(`   ✅ Slip ${slipWithLines.invoiceNumber} has ${slipWithLines.lines.length} lines`)
      const totalFromLines = slipWithLines.lines.reduce((sum, line) => sum + line.totalAmount, 0)
      const expectedTotal = slipWithLines.subtotal + slipWithLines.previousBalance
      console.log(`      Subtotal from lines: ₹${totalFromLines}`)
      console.log(`      Slip subtotal: ₹${slipWithLines.subtotal}`)
      console.log(`      Previous balance: ₹${slipWithLines.previousBalance}`)
      console.log(`      Total: ₹${slipWithLines.totalAmount}`)

      if (Math.abs(expectedTotal - slipWithLines.totalAmount) < 0.01) {
        console.log('      ✅ Amounts calculate correctly')
      } else {
        console.log('      ⚠️  Amount mismatch')
      }
    } else {
      console.log('   ⚠️  No slips with lines found')
    }

    // 5. Check status tracking
    console.log('\n5️⃣  Testing Status Tracking...')
    const statusCounts = await prisma.studentFeeInvoice.groupBy({
      by: ['status'],
      where: { isMonthlyDemand: true },
      _count: true
    })

    if (statusCounts.length > 0) {
      console.log('   ✅ Status tracking works:')
      statusCounts.forEach(s => {
        console.log(`      ${s.status}: ${s._count} slips`)
      })
    } else {
      console.log('   ⚠️  No status data')
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ VERIFICATION COMPLETE')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\n❌ Error during testing:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

testDemandSlipFeatures()
