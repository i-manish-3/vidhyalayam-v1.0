import { db } from '../../src/lib/db'

async function main() {
  console.log('🌱 Seeding pricing data...')

  // ── PricingPlan ──
  const existingPlan = await db.pricingPlan.findFirst({ where: { name: 'Base Plan' } })

  if (existingPlan) {
    console.log('⏭️  PricingPlan "Base Plan" already exists, skipping.')
  } else {
    const plan = await db.pricingPlan.create({
      data: {
        name: 'Base Plan',
        pricePerStudent: 10,
        billingCycle: 'monthly',
        description: 'Everything you need to run your school digitally',
        features: JSON.stringify([
          'Student & Teacher Management',
          'Smart Attendance Tracking',
          'Fee Collection & Receipts',
          'Exam & Timetable Management',
          'Parent & Student Portals',
          'Transport & Library Modules',
          'Notifications & Announcements',
          'Inventory Management',
          'Role-Based Access Control',
          'Reports & Analytics',
          'Free Data Migration & Setup',
          'Dedicated Onboarding Support',
        ]),
        highlights: JSON.stringify([
          'Data migration included',
          'Free setup & onboarding',
          'All core features',
        ]),
        isActive: true,
        isPopular: true,
        sortOrder: 1,
      },
    })
    console.log(`✅ Created PricingPlan: ${plan.name}`)
  }

  // ── PricingAddons ──
  const addons = [
    {
      name: 'Salary & Payroll',
      description: 'Complete payroll processing, salary structures, advance management & payslips',
      icon: 'Wallet',
      price: 25,
      priceLabel: 'per staff / month',
      type: 'recurring',
      isActive: true,
      sortOrder: 1,
    },
    {
      name: 'Premium Features',
      description: 'Advanced analytics, AI-powered insights, custom reports & priority feature requests',
      icon: 'Crown',
      price: 1000,
      priceLabel: 'one-time',
      type: 'one_time',
      isActive: true,
      sortOrder: 2,
    },
    {
      name: 'Custom Branding',
      description: 'Your school logo, colors & white-labeled experience',
      icon: 'Palette',
      price: 1000,
      priceLabel: 'one-time',
      type: 'one_time',
      isActive: true,
      sortOrder: 3,
    },
    {
      name: 'School Landing Page',
      description: 'Professional website with admission inquiry form & SEO optimization',
      icon: 'Globe',
      price: 1500,
      priceLabel: 'one-time',
      type: 'one_time',
      isActive: true,
      sortOrder: 4,
    },
  ]

  for (const addon of addons) {
    const existing = await db.pricingAddon.findFirst({ where: { name: addon.name } })

    if (existing) {
      console.log(`⏭️  PricingAddon "${addon.name}" already exists, skipping.`)
    } else {
      const created = await db.pricingAddon.create({ data: addon })
      console.log(`✅ Created PricingAddon: ${created.name}`)
    }
  }

  console.log('🎉 Pricing seed complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
