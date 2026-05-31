const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkSlip() {
  try {
    const slip = await prisma.studentFeeInvoice.findFirst({
      where: {
        invoiceNumber: {
          contains: '00149'
        }
      },
      include: {
        lines: true,
        student: {
          include: {
            class: true,
            section: true
          }
        }
      }
    })

    if (!slip) {
      console.log('❌ Slip not found')
      return
    }

    console.log('✅ Slip found:', slip.invoiceNumber)
    console.log('📊 Billing:', slip.billingMonth + '/' + slip.billingYear)
    console.log('💰 Subtotal:', slip.subtotal)
    console.log('💰 Total:', slip.totalAmount)
    console.log('📝 Lines count:', slip.lines.length)
    console.log('\n📋 Lines:')
    slip.lines.forEach((line, i) => {
      console.log(`  ${i + 1}. ${line.feeHeadName} - ${line.installmentName} - ₹${line.totalAmount}`)
    })

    if (slip.lines.length === 0) {
      console.log('\n⚠️  WARNING: This slip has ZERO fee lines! That\'s why the PDF is empty.')
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkSlip()
