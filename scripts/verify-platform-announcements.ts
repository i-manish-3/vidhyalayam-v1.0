/**
 * One-off end-to-end verification for platform broadcast announcements.
 * Runs in a FRESH process (so it loads the freshly generated Prisma client,
 * unlike the long-running dev server) and exercises create → active → dismiss →
 * expire against the real DB, then cleans up. Run: bun run scripts/verify-platform-announcements.ts
 */
import { db } from '../src/lib/db'
import { getActiveBannersForUser } from '../src/lib/platform-announcements'

const TEST_USER = 'verify-pa-user'
const created: string[] = []

function assert(label: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${label}`)
  if (!cond) process.exitCode = 1
}

async function main() {
  // 1. active, audience=all
  const a = await db.platformAnnouncement.create({
    data: { title: 'Verify', message: 'msg', severity: 'warning', audience: 'all', status: 'active' },
  })
  created.push(a.id)

  let banners = await getActiveBannersForUser(TEST_USER, 'PARENT')
  assert('active banner is visible to a PARENT', banners.some((b) => b.id === a.id))

  // 2. dismiss
  await db.platformAnnouncementDismissal.create({ data: { announcementId: a.id, userId: TEST_USER } })
  banners = await getActiveBannersForUser(TEST_USER, 'PARENT')
  assert('dismissed banner is hidden for that user', !banners.some((b) => b.id === a.id))
  banners = await getActiveBannersForUser('other-user', 'PARENT')
  assert('dismissal is per-user (other user still sees it)', banners.some((b) => b.id === a.id))

  // 3. expired active -> hidden
  const expired = await db.platformAnnouncement.create({
    data: { title: 'Old', message: 'x', status: 'active', expiresAt: new Date('2020-01-01') },
  })
  created.push(expired.id)
  banners = await getActiveBannersForUser('other-user', 'PARENT')
  assert('expired banner is hidden', !banners.some((b) => b.id === expired.id))

  // 4. audience targeting
  const teachersOnly = await db.platformAnnouncement.create({
    data: { title: 'Teachers', message: 'x', status: 'active', audience: 'teachers' },
  })
  created.push(teachersOnly.id)
  const parentView = await getActiveBannersForUser('p2', 'PARENT')
  const teacherView = await getActiveBannersForUser('t2', 'TEACHER')
  assert('teachers-only banner hidden from PARENT', !parentView.some((b) => b.id === teachersOnly.id))
  assert('teachers-only banner visible to TEACHER', teacherView.some((b) => b.id === teachersOnly.id))
}

main()
  .catch((e) => {
    console.error('verification error:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    // cleanup
    if (created.length) {
      await db.platformAnnouncementDismissal.deleteMany({ where: { announcementId: { in: created } } })
      await db.platformAnnouncement.deleteMany({ where: { id: { in: created } } })
    }
    await db.$disconnect()
    console.log('cleanup done')
  })
