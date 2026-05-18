import { db } from '../../src/lib/db'

async function main() {
  // Check if system notifications already exist
  const existing = await db.notification.findFirst({ where: { schoolId: null } })
  if (existing) {
    console.log('System notifications already exist, skipping seed.')
    return
  }

  const systemNotifications = [
    { schoolId: null, userId: null, title: 'Welcome to My Digital Academy', message: 'Your School Management ERP system is ready. Explore all features from the dashboard.', type: 'info', isRead: false },
    { schoolId: null, userId: null, title: 'New School Registration', message: 'A new school has requested onboarding. Review and approve from the Schools section.', type: 'warning', isRead: false },
    { schoolId: null, userId: null, title: 'System Update Complete', message: 'The system has been updated to the latest version with new features and improvements.', type: 'success', isRead: false },
    { schoolId: null, userId: null, title: 'Pricing Inquiry Follow-up', message: 'Review recent demo and pricing inquiries from the contact requests section.', type: 'warning', isRead: false },
    { schoolId: null, userId: null, title: 'Monthly Report Available', message: 'The monthly analytics report is now available. Check the Analytics section for details.', type: 'info', isRead: false },
  ]

  for (const notif of systemNotifications) {
    await db.notification.create({ data: notif })
    console.log(`Created: ${notif.title}`)
  }

  console.log('Done! Created 5 system-wide notifications.')
}

main().catch(console.error)
